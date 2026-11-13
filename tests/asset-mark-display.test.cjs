const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const fs=require('node:fs'),path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
function app(asset){
 const labels={},inputs={},alerts=[],saved=[],hint={},host={innerHTML:'',querySelector:()=>null};
 const values={id:'asset',clase:'Rotomartillo',numeroYT:'1',numeroClase:'1',serial:'105152',nuevaMarca:'AAV',marcaInterna:'AAV',marcaActual:'AAV',marcaPrevia:'',areaAsignada:'Seguridad física',estado:'Operativo/a',...asset};
 for(const [name,value] of Object.entries(values)){
  const classes=new Set(),title={textContent:''};
  labels[name]={title,classList:{toggle(key,on){on?classes.add(key):classes.delete(key)},contains:key=>classes.has(key)},querySelector:()=>title};
  inputs[name]={name,value,disabled:false,dataset:{},closest:()=>labels[name]};
 }
 const checkClasses=new Set();labels.hasPreviousMark={classList:{toggle(key,on){on?checkClasses.add(key):checkClasses.delete(key)},contains:key=>checkClasses.has(key)}};
 inputs.hasPreviousMark={name:'hasPreviousMark',checked:!!values.marcaPrevia,closest:()=>labels.hasPreviousMark};
 const form={elements:inputs,dataset:{autoMarkPolicy:values.markingPolicy||''},querySelector:()=>hint};
 const window={addEventListener(){},SKAdminAuth:{canView:()=>true,canManageAssets:()=>true},SKAssetHistory:{operationStatus:()=> 'Sí'},SKAssetHistoryUI:{show(){}},SKAssetMarking:{eligible:type=>!/^(yt|columna|autorrescatador)/i.test(type)}};
 const context=vm.createContext({window,console,document:{querySelector:()=>null,querySelectorAll:()=>[{value:values.clase}],getElementById:()=>host},all:async()=>[values],fd:f=>Object.fromEntries(Object.entries(f.elements).filter(([name,input])=>name!=='hasPreviousMark'&&!input.disabled).map(([name,input])=>[name,input.value])),put:async(_,value)=>saved.push(JSON.parse(JSON.stringify(value))),alert:value=>alerts.push(value),now:()=> '2026-11-13T22:00:00Z',refresh:async()=>{}});
 vm.runInContext(read('asset-record-rules.js'),context);vm.runInContext(read('asset-field-compat.js'),context);
 // Install the active criterion through the module's closure for the save path.
 const adminSource=read('asset-admin-ui.js').replace('window.SKAssetAdminUI={hydrateEdit};',`window.SKAssetAdminUI={hydrateEdit,updateMarkFieldVisibility,updatePreviousMarkFields,saveAsset};criteriaByClass.set(${JSON.stringify(values.clase.toLowerCase())},{usesSerial:true});`);
 vm.runInContext(adminSource,context);
 window.SKAssetOwnership={label:window.SKAssetListLabel,isSK:()=>true};
 vm.runInContext(read('asset-query.js').replace('window.SKAssetQuery={mount,render};','window.SKAssetQuery={mount,render,drawDetail};'),context);
 const update=(readOnly=false)=>{window.SKAssetAdminUI.updateMarkFieldVisibility(form,inputs.clase.value.toLowerCase(),false);window.SKAssetAdminUI.updatePreviousMarkFields(form,readOnly)};
 return{values,inputs,labels,alerts,saved,form,window,update,hidden:name=>labels[name].classList.contains('criterion-disabled-field'),save:()=>window.SKAssetAdminUI.saveAsset({currentTarget:form,preventDefault(){},stopImmediatePropagation(){}}),detail(){window.SKAssetQuery.drawDetail({asset:values,events:[]});return host.innerHTML}};
}

