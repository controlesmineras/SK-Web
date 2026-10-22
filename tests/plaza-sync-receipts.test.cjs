const {test}=require('node:test');
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8'),clone=x=>JSON.parse(JSON.stringify(x));
const source=read('backend/apps-script/Code.gs');
function backend(seed={}){
 let cloud={assets:[],personal:[{id:'recipient',documento:'123'}],inventoryCriteria:[{id:'gloves',name:'Guantes'}],inventoryStock:[{id:'stock-gloves',itemId:'gloves',quantity:100}],blendingIncomes:[],blendingDeliveries:[],...clone(seed)},writes=0,locked=false;
 const ctx=vm.createContext({Utilities:{getUuid:()=>require('node:crypto').randomUUID()},LockService:{getScriptLock:()=>({waitLock(){assert.equal(locked,false);locked=true},releaseLock(){locked=false}})}});
 vm.runInContext(source,ctx);ctx.findFile_=()=> 'file';ctx.readFile_=()=>clone(cloud);ctx.writeFile_=(_,data)=>{assert.ok(locked);cloud=clone(data);writes++};ctx.json_=clone;ctx.verifyToken_=()=>({document:'operator',role:'plaza_operator'});
 return {ctx,cloud:()=>clone(cloud),writes:()=>writes,sync:(data,protocol='plaza-receipts-v1')=>ctx.plazaSync_({token:'test',syncProtocol:protocol,data:clone(data)})};
}
function client(){
 const storage=new Map(),nodes=new Map();
 const node=()=>({value:'',hidden:false,textContent:'',dataset:{},classList:{add(){},remove(){}},setAttribute(){},removeAttribute(){},addEventListener(){}});
 const ctx=vm.createContext({document:{querySelector(selector){if(!nodes.has(selector))nodes.set(selector,node());return nodes.get(selector)}},alert(){},window:{SK_SYNC_CONFIG:{apiUrl:'https://script.google.com/macros/s/test/exec'},alert(){},addEventListener(){},dispatchEvent(){}},sessionStorage:{getItem:key=>key==='skPlazaToken'?'test':key==='skPlazaUser'?JSON.stringify({id:'operator',documento:'operator'}):null},localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},navigator:{onLine:true},console,crypto:require('node:crypto').webcrypto,setTimeout(){return 1},clearTimeout(){},Event:class Event{}});
 vm.runInContext(read('asset-history.js'),ctx);vm.runInContext(read('asset-record-rules.js'),ctx);
 const start=read('plaza/plaza.js').split('  injectItemSearchStyle();setupDeliveryForm();')[0];
 vm.runInContext(start+'\nrender=()=>{};window.audit={sync,mode:value=>{deliveryMode=value},get:()=>data,set:value=>{data=value;localStorage.setItem("skPlazaData",JSON.stringify(value))},post:fn=>{post=fn},periodicSync,refreshSharedPeople,refreshSyncedView,setView:view=>{currentView=view},expireAttempt:()=>{lastSyncAttempt=0},saveDeliveryBatch,prepareDelivery:rows=>{deliveryDraft=rows;validateDeliveryRecipient=()=>true;discardDeliveryForm=()=>{};renderRecentQueries=()=>{}}};})();',ctx);
 return {api:ctx.window.audit,storage,ctx,nodes};
}
const row=(id,extra={})=>({id,syncEventId:'event-'+id,itemId:'gloves',quantity:2,createdAt:'2026-10-14T07:00:00.000Z',updatedAt:'2026-10-14T07:00:00.000Z',syncState:'pending',...extra});
const snapshot=rows=>({personal:[],assets:[],inventoryStock:[],blendingIncomes:rows,blendingDeliveries:[]});

