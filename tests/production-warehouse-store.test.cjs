const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{IDBFactory}=require('fake-indexeddb');
const code=fs.readFileSync('produccion/warehouse-store.js','utf8');
function runtime(factory=new IDBFactory()){const context=vm.createContext({indexedDB:factory,window:{}});vm.runInContext(code,context);return{store:context.window.SKProductionWarehouseStore,factory};}
const op=id=>({id,kind:'income',itemId:'tool',quantity:5,fechaISO:'2026-11-17',personId:'person'});
const response=(sent,cursor=sent.length)=>({ok:true,protocol:'production-warehouse-v1',cursor,rows:sent.map((request,i)=>({...request,revision:i+1,requestSignature:JSON.stringify(request)})),receipts:sent.map(row=>({id:row.id,status:'accepted'})),balances:[{itemId:'tool',quantity:5*sent.length}],roles:['warehouse'],settings:{enabled:true},catalog:{criteria:[],assets:[],personal:[]},syncedAt:new Date().toISOString()});
test('offline queue survives reopen and never crosses accounts',async()=>{
 const {store,factory}=runtime();await store.queue('a',op('one'));await store.queue('b',op('two'));
 const reopened=runtime(factory).store;assert.equal((await reopened.read('a')).pending[0].id,'one');assert.equal((await reopened.read('b')).pending[0].id,'two');
});
test('offline openings precede subsequent deliveries on retry regardless of UUID or inventory date',async()=>{
 const {store,factory}=runtime();
 const opening={...op('z-opening'),kind:'opening',createdAt:'2026-11-17T18:00:00Z'};
 const delivery={...op('a-delivery'),kind:'delivery',fechaISO:'2026-11-16',createdAt:'2026-11-17T18:01:00Z'};
 await store.queue('a',opening);await store.queue('a',delivery);
 const reopened=runtime(factory).store,{pending}=await reopened.read('a');
 assert.deepEqual(JSON.parse(JSON.stringify(pending)),[opening,delivery]);
 await reopened.reconcile('a',response(pending),pending);
 assert.equal((await reopened.read('a')).pending.length,0);
});
test('a response cannot delete work added while its request was running',async()=>{
 const {store}=runtime(),one=op('one'),two=op('two');await store.queue('a',one);await store.queue('a',two);
 await store.reconcile('a',response([one]),[one]);const state=await store.read('a');assert.equal(state.pending.length,1);assert.equal(state.pending[0].id,'two');assert.equal(state.records.length,1);
});
test('missing receipts, missing incremental records, or mismatched payload preserve pending and cursor',async()=>{
 const {store}=runtime(),one=op('one');await store.queue('a',one);
 for(const mutate of [r=>r.receipts=[],r=>r.rows[0].requestSignature='wrong',r=>r.cursor=2]){
  const r=response([one]);mutate(r);await assert.rejects(store.reconcile('a',r,[one]));assert.equal((await store.read('a')).pending.length,1);assert.equal((await store.read('a')).cursor,undefined);
 }
});
test('a rejected record remains reviewable and explicit removal does not touch confirmed history',async()=>{
 const {store}=runtime(),one=op('one'),two=op('two');await store.queue('a',one);await store.queue('a',two);
 const result=response([one]);result.receipts.push({id:two.id,status:'rejected',error:'Sin existencias'});await store.reconcile('a',result,[one,two]);
 let current=await store.read('a');assert.equal(current.pending[0].syncRejected,true);await store.discard('a',current.pending[0]);current=await store.read('a');assert.equal(current.records.length,1);assert.equal(current.pending.length,0);
});
test('incremental reconciliation and replay keep one confirmed event per ID',async()=>{
 const {store}=runtime(),one=op('one');await store.queue('a',one);await store.reconcile('a',response([one]),[one]);
 const r={...response([]),catalog:undefined,cursor:1};await store.reconcile('a',r,[]);assert.equal((await store.read('a')).records.length,1);
});
