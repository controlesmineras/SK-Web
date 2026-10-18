const {test}=require('node:test'),assert=require('node:assert/strict');
const history=require('../asset-history.js');
const asset={id:'saw27',clase:'Motosierra',numeroClase:'27',marcaInterna:'AAE',serial:'DEMO-27',ubicacion:'Operación',estado:'Operativo/a'};
const people=[{id:'receiver',documento:'10001',nombre:'Operador de prueba',area:'Desmin - Obras civiles',cargo:'Operador minero'},{id:'warehouse',documento:'warehouse-doc',nombre:'Bodeguera de prueba'}];
const delivery={id:'delivery',assetId:asset.id,recipientId:'receiver',operatorId:'warehouse',operatorDocument:'warehouse-doc',operatorName:'Bodeguera de prueba',actorDocument:'warehouse-doc',deliveryType:'ASIGNACIÓN',destination:'Operación',createdAt:'2026-10-18T21:06:00Z',syncState:'synced'};
const seed=()=>({personal:structuredClone(people),blendingDeliveries:[structuredClone(delivery)],blendingIncomes:[],novelties:[]});
test('la entrega ya registrada en Plaza completa última novedad, bodeguera y receptor sin escribir ni duplicar',()=>{
 const data=seed(),before=JSON.stringify({asset,data}),result=history.project(asset,data);
 assert.equal(result.asset.fechaNovedad,'2026-10-18');assert.equal(result.asset.horaNovedad,'16:06');assert.equal(result.asset.descripcionNovedad,'Asignación');
 assert.equal(result.asset.nombreResponsable,people[0].nombre);assert.equal(result.asset.documentoResponsable,'10001');assert.equal(result.asset.nombreBodeguero,people[1].nombre);
 assert.equal(result.asset.asignadaId,'receiver');assert.equal(result.asset.areaAsignada,people[0].area);assert.equal(result.asset.serial,'DEMO-27');
 assert.equal(result.events.length,1);assert.deepEqual(history.project(asset,data),result);assert.equal(JSON.stringify({asset,data}),before);
});
test('la hora del movimiento manda sobre la de sincronización y una novedad posterior conserva sus responsables',()=>{
 const data=seed();data.blendingDeliveries[0].updatedAt='2026-10-23T21:00:00Z';
 data.novelties=[{id:'inspection',assetId:asset.id,descripcion:'Revista física',fechaNovedad:'2026-10-19',horaNovedad:'09:10',createdAt:'2026-10-19T14:15:00Z',responsableNombre:'123 - Inspectora',bodegueroNombre:'456 - Bodeguero',ubicacion:'Socavón'}];
 const result=history.project({...asset,ubicacion:'Socavón'},data);assert.equal(result.events[0].kind,'novelty');assert.equal(result.asset.horaNovedad,'09:10');assert.equal(result.asset.documentoResponsable,'123');assert.equal(result.asset.nombreBodeguero,'Bodeguero');
});
test('una ficha con novedad explícita más reciente no retrocede a una entrega antigua',()=>{
 const result=history.project({...asset,fechaNovedad:'2026-10-20',horaNovedad:'12:00',descripcionNovedad:'En reparación',nombreResponsable:'Técnico'},seed());assert.equal(result.asset.descripcionNovedad,'En reparación');assert.equal(result.asset.nombreResponsable,'Técnico');
});
test('las devoluciones muestran a quien devuelve y a quien recibe, y liberan la asignación',()=>{
 const data=seed();data.blendingDeliveries.push({...delivery,id:'back',movementType:'DEVOLUCIÓN',loanId:'delivery',returnedById:'carrier',returnedByName:'Quien devuelve',returnedByDocument:'999',returnedAt:'2026-10-19T14:00:00Z',createdAt:'2026-10-19T14:10:00Z'});
 const result=history.project({...asset,asignadaId:'receiver',ubicacion:'Bodega de Superficie'},data);assert.equal(result.asset.nombreResponsable,'Quien devuelve');assert.equal(result.asset.documentoResponsable,'999');assert.equal(result.asset.horaNovedad,'09:00');assert.equal(result.asset.asignadaId,'');assert.equal(result.events[0].title,'Devolución de préstamo');
});
test('el préstamo no crea una asignación permanente y una entrega no rehabilita un activo dado de baja',()=>{
 const data=seed();data.blendingDeliveries[0].deliveryType='PRÉSTAMO';assert.equal(history.project(asset,data).asset.asignadaId,undefined);
 const result=history.project({...asset,asignadaId:'receiver',estado:'Dado/a de baja',ubicacion:'Desechado/a'},seed());assert.equal(result.asset.asignadaId,'');assert.equal(result.asset.estado,'Dado/a de baja');assert.equal(result.asset.ubicacion,'Desechado/a');
});
test('revertidos permanecen en el historial y no se usan como última novedad ni asignación',()=>{
 const data=seed();data.blendingDeliveries[0].reversed=true;data.blendingIncomes=[{id:'income',assetId:asset.id,createdAt:'2026-10-17T12:00:00Z',broughtByName:'Transportador',operatorName:'Bodeguera'}];
 const result=history.project({...asset,ubicacion:'Bodega de Superficie'},data);assert.equal(result.events.length,2);assert.equal(result.events[0].reversed,true);assert.equal(result.asset.descripcionNovedad,'Ingreso a bodega');assert.equal(result.asset.asignadaId,'');
});
test('revertir una entrega también actualiza una ficha cuyo último movimiento había sido guardado',()=>{
 const data=seed(),saved=history.project(asset,data).asset;data.blendingDeliveries[0].reversed=true;
 data.blendingIncomes=[{id:'income',assetId:asset.id,createdAt:'2026-10-17T12:00:00Z',broughtByName:'Transportador'}];
 const result=history.project({...saved,ubicacion:'Bodega de Superficie'},data);assert.equal(result.asset.descripcionNovedad,'Ingreso a bodega');assert.equal(result.asset.asignadaId,'');
});
test('snapshots mantienen nombres históricos y el actor autenticado tiene precedencia sobre operador contradictorio',()=>{
 const data=seed();Object.assign(data.blendingDeliveries[0],{recipientName:'Nombre al entregar',recipientDocument:'10001',operatorName:'Nombre equivocado',operatorDocument:'otro'});
 const result=history.project(asset,data);assert.equal(result.asset.nombreResponsable,'Nombre al entregar');assert.equal(result.asset.nombreBodeguero,people[1].nombre);
 data.personal=[];const missing=history.project(asset,data);assert.equal(missing.asset.nombreResponsable,'Nombre al entregar');assert.equal(missing.asset.nombreBodeguero,'');assert.equal(missing.asset.documentoBodeguero,'warehouse-doc');
});
test('últimas diez por activo, eventos del mismo lote preservados y reintentos deduplicados por id',()=>{
 const data=seed();data.blendingDeliveries=[];
 data.novelties=Array.from({length:14},(_,i)=>({id:'n'+i,assetId:asset.id,descripcion:'Novedad '+i,createdAt:new Date(Date.UTC(2026,9,1+i,12)).toISOString(),syncEventId:'same-batch'}));
 data.novelties.push({...data.novelties[13]},{id:'other',assetId:'another',createdAt:'2026-12-01T12:00:00Z'},{id:'deleted',assetId:asset.id,deleted:true,createdAt:'2026-12-01T12:00:00Z'});
 const events=history.timeline(data,asset.id);assert.equal(events.length,14);assert.equal(events.slice(0,10).length,10);assert.equal(events[0].raw.id,'n13');assert.equal(events[9].raw.id,'n4');
});