test('proteccion: reintentar el mismo ingreso no duplica filas ni existencias',()=>{
 const b=backend(),r=row('first');b.sync({blendingIncomes:[r]});b.sync({blendingIncomes:[r]});
 assert.equal(b.cloud().blendingIncomes.length,1);assert.equal(b.cloud().inventoryStock[0].quantity,102);
});
test('dos ingresos legítimos en 10 segundos se confirman individualmente',async()=>{
 const b=backend(),c=client(),r1=row('one',{broughtById:'person-A',notes:'Primera remision'}),r2=row('two',{broughtById:'person-B',notes:'Segunda remision',createdAt:'2026-10-14T07:00:10.000Z'});
 c.api.set(snapshot([r1,r2]));c.api.post(async q=>b.sync(q.data));
 assert.equal(await c.api.sync(true),true);assert.equal(b.cloud().blendingIncomes.length,2);assert.equal(b.cloud().inventoryStock[0].quantity,104);
 assert.equal(c.api.get().blendingIncomes.length,2);assert.ok(c.api.get().blendingIncomes.every(r=>r.syncState==='synced'));
});
test('respuesta ok sin datos conserva los pendientes y no muestra éxito',async()=>{
 const c=client();c.api.set(snapshot([row('one')]));c.api.post(async()=>({ok:true}));
 assert.equal(await c.api.sync(true),false);assert.equal(c.api.get().blendingIncomes.length,1);
 assert.equal(JSON.parse(c.storage.get('skPlazaData')).blendingIncomes.length,1);assert.doesNotMatch(c.nodes.get('#syncStatus').textContent,/^Sincronizado/);assert.equal(c.storage.has('skPlazaLastSync'),false);
});
test('proteccion: fallo de red conserva movimientos y el estado pendiente',async()=>{
 const c=client();c.api.set(snapshot([row('one')]));c.api.post(async()=>{throw Error('Network failure')});
 assert.equal(await c.api.sync(true),false);assert.equal(c.api.get().blendingIncomes[0].syncState,'pending');
 assert.equal(JSON.parse(c.storage.get('skPlazaData')).blendingIncomes.length,1);
});
test('una entrega inválida no bloquea un ingreso válido y permanece identificada',async()=>{
 const b=backend(),c=client(),s=snapshot([row('valid-income')]);s.blendingDeliveries=[row('bad-delivery',{quantity:1000,recipientId:'recipient'})];
 c.api.set(s);c.api.post(async q=>b.sync(q.data));assert.equal(await c.api.sync(true),false);
 assert.equal(b.writes(),1);assert.equal(b.cloud().blendingIncomes.length,1);assert.equal(c.api.get().blendingIncomes[0].syncState,'synced');
 assert.equal(c.api.get().blendingDeliveries[0].syncState,'pending');assert.match(c.api.get().blendingDeliveries[0].syncError,/disponibilidad/);assert.match(c.nodes.get('#syncStatus').textContent,/parcial/);
});
test('proteccion: registro nuevo durante el envio se conserva pendiente',async()=>{
 const b=backend(),c=client();c.api.set(snapshot([row('one')]));
 c.api.post(async q=>{c.api.get().blendingIncomes.push(row('two',{createdAt:'2026-10-14T07:02:00Z'}));return b.sync(q.data)});
 assert.equal(await c.api.sync(true),false);assert.equal(c.api.get().blendingIncomes.length,2);
 assert.equal(c.api.get().blendingIncomes.find(r=>r.id==='two').syncState,'pending');
});

