const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const fs=require('node:fs'),path=require('node:path'),{webcrypto}=require('node:crypto'),{IDBFactory}=require('fake-indexeddb');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8'),clone=value=>JSON.parse(JSON.stringify(value));
const turn=()=>new Promise(resolve=>setImmediate(resolve));
const pending=(id,extra={})=>({id,updatedAt:'2026-10-24T23:00:00Z',syncState:'pending',...extra});
async function client({online=false,respond}={}){
  const timers=new Map(),storage=new Map([['skWebServerUpdatedAt','old-revision']]),states=[],events=[],requests=[],status={};let timer=0,ready=true;
  const window={SK_SYNC_CONFIG:{apiUrl:'https://script.google.com/macros/s/test/exec'},SKAdminAuth:{ready:()=>ready,token:()=> 'test'},SKAdminSyncUI:{setState:state=>states.push(state)},addEventListener(){},dispatchEvent:event=>events.push(event)};
  const ctx=vm.createContext({window,indexedDB:new IDBFactory(),crypto:webcrypto,document:{querySelector:selector=>selector==='#syncStatus'?status:null},navigator:{onLine:online},
    localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
    setTimeout:(fn,ms)=>{timers.set(++timer,{fn,ms});return timer},clearTimeout:id=>timers.delete(id),AbortController,
    CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail}},Event:class{constructor(type){this.type=type}},console:{error(){}},alert(){},refresh:async()=>{},seedParts:async()=>{},
    fetch:async(_,options)=>{const payload=JSON.parse(options.body);requests.push(payload);return {ok:true,json:async()=>respond?respond(payload,requests.length):{ok:true,acknowledged:true}}}});
  vm.runInContext(read('app.js').split('const PARTS=')[0],ctx);await ctx.openDB();vm.runInContext(read('sync-latest.js'),ctx);vm.runInContext(read('sync-api.js'),ctx);
  const db=vm.runInContext('db',ctx),api=window.skSyncApi;
  const raw=(store,row)=>new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).put(clone(row));tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error)});
  return{ctx,db,api,raw,timers,storage,states,events,requests,status,logout:()=>ready=false,rows:async store=>clone(await ctx.all(store))};
}
test('lista solo pendientes de todas las tablas, incluyendo eliminaciones pendientes',async()=>{
  const c=await client(),stores=vm.runInContext('stores',c.ctx);
  for(const store of stores){await c.raw(store,pending(store));await c.raw(store,pending(store+'-synced',{syncState:'synced'}));await c.raw(store,pending(store+'-seed',{syncState:'seed'}));}
  await c.raw('actas',pending('delete',{deleted:true}));
  const entries=await c.api.pendingRecords();assert.equal(entries.length,stores.length+1);assert.ok(entries.every(entry=>entry.row.syncState==='pending'));
  assert.equal(entries.find(entry=>entry.row.id==='delete').row.deleted,true);assert.equal(c.requests.length,0);
});
test('descarta solo el pendiente elegido sin enviar eliminaciones ni marcar sincronización exitosa',async()=>{
  const c=await client(),row=pending('problematic');await c.raw('actas',row);await c.raw('actas',pending('keep'));await c.raw('assets',pending('synced',{syncState:'synced'}));
  assert.equal(await c.api.discardPending('actas',row),true);assert.deepEqual((await c.rows('actas')).map(row=>row.id),['keep']);assert.equal((await c.rows('assets')).length,1);
  assert.equal(c.requests.length,0);assert.equal(c.storage.has('skWebServerUpdatedAt'),false);assert.ok(!c.states.includes('synced'));assert.equal(c.storage.has('sk-admin-last-successful-sync'),false);
  assert.ok(c.events.some(event=>event.type==='skweb-local-change'));assert.ok([...c.timers.values()].some(timer=>timer.ms===300));
});
test('rechaza registros sincronizados, inexistentes o editados después de abrir la lista',async()=>{
  const c=await client(),row=pending('changed');await c.raw('actas',{...row,asunto:'Edición más reciente'});
  await assert.rejects(c.api.discardPending('actas',row),/cambió o ya se sincronizó/);assert.equal((await c.rows('actas'))[0].asunto,'Edición más reciente');
  await c.raw('actas',{...row,syncState:'synced'});await assert.rejects(c.api.discardPending('actas',row),/cambió o ya se sincronizó/);assert.equal((await c.rows('actas'))[0].syncState,'synced');
  await assert.rejects(c.api.discardPending('actas',pending('missing')),/cambió o ya se sincronizó/);assert.equal(c.storage.get('skWebServerUpdatedAt'),'old-revision');
});
test('una transacción cancelada conserva el pendiente completo',async()=>{
  const c=await client(),row=pending('rollback',{asunto:'No perder'});await c.raw('actas',row);
  const original=c.db.transaction.bind(c.db);c.db.transaction=(...args)=>{const tx=original(...args);if(args[1]==='readwrite'){const store=tx.objectStore('actas'),remove=store.delete.bind(store);store.delete=key=>{remove(key);tx.abort()};tx.objectStore=()=>store;}return tx};
  await assert.rejects(c.api.discardPending('actas',row));c.db.transaction=original;
  assert.deepEqual(await c.rows('actas'),[row]);assert.equal(c.storage.get('skWebServerUpdatedAt'),'old-revision');
});
test('espera un envío en curso y protege el registro si la respuesta lo confirma',async()=>{
  let finish;const c=await client({online:true,respond:()=>new Promise(resolve=>finish=resolve)}),row=pending('confirmed');await c.raw('actas',row);
  const sync=c.api.sync({silent:true});for(let i=0;i<30&&!finish;i++)await turn();assert.equal(typeof finish,'function');
  const discard=c.api.discardPending('actas',row),rejected=assert.rejects(discard,/cambió o ya se sincronizó/);
  assert.equal(await c.api.sync({silent:true}),false);assert.equal(c.requests.length,1);assert.equal((await c.rows('actas')).length,1);
  finish({ok:true,acknowledged:true});assert.equal(await sync,true);await rejected;assert.equal((await c.rows('actas'))[0].syncState,'synced');
});
test('después de un envío fallido, el siguiente envío excluye el descartado y sincroniza los demás',async()=>{
  let finish;const c=await client({online:true,respond:(_,n)=>n===1?new Promise(resolve=>finish=resolve):{ok:true,acknowledged:true}}),bad=pending('bad');await c.raw('actas',bad);await c.raw('actas',pending('good'));
  const sync=c.api.sync({silent:true});for(let i=0;i<30&&!finish;i++)await turn();assert.equal(typeof finish,'function');const discard=c.api.discardPending('actas',bad);finish({ok:false,error:'Registro inválido'});
  assert.equal(await sync,false);assert.equal(await discard,true);assert.deepEqual((await c.rows('actas')).map(row=>row.id),['good']);
  const retry=[...c.timers.entries()].find(([,timer])=>timer.ms===300);assert.ok(retry);c.timers.delete(retry[0]);retry[1].fn();
  for(let i=0;i<10;i++)await turn();assert.equal(c.requests.length,2);assert.deepEqual(c.requests[1].data.actas.map(row=>row.id),['good']);assert.equal((await c.rows('actas'))[0].syncState,'synced');
});
test('descartar una edición recupera la versión central sin eliminarla de la base central',async()=>{
  const remote={...pending('existing'),syncState:'synced',clase:'Columna',marcaInterna:'SK',marcaAnterior:'10'},row={...remote,marcaAnterior:'ERROR',syncState:'pending'};
  const c=await client({respond:payload=>{assert.equal(payload.since,'');assert.equal(payload.data.assets.length,0);return {ok:true,data:{assets:[remote],personal:[]}}}});
  await c.raw('assets',row);await c.api.discardPending('assets',row);assert.equal((await c.rows('assets')).length,0);
  c.ctx.navigator.onLine=true;assert.equal(await c.api.sync({silent:true}),true);assert.deepEqual(await c.rows('assets'),[remote]);
});
test('descartar una eliminación pendiente tampoco envía una eliminación al servidor',async()=>{
  const c=await client({online:true}),row=pending('delete',{deleted:true});await c.raw('actas',row);await c.api.discardPending('actas',row);await c.api.sync({silent:true});
  assert.equal(c.requests[0].data.actas.length,0);assert.deepEqual(await c.rows('actas'),[]);
});
test('exige sesión iniciada y valida la tabla antes de modificar datos',async()=>{
  const c=await client(),row=pending('safe');await c.raw('actas',row);await assert.rejects(c.api.discardPending('unknown',row),/válido/);
  c.logout();await assert.rejects(c.api.pendingRecords(),/Ingresa/);await assert.rejects(c.api.discardPending('actas',row),/Ingresa/);assert.deepEqual(await c.rows('actas'),[row]);
});
