const {test}=require('node:test');
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');

function formClient(){
  const nodes=new Map(),alerts=[];
  const node=()=>({value:'',dataset:{},style:{},childNodes:[{textContent:''}],options:[],events:[],addEventListener(){},
    dispatchEvent(event){this.events.push(event.type)},querySelectorAll:()=>[],add(option){this.options.push(option)},
    replaceChildren(...options){this.options=options}});
  const query=selector=>{if(!nodes.has(selector))nodes.set(selector,node());return nodes.get(selector)};
  const fields=Object.fromEntries(['itemId','quantity','destination','destinationLevel','notes'].map(name=>[name,node()]));
  fields.quantity.min='0.01';fields.quantity.step='any';fields.quantity.required=true;fields.quantity.value='1';
  fields.assetId=query('#deliveryAssetId');
  fields.itemId.closest=()=>({_clearItemSearch:()=>{fields.itemId.value=''}});
  const form={elements:fields,querySelector:()=>query('#submit')};nodes.set('#deliveryForm',form);
  const ctx=vm.createContext({document:{querySelector:query},window:{alert:message=>alerts.push(message)},
    alert:message=>alerts.push(message),sessionStorage:{getItem:()=>null},localStorage:{getItem:()=>null},
    Event:class {constructor(type){this.type=type}},Option:class {constructor(text,value){this.text=text;this.value=value}},console});
  vm.runInContext(read('asset-history.js'),ctx);vm.runInContext(read('asset-record-rules.js'),ctx);
  const prefix=read('plaza/plaza.js').split('  injectItemSearchStyle();setupDeliveryForm();')[0];
  vm.runInContext(prefix+`\nwindow.testing={selectionLabel:assetSelectionLabel,historyLabel:assetLabel,set:value=>{data=value},mode:value=>{deliveryMode=value},update:updateDeliveryFields,capture:currentDeliveryItem,add:addDeliveryItem,draft:()=>deliveryDraft,recipientChanged:recipientDestinationChanged};})();`,ctx);
  const api=ctx.window.testing,data={
    inventoryCriteria:[{id:'saw',name:'Motosierra',isFixedAsset:true,allowLoan:true},{id:'pliers',name:'Alicates',allowLoan:true},{id:'cable',name:'Cable',allowLoan:true,fractionable:true}],
    assets:[{id:'asset',clase:'Motosierra',serial:'TEST-57951',ubicacion:'Bodega de Superficie'}],
    inventoryStock:[{id:'stock-pliers',itemId:'pliers',quantity:10},{id:'stock-cable',itemId:'cable',quantity:10}]
  };
  api.set(data);api.mode('loan');
  return {api,data,fields,nodes,alerts,select(id){fields.itemId.value=id;api.update()}};
}

test('a specific asset has quantity one without an editable or required quantity field',()=>{
  const c=formClient();c.fields.quantity.value='5';c.select('saw');
  assert.equal(c.nodes.get('#deliveryQuantityField').hidden,true);
  assert.equal(c.fields.quantity.disabled,true);assert.equal(c.fields.quantity.required,false);
  assert.equal(c.fields.quantity.value,'1');assert.equal(c.fields.assetId.required,true);
  c.fields.assetId.value='asset';c.fields.destination.value='Operación';
  assert.equal(c.api.capture().quantity,1);assert.equal(c.api.capture().assetId,'asset');
});

test('adding an asset clears its selection and details without requiring a second quantity',()=>{
  const c=formClient();c.select('saw');c.fields.assetId.value='asset';c.fields.destination.value='Operación';
  c.api.add();
  assert.equal(c.api.draft().length,1);assert.equal(c.api.draft()[0].quantity,1);
  assert.equal(c.fields.itemId.value,'');assert.equal(c.fields.assetId.value,'');
  assert.equal(c.fields.assetId.events.at(-1),'change');
  assert.equal(c.nodes.get('#deliveryQuantityField').hidden,true);
  assert.equal(c.fields.quantity.disabled,true);assert.equal(c.fields.quantity.required,false);
  assert.equal(c.fields.assetId.disabled,true);assert.equal(c.fields.assetId.required,false);
  assert.equal(c.fields.destination.required,false);
  assert.equal(c.data.inventoryStock[0].quantity,10);
});

test('counted tools accept whole units starting at one and reject fractional or excess loans',()=>{
  const c=formClient();c.select('pliers');
  assert.equal(c.nodes.get('#deliveryQuantityField').hidden,false);
  assert.equal(c.fields.quantity.disabled,false);assert.equal(c.fields.quantity.required,true);
  assert.equal(c.fields.quantity.min,'1');assert.equal(c.fields.quantity.step,'1');
  for(const value of ['1','5']){c.fields.quantity.value=value;assert.equal(c.api.capture().quantity,Number(value))}
  for(const value of ['0','1.01','11']){c.fields.quantity.value=value;assert.equal(c.api.capture(),null)}
});

test('switching to a fractionable item restores its decimal quantity control',()=>{
  const c=formClient();c.select('pliers');c.select('cable');c.fields.quantity.value='0.25';
  assert.equal(c.fields.quantity.min,'0.01');assert.equal(c.fields.quantity.step,'any');
  assert.equal(c.api.capture().quantity,0.25);
  c.select('saw');assert.equal(c.fields.quantity.disabled,true);assert.equal(c.fields.quantity.value,'1');
  c.select('cable');assert.equal(c.fields.quantity.disabled,false);
});

