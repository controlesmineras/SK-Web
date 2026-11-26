(()=>{
 'use strict';
 const section=document.getElementById('assetNoveltyQuery');
 const search=section.querySelector('input'),count=section.querySelector('[role=status]');
 const table=section.querySelector('.assetNoveltyScroll'),body=table.querySelector('tbody');
 let rows=[],revision=0;

 function personLines(person){
  return [person?.name,person?.document].filter(Boolean);
 }
 function historyRow(entry,asset){
  const row=entry.raw;
  const date=entry.date.split('-').reverse().join('/');
  const title=asset?window.SKAssetOwnership.label(asset):row.assetLabel||row.itemName||entry.assetId;
  const notes=[entry.state,row.notes||row.observaciones].filter(Boolean).join(' · ');
  const flags=[entry.reversed&&'Revertido',row.historyOnly&&'Solo historial',entry.pending&&'Pendiente de sincronización'].filter(Boolean);
  const cells=[
   [date,entry.time], [title],
   [entry.title,...flags,notes].filter(Boolean),
   [entry.location], personLines(entry.responsible), personLines(entry.warehouse), personLines(entry.registeredBy)
  ];
  const text=[...cells.flat(),entry.date,asset?.numeroClase,asset?.numeroYT,asset?.modelo,asset?.fabricante,
   asset?.marcaActual,asset?.marcaInterna,asset?.marcaAnterior,asset?.marcaPrevia,asset?.nuevaMarca,window.SKAssetRules.searchSerial(asset?.serial)].filter(Boolean).join(' ');
  return {cells,text};
 }
 function draw(){
  const query=window.SKAssetSearch.query(search.value);
  const visible=rows.filter(row=>query.matches(row.text));
  body.innerHTML=visible.map(({cells})=>'<tr>'+cells.map(lines=>{
   const [first,...rest]=lines;
   return '<td>'+(first?query.html(first):'—')+rest.map(line=>'<small>'+query.html(line)+'</small>').join('')+'</td>';
  }).join('')+'</tr>').join('');
  table.hidden=!visible.length;
  count.textContent=visible.length?(visible.length===1?'1 novedad':visible.length+' novedades')
   :rows.length?'Sin coincidencias.':'Aún no hay novedades registradas.';
 }
 async function render(){
  const version=++revision;
  try{
   const [assets,data]=await Promise.all([all('assets'),window.SKAssetHistoryUI.read()]);
   if(version!==revision)return;
   const byId=new Map(assets.map(asset=>[asset.id,asset]));
   rows=window.SKAssetHistory.timeline(data).map(entry=>historyRow(entry,byId.get(entry.assetId)));
   draw();
  }catch(error){
   if(version!==revision)return;
   rows=[];body.replaceChildren();table.hidden=true;count.textContent='No se pudieron cargar las novedades.';
   console.error('Consulta de novedades de activos',error);
  }
 }
 search.addEventListener('input',()=>{table.scrollTop=0;draw()});
 for(const event of ['skweb-synced','skweb-local-change','skweb-db-ready']){
  window.addEventListener(event,()=>{if(section.classList.contains('active'))void render()});
 }
 window.SKAssetNoveltyQuery={render};
})();