test('dos filas iguales del mismo lote son dos movimientos y el reintento no las duplica',()=>{
 const b=backend(),rows=[row('one',{syncEventId:'batch'}),row('two',{syncEventId:'batch'})];
 const first=b.sync({blendingIncomes:rows}),second=b.sync({blendingIncomes:rows});
 assert.equal(b.cloud().blendingIncomes.length,2);assert.equal(b.cloud().inventoryStock[0].quantity,104);
 assert.ok(first.acknowledgements.blendingIncomes.every(r=>r.status==='accepted'));
 assert.ok(second.acknowledgements.blendingIncomes.every(r=>r.status==='already-applied'));
});
test('un lote inválido se revierte completo, mientras un lote independiente avanza',()=>{
 const b=backend(),r=b.sync({blendingIncomes:[row('good-batch'),row('part-one',{syncEventId:'bad-batch'}),row('part-two',{syncEventId:'bad-batch',quantity:0})]});
 assert.deepEqual(b.cloud().blendingIncomes.map(r=>r.id),['good-batch']);assert.equal(b.cloud().inventoryStock[0].quantity,102);
 assert.deepEqual(r.acknowledgements.blendingIncomes.map(r=>r.status),['accepted','rejected','rejected']);
});
test('clientes anteriores conservan atomicidad: el lote inválido no produce éxito parcial',()=>{
 const b=backend();assert.throws(()=>b.sync({blendingIncomes:[row('valid'),row('bad',{quantity:0})]},''),/incompleto/);assert.equal(b.writes(),0);
});
test('una respuesta perdida después de guardar se recupera sin duplicar existencias',async()=>{
 const b=backend(),c=client();c.api.set(snapshot([row('one')]));let first=true;
 c.api.post(async q=>{const result=b.sync(q.data);if(first){first=false;throw Error('Respuesta perdida')}return result});
 assert.equal(await c.api.sync(true),false);assert.equal(c.api.get().blendingIncomes[0].syncState,'pending');
 assert.equal(await c.api.sync(true),true);assert.equal(b.cloud().blendingIncomes.length,1);assert.equal(b.cloud().inventoryStock[0].quantity,102);
});
test('si falla la escritura central no se confirman registros ni se borran pendientes',async()=>{
 const b=backend(),c=client();b.ctx.writeFile_=()=>{throw Error('Drive no disponible')};c.api.set(snapshot([row('one')]));c.api.post(async q=>b.sync(q.data));
 assert.equal(await c.api.sync(true),false);assert.equal(b.cloud().blendingIncomes.length,0);assert.equal(c.api.get().blendingIncomes[0].syncState,'pending');
});
test('servidor antiguo que omite una fila solo confirma las filas presentes y conserva la omitida',async()=>{
 const b=backend(),c=client();c.api.set(snapshot([row('one'),row('two')]));
 c.api.post(async()=>b.sync({blendingIncomes:[row('one')]},''));
 assert.equal(await c.api.sync(true),false);assert.equal(c.api.get().blendingIncomes.length,2);
 assert.equal(c.api.get().blendingIncomes.find(r=>r.id==='two').syncState,'pending');assert.match(c.api.get().blendingIncomes.find(r=>r.id==='two').syncError,/no confirmó/);
 assert.equal(c.api.get().inventoryStock[0].quantity,104);
});
test('recibos incompletos o contradictorios se rechazan sin alterar los datos locales',async()=>{
 for(const corrupt of [r=>{r.acknowledgements.blendingIncomes=[]},r=>{r.data.blendingIncomes=[]},r=>{r.acknowledgements.blendingIncomes[0].status='rejected'},r=>{delete r.data.inventoryStock}]){
  const b=backend(),c=client();c.api.set(snapshot([row('one')]));const before=c.storage.get('skPlazaData');
  c.api.post(async q=>{const r=b.sync(q.data);corrupt(r);return r});
  assert.equal(await c.api.sync(true),false);assert.equal(c.storage.get('skPlazaData'),before);assert.equal(c.storage.has('skPlazaLastSync'),false);
 }
});
test('sin cambios no confirma un envío con registros pendientes',async()=>{
 const c=client();c.api.set(snapshot([row('one')]));c.api.post(async()=>({ok:true,notModified:true}));
 assert.equal(await c.api.sync(true),false);assert.equal(c.api.get().blendingIncomes[0].syncState,'pending');assert.equal(c.storage.has('skPlazaLastSync'),false);
});
test('un colaborador rechazado no bloquea movimientos independientes ni desaparece',async()=>{
 const b=backend(),c=client(),s=snapshot([row('one')]);s.personal=[{id:'bad-person',documento:'456',syncState:'pending',pendingOperation:'create'}];c.api.set(s);
 c.api.post(async q=>{if(q.action==='plazaCollaborator')throw Error('Falta completar el cargo');return b.sync(q.data)});
 assert.equal(await c.api.sync(true),false);assert.equal(b.cloud().blendingIncomes.length,1);
 assert.equal(c.api.get().personal.find(r=>r.id==='bad-person').syncState,'pending');assert.match(c.api.get().personal.find(r=>r.id==='bad-person').syncError,/cargo/);
});
test('un rechazo corregido se confirma sin conservar el mensaje de error',async()=>{
 const b=backend(),c=client(),s=snapshot([row('one',{quantity:0})]);c.api.set(s);c.api.post(async q=>b.sync(q.data));
 assert.equal(await c.api.sync(true),false);assert.ok(c.api.get().blendingIncomes[0].syncError);
 c.api.get().blendingIncomes[0].quantity=2;
 assert.equal(await c.api.sync(true),true);assert.equal(c.api.get().blendingIncomes[0].syncError,undefined);assert.equal(b.cloud().inventoryStock[0].quantity,102);
});

