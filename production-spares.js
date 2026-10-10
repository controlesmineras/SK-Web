// Copia el catálogo de Producción a los criterios de Plaza sin trasladar saldos.
(()=>{
 const norm=value=>String(value??'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ');
 const label=(equipment,number,name)=>['Repuesto '+equipment,number?'Ítem '+number:'',name].filter(Boolean).join(' - ');
 function plan(parts,criteria,stocks,timestamp){
  const items=[],balances=[],names=new Set(criteria.map(item=>norm(item.name))),ids=new Set(criteria.map(item=>item.id)),stockIds=new Set(stocks.map(row=>row.itemId));
  const candidates=parts.filter(part=>!part.deleted&&part.active!==false&&String(part.detalle).trim()==='29'&&String(part.nombre||'').trim());
  for(const part of candidates){
   // La clase del catálogo es la fuente: compartir modelo no implica compartir repuestos.
   const equipment=norm(part.clase)==='columna'?['Columna 29']:norm(part.clase)==='yt'?['YT 29']:[];
   for(const type of equipment){
    const number=String(part.numero??'').trim(),name=String(part.nombre).trim(),visible=label(type,number,name);
    const existing=criteria.find(item=>norm(item.name)===norm(visible)||(item.isYtSpare&&item.spareEquipment===type&&String(item.spareItemNumber??'').trim()===number&&norm(item.spareItemName)===norm(name)));
    if(existing||names.has(norm(visible)))continue;
    const id='plaza-production-spare-v1-'+encodeURIComponent(type+'|'+number+'|'+norm(name));
    if(ids.has(id))continue;
    items.push({id,name:visible,isYtSpare:true,spareEquipment:type,spareItemNumber:number,spareItemName:name,productionPartId:part.id,unit:'Unidad',secondaryName:'',tertiaryName:'',containerUnit:'',isFixedAsset:false,isEpp:false,usesSerial:false,usesLength:false,usesModel:false,usesManufacturer:false,requiresInternalMark:false,fractionable:false,allowAssignment:true,allowLoan:false,allowTransfer:true,allowRemission:true,deliveryWarehouse:'Producción',active:true,deleted:false,createdAt:timestamp,updatedAt:timestamp,syncState:'pending',catalogMigration:'production-spares-v1'});
    names.add(norm(visible));ids.add(id);
    if(!stockIds.has(id)){balances.push({id:'stock-'+id,itemId:id,quantity:0,initialQuantity:0,active:true,initialRecordedAt:timestamp,createdAt:timestamp,updatedAt:timestamp,syncState:'pending'});stockIds.add(id)}
   }
  }
  // Retirar únicamente las copias Columna creadas automáticamente desde un repuesto YT.
  // Conservar identificadores, saldos e historial; no tocar criterios manuales.
  for(const item of criteria){
   if(item.deleted||item.active===false||item.catalogMigration!=='production-spares-v1'||item.spareEquipment!=='Columna 29')continue;
   const source=parts.find(part=>part.id===item.productionPartId);
   if(!source||norm(source.clase)!=='yt'||String(source.detalle).trim()!=='29')continue;
   const number=String(source.numero??'').trim(),name=String(source.nombre||'').trim();
   const generatedId='plaza-production-spare-v1-'+encodeURIComponent('Columna 29|'+number+'|'+norm(name));
   if(item.id!==generatedId||item.name!==label('Columna 29',number,name)||String(item.spareItemNumber??'').trim()!==number||norm(item.spareItemName)!==norm(name))continue;
   items.push({...item,active:false,deleted:true,deactivatedAt:timestamp,updatedAt:timestamp,syncState:'pending',catalogCorrection:'production-spares-v2',correctionReason:'Copia Columna retirada: el catálogo original identifica este repuesto como YT 29.'});
   for(const stock of stocks.filter(row=>row.itemId===item.id))balances.push({...stock,active:false,updatedAt:timestamp,syncState:'pending'});
  }
  return {items,balances};
 }
 let busy=false;
 async function importCatalog(event){
  if(busy||!window.SKAdminAuth?.isOwner?.()||event?.detail?.source!=='api'||event.detail.acknowledged||event.detail.notModified)return;
  busy=true;
  try{
   const [parts,criteria,stocks]=await Promise.all(['parts','inventoryCriteria','inventoryStock'].map(all)),changes=plan(parts,criteria,stocks,new Date().toISOString());
   if(!changes.items.length)return;
   // Una transacción evita dejar criterios creados sin sus saldos iniciales.
   await new Promise((resolve,reject)=>{
    const tx=db.transaction(['inventoryCriteria','inventoryStock'],'readwrite');
    changes.items.forEach(row=>tx.objectStore('inventoryCriteria').put(row));
    changes.balances.forEach(row=>tx.objectStore('inventoryStock').put(row));
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
   });
   window.dispatchEvent(new Event('skweb-inventory-refresh'));window.skSyncApi?.schedule?.(300);
  }catch(error){console.error('No se pudo copiar el catálogo de repuestos a Plaza Blending:',error)}
  finally{busy=false}
 }
 window.SKProductionSpares={plan};
 window.addEventListener('skweb-synced',importCatalog);
 // La copia se realiza después de leer la base completa y solo con sesión propietaria.
 async function readFullCatalog(){
  if(!window.SKAdminAuth?.isOwner?.())return;
  // Si había una sincronización en curso, esperar antes de pedir la lectura completa.
  await window.skSyncApi?.sync?.({silent:true});
  await window.skSyncApi?.sync?.({silent:true,forceFull:true});
 }
 window.addEventListener('skadmin-authenticated',()=>setTimeout(readFullCatalog,1500));
 window.addEventListener('load',()=>setTimeout(readFullCatalog,3500));
})();
