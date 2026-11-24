const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const history = require('../asset-history.js');
const serverSource = fs.readFileSync('backend/apps-script/Code.gs','utf8');
const when = '2026-11-24T14:00:00Z';
function fixture(owner = 'Sandra K') {
  let data = {assets:[{id:'a',clase:'Pulidora',mina:owner,estado:'Operativo',ubicacion:'Bodega de Superficie'}],
    personal:[{id:'p',nombre:'Operador'}],inventoryCriteria:[{id:'tool',name:'Pulidora',isFixedAsset:true},{id:'bolt',name:'Perno'}],
    inventoryStock:[{id:'stock',itemId:'bolt',quantity:8}],blendingDeliveries:[],blendingIncomes:[]};
  const ctx = vm.createContext({LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},Utilities:{formatDate:()=>when.slice(0,10)}});
  vm.runInContext(serverSource,ctx);
  ctx.findFile_=()=> 'central';ctx.readFile_=()=>structuredClone(data);ctx.writeFile_=(_,d)=>{data=structuredClone(d)};
  ctx.verifyToken_=()=>({document:'operator',role:'plaza_operator'});ctx.json_=structuredClone;
  ctx.productionWarehouseSettings_=()=>({enabled:true,transferStartAt:'2026-01-01'});
  return {ctx,data:()=>data,send:(rows,assets=[])=>ctx.plazaSync_({syncProtocol:'plaza-receipts-v1',data:{blendingDeliveries:rows,assets}})};
}
const movement = (op,extra={}) => ({id:'exit',exitKind:'mine',assetId:'a',itemId:'tool',quantity:1,deliveryType:op,
  destinationMine:'Providencia',ownerMineBefore:'Sandra K',createdAt:when,updatedAt:when,syncState:'pending',...extra});
