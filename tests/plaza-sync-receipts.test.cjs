const {test}=require('node:test');
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8'),clone=x=>JSON.parse(JSON.stringify(x));
const source=read('backend/apps-script/Code.gs');
function backend(seed={}){
 let cloud={assets:[],personal:[{id:'recipient',documento:'123'}],inventoryCriteria:[{id:'gloves',name:'Guantes'}],inventoryStock:[{id:'stock-gloves',itemId:'gloves',quantity:100}],blendingIncomes:[],blendingDeliveries:[],...clone(seed)},writes=0,locked=false;
 const ctx=vm.createContext({LockService:{getScriptLock:()=>({waitLock(){assert.equal(locked,false);locked=true},releaseLock(){locked=false}})}});
 vm.runInContext(source,ctx);ctx.findFile_=()=> 'file';ctx.readFile_=()=>clone(cloud);ctx.writeFile_=(_,data)=>{assert.ok(locked);cloud=clone(data);writes++};ctx.json_=clone;ctx.verifyToken_=()=>({document:'operator',role:'plaza_operator'});
 return {ctx,cloud:()=>clone(cloud),writes:()=>writes,sync:(data,protocol='plaza-receipts-v1')=>ctx.plazaSync_({token:'test',syncProtocol:protocol,data:clone(data)})};
}
function client(){
 const storage=new Map(),nodes=new Map();
 const node=()=>({value:'',hidden:false,textContent:'',dataset:{},classList:{add(){},remove(){}},setAttribute(){},removeAttribute(){},addEventListener(){}});
 const ctx=vm.createContext({document:{querySelector(selector){if(!nodes.has(selector))nodes.set(selector,node());return nodes.get(selector)}},alert(){},window:{alert(){},addEventListener(){},dispatchEvent(){}},sessionStorage:{getItem(){return null}},localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},navigator:{onLine:true},console,crypto:require('node:crypto').webcrypto,setTimeout(){return 1},clearTimeout(){},Event:class Event{}});
 const start=read('plaza/plaza.js').split('  injectItemSearchStyle();setupDeliveryForm();')[0];
 vm.runInContext(start+'\nrender=()=>{};window.audit={sync,get:()=>data,set:value=>{data=value;localStorage.setItem("skPlazaData",JSON.stringify(value))},post:fn=>{post=fn},saveDeliveryBatch,prepareDelivery:rows=>{deliveryDraft=rows;validateDeliveryRecipient=()=>true;discardDeliveryForm=()=>{};renderRecentQueries=()=>{}}};})();',ctx);
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
 const c=client();c.api.set({personal:[{id:'recipient',nombre:'Persona'}],assets:[],inventoryCriteria:[{id:'gloves',name:'Guantes'}],inventoryStock:[{id:'stock-gloves',itemId:'gloves',quantity:100}],blendingIncomes:[],blendingDeliveries:[]});
 const button={disabled:false},form={elements:{itemId:{value:''},recipientId:{value:'recipient'}},querySelector:()=>button};
 const draft=()=>[{itemId:'gloves',itemName:'Guantes',quantity:2,notes:''}];
 c.api.prepareDelivery(draft());assert.equal(await c.api.saveDeliveryBatch(form),true);
 assert.equal(await c.api.saveDeliveryBatch(form),false);assert.equal(c.api.get().blendingDeliveries.length,1);
 c.api.prepareDelivery(draft());assert.equal(await c.api.saveDeliveryBatch(form),true);
 const rows=c.api.get().blendingDeliveries;assert.equal(rows.length,2);assert.notEqual(rows[0].id,rows[1].id);assert.notEqual(rows[0].syncEventId,rows[1].syncEventId);
 assert.equal(JSON.parse(c.storage.get('skPlazaData')).blendingDeliveries.length,2);
});
test('un alta de activo y su ingreso fallido permanecen juntos sin consumir una marca',()=>{
 const b=backend({inventoryCriteria:[{id:'fixed',name:'Pulidora',isFixedAsset:true},{id:'gloves',name:'Guantes'}]});
 const asset={id:'new-asset',criteriaId:'fixed',clase:'Pulidora',numeroClase:'1',serial:'SERIAL-1',markingPolicy:'letters-v1',markStatus:'pending',syncState:'pending'};
 const result=b.sync({assets:[asset],blendingIncomes:[row('bad-income',{assetId:'new-asset',itemId:'fixed',quantity:0}),row('good-income')]});
 assert.equal(b.cloud().assets.length,0);assert.equal((b.cloud().assetMarkRegistry||[]).length,0);
 assert.deepEqual(b.cloud().blendingIncomes.map(r=>r.id),['good-income']);assert.equal(result.acknowledgements.assets[0].status,'rejected');
});
