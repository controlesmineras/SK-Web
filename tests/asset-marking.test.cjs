const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readFileSync}=require('node:fs'),{join}=require('node:path');
const source=readFileSync(join(__dirname,'../backend/apps-script/Code.gs'),'utf8'),clone=x=>JSON.parse(JSON.stringify(x));
const date='2026-10-02T15:00:00Z';
const asset=(id,clase='Pulidora',extra={})=>({id,clase,numeroYT:id,numeroClase:id,serial:'SERIAL-'+id,criteriaId:'ci',createdAt:date,updatedAt:date,syncState:'pending',markingPolicy:'letters-v1',markStatus:'pending',...extra});
function service(seed={}){
 let cloud={assets:[],inventoryCriteria:[{id:'ci',name:'Pulidora',isFixedAsset:true,requiresInternalMark:true}],...clone(seed)},locked=false;
 const ctx=vm.createContext({LockService:{getScriptLock:()=>({waitLock(){assert.equal(locked,false);locked=true},releaseLock(){locked=false}})}});vm.runInContext(source,ctx);
 ctx.findFile_=()=> 'file';ctx.readFile_=()=>clone(cloud);ctx.writeFile_=(_,data)=>{assert.ok(locked);cloud=clone(data)};ctx.json_=clone;ctx.verifyToken_=()=>({document:'test',role:'plaza_operator'});
 return{ctx,cloud:()=>clone(cloud),admin:data=>ctx.adminSyncAuthorized_(clone(data),cloud.updatedAt,{role:'owner',username:'admin'}),plaza:data=>ctx.plazaSync_({token:'test',since:cloud.updatedAt,data:clone(data)})};
}
test('secuencia A–Z sin Ñ: AAA, AAB, AAZ, ABA, AZZ, BAA, ZZZ y agotamiento',()=>{
 const {ctx}=service();for(const [index,code] of [[0,'AAA'],[1,'AAB'],[25,'AAZ'],[26,'ABA'],[675,'AZZ'],[676,'BAA'],[17575,'ZZZ']])assert.equal(ctx.automaticAssetMarkCode_(index),code);
 assert.throws(()=>ctx.automaticAssetMarkCode_(17576),/agotaron/);
});
test('Admin y Plaza comparten la misma secuencia y devuelven marca definitiva',()=>{
 const s=service();const a=s.admin({assets:[asset('1')]});assert.ok(a.data);assert.equal(a.data.assets[0].marcaInterna,'AAA');
 const p=s.plaza({assets:[asset('2','Taladro')],blendingIncomes:[{id:'i2',itemId:'ci',assetId:'2',quantity:1,createdAt:date,syncState:'pending'}]});
 assert.equal(p.data.assets.find(a=>a.id==='2').nuevaMarca,'AAB');assert.match(p.data.blendingIncomes[0].assetLabel,/AAB/);
 assert.equal(s.cloud().assetMarkRegistry.length,2);
});
test('excluye autorrescatadores, YT y columnas, pero no otros activos',()=>{
 const {ctx}=service();for(const name of ['Autorrescatador','Autorrescatadores','YT','YT28','YT 29','Columna','Columnas'])assert.equal(ctx.usesAutomaticAssetMark_({clase:name}),false,name);
 const s=service();s.admin({assets:['Autorrescatador','YT','Columna','Pulidora'].map((name,i)=>asset(String(i),name))});
 assert.equal(s.cloud().assetMarkRegistry.length,1);assert.equal(s.cloud().assets[3].nuevaMarca,'AAA');
});
test('no remarca activos existentes y salta marcas anteriores incluso dadas de baja',()=>{
 const old={id:'old',clase:'Taladro',marcaInterna:'AAA',estado:'Dado de baja',updatedAt:date},s=service({assets:[old]});
 s.admin({assets:[{...old,syncState:'pending',markingPolicy:'letters-v1',markStatus:'pending'},asset('new')]});
 assert.equal(s.cloud().assets[0].marcaInterna,'AAA');assert.equal(s.cloud().assets[0].markingPolicy,undefined);assert.equal(s.cloud().assets[1].nuevaMarca,'AAB');
});
test('reintentos, ediciones y bajas no reasignan ni liberan una marca emitida',()=>{
 const s=service();s.plaza({assets:[asset('1')]});s.plaza({assets:[asset('1')]});assert.equal(s.cloud().assetMarkRegistry.length,1);
 s.admin({assets:[asset('1','Pulidora',{marcaInterna:'ZZZ',marcaActual:'ZZZ',nuevaMarca:'ZZZ',deleted:true,updatedAt:'2026-10-03T00:00:00Z'})]});
 assert.equal(s.cloud().assets[0].marcaInterna,'AAA');s.admin({assets:[asset('2')]});assert.equal(s.cloud().assets[1].nuevaMarca,'AAB');
});
test('ni el borrado del activo ni una modificación del registro de marcas permite reutilizar',()=>{
 const s=service({assetMarkRegistry:[{id:'deleted-asset',code:'AAA',sequence:0,issuedAt:date}]});
 s.admin({assetMarkRegistry:[{id:'deleted-asset',code:'ZZZ',sequence:17575,syncState:'pending'}],assets:[asset('1')]});assert.equal(s.cloud().assets[0].nuevaMarca,'AAB');assert.equal(s.cloud().assetMarkRegistry[0].code,'AAA');
});
test('un duplicado rechazado no consume otra marca ni escribe parcialmente',()=>{
 const s=service();s.plaza({assets:[asset('1')]});const before=s.cloud();assert.throws(()=>s.plaza({assets:[asset('2','Pulidora',{serial:'SERIAL-1'})]}),/ya existe/);assert.deepEqual(s.cloud(),before);
});
test('reserva también marcas manuales incluidas en el mismo lote de sincronización',()=>{
 const s=service();s.admin({assets:[asset('legacy','YT',{markingPolicy:undefined,marcaInterna:'AAA'}),asset('new')]});assert.equal(s.cloud().assets[1].nuevaMarca,'AAB');
});
test('al agotarse las marcas falla toda la operación sin perder registros previos',()=>{
 const s=service({assetMarkRegistry:[{id:'last',code:'ZZZ',sequence:17575,issuedAt:date}]});const before=s.cloud();assert.throws(()=>s.admin({assets:[asset('1')]}),/agotaron/);assert.deepEqual(s.cloud(),before);
});
test('tras actualizar el servicio completa solicitudes ya sincronizadas, sin remarcar otros activos',()=>{
 for(const method of ['admin','plaza']){
  const s=service({updatedAt:date,assets:[asset('pending','Pulidora',{syncState:'synced'}),{id:'legacy',clase:'Taladro',marcaInterna:'Antigua',updatedAt:date}]});
  const result=s[method]({});assert.ok(result.data);assert.equal(result.data.assets[0].nuevaMarca,'AAA');assert.equal(result.data.assets[1].marcaInterna,'Antigua');assert.equal(s.cloud().assetMarkRegistry.length,1);
  s[method]({});assert.equal(s.cloud().assetMarkRegistry.length,1);
 }
});
test('una novedad del auxiliar conserva la marca automática sin abrir permisos de alta',()=>{
 const s=service();s.admin({assets:[asset('1')]});const data={novelties:[{id:'n',assetId:'1',descripcion:'Revista física',ubicacion:'Mina',estado:'Operativo/a',createdAt:date,updatedAt:date,syncState:'pending'}]};
 const result=s.ctx.adminSyncAuthorized_(data,'',{role:'assistant',username:'aux'});assert.equal(result.data.assets[0].nuevaMarca,'AAA');assert.throws(()=>s.ctx.adminSyncAuthorized_({assets:[asset('2')]},'',{role:'assistant'}));
});
