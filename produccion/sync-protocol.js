// Misma conciliación por registro que Plaza Blending: conservar pendientes,
// aceptar solo recibos coherentes y no sobrescribir cambios hechos durante el envío.
(()=>{
 'use strict';
 const protocol='production-receipts-v1';
 const samePendingRow=(a,b)=>{
  const clean=row=>{const value={...row};delete value.syncError;delete value.syncRejected;return JSON.stringify(value)};
  return Boolean(a&&b&&clean(a)===clean(b));
 };
 const adjustmentUpgrade='Ajuste guardado en este equipo. Falta actualizar la implementación de Code.gs para confirmar existencias con protección de saldo.';
 function selectPending(current,limit=1000){
  const selected=[],blocked=new Set(),aliases=new Map((current.inventoryCriteria||[]).filter(row=>row.productionPartId).map(row=>[row.id,row.productionPartId]));
  for(const row of current.pending||[]){
   const key=row.origen+'|'+(aliases.get(row.partId)||row.partId);
   if(blocked.has(key)||row.syncRejected)continue;
   if(row.kind==='adjustment'&&current.stockAdjustmentLocalV1!==true){blocked.add(key);continue;}
   selected.push(row);if(selected.length===limit)break;
  }
  return selected;
 }
 const selectIncomeChanges=current=>current.incomeChangesV1===true?(current.incomeChanges||[]).filter(row=>!row.syncRejected).slice(0,1000).map(row=>{const clean={...row};delete clean.syncError;delete clean.syncRejected;return clean}):[];
 function pendingSummary(current){
  const rows=[...(current.pending||[]),...(current.incomeChanges||[]),...(current.countQueue||[])];
  const rejected=rows.filter(row=>row.syncRejected).length;
  return {total:rows.length,rejected,waiting:rows.length-rejected,incomeRejected:(current.incomeChanges||[]).filter(row=>row.syncRejected).length};
 }
 function discardRejectedIncomeChanges(current,reviewed){
  const selected=new Map(reviewed.filter(row=>row.syncRejected).map(row=>[row.id,row]));
  return {...current,incomeChanges:(current.incomeChanges||[]).filter(row=>!row.syncRejected||!samePendingRow(row,selected.get(row.id)))};
 }
 function reconcile(result,sent,current,inventoryRequest,sentChanges=[]){
  const tables=['personal','assets','parts','inventoryCriteria','incomes','consumptions'];
  if(result?.ok!==true||tables.some(name=>!Array.isArray(result[name])))throw new Error('La respuesta central está incompleta. Los pendientes se conservaron.');
  const individual=result.syncProtocol===protocol;
  if(individual&&(!Array.isArray(result.acknowledgements)||!Array.isArray(result.inventoryCounts)||!Array.isArray(result.inventoryLatest)))throw new Error('Faltan las confirmaciones individuales. Los pendientes se conservaron.');
  if(!individual&&!Array.isArray(result.ack))throw new Error('La base central no confirmó los registros enviados.');
  const receipts=new Map((result.acknowledgements||[]).map(row=>[row.id,row]));
  if(individual&&receipts.size!==result.acknowledgements.length)throw new Error('La base central devolvió confirmaciones repetidas.');
  const acknowledged=new Set(result.ack||[]),saved=new Map([...result.incomes,...result.consumptions].map(row=>[row.id,row]));
  const superseded=row=>Boolean(row.correctionId)&&(result.superseded||[]).some(item=>item.id===row.id&&item.correctionId===row.correctionId);
  const matches=row=>{
   const remote=saved.get(row.id);
   if(!remote||remote.kind!==row.kind||remote.origen!==row.origen)return false;
   const alias=(result.inventoryCriteria||[]).find(item=>item.id===row.partId)?.productionPartId;
   if(remote.partId!==row.partId&&remote.partId!==alias)return false;
   return superseded(row)||remote.correctionId===row.correctionId&&(row.kind==='adjustment'?remote.target===row.cantidad:remote.cantidad===row.cantidad);
  };
  const accepted=row=>individual?['accepted','already-applied'].includes(receipts.get(row.id)?.status):acknowledged.has(row.id)&&matches(row);
  if(individual)for(const row of sent){
   const receipt=receipts.get(row.id);
   if(!receipt||!['accepted','already-applied','rejected'].includes(receipt.status)||accepted(row)&&!matches(row)||receipt.status==='rejected'&&matches(row))throw new Error('La confirmación individual no coincide con el registro central. Los pendientes se conservaron.');
  }
  const sentRows=new Map(sent.map(row=>[row.id,row]));
  const pending=(current.pending||[]).flatMap(row=>{
   const original=sentRows.get(row.id);
   if(!samePendingRow(row,original))return [row];
   if(accepted(original))return [];
   const receipt=receipts.get(row.id);
   return [{...row,syncError:receipt?.error||'La base central no confirmó este registro; se conserva pendiente.',syncRejected:receipt?.status==='rejected'}];
  }).map(row=>row.kind==='adjustment'&&result.stockAdjustmentLocalV1!==true&&!row.syncRejected?{...row,syncError:adjustmentUpgrade}:row);
  let countQueue=current.countQueue||[],countSyncError=current.countSyncError||'';
  if(inventoryRequest){
   const returned=result.inventoryResult?.count;
   countSyncError=result.inventoryResult?.error||(!returned?'Actualiza Apps Script para sincronizar el inventario físico.':'');
   if(!countSyncError){
    countQueue=countQueue.filter(row=>!(row.id===inventoryRequest.id&&row.revision===inventoryRequest.revision&&row.action===inventoryRequest.action))
     .map(row=>row.id===inventoryRequest.id?{...row,baseRevision:returned.revision}:row);
   }
  }
  let incomeChanges=current.incomeChanges||[];
  if(sentChanges.length){
   if(result.incomeChangesV1!==true||!Array.isArray(result.incomeChangeReceipts)||!Array.isArray(result.incomeHistory))throw new Error('La base central no confirmó los cambios de ingresos.');
   const receipts=new Map(result.incomeChangeReceipts.map(row=>[row.id,row])),history=new Map(result.incomeHistory.map(row=>[row.id,row]));
   if(receipts.size!==result.incomeChangeReceipts.length)throw new Error('Confirmaciones de ingresos repetidas.');
   for(const op of sentChanges){
    const receipt=receipts.get(op.id),saved=history.get(op.id);
    if(!receipt||!['accepted','already-applied','rejected'].includes(receipt.status)||receipt.status!=='rejected'&&(!saved||saved.incomeId!==op.incomeId||!samePendingRow(saved.operation,op)))throw new Error('La confirmación no coincide con el cambio de ingreso.');
   }
   incomeChanges=incomeChanges.flatMap(op=>{
    const sent=sentChanges.find(row=>row.id===op.id);if(!samePendingRow(sent,op))return [op];
    const receipt=receipts.get(op.id);return receipt.status==='rejected'?[{...op,syncRejected:true,syncError:receipt.error}]:[];
   });
  }
  if(result.incomeChangesV1!==true)incomeChanges=incomeChanges.map(op=>({...op,syncError:'Falta actualizar Code.gs para confirmar la edición, eliminación o reversión del ingreso.'}));
  const {inventoryResult,acknowledgements,ack,superseded:ignored,incomeChangeReceipts,...snapshot}=result;
  const complete=!pending.length&&!countQueue.length&&!incomeChanges.length,time=new Date().toISOString();
  return {...current,...snapshot,pending,countQueue,incomeChanges,incomeChangesV1:result.incomeChangesV1===true,countSyncError,lastFetchedAt:time,lastSyncAt:complete?time:current.lastSyncAt,stockAdjustmentLocalV1:result.stockAdjustmentLocalV1===true};
 }
 window.SKProductionSync={protocol,samePendingRow,reconcile,selectPending,selectIncomeChanges,pendingSummary,discardRejectedIncomeChanges,adjustmentUpgrade};
})();