for (const [op,owner,after] of [['TRASLADO','Sandra K','Providencia'],['PRÉSTAMO','Sandra K','Sandra K'],
  ['RETORNO','Providencia','Providencia']]) {
  test(op+' conserva el movimiento y aplica su efecto una sola vez',()=>{
    const f=fixture(owner),row=movement(op,{ownerMineBefore:owner});
    const first=f.send([row]);
    assert.equal(first.acknowledgements.blendingDeliveries[0].status,'accepted');
    assert.equal(first.data.assets[0].mina,after);assert.equal(first.data.assets[0].ubicacion,'Mina Providencia');
    assert.equal(first.data.assets[0].estado,'Operativo');
    assert.equal(history.timeline(first.data,'a')[0].title,op+' · Providencia');
    assert.equal(f.send([row]).acknowledgements.blendingDeliveries[0].status,'already-applied');
    assert.equal(f.data().blendingDeliveries.length,1);
    assert.equal(f.send([{...row,id:'otro'}]).acknowledgements.blendingDeliveries[0].status,'rejected');
  });
}
test('la salida a reparación a Segovia cambia la ubicación y conserva la propiedad, incluso al reintentar',()=>{
  for (const owner of ['Sandra K','Providencia']) {
    const f=fixture(owner),external=owner!=='Sandra K';
    f.data().assets[0].activoExterno=external;
    f.data().inventoryCriteria.push({id:'SYSTEM-FORM-OPTIONS-V1',options:{'asset.owner':['Sandra K','Providencia']}});
    const row=movement('SALIDA A REPARACIÓN',{destinationMine:'Segovia',ownerMineBefore:owner});
    const result=f.send([row]);
    assert.equal(result.acknowledgements.blendingDeliveries[0].status,'accepted');
    const asset=result.data.assets[0];
    assert.equal(asset.mina,owner);assert.equal(asset.activoExterno,external);assert.equal(asset.ubicacion,'Segovia');assert.equal(asset.estado,'En reparación');
    assert.equal(result.data.blendingDeliveries[0].destination,'Segovia');
    assert.equal(history.project(asset,result.data).asset.ubicacion,'Segovia');
    assert.equal(f.send([row]).acknowledgements.blendingDeliveries[0].status,'already-applied');
  }
});
test('Segovia rechaza traslado, préstamo y retorno sin mover el activo, incluso con solicitudes pendientes antiguas',()=>{
  for(const op of ['TRASLADO','PRÉSTAMO','RETORNO']){
    const f=fixture('Carla'),row=movement(op,{destinationMine:'Segovia',ownerMineBefore:'Carla'});
    const receipt=f.send([row]).acknowledgements.blendingDeliveries[0];
    assert.equal(receipt.status,'rejected');assert.match(receipt.error,/solo se puede registrar una salida a reparación/);
    assert.equal(f.data().blendingDeliveries.length,0);assert.equal(f.data().assets[0].ubicacion,'Bodega de Superficie');
  }
});
test('ninguna de las cuatro minas admite salidas a reparación, incluso si el movimiento estaba en cola',()=>{
  for(const mine of ['Providencia','El Silencio','Carla','Alianza']){
    const f=fixture();
    const row=movement('SALIDA A REPARACIÓN',{destinationMine:mine});
    const before=structuredClone(f.data().assets[0]);
    const result=f.send([row]);
    assert.equal(result.capabilities.mineRepairDestinationV1,true);
    assert.equal(result.acknowledgements.blendingDeliveries[0].status,'rejected');
    assert.match(result.acknowledgements.blendingDeliveries[0].error,/exclusiva de Segovia/);
    assert.deepEqual(f.data().assets[0],before);
    assert.equal(f.data().blendingDeliveries.length,0);
  }
});
test('un retorno solo se sincroniza si la mina de destino es la propietaria vigente',()=>{
  for(const owner of ['Sandra K','El Silencio','']) {
    for(const legacyConfirmation of [true,false]) {
      const f=fixture(owner);
      const row=movement('RETORNO',{ownerMineBefore:'Providencia',ownerMismatchConfirmed:legacyConfirmation});
      const receipt=f.send([row]).acknowledgements.blendingDeliveries[0];
      assert.equal(receipt.status,'rejected');assert.match(receipt.error,/mina propietaria/);
      assert.equal(f.data().blendingDeliveries.length,0);assert.equal(f.data().assets[0].ubicacion,'Bodega de Superficie');
    }
  }
  const f=fixture('Providencia'),receipt=f.send([movement('RETORNO')]).acknowledgements.blendingDeliveries[0];
  assert.equal(receipt.status,'accepted');assert.equal(f.data().blendingDeliveries[0].ownerMineBefore,'Providencia');
});
test('baja, autorrescatador o activo fuera de Plaza impiden la salida',()=>{
  for(const asset of [{estado:'Dado de baja'},{clase:'Autorrescatador'},{ubicacion:'Socavón'}]) {
    const f=fixture();Object.assign(f.data().assets[0],asset);
    assert.equal(f.send([movement('TRASLADO')]).acknowledgements.blendingDeliveries[0].status,'rejected');
    assert.equal(f.data().blendingDeliveries.length,0);
  }
});
test('la entrega normal no admite activos y el traslado acredita una sola vez en Producción',()=>{
  const f=fixture();
  const delivery={id:'normal',exitKind:'delivery',itemId:'bolt',recipientId:'p',quantity:1,createdAt:when,updatedAt:when,syncState:'pending'};
  assert.equal(f.send([{...delivery,itemId:'tool',assetId:'a'}]).acknowledgements.blendingDeliveries[0].status,'rejected');
  const row={...delivery,id:'transfer',exitKind:'warehouse',deliveryType:'TRASLADO A BODEGAS',destinationWarehouseId:'production',quantity:3};
  const first=f.send([delivery,row]);assert.deepEqual(first.acknowledgements.blendingDeliveries.map(r=>r.status),['accepted','accepted']);
  assert.equal(first.data.inventoryStock[0].quantity,4);
  const book={};assert.equal(f.ctx.productionImportPlaza_(book,first.data),true);
  assert.equal(book.warehouseMovements.length,1);assert.equal(book.warehouseMovements[0].delta,3);
  f.send([row]);assert.equal(f.ctx.productionImportPlaza_(book,f.data()),false);assert.equal(f.data().inventoryStock[0].quantity,4);
});
test('una ficha recién ingresada sin conexión se crea con la propiedad original antes de procesar el traslado',()=>{
  const f=fixture();
  const asset={id:'nueva',clase:'Pulidora',serial:'XYZ-87',numeroClase:'2',criteriaId:'tool',mina:'Providencia',estado:'Operativo/a',
    ubicacion:'Mina Providencia',registeredFrom:'plaza-income',createdAt:when,updatedAt:when,syncState:'pending'};
  const income={id:'alta',assetId:'nueva',itemId:'tool',quantity:1,broughtById:'p',createdAt:when,updatedAt:when,syncState:'pending'};
  const exit=movement('TRASLADO',{assetId:'nueva',createdAt:'2026-11-24T14:05:00Z'});
  const result=f.ctx.plazaSync_({syncProtocol:'plaza-receipts-v1',data:{assets:[asset],blendingIncomes:[income],blendingDeliveries:[exit]}});
  assert.equal(result.acknowledgements.blendingIncomes[0].status,'accepted',result.acknowledgements.blendingIncomes[0].error);
  assert.equal(result.acknowledgements.blendingDeliveries[0].status,'accepted',result.acknowledgements.blendingDeliveries[0].error);
  assert.equal(result.data.assets.find(row=>row.id==='nueva').mina,'Providencia');
});

