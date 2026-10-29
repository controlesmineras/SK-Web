const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../plaza/plaza.js'),'utf8').split('  injectItemSearchStyle();setupDeliveryForm();')[0];
function client(){
 const nodes=new Map(),alerts=[],downloads=[],radios=['all','epp','assets'].map(value=>({value,checked:value==='all'}));
 const blank=()=>({value:'',textContent:'',innerHTML:'',addEventListener(){}});
 const node=key=>{if(!nodes.has(key))nodes.set(key,blank());return nodes.get(key)};
 for(const kind of ['delivery','income']){
  const label={classList:{contains:()=>false},_refreshItemSearch(){},_clearItemSearch(){select.value=''}},select={value:'',innerHTML:'',closest:()=>label};
  nodes.set('#'+kind+'HistoryQueryForm',{elements:{itemId:select}});
  node('#'+kind+'DateFrom').value='2026-10-01';node('#'+kind+'DateTo').value='2026-10-02';
 }
 const data={personal:[{id:'p',nombre:'Persona de prueba',documento:'1',empresa:'SK',area:'Producción'},{id:'op',nombre:'Bodega de prueba',documento:'2'}],assets:[],inventoryStock:[],inventoryCriteria:[{id:'b4',name:'Barreno 4 ft'},{id:'b6',name:'Barreno 6 ft'},{id:'epp',name:'Guantes',isEpp:true},{id:'asset',name:'Taladro',isFixedAsset:true}],blendingDeliveries:[],blendingIncomes:[]};
 const row=(id,itemId,date,extra={})=>({id,itemId,itemName:data.inventoryCriteria.find(x=>x.id===itemId)?.name,quantity:2,createdAt:date,recipientId:'p',broughtById:'p',operatorId:'op',operatorDocument:'2',notes:id,...extra});
 for(const [kind,store] of [['delivery','blendingDeliveries'],['income','blendingIncomes']])data[store]=[
  row(kind+'-start','b4','2026-10-01T00:00:00'),row(kind+'-end','b4','2026-10-02T23:59:59.999'),row(kind+'-other','b6','2026-10-02T12:00:00'),
  row(kind+'-old','b4','2026-09-01T12:00:00'),row(kind+'-later','b4','2026-10-03T00:00:00'),row(kind+'-deleted','b4','2026-10-02T12:00:00',{deleted:true}),
  row(kind+'-pending','b4','2026-10-02T14:00:00',{syncState:'pending'}),row(kind+'-reversed','b4','2026-10-02T13:00:00',{reversed:true}),
  row(kind+'-reversal','b4','2026-10-02T15:00:00',{movementType:'REVERSIÓN',originalCreatedAt:'2026-10-02T13:00:00',balanceBefore:5,balanceAfter:7,stockDelta:2}),
  row(kind+'-return','b4','2026-10-02T16:00:00',{movementType:'DEVOLUCIÓN'}),row(kind+'-legacy',undefined,'2026-10-02T10:00:00',{itemName:'BÁRRENO 4 FT'}),
  row(kind+'-different-id','b6','2026-10-02T11:00:00',{itemName:'Barreno 4 ft'}),row(kind+'-bad-date','b4','invalid'),
  row(kind+'-epp','epp','2026-10-02T11:00:00'),row(kind+'-asset','asset','2026-10-02T11:00:00')
 ];
 const ctx=vm.createContext({Blob,console,alert:message=>alerts.push(message),document:{querySelector:key=>key==='#deliveryCategoryFilter input[value="all"]'?radios[0]:node(key),querySelectorAll:key=>key==='#deliveryCategoryFilter input'?radios:[]},window:{alert:message=>alerts.push(message)},sessionStorage:{getItem:()=>null},localStorage:{getItem:()=>null},setTimeout(){},clearTimeout(){},crypto:{}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../asset-record-rules.js'),'utf8'),ctx);
 vm.runInContext(source+`\ndownloadBlob=(blob,name)=>window.capture(blob,name);window.audit={set:value=>{data=value},rows:recentQueryRows,render:renderRecentQueries,reset:resetRecentFilters,excel:exportMovementExcel,pdf:exportMovementPdf};})();`,ctx);
 ctx.window.capture=(blob,name)=>downloads.push({blob,name});ctx.window.audit.set(data);
 return{api:ctx.window.audit,data,node,alerts,downloads,select(kind,id){node('#'+kind+'HistoryQueryForm').elements.itemId.value=id},category(value){radios.forEach(r=>r.checked=r.value===value)}};
}
test('exact catalog IDs and inclusive dates apply independently to deliveries and incomes',()=>{
 const c=client(),before=JSON.stringify(c.data);
 for(const kind of ['delivery','income']){
  c.select(kind,'b4');const ids=Array.from(c.api.rows(kind),r=>r.id);
  for(const suffix of ['start','end','pending','reversed','reversal','legacy'])assert.ok(ids.includes(kind+'-'+suffix),suffix);
  for(const suffix of ['other','old','later','deleted','different-id','bad-date'])assert.ok(!ids.includes(kind+'-'+suffix),suffix);
  assert.equal(ids.includes(kind+'-return'),kind==='income');
 }
 assert.equal(JSON.stringify(c.data),before,'consulting does not change movements, pending data or balances');
 c.select('delivery','b6');assert.ok(c.api.rows('delivery').every(r=>r.itemId==='b6'));assert.ok(c.api.rows('income').every(r=>r.itemId==='b4'||!r.itemId));
});
test('time, category, historical ranges, all elements and inverted dates compose with the element filter',()=>{
 const c=client();c.select('delivery','b4');c.node('#deliveryTimeFrom').value='12:00';c.node('#deliveryDateFrom').value='2026-10-02';c.node('#deliveryTimeTo').value='14:00';
 assert.deepEqual(Array.from(c.api.rows('delivery'),r=>r.id),['delivery-pending','delivery-reversed']);
 c.category('epp');assert.equal(c.api.rows('delivery').length,0);c.select('delivery','');assert.deepEqual(Array.from(c.api.rows('delivery'),r=>r.id),[]);
 c.node('#deliveryTimeFrom').value='';assert.deepEqual(Array.from(c.api.rows('delivery'),r=>r.id),['delivery-epp']);
 c.category('assets');assert.deepEqual(Array.from(c.api.rows('delivery'),r=>r.id),['delivery-asset']);
 c.category('all');c.select('income','b4');c.node('#incomeDateFrom').value='2026-09-01';c.node('#incomeDateTo').value='2026-09-01';assert.deepEqual(Array.from(c.api.rows('income'),r=>r.id),['income-old']);
 c.node('#incomeDateFrom').value='2026-10-03';assert.equal(c.api.rows('income').length,0);c.api.render();assert.match(c.node('#recentIncomesCount').textContent,/fecha inicial/);
 c.api.excel('income');assert.equal(c.downloads.length,0);assert.match(c.alerts.at(-1),/No hay ingresos/);
});
test('cards, Excel and PDF share the selected rows and retain reversal information',async()=>{
 const c=client();
 for(const kind of ['delivery','income']){
  c.select(kind,'b4');c.api.render();const list=c.node(kind==='delivery'?'#recentDeliveriesList':'#recentIncomesList').innerHTML;
  assert.match(list,/Barreno 4 ft/);assert.doesNotMatch(list,/Barreno 6 ft/);assert.match(list,/REVERSADO/);assert.match(list,/REVERSIÓN/);
  c.api.excel(kind);const excel=c.downloads.at(-1),xml=await excel.blob.text();
  assert.match(excel.name,/_barreno_4_ft\.xls$/);assert.equal((xml.match(/<Row[ >]/g)||[]).length,c.api.rows(kind).length+1);
  assert.match(xml,new RegExp(kind+'-start'));assert.match(xml,new RegExp(kind+'-end'));assert.doesNotMatch(xml,new RegExp(kind+'-other'));assert.doesNotMatch(xml,new RegExp(kind+'-old'));assert.doesNotMatch(xml,new RegExp(kind+'-deleted'));assert.match(xml,/REVERSADO/);
  if(kind==='income'){assert.match(xml,/QUIÉN TRAE/);assert.match(xml,/RECIBIÓ/);assert.match(xml,/Persona de prueba/);assert.doesNotMatch(xml,/TRAE REPOSICIÓN/)}
  c.api.pdf(kind);const pdf=c.downloads.at(-1),text=await pdf.blob.text();assert.match(pdf.name,/_barreno_4_ft\.pdf$/);assert.ok(text.startsWith('%PDF-1.4'));assert.match(text,new RegExp('REGISTROS: '+c.api.rows(kind).length));assert.match(text,/BARRENO 4 FT/);assert.doesNotMatch(text,new RegExp(kind+'-other'));assert.match(text,/REVERSADO/);
  if(process.env.PLAZA_QA_OUTPUT){fs.mkdirSync(process.env.PLAZA_QA_OUTPUT,{recursive:true});fs.writeFileSync(path.join(process.env.PLAZA_QA_OUTPUT,pdf.name),Buffer.from(await pdf.blob.arrayBuffer()));fs.writeFileSync(path.join(process.env.PLAZA_QA_OUTPUT,excel.name),xml)}
 }
});
test('clearing restores each default date range and removes the selected element and times',()=>{
 const c=client();c.category('epp');
 for(const kind of ['delivery','income']){c.select(kind,'b4');c.node('#'+kind+'TimeFrom').value='12:00';c.api.reset(kind);assert.equal(c.node('#'+kind+'HistoryQueryForm').elements.itemId.value,'');assert.equal(c.node('#'+kind+'TimeFrom').value,'');assert.equal(c.node('#'+kind+'TimeTo').value,'');const start=new Date(c.node('#'+kind+'DateFrom').value+'T12:00:00'),end=new Date(c.node('#'+kind+'DateTo').value+'T12:00:00');assert.equal(Math.round((end-start)/86400000),kind==='delivery'?6:29)}
});
