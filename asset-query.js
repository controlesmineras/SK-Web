// Consulta independiente: solo lee el inventario y sus movimientos; nunca abre el editor.
(()=>{
 'use strict';
 const text=value=>String(value??'').trim();
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';');
 const date=value=>/^\d{4}-\d{2}-\d{2}$/.test(text(value))?value.split('-').reverse().join('/'):value;
 let assets=[],data={},actas=[],selectedId='',version=0;
 const field=(name,value,wide=false)=>`<div${wide?' class="assetQueryWide"':''}><dt>${esc(name)}</dt><dd>${esc(text(value)||'No registrado')}</dd></div>`;
 const group=(name,fields)=>`<section class="assetQueryGroup"><h4>${esc(name)}</h4><dl>${fields}</dl></section>`;

 function mount(){
  if(document.getElementById('assetQuery'))return;
  const main=document.querySelector('main');if(!main)return;
  const section=document.createElement('section');section.id='assetQuery';section.className='view';
  section.innerHTML=`<div class="sectionHead"><h2>Consultar activos fijos</h2><button type="button" data-query-back>Volver a consultas</button></div>
   <p class="hint">Busca un equipo y selecciónalo para ver su ficha. Consulta de solo lectura.</p>
   <div class="assetQueryLayout"><aside>
    <label for="assetQuerySearch">Buscar activo fijo</label>
    <input id="assetQuerySearch" type="search" autocomplete="off" placeholder="Buscar clase, número de clase, marca actual, nueva marca, serial…">
    <p id="assetQueryCount" class="hint" role="status"></p>
    <div id="assetQueryList" class="assetAdminList"></div>
   </aside><div id="assetQueryDetail" aria-busy="false"><p class="hint">Selecciona un activo para consultar su ficha.</p></div></div>`;
  main.append(section);
  section.querySelector('[data-query-back]').onclick=()=>window.SKAdminNav?.openQueryMenu?.();
  section.querySelector('#assetQuerySearch').addEventListener('input',draw);
  section.querySelector('#assetQueryList').addEventListener('click',event=>{
   const button=event.target.closest('[data-query-asset-id]');if(!button)return;
   selectedId=button.dataset.queryAssetId;
   void render({focusDetail:true});
  });
  const style=document.createElement('style');style.textContent=`
   #assetQuery .sectionHead{gap:12px;flex-wrap:wrap}
   #assetQuery .assetQueryLayout{display:grid;grid-template-columns:minmax(280px,.85fr) minmax(0,1.4fr);gap:24px;align-items:start}
   #assetQuery aside,#assetQueryDetail{min-width:0}
   #assetQuerySearch{width:100%;margin-top:8px}
   #assetQueryList{max-height:68vh;overflow-y:auto;padding:3px}
   #assetQuery .assetRow{display:block;width:100%;text-align:left;overflow-wrap:anywhere}
   #assetQuery .assetRow[aria-pressed="true"]{background:#e4eff7;border:2px solid #245779}
   #assetQuery .assetRow:focus-visible,#assetQuery button:focus-visible{outline:3px solid #245779;outline-offset:2px}
   #assetQuery .assetQueryCard{border:1px solid #cdd9e2;border-radius:14px;background:#fff;padding:20px;overflow-wrap:anywhere}
   #assetQuery .assetQueryBadge{display:inline-block;background:#e9f0f5;color:#254b65;border-radius:20px;padding:5px 10px;font-size:.8rem;font-weight:700}
   #assetQuery h3{margin:12px 0 18px;line-height:1.4;font-size:1.15rem}
   #assetQuery h4{margin:20px 0 12px;padding-bottom:9px;border-bottom:1px solid #dce4ea;font-size:.95rem;color:#254b65;text-transform:uppercase}
   #assetQuery dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin:0}
   #assetQuery dt{font-size:.78rem;font-weight:700;color:#526777;text-transform:uppercase;margin-bottom:4px}
   #assetQuery dd{margin:0;white-space:pre-wrap;line-height:1.45}
   #assetQuery .assetQueryWide{grid-column:1/-1}
   #assetQuery .assetHistory{margin:20px 0 0}
   #assetQueryDetail[aria-busy="true"]{opacity:.65}
   @media(max-width:800px){#assetQuery .assetQueryLayout{grid-template-columns:minmax(0,1fr)}#assetQueryList{max-height:42vh}}
   @media(max-width:420px){#assetQuery dl{grid-template-columns:minmax(0,1fr)}#assetQuery .assetQueryCard{padding:16px}}
  `;document.head.append(style);
 }

 function drawDetail(projection){
  const host=document.getElementById('assetQueryDetail');
  if(!projection){host.innerHTML='<p class="hint">Selecciona un activo para consultar su ficha.</p>';return;}
  const a=projection.asset,canonical=window.SKAssetFields.canonical(a);
  const person=(data.personal||[]).find(row=>a.asignadaId&&row.id===a.asignadaId);
  const assigned=projection.assigned||{name:person?.nombre,document:person?.documento,area:person?.area,cargo:person?.cargo};
  const column=/^columnas?\b/i.test(text(a.clase));
  const selfRescuer=/autorrescatador/i.test(text(a.clase));
  host.innerHTML=`<article class="assetQueryCard" aria-labelledby="assetQueryTitle">
   <span class="assetQueryBadge">SOLO LECTURA</span>
   <h3 id="assetQueryTitle" tabindex="-1">${esc(window.SKAssetOwnership.label(a))}</h3>
   ${group('Información principal',[
    field('Clase',a.clase),field('Número de clase',canonical.numeroClase),
    field('Modelo',a.modelo),field('Marca comercial',a.fabricante),
    field('Marca actual',canonical.marcaActual),field('No. de marca actual',canonical.numeroMarcaActual),
    field('Nueva marca',a.nuevaMarca),field('Marca anterior',a.marcaPrevia),
    column?'':field('Serial',a.serial),
    column||text(a.largo)?field('Largo (ft)',a.largo):'',
    selfRescuer||text(a.estadoVisor)?field('Color del visor',a.estadoVisor):'',
    field('¿Marcada físicamente?',a.marcada),field('Mina propietaria',a.mina),
    field('Fecha de ingreso',date(a.fechaIngreso))
   ].join(''))}
   ${group('Última novedad / estado actual',[
    field('Ubicación',a.ubicacion,true),field('Estado',a.estado),field('Disponible para entrega',a.disponibleEntrega),
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
   <section class="assetHistory" id="assetQueryHistory" aria-label="Historial del activo"></section>
  </article>`;
  window.SKAssetHistoryUI.show(host.querySelector('#assetQueryHistory'),a,projection.events,actas);
 }

 function draw(){
  const list=document.getElementById('assetQueryList');if(!list)return;
  const projections=new Map(assets.filter(a=>!a.deleted).map(a=>[a.id,window.SKAssetHistory.project(a,data)]));
  const rows=window.SKAssetOwnership.search([...projections.values()].map(p=>p.asset),document.getElementById('assetQuerySearch').value);
  if(!rows.some(a=>a.id===selectedId))selectedId='';
  document.getElementById('assetQueryCount').textContent=`${rows.length} activo${rows.length===1?'':'s'} encontrado${rows.length===1?'':'s'}`;
  list.innerHTML=rows.map(a=>{
   const external=!window.SKAssetOwnership.isSK(a);
   return `<button type="button" class="assetRow${external?' assetRowExternal':''}" data-query-asset-id="${esc(a.id)}" aria-pressed="${a.id===selectedId}" aria-controls="assetQueryDetail">
    <b>${external?'<span class="externalBadge">EXTERNO</span> ':''}${esc(window.SKAssetOwnership.label(a))}</b>
    <small>Mina propietaria: ${esc(a.mina||'Sin registrar')} · Ubicación: ${esc(a.ubicacion||'Sin ubicación')} · ${esc(a.estado||'Sin estado')}${external?' · TRANSITORIO':''}</small>
   </button>`;
  }).join('')||'<p class="hint">No hay activos que coincidan.</p>';
  drawDetail(projections.get(selectedId));
 }

 async function render({focusDetail=false}={}){
  mount();
  if(!window.SKAdminAuth?.canView?.('assetQuery'))return;
  const ticket=++version,host=document.getElementById('assetQueryDetail'),count=document.getElementById('assetQueryCount');
  if(!host)return;
  if(typeof db==='undefined'||!db||typeof all!=='function'){count.textContent='Iniciando almacenamiento local…';return;}
  count.textContent='Consultando activos…';host.setAttribute('aria-busy','true');
  try{
   const result=await Promise.all([all('assets'),window.SKAssetHistoryUI.read(),all('actas')]);
   if(ticket!==version)return;
   [assets,data,actas]=result;draw();
   if(focusDetail&&document.getElementById('assetQuery')?.classList.contains('active')){
    document.getElementById('assetQueryTitle')?.focus({preventScroll:true});
    host.scrollIntoView({behavior:'smooth',block:'start'});
   }
  }catch(error){
   if(ticket!==version)return;
   console.error('Consulta de activos:',error);
   assets=[];data={};actas=[];selectedId='';draw();
   count.textContent='No fue posible consultar los activos. Vuelve a abrir la consulta para reintentar.';
  }finally{if(ticket===version)host.setAttribute('aria-busy','false');}
 }
 window.SKAssetQuery={mount,render};
 for(const event of ['skweb-db-ready','skweb-synced','skweb-assets-normalized','skweb-inventory-refresh'])window.addEventListener(event,()=>{
  if(document.getElementById('assetQuery')?.classList.contains('active'))void render();
 });
 mount();
})();
