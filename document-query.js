// Consulta de documentos: lee las actas/oficios locales y abre sus enlaces con acceso a la edición de registros autorizados.
(()=>{
 'use strict';
 const text=value=>String(value??'').trim();
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';');
 const normalize=value=>text(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es');
 const typeOf=row=>row.tipo==='OFICIO'?'OFICIO':'ACTA';
 const originDate=row=>/^\d{4}-\d{2}-\d{2}$/.test(text(row.fecha))?text(row.fecha):'';
 const displayDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(text(value))?value.split('-').reverse().join('/'):'Sin fecha';
 const documentUrl=value=>{try{const url=new URL(text(value));return ['http:','https:'].includes(url.protocol)?url.href:''}catch{return ''}};
 let records=[],version=0,documentType='ACTA',numberDirection=-1;
 const node=id=>document.getElementById(id);
 const field=(label,value)=>`<div><dt>${esc(label)}</dt><dd>${esc(text(value)||'No registrado')}</dd></div>`;

 function mount(){
  if(node('documentQuery'))return;
  const main=document.querySelector('main');if(!main)return;
  const section=document.createElement('section');section.id='documentQuery';section.className='view';
  section.innerHTML=`<div class="sectionHead"><h2>Consultar documentos · actas y oficios</h2><button type="button" data-document-query-back>Volver a consultas</button></div>
   <p class="hint">Consulta los documentos guardados en este dispositivo. Sincroniza para recibir los registros de otros equipos. Los enlaces digitalizados pueden requerir conexión.</p>
   <div class="documentQueryFilters">
    <label class="documentQuerySearchLabel" for="documentQuerySearch">Buscar documento<input id="documentQuerySearch" type="search" autocomplete="off" placeholder="Número, área, motivo, asunto o destinatario…"></label>
    <div class="documentQueryTypeFilter">
     <span id="documentQueryTypeLabel">Tipo de documento</span>
     <div class="documentQueryTypes" role="group" aria-labelledby="documentQueryTypeLabel">
      <button id="documentQueryActas" type="button" aria-pressed="true">ACTAS</button>
      <button id="documentQueryOficios" type="button" aria-pressed="false">OFICIOS</button>
     </div>
    </div>
    <label for="documentQueryYear">Año<select id="documentQueryYear"><option value="">Todos los años</option></select></label>
    <button type="button" id="documentQueryClear">Limpiar filtros</button>
   </div>
   <p id="documentQueryCount" class="hint" role="status" aria-live="polite"></p>
   <div class="documentQueryHeading"><button id="documentQueryNumber" type="button">N.º de acta ↓</button></div>
   <div id="documentQueryList" aria-busy="false"></div>`;
  main.append(section);
  section.addEventListener('keydown',event=>{if(event.target.matches('[data-edit-document]')&&['Enter',' '].includes(event.key)){event.preventDefault();event.target.click()}});
  section.addEventListener('click',async event=>{
   if(event.target.closest('a'))return;
   const button=event.target.closest('[data-edit-document]');if(!button||!window.SKAdminAuth?.canView?.('actas'))return;
   await window.SKAdminNav?.go?.('actas');await window.SKActasAdmin?.edit?.(button.dataset.editDocument);
  });
  section.querySelector('[data-document-query-back]').onclick=()=>window.SKAdminNav?.openQueryMenu?.();
  const typeButtons={ACTA:node('documentQueryActas'),OFICIO:node('documentQueryOficios')};
  for(const [type,button] of Object.entries(typeButtons))button.addEventListener('click',()=>{
   documentType=type;
   for(const [value,control] of Object.entries(typeButtons))control.setAttribute('aria-pressed',String(value===type));
   draw();
  });
  node('documentQuerySearch').addEventListener('input',draw);
  node('documentQueryYear').addEventListener('change',draw);
  node('documentQueryNumber').addEventListener('click',()=>{numberDirection*=-1;draw()});
  node('documentQueryClear').onclick=()=>{for(const id of ['documentQuerySearch','documentQueryYear'])node(id).value='';draw();node('documentQuerySearch').focus()};
  const style=document.createElement('style');style.textContent=`
   #documentQuery .sectionHead{gap:12px;flex-wrap:wrap}
   #documentQuery .documentQueryFilters{display:grid;grid-template-columns:minmax(230px,2fr) repeat(2,minmax(130px,1fr));gap:14px;align-items:end;margin:20px 0}
   #documentQuery label{display:grid;gap:7px;min-width:0;font-size:.9rem;font-weight:700;color:#fff}
   #documentQuery .documentQueryTypeFilter{display:grid;gap:7px;min-width:0;font-size:.9rem;font-weight:700;color:#fff}
   #documentQuery .documentQueryTypes{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px}
   #documentQuery .documentQueryTypes button{min-height:44px;padding:.35rem .2rem;border:1px solid #bed3df;border-radius:7px;background:#eaf2f7;color:#173d59;font-size:.82rem;font-weight:750}
   #documentQuery .documentQueryTypes button[aria-pressed="true"]{background:#20628c;color:#fff;border-color:#78b4d7}
   #documentQuery :is(input,select){width:100%;min-width:0;box-sizing:border-box}
   #documentQueryClear{justify-self:start;background:#fff;color:#102f45;border:1px solid #b9cad6}
   #documentQuery .documentQueryHeading{margin:0 0 .45rem;padding-inline:12px}
   #documentQueryNumber{background:#eaf2f7;color:#173d59}
   #documentQueryList{display:grid;gap:8px}
   #documentQuery .documentQueryCard{border:1px solid #cdd9e2;border-radius:10px;padding:10px 12px;background:#fff;overflow-wrap:anywhere}
   #documentQuery [data-edit-document]{cursor:pointer}#documentQuery [data-edit-document]:focus-visible{outline:3px solid #245779;outline-offset:3px}#documentQuery .documentQueryCardHead{display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:8px}
   #documentQuery h3{margin:0;color:#102f45;font-size:1.05rem}
   #documentQuery .documentQueryLink{display:inline-flex;align-items:center;min-height:44px;padding:8px 12px;box-sizing:border-box;border:1px solid #b9cad6;border-radius:8px;color:#1769aa;font-weight:750;text-decoration:underline;text-underline-offset:3px}
   #documentQuery .documentQueryNoLink{color:#657484;font-size:.88rem}
   #documentQuery dl{display:grid;grid-template-columns:minmax(130px,.65fr) minmax(0,1fr) minmax(0,1.6fr);gap:16px;margin:0}
   #documentQuery dt{font-size:.78rem;font-weight:700;color:#526777;text-transform:uppercase;margin-bottom:2px}
   #documentQuery dd{margin:0;white-space:pre-wrap;line-height:1.45}
   #documentQuery .documentQueryReserved{grid-column:2 / -1}
   #documentQuery .documentQueryReserved dd{display:inline-block;padding:2px 7px;border-radius:5px;background:#fff0b3;color:#713f12;font-size:.88rem}
   #documentQuery .documentQueryReason{margin:4px 0 0;color:#526777;font-size:.88rem}
   #documentQuery .documentQueryPending{margin:12px 0 0;color:#805400;font-size:.86rem}
   #documentQuery a:focus-visible,#documentQuery button:focus-visible{outline:3px solid #245779;outline-offset:3px}
   @media(min-width:960px){
    #documentQuery .documentQueryCard{display:grid;grid-template-columns:minmax(8rem, .8fr) minmax(0, 4fr) minmax(7rem, auto);align-items:center;gap:0 14px;padding:5px 12px}
    #documentQuery .documentQueryCardHead{display:contents}
    #documentQuery .documentQueryCardHead h3{grid-area:1 / 1}
    #documentQuery .documentQueryCardHead :is(a,span){grid-area:1 / 3;justify-self:end;text-align:right}
    #documentQuery .documentQueryCard > dl{grid-area:1 / 2;grid-template-columns:minmax(6rem, .65fr) minmax(0, 1fr) minmax(0, 1.6fr);gap:12px}
    #documentQuery .documentQueryCard > p{grid-column:1 / -1}
   }
   @media(max-width:800px){#documentQuery .documentQueryFilters{grid-template-columns:repeat(2,minmax(0,1fr))}#documentQuery .documentQuerySearchLabel{grid-column:1/-1}}
   @media(max-width:480px){#documentQuery .documentQueryReserved{grid-column:1}#documentQuery dl{grid-template-columns:minmax(0,1fr)}#documentQuery .documentQueryCard{padding:10px}}
  `;document.head.append(style);
 }

 function draw(){
  const host=node('documentQueryList'),count=node('documentQueryCount');if(!host)return;
  if(!window.SKAdminAuth?.canView?.('documentQuery')){records=[];host.innerHTML='';count.textContent='Inicia sesión para consultar documentos.';return;}
  const search=node('documentQuerySearch'),yearInput=node('documentQueryYear'),numberHeader=node('documentQueryNumber'),type=documentType;
  const query=normalize(search.value),year=yearInput.value;
  const yearOf=row=>originDate(row).slice(0,4)||text(row.fecha).match(/^\d{2}\/\d{2}\/(\d{4})$/)?.[1]||'';
  const byType=records.filter(row=>!row.deleted&&typeOf(row)===type);
  const years=[...new Set(byType.map(yearOf).filter(Boolean))].sort((a,b)=>b.localeCompare(a));
  const yearOptions=[...new Set([...years,...(year?[year]:[])])].sort((a,b)=>b.localeCompare(a));
  yearInput.innerHTML='<option value="">Todos los años</option>'+yearOptions.map(value=>'<option>'+esc(value)+'</option>').join('');
  yearInput.value=year;
  search.placeholder=type==='ACTA'?'Número, área o motivo…':'Número, asunto o destinatario…';
  const heading=type==='ACTA'?'N.º de acta':'N.º de oficio';
  numberHeader.textContent=heading+(numberDirection===-1?' ↓':' ↑');
  numberHeader.setAttribute('aria-label',heading+(numberDirection===-1?', de mayor a menor. Ordenar de menor a mayor':', de menor a mayor. Ordenar de mayor a menor'));
  const rows=byType.filter(row=>{
   if(year&&yearOf(row)!==year)return false;
   if(/^\d+$/.test(query))return Number(row.consecutivo)===Number(query);
   const haystack=normalize([typeOf(row),row.consecutivo,row.fecha,displayDate(row.fecha),row.area,row.motivo,row.asunto,row.dirigidoA].join(' '));
   return query.split(/\s+/).every(word=>haystack.includes(word));
  }).sort((a,b)=>numberDirection*((Number(a.consecutivo)||0)-(Number(b.consecutivo)||0))||originDate(b).localeCompare(originDate(a)));
  count.textContent=`${rows.length} documento${rows.length===1?'':'s'} encontrado${rows.length===1?'':'s'}`;
  host.innerHTML=rows.map(row=>{
   const type=typeOf(row),title=`${type==='ACTA'?'Acta':'Oficio'} N.º ${text(row.consecutivo)||'Sin número'}`,url=documentUrl(row.enlace);
   const reserved=row.documentStatus==='not_created';
   const reason=text(row.notCreatedReason);
   const showReason=reserved&&reason&&normalize(reason).replace(/[.,]/g,'')!=='acta registrada pero no elaborada';
   return `<article class="documentQueryCard" ${window.SKAdminAuth?.canView?.('actas')?`data-edit-document="${esc(row.id)}" tabindex="0" aria-label="Seleccionar ${esc(title)} para editar"`:''}><div class="documentQueryCardHead"><h3>${esc(title)}</h3>${reserved?'':url?`<a class="documentQueryLink" href="${esc(url)}" target="_blank" rel="noopener noreferrer" aria-label="Abrir ${esc(title)}">Abrir ${type==='ACTA'?'acta':'oficio'} ↗</a>`:`<span class="documentQueryNoLink">${text(row.enlace)?'Enlace no válido':'Sin enlace digitalizado'}</span>`}</div>
    <dl>${field('Fecha de origen',displayDate(row.fecha))}${reserved?'<div class="documentQueryReserved"><dt>Estado</dt><dd><strong>Acta no elaborada</strong> · N.º reservado</dd></div>':type==='ACTA'?field('Área',row.area)+field('Motivo',row.motivo):field('Dirigido a',row.dirigidoA)+field('Asunto',row.asunto)}</dl>
    ${showReason?`<p class="documentQueryReason">${esc(reason)}</p>`:''}
    ${row.syncState==='pending'?'<p class="documentQueryPending">Pendiente de sincronizar</p>':''}</article>`;
  }).join('')||'<p class="hint">No hay documentos que coincidan. Revisa los filtros o sincroniza para recibir registros de otros dispositivos.</p>';
 }

 async function render(){
  mount();const ticket=++version,host=node('documentQueryList'),count=node('documentQueryCount');if(!host)return;
  if(!window.SKAdminAuth?.canView?.('documentQuery')){draw();host.setAttribute('aria-busy','false');return;}
  if(typeof db==='undefined'||!db||typeof all!=='function'){count.textContent='Iniciando almacenamiento local…';return;}
  count.textContent='Consultando documentos…';host.setAttribute('aria-busy','true');
  try{const result=await all('actas');if(ticket!==version)return;records=result;draw();}
  catch(error){if(ticket!==version)return;console.error('Consulta de documentos:',error);records=[];host.innerHTML='';count.textContent='No fue posible consultar los documentos. Vuelve a abrir la consulta para reintentar.';}
  finally{if(ticket===version)host.setAttribute('aria-busy','false');}
 }
 window.SKDocumentQuery={mount,render};
 for(const event of ['skweb-db-ready','skweb-synced','skadmin-permissions','skweb-documents-changed'])window.addEventListener(event,()=>{
  if(!window.SKAdminAuth?.canView?.('documentQuery')){++version;records=[];draw();node('documentQueryList')?.setAttribute('aria-busy','false');}
  else if(node('documentQuery')?.classList.contains('active'))void render();
 });
 mount();
})();
