// Consulta de personal de solo lectura, resaltando datos faltantes.
(()=>{
 'use strict';
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';');
 const norm=s=>String(s||'').trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
 const missing=p=>[['documento','documento'],['nombre','nombre'],['empresa','empresa'],['area','área'],['cargo','cargo']].filter(([k])=>!String(p[k]||'').trim()||k==='cargo'&&p[k]==='No informado').map(([,label])=>label);
 let version=0;
 function mount(){
  if(document.getElementById('personQuery'))return;
  const main=document.querySelector('main');if(!main)return;
  const sec=document.createElement('section');sec.id='personQuery';sec.className='view';
  sec.innerHTML=`<div class="sectionHead"><h2>Consultar personal</h2><button type="button" data-return-home>Volver al inicio</button></div><p class="hint">Consulta de solo lectura para verificar la información registrada de cada colaborador.</p><input id="personQuerySearch" type="search" aria-label="Buscar personal" placeholder="Buscar por nombre o documento…" autocomplete="off"><p id="personQueryCount" class="hint" role="status" aria-live="polite"></p><div id="personQueryList" class="list" aria-busy="false"></div>`;
  main.appendChild(sec);
  sec.querySelector('[data-return-home]').onclick=()=>window.SKAdminNav?.go?.('home');
  sec.querySelector('#personQuerySearch').addEventListener('input',render);
 }
 async function render(){
  mount();const ticket=++version,host=document.getElementById('personQueryList'),count=document.getElementById('personQueryCount');if(!host)return;
  if(!window.SKAdminAuth?.canView?.('personQuery')){host.innerHTML='';count.textContent='Inicia sesión para consultar personal.';host.setAttribute('aria-busy','false');return;}
  // app.js uses a top-level let: the database is not a property of window.
  if(typeof all!=='function'||typeof db==='undefined'||!db){count.textContent='Iniciando almacenamiento local…';return;}
  count.textContent='Consultando personal…';host.setAttribute('aria-busy','true');
  try{
   const records=await all('personal');if(ticket!==version)return;
   if(!window.SKAdminAuth?.canView?.('personQuery')){host.innerHTML='';count.textContent='Inicia sesión para consultar personal.';return;}
   const q=norm(document.getElementById('personQuerySearch')?.value);
   const rows=records.filter(p=>!p.deleted&&(!q||norm([p.nombre,p.documento,p.empresa,p.area,p.cargo,p.telefono].join(' ')).includes(q))).sort((a,b)=>String(a.nombre||'').localeCompare(String(b.nombre||''),'es'));
   count.textContent=`${rows.length} colaborador${rows.length===1?'':'es'}`;
   host.innerHTML=rows.map(p=>{
    const m=missing(p);
    return `<div class="row"><div><b>${esc(p.nombre||'Sin nombre')}</b><small>Documento: ${esc(p.documento||'Falta documento')} · Empresa: ${esc(p.empresa||'Falta empresa')} · Área: ${esc(p.area||'Falta área')} · Cargo: ${esc(p.cargo||'Falta cargo')} · Teléfono: ${esc(p.telefono||'No informado')}</small>${m.length?`<small><b>Información incompleta:</b> falta ${esc(m.join(', '))}</small>`:'<small>Información principal completa</small>'}</div></div>`;
   }).join('')||'<p class="hint">No hay colaboradores que coincidan.</p>';
  }catch(error){
   if(ticket!==version)return;
   console.error('Consulta de personal:',error);host.innerHTML='';count.textContent='No fue posible consultar el personal. Vuelve a abrir la consulta para reintentar.';
  }finally{if(ticket===version)host.setAttribute('aria-busy','false');}
 }
 window.SKPersonQuery={mount,render};
 for(const event of ['skweb-db-ready','skweb-synced','skadmin-permissions'])window.addEventListener(event,()=>{
  if(document.getElementById('personQuery')?.classList.contains('active'))void render();
 });
 // The module is normally loaded by a click, after the window load event.
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
