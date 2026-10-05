const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readFileSync}=require('node:fs'),{join}=require('node:path');
const source=readFileSync(join(__dirname,'../asset-marking.js'),'utf8');
function client({online=true,configured=true,sync}={}){
 const asset={id:'new',clase:'Motosierra',markingPolicy:'letters-v1',markStatus:'pending',syncState:'pending'},calls=[];
 const window={addEventListener(){},skSyncApi:{configured:()=>configured,sync:async options=>{calls.push(options);return sync?sync(asset,calls.length):true}}};
 vm.runInNewContext(source,{window,location:{pathname:'/SK-Web/'},navigator:{onLine:online},localStorage:{getItem:()=>null},all:async()=>[asset]});
 return{asset,calls,run:()=>window.SKAssetMarking.syncSaved(asset)};
}
test('el alta guardada durante otra sincronización se envía al terminar esa operación',async()=>{
 const c=client({sync:(asset,n)=>{if(n===2)Object.assign(asset,{markStatus:'assigned',syncState:'synced',nuevaMarca:'AAA'});return true}});
 assert.equal(await c.run(),true);assert.equal(c.calls.length,2);assert.equal(c.asset.nuevaMarca,'AAA');assert.ok(c.calls.every(options=>options.forceFull));
});
test('la confirmación inmediata no vuelve a enviar ni solicitar otra marca',async()=>{
 const c=client({sync:asset=>{Object.assign(asset,{syncState:'synced',markStatus:'assigned',nuevaMarca:'AAB'});return true}});
 await c.run();assert.equal(c.calls.length,1);assert.equal(c.asset.nuevaMarca,'AAB');
});
test('sin conexión o configuración conserva la solicitud pendiente sin emitir una marca local',async()=>{
 for(const options of [{online:false},{configured:false}]){const c=client(options);assert.equal(await c.run(),false);assert.equal(c.calls.length,0);assert.equal(c.asset.markStatus,'pending');assert.equal(c.asset.nuevaMarca,undefined)}
});
test('si falla el servicio deja el alta pendiente para el reintento normal',async()=>{
 const c=client({sync:()=>false});assert.equal(await c.run(),false);assert.equal(c.calls.length,1);assert.equal(c.asset.syncState,'pending');
});
