// Hora del registro en la operación colombiana, independiente de la zona de la tablet.
(()=>{
 'use strict';
 const zone='America/Bogota';
 const clock=new Intl.DateTimeFormat('es-CO',{timeZone:zone,hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
 const calendar=new Intl.DateTimeFormat('sv-SE',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'});
 function format(value,formatter){
  const stamp=Date.parse(value);
  return Number.isFinite(stamp)?formatter.format(stamp):'';
 }
 function registered(row,localCreation=false){
  if(row.sourceCreatedAt!==undefined||row.sourceDeliveryId||row.sourceWarehouseMovementId)return row.sourceCreatedAt||'';
  return row.recordedAt||((localCreation||row.syncState==='pending')?row.createdAt:'');
 }
 function warehouse(row){
  if(row.sourceCreatedAt||row.recordedAt)return row.sourceCreatedAt||row.recordedAt;
  // Las primeras versiones conservaron la petición original al confirmar el movimiento.
  if(row.requestSignature){
   try{
    const request=JSON.parse(row.requestSignature);
    if(request?.id===row.id)return request.createdAt||'';
   }catch{}
  }
  return row.revision||row.status==='synced'?'':row.createdAt;
 }
 window.SKMovementTime={
  hour:value=>format(value,clock),day:value=>format(value,calendar),
  recordHour:(row,localCreation=false)=>row.horaRegistro||row.horaLocal||format(registered(row,localCreation),clock),
  registered,warehouse
 };
})();
