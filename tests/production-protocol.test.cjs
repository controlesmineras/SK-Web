const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const context=vm.createContext({window:{}});
vm.runInContext(fs.readFileSync('produccion/sync-protocol.js','utf8'),context);
const {reconcile,protocol}=context.window.SKProductionSync;
const request={id:'income-000000001',kind:'income',partId:'part10',origen:'YT29',cantidad:4};
const response=(rows=[request])=>({ok:true,syncProtocol:protocol,personal:[],assets:[],parts:[],inventoryCriteria:[],inventoryCounts:[],inventoryLatest:[],incomes:rows,consumptions:[],stockAdjustmentLocalV1:true,acknowledgements:[{id:request.id,status:'accepted'}]});
test('a new local operation and a changed version survive a response to the old snapshot',()=>{
 const newer={...request,cantidad:6},another={...request,id:'income-000000002'};
 const result=reconcile(response(),[request],{pending:[newer,another]});
 assert.equal(result.pending.length,2);assert.equal(result.pending[0].cantidad,6);
});
test('accepted and rejected receipts reconcile independently and keep the last complete sync unchanged',()=>{
 const bad={...request,id:'rejected-0000001',partId:'unknown'},data=response();
 data.acknowledgements.push({id:bad.id,status:'rejected',error:'Repuesto no disponible'});
 const result=reconcile(data,[request,bad],{pending:[request,bad],lastSyncAt:'2026-11-01T12:00:00Z'});
 assert.equal(result.pending.length,1);assert.equal(result.pending[0].syncRejected,true);
 assert.match(result.pending[0].syncError,/Repuesto/);assert.equal(result.lastSyncAt,'2026-11-01T12:00:00Z');assert.ok(result.lastFetchedAt);
});
test('incomplete snapshots, missing receipts and contradictory quantities cannot remove pending records',()=>{
 const current={pending:[request]};
 const missing=response();delete missing.assets;
 assert.throws(()=>reconcile(missing,[request],current),/incompleta/);
 const noReceipt=response();noReceipt.acknowledgements=[];
 assert.throws(()=>reconcile(noReceipt,[request],current),/individual/);
 const wrong=response([{...request,cantidad:9}]);
 assert.throws(()=>reconcile(wrong,[request],current),/individual/);
 const repeated=response();repeated.acknowledgements.push(repeated.acknowledgements[0]);
 assert.throws(()=>reconcile(repeated,[request],current),/repetidas/);
 assert.equal(current.pending.length,1);
});
test('legacy confirmation requires the ID and exact saved amount',()=>{
 const data=response();delete data.syncProtocol;delete data.acknowledgements;data.ack=[request.id];
 assert.equal(reconcile(data,[request],{pending:[request]}).pending.length,0);
 data.incomes[0]={...request,cantidad:8};
 assert.equal(reconcile(data,[request],{pending:[request]}).pending.length,1);
});
test('a hard deadline settles even if fetch or the response body ignores abort',async()=>{
 const app=fs.readFileSync('produccion/app.js','utf8');
 for(const fetch of [()=>new Promise(()=>{}),async()=>({ok:true,json:()=>new Promise(()=>{})})]){
  let expire;const c=vm.createContext({navigator:{onLine:true},window:{SK_SYNC_CONFIG:{apiUrl:'https://example.invalid'}},AbortController,fetch,setTimeout:callback=>{expire=callback;return 1},clearTimeout(){}});
  vm.runInContext(app.slice(app.indexOf('async function api('),app.indexOf('const labelAsset=')),c);
  const pending=c.api('productionSync');expire();
  await assert.rejects(pending,/45 segundos/);
 }
});

test('discarding reviewed rejections preserves unsent work, newer conflicts and all central records',()=>{
 const rejected={id:'old',syncRejected:true,action:'delete',incomeId:'income',baseRevision:'original'};
 const changed={...rejected,id:'changed',baseRevision:'new'};
 const unseen={...rejected,id:'unseen'},waiting={...rejected,id:'waiting',syncRejected:false};
 const current={incomes:[{id:'income',cantidad:8}],consumptions:[{id:'consumption'}],incomeHistory:[{id:'history'}],pending:[{id:'pending'}],countQueue:[{id:'count'}],incomeChanges:[rejected,changed,unseen,waiting]};
 const result=context.window.SKProductionSync.discardRejectedIncomeChanges(current,[rejected,{...changed,baseRevision:'original'},waiting]);
 assert.deepEqual(Array.from(result.incomeChanges,row=>row.id),['changed','unseen','waiting']);
 for(const key of ['incomes','consumptions','incomeHistory','pending','countQueue'])assert.strictEqual(result[key],current[key]);
 assert.equal(current.incomeChanges.length,4);
 const summary=context.window.SKProductionSync.pendingSummary(result);
 assert.equal(summary.total,5);assert.equal(summary.rejected,2);assert.equal(summary.waiting,3);
});

test('header shows the latest downloaded data while still identifying unresolved work',()=>{
 const app=fs.readFileSync('produccion/app.js','utf8'),nodes=new Map();
 const byId=id=>{if(!nodes.has(id))nodes.set(id,{classList:{toggle(){}},setAttribute(){}});return nodes.get(id)};
 const c=vm.createContext({window:context.window,state:{lastSyncAt:'2026-11-10T23:04:00Z',lastFetchedAt:'2026-11-11T10:36:00Z',incomeChanges:[{syncRejected:true}]},session:{user:{role:'admin'}},syncing:false,syncFailed:true,byId,paintOfflineEntry(){}});
 vm.runInContext(app.slice(app.indexOf('function paintSync('),app.indexOf('let syncRequested=false')),c);c.paintSync();
 assert.match(byId('headerLastSync').textContent,/Datos: 11\/11\/2026/);
 assert.match(byId('pendingBadge').title,/0 por enviar · 1 requieren revisión/);
 assert.equal(byId('reviewIncomeConflicts').hidden,false);
 c.session.user.role='assistant';c.paintSync();assert.equal(byId('reviewIncomeConflicts').hidden,true);
});
