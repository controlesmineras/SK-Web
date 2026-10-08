const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readFileSync}=require('node:fs'),{join}=require('node:path');
const read=file=>readFileSync(join(__dirname,'..',file),'utf8'),clone=value=>JSON.parse(JSON.stringify(value));
const date='2026-10-01T15:00:00.000Z',backDate='2026-10-01T16:00:00.000Z';
const loan={id:'loan',syncEventId:'loan',itemId:'pulidora',itemName:'Pulidora',assetId:'asset',deliveryType:'PRÉSTAMO',recipientId:'borrower',quantity:1,destination:'Operación',createdAt:date,updatedAt:date,syncState:'synced'};
const people=[{id:'borrower',nombre:'Receptor',documento:'123'},{id:'carrier',nombre:'Quien devuelve',documento:'234'},{id:'operator',nombre:'Bodeguera',documento:'456'}];
function seed(){return{personal:clone(people),assets:[{id:'asset',clase:'Pulidora',numeroClase:'1',serial:'SER-1',marcaActual:'AAA',ubicacion:'Operación',modelo:'DWE491',syncState:'synced'}],blendingDeliveries:[clone(loan)],inventoryStock:[{id:'stock',itemId:'guantes',quantity:10}]};}
function back(overrides={}){return {id:'back',syncEventId:'back',movementType:'DEVOLUCIÓN',loanId:'loan',itemId:'pulidora',assetId:'asset',recipientId:'borrower',quantity:1,returnedById:'carrier',returnedAt:backDate,destination:'Bodega de Superficie',createdAt:backDate,updatedAt:backDate,syncState:'pending',...overrides};}
function backend(initial=seed()){
 let cloud=clone(initial),writes=0;
 const ctx=vm.createContext({LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})}});
 vm.runInContext(read('backend/apps-script/Code.gs'),ctx);
 ctx.findFile_=()=> 'file';ctx.readFile_=()=>clone(cloud);ctx.writeFile_=(_,data)=>{writes++;cloud=clone(data)};ctx.json_=clone;ctx.verifyToken_=()=>({document:'456',role:'plaza_operator'});
 return {sync:(rows=[],extra={})=>ctx.plazaSync_({token:'test',data:{blendingDeliveries:clone(rows),...extra}}),get cloud(){return cloud},get writes(){return writes}};
}
const frontContext=vm.createContext({window:{addEventListener(){}},document:{querySelector(){return null}},Date,console});
vm.runInContext(read('plaza/asset-returns.js'),frontContext);
const front=frontContext.window.SKPlazaReturns;

