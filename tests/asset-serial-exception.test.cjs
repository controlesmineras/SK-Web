const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readFileSync}=require('node:fs'),{join}=require('node:path'),{createHash}=require('node:crypto');
const {IDBFactory}=require('fake-indexeddb');
const read=file=>readFileSync(join(__dirname,'..',file),'utf8'),clone=value=>JSON.parse(JSON.stringify(value));
const window={};vm.runInNewContext(read('asset-record-rules.js'),{window});
const rules=window.SKAssetRules,date='2026-10-22T00:00:00Z';
const asset=(id,extra={})=>({id,clase:'Taladro',fabricante:'Black & Decker',numeroYT:id,numeroClase:id,serial:'No trae',marcaPrevia:'',serialStatus:'',ubicacion:'Bodega de Superficie',createdAt:date,updatedAt:date,syncState:'pending',markingPolicy:'letters-v1',markStatus:'pending',...extra});
function service(initial={}){
 let cloud={assets:[],inventoryCriteria:[{id:'drill',name:'Taladro',isFixedAsset:true,usesSerial:true}],...clone(initial)};
 const context=vm.createContext({LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(algorithm,value)=>[...createHash(algorithm).update(value).digest()]}});
 vm.runInContext(read('backend/apps-script/Code.gs'),context);context.findFile_=()=> 'file';context.readFile_=()=>clone(cloud);context.writeFile_=(_,data)=>cloud=clone(data);context.json_=clone;
 return{cloud:()=>clone(cloud),sync:(rows,role='owner')=>context.adminSyncAuthorized_({assets:clone(rows)},'',{role,username:'test',name:'Test'}),legacyFingerprint:row=>{cloud.assets.find(a=>a.id===row.id).registrationFingerprint=context.assistantAssetFingerprint_(row,true,false)}};
}

test('el serial requerido no se sustituye con marca anterior ni con la antigua excepción',()=>{
 for(const serial of ['',undefined,'   ','No aplica','No trae serial','No es visible','Sin serial','Serial ilegible','Ilegible','Legible','No tiene','No tiene serial']){
  for(const serialStatus of ['', 'none','unreadable'])assert.equal(rules.hasIdentity(asset('1',{serial,serialStatus,marcaPrevia:'MARCA-ANTERIOR'}),{usesSerial:true}),false);
 }
 for(const serial of ['SN-1','ABC','No trae','No visible',' no trae ','NO  VISIBLE'])assert.equal(rules.hasIdentity(asset('1',{serial}),{usesSerial:true}),true);
});

test('columnas y criterios sin serial conservan el campo opcional',()=>{
 for(const usesSerial of [false,'false','No',0])assert.equal(rules.hasIdentity(asset('1',{serial:'',marcaPrevia:''}),{usesSerial}),true);
 for(const clase of ['Columna','Columnas'])assert.equal(rules.hasIdentity(asset('1',{clase,serial:'',marcaPrevia:''}),{usesSerial:true}),true);
 for(const role of ['owner','assistant']){
  const s=service({inventoryCriteria:[{id:'col',name:'Columna',isFixedAsset:true,usesSerial:true}]});s.sync([asset('1',{clase:'Columna',serial:''})],role);assert.equal(s.cloud().assets[0].serial,'');
 }
});

test('los dos textos permitidos se sincronizan repetidos y conservan una identidad interna por equipo',()=>{
 for(const serial of ['No trae','No visible'])for(const role of ['owner','assistant']){
  const s=service(),rows=[asset('1',{serial}),asset('2',{serial})];s.sync(rows,role);s.sync(rows,role);
  const saved=s.cloud().assets;assert.equal(saved.length,2);assert.deepEqual(saved.map(a=>a.serial),[serial,serial]);
  assert.ok(saved.every(a=>a.marcaPrevia===''&&a.serialStatus===''&&a.syncState==='synced'));assert.notEqual(saved[0].nuevaMarca,saved[1].nuevaMarca);
 }
 assert.equal(rules.serialDescription(' no  trae '),'No trae');assert.equal(rules.serialDescription('NO VISIBLE'),'No visible');assert.equal(rules.serialDescription('Ilegible'),'');
});

test('el servidor rechaza vacíos y otras descripciones aunque exista marca anterior',()=>{
 for(const serial of ['', '   ','No aplica','Sin serial','Serial ilegible','Ilegible','No tiene','No trae serial'])for(const role of ['owner','assistant']){
  const s=service();assert.throws(()=>s.sync([asset('1',{serial,marcaPrevia:'PREVIA',serialStatus:'none'})],role),/Ingresa el SERIAL/);assert.equal(s.cloud().assets.length,0);
 }
});

test('los seriales reales y las marcas anteriores siguen siendo únicos',()=>{
 for(const serial of ['SN-123','ABC','No visible-123','No trae 123']){
  const first=asset('1',{serial}),second=asset('2',{serial});assert.equal(rules.duplicateSerial([first],second),first);
  for(const role of ['owner','assistant']){const s=service();s.sync([first],role);assert.throws(()=>s.sync([second],role),/ya existe/);}
 }
 for(const role of ['owner','assistant']){const s=service();s.sync([asset('1',{marcaPrevia:'PREVIA'})],role);assert.throws(()=>s.sync([asset('2',{marcaPrevia:'PREVIA',serial:'No visible'})],role),/ya existe/);}
});

