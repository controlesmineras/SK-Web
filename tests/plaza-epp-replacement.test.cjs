const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8'),clone=x=>JSON.parse(JSON.stringify(x));
const seed=()=>({personal:[{id:'person',nombre:'Persona de prueba',documento:'123'}],assets:[],inventoryCriteria:[{id:'gloves',name:'Guantes',isEpp:true,unit:'Par'},{id:'helmet',name:'Casco',isEpp:true,unit:'Unidad'},{id:'tool',name:'Herramienta',isEpp:false}],inventoryStock:['gloves','helmet','tool'].map(itemId=>({id:'stock-'+itemId,itemId,quantity:10})),blendingDeliveries:[],blendingIncomes:[]});
function client(){
 const nodes=new Map(),storage=new Map(),alerts=[],inputs=['yes','no'].map(value=>({value,checked:false,required:false}));
 const field={dataset:{},style:{},hidden:true,disabled:true,querySelectorAll:()=>inputs};
 const button={disabled:false},form={elements:Object.fromEntries(['itemId','assetId','quantity','destination','destinationLevel','notes','recipientId','recipientCompany'].map(name=>[name,{value:'',dataset:{}}])),querySelector:()=>button};
 form.elements.quantity.value='1';form.elements.recipientId.value='person';form.elements.recipientCompany.value='SK';
 form.elements.bringsReplacement={get value(){return inputs.find(input=>input.checked)?.value||''}};
 nodes.set('#deliveryForm',form);nodes.set('#deliveryReplacementField',field);
 const ctx=vm.createContext({Blob,console,crypto:require('node:crypto').webcrypto,document:{querySelectorAll:()=>[],querySelector:key=>{if(!nodes.has(key))nodes.set(key,{value:'',hidden:false,textContent:'',addEventListener(){}});return nodes.get(key)}},alert:message=>alerts.push(message),window:{alert:message=>alerts.push(message)},sessionStorage:{getItem:()=>null},localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},setTimeout(){},clearTimeout(){}});
 const start=read('plaza/plaza.js').split('  injectItemSearchStyle();setupDeliveryForm();')[0];
 vm.runInContext(start+`\nvalidateDeliveryRecipient=()=>true;renderRecentQueries=()=>{};updatePendingBadge=()=>{};discardDeliveryForm=()=>{};sync=()=>{};clearItemSearch=form=>{form.elements.itemId.value=''};updateDeliveryFields=()=>updateDeliveryReplacementField(findItem($('#deliveryForm').elements.itemId.value));downloadBlob=(blob,name)=>window.lastDownload={blob,name};window.audit={get:()=>data,set:value=>{data=value},draft:()=>deliveryDraft,prepare:rows=>{deliveryDraft=rows},update:()=>updateDeliveryFields(),capture:currentDeliveryItem,add:addDeliveryItem,save:()=>saveDeliveryBatch($('#deliveryForm')),label:deliveryReplacementLabel,report:deliveryReportRow,card:queryMovementCard,excel:exportDeliveriesExcel,pdf:exportDeliveriesPdf};})();`,ctx);
 const api=ctx.window.audit;api.set(seed());
 return {api,ctx,form,field,inputs,storage,alerts,select(id){form.elements.itemId.value=id;api.update()},answer(value){inputs.forEach(input=>input.checked=input.value===value)}};
}
test('EPP requires an explicit answer and changing items clears it',()=>{
 const c=client();c.select('gloves');assert.equal(c.field.hidden,false);assert.equal(c.field.disabled,false);assert.ok(c.inputs.every(i=>i.required&&!i.checked));
 c.answer('yes');c.api.update();assert.equal(c.form.elements.bringsReplacement.value,'yes');
 c.select('helmet');assert.equal(c.form.elements.bringsReplacement.value,'');
 c.answer('no');c.select('tool');assert.equal(c.field.hidden,true);assert.equal(c.field.disabled,true);assert.ok(c.inputs.every(i=>!i.required&&!i.checked));
 c.select('gloves');assert.equal(c.form.elements.bringsReplacement.value,'');
});
test('capture rejects missing answers; YES and NO remain distinct; non-EPP has no field',()=>{
 const c=client();c.select('gloves');assert.equal(c.api.capture(),null);assert.match(c.alerts.at(-1),/TRAE REPOSICIÓN/);
 c.answer('yes');assert.equal(c.api.capture().bringsReplacement,true);c.answer('no');assert.equal(c.api.capture().bringsReplacement,false);
 c.select('tool');assert.equal(Object.hasOwn(c.api.capture(),'bringsReplacement'),false);
});
test('adding multiple items preserves each answer and clears the next item',()=>{
 const c=client();c.select('gloves');c.answer('yes');c.api.add();assert.equal(c.api.draft()[0].bringsReplacement,true);assert.equal(c.form.elements.bringsReplacement.value,'');assert.equal(c.field.hidden,true);
 c.select('helmet');c.answer('no');c.api.add();assert.equal(c.api.draft()[1].bringsReplacement,false);assert.equal(c.form.elements.bringsReplacement.value,'');
 c.select('tool');c.api.add();assert.equal(Object.hasOwn(c.api.draft()[2],'bringsReplacement'),false);
});
test('batch validation blocks an unanswered EPP before changing stock or saving',async()=>{
 const c=client(),before=clone(c.api.get());c.api.prepare([{itemId:'gloves',itemName:'Guantes',quantity:1}]);assert.equal(await c.api.save(),false);assert.deepEqual(clone(c.api.get()),before);assert.equal(c.storage.size,0);assert.match(c.alerts.at(-1),/TRAE REPOSICIÓN/);
 c.api.prepare([]);c.select('gloves');assert.equal(await c.api.save(),false);assert.deepEqual(clone(c.api.get()),before);
});
test('mixed batch persists boolean NO offline and through the real sync merge',async()=>{
 const c=client();for(const [id,answer] of [['gloves','yes'],['helmet','no'],['tool',null]]){c.select(id);if(answer)c.answer(answer);c.api.add()}
 assert.equal(await c.api.save(),true);const local=JSON.parse(c.storage.get('skPlazaData'));
 assert.deepEqual(local.blendingDeliveries.map(r=>r.bringsReplacement),[true,false,undefined]);assert.ok(local.inventoryStock.every(r=>r.quantity===9));
 let cloud=seed();const ctx=vm.createContext({LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})}});vm.runInContext(read('backend/apps-script/Code.gs'),ctx);
 ctx.findFile_=()=> 'file';ctx.readFile_=()=>clone(cloud);ctx.writeFile_=(_,next)=>{cloud=clone(next)};ctx.json_=clone;ctx.verifyToken_=()=>({document:'operator',role:'plaza_operator'});
 const sync=()=>ctx.plazaSync_({token:'test',syncProtocol:'plaza-receipts-v1',data:{blendingDeliveries:clone(local.blendingDeliveries)}});
 sync();sync();assert.deepEqual(cloud.blendingDeliveries.map(r=>r.bringsReplacement),[true,false,undefined]);assert.ok(cloud.inventoryStock.every(r=>r.quantity===9));
});
test('old records stay unrecorded, and queries and exports preserve the answer',async()=>{
 const c=client(),date=new Date().toISOString(),rows=[true,false,undefined].map((answer,i)=>({id:'r'+i,itemId:'gloves',itemName:'Guantes',recipientId:'person',quantity:1,createdAt:date,...(answer===undefined?{}:{bringsReplacement:answer})}));
 c.api.get().blendingDeliveries=rows;assert.deepEqual(rows.map(c.api.label),['SÍ','NO','Sin registrar']);assert.equal(c.api.label({itemId:'tool'}),'');assert.equal(c.api.label({itemId:'gloves',queryType:'INGRESO'}),'');assert.equal(c.api.label({itemId:'gloves',movementType:'DEVOLUCIÓN'}),'');
 assert.deepEqual(rows.map(r=>c.api.report(r).reposicion),['SÍ','NO','Sin registrar']);for(const row of rows)assert.match(c.api.card({...row,queryType:'ENTREGA'}),/Trae reposición:/);
 c.api.excel();let text=await c.ctx.window.lastDownload.blob.text();assert.match(text,/TRAE REPOSICIÓN/);assert.match(text,/>NO<\/Data>/);assert.match(text,/>Sin registrar<\/Data>/);
 c.api.pdf();text=await c.ctx.window.lastDownload.blob.text();assert.match(text,/Trae reposici/);assert.match(text,/NO/);assert.equal(Object.hasOwn(rows[2],'bringsReplacement'),false);
});
