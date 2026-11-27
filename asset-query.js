// Consulta independiente: solo lee el inventario y sus movimientos; nunca abre el editor.
(()=>{
 'use strict';
 const text=value=>String(value??'').trim();
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';');
 const date=value=>/^\d{4}-\d{2}-\d{2}$/.test(text(value))?value.split('-').reverse().join('/'):value;
 let rows=[],filtered=[],visible=[],data={},selectedId='',version=0;
 let refreshFrame=0;
 let revision=0;
 const columns=[
  {key:'label',title:'Clase',width:22},{key:'model',title:'Modelo',width:18},
  {key:'number',title:'#',width:8},{key:'serial',title:'Serial',width:19},
  {key:'mark',title:'Marca',width:12},{key:'mine',title:'Mina propietaria',width:20},
  {key:'state',title:'Estado',width:19},{key:'location',title:'Ubicación',width:25}
 ];
 let shownColumns=columns;
 const sortCriteria=[];
 const collator=new Intl.Collator('es',{numeric:true,sensitivity:'base'});
 const clean=value=>/^no aplica$/i.test(text(value))?'':text(value);
 const find=id=>document.getElementById(id);
 function classModel(asset){
  const raw=clean(asset.clase).replace(/\s+/g,' '),model=clean(asset.modelo);
  const family=raw.match(/^(YT|Columnas?)(?=\b|\d)[\s.-]*(.*)$/i);
  if(!family)return {clase:raw,label:raw,model,equipment:false};
  const clase=/^yt$/i.test(family[1])?'YT':'Columna';
  const suffix=family[2];
  const base=suffix&&!/^\d/.test(suffix)&&suffix.toLowerCase()!==model.toLowerCase()?raw:clase;
  const series=(model||(base===clase?suffix:'')).replace(/^(?:YT|Columnas?)[\s.-]*(?=\d)/i,'');
  return {clase:base,label:series?base+'.'+series:base,model:'',equipment:true};
 }

 const field=(name,value,wide=false)=>`<div${wide?' class="assetQueryWide"':''}><dt>${esc(name)}</dt><dd>${esc(text(value)||'No registrado')}</dd></div>`;
 const group=(name,fields)=>`<section class="assetQueryGroup"><h4>${esc(name)}</h4><dl>${fields}</dl></section>`;

 function mount(){
  if(document.getElementById('assetQuery'))return;
  const main=document.querySelector('main');if(!main)return;
  const section=document.createElement('section');section.id='assetQuery';section.className='view';
  section.innerHTML=`<div class="sectionHead"><h2>Consultar activos fijos</h2><button type="button" data-query-back>Volver a consultas</button></div>
   <div class="assetQueryLayout"><aside class="assetQueryFilters">
    <label for="assetQueryClass">Clase</label>
    <select id="assetQueryClass"><option value="">Todas las clases</option></select>
    <label for="assetQuerySearch">Buscar activo fijo</label>
    <input id="assetQuerySearch" type="search" autocomplete="off" placeholder="Clase, modelo, número, serial o marca…">
    <p id="assetQueryCount" role="status" aria-live="polite"></p>
    <button type="button" id="assetQueryExcel" disabled>Descargar Excel</button>
   </aside><div class="assetQueryResults">
    <div id="assetQueryOrder" role="group" aria-label="Orden de los resultados" hidden>
     <select id="assetQueryAddOrder" aria-label="Agregar criterio de orden"></select>
     <div id="assetQueryPriorities" role="group" aria-label="Prioridad de los criterios"></div>
    </div>
    <div id="assetQueryList" class="assetOverviewTable" role="region" aria-label="Activos encontrados" tabindex="0" hidden>
     <table><thead><tr></tr></thead><tbody></tbody></table>
    </div>
    <div id="assetQueryDetail" hidden></div>
   </div></div>`;
  main.append(section);
  section.querySelector('[data-query-back]').onclick=()=>window.SKAdminNav?.openQueryMenu?.();
  function filterChanged(){
   selectedId=''; draw();
   find('assetQueryList').scrollTop=0;
  }
  find('assetQueryClass').addEventListener('change',filterChanged);
  find('assetQuerySearch').addEventListener('input',filterChanged);
  find('assetQueryAddOrder').addEventListener('change',event=>{
   changeSort(event.target.value,'toggle');
  });
  section.addEventListener('click',event=>{
   const button=event.target.closest('button[data-sort-key]');
   if(!button)return;
   const {sortKey,sortAction}=button.dataset;
   const fromHeader=!!button.closest('th');
   changeSort(sortKey,sortAction);
   const host=find(fromHeader?'assetQueryList':'assetQueryPriorities');
   const focus=host.querySelector(`button[data-sort-key="${sortKey}"][data-sort-action="${sortAction}"]`)||
    host.querySelector(`button[data-sort-key="${sortKey}"]`)||find('assetQueryAddOrder');
   focus.focus({preventScroll:true});
  });
  find('assetQueryExcel').addEventListener('click',()=>{
   if(!visible.length||!window.SKAdminAuth.canView('assetQuery'))return;
   const name=find('assetQueryClass').value?(visible[0].clase||'Sin clase'):'Todas las clases';
   const filename='Activos - '+name.replace(/[\\/:*?"<>|]/g,'-')+'.xlsx';
   const values=visible.map(row=>shownColumns.map(col=>row.values[col.key]));
   window.SKDownloadTableExcel([shownColumns.map(col=>col.title),...values],filename,false,'Activos',shownColumns.map(col=>col.width));
  });
  find('assetQueryList').addEventListener('click',event=>{
   const row=event.target.closest('tr[data-query-asset-id]');if(!row)return;
   selectedId=row.dataset.queryAssetId; showSelection();
   find('assetQueryTitle')?.focus();
  });
  find('assetQueryDetail').addEventListener('click',event=>{
   if(!event.target.closest('[data-back-to-assets]'))return;
   const id=selectedId;selectedId='';showSelection();
   find('assetQueryList').querySelector('tr[data-query-asset-id="'+CSS.escape(id)+'"] button')?.focus();
  });
  const style=document.createElement('style');style.textContent=`
   #assetQuery .sectionHead{gap:12px;flex-wrap:wrap}
   .assetQueryLayout{display:grid;grid-template-columns:minmax(13rem,18rem) minmax(0,1fr);gap:1.25rem;align-items:start;margin-top:1rem}
   .assetQueryFilters{display:grid;align-content:start;min-width:0;gap:.4rem}
   .assetQueryFilters label{color:#f5f9fc}
   .assetQueryFilters select,.assetQueryFilters input{width:100%;min-width:0;margin:0 0 .6rem}
   .assetQueryResults{min-width:0}
   #assetQueryList tbody tr{cursor:pointer}
   #assetQueryList tbody tr:hover,#assetQueryList tbody tr:focus-within{background:#e6f1f7}
   #assetQueryList .assetQueryLink{background:none;border:0;padding:0;color:#15547a;text-decoration:underline;text-underline-offset:.17em;text-align:left;font:inherit;font-weight:650}
   #assetQueryList tr.external td:first-child{border-left:3px solid #c28b24}
   #assetQuery button:focus-visible{outline:3px solid #3981aa;outline-offset:2px}
   #assetQueryDetail[hidden]{display:none}
   #assetQuery .assetQueryCard{border:1px solid #cdd9e2;border-radius:14px;background:#fff;padding:20px;overflow-wrap:anywhere}
   #assetQuery h3{margin:12px 0 18px;line-height:1.4;font-size:1.15rem}
   #assetQuery h4{margin:20px 0 12px;padding-bottom:9px;border-bottom:1px solid #dce4ea;font-size:.95rem;color:#254b65;text-transform:uppercase}
   #assetQuery dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin:0}
   #assetQuery dt{font-size:.78rem;font-weight:700;color:#526777;text-transform:uppercase;margin-bottom:4px}
   #assetQuery dd{margin:0;white-space:pre-wrap;line-height:1.45}
   #assetQuery .assetQueryWide{grid-column:1/-1}
   #assetQuery .assetHistory{margin:20px 0 0}
   @media(max-width:800px){#assetQuery .assetQueryLayout{grid-template-columns:minmax(0,1fr)}}
   @media(max-width:420px){#assetQuery dl{grid-template-columns:minmax(0,1fr)}#assetQuery .assetQueryCard{padding:16px}}
  `;document.head.append(style);
 }

 function drawDetail(projection){
  const host=document.getElementById('assetQueryDetail');
  if(!projection){host.replaceChildren();return;}
  const a=projection.asset,canonical=window.SKAssetFields.canonical(a);
  const identity=classModel(a);
  const person=(data.personal||[]).find(row=>a.asignadaId&&row.id===a.asignadaId);
  const assigned=projection.assigned||{name:person?.nombre,document:person?.documento,area:person?.area,cargo:person?.cargo};
  const column=/^columnas?\b/i.test(text(a.clase));
  const selfRescuer=/autorrescatador/i.test(text(a.clase));
  const singleMark=!!text(a.nuevaMarca)&&text(a.nuevaMarca).toLowerCase()!=='no aplica'&&!/^(yt(?:\b|\d)|columnas?\b)/i.test(text(a.clase));
  const previousMark=[a.marcaPrevia,canonical.marcaActual].find(value=>text(value)&&text(value).toLowerCase()!=='no aplica'&&text(value).toLowerCase()!==text(a.nuevaMarca).toLowerCase());
  host.innerHTML=`<article class="assetQueryCard" aria-labelledby="assetQueryTitle">
   <button type="button" data-back-to-assets>Volver al listado</button>
   <h3 id="assetQueryTitle" tabindex="-1">${esc(window.SKAssetOwnership.label(a))}</h3>
   ${group('Información principal',[
    field('Clase',identity.label),field('#',canonical.numeroClase||a.orden),
    identity.equipment?'':field('Modelo',a.modelo),field('Marca comercial',a.fabricante),
    field('MARCA',(singleMark?a.nuevaMarca:canonical.marcaActual)||(a.marcaInternaNoRegistra?'No registra':'')),
    singleMark?(previousMark?field('MARCA ANTERIOR',previousMark):''):field('No. de marca actual',canonical.numeroMarcaActual)+field('Nueva marca',a.nuevaMarca)+field('Marca anterior',a.marcaPrevia),
    column&&window.SKAssetOwnership.isSK(a)?'':field('Serial',a.serial||window.SKAssetRules?.serialStatusLabel(a)),
    column||text(a.largo)?field('Largo (ft)',a.largo):'',
    selfRescuer||text(a.estadoVisor)?field('Color del visor',a.estadoVisor):'',
    field('¿Marcada físicamente?',a.marcada),field('Mina propietaria',a.mina),field('Mina de origen',a.minaOrigen),
    field('Fecha de ingreso',date(a.fechaIngreso))
   ].join(''))}
   ${group('Última novedad / estado actual',[
    field('Traslado permanente',projection.transferLabel),field('Ubicación',a.ubicacion,true),field('Estado',a.estado),field('Disponible para operación',a.disponibleEntrega),
    field('Fecha de novedad',date(a.fechaNovedad)),field('Hora de novedad',a.horaNovedad),
    field('Descripción de la novedad',a.descripcionNovedad,true),
    field('Responsable',a.nombreResponsable),field('Documento responsable',a.documentoResponsable),
    field('Bodeguero/a',a.nombreBodeguero),field('Documento bodeguero/a',a.documentoBodeguero)
   ].join(''))}
   ${group('Asignación',[
    field('Área asignada',a.areaAsignada||assigned.area,true),
    field('Funcionario asignado',assigned.name||(a.asignadaId?'Colaborador no encontrado':'Sin asignar')),
    field('Documento',assigned.document),field('Área del funcionario',assigned.area),field('Cargo',assigned.cargo)
   ].join(''))}
   ${group('Información adicional',field('Observaciones',a.observaciones,true))}
   ${a.hasAccessories!=null||(Array.isArray(a.accessories)&&a.accessories.length)?group('Accesorios',field('¿Trae accesorios?',a.hasAccessories===false?'No':a.hasAccessories===true||a.accessories?.length?'Sí':'Sin especificar')+((Array.isArray(a.accessories)?a.accessories:[]).map((row,index)=>field('Accesorio '+(index+1),typeof row==='string'?row:row.description,true)).join(''))):''}
   <section class="assetHistory" id="assetQueryHistory" aria-label="Historial del activo"></section>
   ${identity.equipment?'<details id="assetProductionMovements"><summary>Movimientos y repuestos de Producción</summary><div></div></details>':''}
  </article>`;
  const production=host.querySelector('#assetProductionMovements');
  production?.addEventListener('toggle',()=>{
    if(production.open)window.SKProductionMovements?.forAsset(production.querySelector('div'),a.id);
  });
  void showHistory(host.querySelector('#assetQueryHistory'),a,projection.events);
 }

 async function showHistory(host,asset,events){
  const ids=[...new Set(events.map(entry=>entry.raw.actaId).filter(Boolean))];
  let documents=[];
  if(ids.length){
   host.textContent='Cargando historial…';
   try{
    const store=db.transaction('actas').objectStore('actas');
    documents=(await Promise.all(ids.map(id=>idbResult(store.get(id))))).filter(Boolean);
   }catch(error){console.error('Lectura de actas del activo:',error)}
   if(!host.isConnected)return;
  }
  window.SKAssetHistoryUI.show(host,asset,events,documents);
 }

  function describe(projection) {
    const asset=projection.asset;
    const mineKey = value => clean(value).toLowerCase().replace(/[.\s-]/g,'');
    const transfers = projection.events.filter(entry => entry.kind==='mineExit' && !entry.reversed &&
      entry.raw.deliveryType==='TRASLADO' && clean(entry.raw.destinationMine) && entry.raw.destinationMine!=='Segovia');
    const firstTransfer = transfers[transfers.length-1];
    const latestTransfer = transfers[0];
    const origin = clean(asset.minaOrigen) || clean(firstTransfer?.raw.ownerMineBefore);
    const current = clean(asset.mina);
    const transferLabel = origin && current && mineKey(origin)!==mineKey(current) &&
      (latestTransfer ? mineKey(latestTransfer.raw.destinationMine)===mineKey(current) :
        mineKey(asset.ubicacion)===mineKey('Mina '+current))
      ? 'Trasladado a Mina ' + current : '';
    if (origin && !clean(asset.minaOrigen)) projection.asset={...asset,minaOrigen:origin};
    projection.transferLabel=transferLabel;
    const fields = window.SKAssetFields.canonical(asset);
    const {clase,label,model,equipment}=classModel(asset);
    const key = 'clase:' + clase.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const currentMark = clean(fields.marcaActual), newMark = clean(asset.nuevaMarca);
    const values={label,model,number:clean(fields.numeroClase)||clean(asset.orden),
      serial:clean(asset.serial)||window.SKAssetRules.serialStatusLabel(asset),
      mark:equipment?currentMark||newMark||clean(fields.numeroMarcaActual):newMark||currentMark,
      mine:clean(asset.mina),state:clean(asset.estado),location:[clean(asset.ubicacion),transferLabel].filter(Boolean).join(' · ')};
    const external=!window.SKAssetOwnership.isSK(asset);
    const searchText=[...Object.values({...values,serial:window.SKAssetRules.searchSerial(asset.serial)}),origin,window.SKAssetOwnership.label(asset),external?'externo externa externos externas transitorio':''].join(' ');
    const searchIndex=window.SKAssetSearch.indexText(asset,searchText);
    return {asset,key,clase,values,searchIndex,external,projection};
  }

 function updateClasses(){
  const filter=find('assetQueryClass'),selected=filter.value,classes=new Map();
  for(const {key,clase} of rows){
   if(!classes.has(key))classes.set(key,{name:clase||'Sin clase',count:0});
   classes.get(key).count++;
  }
  filter.replaceChildren(new Option('Todas las clases',''));
  for(const [key,group] of classes)filter.add(new Option(group.name+' ('+group.count+')',key));
  filter.value=classes.has(selected)?selected:'';
 }

 function showSelection(){
  const row=selectedId&&visible.find(row=>row.asset.id===selectedId);
  if(!row)selectedId='';
  find('assetQueryList').hidden=!!row||!visible.length;
  find('assetQueryOrder').hidden=!!row||!visible.length;
  find('assetQueryDetail').hidden=!row;
  drawDetail(row ? row.projection : null);
 }

 function visibleCriteria(){
  return sortCriteria.filter(entry=>shownColumns.some(col=>col.key===entry.key));
 }

 function changeSort(key,action){
  if(!shownColumns.some(col=>col.key===key))return;
  const index=sortCriteria.findIndex(entry=>entry.key===key);
  if(action==='toggle'){
   if(index<0)sortCriteria.push({key,dir:1});
   else sortCriteria[index].dir*=-1;
  }else if(action==='remove'){
   sortCriteria.splice(index,1);
  }else{
   const criteria=visibleCriteria();
   const position=criteria.findIndex(entry=>entry.key===key);
   const neighbor=criteria[position+(action==='earlier'?-1:1)];
   if(!neighbor)return;
   const target=sortCriteria.indexOf(neighbor);
   [sortCriteria[index],sortCriteria[target]]=[sortCriteria[target],sortCriteria[index]];
  }
  draw({reorder:true});
  find('assetQueryList').scrollTop=0;
 }

 function drawSort(criteria,head){
  const titles=new Map(shownColumns.map(col=>[col.key,col.title]));
  const add=find('assetQueryAddOrder');
  const available=shownColumns.filter(col=>!criteria.some(entry=>entry.key===col.key));
  add.replaceChildren(new Option('Agregar criterio de orden…',''),...available.map(col=>new Option(col.title,col.key)));
  add.disabled=!available.length;
  const button=(key,action,label,content)=>`<button type="button" data-sort-key="${key}" data-sort-action="${action}" title="${label}" aria-label="${label}">${content}</button>`;
  const toggleHint=entry=>titles.get(entry.key)+'. Cambiar a '+(entry.dir===1?'descendente':'ascendente');
  find('assetQueryPriorities').innerHTML=criteria.map((entry,index)=>{
   const {key,dir}=entry,name=titles.get(key);
   return '<span class="assetSortEntry">'+
    button(key,'toggle',toggleHint(entry),(index+1)+'. '+name+(dir===1?' ↑':' ↓'))+
    (index>0?button(key,'earlier','Subir prioridad de '+name,'←'):'')+
    (index+1<criteria.length?button(key,'later','Bajar prioridad de '+name,'→'):'')+
    button(key,'remove','Quitar '+name+' del orden','×')+'</span>';
  }).join('');
  head.innerHTML=shownColumns.map(({key,title})=>{
   const index=criteria.findIndex(entry=>entry.key===key),entry=criteria[index];
   const aria=index===0?' aria-sort="'+(entry.dir===1?'ascending':'descending')+'"':'';
   const mark=entry?(entry.dir===1?'↑':'↓')+'<sup>'+(index+1)+'</sup>':'↕';
   const hint=entry?'Prioridad '+(index+1)+'. '+toggleHint(entry):'Ordenar por '+title+' en orden ascendente';
   return '<th scope="col"'+aria+'>'+button(key,'toggle',hint,title+' <span aria-hidden="true">'+mark+'</span>')+'</th>';
  }).join('');
 }

 function draw({reorder=false}={}){
  const query=window.SKAssetSearch.query(find('assetQuerySearch').value),key=find('assetQueryClass').value;
  if(!reorder)filtered=rows.filter(row=>(!key||row.key===key)&&query.matchesIndex(row.searchIndex));
  const table=find('assetQueryList').querySelector('table');
  const body=table.tBodies[0];
  const nodes=reorder?new Map(visible.map((row,index)=>[row,body.children[index]])):null;
  shownColumns=filtered.some(row=>row.values.model)?columns:columns.filter(col=>col.key!=='model');
  const criteria=visibleCriteria();
  visible=criteria.length?filtered.slice():filtered;
  if(criteria.length)visible.sort((left,right)=>{
   for(const {key,dir} of criteria){
    const a=left.values[key],b=right.values[key];
    if(Boolean(a)!==Boolean(b))return a?-1:1;
    const difference=collator.compare(a||'',b||'');
    if(difference)return dir*difference;
   }
   return 0;
  });
  drawSort(criteria,table.tHead.rows[0]);
  if(reorder){
   const fragment=document.createDocumentFragment();
   for(const row of visible)fragment.append(nodes.get(row));
   body.replaceChildren(fragment);
   return;
  }
  const highlighted=new Map();
  function highlight(value){
   if(!highlighted.has(value))highlighted.set(value,query.html(value));
   return highlighted.get(value);
  }
  body.innerHTML=visible.map(({asset,values,external})=>{
   const title='Abrir ficha de '+[values.label,values.number,values.serial,values.mark].filter(Boolean).join(' · ');
   const link='<button type="button" class="assetQueryLink" aria-controls="assetQueryDetail" aria-label="'+esc(title)+'">'+highlight(values.label||'Sin clase')+'</button>';
   return '<tr data-query-asset-id="'+esc(asset.id)+'"'+(external?' class="external" title="Activo externo"':'')+'><td>'+link+'</td>'+
     shownColumns.slice(1).map(col=>{
      const badge=external&&col.key==='mine'?' <span class="externalBadge">'+highlight('EXTERNO')+'</span>':'';
      return '<td>'+highlight(values[col.key]||'—')+badge+'</td>';
     }).join('')+'</tr>';
  }).join('');
  find('assetQueryCount').textContent=visible.length===1?'1 activo encontrado':visible.length+' activos encontrados';
  find('assetQueryExcel').disabled=!visible.length;
  showSelection();
 }

 async function readList(){
  const [assets,history]=await Promise.all([all('assets'),window.SKAssetHistoryUI.read({assetsOnly:true})]);
  const project=window.SKAssetHistory.batchProjector(history);
  const list=assets.filter(asset=>!asset.deleted).map(asset=>describe(project(asset))).sort((a,b)=>
   collator.compare(a.clase,b.clase)||collator.compare(a.values.number,b.values.number)||
   collator.compare(clean(a.asset.modelo),clean(b.asset.modelo))||collator.compare(a.values.serial,b.values.serial));
  return {list,personal:history.personal};
 }

 function prepare(){
  if(rows.length||!window.SKAdminAuth?.canView?.('assetQuery')||typeof db==='undefined'||!db)return;
  const source=db,session=window.SKAdminAuth.token(),startRevision=revision;
  let expires=Infinity;
  const result=readList().catch(()=>null).finally(()=>{expires=performance.now()+5000});
  return {
   valid:()=>db===source&&revision===startRevision&&window.SKAdminAuth.token()===session&&performance.now()<expires,
   result
  };
 }

 async function render({list=false,prepared}={}){
  cancelAnimationFrame(refreshFrame);
  refreshFrame=0;
  mount();
  if(list&&selectedId){selectedId='';showSelection()}
  if(!window.SKAdminAuth?.canView?.('assetQuery'))return;
  const ticket=++version,count=find('assetQueryCount');
  if(!count)return;
  if(typeof db==='undefined'||!db){count.textContent='Iniciando almacenamiento local…';return;}
  if(list&&!rows.length)count.textContent='Cargando activos…';
  try{
   let result;
   if(prepared?.valid()){
    const snapshot=await prepared.result;
    if(prepared.valid())result=snapshot;
   }
   if(!result)result=await readList();
   if(ticket!==version||!window.SKAdminAuth.canView('assetQuery'))return;
   rows=result.list;data={personal:result.personal};
   updateClasses();draw();
  }catch(error){
   if(ticket!==version)return;
   console.error('Consulta de activos:',error);
   rows=[];data={};selectedId='';updateClasses();draw();
   count.textContent='No fue posible consultar los activos. Vuelve a abrir la consulta para reintentar.';
  }
 }
 window.SKAssetQuery={mount,render,prepare};
 for(const event of ['skweb-db-ready','skweb-synced','skweb-assets-normalized','skweb-inventory-refresh','skweb-local-change'])window.addEventListener(event,()=>{
  revision++;
  if(refreshFrame||!find('assetQuery')?.classList.contains('active'))return;
  refreshFrame=requestAnimationFrame(()=>{
   refreshFrame=0;
   if(find('assetQuery')?.classList.contains('active'))void render();
  });
 });
 mount();
})();
