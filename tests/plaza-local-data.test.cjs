const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {IDBFactory,IDBDatabase}=require('fake-indexeddb');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const clone=value=>JSON.parse(JSON.stringify(value));
function setup({initial={},factory=new IDBFactory(),rows=new Map(Object.entries(initial))}={}){
  const localStorage={getItem:key=>rows.get(key)??null,setItem(){throw new Error('Snapshot must not be written to localStorage')},removeItem:key=>rows.delete(key)};
  const ctx=vm.createContext({window:{},indexedDB:factory,localStorage,navigator:{storage:{persist:()=>Promise.resolve(true)}},setTimeout,clearTimeout});
  vm.runInContext(read('plaza/lz-string.js'),ctx);vm.runInContext(read('plaza/local-data.js'),ctx);
  return{api:ctx.window.SKPlazaLocal,ctx,rows,factory,localStorage};
}
const pending={personal:[{id:'person',nombre:'José Peña 🛠️',syncState:'pending'}],assets:[],blendingIncomes:[],blendingDeliveries:[{id:'unsent',quantity:2,syncState:'pending'}]};
test('migrates plain and compressed copies without losing pending records or touching other app keys',async()=>{
  for(const compressed of [false,true]){
    const c=setup(),raw=JSON.stringify(pending);
    const old=compressed?JSON.stringify({storageFormat:'sk-plaza-lz-v1',payload:c.ctx.LZString.compressToUTF16(raw)}):raw;
    c.rows.set('skPlazaData',old);c.rows.set('other-app','untouched');
    assert.deepEqual(clone(await c.api.read()),pending);
    assert.equal(c.rows.has('skPlazaData'),false);
    assert.equal(c.rows.get('other-app'),'untouched');
    assert.deepEqual(clone(await setup({factory:c.factory,rows:c.rows}).api.read()),pending);
  }
});
test('large database survives closing and reopening offline, beyond the localStorage quota',async()=>{
  const c=setup();await c.api.read();
  const snapshot={...pending,assets:Array.from({length:60000},(_,i)=>({id:'AF-'+i,clase:'Taladro',serial:'SERIAL-'+i,ubicacion:'Bodega de Superficie',notes:'Registro completo para inventario offline',syncState:'synced'}))};
  assert.ok(JSON.stringify(snapshot).length>10000000);
  await c.api.write(snapshot);
  assert.deepEqual(clone(await setup({factory:c.factory,rows:c.rows}).api.read()),snapshot);
  assert.equal(c.rows.size,0);
});
test('queued writes capture their own snapshot and resolve only after commit',async()=>{
  const c=setup();await c.api.read();const data=clone(pending);
  const first=c.api.write(data);data.blendingDeliveries.push({id:'second',syncState:'pending'});
  const second=c.api.write(data);data.blendingDeliveries.push({id:'not-saved'});
  await Promise.all([first,second]);
  assert.deepEqual(clone((await c.api.read()).blendingDeliveries.map(r=>r.id)),['unsent','second']);
});
test('corrupt legacy data is retained and blocks overwriting',async()=>{
  const c=setup({initial:{skPlazaData:'broken-json'}});
  await assert.rejects(c.api.read(),/conservó intacta/);
  await assert.rejects(c.api.write({}),/conservó intacta/);
  assert.equal(c.rows.get('skPlazaData'),'broken-json');
});
test('unavailable IndexedDB preserves the previous storage',async()=>{
  const raw=JSON.stringify(pending),c=setup({initial:{skPlazaData:raw},factory:{open(){throw new Error('blocked')}}});
  await assert.rejects(c.api.read(),/blocked/);
  assert.equal(c.rows.get('skPlazaData'),raw);
});
test('aborted transactions preserve the last confirmed state and the queue can retry',async()=>{
  const c=setup();await c.api.read();await c.api.write(pending);
  const original=IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction=function(...args){const tx=original.apply(this,args);if(args[1]==='readwrite')tx.abort();return tx};
  try{await assert.rejects(c.api.write({changed:true}))}finally{IDBDatabase.prototype.transaction=original}
  assert.deepEqual(clone(await c.api.read()),pending);
  await c.api.write({...pending,retry:true});assert.equal((await c.api.read()).retry,true);
});
test('two open windows cannot silently overwrite each other',async()=>{
  const a=setup();await a.api.read();const b=setup({factory:a.factory});await b.api.read();
  await a.api.write(pending);
  await assert.rejects(b.api.write({empty:true}),/otra ventana/);
  assert.deepEqual(clone(await b.api.read()),pending);
});
test('interrupted migration keeps the old copy until a later verified restart',async()=>{
  const raw=JSON.stringify(pending),c=setup({initial:{skPlazaData:raw}}),original=IDBDatabase.prototype.transaction;
  let interrupted=false;
  IDBDatabase.prototype.transaction=function(...args){const tx=original.apply(this,args);if(args[1]==='readonly'&&!interrupted){interrupted=true;tx.abort()}return tx};
  try{await assert.rejects(c.api.read())}finally{IDBDatabase.prototype.transaction=original}
  assert.equal(c.rows.get('skPlazaData'),raw);
  const resumed=setup({factory:c.factory,rows:c.rows});
  assert.deepEqual(clone(await resumed.api.read()),pending);
  assert.equal(c.rows.has('skPlazaData'),false);
});
test('new pending records from an old open version are protected, not discarded',async()=>{
  const c=setup();await c.api.read();await c.api.write(pending);
  const legacy={...pending,blendingDeliveries:[...pending.blendingDeliveries,{id:'old-window-new-row',syncState:'pending'}]};
  c.rows.set('skPlazaData',JSON.stringify(legacy));
  const recovered=await setup({factory:c.factory,rows:c.rows}).api.read();
  assert.equal(c.rows.has('skPlazaData'),false);
  assert.deepEqual(clone(recovered.blendingDeliveries.map(row=>row.id)),['unsent','old-window-new-row']);
  assert.equal((await c.api.read()).blendingDeliveries.length,2);
});
function client(){
  const c=setup(),nodes=new Map(),alerts=[];
  const node=()=>({value:'',hidden:false,textContent:'',dataset:{},classList:{add(){},remove(){}},setAttribute(){},removeAttribute(){},addEventListener(){}});
  Object.assign(c.ctx,{document:{hidden:false,querySelector(s){if(!nodes.has(s))nodes.set(s,node());return nodes.get(s)}},sessionStorage:{getItem:k=>k==='skPlazaToken'?'test':k==='skPlazaUser'?JSON.stringify({documento:'operator'}):null},console,crypto:require('node:crypto').webcrypto,alert:msg=>alerts.push(msg),setTimeout(){return 1},clearTimeout(){},Event:class{},navigator:{onLine:true},localStorage:{...c.localStorage,setItem:(k,v)=>{if(k==='skPlazaData')throw new Error('legacy storage write');c.rows.set(k,v)}}});
  Object.assign(c.ctx.window,{alert:msg=>alerts.push(msg),addEventListener(){},dispatchEvent(){},SK_SYNC_CONFIG:{apiUrl:'test'}});
  const source=read('plaza/plaza.js').split('  injectItemSearchStyle();setupDeliveryForm();')[0];
  vm.runInContext(source+'\nrender=()=>{};window.audit={sync,get:()=>data,set:value=>{data=value;appReady=true},post:fn=>{post=fn},saveDeliveryBatch,saveIncomeBatch,prepareDelivery:rows=>{deliveryDraft=rows;validateDeliveryRecipient=()=>true;movementShift=()=>({});discardDeliveryForm=()=>{};renderRecentQueries=()=>{}},prepareIncome:rows=>{incomeDraft=rows;validateIncomeCollaborator=()=>true;movementShift=()=>({});discardIncomeForm=()=>{};renderRecentQueries=()=>{}}};})();',c.ctx);
  return{...c,nodes,alerts,audit:c.ctx.window.audit};
}
const snapshot=()=>({personal:[],inventoryCriteria:[],inventoryStock:[],assets:[],blendingIncomes:[],blendingDeliveries:[]});
test('full sync waits for the database commit before updating the last-sync time',async()=>{
  const c=client();await c.api.read();c.audit.set(snapshot());
  const remote={...snapshot(),assets:Array.from({length:15000},(_,i)=>({id:'AF-'+i,syncState:'synced'}))};
  c.audit.post(async()=>({ok:true,data:remote}));
  assert.equal(await c.audit.sync(false),true);
  assert.equal((await c.api.read()).assets.length,15000);
  assert.ok(c.rows.has('skPlazaLastSync'));
  assert.equal(c.nodes.get('#syncBtn').disabled,false);
});
test('a record saved during the database commit stays pending after synchronization',async()=>{
  const c=client();await c.api.read();c.audit.set(snapshot());
  c.audit.post(async()=>({ok:true,data:snapshot()}));
  const write=c.api.write;let first=true;
  c.api.write=async data=>{
    await write(data);
    if(first){first=false;const current=c.audit.get();current.blendingDeliveries.push({id:'created-during-commit',syncState:'pending'});await write(current)}
  };
  assert.equal(await c.audit.sync(false),false);
  assert.equal(c.audit.get().blendingDeliveries[0].id,'created-during-commit');
  assert.equal((await c.api.read()).blendingDeliveries[0].syncState,'pending');
  assert.equal(c.rows.has('skPlazaLastSync'),false);
});
test('offline sync retains pending data without a server request',async()=>{
  const c=client();await c.api.read();await c.api.write(pending);c.audit.set(clone(pending));c.ctx.navigator.onLine=false;
  let calls=0;c.audit.post(async()=>{calls++;throw new Error('offline')});
  assert.equal(await c.audit.sync(false),false);assert.equal(calls,0);
  assert.deepEqual(clone(await c.api.read()),pending);
});
const formSeed=()=>({...snapshot(),personal:[{id:'person',nombre:'Colaborador',documento:'123'}],inventoryCriteria:[{id:'gloves',name:'Guantes'}],inventoryStock:[{id:'stock',itemId:'gloves',quantity:10}]});
const draft={itemId:'gloves',itemName:'Guantes',quantity:2,deliveryType:'ASIGNACIÓN'};
function batchForm(income=false){const button={disabled:false};return{button,elements:{recipientCompany:{value:'SK'},recipientId:{value:'person'},broughtById:{value:'person'},itemId:{value:''}},querySelector:()=>button}}
test('delivery confirms only after the offline transaction commits; a failed save can retry without duplicates',async()=>{
  const c=client(),seed=formSeed();await c.api.read();await c.api.write(seed);c.audit.set(clone(seed));c.audit.prepareDelivery([clone(draft)]);
  const form=batchForm(),write=c.api.write;let release;
  const gate=new Promise(resolve=>{release=resolve});
  c.api.write=async value=>{await gate;return write(value)};
  const result=c.audit.saveDeliveryBatch(form);
  assert.equal(form.button.disabled,true);assert.equal(c.alerts.length,0);
  assert.equal(c.audit.get().blendingDeliveries.length,0);
  release();assert.equal(await result,true);
  assert.equal((await c.api.read()).blendingDeliveries[0].syncState,'pending');
  assert.equal((await c.api.read()).inventoryStock[0].quantity,8);
  assert.ok(c.alerts.some(message=>message.startsWith('ENTREGA REGISTRADA')));
  // A new draft fails without touching either memory or the previously committed database.
  c.audit.prepareDelivery([clone(draft)]);c.alerts.length=0;
  c.api.write=async()=>{throw new Error('simulated transaction failure')};
  assert.equal(await c.audit.saveDeliveryBatch(form),false);
  assert.equal(c.audit.get().blendingDeliveries.length,1);
  assert.equal((await c.api.read()).blendingDeliveries.length,1);
  assert.ok(c.alerts.every(message=>!message.startsWith('ENTREGA REGISTRADA')));
  c.api.write=write;
  assert.equal(await c.audit.saveDeliveryBatch(form),true);
  assert.equal((await c.api.read()).blendingDeliveries.length,2);
});
test('income is available offline only after its local commit, with draft preserved on failure',async()=>{
  const c=client(),seed=formSeed();await c.api.read();await c.api.write(seed);c.audit.set(clone(seed));c.audit.prepareIncome([clone(draft)]);
  c.ctx.window.SKAssetMarking={saved:()=>false};
  const form=batchForm(true),write=c.api.write;
  c.api.write=async()=>{throw new Error('simulated transaction failure')};
  assert.equal(await c.audit.saveIncomeBatch(form),false);
  assert.equal(c.audit.get().blendingIncomes.length,0);
  assert.equal((await c.api.read()).blendingIncomes.length,0);
  c.api.write=write;assert.equal(await c.audit.saveIncomeBatch(form),true);
  assert.equal((await c.api.read()).blendingIncomes[0].syncState,'pending');
  assert.ok(c.alerts.some(message=>message.startsWith('INGRESO REGISTRADO')));
});
test('late legacy movements are imported once, keeping stock and confirmed rows consistent',async()=>{
  const seed={...formSeed(),blendingDeliveries:[{id:'confirmed',itemId:'gloves',quantity:1,syncState:'synced',updatedAt:'2026-11-06T20:00:00Z'}]};
  const c=setup();await c.api.read();await c.api.write(seed);
  const legacy={...seed,blendingDeliveries:[{...seed.blendingDeliveries[0],syncState:'pending'},{id:'late',itemId:'gloves',quantity:2,syncState:'pending',updatedAt:'2026-11-06T21:00:00Z'}]};
  c.rows.set('skPlazaData',JSON.stringify(legacy));
  const recovered=setup({factory:c.factory,rows:c.rows});const data=await recovered.api.read();
  assert.equal(data.inventoryStock[0].quantity,8);
  assert.equal(data.blendingDeliveries.find(row=>row.id==='confirmed').syncState,'synced');
  assert.equal(data.blendingDeliveries.find(row=>row.id==='late').syncState,'pending');
  c.rows.set('skPlazaData',JSON.stringify(legacy));
  const again=await setup({factory:c.factory,rows:c.rows}).api.read();
  assert.equal(again.inventoryStock[0].quantity,8);
  assert.equal(again.blendingDeliveries.length,2);
});
