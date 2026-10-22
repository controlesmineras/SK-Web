const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const fs=require('node:fs'),path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8'),clone=value=>JSON.parse(JSON.stringify(value));
const date='2026-10-22T12:00:00.000Z';
const legacy=(id='one',extra={})=>({id,clase:'Taladro',serial:'SERIAL-'+id,numeroClase:'1',marcaActual:'SK #4',marcaInterna:'SK #4',ubicacion:'Bodega',createdAt:date,updatedAt:date,syncState:'synced',...extra});
const request=row=>({...row,markRequest:'existing-v1',markRequestedAt:date,markingPolicy:'letters-v1',markStatus:'pending',updatedAt:'2026-10-22T13:00:00.000Z',syncState:'pending'});
function backend(assets,extra={}){
 let cloud={assets:clone(assets),novelties:[{id:'history',assetId:'one',descripcion:'Revista física'}],...clone(extra)},locked=false;
 const ctx=vm.createContext({LockService:{getScriptLock:()=>({waitLock(){assert.equal(locked,false);locked=true},releaseLock(){locked=false}})}});
 vm.runInContext(read('backend/apps-script/Code.gs'),ctx);
 ctx.findFile_=()=> 'test';ctx.readFile_=()=>clone(cloud);ctx.writeFile_=(_,value)=>{assert.equal(locked,true);cloud=clone(value)};ctx.json_=clone;
 return{ctx,cloud:()=>clone(cloud),sync:(rows,role='owner')=>ctx.adminSyncAuthorized_({assets:clone(rows)},'',{role,username:'admin-test',name:'Administrador'})};
}
test('solicitud explícita asigna al mismo activo, conserva datos e historial y reserva marcas históricas',()=>{
 const old=legacy(),reserved=legacy('reserved',{marcaActual:'AAA',marcaInterna:'AAA',deleted:true}),s=backend([old,reserved]);
 const response=s.sync([request(old)]),saved=response.data.assets.find(row=>row.id===old.id);
 assert.equal(saved.nuevaMarca,'AAB');assert.equal(saved.marcaPrevia,'SK #4');assert.equal(saved.markRequestedBy,'admin-test');
 assert.equal(saved.serial,old.serial);assert.equal(saved.ubicacion,old.ubicacion);assert.equal(saved.createdAt,old.createdAt);
 assert.deepEqual(saved.markPreviousValues,{marcaActual:'SK #4',marcaInterna:'SK #4',marcaPrevia:''});
 assert.equal(s.cloud().assets.length,2);assert.equal(s.cloud().novelties[0].id,'history');assert.equal(s.cloud().assetMarkRegistry.length,1);
});
test('dos dispositivos y reintentos conservan el código ya emitido sin gastar otra marca',()=>{
 const old=legacy(),s=backend([old]),pending=request(old);
 s.sync([pending]);s.sync([pending]);s.sync([{...pending,updatedAt:'2099-01-01T00:00:00.000Z'}]);
 assert.equal(s.cloud().assets[0].nuevaMarca,'AAA');assert.equal(s.cloud().assetMarkRegistry.length,1);
 assert.equal(s.cloud().assets[0].marcaPrevia,'SK #4');
});
test('no reemplaza una marca nueva manual ni una marca anterior registrada',()=>{
 const old=legacy('one',{marcaPrevia:'ORIGINAL'}),s=backend([old]);s.sync([request(old)]);
 assert.equal(s.cloud().assets[0].marcaPrevia,'ORIGINAL');assert.equal(s.cloud().assets[0].markPreviousValues.marcaActual,'SK #4');
 const manual=legacy('manual',{nuevaMarca:'ZZZ'}),m=backend([manual]);
 m.sync([{...request(manual),nuevaMarca:'',marcaActual:'',marcaInterna:''}]);
 assert.equal(m.cloud().assets[0].nuevaMarca,'ZZZ');assert.equal(m.cloud().assets[0].marcaActual,'SK #4');assert.equal((m.cloud().assetMarkRegistry||[]).length,0);
});
test('una edición normal no asigna marca a un activo antiguo',()=>{
 const old=legacy(),s=backend([old]);const edit=request(old);delete edit.markRequest;s.sync([edit]);
 assert.equal(s.cloud().assets[0].nuevaMarca,undefined);assert.equal(s.cloud().assets[0].marcaActual,'SK #4');assert.equal((s.cloud().assetMarkRegistry||[]).length,0);
});
test('una solicitud desde un equipo atrasado conserva la ficha más reciente de la base central',()=>{
 const stale=legacy(),current={...stale,serial:'SERIAL-CORREGIDO',ubicacion:'Mina',observaciones:'Actualizado en otro equipo',updatedAt:'2026-10-22T14:00:00.000Z'},s=backend([current]);
 s.sync([request(stale)]);const saved=s.cloud().assets[0];
 assert.equal(saved.nuevaMarca,'AAA');assert.equal(saved.serial,current.serial);assert.equal(saved.ubicacion,'Mina');assert.equal(saved.observaciones,current.observaciones);
});
test('solicitudes de auxiliares no pueden alterar fichas existentes ni asignar marcas',()=>{
 const old=legacy(),s=backend([old]),before=s.cloud();
 assert.throws(()=>s.sync([request(old)],'assistant'));assert.deepEqual(s.cloud(),before);
});
test('las excepciones de clase y los activos eliminados no reciben marca',()=>{
 for(const extra of [{clase:'YT'},{clase:'Columna',serial:''},{clase:'Autorrescatador'},{deleted:true}]){
  const old=legacy('one',extra),s=backend([old]);s.sync([request(old)]);
  assert.equal((s.cloud().assetMarkRegistry||[]).length,0);assert.equal(s.cloud().assets[0].nuevaMarca,undefined);
 }
});
test('YT de ingreso externo conserva el prefijo y la marca histórica',()=>{
 const old=legacy('one',{clase:'YT',mina:'Providencia',minaOrigen:'Providencia',incomeMarking:true,activoExterno:true}),s=backend([old]);s.sync([request(old)]);
 assert.equal(s.cloud().assets[0].nuevaMarca,'P-AA');assert.equal(s.cloud().assets[0].marcaPrevia,'SK #4');
});
test('si se agota la secuencia no hay escritura parcial',()=>{
 const old=legacy(),s=backend([old],{assetMarkRegistry:[{id:'last',code:'ZZZ',sequence:17575}]}),before=s.cloud();
 assert.throws(()=>s.sync([request(old)]),/agotaron/);assert.deepEqual(s.cloud(),before);
});

