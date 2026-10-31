const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readFileSync}=require('node:fs'),{join}=require('node:path'),{createHash}=require('node:crypto');
const source=readFileSync(join(__dirname,'../backend/apps-script/Code.gs'),'utf8'),clone=x=>JSON.parse(JSON.stringify(x));
const date='2026-10-04T12:00:00Z';
const asset=(id,extra={})=>({id,clase:'Pulidora',numeroYT:id,numeroClase:id,serial:'SERIAL-'+id,ubicacion:'Bodega de Superficie',estado:'Operativo/a',fechaIngreso:'2026-10-01',createdAt:date,updatedAt:date,syncState:'pending',markingPolicy:'letters-v1',markStatus:'pending',...extra});
function service(seed={}){
 let cloud={updatedAt:date,assets:[],novelties:[],inventoryCriteria:[{id:'ci',name:'Pulidora',isFixedAsset:true,usesSerial:true,requiresInternalMark:true}],...clone(seed)},writes=0,locked=false;
 const ctx=vm.createContext({Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(algorithm,value)=>[...createHash(algorithm).update(value).digest()]},LockService:{getScriptLock:()=>({waitLock(){assert.equal(locked,false);locked=true},releaseLock(){locked=false}})}});
 vm.runInContext(source,ctx);ctx.findFile_=()=> 'file';ctx.readFile_=()=>clone(cloud);ctx.writeFile_=(_,data)=>{assert.ok(locked);cloud=clone(data);writes++};ctx.json_=clone;
 return{cloud:()=>clone(cloud),writes:()=>writes,sync:(data,username='aux',role='assistant')=>ctx.adminSyncAuthorized_(clone(data),cloud.updatedAt,{role,username,name:username})};
}
test('auxiliar crea y recibe el activo con su marca, fecha inicial y autor',()=>{
 const s=service(),result=s.sync({assets:[asset('1',{registeredBy:'suplantado',markSequence:17575,nuevaMarca:'ZZZ'})]});
 assert.equal(result.ok,true);assert.ok(result.data);const saved=s.cloud().assets[0];
 assert.equal(saved.registeredBy,'aux');assert.equal(saved.fechaIngreso,'2026-10-01');assert.equal(saved.nuevaMarca,'AAA');assert.equal(saved.syncState,'synced');assert.equal(s.cloud().assetMarkRegistry.length,1);
});
test('reintentar tras perder la respuesta devuelve la ficha sin duplicarla ni asignar otra marca',()=>{
 const s=service(),original=asset('1');s.sync({assets:[original]});const before=s.cloud(),writes=s.writes();
 const result=s.sync({assets:[original]});assert.ok(result.data);assert.deepEqual(s.cloud(),before);assert.equal(s.writes(),writes);
});
test('el reintento conserva ediciones posteriores del administrador',()=>{
 const s=service(),original=asset('1');s.sync({assets:[original]});
 s.sync({assets:[{...s.cloud().assets[0],serial:'CORREGIDO',updatedAt:'2026-10-05T12:00:00Z',syncState:'pending'}]},'admin','owner');
 const result=s.sync({assets:[original]});assert.equal(result.data.assets[0].serial,'CORREGIDO');assert.equal(s.cloud().assets.length,1);
});
test('auxiliar edita fichas propias y ajenas, corrige fecha y elimina con el mismo historial',()=>{
 for(const creator of ['aux','admin']){
  const s=service();s.sync({assets:[asset('1')]},creator,creator==='admin'?'owner':'assistant');
  let current=s.cloud().assets[0];
  s.sync({assets:[{...current,serial:'MODIFICADO',fechaIngreso:'2000-01-01',updatedAt:'2026-10-06T12:00:00Z',syncState:'pending'}]});
  current=s.cloud().assets[0];assert.equal(current.serial,'MODIFICADO');assert.equal(current.fechaIngreso,'2000-01-01');assert.equal(current.nuevaMarca,'AAA');assert.equal(current.id,'1');
  s.sync({assets:[{...current,deleted:true,deletedBy:'aux',updatedAt:'2026-10-07T12:00:00Z',syncState:'pending'}]});
  assert.equal(s.cloud().assets[0].deleted,true);assert.equal(s.cloud().assets[0].deletedBy,'aux');assert.equal(s.cloud().assets.length,1);assert.equal(s.cloud().assetMarkRegistry.length,1);
 }
});
test('auxiliar puede corregir de nuevo un campo a su valor inicial sin confundirlo con un reintento',()=>{
 const s=service();s.sync({assets:[asset('1')]});
 s.sync({assets:[{...s.cloud().assets[0],serial:'CORREGIDO',updatedAt:'2026-10-05T12:00:00Z',syncState:'pending'}]});
 s.sync({assets:[{...s.cloud().assets[0],serial:'SERIAL-1',updatedAt:'2026-10-06T12:00:00Z',syncState:'pending'}]});
 assert.equal(s.cloud().assets[0].serial,'SERIAL-1');assert.equal(s.cloud().assetMarkRegistry.length,1);
});
test('dos dispositivos y un mismo lote no pueden crear seriales o números duplicados',()=>{
 const s=service();s.sync({assets:[asset('1')]});const before=s.cloud();
 for(const extra of [{serial:'serial-1'},{numeroClase:'1',numeroYT:'1'}])assert.throws(()=>s.sync({assets:[asset('2',extra)]}),/ya existe/);
 assert.deepEqual(s.cloud(),before);
 const batch=service();assert.throws(()=>batch.sync({assets:[asset('1'),asset('2',{serial:'SERIAL-1'})]}),/ya existe/);assert.equal(batch.writes(),0);
 assert.throws(()=>batch.sync({assets:[asset('1'),asset('1')]}),/repetido/);assert.equal(batch.writes(),0);
});
test('altas incompletas, eliminadas o sin criterio activo se rechazan sin escribir',()=>{
 for(const extra of [{numeroClase:'',numeroYT:''},{serial:''},{ubicacion:''},{clase:'Desconocida'},{deleted:true},{createdAt:''}]){const s=service();assert.throws(()=>s.sync({assets:[asset('1',extra)]}));assert.equal(s.writes(),0);}
 const s=service({inventoryCriteria:[{id:'ci',name:'Pulidora',isFixedAsset:true,active:false}]});assert.throws(()=>s.sync({assets:[asset('1')]}),/CLASE activa/);
});
test('alta y novedad offline viajan juntas; una edición de ficha conserva el cambio de estado',()=>{
 const s=service(),novelty={id:'n',assetId:'1',descripcion:'Revista física',ubicacion:'Socavón',estado:'Averiado/a',createdAt:'2026-10-04T13:00:00Z',updatedAt:'2026-10-04T13:00:00Z',syncState:'pending'};
 s.sync({assets:[asset('1')],novelties:[novelty]});assert.equal(s.cloud().assets[0].ubicacion,'Socavón');assert.equal(s.cloud().assets[0].fechaIngreso,'2026-10-01');
 s.sync({assets:[{...s.cloud().assets[0],serial:'NO CAMBIAR',syncState:'pending'}],novelties:[{...novelty,id:'n2',updatedAt:'2026-10-04T14:00:00Z'}]});assert.equal(s.cloud().assets[0].serial,'NO CAMBIAR');assert.equal(s.cloud().novelties.length,2);
});
test('autorrescatadores, YT y columnas conservan su tratamiento sin marca automática',()=>{
 for(const clase of ['Autorrescatador','YT','Columna']){
  const s=service({inventoryCriteria:[{id:'ci',name:clase,isFixedAsset:true,usesSerial:true}]});s.sync({assets:[asset('1',{clase,marcaInterna:'MANUAL',marcaActual:'MANUAL'})]});
  assert.equal(s.cloud().assets[0].marcaInterna,'MANUAL');assert.equal(s.cloud().assets[0].markingPolicy,undefined);assert.equal((s.cloud().assetMarkRegistry||[]).length,0);
 }
});
test('dar acceso a las altas no permite modificar criterios ni importar otros módulos',()=>{
 const s=service();for(const table of ['inventoryCriteria','inventoryStock','parts','incomes'])assert.throws(()=>s.sync({[table]:[{id:'x',syncState:'pending'}]}),/Tu rol no permite/);assert.equal(s.writes(),0);
});
test('auxiliar tampoco puede repetir el serial de otra clase',()=>{
 const s=service({assets:[asset('other',{clase:'Taladro',serial:'SN-GLOBAL',syncState:'synced'})]});
 assert.throws(()=>s.sync({assets:[asset('1',{serial:' sn-global '})]}),/(?:serial.*ya existe|ya existe.*serial)/);assert.equal(s.writes(),0);
});