test('una segunda entrega deliberada es válida; volver a enviar el formulario vacío no duplica',async()=>{
 const c=client();c.api.set({personal:[{id:'recipient',nombre:'Persona',documento:'123',area:'Producción',cargo:'Operador'}],assets:[],inventoryCriteria:[{id:'gloves',name:'Guantes'}],inventoryStock:[{id:'stock-gloves',itemId:'gloves',quantity:100}],blendingIncomes:[],blendingDeliveries:[]});
 const button={disabled:false},form={elements:{itemId:{value:''},recipientId:{value:'recipient'},recipientCompany:{value:'SK'}},querySelector:()=>button};
 const draft=()=>[{itemId:'gloves',itemName:'Guantes',quantity:2,notes:''}];
 c.api.prepareDelivery(draft());assert.equal(await c.api.saveDeliveryBatch(form),true);
 assert.equal(await c.api.saveDeliveryBatch(form),false);assert.equal(c.api.get().blendingDeliveries.length,1);
 c.api.prepareDelivery(draft());assert.equal(await c.api.saveDeliveryBatch(form),true);
 const rows=c.api.get().blendingDeliveries;assert.equal(rows.length,2);assert.notEqual(rows[0].id,rows[1].id);assert.notEqual(rows[0].syncEventId,rows[1].syncEventId);
 assert.equal(JSON.parse(c.storage.get('skPlazaData')).blendingDeliveries.length,2);
 assert.equal(rows[0].recipientName,'Persona');assert.equal(rows[0].recipientDocument,'123');assert.equal(rows[0].recipientArea,'Producción');assert.equal(rows[0].recipientCargo,'Operador');
});
test('un alta de activo y su ingreso fallido permanecen juntos sin consumir una marca',()=>{
 const b=backend({inventoryCriteria:[{id:'fixed',name:'Pulidora',isFixedAsset:true},{id:'gloves',name:'Guantes'}]});
 const asset={id:'new-asset',criteriaId:'fixed',clase:'Pulidora',numeroClase:'1',serial:'SERIAL-1',markingPolicy:'letters-v1',markStatus:'pending',syncState:'pending'};
 const result=b.sync({assets:[asset],blendingIncomes:[row('bad-income',{assetId:'new-asset',itemId:'fixed',quantity:0}),row('good-income')]});
 assert.equal(b.cloud().assets.length,0);assert.equal((b.cloud().assetMarkRegistry||[]).length,0);
 assert.deepEqual(b.cloud().blendingIncomes.map(r=>r.id),['good-income']);assert.equal(result.acknowledgements.assets[0].status,'rejected');
});

test('asignación guarda el inventario manual y excluye el activo aunque la ficha antigua vuelva a bodega',async()=>{
 const c=client();const initial={personal:[{id:'recipient',nombre:'Receptor',documento:'123',area:'Desmin - Obras civiles'}],inventoryCriteria:[{id:'saw',name:'Motosierra',isFixedAsset:true}],assets:[{id:'saw1',clase:'Motosierra',serial:'TEST',ubicacion:'Bodega de Superficie'}],blendingIncomes:[],blendingDeliveries:[]};c.api.set(initial);
 const form={elements:{itemId:{value:''},recipientId:{value:'recipient'},recipientCompany:{value:'SK'}},querySelector:()=>({})};
 const draft={itemId:'saw',assetId:'saw1',quantity:1,deliveryType:'ASIGNACIÓN',destinationArea:'Producción',destinationAreaMode:'manual'};
 c.api.prepareDelivery([draft]);assert.equal(await c.api.saveDeliveryBatch(form),true);
 const data=c.api.get(),movement=data.blendingDeliveries[0];assert.equal(movement.destination,'Inventario de Producción');assert.equal(movement.recipientArea,'Desmin - Obras civiles');assert.equal(data.assets[0].ubicacion,'Inventario de Producción');assert.equal(data.personal[0].area,'Desmin - Obras civiles');
 data.assets[0].ubicacion='Bodega de Superficie';c.api.prepareDelivery([draft]);assert.equal(await c.api.saveDeliveryBatch(form),false);assert.equal(data.blendingDeliveries.length,1);
});
test('el destino automático sigue el área del receptor al confirmar y valida todo el lote antes de escribir',async()=>{
 const c=client();c.api.set({personal:[{id:'recipient',nombre:'Receptor',area:'Producción'}],inventoryCriteria:[{id:'saw',name:'Motosierra',isFixedAsset:true}],assets:[{id:'saw1',clase:'Motosierra',serial:'TEST',ubicacion:'Bodega de Superficie'}],blendingIncomes:[],blendingDeliveries:[]});
 const form={elements:{itemId:{value:''},recipientId:{value:'recipient'},recipientCompany:{value:'SK'}},querySelector:()=>({})},draft={itemId:'saw',assetId:'saw1',quantity:1,deliveryType:'ASIGNACIÓN',destinationArea:'Desmin - Obras civiles',destinationAreaMode:'recipient'};
 c.api.prepareDelivery([draft,{...draft}]);assert.equal(await c.api.saveDeliveryBatch(form),false);assert.equal(c.api.get().blendingDeliveries.length,0);assert.equal(c.api.get().assets[0].ubicacion,'Bodega de Superficie');
 c.api.prepareDelivery([draft]);assert.equal(await c.api.saveDeliveryBatch(form),true);assert.equal(c.api.get().blendingDeliveries[0].destination,'Inventario de Producción');
});
test('el backend actual conserva el área destino y rechaza otra asignación del mismo activo',()=>{
 const b=backend({assets:[{id:'asset',clase:'Motosierra',ubicacion:'Bodega de Superficie'}]});
 const assignment=row('assigned',{assetId:'asset',quantity:1,recipientId:'recipient',deliveryType:'ASIGNACIÓN',destinationArea:'Producción',destination:'Inventario de Producción'});
 const result=b.sync({blendingDeliveries:[assignment]});assert.equal(result.ok,true);assert.equal(b.cloud().assets[0].ubicacion,'Inventario de Producción');assert.equal(b.cloud().blendingDeliveries[0].destinationArea,'Producción');
 const second=b.sync({blendingDeliveries:[{...assignment,id:'another',syncEventId:'second'}]});assert.equal(b.cloud().blendingDeliveries.length,1);assert.equal(second.acknowledgements.blendingDeliveries[0].status,'rejected');assert.match(second.acknowledgements.blendingDeliveries[0].error,/ya no está disponible/);assert.equal(b.cloud().assets[0].ubicacion,'Inventario de Producción');
});

