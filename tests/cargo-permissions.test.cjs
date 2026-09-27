const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const {randomUUID,createHmac}=require('node:crypto');
const source=readFileSync(require('node:path').join(__dirname,'../backend/apps-script/Code.gs'),'utf8');
const clone=value=>JSON.parse(JSON.stringify(value));
const initial=()=>({schema:6,updatedAt:'2026-01-01T00:00:00Z',personal:[{id:'p1',cargo:'Supervisor'}],inventoryStock:[{id:'s1',quantity:10}],inventoryCriteria:[{id:'item1',name:'Guantes'},{id:'SYSTEM-FORM-OPTIONS-V1',recordType:'formOptions',deleted:true,active:false,createdAt:'2026-01-01T00:00:00Z',options:{'personal.role':['Supervisor','Técnico de mina'],'personal.company':['SK 3.7'],'inventory.unit':['Unidad']}}]});
function service(seed=initial()){
 let cloud=clone(seed),writes=0,locked=false;
 const cache=new Map(),users=[{username:'ana',role:'assistant'},{username:'luis',role:'assistant'},{username:'admin',role:'owner'}];
 const context=vm.createContext({console,PropertiesService:{getScriptProperties:()=>({getProperty:key=>key==='SK_AUTH_SECRET'?'test-secret':'test-key'})},Utilities:{getUuid:randomUUID,base64EncodeWebSafe:value=>Buffer.from(value).toString('base64url'),base64DecodeWebSafe:value=>Buffer.from(value,'base64url'),newBlob:value=>({getDataAsString:()=>Buffer.from(value).toString()}),computeHmacSha256Signature:(value,key)=>createHmac('sha256',key).update(value).digest()},CacheService:{getScriptCache:()=>({get:key=>cache.get(key)||null,put:(key,value)=>cache.set(key,value),remove:key=>cache.delete(key)})},LockService:{getScriptLock:()=>({waitLock:()=>{assert.equal(locked,false);locked=true},releaseLock:()=>{locked=false}})}});
 vm.runInContext(source,context);
 context.adminUsers_=()=>users;
 context.findFile_=()=> 'central';context.readFile_=()=>clone(cloud);context.writeFile_=(_,value)=>{assert.equal(locked,true);cloud=clone(value);writes++};context.json_=clone;
 const token=(username='ana',role=users.find(user=>user.username===username)?.role||'assistant',expires=Date.now()+60000)=>{const payload=[username,role,expires].join('|');return Buffer.from(payload).toString('base64url')+'.'+context.sign_(payload)};
 const post=(body,authToken=token())=>context.doPost({postData:{contents:JSON.stringify({token:authToken,...body})}});
 return{post,token,cache,users,cloud:()=>clone(cloud),writes:()=>writes};
}
const search=(s,query,token)=>s.post({action:'adminCargoSearch',query},token);
const add=(s,searchToken,extra={},token)=>s.post({action:'adminCargoAdd',searchToken,...extra},token);
test('buscar primero: vacío, cargo existente, tildes y espacios no habilitan altas',()=>{
 const s=service();
 for(const query of ['', '   ', 'a'.repeat(121)])assert.equal(search(s,query).ok,false);
 for(const query of ['TECNICO  DE MINA','  técnico ', 'supervisor']){const result=search(s,query);assert.equal(result.ok,true);assert.ok(result.matches.length);assert.equal(result.searchToken,'')}
 assert.equal(add(s,'').ok,false);assert.equal(add(s,randomUUID()).ok,false);assert.equal(s.writes(),0);
});
test('solo agrega el nombre buscado y conserva cargos, otros catálogos y registros',()=>{
 const s=service(),before=s.cloud(),result=search(s,'  Electricista  industrial  ');
 assert.equal(result.matches.length,0);assert.ok(result.searchToken);
 const saved=add(s,result.searchToken,{value:'Cargo manipulado',options:{'personal.company':[]},deleted:true});
 assert.equal(saved.ok,true);assert.equal(saved.value,'Electricista industrial');
 const expected=clone(before),record=expected.inventoryCriteria[1];
 record.options['personal.role'].push('Electricista industrial');record.updatedAt=saved.record.updatedAt;record.syncState='synced';expected.updatedAt=saved.record.updatedAt;
 assert.deepEqual(s.cloud(),expected);assert.equal(add(s,result.searchToken).ok,false);assert.equal(s.writes(),1);
});
test('la autorización de búsqueda pertenece al usuario y puede vencer',()=>{
 const s=service(),ticket=search(s,'Mecánico').searchToken;
 assert.equal(add(s,ticket,{},s.token('luis')).ok,false);s.cache.clear();assert.equal(add(s,ticket).ok,false);assert.equal(s.writes(),0);
});
test('dos auxiliares no pueden agregar duplicados tras búsquedas simultáneas',()=>{
 const s=service(),first=search(s,'Mecánico').searchToken,second=search(s,'MECANICO',s.token('luis')).searchToken;
 assert.equal(add(s,first).ok,true);assert.equal(add(s,second,{},s.token('luis')).ok,false);assert.equal(s.writes(),1);
});
test('sesión inválida, vencida, revocada o de Plaza no puede consultar ni agregar',()=>{
 const s=service(),ticket=search(s,'Mecánico').searchToken;
 for(const token of ['',s.token('ana','assistant',1),s.token('ana','owner'),s.token('ana','plaza_operator')]){
  assert.equal(search(s,'Mecánico',token).ok,false);assert.equal(add(s,ticket,{},token).ok,false);
 }
 s.users[0].enabled=false;assert.equal(add(s,ticket).ok,false);assert.equal(s.writes(),0);
});
test('la sincronización del auxiliar bloquea editar, eliminar o agregar catálogos completos',()=>{
 for(const mutation of [row=>{row.options['personal.role']=[]},row=>{row.options['personal.role'][0]='Cambio'},row=>{row.options['personal.role'].push('Otro')},row=>{row.options['personal.company'].push('Otra')}]){
  const s=service(),row=s.cloud().inventoryCriteria[1];mutation(row);row.syncState='pending';
  assert.equal(s.post({action:'sync',data:{inventoryCriteria:[row]}}).ok,false);assert.equal(s.writes(),0);
 }
});
test('el administrador conserva la modificación de todos los catálogos',()=>{
 const s=service(),row=s.cloud().inventoryCriteria[1];row.options['personal.company'].push('Otra');row.options['personal.role']=[];row.syncState='pending';row.updatedAt=new Date().toISOString();
 assert.equal(s.post({action:'sync',data:{inventoryCriteria:[row]}},s.token('admin')).ok,true);assert.deepEqual(s.cloud().inventoryCriteria[1].options,row.options);
});
test('catálogo ausente: conserva los cargos predeterminados y agrega el nuevo',()=>{
 const s=service({inventoryCriteria:[{id:'item1',name:'Guantes'}]});assert.equal(search(s,'Supervisor').searchToken,'');
 const saved=add(s,search(s,'Mecánico').searchToken);assert.equal(saved.ok,true);assert.equal(saved.record.options['personal.role'].length,7);assert.equal(s.cloud().inventoryCriteria.length,2);
});
