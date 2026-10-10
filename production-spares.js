// Copia el catálogo de Producción a los criterios de Plaza sin trasladar saldos.
(()=>{
 const norm=value=>String(value??'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ');
 const label=(equipment,number,name)=>['Repuesto '+equipment,number?'Ítem '+number:'',name].filter(Boolean).join(' - ');
 function plan(parts,criteria,stocks,timestamp){
  const items=[],balances=[],names=new Set(criteria.map(item=>norm(item.name))),ids=new Set(criteria.map(item=>item.id)),stockIds=new Set(stocks.map(row=>row.itemId));
  const candidates=parts.filter(part=>!part.deleted&&part.active!==false&&String(part.detalle).trim()==='29'&&String(part.nombre||'').trim());
  for(const part of candidates){
   // Consumo utiliza actualmente el catálogo del modelo 29 para ambos equipos.
   const equipment=norm(part.clase)==='columna'?['Columna 29']:['YT 29','Columna 29'];
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