const collaborator={id:'person-1',documento:'TEST-123',primerNombre:'Persona',primerApellido:'Prueba',empresa:'SK 3.7',area:'Producción',cargo:'Operador minero',telefono:'111'};
test('ARIS MINING persists for both loans and assignments through the existing backend',async()=>{
 for(const deliveryType of ['ASIGNACIÓN','PRÉSTAMO']){
  const c=client(),destination='A cargo de ARIS MINING',initial={personal:[{id:'recipient',nombre:'Receptor',documento:'123',area:'Producción'}],inventoryCriteria:[{id:'saw',name:'Motosierra',isFixedAsset:true,isEpp:true,allowLoan:true}],assets:[{id:'saw1',clase:'Motosierra',serial:'TEST',ubicacion:'Bodega de Superficie'}],inventoryStock:[{id:'stock',itemId:'other',quantity:10}],blendingIncomes:[],blendingDeliveries:[]};
  c.api.set(clone(initial));
  const form={elements:{itemId:{value:''},recipientId:{value:'recipient'},recipientCompany:{value:'SK'}},querySelector:()=>({})};
  c.api.prepareDelivery([{itemId:'saw',assetId:'saw1',quantity:1,deliveryType,destination,destinationAreaMode:'manual',bringsReplacement:true}]);
  assert.equal(await c.api.saveDeliveryBatch(form),true);
  const local=c.api.get(),movement=local.blendingDeliveries[0];assert.equal(movement.destination,destination);
  assert.equal(Object.hasOwn(movement,'bringsReplacement'),false);
  assert.equal(local.assets[0].ubicacion,destination);assert.equal(local.personal[0].area,'Producción');
  assert.equal(c.ctx.window.SKAssetHistory.project(local.assets[0],local).asset.ubicacion,destination);
  assert.equal(c.ctx.window.SKAssetHistory.available(local.assets[0],local),false);
  const b=backend(initial);b.sync({blendingDeliveries:local.blendingDeliveries});b.sync({blendingDeliveries:local.blendingDeliveries});
  assert.equal(b.cloud().assets[0].ubicacion,destination);assert.equal(b.cloud().blendingDeliveries.length,1);
  assert.equal(b.cloud().inventoryStock[0].quantity,10);assert.equal(b.cloud().personal[0].area,'Producción');
 }
});