test('a mixed draft preserves each quantity and shows the input only for the next counted item',()=>{
  const c=formClient();c.select('saw');c.fields.assetId.value='asset';c.fields.destination.value='Operación';c.api.add();
  c.select('pliers');c.fields.quantity.value='5';c.api.add();
  assert.deepEqual(Array.from(c.api.draft(),row=>row.quantity),[1,5]);
  assert.equal(c.fields.quantity.disabled,true);assert.equal(c.fields.quantity.required,false);
  c.select('pliers');assert.equal(c.fields.quantity.disabled,false);assert.equal(c.fields.quantity.value,'1');
  c.fields.quantity.value='6';assert.equal(c.api.capture(),null);
  assert.deepEqual(c.data.inventoryStock.map(row=>row.quantity),[10,10]);
});

test('assignment also hides quantity for assets and preserves decimal delivery behavior for stock',()=>{
  const c=formClient();c.api.mode('assignment');c.select('saw');
  assert.equal(c.fields.quantity.disabled,true);assert.equal(c.fields.quantity.value,'1');
  c.select('pliers');assert.equal(c.fields.quantity.disabled,false);
  assert.equal(c.fields.quantity.min,'0.01');assert.equal(c.fields.quantity.step,'any');
  c.select('');assert.equal(c.fields.quantity.required,false);assert.equal(c.fields.quantity.disabled,true);
});

test('ARIS MINING is available for loans and assignments and survives a recipient area change',()=>{
  const c=formClient(),destination='A cargo de ARIS MINING';c.select('saw');
  assert.ok(c.fields.destination.options.some(option=>option.value===destination));
  c.fields.destination.value=destination;c.fields.assetId.value='asset';
  assert.equal(c.api.capture().destination,destination);
  c.api.mode('assignment');c.api.update();
  assert.ok(c.fields.destination.options.some(option=>option.value===destination));
  c.fields.destination.value=destination;c.fields.destination.dataset.manualArea='1';c.fields.assetId.value='asset';
  const row=c.api.capture();assert.equal(row.destination,destination);assert.equal(row.destinationAreaMode,'manual');
  c.api.add();c.data.personal=[{id:'person',area:'Producción'}];c.nodes.set('#recipientId',{value:'person'});c.api.recipientChanged();
  assert.equal(c.api.draft()[0].destination,destination);
  c.select('saw');c.api.mode('loan');c.api.update();
  assert.equal(c.fields.destination.options.filter(option=>option.value===destination).length,1);
});

test('the specific asset selector shows manufacturer, serial, new mark and model without the class',()=>{
  const c=formClient(),asset={id:'asset',clase:'Motosierra',numeroClase:'28',fabricante:'Makita',serial:'57951',nuevaMarca:'AAF',marcaPrevia:'SK 3.7',modelo:'UC4051A',ubicacion:'Bodega de Superficie'};
  assert.equal(c.api.selectionLabel(asset),'Makita · 57951 · AAF · UC4051A');
  c.data.assets=[asset];c.select('saw');assert.match(c.fields.assetId.innerHTML,/Makita · 57951 · AAF · UC4051A/);
  assert.doesNotMatch(c.fields.assetId.innerHTML,/Motosierra|N.º|Marca nueva|Marca anterior/);
  assert.match(c.api.historyLabel(asset),/Motosierra/);
});

test('YT, columns and self rescuers fall back to previous marks without inventing a new mark',()=>{
  const c=formClient();
  assert.equal(c.api.selectionLabel({clase:'YT 29',fabricante:'Gisi',serial:'24022637',marcaPrevia:'42',modelo:'29'}),'Gisi · 24022637 · 42 · 29');
  assert.equal(c.api.selectionLabel({clase:'Columna',serial:'SHOULD-NOT-SHOW',marcaAnterior:'15',modelo:'29'}),'15 · 29');
  assert.equal(c.api.selectionLabel({clase:'Autorrescatador',fabricante:'Steel pro',serial:'00123',marcaPrevia:'SK-27',modelo:'Oxypro 50'}),'Steel pro · 00123 · SK-27 · Oxypro 50');
  assert.equal(c.api.selectionLabel({clase:'YT',marcaPrevia:'37',nuevaMarca:'P-AB',modelo:'29'}),'P-AB · 29');
  assert.equal(c.api.selectionLabel({clase:'Pulidora',fabricante:'DEWALT',serial:'No trae',marcaPrevia:'OLD',modelo:'DWE'}),'DEWALT · No trae · DWE');
});

test('ARIS recipient company is visible only for loans and is cleared on switching to assignment',()=>{
  const c=formClient();c.select('saw');
  const field=c.nodes.get('#loanRecipientCompanyField'),input=c.nodes.get('#loanRecipientCompanyInput');
  assert.equal(field.hidden,false);assert.equal(input.disabled,false);assert.equal(input.required,true);
  input.checked=true;c.api.mode('assignment');c.api.update();
  assert.equal(field.hidden,true);assert.equal(field.style.display,'none');assert.equal(input.disabled,true);assert.equal(input.checked,false);assert.equal(input.required,false);
});
