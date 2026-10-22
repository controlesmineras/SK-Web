const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const fs=require('node:fs'),path=require('node:path'),{webcrypto}=require('node:crypto'),{IDBFactory}=require('fake-indexeddb');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8'),clone=value=>JSON.parse(JSON.stringify(value));
const date='2026-10-22T12:00:00.000Z',later='2026-10-22T13:00:00.000Z';
const legacy=(id,extra={})=>({id,clase:'Taladro',serial:'SERIAL-'+id,marcaActual:'SK '+id,createdAt:date,updatedAt:date,syncState:'synced',...extra});
const request=(id,extra={})=>legacy(id,{markingPolicy:'letters-v1',markStatus:'pending',syncState:'pending',...extra});
function backend(assets=[],registry=[]){
 let cloud={assets:clone(assets),assetMarkRegistry:clone(registry),novelties:[{id:'n',assetId:'old'}],inventoryCriteria:[{id:'drill',name:'Taladro',isFixedAsset:true,usesSerial:true}]},writes=0,locked=false;
 const ctx=vm.createContext({LockService:{getScriptLock:()=>({waitLock(){assert.equal(locked,false);locked=true},releaseLock(){locked=false}})}});
 vm.runInContext(read('backend/apps-script/Code.gs'),ctx);ctx.findFile_=()=> 'test';ctx.readFile_=()=>clone(cloud);ctx.writeFile_=(_,value)=>{assert.equal(locked,true);writes++;cloud=clone(value)};ctx.json_=clone;
 ctx.verifyToken_=()=>({document:'TEST',role:'plaza_operator'});
 return{ctx,cloud:()=>clone(cloud),get writes(){return writes},sync:rows=>ctx.adminSyncAuthorized_({assets:clone(rows)},'',{role:'owner',username:'test'}),plaza:rows=>ctx.plazaSync_({token:'test',data:{assets:clone(rows)}})};
}
test('solo la central emite la nueva marca; altas manuales, cambios y borrados se rechazan sin escribir',()=>{
 for(const [old,patch] of [[legacy('a'),{nuevaMarca:'AAU'}],[legacy('a',{nuevaMarca:'AAS'}),{nuevaMarca:'AAU'}],[legacy('a',{nuevaMarca:'AAS'}),{nuevaMarca:''}]]){
  const s=backend([old]),before=s.cloud();assert.throws(()=>s.sync([{...old,...patch,updatedAt:later,syncState:'pending'}]),/solo puede asignarla la base central/);assert.equal(s.writes,0);assert.deepEqual(s.cloud(),before);
 }
 const s=backend();assert.throws(()=>s.sync([legacy('new',{nuevaMarca:'ZZZ',syncState:'pending'})]),/solo puede asignarla/);assert.equal(s.writes,0);
});
test('también rechaza copiar una marca en marca actual o interna de otra clase',()=>{
 for(const field of ['marcaActual','marcaInterna']){
  const old=legacy('a'),s=backend([old,legacy('other',{clase:'Pulidora',nuevaMarca:'AAS',deleted:true})]);
  assert.throws(()=>s.sync([{...old,[field]:' aas ',updatedAt:later,syncState:'pending'}]),/marca AAS ya pertenece/);assert.equal(s.writes,0);
 }
});
test('normaliza reservas antiguas y reconstruye la secuencia aunque falte o esté atrasada',()=>{
 for(const sequence of [undefined,0,18]){
  const s=backend([],[{id:'reserved',code:' aas ',sequence}]);s.sync([request('new')]);
  assert.equal(s.cloud().assets[0].nuevaMarca,'AAT');assert.equal(s.cloud().assetMarkRegistry[0].code,'AAS');
 }
 const old=legacy('old',{nuevaMarca:'AAS',markingPolicy:'letters-v1',markStatus:'assigned'}),s=backend([old]);
 s.sync([{...old,updatedAt:later,syncState:'pending'},request('new')]);assert.equal(s.cloud().assets[1].nuevaMarca,'AAT');
});
test('las reservas de minas externas no desplazan la secuencia general',()=>{
 const s=backend([],[{id:'external',code:'p-aa',scheme:'mine-prefix-v1',prefix:'P',sequence:0}]);s.sync([request('new')]);assert.equal(s.cloud().assets[0].nuevaMarca,'AAA');
});
test('200 altas intercaladas de Admin y Plaza más reintentos mantienen una marca por activo',()=>{
 const s=backend();for(let i=0;i<200;i++){
  const row=request('asset-'+i,{criteriaId:'drill',numeroClase:String(i+1)}),sync=i%2?s.plaza:s.sync;sync([row]);sync([row]);
 }
 const cloud=s.cloud(),codes=cloud.assets.map(row=>row.nuevaMarca);
 assert.equal(cloud.assets.length,200);assert.equal(new Set(codes).size,200);assert.ok(codes.every(code=>/^[A-Z]{3}$/.test(code)));assert.equal(cloud.assetMarkRegistry.length,200);assert.deepEqual(cloud.novelties,[{id:'n',assetId:'old'}]);
});
async function local(withRules=true){
 const window={dispatchEvent(){}};const ctx=vm.createContext({window,indexedDB:new IDBFactory(),crypto:webcrypto,Event:class{}});
 if(withRules)vm.runInContext(read('asset-record-rules.js'),ctx);
 vm.runInContext(read('app.js').split('const PARTS=')[0],ctx);await ctx.openDB();return ctx;
}
test('la transacción local impide alterar o borrar marcas incluso si falta el módulo de reglas',async()=>{
 for(const rules of [true,false]){
  const c=await local(rules),old=legacy('old',{nuevaMarca:'AAS'});await c.put('assets',old);
  for(const nuevaMarca of ['','AAT'])await assert.rejects(c.put('assets',{...old,nuevaMarca,syncState:'pending'}),/solo puede cambiarla la base central/);
  await assert.rejects(c.put('assets',request('new',{nuevaMarca:'AAT'})),/solo puede cambiarla/);
  assert.deepEqual(clone(await c.all('assets')),[old]);
  await c.put('assets',{...old,ubicacion:'Mina',syncState:'pending'});assert.equal((await c.all('assets'))[0].ubicacion,'Mina');
  await c.put('assets',{...old,nuevaMarca:'AAT',syncState:'synced'});assert.equal((await c.all('assets'))[0].nuevaMarca,'AAT');
 }
});
function editor(){
 const pending=[],form={dataset:{},elements:Object.fromEntries(['id','nuevaMarca','marcaInterna','marcaAnterior','serial','modelo','fabricante','ubicacion','clase'].map(key=>[key,{value:'anterior'}])),reset(){for(const field of Object.values(this.elements))field.value=''}},button={};
 const ctx=vm.createContext({$:id=>id==='#assetForm'?form:button,all:()=>new Promise(resolve=>pending.push(resolve)),window:{SKAssetAdminUI:{hydrateEdit:async()=>{}},SKAdminAuth:{isOwner:()=>true}}});
 const app=read('app.js');vm.runInContext(app.slice(app.indexOf('async function editAsset(id){'),app.indexOf('async function updateNoveltyOptions(){')),ctx);return{ctx,form,button,pending};
}
test('abrir fichas rápidamente limpia la identidad y descarta la carga anterior',async()=>{
 const e=editor(),a=e.ctx.editAsset('a');assert.equal(e.form.elements.nuevaMarca.value,'');assert.equal(e.button.disabled,true);
 const b=e.ctx.editAsset('b');e.pending[1]([legacy('b',{nuevaMarca:'AAT'})]);await b;
 e.pending[0]([legacy('a',{nuevaMarca:'AAS'})]);await a;assert.equal(e.form.elements.id.value,'b');assert.equal(e.form.elements.nuevaMarca.value,'AAT');assert.equal(e.button.disabled,false);
});
test('reabrir el mismo activo no permite que una carga vieja sobrescriba la nueva',async()=>{
 const e=editor(),a=e.ctx.editAsset('a'),b=e.ctx.editAsset('a');e.pending[1]([legacy('a',{nuevaMarca:'AAT'})]);await b;e.pending[0]([legacy('a',{nuevaMarca:'AAS'})]);await a;assert.equal(e.form.elements.nuevaMarca.value,'AAT');
});
test('abrir un alta nueva cancela la ficha pendiente sin dejar el bloqueo de carga',async()=>{
 const e=editor(),a=e.ctx.editAsset('a');e.ctx.newAsset();assert.equal(e.form.dataset.assetLoading,undefined);e.pending[0]([legacy('a',{nuevaMarca:'AAS'})]);await a;assert.equal(e.form.elements.id.value,'');assert.equal(e.form.elements.nuevaMarca.value,'');
});
function marker(rows,ids=[]){
 const nodes=new Map(),events=new Map(),storage=new Map([['skAssetMarkNotifications-admin',JSON.stringify(ids)]]);
 const element=()=>({hidden:false,style:{},setAttribute(){},append(...children){for(const child of children)if(child.id)nodes.set('#'+child.id,child)},replaceChildren(){},addEventListener(){},focus(){},showModal(){this.open=true},close(){this.open=false}});
 for(const id of ['home','assets'])nodes.set('#'+id,element());
 const document={head:element(),body:element(),querySelector:key=>nodes.get(key)||null,createElement(tag){const node=element();if(tag==='dialog'){const parts=new Map(['h2','#assetMarkMessage','#assetMarkCards','button'].map(key=>[key,element()]));node.querySelector=key=>parts.get(key)}return node}};
 const window={addEventListener:(key,fn)=>events.set(key,fn)},ctx=vm.createContext({window,document,location:{pathname:'/SK-Web/'},navigator:{onLine:true},localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},db:{},all:async()=>rows});vm.runInContext(read('asset-marking.js'),ctx);
 return{api:window.SKAssetMarking,nodes,storage};
}
test('audita todos los campos actuales, excluye historia y no confunde PAA con P-AA',()=>{
 const m=marker([]),rows=[legacy('a',{nuevaMarca:'AAS',marcaActual:'AAS',marcaPrevia:'ZZZ'}),legacy('b',{nuevaMarca:'AAT',marcaInterna:' aas '}),legacy('c',{nuevaMarca:'ZZZ'}),legacy('d',{nuevaMarca:'P-AA'}),legacy('e',{nuevaMarca:'PAA'})];
 assert.deepEqual(clone(m.api.markConflicts(rows)),[{code:'AAS',assetIds:['a','b']}]);assert.deepEqual(clone(m.api.markConflicts([rows[0],rows[0]])),[]);
});
test('avisa de duplicados sin solicitudes pendientes y oculta el aviso tras corregirlos',async()=>{
 const rows=[legacy('a',{nuevaMarca:'AAS'}),legacy('b',{nuevaMarca:'AAS'})],m=marker(rows);await m.api.scan();assert.equal(m.nodes.get('#assetMarkIntegrity-home').hidden,false);assert.match(m.nodes.get('#assetMarkIntegrity-assets').textContent,/AAS/);assert.equal(m.nodes.has('#assetMarkDialog'),false);
 rows[1].nuevaMarca='AAT';await m.api.scan();assert.equal(m.nodes.get('#assetMarkIntegrity-home').hidden,true);
});
test('nunca pide marcar físicamente un código repetido o todavía pendiente',async()=>{
 const rows=[request('a',{nuevaMarca:'AAS',markStatus:'assigned',syncState:'synced'}),legacy('b',{nuevaMarca:'AAS'})],m=marker(rows,['a']);await m.api.scan();assert.equal(m.nodes.get('#assetMarkDialog').querySelector('h2').textContent,'MARCA EN REVISIÓN');
 const pending=marker([request('a',{nuevaMarca:'AAS',markStatus:'assigned'})],['a']);await pending.api.scan();assert.equal(pending.nodes.has('#assetMarkDialog'),false);
 const confirmed=marker([request('a',{nuevaMarca:'AAT',markStatus:'assigned',syncState:'synced'})],['a']);await confirmed.api.scan();assert.equal(confirmed.nodes.get('#assetMarkDialog').querySelector('h2').textContent,'MARCA EL ACTIVO');
});
test('la sincronización antigua delega al servicio central y no abre ni escribe Drive',async()=>{
 const messages=[],ctx=vm.createContext({window:{addEventListener(){}},document:{querySelector:()=>null},alert:message=>messages.push(message),$:()=>null});const app=read('app.js');
 vm.runInContext(app.slice(app.indexOf('async function uploadCloud(){'),app.indexOf('\n',app.indexOf('async function uploadCloud(){'))),ctx);
 await assert.rejects(ctx.uploadCloud(),/servicio de sincronización/);assert.equal(await ctx.syncDrive(),false);
 const latest=read('sync-latest.js');vm.runInContext(latest.slice(latest.indexOf('  async function syncLatest(){'),latest.indexOf("  window.addEventListener('load'")),ctx);assert.equal(await ctx.syncLatest(),false);let calls=0;ctx.window.skSyncApi={configured:()=>true,sync:async()=>{calls++;return true}};
 assert.equal(await ctx.syncDrive(),true);assert.equal(await ctx.syncLatest(),true);assert.equal(calls,2);assert.equal(messages.length,2);
});