test('una ficha anterior se conserva y al editar exige serial, manteniendo número, marca y accesorios',()=>{
 const legacy=asset('1',{serial:'',serialStatus:'unreadable',syncState:'synced',markStatus:'assigned',numeroClase:'1',nuevaMarca:'AAA',accessories:[{id:'acc',description:'Batería'}]}),s=service({assets:[legacy]});
 assert.deepEqual(s.cloud().assets[0],legacy);
 assert.throws(()=>s.sync([{...legacy,marcaPrevia:'ANTERIOR',updatedAt:'2026-10-22T02:00:00Z',syncState:'pending'}]),/Ingresa el SERIAL/);
 s.sync([{...legacy,serial:'No visible',serialStatus:'',updatedAt:'2026-10-22T02:00:00Z',syncState:'pending'}]);
 const saved=s.cloud().assets[0];assert.equal(saved.serial,'No visible');assert.equal(saved.serialStatus,'');assert.equal(saved.numeroClase,legacy.numeroClase);assert.equal(saved.nuevaMarca,legacy.nuevaMarca);assert.deepEqual(saved.accessories,legacy.accessories);
 assert.throws(()=>s.sync([{...saved,serial:'',marcaPrevia:'ANTERIOR',updatedAt:'2026-10-22T03:00:00Z',syncState:'pending'}]),/Ingresa el SERIAL/);
});

test('el auxiliar puede reintentar su alta pero no cambiar el texto ni editar la ficha',()=>{
 const s=service(),row=asset('1');s.sync([row],'assistant');s.sync([row],'assistant');const before=s.cloud();
 for(const serial of ['No visible','', 'SN-123'])assert.throws(()=>s.sync([{...row,serial}],'assistant'),/solo permite agregar/);assert.deepEqual(s.cloud(),before);
});

test('los dos textos se guardan offline y sincronizan sin duplicar registros',async()=>{
 const localWindow={SKAssetRules:rules,dispatchEvent(){}},context=vm.createContext({indexedDB:new IDBFactory(),window:localWindow,Event:class{},CustomEvent:class{},console});
 vm.runInContext(read('app.js').split('const PARTS=')[0],context);await context.openDB();
 for(const id of ['1','2','3'])await context.put('assets',asset(id,{serial:id==='3'?'No visible':'No trae'}));
 const pending=clone(await context.all('assets'));assert.equal(pending.length,3);assert.ok(pending.every(a=>a.syncState==='pending'));
 const s=service();s.sync(pending);await context.replaceStoreRows('assets',s.cloud().assets,pending);
 const saved=await context.all('assets');assert.equal(saved.length,3);assert.ok(saved.every(a=>['No trae','No visible'].includes(a.serial)&&a.syncState==='synced'));
});

test('el formulario exige serial según criterio y conserva ayuda, columnas y permisos',async()=>{
 let hidden,focused=0,writes=0;const hint={},alerts=[],serial={value:'',focus(){focused++},closest:()=>({classList:{toggle:(name,value)=>hidden=value}})},form={elements:{id:{value:''},clase:{value:'Taladro'},serial},querySelector:()=>hint};
 const localWindow={SKAssetRules:rules,SKAdminAuth:{canView:()=>true,isOwner:()=>true},addEventListener(){}};
 const context=vm.createContext({window:localWindow,document:{querySelector:()=>null,querySelectorAll:()=>[{value:'Taladro'}]},all:async()=>[],fd:()=>({id:'',clase:'Taladro',serial:'   ',marcaPrevia:'PREVIA'}),put:async()=>{writes++},alert:m=>alerts.push(m),console});
 vm.runInContext(read('asset-admin-ui.js').replace('window.SKAssetAdminUI={hydrateEdit};',"window.SKAssetAdminUI={hydrateEdit,updateSerialFields,saveAsset};criteriaByClass.set('taladro',{usesSerial:true});"),context);
 const ui=localWindow.SKAssetAdminUI;ui.updateSerialFields(form,{usesSerial:true},false);assert.equal(serial.required,true);assert.equal(serial.disabled,false);assert.equal(hidden,false);assert.match(hint.textContent,/No trae.*No visible/);
 await ui.saveAsset({currentTarget:form,preventDefault(){},stopImmediatePropagation(){}});assert.equal(writes,0);assert.equal(focused,1);assert.match(alerts[0],/Ingresa el SERIAL/);
 ui.updateSerialFields(form,{usesSerial:false},false);assert.equal(serial.required,false);
 ui.updateSerialFields(form,{usesSerial:true},true);assert.equal(serial.disabled,true);
 form.elements.clase.value='Columna';ui.updateSerialFields(form,{usesSerial:true},false);assert.equal(serial.required,false);assert.equal(hidden,true);assert.equal(serial.disabled,true);
});
