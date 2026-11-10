const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {randomUUID}=require('node:crypto');
const {indexedDB}=require('fake-indexeddb');
const app=fs.readFileSync('produccion/app.js','utf8');
async function database(){
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open(randomUUID(),1);
  request.onupgradeneeded=()=>request.result.createObjectStore('accounts');
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
 });
}
async function context(){
 const db=await database();
 const ctx=vm.createContext({database:Promise.resolve(db)});
 vm.runInContext(app.slice(app.indexOf('async function changeState('),app.indexOf('async function api(')),ctx);
 return ctx;
}
test('transaction errors surface and do not erase previously saved offline data',async()=>{
 const c=await context();
 await c.changeState('account',()=>({pending:[{id:'first',cantidad:4}]}));
 await assert.rejects(c.changeState('account',()=>{throw new Error('Falló el guardado')}),/Falló/);
 assert.equal((await c.changeState('account')).pending[0].cantidad,4);
 await c.changeState('account',current=>({...current,pending:[...current.pending,{id:'second',cantidad:2}]}));
 assert.equal((await c.changeState('account')).pending.length,2);
});
test('double tap on a new offline draft creates one record, edits replace it, zero survives reload',async()=>{
 const c=await context();
 Object.assign(c,{session:{user:{document:'account'}},state:{inventoryCounts:[],countQueue:[]},countSaving:false,countReport:null,countSelection:'',countDirty:true,countEditRevision:'',countValues:new Map([['part',0]]),
  countFields:{date:{value:'10/11/2026'},origin:{value:'YT29'}},navigator:{onLine:false},crypto:{randomUUID},canCount:()=>true,readDate:()=> '2026-11-10',today:()=> '2026-11-10',paintCount(){},paintSync(){},countStatus:message=>{throw new Error(message)}});
 await c.changeState('account',()=>c.state);
 c.selectedCount=()=>c.state.countQueue.find(row=>row.id===c.countSelection);
 vm.runInContext(app.slice(app.indexOf('async function queueCount('),app.indexOf('countForm.onsubmit=')),c);
 await Promise.all([c.queueCount('save'),c.queueCount('save')]);
 const first=await c.changeState('account');
 assert.equal(first.countQueue.length,1);
 const id=first.countQueue[0].id;
 assert.equal(first.countQueue[0].values[0].physical,0);
 c.countValues=new Map([['part',4]]);c.countDirty=true;
 await c.queueCount('save');
 const second=await c.changeState('account');
 assert.equal(second.countQueue.length,1);assert.equal(second.countQueue[0].id,id);
 assert.equal(second.countQueue[0].values[0].physical,4);
});
test('sync keeps a movement saved while an earlier request is in flight',async()=>{
 const c=await context();
 const initial={id:'one',cantidad:2},later={id:'two',cantidad:3};
 await c.changeState('account',()=>({pending:[initial]}));
 const active={user:{document:'account'}};
 let calls=0;
 Object.assign(c,{session:active,state:await c.changeState('account'),navigator:{onLine:true},canSync:()=>true,syncing:false,syncRequested:false,syncFailed:false,countSelection:'',countDirty:false,countSaving:false,
  paintSync(){},paint(){},status(){},console,
  api:async(action,{pending})=>{
   calls++;
   if(calls===1)await c.changeState('account',current=>({...current,pending:[...current.pending,later]}));
   return {incomes:[],consumptions:calls===1?[initial]:[initial,later],ack:pending.map(row=>row.id),inventoryCounts:[],inventoryLatest:[]};
  }});
 vm.runInContext(app.slice(app.indexOf('async function sync(){'),app.indexOf('function showConsumptionView(')),c);
 await c.sync();
 assert.equal(calls,2);assert.equal((await c.changeState('account')).pending.length,0);
 assert.equal(c.syncFailed,false);
});
test('a server that echoes an ID without the corrected amount cannot mark it synced',async()=>{
 const c=await context();
 const request={id:'one',kind:'adjustment',cantidad:4};
 await c.changeState('account',()=>({pending:[request]}));
 Object.assign(c,{session:{user:{document:'account'}},state:await c.changeState('account'),navigator:{onLine:true},canSync:()=>true,syncing:false,syncRequested:false,syncFailed:false,
  paintSync(){},paint(){},status(){},console:{error(){}},api:async()=>({incomes:[{id:'one',kind:'adjustment',cantidad:0,target:24}],consumptions:[],ack:['one']})});
 vm.runInContext(app.slice(app.indexOf('async function sync(){'),app.indexOf('function showConsumptionView(')),c);
 await c.sync();
 assert.equal((await c.changeState('account')).pending.length,1);assert.equal(c.syncFailed,true);
});
test('inventory export creates a readable XLSX with numeric zero and safe XML text',async()=>{
 let blob,filename;
 const src=fs.readFileSync('consumption-query-v2.js','utf8');
 const c=vm.createContext({Blob,TextEncoder,Uint8Array,window:{},URL:{createObjectURL:value=>{blob=value;return 'blob:test'},revokeObjectURL(){}},document:{body:{append(){}},createElement:()=>({click(){filename=this.download},remove(){}})},setTimeout(){}});
 vm.runInContext(src.slice(src.indexOf('function xml('),src.indexOf('const productionDates=')),c);
 c.downloadTableExcel([['REPUESTO','SALDO DE CIERRE'],['O-ring & sello',0]],'inventario.xlsx');
 assert.equal(filename,'inventario.xlsx');
 const buffer=Buffer.from(await blob.arrayBuffer()),files=new Map();let offset=0;
 while(buffer.readUInt32LE(offset)===0x04034b50){
  const size=buffer.readUInt32LE(offset+18),nameLength=buffer.readUInt16LE(offset+26),extra=buffer.readUInt16LE(offset+28);
  const name=buffer.subarray(offset+30,offset+30+nameLength).toString();
  const start=offset+30+nameLength+extra;files.set(name,buffer.subarray(start,start+size).toString());offset=start+size;
 }
 assert.ok(files.has('[Content_Types].xml'));
 const sheet=files.get('xl/worksheets/sheet1.xml');
 assert.match(sheet,/O-ring &amp; sello/);assert.match(sheet,/<c r="B2"><v>0<\/v><\/c>/);
 assert.doesNotMatch(sheet,/mergeCell/);
});
