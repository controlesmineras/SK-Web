// Catálogo compartido: los criterios manuales también están disponibles en Producción.
(()=>{
 const norm=v=>String(v??'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ');
 const equipment=p=>{
  if(p.isYtSpare)return norm(p.spareEquipment).replace(/\s/g,'');
  const type=norm(p.clase),model=String(p.detalle??'').trim();
  return ['yt','columna'].includes(type)&&['28','29'].includes(model)?type+model:'';
 };
 function merge(legacy,criteria){
  const removed=criteria.filter(p=>p.permanentSpareDeleted&&p.deleted);
  const rows=legacy.filter(p=>!p.deleted&&p.active!==false&&equipment(p)&&!removed.some(item=>item.productionPartId===p.id&&equipment(item)===equipment(p))).map(p=>({...p}));
  for(const item of criteria.filter(p=>!p.deleted&&p.active!==false&&p.isYtSpare&&equipment(p))){
   const source=rows.find(p=>p.id===item.productionPartId&&equipment(p)===equipment(item));
   const row={...item,id:source?.id||item.id,criterionId:item.id,clase:equipment(item).startsWith('columna')?'Columna':'YT',detalle:equipment(item).slice(-2),numero:item.spareItemNumber??'',nombre:item.spareItemName||item.name||'',isInventoryCriterion:!source};
   const index=rows.findIndex(p=>p.id===row.id);
   if(index<0)rows.push(row);else rows[index]=row;
  }
  return rows;
 }
 const filter=(rows,type,origin)=>rows.filter(p=>equipment(p)===norm(type).replace(/\s/g,'')+String(origin).match(/(28|29)$/)?.[1]);
 async function read(){const [legacy,criteria]=await Promise.all([all('parts'),all('inventoryCriteria')]);return merge(legacy,criteria)}
 async function resolve(id,type,origin){return filter(await read(),type,origin).find(p=>p.id===id)}
 const deletionStores=['inventoryCriteria','inventoryStock','consumptions','incomes','blendingIncomes','blendingDeliveries'];
 function deletionPlan(item,snapshot,stamp){
  const matches=row=>{
   if(row.itemId===item.id||row.criterionId===item.id||row.partId===item.id)return true;
   if(!item.productionPartId||row.partId!==item.productionPartId)return false;
   const type=String(row.tipoEquipo||'').trim()||(/^columna/i.test(row.origen||row.destino||'')?'Columna':'YT');
   return norm(type).replace(/\s/g,'')+String(row.origen||row.destino||'').match(/(28|29)$/)?.[1]===equipment(item);
  };
  const marker=row=>({id:row.id,itemId:item.id,deleted:true,active:false,permanentSpareDeleted:true,updatedAt:stamp,syncState:'pending'});
  const changes={inventoryCriteria:[{...marker(item),isYtSpare:true,spareEquipment:item.spareEquipment,productionPartId:item.productionPartId||''}]};
  for(const store of deletionStores.slice(1))changes[store]=(snapshot[store]||[]).filter(row=>matches(row)&&!row.permanentSpareDeleted).map(marker);
  return changes;
 }
 async function applyDeletion(changes){
  await new Promise((resolve,reject)=>{const tx=db.transaction(deletionStores,'readwrite');for(const store of deletionStores)for(const row of changes[store]||[])tx.objectStore(store).put(row);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('No se pudo eliminar el repuesto'))});
 }
 let cleaning=false;
 async function cleanDeletedSpareHistory(){
  if(cleaning||!window.SKAdminAuth?.isOwner?.())return;cleaning=true;
  try{
   const values=await Promise.all(deletionStores.map(all)),snapshot=Object.fromEntries(deletionStores.map((key,i)=>[key,values[i]]));let changed=false;
   for(const item of snapshot.inventoryCriteria.filter(row=>row.deleted&&row.permanentSpareDeleted&&row.isYtSpare)){
    const changes=deletionPlan(item,snapshot,new Date().toISOString());
    if(!deletionStores.slice(1).some(store=>changes[store].length))continue;
    changes.inventoryCriteria=[];await applyDeletion(changes);changed=true;
   }
   if(changed){window.dispatchEvent(new Event('skweb-inventory-refresh'));window.dispatchEvent(new Event('skweb-consumption-changed'));window.skSyncApi?.schedule?.(300)}
  }finally{cleaning=false}
 }
 window.SKSpareCatalog={equipment,merge,filter,read,resolve,deletionStores,deletionPlan,applyDeletion};
 window.addEventListener('skweb-synced',()=>cleanDeletedSpareHistory().catch(console.error));
})();
