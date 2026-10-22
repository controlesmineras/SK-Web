const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const fs=require('node:fs'),path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8'),clone=value=>JSON.parse(JSON.stringify(value));
const date='2026-10-22T12:00:00.000Z',later='2026-10-22T13:00:00.000Z';
const legacy=(id,extra={})=>({id,clase:'Taladro',serial:'SERIAL-'+id,marcaActual:'SK '+id,marcaInterna:'SK '+id,createdAt:date,updatedAt:date,syncState:'synced',...extra});
const issued=()=>legacy('issued',{clase:'Pulidora',nuevaMarca:'AAS',marcaActual:'AAS',marcaInterna:'AAS',markingPolicy:'letters-v1',markStatus:'assigned',markSequence:18,markAssignedAt:date});
const registry=()=>[{id:'issued',code:'AAS',sequence:18,issuedAt:date}];
const edit=(row,patch={})=>({...row,...patch,updatedAt:later,syncState:'pending'});
function backend(assets,marks=registry()){
 let cloud={assets:clone(assets),assetMarkRegistry:clone(marks),novelties:[{id:'history',assetId:'issued'}]},writes=0,locked=false;
 const ctx=vm.createContext({LockService:{getScriptLock:()=>({waitLock(){assert.equal(locked,false);locked=true},releaseLock(){locked=false}})}});
 vm.runInContext(read('backend/apps-script/Code.gs'),ctx);
 ctx.findFile_=()=> 'test';ctx.readFile_=()=>clone(cloud);ctx.writeFile_=(_,value)=>{assert.equal(locked,true);writes++;cloud=clone(value)};ctx.json_=clone;
 return{ctx,cloud:()=>clone(cloud),get writes(){return writes},sync:rows=>ctx.adminSyncAuthorized_({assets:clone(rows)},'',{role:'owner',username:'test'})};
}
test('rechaza AAS copiada a una ficha antigua de otra clase sin cambiar datos ni historial',()=>{
 const old=legacy('legacy'),s=backend([issued(),old]),before=s.cloud();
 assert.throws(()=>s.sync([edit(old,{nuevaMarca:' aas '})]),/marca nueva AAS ya pertenece a Pulidora/);
 assert.equal(s.writes,0);assert.deepEqual(s.cloud(),before);
});
test('la marca sigue reservada por registros históricos, marcas anteriores y activos eliminados',()=>{
 for(const other of [issued(),{...issued(),deleted:true},legacy('issued',{marcaActual:'',marcaInterna:'',marcaPrevia:'AAS'})]){
  const old=legacy('legacy'),s=backend([other,old],[]);assert.throws(()=>s.sync([edit(old,{nuevaMarca:'AAS'})]),/marca nueva AAS/);assert.equal(s.writes,0);
 }
 const old=legacy('legacy'),s=backend([old]);assert.throws(()=>s.sync([edit(old,{nuevaMarca:'AAS'})]),/registro histórico/);assert.equal(s.writes,0);
});
test('detecta dos marcas nuevas iguales en un lote y rechaza el lote completo',()=>{
 const a=legacy('one'),b=legacy('two',{clase:'Motosierra'}),s=backend([a,b],[]),before=s.cloud();
 assert.throws(()=>s.sync([edit(a,{nuevaMarca:'AAA'}),edit(b,{nuevaMarca:'aaa'})]),/marca nueva AAA/);
 assert.equal(s.writes,0);assert.deepEqual(s.cloud(),before);
});
test('un conflicto anterior no bloquea editar otros datos ni se remarca sin decisión del usuario',()=>{
 const old=legacy('legacy',{nuevaMarca:'AAS'}),s=backend([issued(),old]);
 s.sync([edit(old,{ubicacion:'Mina'})]);assert.equal(s.cloud().assets[1].ubicacion,'Mina');assert.equal(s.cloud().assets[1].nuevaMarca,'AAS');
 assert.deepEqual(s.cloud().assetMarkRegistry,registry());assert.equal(s.cloud().novelties.length,1);
});
test('ignora una copia atrasada descartada por la revisión central y permite corregir la copia',()=>{
 const old=legacy('legacy',{nuevaMarca:'AAT',updatedAt:'2026-10-22T14:00:00.000Z'}),s=backend([issued(),old]);
 s.sync([edit(old,{nuevaMarca:'AAS'})]);assert.equal(s.cloud().assets[1].nuevaMarca,'AAT');
 const duplicate=legacy('legacy',{nuevaMarca:'AAS'}),r=backend([issued(),duplicate]);
 r.sync([edit(duplicate,{nuevaMarca:''})]);assert.equal(r.cloud().assets[1].nuevaMarca,'');assert.equal(r.cloud().assets[0].nuevaMarca,'AAS');
});
test('la asignación central conserva AAS y entrega AAT y AAU a solicitudes nuevas y reintentos',()=>{
 const a=legacy('one'),b=legacy('two',{clase:'Motosierra'}),s=backend([issued(),a,b]);
 const request=row=>edit(row,{markRequest:'existing-v1',markingPolicy:'letters-v1',markStatus:'pending'});
 s.sync([request(a),request(b)]);s.sync([request(a),request(b)]);
 assert.deepEqual(s.cloud().assets.map(row=>row.nuevaMarca),['AAS','AAT','AAU']);assert.equal(s.cloud().assetMarkRegistry.length,3);
});
test('Plaza comparte el rechazo de una marca copiada en altas antiguas sin política automática',()=>{
 const s=backend([issued()]);const incoming={...legacy('new',{nuevaMarca:'AAS'}),syncState:'pending'};
 assert.throws(()=>s.ctx.assignAssetMarks_(s.cloud(),[incoming]),/marca nueva AAS/);
});
test('P-AA y PAA son códigos distintos; una copia exacta del prefijo sí se rechaza',()=>{
 const other=legacy('issued',{nuevaMarca:'P-AA',marcaActual:'P-AA',marcaInterna:'P-AA'}),a=legacy('one'),s=backend([other,a],[]);
 s.sync([edit(a,{nuevaMarca:'PAA'})]);assert.equal(s.cloud().assets[1].nuevaMarca,'PAA');
 assert.throws(()=>s.sync([edit(a,{nuevaMarca:'p-aa',updatedAt:'2026-10-22T14:00:00.000Z'})]),/marca nueva P-AA/);
});
test('la ficha impide guardar una nueva marca repetida entre clases, incluso de un activo eliminado',()=>{
 const ctx={window:{}};vm.runInNewContext(read('asset-record-rules.js'),ctx);
 const rules=ctx.window.SKAssetRules,other={...issued(),deleted:true},old=legacy('legacy'),rows=[other,old];
 assert.equal(rules.duplicateNewMark(rows,{...old,nuevaMarca:' aas '}),other);
 assert.equal(rules.duplicateNewMark(rows,{...old,nuevaMarca:'AAT'}),null);
 assert.equal(rules.duplicateNewMark([{...old,nuevaMarca:'AAS'},other],{...old,nuevaMarca:'AAS',ubicacion:'Mina'}),null);
 assert.match(read('asset-admin-ui.js'),/SKAssetRules\.duplicateNewMark\(rows,x\)/);
});
test('abrir una ficha sin nuevaMarca después de AAS limpia el campo antes de guardar',async()=>{
 const assets=[issued(),legacy('legacy')],nodes=new Map();
 const fields=new Proxy({}, {get(object,key){return object[key]||=( {value:'',options:[],replaceChildren(){},add(){}} )}}),form={elements:fields,dataset:{}};
 const ctx={document:{querySelector:selector=>selector==='#assetForm'?form:(nodes.get(selector)||nodes.set(selector,{value:''}).get(selector))},$:selector=>selector==='#assetForm'?form:{},all:async()=>assets,txt:value=>String(value||'').trim(),fillAssignedArea(){},updateAssetFields(){},restoreAssetValue(){},setAssetMode(){},Option:class {}};
 ctx.window={SKAssetHistoryUI:{read:async()=>({personal:[]}),show(){}},SKAssetHistory:{project:asset=>({asset,events:[]})},SKAssetFields:{canonical:asset=>({numeroClase:asset.numeroClase,marcaActual:asset.marcaActual,numeroMarcaActual:asset.numeroMarcaActual})}};
 vm.createContext(ctx);const ui=read('asset-admin-ui.js'),app=read('app.js');
 vm.runInContext(ui.slice(ui.indexOf('async function hydrateEdit(){'),ui.indexOf('window.SKAssetAdminUI={hydrateEdit};'))+'window.SKAssetAdminUI={hydrateEdit};',ctx);
 vm.runInContext(app.slice(app.indexOf('async function editAsset(id){'),app.indexOf('function newAsset(')),ctx);
 await ctx.editAsset('issued');assert.equal(fields.nuevaMarca.value,'AAS');
 await ctx.editAsset('legacy');assert.equal(fields.id.value,'legacy');assert.equal(fields.nuevaMarca.value,'');
});
