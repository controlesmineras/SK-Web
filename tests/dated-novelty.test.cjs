const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const history=require('../asset-history.js');
const read=name=>readFileSync(path.join(__dirname,'..',name),'utf8');
const source=read('backend/apps-script/Code.gs');
const copy=value=>JSON.parse(JSON.stringify(value));
const yt={id:'yt',clase:'YT',serial:'YT-test',fechaNovedad:'2026-11-15',horaNovedad:'09:30',descripcionNovedad:'Reparada',estado:'Operativo/a',ubicacion:'Socavón',nombreResponsable:'Luis',areaAsignada:'',updatedAt:'2026-11-15T15:00:00Z'};
function event(id,day,time,details={}){
 return {id,assetId:yt.id,datedNovelty:true,fechaNovedad:day,horaNovedad:time,descripcion:'Revista física',
  syncState:'pending',createdAt:'2026-11-21T18:00:00Z',updatedAt:'2026-11-21T18:00:00Z',...details};
}
function service(extra={}){
 let cloud={assets:[copy(yt)],novelties:[],...extra};
 const api=vm.createContext({LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})}});
 vm.runInContext(source,api);
 Object.assign(api,{findFile_:()=> 'file',readFile_:()=>copy(cloud),writeFile_:(_,data)=>cloud=copy(data),json_:copy});
 return {get:()=>cloud,sync:(rows,role='owner',assets=[])=>api.adminSyncAuthorized_(copy({novelties:rows,assets}),'',{username:'test',role})};
}
test('el navegador y el servicio ejecutan el mismo cálculo de la ficha',()=>{
 const module=read('asset-history.js').split('function createAssetHistory()')[1].split('\nif(typeof module')[0].trim();
 assert.equal(source.split('function createAssetHistory()').at(-1).trim(),module);
});
for(const role of ['owner','admin','assistant'])test(role+' conserva toda la ficha en fechas anteriores y empates, incluidos los campos vacíos',()=>{
 const server=service();
 const older=event('old','2026-11-10','23:59',{estado:'Averiado/a',ubicacion:'Taller',areaAsignada:'Producción'});
 const tie=event('tie','2026-11-15','09:30',{estado:'Extraviado/a',areaAsignada:'Producción'});
 const earlierToday=event('early','2026-11-15','09:29',{estado:'Averiado/a'});
 server.sync([older,tie,earlierToday],role);
 assert.deepEqual(server.get().assets[0],yt);
 const result=history.project(server.get().assets[0],server.get());
 assert.equal(result.asset.areaAsignada,'');assert.equal(result.asset.ubicacion,'Socavón');assert.equal(result.asset.descripcionNovedad,'Reparada');
 assert.equal(result.events.length,3);assert.ok(server.get().novelties.every(row=>row.historyOnly));
 const newer=event('new','2026-11-15','09:31',{estado:'En reparación',ubicacion:' ',areaAsignada:'',bodegueroNombre:'Ana'});
 server.sync([newer],role);server.sync([newer],role);
 const latest=server.get().assets[0];
 assert.equal(latest.estado,'En reparación');assert.equal(latest.ubicacion,'Socavón');assert.equal(latest.nombreResponsable,'Luis');assert.equal(latest.nombreBodeguero,'Ana');
 assert.equal(latest.horaNovedad,'09:31');assert.equal(server.get().novelties.length,4);
});
test('dos dispositivos sin conexión: el segundo compara de nuevo y no reemplaza el evento vigente',()=>{
 const s=service();
 const older=event('out-of-order','2026-11-16','15:00',{estado:'Averiado/a',areaAsignada:'Área antigua'});
 const later=event('latest','2026-11-17','01:00',{estado:'Operativo/a'});
 assert.equal(history.project(yt,{novelties:[older]}).asset.estado,'Averiado/a');
 s.sync([later],'assistant');s.sync([older],'admin');
 assert.equal(s.get().assets[0].estado,'Operativo/a');assert.equal(s.get().assets[0].areaAsignada,'');
 assert.equal(s.get().novelties.find(row=>row.id===older.id).historyOnly,true);
});
test('la fecha visible de Plaza y la de una novedad anterior a esta versión protegen la ficha',()=>{
 for(const extra of [{blendingIncomes:[{assetId:yt.id,id:'income',createdAt:'2026-11-18T15:30:05Z'}]},
   {novelties:[{assetId:yt.id,id:'legacy',descripcion:'Revisión',fechaNovedad:'2026-11-18',horaNovedad:'10:30'}]}]){
  const s=service(extra),tied=event('old','2026-11-18','10:30',{estado:'Averiado/a'});
  s.sync([tied]);assert.deepEqual(s.get().assets[0],yt);assert.equal(s.get().novelties.at(-1).historyOnly,true);
 }
});
test('la primera novedad fecha una ficha sin novedad previa y no inventa datos',()=>{
 const a={id:'yt',estado:'Operativo/a',updatedAt:'2026-11-21T18:00:00Z'};
 const s=service({assets:[a]});s.sync([event('first','2020-01-10','03:00')]);
 const result=s.get().assets[0];assert.equal(result.fechaNovedad,'2020-01-10');assert.equal(result.estado,'Operativo/a');assert.equal(result.ubicacion,undefined);
});
test('las copias antiguas de ficha que acompañan novedades retroactivas tampoco modifican su estado',()=>{
 const s=service(),old=event('legacy','2026-11-10','23:59',{estado:'Averiado/a',ubicacion:'Taller'});delete old.datedNovelty;
 s.sync([old],'assistant',[{...yt,estado:old.estado,ubicacion:old.ubicacion,updatedAt:old.updatedAt,syncState:'pending'}]);
 assert.equal(s.get().assets[0].estado,yt.estado);assert.equal(s.get().assets[0].ubicacion,yt.ubicacion);assert.equal(s.get().novelties[0].historyOnly,true);
});
test('guardar desde el formulario sin conexión conserva los empates, los vacíos y los cambios entre pestañas',async()=>{
 const {IDBFactory}=require('fake-indexeddb'),indexedDB=new IDBFactory();
 const form={querySelector:()=>null,reset(){}},status={},alerts=[];
 async function tab(){
  const window={SKAssetHistory:history,SKAdminAuth:{canView:()=>true},dispatchEvent(){}};
  const ctx=vm.createContext({window,indexedDB,document:{querySelector:()=>status},Event:class{},alert:m=>alerts.push(m)});
  vm.runInContext(read('app.js').split('const PARTS=')[0],ctx);await ctx.openDB();
  Object.assign(ctx,{refresh:async()=>{},update:async()=>{},saving:false,selectedAsset:null,noveltyText:x=>x,isRetirement:()=>false,isRetiredState:()=>false,isVisorChange:()=>false});
  const src=read('novelty-form.js');
  vm.runInContext(src.slice(src.indexOf('async function save(event)'),src.indexOf('\nfunction installAssetPicker')),ctx);
  const save=async row=>{
   ctx.FormData=class{entries(){return Object.entries(row)}};ctx.mark=()=>({id:row.id,createdAt:row.createdAt,updatedAt:row.updatedAt,syncState:'pending'});
   await ctx.save({preventDefault(){},target:form});assert.deepEqual(alerts,[]);
  };
  return {ctx,save};
 }
 const a=await tab(),b=await tab();await a.ctx.put('assets',{...yt,syncState:'synced'});
 await a.save(event('past','2026-11-14','23:59',{estado:'Averiado/a',areaAsignada:'Taller'}));
 assert.match(status.textContent,/solo en el historial/);
 await a.save(event('current','2026-11-15','09:31',{estado:'En reparación',ubicacion:'',areaAsignada:''}));
 await b.save(event('tie','2026-11-15','09:31',{estado:'Extraviado/a',areaAsignada:'Otra'}));
 const [visible]=await b.ctx.all('assets');assert.equal(visible.estado,'En reparación');assert.equal(visible.ubicacion,'Socavón');assert.equal(visible.areaAsignada,'');
 const rows=await b.ctx.all('novelties');
 assert.equal(rows.length,3);assert.equal(rows.find(r=>r.id==='tie').historyOnly,true);assert.equal('ubicacion' in rows.find(r=>r.id==='current'),false);
 const saved=(await a.ctx.storedRows('assets'))[0];assert.equal(saved.estado,yt.estado);assert.equal(saved.syncState,'synced');
 await b.ctx.put('assets',{...visible,observaciones:'Edición independiente',syncState:'pending'});
 const [rawEdit]=await a.ctx.storedRows('assets');assert.equal(rawEdit.estado,yt.estado);assert.equal(rawEdit.observaciones,'Edición independiente');
 assert.equal((await b.ctx.all('assets'))[0].estado,'En reparación');
});
