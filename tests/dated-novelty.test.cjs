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
  Object.assign(ctx,{refresh:async()=>{},update:async()=>{},saving:false,selectedAsset:null,noveltyText:x=>x,requiresActa:()=>false,isRetiredState:()=>false,isVisorChange:()=>false});
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

function cancel(row,kind='revert',id='undo-'+row.id){
 return {...copy(row),updatedAt:'2026-11-21T20:00:00Z',syncState:'pending',
  noveltyAction:{id,kind,status:'pending',requestedAt:'2026-11-21T20:00:00Z'}};
}
for(const kind of ['revert','delete'])test(kind+' restaura todos los campos informados y el evento anterior en una sola sincronización',()=>{
 const initial={...yt,estadoVisor:'Azul',documentoResponsable:'100',nombreBodeguero:'Ana',documentoBodeguero:'200'};
 const s=service({assets:[initial]});
 s.sync([event('wrong-date','2026-11-21','12:00',{estado:'Averiado/a',ubicacion:'Taller',areaAsignada:'Producción',responsableNombre:'Otro',documentoResponsable:'300',bodegueroNombre:'Otra',documentoBodeguero:'400'})]);
 const row=s.get().novelties[0];assert.equal(row.assetBefore.estado,'Operativo/a');assert.equal(row.assetAfter.estado,'Averiado/a');
 const action=cancel(row,kind);s.sync([action]);
 for(const field of ['fechaNovedad','horaNovedad','descripcionNovedad','estado','ubicacion','areaAsignada','nombreResponsable','documentoResponsable','nombreBodeguero','documentoBodeguero','estadoVisor'])
  assert.equal(s.get().assets[0][field],initial[field],field);
 assert.equal(s.get().novelties[0][kind==='delete'?'deleted':'reversed'],true);
 const restored=history.project(s.get().assets[0],s.get()).asset;assert.equal(restored.estado,'Operativo/a');assert.equal(restored.fechaNovedad,yt.fechaNovedad);
 const after=copy(s.get().assets[0]);s.sync([action]);assert.deepEqual(s.get().assets[0],after);
 s.sync([{...row,updatedAt:'2030-01-01T00:00:00Z',syncState:'pending'}]);
 assert.equal(s.get().novelties[0][kind==='delete'?'deleted':'reversed'],true);
});
test('revertir una novedad anterior conserva los datos expresos de una posterior; al revertir ambas recupera la ficha original',()=>{
 const s=service();
 s.sync([event('a','2026-11-16','10:00',{estado:'Averiado/a',ubicacion:'Taller',areaAsignada:'Producción'})]);
 s.sync([event('b','2026-11-17','10:00',{estado:'Averiado/a',responsableNombre:'Pedro'})]);
 s.sync([cancel(s.get().novelties.find(r=>r.id==='a'))]);
 assert.equal(s.get().assets[0].estado,'Averiado/a');assert.equal(s.get().assets[0].ubicacion,'Socavón');
 assert.equal(s.get().assets[0].nombreResponsable,'Pedro');assert.equal(s.get().assets[0].fechaNovedad,'2026-11-17');
 s.sync([cancel(s.get().novelties.find(r=>r.id==='b'))]);
 const current=s.get().assets[0];assert.equal(current.estado,yt.estado);assert.equal(current.ubicacion,yt.ubicacion);
 assert.equal(current.areaAsignada,yt.areaAsignada);assert.equal(current.nombreResponsable,yt.nombreResponsable);
 assert.equal(current.fechaNovedad,yt.fechaNovedad);
});
test('eliminar después de revertir conserva la ficha restaurada y oculta el registro',()=>{
 const s=service();s.sync([event('a','2026-11-16','10:00',{estado:'Averiado/a'})]);
 s.sync([cancel(s.get().novelties[0])]);const restored=copy(s.get().assets[0]);
 s.sync([cancel(s.get().novelties[0],'delete','delete-a')]);
 assert.deepEqual(s.get().assets[0],restored);assert.equal(history.timeline(s.get(),yt.id).length,0);
});
test('una novedad histórica se puede eliminar sin mover la ficha y una posterior de Plaza conserva su ubicación',()=>{
 const s=service();s.sync([event('old','2020-11-16','10:00',{estado:'Averiado/a'})]);
 s.sync([cancel(s.get().novelties[0],'delete')]);assert.deepEqual(s.get().assets[0],yt);
 s.sync([event('wrong','2026-11-16','10:00',{estado:'Averiado/a',ubicacion:'Taller'})]);
 s.get().blendingIncomes=[{id:'income',assetId:yt.id,createdAt:'2026-11-17T12:00:00Z'}];
 s.get().assets[0].ubicacion='Bodega de Superficie';
 s.sync([cancel(s.get().novelties.find(r=>r.id==='wrong'))]);
 const current=history.project(s.get().assets[0],s.get()).asset;
 assert.equal(current.estado,yt.estado);assert.equal(current.ubicacion,'Bodega de Superficie');assert.equal(current.fechaNovedad,'2026-11-17');
});
test('los registros antiguos sin copia de la ficha recuperan los valores conocidos de la novedad anterior',()=>{
 const previous={...event('before','2026-11-10','10:00',{estado:'Operativo/a',ubicacion:'Socavón',responsableNombre:'Luis'}),datedNovelty:false,syncState:'synced'};
 const bad={...event('wrong','2026-11-21','10:00',{estado:'Averiado/a',ubicacion:'Taller',responsableNombre:'Pedro'}),datedNovelty:false,syncState:'synced'};
 const s=service({novelties:[previous,bad],assets:[{...yt,estado:'Averiado/a',ubicacion:'Taller',nombreResponsable:'Pedro',fechaNovedad:'2026-11-21',horaNovedad:'10:00',descripcionNovedad:'Revista física'}]});
 s.sync([cancel(bad)]);
 const current=history.project(s.get().assets[0],s.get()).asset;
 assert.equal(current.estado,'Operativo/a');assert.equal(current.ubicacion,'Socavón');assert.equal(current.nombreResponsable,'Luis');assert.equal(current.fechaNovedad,'2026-11-10');
});
test('un auxiliar no puede revertir ni eliminar y una acción cancelada aún sin enviar nunca modifica la ficha central',()=>{
 const s=service(),row=event('offline','2026-11-21','12:00',{estado:'Averiado/a'});
 assert.throws(()=>s.sync([cancel(row)],'assistant'),/Administrador/);assert.equal(s.get().novelties.length,0);
 s.sync([cancel(row)]);assert.deepEqual(s.get().assets[0],yt);assert.equal(s.get().novelties[0].reversed,true);
});
async function localReversals(){
 const {IDBFactory}=require('fake-indexeddb'),{webcrypto}=require('node:crypto'),status={};
 const window={SKAssetHistory:history,SKAdminAuth:{isAdmin:()=>true,user:()=>({username:'test'})},addEventListener(){},dispatchEvent(){}};
 const ctx=vm.createContext({window,indexedDB:new IDBFactory(),crypto:webcrypto,confirm:()=>true,alert:message=>{throw new Error(message)},
  document:{querySelector:()=>status,addEventListener(){}},Event:class{},refresh:async()=>{}});
 vm.runInContext(read('app.js').split('const PARTS=')[0],ctx);await ctx.openDB();
 vm.runInContext(read('asset-history-ui.js'),ctx);
 return {ctx,ui:window.SKAssetHistoryUI,status,db:vm.runInContext('db',ctx)};
}
test('revertir una novedad local y eliminarla después corrige la ficha visible sin enviar una copia de activo',async()=>{
 const c=await localReversals();await c.ctx.put('assets',{...yt,syncState:'synced'});
 const first=event('local','2026-11-21','12:00',{estado:'Averiado/a'});
 await c.ctx.put('novelties',first);assert.equal((await c.ctx.all('assets'))[0].estado,'Averiado/a');
 await c.ui.changeNovelty(first.id,'revert');assert.equal((await c.ctx.all('assets'))[0].estado,yt.estado);
 assert.equal((await c.ctx.all('novelties'))[0].reversed,true);assert.equal((await c.ctx.storedRows('assets'))[0].syncState,'synced');
 await c.ui.changeNovelty(first.id,'delete');assert.equal((await c.ctx.all('novelties'))[0].deleted,true);
 assert.equal((await c.ctx.all('assets'))[0].estado,yt.estado);assert.match(c.status.textContent,/eliminada/);
});
test('reversión local de un registro confirmado restaura los campos y tolera la doble proyección de la consulta',async()=>{
 const s=service();s.sync([event('saved','2026-11-21','12:00',{estado:'Averiado/a',ubicacion:'Taller'})]);
 const c=await localReversals();await c.ctx.put('assets',s.get().assets[0]);await c.ctx.put('novelties',s.get().novelties[0]);
 await c.ui.changeNovelty('saved','revert');
 const [current]=await c.ctx.all('assets'),data={novelties:await c.ctx.all('novelties')};
 assert.equal(current.estado,yt.estado);assert.equal(current.ubicacion,yt.ubicacion);
 assert.equal(history.project(current,data).asset.estado,yt.estado);
 s.sync(data.novelties);assert.equal(s.get().assets[0].estado,yt.estado);
});
test('una confirmación cancelada o una transacción fallida no altera el registro ni su efecto',async()=>{
 const c=await localReversals();await c.ctx.put('assets',{...yt,syncState:'synced'});await c.ctx.put('novelties',event('a','2026-11-21','12:00',{estado:'Averiado/a'}));
 c.ctx.confirm=()=>false;assert.equal(await c.ui.changeNovelty('a','delete'),false);assert.equal((await c.ctx.all('novelties'))[0].deleted,undefined);
 c.ctx.confirm=()=>true;
 const transaction=c.db.transaction.bind(c.db);
 c.db.transaction=(...args)=>{
  const tx=transaction(...args);if(args[1]==='readwrite'){const table=tx.objectStore('novelties'),put=table.put.bind(table);table.put=row=>{const result=put(row);tx.abort();return result;};}return tx;
 };
 await assert.rejects(c.ui.changeNovelty('a','revert'));c.db.transaction=transaction;
 assert.equal((await c.ctx.all('novelties'))[0].reversed,undefined);assert.equal((await c.ctx.all('assets'))[0].estado,'Averiado/a');
});
test('la respuesta de un envío en curso mantiene la reversión local y usa la copia anterior confirmada',async()=>{
 const s=service(),a=event('a','2026-11-16','12:00',{estado:'Averiado/a'}),b=event('b','2026-11-17','12:00',{ubicacion:'Taller'});
 const c=await localReversals();await c.ctx.put('assets',{...yt,syncState:'synced'});await c.ctx.put('novelties',a);await c.ctx.put('novelties',b);
 await c.ui.changeNovelty('a','revert');s.sync([a,b]);
 await c.ctx.replaceStoreRows('assets',s.get().assets,[]);
 await c.ctx.replaceStoreRows('novelties',s.get().novelties,[a,b]);
 assert.equal((await c.ctx.all('novelties')).find(row=>row.id==='a').noveltyAction.localOnly,false);
 assert.equal((await c.ctx.all('assets'))[0].estado,yt.estado);assert.equal((await c.ctx.all('assets'))[0].ubicacion,'Taller');
});
test('al revertir después un movimiento de Plaza tampoco reaparece la novedad anulada',()=>{
 const s=service();s.sync([event('wrong','2026-11-16','10:00',{estado:'Averiado/a',ubicacion:'Taller',responsableNombre:'Pedro'})]);
 s.get().blendingIncomes=[{id:'later',assetId:yt.id,createdAt:'2026-11-17T15:00:00Z',broughtByName:'Juan'}];
 s.get().assets[0].ubicacion='Bodega de Superficie';
 s.sync([cancel(s.get().novelties[0])]);
 assert.equal(history.project(s.get().assets[0],s.get()).asset.nombreResponsable,'Juan');
 s.get().blendingIncomes[0].reversed=true;
 const result=history.project(s.get().assets[0],s.get()).asset;
 assert.equal(result.fechaNovedad,yt.fechaNovedad);assert.equal(result.nombreResponsable,yt.nombreResponsable);
});
test('revertir la fecha equivocada y registrar la correcta en el mismo envío aplica la fecha corregida',()=>{
 const s=service();s.sync([event('incorrecta','2026-11-21','12:00',{estado:'Averiado/a',ubicacion:'Taller'})]);
 const revert=cancel(s.get().novelties[0]),correct=event('correcta','2026-11-16','08:00',{estado:'Averiado/a'});
 s.sync([correct,revert]);
 const current=s.get().assets[0];
 assert.equal(current.fechaNovedad,'2026-11-16');assert.equal(current.horaNovedad,'08:00');
 assert.equal(current.estado,'Averiado/a');assert.equal(current.ubicacion,yt.ubicacion);
 assert.equal(s.get().novelties.find(row=>row.id==='correcta').historyOnly,false);
});

