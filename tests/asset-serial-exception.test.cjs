const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readFileSync}=require('node:fs'),{join}=require('node:path'),{createHash}=require('node:crypto');
const {IDBFactory}=require('fake-indexeddb');
const read=file=>readFileSync(join(__dirname,'..',file),'utf8'),clone=value=>JSON.parse(JSON.stringify(value));
const window={};vm.runInNewContext(read('asset-record-rules.js'),{window});
const rules=window.SKAssetRules,date='2026-10-22T00:00:00Z';
const asset=(id,extra={})=>({id,clase:'Taladro',fabricante:'Black & Decker',numeroYT:id,numeroClase:id,serial:'',marcaPrevia:'',serialStatus:'none',ubicacion:'Bodega de Superficie',createdAt:date,updatedAt:date,syncState:'pending',markingPolicy:'letters-v1',markStatus:'pending',...extra});
function service(){
 let cloud={assets:[],inventoryCriteria:[{id:'drill',name:'Taladro',isFixedAsset:true,usesSerial:true}]};
 const context=vm.createContext({LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(algorithm,value)=>[...createHash(algorithm).update(value).digest()]}});
 vm.runInContext(read('backend/apps-script/Code.gs'),context);context.findFile_=()=> 'file';context.readFile_=()=>clone(cloud);context.writeFile_=(_,data)=>cloud=clone(data);context.json_=clone;
 return{cloud:()=>clone(cloud),sync:(rows,role='owner')=>context.adminSyncAuthorized_({assets:clone(rows)},'',{role,username:'test',name:'Test'}),legacyFingerprint:row=>{cloud.assets.find(a=>a.id===row.id).registrationFingerprint=context.assistantAssetFingerprint_(row,true,false)}};
}
test('solo las dos excepciones explícitas permiten omitir identificación cuando el criterio usa serial',()=>{
 for(const serialStatus of ['none','unreadable'])assert.equal(rules.hasIdentity(asset('1',{serialStatus}),{usesSerial:true}),true);
 for(const serialStatus of ['',undefined,'unknown','false'])assert.equal(rules.hasIdentity(asset('1',{serialStatus}),{usesSerial:true}),false);
 assert.equal(rules.hasIdentity(asset('1',{serialStatus:'',serial:'SN-1'}),{usesSerial:true}),true);
 assert.equal(rules.hasIdentity(asset('1',{serialStatus:'',marcaPrevia:'FÍSICA'}),{usesSerial:true}),true);
 assert.equal(rules.hasIdentity(asset('1',{serialStatus:''}),{usesSerial:false}),true);
 assert.equal(rules.serialStatusLabel({serialStatus:'none'}),'Sin serial');assert.equal(rules.serialStatusLabel({serialStatus:'unreadable'}),'Serial ilegible');
});
test('dueño y auxiliar sincronizan equipos sin serial ni marca anterior con identidad interna propia',()=>{
 for(const role of ['owner','assistant']){
  const s=service(),rows=[asset('1'),asset('2',{serialStatus:'unreadable'})];s.sync(rows,role);s.sync(rows,role);
  const saved=s.cloud();assert.equal(saved.assets.length,2);assert.equal(saved.inventoryCriteria[0].usesSerial,true);
  assert.deepEqual(saved.assets.map(a=>a.serialStatus),['none','unreadable']);
  assert.ok(saved.assets.every(a=>a.id&&a.numeroClase&&a.nuevaMarca&&a.serial===''&&a.marcaPrevia===''&&a.syncState==='synced'));
  assert.notEqual(saved.assets[0].nuevaMarca,saved.assets[1].nuevaMarca);
  assert.throws(()=>s.sync([asset('3',{serialStatus:''})],role),/SERIAL o MARCA ANTERIOR/);assert.equal(s.cloud().assets.length,2);
 }
});
test('editar permite declarar la excepción y quitarla vuelve a exigir identificación sin cambiar número ni marca',()=>{
 const s=service();s.sync([asset('1',{serialStatus:'',serial:'SN-1'})]);const first=s.cloud().assets[0];
 s.sync([{...first,serial:'',serialStatus:'none',updatedAt:'2026-10-22T01:00:00Z',syncState:'pending'}]);
 const saved=s.cloud().assets[0];assert.equal(saved.serialStatus,'none');assert.equal(saved.serial,'');assert.equal(saved.nuevaMarca,first.nuevaMarca);assert.equal(saved.numeroClase,first.numeroClase);
 assert.throws(()=>s.sync([{...saved,serialStatus:'',updatedAt:'2026-10-22T02:00:00Z',syncState:'pending'}]),/SERIAL o MARCA ANTERIOR/);
 s.sync([{...saved,serialStatus:'',serial:'SN-CORREGIDO',updatedAt:'2026-10-22T02:00:00Z',syncState:'pending'}]);assert.equal(s.cloud().assets[0].serial,'SN-CORREGIDO');assert.equal(s.cloud().assets[0].serialStatus,'');
});
test('la excepción no permite repetir serial, marca anterior ni número de clase',()=>{
 const existing=asset('1',{serialStatus:'',serial:'SN-1',marcaPrevia:'PREVIA'});
 assert.equal(rules.duplicateSerial([existing],asset('2',{serial:'sn-1'})),existing);
 for(const role of ['owner','assistant'])for(const fields of [{serial:'SN-1'},{marcaPrevia:'PREVIA'}]){
  const s=service();s.sync([existing],role);assert.throws(()=>s.sync([asset('2',fields)],role),/ya existe/);assert.equal(s.cloud().assets.length,1);
 }
 const s=service();s.sync([asset('1')],'assistant');assert.throws(()=>s.sync([asset('2',{numeroYT:'1',numeroClase:'1'})],'assistant'),/ya existe/);
});
test('el auxiliar reintenta sin duplicar, pero no cambia ni quita el motivo de una ficha existente',()=>{
 const s=service(),row=asset('1');s.sync([row],'assistant');s.sync([row],'assistant');const before=s.cloud();
 for(const serialStatus of ['unreadable',''])assert.throws(()=>s.sync([{...row,serialStatus}],'assistant'),/solo permite agregar/);
 assert.deepEqual(s.cloud(),before);
 s.legacyFingerprint(row);s.sync([row],'assistant');assert.throws(()=>s.sync([{...row,serialStatus:'unreadable'}],'assistant'),/solo permite agregar/);
});
test('fichas anteriores sin situación de serial mantienen reintentos y permisos',()=>{
 const s=service(),row=asset('1',{serial:'LEGACY'});delete row.serialStatus;s.sync([row],'assistant');s.sync([row],'assistant');
 assert.throws(()=>s.sync([{...row,serialStatus:'none'}],'assistant'),/solo permite agregar/);
 assert.equal(s.cloud().assets.length,1);assert.equal(s.cloud().assets[0].serialStatus,undefined);
});
test('el guardado offline conserva la excepción pendiente y la recibe después de sincronizar',async()=>{
 const localWindow={SKAssetRules:rules,dispatchEvent(){}},context=vm.createContext({indexedDB:new IDBFactory(),window:localWindow,Event:class{constructor(type){this.type=type}},CustomEvent:class{constructor(type){this.type=type}},console});
 vm.runInContext(read('app.js').split('const PARTS=')[0],context);await context.openDB();
 await context.put('assets',asset('1'));const pending=clone(await context.all('assets'));assert.equal(pending[0].serialStatus,'none');assert.equal(pending[0].syncState,'pending');
 const s=service();s.sync(pending);await context.replaceStoreRows('assets',s.cloud().assets,pending);
 const [synced]=await context.all('assets');assert.equal(synced.serialStatus,'none');assert.equal(synced.serial,'');assert.equal(synced.syncState,'synced');assert.ok(synced.nuevaMarca);
});