test('criterio sin serial permite altas de dueño y auxiliar sin marca anterior',()=>{
 for(const role of ['owner','assistant']){
  const s=service({inventoryCriteria:[{id:'ci',name:'Pulidora',isFixedAsset:true,usesSerial:false}]});
  s.sync({assets:[asset('1',{serial:'',marcaPrevia:'',marcaInterna:''})]},'test',role);
  const saved=s.cloud().assets[0];assert.equal(saved.serial,'');assert.ok(saved.id);assert.ok(saved.numeroClase);assert.equal(saved.syncState,'synced');
  assert.equal(s.cloud().assets.length,1);
 }
});
test('criterio cambiado a sin serial en el mismo envío permite guardar el activo',()=>{
 const s=service();s.sync({inventoryCriteria:[{id:'ci',name:'Pulidora',isFixedAsset:true,usesSerial:false,updatedAt:date,syncState:'pending'}],assets:[asset('1',{serial:'',marcaPrevia:''})]},'admin','owner');
 assert.equal(s.cloud().assets.length,1);assert.equal(s.cloud().inventoryCriteria[0].usesSerial,false);
});
test('criterio sin serial no elimina controles de duplicado cuando se proporciona serial',()=>{
 const s=service({inventoryCriteria:[{id:'ci',name:'Pulidora',isFixedAsset:true,usesSerial:false}]});
 s.sync({assets:[asset('1')]},'admin','owner');assert.throws(()=>s.sync({assets:[asset('2',{serial:'SERIAL-1'})]},'admin','owner'),/ya existe/);assert.equal(s.cloud().assets.length,1);
});
test('criterio con serial sigue exigiendo identificación y no acepta un criterio de otra clase',()=>{
 for(const inventoryCriteria of [[{id:'ci',name:'Pulidora',isFixedAsset:true,usesSerial:true}],[{id:'ci',name:'Taladro',isFixedAsset:true,usesSerial:false}]]){
  const s=service({inventoryCriteria});assert.throws(()=>s.sync({assets:[asset('1',{serial:'',criteriaId:'ci'})]},'admin','owner'),/Ingresa el SERIAL/);assert.equal(s.writes(),0);
 }
});

