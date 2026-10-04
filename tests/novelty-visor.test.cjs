const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const source=readFileSync(require('node:path').join(__dirname,'../backend/apps-script/Code.gs'),'utf8');
const clone=value=>JSON.parse(JSON.stringify(value));
function service(){
 let cloud={updatedAt:'2026-09-01T00:00:00Z',assets:[{id:'ar',clase:'Autorrescatador',serial:'S-123',estadoVisor:'Azul celeste',ubicacion:'Bodega',estado:'Pendiente de inspección',updatedAt:'2026-09-01T00:00:00Z'},{id:'yt',clase:'YT',serial:'YT-1'}],novelties:[]};
 const context=vm.createContext({LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})}});
 vm.runInContext(source,context);context.findFile_=()=> 'central';context.readFile_=()=>clone(cloud);context.writeFile_=(_,data)=>{cloud=clone(data)};context.json_=clone;
 return{sync:(data,role='assistant')=>context.adminSyncAuthorized_(clone(data),cloud.updatedAt,{role,username:'tester',name:'Prueba'}),cloud:()=>clone(cloud)};
}
const novelty=(extra={})=>({id:'n1',assetId:'ar',descripcion:'Cambio de color del visor',estadoVisor:'Negro',estadoVisorAnterior:'Azul celeste',ubicacion:'Bodega',estado:'Pendiente de inspección',createdAt:'2026-10-02T10:00:00Z',updatedAt:'2026-10-02T10:00:00Z',syncState:'pending',...extra});
test('auxiliar sincroniza color e historial sin permiso general sobre la ficha',()=>{
 const s=service(),asset=s.cloud().assets[0];
 const result=s.sync({novelties:[novelty()],assets:[{...asset,estadoVisor:'Negro',serial:'NO CAMBIAR',syncState:'pending'}]});
 assert.equal(result.ok,true);assert.ok(result.data);assert.equal(s.cloud().assets[0].estadoVisor,'Negro');assert.equal(s.cloud().assets[0].serial,'S-123');assert.equal(s.cloud().novelties[0].estadoVisorAnterior,'Azul celeste');assert.equal(s.cloud().novelties[0].registeredBy,'tester');
});
test('ambos roles rechazan color en otra clase, color vacío y tipo equivocado',()=>{
 for(const role of ['owner','assistant'])for(const extra of [{assetId:'yt'},{estadoVisor:''},{descripcion:'Revista física'}]){
  const s=service();assert.throws(()=>s.sync({novelties:[novelty(extra)]},role));assert.equal(s.cloud().novelties.length,0);
 }
});
test('auxiliar rechaza altas incompletas, fichas sin novedad y otros catálogos',()=>{
 for(const data of [{assets:[{id:'new',syncState:'pending'}]},{assets:[{id:'ar',estadoVisor:'Blanco',syncState:'pending'}]},{inventoryCriteria:[{id:'catalog',syncState:'pending'}]}])assert.throws(()=>service().sync(data));
});
test('reintentar no duplica la novedad ni revierte un color más reciente',()=>{
 const s=service(),first=novelty(),later=novelty({id:'n2',estadoVisor:'Amarillo',estadoVisorAnterior:'Negro',createdAt:'2026-10-02T11:00:00Z',updatedAt:'2026-10-02T11:00:00Z'});
 s.sync({novelties:[first]});s.sync({novelties:[later]});assert.equal(s.sync({novelties:[first]}).ok,true);
 assert.equal(s.cloud().novelties.length,2);assert.equal(s.cloud().assets[0].estadoVisor,'Amarillo');
 assert.throws(()=>s.sync({novelties:[{...first,estadoVisor:'Marrón'}]}));
});
test('varias novedades offline mantienen el último color sin depender del orden',()=>{
 const s=service();s.sync({novelties:[novelty({id:'n2',estadoVisor:'Amarillo',updatedAt:'2026-10-02T11:00:00Z'}),novelty()]});
 assert.equal(s.cloud().assets[0].estadoVisor,'Amarillo');assert.equal(s.cloud().novelties.length,2);
});
test('las novedades comunes conservan el color y el administrador guarda su cambio',()=>{
 const s=service();s.sync({novelties:[novelty({descripcion:'Revista física',estadoVisor:undefined})]});assert.equal(s.cloud().assets[0].estadoVisor,'Azul celeste');
 const asset=s.cloud().assets[0];s.sync({novelties:[novelty({id:'n2'})],assets:[{...asset,estadoVisor:'Negro',updatedAt:'2026-10-02T11:00:00Z',syncState:'pending'}]},'owner');assert.equal(s.cloud().assets[0].estadoVisor,'Negro');
});