test('una marca repetida se muestra solo en el campo destinado a la nueva marca',()=>{
 for(const previous of ['', 'AAV', ' aav ']){
  const s=app({marcaPrevia:previous});s.update();
  assert.equal(s.hidden('nuevaMarca'),false);assert.equal(s.labels.nuevaMarca.title.textContent,'MARCA');
  for(const name of ['marcaInterna','hasPreviousMark','marcaPrevia'])assert.equal(s.hidden(name),true);
  const html=s.detail();assert.match(html,/<dt>MARCA<\/dt><dd>AAV<\/dd>/);assert.doesNotMatch(html,/<dt>(?:Nueva marca|MARCA ANTERIOR|Marca anterior|No. de marca actual)<\/dt>/);
 }
});
test('una marca anterior distinta se conserva visible, incluso si está en un campo heredado',()=>{
 for(const asset of [{marcaPrevia:'SK-12'},{marcaInterna:'SK-12',marcaActual:'SK-12'},{marcaPrevia:'AAV',marcaInterna:'SK-12',marcaActual:'SK-12'}]){
  const s=app(asset);s.update();const previous=asset.marcaPrevia==='SK-12'?'marcaPrevia':'marcaInterna';
  assert.equal(s.hidden(previous),false);assert.equal(s.inputs[previous].value,'SK-12');assert.equal(s.inputs[previous].readOnly,true);
  assert.match(s.detail(),/<dt>MARCA ANTERIOR<\/dt><dd>SK-12<\/dd>/);
  assert.equal(s.window.SKAssetListLabel(s.values),'Rotomartillo · Serial: 105152 · Marca: AAV');
 }
});
test('guardar conserva las marcas históricas y no copia la nueva sobre ellas',async()=>{
 for(const asset of [{marcaPrevia:'AAV'},{marcaPrevia:'SK-12'},{marcaInterna:'SK-12',marcaActual:'SK-12',marcaAnterior:'12',numeroMarcaActual:'12'}]){
  const s=app(asset);s.update();await s.save();assert.equal(s.saved.length,1,s.alerts.join('\n'));
  for(const name of ['nuevaMarca','marcaInterna','marcaActual','marcaPrevia','marcaAnterior','numeroMarcaActual'])assert.equal(s.saved[0][name],s.values[name],name);
  assert.equal(s.saved[0].syncState,'pending');assert.equal(s.saved[0].serial,'105152');
 }
});
test('YT28, YT29 y sus columnas mantienen sus campos de identificación',()=>{
 for(const clase of ['YT','Columna'])for(const modelo of ['28','29']){
  const s=app({clase,modelo,marcaActual:'LIII',marcaInterna:'LIII',marcaAnterior:'53',numeroMarcaActual:'53',marcaPrevia:'ANTERIOR'});s.update();
  assert.equal(s.labels.nuevaMarca.title.textContent,'NUEVA MARCA');assert.equal(s.labels.marcaInterna.title.textContent,'MARCA');assert.equal(s.hidden('marcaInterna'),false);assert.equal(s.hidden('marcaPrevia'),false);
  const html=s.detail();assert.match(html,/<dt>MARCA<\/dt><dd>LIII<\/dd>/);assert.match(html,/<dt>No. de marca actual<\/dt><dd>53<\/dd>/);
 }
});
test('sin nueva marca sigue disponible el registro de una marca anterior y se respetan permisos',()=>{
 const s=app({nuevaMarca:'',marcaPrevia:'SK-12'});s.update();assert.equal(s.hidden('hasPreviousMark'),false);assert.equal(s.hidden('marcaPrevia'),false);assert.equal(s.inputs.marcaPrevia.readOnly,false);assert.equal(s.inputs.marcaPrevia.required,true);
 s.update(true);assert.equal(s.inputs.hasPreviousMark.disabled,true);assert.equal(s.inputs.marcaPrevia.disabled,true);
 s.inputs.nuevaMarca.value='AAV';s.update();assert.equal(s.hidden('hasPreviousMark'),true);assert.equal(s.hidden('marcaPrevia'),false);
 s.inputs.nuevaMarca.value='';s.update();assert.equal(s.hidden('hasPreviousMark'),false);assert.equal(s.inputs.marcaPrevia.readOnly,false);assert.equal(s.labels.nuevaMarca.title.textContent,'NUEVA MARCA');
});
