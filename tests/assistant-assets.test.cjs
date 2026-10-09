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
test('auxiliar no edita ni elimina fichas propias o ajenas, ni se apropia de un alta existente',()=>{
 const s=service();s.sync({assets:[asset('1')]});const before=s.cloud();
 for(const update of [{serial:'MODIFICADO'},{deleted:true},{fechaIngreso:'2000-01-01'}])assert.throws(()=>s.sync({assets:[{...before.assets[0],...update,syncState:'pending'}]}),/solo permite agregar/);
 assert.throws(()=>s.sync({assets:[asset('1')]},'otro'),/solo permite agregar/);assert.deepEqual(s.cloud(),before);
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
test('alta y novedad offline viajan juntas; las novedades no permiten cambiar la ficha',()=>{
 const s=service(),novelty={id:'n',assetId:'1',descripcion:'Revista física',ubicacion:'Socavón',estado:'Averiado/a',createdAt:'2026-10-04T13:00:00Z',updatedAt:'2026-10-04T13:00:00Z',syncState:'pending'};
 s.sync({assets:[asset('1')],novelties:[novelty]});assert.equal(s.cloud().assets[0].ubicacion,'Socavón');assert.equal(s.cloud().assets[0].fechaIngreso,'2026-10-01');
 s.sync({assets:[{...s.cloud().assets[0],serial:'NO CAMBIAR',syncState:'pending'}],novelties:[{...novelty,id:'n2',updatedAt:'2026-10-04T14:00:00Z'}]});assert.equal(s.cloud().assets[0].serial,'SERIAL-1');
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
 assert.throws(()=>s.sync({assets:[asset('1',{serial:' sn-global '})]}),/serial.*ya existe/);assert.equal(s.writes(),0);
});
