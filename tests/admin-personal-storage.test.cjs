// Run with npm ci && node --test tests/admin-personal*.test.cjs.
// Real IndexedDB transaction semantics are simulated; no production data is used.
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const fs=require('node:fs'),path=require('node:path'),{webcrypto}=require('node:crypto');
const {IDBFactory}=require('fake-indexeddb');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8'),clone=value=>JSON.parse(JSON.stringify(value));
const date='2026-10-20T15:40:00.000Z';
const person=(id,extra={})=>({id,documento:'TEST-100',nombre:'Persona Prueba',empresa:'SK 3.7',area:'Producción',cargo:'Operador minero',telefono:'555',createdAt:date,updatedAt:date,syncState:'pending',...extra});
function backend(initial={}){
 let cloud={updatedAt:date,personal:[],assets:[],inventoryCriteria:[],inventoryStock:[],blendingIncomes:[],blendingDeliveries:[],...clone(initial)};
 const ctx=vm.createContext({LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})}});
 vm.runInContext(read('backend/apps-script/Code.gs'),ctx);
 ctx.findFile_=()=> 'test';ctx.readFile_=()=>clone(cloud);ctx.writeFile_=(_,value)=>{cloud=clone(value)};ctx.json_=clone;ctx.verifyToken_=()=>({document:'TEST-OPERATOR',role:'plaza_operator'});
 return{sync:q=>ctx.adminSyncAuthorized_(q.data,q.since,{role:'assistant',username:'test'}),cloud:()=>clone(cloud),plaza:()=>ctx.plazaSync_({token:'test',data:{}})};
}
async function client({respond,initialCloud}={}){
 const b=backend(initialCloud),storage=new Map([['skWebServerUpdatedAt',date]]),states=[],events=[],requests=[],scheduled=new Map();
 const status={textContent:''};let timer=0;
 const window={SK_SYNC_CONFIG:{apiUrl:'https://script.google.com/macros/s/test/exec'},SKAdminAuth:{ready:()=>true,token:()=> 'test'},SKAdminSyncUI:{setState:value=>states.push(value)},addEventListener(){},dispatchEvent:event=>events.push(event)};
 const ctx=vm.createContext({window,indexedDB:new IDBFactory(),crypto:webcrypto,document:{querySelector:selector=>selector==='#syncStatus'?status:null},navigator:{onLine:true},
 localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
 setTimeout:(fn,delay)=>{scheduled.set(++timer,{fn,delay});return timer},clearTimeout:id=>scheduled.delete(id),AbortController,
 CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail}},Event:class{constructor(type){this.type=type}},console:{error(){}},alert(){},
 refresh:async()=>{},seedParts:async()=>{},fetch:async(_,options)=>{const q=JSON.parse(options.body);requests.push(q);return{ok:true,json:async()=>respond?respond(q,requests.length,ctx,b):b.sync(q)}}});
 vm.runInContext(read('app.js').split('const PARTS=')[0],ctx);await ctx.openDB();
 vm.runInContext(read('sync-latest.js'),ctx);vm.runInContext(read('sync-api.js'),ctx);
 const db=vm.runInContext('db',ctx);
 const raw=row=>new Promise((resolve,reject)=>{const tx=db.transaction('personal','readwrite');tx.objectStore('personal').put(clone(row));tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error)});
 return{ctx,db,raw,b,states,events,requests,scheduled,status,storage,rows:async()=>clone(await ctx.all('personal')),sync:()=>window.skSyncApi.sync({silent:true})};
}
test('repara la clave vacía una sola vez y conserva los datos completos para reenviarlos',async()=>{
 const c=await client(),old=person('',{syncState:'synced',telefono:'555-RECUPERAR'});await c.raw(old);
 assert.equal(await c.ctx.repairPersonalIds(),1);const [fixed]=await c.rows();assert.ok(fixed.id);assert.equal(fixed.telefono,old.telefono);assert.equal(fixed.createdAt,old.createdAt);assert.equal(fixed.syncState,'pending');
 assert.equal(await c.ctx.repairPersonalIds(),0);assert.equal((await c.rows())[0].id,fixed.id);
 assert.equal(await c.sync(),true);assert.equal(c.b.plaza().data.personal[0].id,fixed.id);assert.equal(c.b.plaza().data.personal[0].telefono,old.telefono);
});
test('si se cancela la reparación, la transacción conserva el registro con su clave original',async()=>{
 const c=await client();await c.raw(person(''));
 const original=c.db.transaction.bind(c.db);c.db.transaction=(...args)=>{const tx=original(...args);if(args[1]==='readwrite'){const store=tx.objectStore('personal'),put=store.put.bind(store);store.put=value=>{const request=put(value);tx.abort();return request};tx.objectStore=()=>store}return tx};
 await assert.rejects(c.ctx.repairPersonalIds());c.db.transaction=original;assert.equal((await c.rows())[0].id,'');assert.equal((await c.rows())[0].nombre,'Persona Prueba');
});
test('la escritura local también protege altas de otros formularios que entreguen una clave vacía',async()=>{
 const c=await client();await c.ctx.put('personal',person(''));await c.ctx.put('personal',person('',{documento:'TEST-200'}));const rows=await c.rows();assert.equal(rows.length,2);assert.ok(rows.every(row=>row.id));assert.notEqual(rows[0].id,rows[1].id);
});
test('el registro recuperado no se duplica si su documento ya existe en la base central',async()=>{
 const c=await client({initialCloud:{personal:[person('central',{updatedAt:'2026-10-19T00:00:00Z',syncState:'synced'})]}});await c.raw(person(''));assert.equal(await c.sync(),true);
 assert.equal((await c.rows()).length,1);assert.equal((await c.rows())[0].id,'central');assert.equal(c.b.plaza().data.personal.length,1);
});
test('las altas de personal exigen una respuesta completa y confirmación del colaborador',async()=>{
 const c=await client();await c.ctx.put('personal',person('new'));assert.equal(await c.sync(),true);assert.equal(c.requests[0].since,'');assert.equal((await c.rows())[0].syncState,'synced');
});
test('una respuesta exitosa que omite al funcionario no borra el registro ni anuncia sincronización',async()=>{
 const c=await client({respond:()=>({ok:true,updatedAt:'new-cursor',data:{personal:[],assets:[]}})});await c.ctx.put('personal',person('missing'));assert.equal(await c.sync(),false);
 assert.equal((await c.rows())[0].syncState,'pending');assert.equal(c.storage.get('skWebServerUpdatedAt'),date);assert.match(c.status.textContent,/no confirmó al colaborador/);assert.ok(!c.states.includes('synced'));
});
test('una confirmación general sin ficha no se toma como aceptación individual del funcionario',async()=>{
 const c=await client({respond:()=>({ok:true,acknowledged:true,updatedAt:'new-cursor'})});await c.ctx.put('personal',person('new'));assert.equal(await c.sync(),false);assert.equal((await c.rows())[0].syncState,'pending');assert.equal(c.storage.get('skWebServerUpdatedAt'),date);
});
test('un alta durante la descarga se conserva pendiente y se envía en el siguiente ciclo',async()=>{
 const c=await client({respond:async(q,n,ctx,b)=>{const result=b.sync(q);if(n===1)await ctx.put('personal',person('second',{documento:'TEST-200'}));return result}});await c.ctx.put('personal',person('first'));
 assert.equal(await c.sync(),false);assert.equal((await c.rows()).length,2);assert.equal((await c.rows()).find(row=>row.id==='second').syncState,'pending');assert.match(c.status.textContent,/parcial/);assert.ok(!c.states.includes('synced'));
 assert.ok([...c.scheduled.values()].some(timer=>timer.delay===300));
 assert.equal(await c.sync(),true);assert.equal(c.b.plaza().data.personal.length,2);
});
test('una edición durante el envío sobrevive aunque conserve la misma fecha de actualización',async()=>{
 const c=await client({respond:async(q,n,ctx,b)=>{const result=b.sync(q);if(n===1)await ctx.put('personal',person('p',{telefono:'EDITADO'}));return result}});await c.ctx.put('personal',person('p'));
 assert.equal(await c.sync(),false);assert.equal((await c.rows())[0].telefono,'EDITADO');assert.equal((await c.rows())[0].syncState,'pending');assert.equal(await c.sync(),true);assert.equal(c.b.plaza().data.personal[0].telefono,'EDITADO');
});
test('una pestaña antigua que guarda una clave vacía durante el envío tampoco pierde el alta',async()=>{
 let c;c=await client({respond:async(q,n,ctx,b)=>{const result=b.sync(q);if(n===1)await c.raw(person('',{documento:'TEST-LEGACY'}));return result}});await c.ctx.put('personal',person('p'));
 assert.equal(await c.sync(),false);assert.equal((await c.rows()).length,2);assert.ok((await c.rows()).every(row=>row.id));assert.equal(await c.sync(),true);assert.equal(c.b.plaza().data.personal.length,2);
});
test('una respuesta sin cambios tampoco oculta un alta guardada mientras se consulta',async()=>{
 const c=await client({respond:async(q,n,ctx,b)=>{if(n===1){await ctx.put('personal',person('new'));return{ok:true,notModified:true,updatedAt:date}}return b.sync(q)}});
 assert.equal(await c.sync(),false);assert.equal((await c.rows())[0].syncState,'pending');assert.ok(!c.states.includes('synced'));assert.equal(await c.sync(),true);
});
test('una falla de servicio conserva el ID reparado para reintentar sin duplicar',async()=>{
 const c=await client({respond:(q,n,ctx,b)=>n===1?{ok:false,error:'Servicio temporalmente no disponible'}:b.sync(q)});await c.raw(person(''));
 assert.equal(await c.sync(),false);const id=(await c.rows())[0].id;assert.ok(id);assert.equal(await c.sync(),true);assert.equal(c.requests[1].data.personal[0].id,id);assert.equal(c.b.plaza().data.personal.length,1);
});
test('la recuperación conserva las eliminaciones y no inventa registros que ya no existen localmente',async()=>{
 const c=await client();assert.equal(await c.ctx.repairPersonalIds(),0);assert.deepEqual(await c.rows(),[]);await c.raw(person('',{deleted:true}));await c.ctx.repairPersonalIds();assert.equal((await c.rows())[0].deleted,true);assert.equal(await c.sync(),true);assert.equal(c.b.plaza().data.personal[0].deleted,true);
});
test('los demás registros aceptan confirmación rápida, pero primero negocian revisiones fiables',async()=>{
 const c=await client({respond:()=>({ok:true,acknowledged:true,updatedAt:'new-cursor'})});await c.ctx.put('actas',{id:'acta-test',updatedAt:date,syncState:'pending'});
 assert.equal(await c.sync(),true);assert.equal(c.requests[0].since,'');assert.equal((await c.ctx.all('actas'))[0].syncState,'synced');assert.equal(c.storage.get('skWebServerUpdatedAt'),'new-cursor');
});