test('devuelve el préstamo a bodega, conserva la ficha y autentica quién recibe',()=>{
 const server=backend(),result=server.sync([back({operatorName:'Nombre alterado',operatorDocument:'otro'})]);
 assert.equal(result.capabilities.loanReturnsV1,true);
 assert.equal(server.cloud.assets[0].ubicacion,'Bodega de Superficie');
 assert.equal(server.cloud.assets[0].modelo,'DWE491');assert.equal(server.cloud.assets[0].marcaActual,'AAA');
 assert.deepEqual(server.cloud.blendingDeliveries[0],loan);
 const row=server.cloud.blendingDeliveries[1];
 assert.equal(row.operatorName,'Bodeguera');assert.equal(row.actorDocument,'456');assert.equal(row.operatorDocument,'456');
 assert.equal(row.returnedByName,'Quien devuelve');assert.equal(row.syncState,'synced');
 assert.equal(server.cloud.inventoryStock[0].quantity,10);
});
test('reintentar una devolución confirmada no duplica ni cambia un préstamo posterior',()=>{
 const server=backend();server.sync([back()]);server.sync([back()]);
 assert.equal(server.cloud.blendingDeliveries.length,2);
 const newLoan={...loan,id:'loan2',syncEventId:'loan2',createdAt:'2026-10-01T16:01:00Z',updatedAt:'2026-10-01T16:01:00Z',syncState:'pending'};
 server.sync([newLoan]);server.sync([back()]);
 assert.equal(server.cloud.blendingDeliveries.length,3);assert.equal(server.cloud.assets[0].ubicacion,'Operación');
 assert.equal(front.loanState(server.cloud,server.cloud.blendingDeliveries[2]),'PENDIENTE');
});
test('préstamo, devolución y nuevo préstamo offline se aplican juntos, incluso en menos de 15 segundos',()=>{
 const data=seed();data.blendingDeliveries=[];data.assets[0].ubicacion='Bodega de Superficie';
 const server=backend(data),first={...loan,syncState:'pending'},returned=back({createdAt:date,updatedAt:date,returnedAt:date}),second={...first,id:'loan2',syncEventId:'loan2'};
 server.sync([first,returned,second]);
 assert.equal(server.cloud.blendingDeliveries.length,3);assert.equal(server.cloud.assets[0].ubicacion,'Operación');
 server.sync([first,returned,second]);assert.equal(server.cloud.blendingDeliveries.length,3);
});
test('una segunda devolución desde otro dispositivo se rechaza sin escritura ni doble entrada',()=>{
 const server=backend();server.sync([back()]);const before=clone(server.cloud),writes=server.writes;
 assert.throws(()=>server.sync([back({id:'other-device',syncEventId:'other-device'})]),/ya fue devuelto/);
 assert.deepEqual(server.cloud,before);assert.equal(server.writes,writes);
});
test('rechaza asignaciones, otro activo, cantidades inválidas, préstamo ausente y persona no confirmada',()=>{
 for(const overrides of [{loanId:'missing'},{assetId:'missing'},{itemId:'otro'},{quantity:2},{returnedById:'missing'},{assetId:''}]){
  const server=backend();assert.throws(()=>server.sync([back(overrides)]));assert.equal(server.writes,0);
 }
 for(const deliveryType of ['ASIGNACIÓN',undefined]){
  const data=seed();data.blendingDeliveries[0].deliveryType=deliveryType;
  const server=backend(data);assert.throws(()=>server.sync([back()]),/préstamo válido/);assert.equal(server.writes,0);
 }
});
test('otro movimiento o ubicación posterior impide devolver un préstamo antiguo',()=>{
 for(const location of ['Bodega de Superficie','Reparación']){
  const data=seed();data.assets[0].ubicacion=location;const server=backend(data);
  assert.throws(()=>server.sync([back()]),/otro movimiento o ubicación/);assert.equal(server.writes,0);
 }
 const data=seed();data.blendingDeliveries.push({...loan,id:'new-loan'});
 assert.throws(()=>backend(data).sync([back()]),/otro movimiento o ubicación/);
});
test('fechas inválidas no escriben y se puede devolver aunque el receptor original esté inactivo',()=>{
 for(const returnedAt of ['incorrecta','2026-09-30T00:00:00Z','2099-01-01T00:00:00Z']){
  const server=backend();assert.throws(()=>server.sync([back({returnedAt})]),/Fecha/);assert.equal(server.writes,0);
 }
 const data=seed();data.personal[0].deleted=true;
 const server=backend(data);server.sync([back()]);assert.equal(server.cloud.assets[0].ubicacion,'Bodega de Superficie');
});
test('una devolución inválida revierte todo el lote sin consumir existencias',()=>{
 const server=backend();assert.throws(()=>server.sync([{id:'gloves',itemId:'guantes',quantity:2,recipientId:'borrower',syncState:'pending'},back({loanId:'missing'})]));
 assert.equal(server.cloud.inventoryStock[0].quantity,10);assert.equal(server.writes,0);
});
test('la pantalla incluye préstamos antiguos, cierra el original y muestra pendientes y conflictos',()=>{
 const data=seed();assert.equal(front.loans(data).length,1);assert.equal(front.loanState(data,loan),'PENDIENTE');
 data.blendingDeliveries.push(back());assert.equal(front.loanState(data,loan),'DEVUELTO');
 data.blendingDeliveries.push({...loan,id:'new-loan'});assert.equal(front.loanState(data,data.blendingDeliveries[2]),'PENDIENTE');
 data.assets[0].ubicacion='Reparación';assert.equal(front.loanState(data,data.blendingDeliveries[2]),'REVISAR');
});
test('el registro local vincula personas y préstamo sin mutar la copia previa',()=>{
 const data=seed(),before=clone(data);
 const row=front.createReturn(data,'loan',{returnedById:'carrier',returnedAt:backDate,notes:'Recibido completo'},people[2],new Date(backDate));
 assert.equal(row.loanId,'loan');assert.equal(row.returnedByName,'Quien devuelve');assert.equal(row.operatorName,'Bodeguera');assert.equal(row.syncState,'pending');
 assert.deepEqual(data,before);
 data.blendingDeliveries.push(row);assert.throws(()=>front.createReturn(data,'loan',{},people[2]),/ya no está pendiente/);
});
test('dos dispositivos generan la misma devolución y ambos reciben la confirmación original',()=>{
 const data=seed(),fields={returnedById:'carrier',returnedAt:backDate};
 const first=clone(front.createReturn(data,'loan',fields,people[2],new Date(backDate)));
 const second=clone(front.createReturn(data,'loan',{...fields,notes:'Segundo dispositivo'},people[2],new Date(backDate)));
 assert.equal(first.id,second.id);assert.equal(first.syncEventId,second.syncEventId);
 const server=backend();server.sync([first]);const result=server.sync([second]);
 assert.equal(server.cloud.blendingDeliveries.length,2);assert.equal(result.data.blendingDeliveries[1].notes,'');
 assert.equal(result.data.assets[0].ubicacion,'Bodega de Superficie');
});
