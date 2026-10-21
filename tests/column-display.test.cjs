const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const read=file=>fs.readFileSync(file,'utf8');
function context(){
 const ctx=vm.createContext({window:{addEventListener(){}},document:{querySelector(){return null}},Intl,Date,console});
 vm.runInContext(read('asset-record-rules.js'),ctx);return ctx;
}
function frontend(file,exports){
 const ctx=context();vm.runInContext(read(file).replace(/\}\)\(\);\s*$/,`window.testing={${exports}};})();`),ctx);
 return ctx.window.testing;
}
const ctx=context(),rules=ctx.window.SKAssetRules;
const column=Object.freeze({id:'col-1',clase:'Columna',numeroMarcaActual:'54',numeroClase:'7',marcaActual:'ABC',serial:'LEGACY-SERIAL',largo:'6'});
test('columna usa número de marca y marca actual sin serial ni mutaciones',()=>{
 assert.equal(rules.label(column),'Columna · N.º de marca: 54 · Marca actual: ABC · 6 ft');
 assert.equal(column.serial,'LEGACY-SERIAL');
 for(const source of [
  {clase:'Columnas',numeroClase:'46',marcaActual:'XLVI'},
  {clase:'Columna',numeroMarcaActual:'No aplica',numeroYT:'46',marcaInterna:'XLVI'},
  {clase:'Columna de 6 ft',orden:'46',nuevaMarca:'XLVI'}
 ])assert.match(rules.columnLabel(source),/N.º de clase: 46 · Marca actual: XLVI/);
 assert.match(rules.columnLabel({clase:'Columna',marcaAnterior:'21',marcaInterna:'XXI'}),/N.º de marca: 21 · Marca actual: XXI/);
 assert.equal(rules.isColumn('Rotomartillo'),false);
});
test('Admin y Plaza usan la misma identidad en listas y selectores',()=>{
 const admin=frontend('asset-admin-ui.js','cleanLabel');
 const income=frontend('plaza/asset-not-found.js','assetLabel,visibleFields');
 const plaza=context();vm.runInContext("const assetNumber=a=>String(a.numeroClase||a.numeroYT||'');"+read('plaza/plaza.js').split('\n').find(line=>line.includes('function assetLabel(asset)')),plaza);
 const ownership=context();vm.runInContext(read('asset-list-order.js'),ownership);
 for(const label of [admin.cleanLabel,income.assetLabel,plaza.assetLabel,ownership.window.SKAssetOwnership.label]){
  assert.equal(label(column),rules.columnLabel(column));
  assert.match(label({clase:'Taladro',serial:'SN-5',marcaActual:'XYZ'}),/SN-5/);
 }
 assert.equal(income.visibleFields({name:'Columna',usesSerial:true}).serial,false);
 assert.equal(income.visibleFields({name:'YT',usesSerial:true}).serial,true);
});
test('consultas históricas muestran identidad actual sin reescribir registros',()=>{
 const row=Object.freeze({assetId:'col-1',itemName:'Columna',assetLabel:'Columna · N.º 7 · ANT · Serial LEGACY-SERIAL'});
 assert.equal(rules.movementLabel(row,[column]),rules.columnLabel(column));
 assert.equal(rules.movementLabel(row,[]),'Columna · N.º 7 · ANT');
 assert.match(row.assetLabel,/Serial LEGACY-SERIAL/);
 const drill={assetId:'drill',itemName:'Taladro',assetLabel:'Taladro · Serial SN-5'};
 assert.equal(rules.movementLabel(drill,[]),drill.assetLabel);
 assert.equal(rules.movementLabel({assetCandidate:column}),rules.columnLabel(column));
});
test('la ficha Admin oculta el serial de columnas sin borrar su valor histórico',()=>{
 const ui=context(),makeControl=value=>{
  const classes=new Set(),label={classList:{toggle(name,on){on?classes.add(name):classes.delete(name)}}};
  return {value,disabled:false,closest:()=>label,classes};
 };
 const fields=Object.fromEntries(['id','numeroYT','clase','serial','marcaAnterior','modelo','fabricante','largo','marcaInterna','nuevaMarca','estado'].map(name=>[name,makeControl('')]));
 Object.assign(fields.id,{value:'col-1'});fields.clase.value='Columna';fields.serial.value='LEGACY-SERIAL';
 const form={elements:fields,dataset:{},classList:{toggle(){}}};ui.document.querySelector=()=>form;
 Object.assign(ui,{norm:v=>String(v||'').toLowerCase(),criteriaByClass:new Map()});
 for(const name of ['fillAssignedArea','updateModelControl','updateManufacturerControl','updateClassOnlyOptions','updateMarkFieldVisibility','applySuggestedMark','setAssetMode'])ui[name]=()=>{};
 vm.runInContext(read('asset-admin-ui.js').split('\n').filter(line=>line.startsWith('function criterionField(')||line.startsWith('function updateAssetFields(')).join('\n'),ui);
 ui.updateAssetFields();assert.equal(fields.serial.classes.has('criterion-disabled-field'),true);assert.equal(fields.serial.value,'LEGACY-SERIAL');
 fields.clase.value='Taladro';ui.updateAssetFields();assert.equal(fields.serial.classes.has('criterion-disabled-field'),false);assert.equal(fields.serial.value,'LEGACY-SERIAL');
});
test('las devoluciones pendientes ocultan el serial del rótulo guardado',()=>{
 const ui=context(),nodes={};
 for(const id of ['assetReturnList','assetReturnSearch','assetReturnFilter','assetReturnCount'])nodes['#'+id]={value:id==='assetReturnFilter'?'TODOS':''};
 const loan=Object.freeze({id:'loan',assetId:column.id,itemName:'Columna',assetLabel:'Columna · Serial LEGACY-SERIAL',deliveryType:'PRÉSTAMO',destination:'Operación',createdAt:'2026-10-20T12:00:00Z'});
 ui.document.querySelector=key=>nodes[key]||null;
 ui.window.SKPlaza={getData:()=>({assets:[{...column,ubicacion:'Operación'}],blendingDeliveries:[loan],personal:[]})};
 vm.runInContext(read('plaza/asset-returns.js'),ui);ui.window.SKPlazaReturns.refresh();
 assert.match(nodes['#assetReturnList'].innerHTML,/N.º de marca: 54 · Marca actual: ABC/);
 assert.doesNotMatch(nodes['#assetReturnList'].innerHTML,/Serial|LEGACY-SERIAL/);
 assert.match(loan.assetLabel,/LEGACY-SERIAL/);
});