function syncClient(reply){
 let rows=[request(legacy())],writes=0;const status={textContent:''},sent=[];
 const window={SK_SYNC_CONFIG:{apiUrl:'https://script.google.com/macros/s/test/exec'},SKAdminAuth:{ready:()=>true,token:()=> 'test'},addEventListener(){},dispatchEvent(){},writeSyncedSnapshot:async data=>{writes++;rows=clone(data.assets)}};
 const ctx={window,document:{querySelector:q=>q==='#syncStatus'?status:null},navigator:{onLine:true},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},stores:['assets'],all:async()=>clone(rows),refresh:async()=>{},seedParts:async()=>{},AbortController,setTimeout:()=>1,clearTimeout(){},CustomEvent:class{},Event:class{},console:{error(){}},alert(){},fetch:async(_,options)=>{sent.push(JSON.parse(options.body));return{ok:true,json:async()=>reply(clone(rows))}}};
 vm.runInNewContext(read('sync-api.js'),ctx);
 return{sync:()=>window.skSyncApi.sync({silent:true}),rows:()=>rows,status,sent,get writes(){return writes}};
}
test('un servidor antiguo no confirma ni borra la solicitud local pendiente',async()=>{
 for(const reply of [()=>({ok:true,acknowledged:true}),rows=>({ok:true,data:{assets:rows.map(row=>({...row,markingPolicy:undefined,markStatus:undefined,syncState:'synced'}))}})]){
  const c=syncClient(reply);assert.equal(await c.sync(),false);assert.equal(c.writes,0);assert.equal(c.rows()[0].syncState,'pending');assert.match(c.status.textContent,/Actualiza Code.gs/);
 }
});
test('la marca confirmada queda sincronizada y conserva el mismo identificador',async()=>{
 const c=syncClient(rows=>({ok:true,data:{assets:rows.map(row=>({...row,nuevaMarca:'AAA',markStatus:'assigned',syncState:'synced'}))}}));
 assert.equal(await c.sync(),true);assert.equal(c.writes,1);assert.equal(c.rows()[0].id,'one');assert.equal(c.rows()[0].nuevaMarca,'AAA');assert.equal(c.sent[0].since,'');
});
function markClient(initial=legacy(),{owner=true,dirty=false}={}){
 let row=clone(initial),writes=0;const storage=new Map(),nodes=new Map(),alerts=[];
 const element=()=>({hidden:false,disabled:false,style:{},dataset:{},classList:{remove(){}},setAttribute(){},addEventListener(){},append(...children){for(const child of children)if(child?.id)nodes.set('#'+child.id,child)},replaceChildren(){},focus(){},showModal(){this.open=true},close(){this.open=false}});
 const label=element(),form={elements:{id:{value:row.id},nuevaMarca:{closest:()=>label},marcaInterna:{}},dataset:dirty?{historyEditRevision:'1'}:{}};
 nodes.set('#assetForm',form);
 const document={head:element(),body:element(),querySelector:q=>nodes.get(q)||null,createElement(tag){const node=element();if(tag==='dialog'){const parts=new Map(['h2','#assetMarkMessage','#assetMarkCards','button'].map(key=>[key,element()]));node.querySelector=q=>parts.get(q);}return node}};
 const window={SKAdminAuth:{isOwner:()=>owner},skSyncApi:{configured:()=>false,schedule(){}},addEventListener(){}};
 const context={window,document,location:{pathname:'/SK-Web/'},navigator:{onLine:false},localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},all:async()=>[clone(row)],put:async(_,value)=>{writes++;row=clone(value)},alert:value=>alerts.push(value),console};
 vm.runInNewContext(read('asset-marking.js'),context);
 return{api:window.SKAssetMarking,alerts,form,rows:()=>row,get writes(){return writes},button:()=>nodes.get('#assetRequestMarkBtn')};
}
test('el botón solicita sobre el registro guardado sin generar código local y bloquea repeticiones',async()=>{
 const c=markClient();await c.api.refreshRequestButton();assert.equal(c.button().hidden,false);assert.equal(c.button().disabled,false);
 assert.equal(await c.api.requestExisting('one'),true);await c.api.refreshRequestButton();
 assert.equal(c.rows().id,'one');assert.equal(c.rows().marcaInterna,'SK #4');assert.equal(c.rows().nuevaMarca,undefined);assert.equal(c.rows().syncState,'pending');assert.equal(c.button().disabled,true);
 await c.api.requestExisting('one');assert.equal(c.writes,1);
});
test('el botón respeta permisos y clase, y no aparece para activos ya marcados',async()=>{
 for(const [row,options] of [[legacy(),{owner:false}],[legacy('one',{clase:'Autorrescatador'}),{}],[legacy('one',{nuevaMarca:'AAA'}),{}],[legacy('one',{deleted:true}),{}]]){
  const c=markClient(row,options);await c.api.refreshRequestButton();assert.equal(c.button().hidden,true);assert.equal(await c.api.requestExisting('one'),false);assert.equal(c.writes,0);
 }
});
test('los cambios sin guardar o pendientes de sincronizar deben resolverse antes de solicitar marca',async()=>{
 for(const c of [markClient(legacy(),{dirty:true}),markClient(legacy('one',{syncState:'pending'}))]){
  assert.equal(await c.api.requestExisting('one'),false);assert.equal(c.writes,0);assert.ok(c.alerts.length);
 }
});
