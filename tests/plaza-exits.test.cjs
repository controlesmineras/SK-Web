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
  ['RETORNO','Providencia','Providencia'],['SALIDA A REPARACIÓN','Sandra K','Sandra K']]) {
  test(op+' conserva el movimiento y aplica su efecto una sola vez',()=>{
    const f=fixture(owner),row=movement(op,{ownerMineBefore:owner});
    const first=f.send([row]);
    assert.equal(first.acknowledgements.blendingDeliveries[0].status,'accepted');
    assert.equal(first.data.assets[0].mina,after);assert.equal(first.data.assets[0].ubicacion,'Mina Providencia');
    assert.equal(first.data.assets[0].estado,op==='SALIDA A REPARACIÓN'?'En reparación':'Operativo');
    assert.equal(history.timeline(first.data,'a')[0].title,op+' · Providencia');
    assert.equal(f.send([row]).acknowledgements.blendingDeliveries[0].status,'already-applied');
    assert.equal(f.data().blendingDeliveries.length,1);
    assert.equal(f.send([{...row,id:'otro'}]).acknowledgements.blendingDeliveries[0].status,'rejected');
  });
}
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
