const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readFileSync}=require('node:fs'),{join}=require('node:path'),{webcrypto,createHash}=require('node:crypto');
const read=f=>readFileSync(join(__dirname,'..',f),'utf8'),clone=x=>JSON.parse(JSON.stringify(x));
const window={};vm.runInNewContext(read('asset-accessories.js'),{window,crypto:webcrypto});
test('accesorios opcionales: omite filas vacías, conserva descripción e identificador',()=>{
 const rows=window.SKAssetAccessories.normalize([{id:'battery',description:' Batería marcada ABC '},{description:'  '},'Cargador']);
 assert.equal(rows.length,2);assert.equal(rows[0].id,'battery');assert.equal(rows[0].description,'Batería marcada ABC');assert.ok(rows[1].id);assert.equal(rows[1].description,'Cargador');assert.equal(window.SKAssetAccessories.normalize(null).length,0);
});
const date='2026-10-21T20:00:00Z';
const asset=(id,extra={})=>({id,clase:'Radioteléfono',numeroClase:id,numeroYT:id,serial:'SN-'+id,ubicacion:'Bodega de Superficie',createdAt:date,updatedAt:date,syncState:'pending',...extra});
function service(){
 let cloud={assets:[],inventoryCriteria:[{id:'radio',name:'Radioteléfono',isFixedAsset:true,usesSerial:true,allowAccessories:true}]};
 const ctx=vm.createContext({LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(algorithm,value)=>[...createHash(algorithm).update(value).digest()]}});
 vm.runInContext(read('backend/apps-script/Code.gs'),ctx);ctx.findFile_=()=> 'file';ctx.readFile_=()=>clone(cloud);ctx.writeFile_=(_,data)=>cloud=clone(data);ctx.json_=clone;
 return{legacyFingerprint:row=>{cloud.assets.find(a=>a.id===row.id).registrationFingerprint=ctx.assistantAssetFingerprint_(row,false)},cloud:()=>clone(cloud),sync:(rows,role='owner')=>ctx.adminSyncAuthorized_({assets:clone(rows)},'',{role,username:'test',name:'Test'})};
}
test('tres radios mantienen listas propias y sincronizan sin crear activos ni saldos adicionales',()=>{
 const s=service(),rows=[asset('1',{hasAccessories:true,accessories:[{id:'bat-1',description:'Batería ABC'},{id:'charger',description:'Cargador'}]}),asset('2',{hasAccessories:false,accessories:[]}),asset('3',{hasAccessories:null,accessories:[]})];
 s.sync(rows);s.sync(rows);const cloud=s.cloud();assert.equal(cloud.assets.length,3);assert.equal(cloud.assets[0].accessories.length,2);assert.equal(cloud.assets[1].hasAccessories,false);assert.equal(cloud.assets[2].hasAccessories,null);assert.equal((cloud.inventoryStock||[]).length,0);
});
test('dueño puede completar, quitar o dejar sin especificar accesorios de un activo existente',()=>{
 const s=service();s.sync([asset('1')]);s.sync([{...s.cloud().assets[0],hasAccessories:true,accessories:[{id:'b',description:'Batería'}],updatedAt:'2026-10-21T21:00:00Z',syncState:'pending'}]);assert.equal(s.cloud().assets[0].accessories[0].description,'Batería');
 s.sync([{...s.cloud().assets[0],hasAccessories:false,accessories:[],updatedAt:'2026-10-21T22:00:00Z',syncState:'pending'}]);assert.equal(s.cloud().assets[0].accessories.length,0);assert.equal(s.cloud().assets[0].serial,'SN-1');
});
test('auxiliar puede registrar accesorios y reintentar, pero no editar fichas mediante reintentos',()=>{
 const s=service(),row=asset('1',{hasAccessories:true,accessories:[{id:'b',description:'Batería ABC'}]});s.sync([row],'assistant');s.sync([row],'assistant');assert.equal(s.cloud().assets.length,1);
 assert.throws(()=>s.sync([{...row,accessories:[{id:'b',description:'Otra batería'}]}],'assistant'),/solo permite agregar/);assert.equal(s.cloud().assets[0].accessories[0].description,'Batería ABC');
});
test('las altas anteriores sin campos de accesorios conservan sus reintentos',()=>{
 const s=service(),row=asset('1');s.sync([row],'assistant');s.sync([row],'assistant');assert.equal(s.cloud().assets.length,1);
});

test('al actualizar el servidor acepta reintentos del formato anterior solo si los accesorios no cambiaron',()=>{
 const s=service(),row=asset('1',{hasAccessories:true,accessories:[{id:'b',description:'Batería'}]});s.sync([row],'assistant');s.legacyFingerprint(row);s.sync([row],'assistant');assert.equal(s.cloud().assets.length,1);
 assert.throws(()=>s.sync([{...row,accessories:[{id:'b',description:'Cambiada'}]}],'assistant'),/solo permite agregar/);
});