test('ARIS recipient company is rejected outside loans and persists on a loan through sync',async()=>{
 const c=client(),initial={personal:[{id:'recipient',nombre:'Receptor',documento:'123',area:'Producción',empresa:'SK 3.7'}],inventoryCriteria:[{id:'saw',name:'Motosierra',isFixedAsset:true,allowLoan:true}],assets:[{id:'saw1',clase:'Motosierra',serial:'TEST',ubicacion:'Bodega de Superficie'}],inventoryStock:[],blendingIncomes:[],blendingDeliveries:[]};
 c.api.set(clone(initial));
 const form={elements:{itemId:{value:''},recipientId:{value:'recipient'},recipientCompany:{value:'ARIS MINING'}},querySelector:()=>({})};
 const draft={itemId:'saw',assetId:'saw1',quantity:1,deliveryType:'PRÉSTAMO',loanProtocol:1,destination:'A cargo de ARIS MINING'};
 c.api.prepareDelivery([draft]);assert.equal(await c.api.saveDeliveryBatch(form),false);assert.equal(c.api.get().blendingDeliveries.length,0);
 c.api.mode('loan');c.api.prepareDelivery([{...draft,deliveryType:'ASIGNACIÓN'}]);assert.equal(await c.api.saveDeliveryBatch(form),false);assert.equal(c.api.get().assets[0].ubicacion,'Bodega de Superficie');
 c.api.prepareDelivery([draft]);assert.equal(await c.api.saveDeliveryBatch(form),true);
 assert.equal(c.api.get().blendingDeliveries[0].recipientCompany,'ARIS MINING');
 assert.equal(c.api.get().personal[0].empresa,'SK 3.7');
 const b=backend(initial);c.api.post(async q=>b.sync(q.data));assert.equal(await c.api.sync(true),true);
 assert.equal(b.cloud().blendingDeliveries[0].recipientCompany,'ARIS MINING');
 assert.equal(b.cloud().blendingDeliveries[0].recipientId,'recipient');assert.equal(b.cloud().personal[0].empresa,'SK 3.7');
});
test('editar desde dos Plazas invalida las copias de otros dispositivos y de Admin',()=>{
 const b=backend({updatedAt:'2026-10-21T00:00:00.000Z',personal:[collaborator]});
 const cached=b.ctx.plazaSync_({token:'test',data:{}}).updatedAt;
 b.ctx.plazaCollaborator_({token:'test',update:true,collaborator:{...collaborator,telefono:'222'}});
 const first=b.ctx.plazaSync_({token:'test',since:cached,data:{}});
 assert.equal(first.notModified,undefined);assert.equal(first.data.personal[0].telefono,'222');
 b.ctx.plazaCollaborator_({token:'test',update:true,collaborator:{...collaborator,telefono:'333'}});
 const second=b.ctx.adminSync_({},first.updatedAt,{role:'owner'});
 assert.equal(second.notModified,undefined);assert.equal(second.data.personal[0].telefono,'333');
 assert.notEqual(second.updatedAt,first.updatedAt);assert.equal(b.cloud().personal.length,1);
});
test('Plaza descarga colaboradores aunque un servidor antiguo no cambie su fecha global',async()=>{
 const c=client(),b=backend({updatedAt:'old-revision',personal:[{...collaborator,telefono:'999'}]});
 c.api.set({...snapshot([]),personal:[collaborator]});c.storage.set('skPlazaServerUpdatedAt','old-revision');
 c.api.post(async q=>{assert.equal(q.since,'');const result=b.ctx.plazaSync_(q);delete result.capabilities.collaboratorRevisionsV1;return result});
 assert.equal(await c.api.sync(true),true);assert.equal(c.api.get().personal[0].telefono,'999');
});
test('Plaza conserva una edición local que se hace mientras confirma la anterior',async()=>{
 const c=client(),b=backend({personal:[collaborator]});
 c.api.set({...snapshot([]),personal:[{...collaborator,telefono:'222',syncState:'pending',pendingOperation:'update'}]});
 c.api.post(async q=>{if(q.action==='plazaCollaborator'){const result=b.ctx.plazaCollaborator_(q);c.api.get().personal[0].telefono='333';return result}return b.ctx.plazaSync_(q)});
 assert.equal(await c.api.sync(true),false);assert.equal(c.api.get().personal[0].telefono,'333');assert.equal(c.api.get().personal[0].syncState,'pending');assert.equal(b.cloud().personal[0].telefono,'222');
});