test('la baja fija ubicación y disponibilidad, admite reversión y respeta la fecha de una novedad antigua',()=>{
 const s=service();
 for(const state of ['Dada de baja','Dado de baja','Dado/a de baja']){
  assert.equal(history.operationStatus({estado:state}), 'No');
  assert.equal(history.project({estado:state,ubicacion:'Taller'},{}).asset.ubicacion,'Desechado/a');
 }
 s.sync([event('past','2026-11-12','08:00',{descripcion:'Dada de baja'})]);
 assert.equal(s.get().assets[0].estado,yt.estado);
 s.sync([event('retired','2026-11-16','11:00',{descripcion:'Dado de baja',ubicacion:'Taller',estado:'Operativo/a'})]);
 const current=s.get().assets[0];
 assert.equal(current.ubicacion,'Desechado/a');assert.equal(current.disponibleEntrega,'No');
 s.sync([], 'owner',[{...yt,assetDetailsOnly:true,serial:'SN-nuevo',syncState:'pending',updatedAt:'2026-12-01T10:00:00Z'}]);
 const edited=s.get().assets[0];assert.equal(edited.serial,'SN-nuevo');assert.equal(edited.currentNoveltyId,'retired');assert.equal(edited.ubicacion,'Desechado/a');assert.equal(edited.disponibleEntrega,'No');
 assert.equal(edited.assetDetailsOnly,undefined);
 s.sync([cancel(s.get().novelties.find(row=>row.id==='retired'))]);
 assert.equal(s.get().assets[0].estado,yt.estado);assert.equal(s.get().assets[0].ubicacion,yt.ubicacion);assert.equal(s.get().assets[0].disponibleEntrega,'Sí');
});

test('eliminar y registrar la misma novedad al mismo minuto conserva solo la segunda en el historial',()=>{
 const s=service();
 const original=event('original','2026-11-18','08:00',{estado:'Averiado/a'});
 s.sync([original]);
 const deleted=cancel(s.get().novelties[0],'delete');
 const replacement={...original,id:'replacement'};
 for(const batch of [[replacement,deleted],[deleted,replacement]]){
  s.sync(batch);
  assert.deepEqual(history.timeline(s.get(),yt.id).map(e=>e.raw.id),['replacement']);
  assert.equal(s.get().assets[0].currentNoveltyId,'replacement');
  assert.equal(s.get().novelties.find(row=>row.id==='original').deleted,true);
 }
});
