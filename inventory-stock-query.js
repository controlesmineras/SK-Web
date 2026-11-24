// Consulta de solo lectura de las existencias de Plaza Blending desde SK Admin.
(()=>{
 'use strict';
 const host=document.getElementById('inventoryStockQuery');
 const search=host.querySelector('input'),body=host.querySelector('tbody'),count=host.querySelector('#stockQueryCount');
 const reference=window.SKInventoryReference;
 host.querySelector('[data-reference-heading]').append(reference.heading());
 let items=[],version=0;
 const norm=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es');
 function draw(){
  const query=norm(search.value.trim()),rows=items.filter(row=>row.search.includes(query));
  count.textContent=rows.length+' elementos';
  body.replaceChildren(...rows.map(({item,name,unit,quantity,referenceUrl})=>{
   const tr=document.createElement('tr');
   const label=tr.insertCell();label.textContent=name;
   label.insertAdjacentHTML('beforeend',window.SKSpareGroups.aliasLine(item,query));
   for(const value of [unit,quantity])tr.insertCell().textContent=value;
   tr.insertCell().append(reference.link(referenceUrl,name));return tr;
  }));
 }
 async function render(){
  if(typeof db==='undefined'||!db)return;
  const revision=++version;
  const [criteria,stock,adjustments]=await Promise.all([all('inventoryCriteria'),all('inventoryStock'),all(quantityAdjustments)]);
  const stockById=new Map(stock.filter(row=>!row.deleted&&row.active!==false).map(row=>[row.itemId,row.quantity]));
  for(const pending of adjustments){
   if((pending.warehouse||'plaza')==='plaza'&&!pending.syncError)stockById.set(pending.itemId,pending.quantity);
  }
  const active=criteria.filter(item=>item.id&&!item.deleted&&item.active!==false&&item.recordType!=='formOptions'&&item.id!=='SYSTEM-FORM-OPTIONS-V1');
  const {fixedCriterion,availableFixedQuantity}=window.SKInventoryAdmin;
  const assets=active.some(fixedCriterion)?await all('assets'):[];
  const result=await Promise.all(active.map(async item=>{
   const name=item.name||item.nombre||item.elemento||item.CI_ELEMENTO||'Sin nombre';
   return {item,name,unit:item.unit||item.unidadMedida||item.CI_UNIDAD_MEDIDA||'',
    quantity:fixedCriterion(item)?await availableFixedQuantity(item,'plaza',assets):stockById.get(item.id)??0,
    referenceUrl:item.referenceUrl,search:norm([name,...window.SKSpareGroups.aliases(item),item.sparePartCode].filter(Boolean).join(' '))};
  }));
  if(revision!==version)return;
  items=result.sort((a,b)=>a.name.localeCompare(b.name,'es',{numeric:true}));draw();
 }
 search.addEventListener('input',draw);
 function refreshActive(){if(host.classList.contains('active'))void render()}
 window.addEventListener('skweb-synced',refreshActive);
 window.addEventListener('skweb-inventory-refresh',refreshActive);
 window.SKInventoryStockQuery={render};
})();