test('la revisión del servidor crece incluso cuando dos ediciones comparten el mismo milisegundo',()=>{
 const future='2099-01-01T00:00:00.000Z',b=backend({updatedAt:future,personal:[collaborator]});
 b.ctx.plazaCollaborator_({token:'test',update:true,collaborator:{...collaborator,telefono:'222'}});const first=b.cloud().updatedAt;
 b.ctx.plazaCollaborator_({token:'test',update:true,collaborator:{...collaborator,telefono:'333'}});
 assert.ok(Date.parse(first)>Date.parse(future));assert.ok(Date.parse(b.cloud().updatedAt)>Date.parse(first));
});
test('Plaza usa la revisión solo después de confirmarla y la consulta manual siempre descarga',async()=>{
 const c=client(),b=backend({updatedAt:'2026-10-21T00:00:00.000Z',personal:[collaborator]}),requests=[];
 c.api.set(snapshot([]));c.api.post(async q=>{requests.push(q);return b.ctx.plazaSync_(q)});
 assert.equal(await c.api.sync(true),true);assert.equal(await c.api.sync(true),true);assert.equal(await c.api.sync(false),true);
 assert.equal(requests[0].since,'');assert.equal(requests[1].since,b.cloud().updatedAt);assert.equal(requests[2].since,'');
});

test('Plaza asigna a Bodega Plaza Blending, conserva al receptor y sincroniza sin duplicar',async()=>{
 const area='Bodega Plaza Blending',c=client();const initial={personal:[{id:'recipient',nombre:'Receptor',documento:'123',area:'Producción'}],inventoryCriteria:[{id:'tool',name:'Taladro',isFixedAsset:true}],assets:[{id:'tool1',clase:'Taladro',serial:'TEST',ubicacion:'Bodega de Superficie'}],blendingIncomes:[],blendingDeliveries:[]};c.api.set(initial);
 const form={elements:{itemId:{value:''},recipientId:{value:'recipient'},recipientCompany:{value:'SK'}},querySelector:()=>({})};
 c.api.prepareDelivery([{itemId:'tool',assetId:'tool1',quantity:1,deliveryType:'ASIGNACIÓN',destinationArea:area,destinationAreaMode:'manual'}]);
 assert.equal(await c.api.saveDeliveryBatch(form),true);assert.equal(c.api.get().personal[0].area,'Producción');
 const b=backend({...initial,assets:[{id:'tool1',clase:'Taladro',serial:'TEST',ubicacion:'Bodega de Superficie'}],blendingDeliveries:[]});c.api.post(q=>b.sync(q.data));assert.equal(await c.api.sync(true),true,c.nodes.get('#syncStatus')?.textContent);assert.equal(await c.api.sync(true),true);
 assert.equal(b.cloud().blendingDeliveries.length,1);assert.equal(b.cloud().blendingDeliveries[0].destinationArea,area);
 assert.equal(c.ctx.window.SKAssetHistory.project(b.cloud().assets[0],b.cloud()).asset.areaAsignada,area);
});
test('Plaza sincroniza desde un formulario sin redibujar ni borrar lo que se está diligenciando',async()=>{
 const c=client(),b=backend();c.api.set(snapshot([]));let calls=0;c.api.post(q=>{calls++;return b.sync(q.data)});
 const values={recipientCompany:'SK',itemId:'gloves',recipientId:'recipient',destination:'',notes:'Texto sin guardar',quantity:'5'};
 c.nodes.set('#deliveryForm',{elements:Object.fromEntries(Object.entries(values).map(([key,value])=>[key,{value}]))});
 c.api.setView('delivery');c.api.periodicSync();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(calls,1);assert.ok(c.storage.has('skPlazaLastSync'));assert.equal(c.nodes.get('#deliveryForm').elements.notes.value,values.notes);assert.equal(c.nodes.get('#deliveryForm').elements.quantity.value,'5');
 c.api.expireAttempt();c.api.refreshSharedPeople();await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,2);
});
test('Plaza no superpone la consulta periódica y la de volver a la app',async()=>{
 const c=client();c.api.set(snapshot([]));let calls=0,finish;c.api.post(()=>{calls++;return new Promise(resolve=>finish=resolve)});
 c.api.periodicSync();await new Promise(resolve=>setImmediate(resolve));c.api.periodicSync();c.api.refreshSharedPeople();assert.equal(calls,1);
 finish({ok:true,notModified:true});await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,1);
 c.ctx.navigator.onLine=false;c.api.periodicSync();assert.equal(calls,1);
});
