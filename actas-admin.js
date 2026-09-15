// Registro y consulta básica de actas administrativas.
(()=>{
'use strict';
const ACTA_BASE=14;
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const today=()=>{const d=new Date(),offset=d.getTimezoneOffset();return new Date(d.getTime()-offset*60000).toISOString().slice(0,10)};
function injectStyles(){
  if(document.getElementById('actasAdminStyles'))return;
  const style=document.createElement('style');
  style.id='actasAdminStyles';
  style.textContent=`#actas .actaNumber{margin:4px 0 18px;padding:16px;border-radius:12px;background:#102f45;color:#fff;text-align:center;font-size:1.14rem;font-weight:850;letter-spacing:.035em}#actas .actaNumber strong{color:#f7c948;font-size:1.35em}.actaForm{max-width:760px;margin:auto}.actaList{display:grid;gap:8px;max-width:760px;margin:22px auto 0}.actaRow{display:flex;justify-content:space-between;align-items:center;gap:14px;width:100%;text-align:left;background:#fff;border:1px solid #d6dfe6;color:#102f45}.actaRow span{display:grid;gap:3px}.actaRow small{font-weight:500;color:#657484}.actaRow b:last-child{white-space:nowrap}.actaLink{color:#1769aa;font-weight:750}@media(max-width:600px){#actas .actaNumber{font-size:1rem;padding:13px}.actaRow{align-items:flex-start}}`;
  document.head.appendChild(style);
}
async function rows(){return (await all('actas')).sort((a,b)=>Number(b.consecutivo)-Number(a.consecutivo))}
async function nextNumber(){const list=await rows();return Math.max(ACTA_BASE,...list.map(x=>Number(x.consecutivo)||0))+1}
async function updateNumber(number){
  const value=number||await nextNumber(),box=document.getElementById('actaNumber');
  if(box)box.innerHTML=`TU NÚMERO DE ACTA ES: <strong>${value}</strong>`;
  const form=document.getElementById('actaForm');
  if(form)form.elements.consecutivo.value=String(value);
}
async function render(){
  if(typeof db==='undefined'||!db)return setTimeout(render,120);
  const list=await rows(),host=document.getElementById('actaList');
  if(host)host.innerHTML=list.map(x=>`<button type="button" class="actaRow" data-acta-id="${esc(x.id)}"><span><b>ACTA N.º ${esc(x.consecutivo)}</b><small>${esc(x.fecha||'Sin fecha')} · ${esc(x.area||'Sin área')} · ${esc(x.motivo||'Sin motivo')}</small></span><b>${x.enlace?'<span class="actaLink">VER ENLACE</span>':'SIN ENLACE'}</b></button>`).join('')||'<p class="hint">Aún no hay actas registradas en esta aplicación.</p>';
  await updateNumber();
}
async function reset(){
  const form=document.getElementById('actaForm');if(!form)return;
  form.reset();form.elements.id.value='';form.elements.fecha.value=today();document.getElementById('actaSave').textContent='REGISTRAR ACTA';document.getElementById('actaStatus').hidden=true;await updateNumber();
}
async function edit(id){
  const acta=(await rows()).find(x=>x.id===id);if(!acta)return;
  const form=document.getElementById('actaForm');
  for(const field of ['id','consecutivo','fecha','area','motivo','enlace'])if(form.elements[field])form.elements[field].value=acta[field]||'';
  document.getElementById('actaSave').textContent='GUARDAR CAMBIOS';await updateNumber(acta.consecutivo);form.scrollIntoView({behavior:'smooth',block:'start'});
}
async function save(event){
  event.preventDefault();const form=event.currentTarget,button=document.getElementById('actaSave'),status=document.getElementById('actaStatus');
  button.disabled=true;
  try{
    const list=await rows(),id=form.elements.id.value,existing=id?list.find(x=>x.id===id):null,consecutivo=existing?Number(existing.consecutivo):await nextNumber(),stamp=new Date().toISOString();
    if(!existing&&list.some(x=>Number(x.consecutivo)===consecutivo))throw new Error('El consecutivo ya está registrado. Sincroniza e intenta nuevamente.');
    const acta=existing||{id:uuid(),createdAt:stamp};
    Object.assign(acta,{consecutivo,fecha:form.elements.fecha.value,area:form.elements.area.value,motivo:form.elements.motivo.value,enlace:form.elements.enlace.value.trim(),updatedAt:stamp,syncState:'pending'});
    await put('actas',acta);status.hidden=false;status.textContent=existing?'Cambios guardados.':`Acta N.º ${consecutivo} registrada y pendiente de sincronización.`;await render();if(!existing)setTimeout(reset,900);
  }catch(error){status.hidden=false;status.textContent=error?.message||String(error)}
  finally{button.disabled=false}
}
function mount(){
  if(document.getElementById('actas'))return;
  injectStyles();const section=document.createElement('section');section.id='actas';section.className='view';
  section.innerHTML=`<div class="sectionHead"><h2>REGISTRAR ACTAS</h2><button type="button" id="newActa">+ NUEVA ACTA</button></div><div id="actaNumber" class="actaNumber">CALCULANDO CONSECUTIVO…</div><form id="actaForm" class="actaForm"><input type="hidden" name="id"><input type="hidden" name="consecutivo"><label>FECHA<input name="fecha" type="date" required></label><label>ÁREA<select name="area" required><option value="">SELECCIONAR…</option><option>ADMINISTRATIVA</option><option>BODEGA DE SUPERFICIE</option><option>DESMIN</option><option>DESMIN - OBRAS CIVILES</option><option>PRODUCCIÓN</option><option>SEGURIDAD FÍSICA</option></select></label><label>MOTIVO DEL ACTA<select name="motivo" required><option value="">SELECCIONAR…</option><option>DE COMPROMISO</option><option>DAR DE BAJA HERRAMIENTAS</option><option>INVENTARIO GENERAL</option></select></label><label>ENLACE AL ACTA DIGITALIZADA (OPCIONAL)<input name="enlace" type="url" inputmode="url" placeholder="https://…"></label><button type="submit" id="actaSave">REGISTRAR ACTA</button><p id="actaStatus" class="status" hidden></p></form><div id="actaList" class="actaList"></div>`;
  document.querySelector('main')?.append(section);
  section.querySelector('#actaForm').addEventListener('submit',save);
  section.querySelector('#newActa').addEventListener('click',reset);
  section.querySelector('#actaList').addEventListener('click',event=>{const row=event.target.closest('[data-acta-id]');if(row)edit(row.dataset.actaId)});
  reset();render();
}
window.SKActasAdmin={render,reset};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
