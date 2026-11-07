const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function setup(initial={},limit=Infinity){
  const rows=new Map(Object.entries(initial));
  const localStorage={getItem:key=>rows.get(key)??null,setItem(key,value){
    const size=[...rows].filter(([k])=>k!==key).reduce((n,[k,v])=>n+k.length+v.length,0)+key.length+value.length;
    if(size>limit){const e=new Error('The quota has been exceeded.');e.name='QuotaExceededError';throw e}
    rows.set(key,value);
  }};
  const ctx=vm.createContext({window:{},localStorage});
  for(const name of ['lz-string.js','local-data.js'])vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../plaza',name),'utf8'),ctx);
  return{api:ctx.window.SKPlazaLocal,rows,ctx,localStorage};
}
test('large snapshot fits quota and survives reopening without losing pending records',()=>{
  const previous={personal:[{id:'P',nombre:'José Peña 🛠️',syncState:'pending'}],blendingDeliveries:[{id:'pending',quantity:2,syncState:'pending'}]};
  const next={...previous,assets:Array.from({length:12000},(_,i)=>({id:'AF-'+i,clase:'Taladro',serial:'SERIAL-'+i,ubicacion:'Bodega de Superficie',syncState:'synced'}))};
  const initial={skPlazaData:JSON.stringify(previous),admin:'keep this account'};
  const {api,rows}=setup(initial,180000);
  assert.deepEqual(JSON.parse(JSON.stringify(api.read())),previous);
  assert.ok(JSON.stringify(next).length>180000);
  api.write(next);
  const reopened=setup(Object.fromEntries(rows),180000);
  assert.deepEqual(JSON.parse(JSON.stringify(reopened.api.read())),next);
  assert.equal(rows.get('admin'),initial.admin);
  console.log('Snapshot characters:',JSON.stringify(next).length,'stored:',rows.get('skPlazaData').length);
});
test('failed write preserves the previous snapshot and other applications',()=>{
  const before=JSON.stringify({blendingDeliveries:[{id:'unsent',syncState:'pending'}]});
  const {api,rows}=setup({skPlazaData:before,admin:'untouched'},100);
  assert.throws(()=>api.write({records:Array.from({length:500},(_,i)=>({id:i,value:String(i*i)}))}),/almacenamiento local sigue lleno/);
  assert.equal(rows.get('skPlazaData'),before);
  assert.equal(rows.get('admin'),'untouched');
});
test('corrupt local data cannot be overwritten or removed',()=>{
  const {api,rows}=setup({skPlazaData:'broken-json'});
  assert.throws(()=>api.read(),/conservó intacta/);
  assert.throws(()=>api.write({}),/protegida/);
  assert.equal(rows.get('skPlazaData'),'broken-json');
});
test('actual synchronization saves a snapshot exceeding the old quota and confirms success',async()=>{
  const {ctx,rows,api,localStorage}=setup({},180000),nodes=new Map();
  const node=()=>({value:'',hidden:false,textContent:'',dataset:{},classList:{add(){},remove(){}},setAttribute(){},removeAttribute(){},addEventListener(){}});
  Object.assign(ctx,{document:{hidden:false,querySelector(s){if(!nodes.has(s))nodes.set(s,node());return nodes.get(s)}},sessionStorage:{getItem:k=>k==='skPlazaToken'?'test':k==='skPlazaUser'?JSON.stringify({documento:'operator'}):null},localStorage,navigator:{onLine:true},console,crypto:{},alert(){},setTimeout(){return 1},clearTimeout(){},Event:class{}});
  Object.assign(ctx.window,{alert(){},addEventListener(){},dispatchEvent(){},SK_SYNC_CONFIG:{apiUrl:'test'}});
  const snapshot={personal:[],inventoryCriteria:[],inventoryStock:[],assets:Array.from({length:12000},(_,i)=>({id:'AF-'+i,clase:'Taladro',syncState:'synced'})),blendingIncomes:[],blendingDeliveries:[{id:'saved',syncState:'synced'}]};
  const source=fs.readFileSync(require('node:path').join(__dirname,'../plaza/plaza.js'),'utf8').split('  injectItemSearchStyle();setupDeliveryForm();')[0];
  vm.runInContext(source+'\nrender=()=>{};window.audit={sync,set:value=>{data=value},post:fn=>{post=fn}};})();',ctx);
  ctx.window.audit.set({personal:[],assets:[],blendingIncomes:[],blendingDeliveries:[]});
  ctx.window.audit.post(async()=>({ok:true,data:snapshot}));
  assert.equal(await ctx.window.audit.sync(false),true);
  assert.equal(api.read().assets.length,12000);
  assert.ok(rows.has('skPlazaLastSync'));
  assert.equal(nodes.get('#syncBtn').disabled,false);
});
