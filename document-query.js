// Consulta de documentos: lee las actas/oficios locales y abre sus enlaces sin editar registros.
(()=>{
 'use strict';
 const text=value=>String(value??'').trim();
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';');
 const normalize=value=>text(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es');
 const typeOf=row=>row.tipo==='OFICIO'?'OFICIO':'ACTA';
 const originDate=row=>/^\d{4}-\d{2}-\d{2}$/.test(text(row.fecha))?text(row.fecha):'';
 const displayDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(text(value))?value.split('-').reverse().join('/'):'Sin fecha';
 const documentUrl=value=>{try{const url=new URL(text(value));return ['http:','https:'].includes(url.protocol)?url.href:''}catch{return ''}};
 let records=[],version=0;
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
    <label for="documentQueryType">Tipo de documento<select id="documentQueryType"><option value="ACTA">ACTAS</option><option value="OFICIO">OFICIOS</option></select></label>
    <label for="documentQueryFrom">Fecha desde<input id="documentQueryFrom" type="date"></label>
    <label for="documentQueryTo">Fecha hasta<input id="documentQueryTo" type="date"></label>
    <button type="button" id="documentQueryClear">Limpiar filtros</button>
   </div>
   <p id="documentQueryCount" class="hint" role="status" aria-live="polite"></p>
   <div id="documentQueryList" aria-busy="false"></div>`;
  main.append(section);
  section.querySelector('[data-document-query-back]').onclick=()=>window.SKAdminNav?.openQueryMenu?.();
  for(const id of ['documentQuerySearch','documentQueryType','documentQueryFrom','documentQueryTo'])node(id).addEventListener(id==='documentQuerySearch'?'input':'change',draw);
  node('documentQueryClear').onclick=()=>{for(const id of ['documentQuerySearch','documentQueryFrom','documentQueryTo'])node(id).value='';draw();node('documentQuerySearch').focus()};
  const style=document.createElement('style');style.textContent=`
   #documentQuery .sectionHead{gap:12px;flex-wrap:wrap}
   #documentQuery .documentQueryFilters{display:grid;grid-template-columns:minmax(230px,2fr) repeat(3,minmax(130px,1fr));gap:14px;align-items:end;margin:20px 0}
   #documentQuery label{display:grid;gap:7px;min-width:0;font-size:.9rem;font-weight:700}
   #documentQuery input,#documentQuery select{width:100%;min-width:0;box-sizing:border-box}
   #documentQueryClear{justify-self:start;background:#fff;color:#102f45;border:1px solid #b9cad6}
   #documentQueryList{display:grid;gap:14px}
   #documentQuery .documentQueryCard{border:1px solid #cdd9e2;border-radius:12px;padding:18px;background:#fff;overflow-wrap:anywhere}
   #documentQuery .documentQueryCardHead{display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:16px}
   #documentQuery h3{margin:0;color:#102f45;font-size:1.05rem}
   #documentQuery .documentQueryLink{display:inline-flex;align-items:center;min-height:44px;padding:8px 12px;box-sizing:border-box;border:1px solid #b9cad6;border-radius:8px;color:#1769aa;font-weight:750;text-decoration:underline;text-underline-offset:3px}
   #documentQuery .documentQueryNoLink{color:#657484;font-size:.88rem}
   #documentQuery dl{display:grid;grid-template-columns:minmax(130px,.65fr) minmax(0,1fr) minmax(0,1.6fr);gap:16px;margin:0}
   #documentQuery dt{font-size:.78rem;font-weight:700;color:#526777;text-transform:uppercase;margin-bottom:5px}
   #documentQuery dd{margin:0;white-space:pre-wrap;line-height:1.45}
   #documentQuery .documentQueryPending{margin:12px 0 0;color:#805400;font-size:.86rem}
   #documentQuery a:focus-visible,#documentQuery button:focus-visible{outline:3px solid #245779;outline-offset:3px}
   @media(max-width:800px){#documentQuery .documentQueryFilters{grid-template-columns:repeat(2,minmax(0,1fr))}#documentQuery .documentQuerySearchLabel{grid-column:1/-1}}
   @media(max-width:480px){#documentQuery dl{grid-template-columns:minmax(0,1fr)}#documentQuery .documentQueryCard{padding:15px}}
  `;document.head.append(style);
 }

 function draw(){
  const host=node('documentQueryList'),count=node('documentQueryCount');if(!host)return;
  if(!window.SKAdminAuth?.canView?.('documentQuery')){records=[];host.innerHTML='';count.textContent='Inicia sesión para consultar documentos.';return;}
  const query=normalize(node('documentQuerySearch').value),type=node('documentQueryType').value,from=node('documentQueryFrom').value,to=node('documentQueryTo').value;
  if(from&&to&&from>to){host.innerHTML='';count.textContent='La fecha inicial no puede ser posterior a la fecha final.';return;}
  const rows=records.filter(row=>{
   if(row.deleted||typeOf(row)!==type)return false;
   const date=originDate(row);if((from&&(!date||date<from))||(to&&(!date||date>to)))return false;
   if(/^\d+$/.test(query))return Number(row.consecutivo)===Number(query);
   const haystack=normalize([typeOf(row),row.consecutivo,row.fecha,displayDate(row.fecha),row.area,row.motivo,row.asunto,row.dirigidoA].join(' '));
   return query.split(/\s+/).every(word=>haystack.includes(word));
  }).sort((a,b)=>type==='ACTA'
   ?(Number(b.consecutivo)||0)-(Number(a.consecutivo)||0)||originDate(b).localeCompare(originDate(a))
   :(originDate(a)||'9999-12-31').localeCompare(originDate(b)||'9999-12-31')||(Number(a.consecutivo)||0)-(Number(b.consecutivo)||0));
  count.textContent=`${rows.length} documento${rows.length===1?'':'s'} encontrado${rows.length===1?'':'s'} · ${type==='ACTA'?'Número de acta: de mayor a menor':'Fecha de origen: del más antiguo al más reciente'}`;
  host.innerHTML=rows.map(row=>{
   const type=typeOf(row),title=`${type==='ACTA'?'Acta':'Oficio'} N.º ${text(row.consecutivo)||'Sin número'}`,url=documentUrl(row.enlace);
   return `<article class="documentQueryCard"><div class="documentQueryCardHead"><h3>${esc(title)}</h3>${url?`<a class="documentQueryLink" href="${esc(url)}" target="_blank" rel="noopener noreferrer" aria-label="Abrir ${esc(title)}">Abrir ${type==='ACTA'?'acta':'oficio'} ↗</a>`:`<span class="documentQueryNoLink">${text(row.enlace)?'Enlace no válido':'Sin enlace digitalizado'}</span>`}</div>
    <dl>${field('Fecha de origen',displayDate(row.fecha))}${type==='ACTA'?field('Área',row.area)+field('Motivo',row.motivo):field('Dirigido a',row.dirigidoA)+field('Asunto',row.asunto)}</dl>
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
 for(const event of ['skweb-db-ready','skweb-synced','skadmin-permissions'])window.addEventListener(event,()=>{
  if(!window.SKAdminAuth?.canView?.('documentQuery')){++version;records=[];draw();node('documentQueryList')?.setAttribute('aria-busy','false');}
  else if(node('documentQuery')?.classList.contains('active'))void render();
 });
 mount();
})();
