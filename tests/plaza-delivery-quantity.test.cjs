const {entry}=require('./session-fixture.cjs');
const {test}=require('node:test');
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');

function formClient(){
  const nodes=new Map(),alerts=[];
  const node=()=>({value:'',dataset:{},style:{},childNodes:[{textContent:''}],options:[],events:[],addEventListener(){},
    dispatchEvent(event){this.events.push(event.type)},querySelectorAll:()=>[],add(option){this.options.push(option)},
    replaceChildren(...options){this.options=options}});
  const query=selector=>{if(!nodes.has(selector))nodes.set(selector,node());return nodes.get(selector)};
  const fields=Object.fromEntries(['itemId','quantity','destination','destinationLevel','destinationWarehouseId','notes'].map(name=>[name,node()]));
  fields.quantity.min='0.01';fields.quantity.step='any';fields.quantity.required=true;fields.quantity.value='1';
  fields.assetId=query('#deliveryAssetId');
  fields.itemId.closest=()=>({_clearItemSearch:()=>{fields.itemId.value=''}});
  const form={elements:fields,querySelector:()=>query('#submit')};nodes.set('#deliveryForm',form);
  const ctx=vm.createContext({document:{querySelector:query},window:{SKEntry:entry,alert:message=>alerts.push(message)},
    alert:message=>alerts.push(message),sessionStorage:{getItem:()=>null},localStorage:{getItem:()=>null},
    Event:class {constructor(type){this.type=type}},Option:class {constructor(text,value){this.text=text;this.value=value}},console});
  vm.runInContext(read('spare-groups.js'),ctx);vm.runInContext(read('asset-history.js'),ctx);vm.runInContext(read('asset-record-rules.js'),ctx);
  vm.runInContext(read('asset-search.js'),ctx);
  const prefix=read('plaza/plaza.js').split('  injectItemSearchStyle();setupDeliveryForm();')[0];
  vm.runInContext(prefix+`\nwindow.testing={matchesAssetSearch:(asset,value)=>deliveryAssetResults([asset],window.SKAssetSearch.query(value)).length>0,selectionLabel:assetSelectionLabel,historyLabel:assetLabel,set:value=>{data=value},mode:value=>{deliveryMode=value},update:updateDeliveryFields,capture:currentDeliveryItem,add:addDeliveryItem,draft:()=>deliveryDraft,recipientChanged:recipientDestinationChanged};})();`,ctx);
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

test('ARIS MINING remains available for loans and normal deliveries reject assets',()=>{
  const c=formClient(),destination='A cargo de ARIS MINING';c.select('saw');
  assert.ok(c.fields.destination.options.some(option=>option.value===destination));
  c.fields.destination.value=destination;c.fields.assetId.value='asset';
  assert.equal(c.api.capture().destination,destination);
  c.api.add();c.data.personal=[{id:'person',area:'Producción'}];c.nodes.set('#recipientId',{value:'person'});c.api.recipientChanged();
  assert.equal(c.api.draft()[0].destination,destination);
  c.api.mode('assignment');c.select('saw');assert.equal(c.api.capture(),null);
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
  assert.equal(c.api.selectionLabel({clase:'YT 29',fabricante:'Gisi',serial:'24022637',marcaPrevia:'42',modelo:'29'}),'YT - 29 · Gisi · 24022637 · 42');
  assert.equal(c.api.selectionLabel({clase:'Columna',serial:'SHOULD-NOT-SHOW',marcaAnterior:'15',modelo:'29'}),'Columna - 29 · 15');
  assert.equal(c.api.selectionLabel({clase:'Autorrescatador',fabricante:'Steel pro',serial:'00123',marcaPrevia:'SK-27',modelo:'Oxypro 50'}),'Steel pro · 00123 · SK-27 · Oxypro 50');
  assert.equal(c.api.selectionLabel({clase:'YT',marcaPrevia:'37',nuevaMarca:'P-AB',modelo:'29'}),'YT - 29 · P-AB');
  assert.equal(c.api.selectionLabel({clase:'Columna',modelo:'No aplica',marcaAnterior:'15'}),'Columna · 15');
  assert.equal(c.api.selectionLabel({clase:'YT',serial:'123'}),'YT · 123');
  assert.equal(c.api.selectionLabel({clase:'Pulidora',fabricante:'DEWALT',serial:'No trae',marcaPrevia:'OLD',modelo:'DWE'}),'DEWALT · No trae · DWE');
});

test('ARIS recipient company is visible only for loans and is cleared on switching to assignment',()=>{
  const c=formClient();c.select('saw');
  const field=c.nodes.get('#loanRecipientCompanyField'),input=c.nodes.get('#loanRecipientCompanyInput');
  assert.equal(field.hidden,false);assert.equal(input.disabled,false);assert.equal(input.required,true);
  input.checked=true;c.api.mode('assignment');c.api.update();
  assert.equal(field.hidden,true);assert.equal(field.style.display,'none');assert.equal(input.disabled,true);assert.equal(input.checked,false);assert.equal(input.required,false);
});

test('specific asset searches match partial serials, marks, models and multiple words without case or accent differences',()=>{
  const c=formClient(),asset={clase:'Motosierra',fabricante:'Makita',serial:'57951',nuevaMarca:'AAF',marcaPrevia:'Seguridad',modelo:'UC4051A'};
  for(const query of ['', 'maki', '795', 'aaf', 'uc4051', '  MAKÍTA   57951 ', 'AAF uc4051a', 'seguridad'])assert.equal(c.api.matchesAssetSearch(asset,query),true,query);
  for(const query of ['stihl','57952','Makita AAG'])assert.equal(c.api.matchesAssetSearch(asset,query),false,query);
  assert.equal(c.api.matchesAssetSearch({clase:'Columna',serial:'HIDDEN-SERIAL',marcaPrevia:'15',modelo:'29'},'hidden-serial'),false);
  assert.equal(c.api.matchesAssetSearch({clase:'Columna',marcaPrevia:'15',modelo:'29'},'15 29'),true);
});


test('a grouped spare capture keeps the criterion ID and explicit name for stock and Production',()=>{
  const c=formClient();c.api.mode('warehouse');
  c.data.inventoryCriteria.push({id:'criterion-resorte',isYtSpare:true,spareEquipment:'YT 29',spareItemNumber:'1',spareItemName:'Resorte del pin del cabezal',productionPartId:'legacy-part-1',name:'Repuesto YT 29 - Ítem 1 - Resorte'});
  c.data.inventoryStock.push({id:'stock-resorte',itemId:'criterion-resorte',quantity:8});
  c.select('criterion-resorte');c.fields.quantity.value='2';
  const row=c.api.capture();
  assert.equal(row.itemId,'criterion-resorte');assert.equal(row.itemName,'Repuesto de YT29 · Ítem 1 · Resorte del pin del cabezal');
  assert.equal(row.destination,'Producción');assert.equal(row.assetId,'');assert.equal(row.quantity,2);
  c.api.add();assert.equal(c.api.draft()[0].itemId,'criterion-resorte');assert.equal(c.fields.itemId.value,'');
});

test('warehouse transfers credit Production while normal deliveries stay separate',()=>{
 const c=formClient();c.api.mode('assignment');c.select('pliers');c.fields.quantity.value='2';
 assert.equal(c.api.capture().destination,'');c.fields.destinationWarehouseId.value='production';assert.equal(c.api.capture().destination,'');
 c.api.mode('warehouse');c.api.update();assert.equal(c.api.capture().destinationWarehouseId,'production');
 c.select('cable');assert.equal(c.fields.destinationWarehouseId.value,'');
});

test('a duplicate selection warns about quantity even when both quantities fit in stock',()=>{
  const c=formClient();c.api.mode('assignment');c.select('pliers');c.api.add();
  c.select('pliers');c.fields.quantity.value='2';c.api.add();
  assert.match(c.alerts.at(-1),/No puedes agregar el mismo elemento en una misma entrega.*Aumenta la cantidad/);
  assert.equal(c.api.draft().length,1);assert.equal(c.api.draft()[0].quantity,1);
  assert.match(c.nodes.get('#deliveryDraft').innerHTML,/data-delivery-quantity="0"/);
});

test('the same specific asset is blocked but two assets of its class can share a delivery',()=>{
  const c=formClient();
  c.data.assets.push({...c.data.assets[0],id:'second',serial:'TEST-2'});
  const add=id=>{c.select('saw');c.fields.assetId.value=id;c.fields.destination.value='Operación';c.api.add()};
  add('asset');add('asset');
  assert.match(c.alerts.at(-1),/Este activo fijo ya está agregado/);
  add('second');
  assert.deepEqual(Array.from(c.api.draft(),row=>[row.assetId,row.quantity]),[['asset',1],['second',1]]);
  assert.doesNotMatch(c.nodes.get('#deliveryDraft').innerHTML,/data-delivery-quantity/);
});

test('a second tap on Agregar is ignored until another item is selected',()=>{
  const c=formClient();c.api.mode('assignment');c.select('');
  const add=c.nodes.get('#addDeliveryItem'),submit=c.nodes.get('#submit');
  assert.equal(add.disabled,true);assert.equal(submit.disabled,true);
  c.select('pliers');assert.equal(add.disabled,false);assert.equal(submit.disabled,false);
  c.api.add();assert.equal(add.disabled,true);assert.equal(submit.disabled,false);
  c.api.add();assert.equal(c.alerts.length,0);assert.equal(c.api.draft().length,1);
  c.select('cable');assert.equal(add.disabled,false);c.api.add();assert.equal(c.api.draft().length,2);
});