test('fechas extemporáneas por rol de Plaza, con registro offline y reintento',()=>{
  const recordedAt='2026-10-06T12:51:34.023Z',createdAt='2026-10-01T05:09:00.000Z';
  const row=movement('TRASLADO',{createdAt,recordedAt,updatedAt:recordedAt,operatorDocument:'operator',shiftKeeperDocument:'operator'});
  for(const role of ['plaza_operator','plaza_supervisor','plaza_assistant']){
    const f=fixture();
    f.data().personal[0].documento='operator';
    f.ctx.verifyToken_=()=>({document:'operator',role});
    const result=f.send([row]).acknowledgements.blendingDeliveries[0];
    if(role==='plaza_assistant'||role==='plaza_supervisor'){
      assert.equal(result.status,'accepted');
      assert.equal(f.send([row]).acknowledgements.blendingDeliveries[0].status,'already-applied');
      assert.equal(f.data().blendingDeliveries.length,1);
      assert.equal(f.data().blendingDeliveries[0].createdAt,createdAt);
      assert.equal(f.data().blendingDeliveries[0].recordedAt,recordedAt);
    }else{
      assert.equal(result.status,'rejected');
      assert.match(result.error,/roles Auxiliar y Supervisor/);
      assert.equal(f.data().assets[0].ubicacion,'Bodega de Superficie');
      assert.equal(f.send([{...row,createdAt:recordedAt}]).acknowledgements.blendingDeliveries[0].status,'accepted');
    }
  }
});

test('el supervisor sincroniza la entrega extemporánea con su propio rol y otro bodeguero de turno',()=>{
  const f=fixture();
  f.data().personal.push({id:'keeper',documento:'001',nombre:'Bodeguera'});
  f.ctx.verifyToken_=()=>({document:'operator',role:'plaza_supervisor'});
  const row={id:'backdated',exitKind:'delivery',itemId:'bolt',recipientId:'p',quantity:2,
    operatorDocument:'operator',shiftKeeperDocument:'001',createdAt:'2026-10-02T04:00:00.000Z',
    recordedAt:'2026-10-06T18:00:00.000Z',updatedAt:'2026-10-06T18:00:00.000Z',syncState:'pending'};
  const result=f.send([row]);
  assert.equal(result.acknowledgements.blendingDeliveries[0].status,'accepted');
  assert.equal(result.sessionRole,'plaza_supervisor');
  const stored=result.data.blendingDeliveries[0];
  assert.equal(stored.createdAt,row.createdAt);
  assert.equal(stored.recordedAt,row.recordedAt);
  assert.equal(stored.shiftKeeperId,'keeper');
  assert.equal(stored.actorRole,'plaza_supervisor');
  assert.equal(f.send([row]).acknowledgements.blendingDeliveries[0].status,'already-applied');
  assert.equal(f.data().inventoryStock[0].quantity,6);
  const refreshed=f.ctx.plazaSync_({since:f.data().updatedAt,data:{}});
  assert.equal(refreshed.notModified,true);
  assert.equal(refreshed.sessionRole,'plaza_supervisor');
});
