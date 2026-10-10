// Catálogo compartido: los criterios manuales también están disponibles en Producción.
(()=>{
 const norm=v=>String(v??'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ');
 const equipment=p=>{
  if(p.isYtSpare)return norm(p.spareEquipment).replace(/\s/g,'');
  const type=norm(p.clase),model=String(p.detalle??'').trim();
  return ['yt','columna'].includes(type)&&['28','29'].includes(model)?type+model:'';
 };
 function merge(legacy,criteria){
  const rows=legacy.filter(p=>!p.deleted&&p.active!==false&&equipment(p)).map(p=>({...p}));
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
 window.SKSpareCatalog={equipment,merge,filter,read,resolve};
})();