test('los permisos completos de activos no permiten gestionar usuarios ni revertir movimientos',()=>{
 const ctx=vm.createContext({PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'configured'})}});vm.runInContext(source,ctx);
 ctx.adminUsers_=()=>[{role:'owner'}];ctx.verifyAdminToken_=()=>({role:'assistant',username:'aux'});ctx.json_=clone;
 for(const action of ['adminUsersList','accessInvitationCreate','adminUserSave','adminUserDisable','plazaUserAdmin','adminReverseMovement','adminReverseMovementV2','adminDeleteMovement']){
  const result=ctx.doPost({postData:{contents:JSON.stringify({action,token:'test'})}});assert.equal(result.ok,false,action);assert.match(result.error,/rol Administrador principal/,action);
 }
 for(const role of ['plaza_operator','plaza_supervisor','',null])assert.equal(ctx.canManageAssets_({role}),false);
 assert.equal(ctx.canManageAssets_(null),false);
});

test('eliminar una ficha con una novedad offline conserva ambos registros y su historial',()=>{
 const s=service();s.sync({assets:[asset('1')]});
 const deleted={...s.cloud().assets[0],deleted:true,deletedBy:'aux',updatedAt:'2026-10-07T12:00:00Z',syncState:'pending'};
 const novelty={id:'n-offline',assetId:'1',descripcion:'Revista física',ubicacion:'Socavón',estado:'Operativo/a',createdAt:'2026-10-06T12:00:00Z',updatedAt:'2026-10-06T12:00:00Z',syncState:'pending'};
 s.sync({assets:[deleted],novelties:[novelty]});assert.equal(s.cloud().assets[0].deleted,true);assert.equal(s.cloud().novelties[0].id,'n-offline');assert.equal(s.cloud().assetMarkRegistry.length,1);
});
