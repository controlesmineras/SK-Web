// Registro y consulta básica de actas administrativas.
(()=>{
'use strict';
const ACTA_BASE=14,OFICIO_BASE=0;
let documentType='ACTA';
const typeOf=row=>row.tipo==='OFICIO'?'OFICIO':'ACTA';
const isPreviousActa=form=>documentType==='ACTA'&&!form.elements.id.value&&form.elements.modoRegistro.value==='anterior';
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const today=()=>{const d=new Date(),offset=d.getTimezoneOffset();return new Date(d.getTime()-offset*60000).toISOString().slice(0,10)};
function injectStyles(){
  if(document.getElementById('actasAdminStyles'))return;
  const style=document.createElement('style');
  style.id='actasAdminStyles';
  style.textContent=`#actas .actaNumber{margin:4px 0 18px;padding:16px;border-radius:12px;background:#102f45;color:#fff;text-align:center;font-size:1.14rem;font-weight:850;letter-spacing:.035em}#actas .actaNumber strong{color:#f7c948;font-size:1.35em}.documentTypeTitle{max-width:760px;margin:0 auto 8px;font-weight:850;color:#102f45}.actaForm label[hidden]{display:none!important}.documentTabs{display:grid;grid-template-columns:1fr 1fr;gap:8px;max-width:760px;margin:0 auto 18px}.documentTabs button{border:2px solid #b9cad6;background:#fff;color:#102f45;font-size:1.05rem}.documentTabs button.active{background:#102f45;border-color:#102f45;color:#fff}.actaForm{max-width:760px;margin:auto}.actaList{display:grid;gap:8px;max-width:760px;margin:22px auto 0}.actaRow{display:flex;justify-content:space-between;align-items:center;gap:14px;width:100%;text-align:left;background:#fff;border:1px solid #d6dfe6;color:#102f45}.actaRow span{display:grid;gap:3px}.actaRow small{font-weight:500;color:#657484}.actaRow b:last-child{white-space:nowrap}.actaLink{color:#1769aa;font-weight:750}@media(max-width:600px){#actas .actaNumber{font-size:1rem;padding:13px}.actaRow{align-items:flex-start}}`;
  document.head.appendChild(style);
}
async function rows(){return (await all('actas')).sort((a,b)=>Number(b.consecutivo)-Number(a.consecutivo))}
async function nextNumber(type=documentType,list){const records=list||await rows();return Math.max(type==='ACTA'?ACTA_BASE:OFICIO_BASE,...records.filter(x=>typeOf(x)===type).map(x=>Number(x.consecutivo)||0))+1}
async function updateNumber(number){
  const value=number??await nextNumber(),box=document.getElementById('actaNumber');
  if(box)box.innerHTML=`TU NÚMERO DE ${documentType} ES: <strong>${esc(value)}</strong>`;
  const form=document.getElementById('actaForm');
  if(form)form.elements.consecutivo.value=String(value);
}
function updateMode(){
  const form=document.getElementById('actaForm');if(!form)return;
  const editing=Boolean(form.elements.id.value),previous=isPreviousActa(form);
  form.querySelector('.actaRegistrationMode').hidden=documentType!=='ACTA'||editing;
  form.elements.modoRegistro.disabled=documentType!=='ACTA'||editing;
  form.querySelector('.actaPreviousNumber').hidden=!previous;
  form.elements.numeroAnterior.disabled=!previous;
  form.elements.numeroAnterior.required=previous;
  document.getElementById('actaNumber').hidden=previous;
  document.querySelectorAll('#actas [data-document-type]').forEach(button=>{const active=button.dataset.documentType===documentType;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active))});
  for(const [selector,visible] of [['.actaArea',documentType==='ACTA'],['.actaMotivo',documentType==='ACTA'],['.oficioAsunto',documentType==='OFICIO'],['.oficioDestinatario',documentType==='OFICIO']]){const field=form.querySelector(selector);field.hidden=!visible;field.querySelector('input,select').required=visible}
  form.querySelector('.documentLinkLabel').firstChild.textContent=`ENLACE AL ${documentType} DIGITALIZADO (OPCIONAL)`;
  document.getElementById('newActa').textContent=`+ NUEVO ${documentType}`;
  document.getElementById('actaSave').textContent=editing?'GUARDAR CAMBIOS':previous?'REGISTRAR ACTA ANTERIOR':`REGISTRAR ${documentType}`;
}
async function render(){
  if(typeof db==='undefined'||!db)return setTimeout(render,120);
  const list=(await rows()).filter(x=>typeOf(x)===documentType),host=document.getElementById('actaList');
  if(host)host.innerHTML=list.map(x=>`<button type="button" class="actaRow" data-acta-id="${esc(x.id)}"><span><b>${documentType} N.º ${esc(x.consecutivo)}</b><small>${esc(x.fecha||'Sin fecha')} · ${esc(documentType==='ACTA'?x.area||'Sin área':x.dirigidoA||'Sin destinatario')} · ${esc(documentType==='ACTA'?x.motivo||'Sin motivo':x.asunto||'Sin asunto')}</small></span><b>${x.enlace?'<span class="actaLink">VER ENLACE</span>':'SIN ENLACE'}</b></button>`).join('')||`<p class="hint">Aún no hay ${documentType==='ACTA'?'actas':'oficios'} registrados en esta aplicación.</p>`;
  const form=document.getElementById('actaForm');if(form&&!form.elements.id.value)await updateNumber();
}
async function reset({keepRegistrationMode=false}={}){
  const form=document.getElementById('actaForm');if(!form)return;
  const mode=keepRegistrationMode?form.elements.modoRegistro.value:'nuevo';
  form.reset();form.elements.modoRegistro.value=mode;form.elements.id.value='';form.elements.fecha.value=today();document.getElementById('actaStatus').hidden=true;updateMode();await updateNumber();
}
async function selectMode(type){if(type===documentType)return;documentType=type;await reset();await render()}
async function edit(id){
  const acta=(await rows()).find(x=>x.id===id);if(!acta)return;documentType=typeOf(acta);
  const form=document.getElementById('actaForm');
  form.reset();for(const field of ['id','consecutivo','fecha','area','motivo','asunto','dirigidoA','enlace'])if(form.elements[field])form.elements[field].value=acta[field]||'';
  updateMode();await updateNumber(acta.consecutivo);form.scrollIntoView({behavior:'smooth',block:'start'});
}
async function save(event){
  event.preventDefault();const form=event.currentTarget,button=document.getElementById('actaSave'),status=document.getElementById('actaStatus');
  button.disabled=true;
  try{
    const list=await rows(),id=form.elements.id.value,existing=id?list.find(x=>x.id===id):null,consecutivo=existing?Number(existing.consecutivo):isPreviousActa(form)?Number(form.elements.numeroAnterior.value):await nextNumber(documentType,list),stamp=new Date().toISOString();
    if(id&&!existing)throw new Error('El documento ya no está disponible. Actualiza los datos e intenta nuevamente.');
    if(existing&&typeOf(existing)!==documentType)throw new Error('El tipo de documento no coincide.');
    if(!Number.isSafeInteger(consecutivo)||consecutivo<1)throw new Error('Ingresa un número de acta entero mayor que cero.');
    if(!existing&&list.some(x=>typeOf(x)===documentType&&Number(x.consecutivo)===consecutivo))throw new Error(`${documentType==='ACTA'?'El acta':'El oficio'} N.º ${consecutivo} ya está ${documentType==='ACTA'?'registrada':'registrado'}. Revisa la lista antes de guardar.`);
    const acta=existing||{id:uuid(),createdAt:stamp};
    Object.assign(acta,{tipo:documentType,consecutivo,fecha:form.elements.fecha.value,area:documentType==='ACTA'?form.elements.area.value:'',motivo:documentType==='ACTA'?form.elements.motivo.value:'',asunto:documentType==='OFICIO'?form.elements.asunto.value.trim():'',dirigidoA:documentType==='OFICIO'?form.elements.dirigidoA.value.trim():'',enlace:form.elements.enlace.value.trim(),updatedAt:stamp,syncState:'pending'});
    await put('actas',acta);status.hidden=false;status.textContent=existing?'Cambios guardados.':`${documentType==='ACTA'?'Acta':'Oficio'} N.º ${consecutivo} ${documentType==='ACTA'?'registrada':'registrado'} y pendiente de sincronización.`;await render();if(!existing)setTimeout(()=>reset({keepRegistrationMode:true}),900);
  }catch(error){status.hidden=false;status.textContent=error?.message||String(error)}
  finally{button.disabled=false}
}
function mount(){
  if(document.getElementById('actas'))return;
  injectStyles();const section=document.createElement('section');section.id='actas';section.className='view';
  section.innerHTML=`<div class="sectionHead"><h2>REGISTRO DE DOCUMENTOS</h2><button type="button" id="newActa">+ NUEVA ACTA</button></div>
  <div class="documentTypeTitle">REGISTRAR</div><div class="documentTabs" role="group" aria-label="REGISTRAR"><button type="button" data-document-type="ACTA">ACTA</button><button type="button" data-document-type="OFICIO">OFICIO</button></div>
  <div id="actaNumber" class="actaNumber">CALCULANDO CONSECUTIVO…</div>
  <form id="actaForm" class="actaForm"><input type="hidden" name="id"><input type="hidden" name="consecutivo">
  <label class="actaRegistrationMode" style="grid-column:1/-1">TIPO DE REGISTRO<select name="modoRegistro"><option value="nuevo">ACTA NUEVA · NÚMERO AUTOMÁTICO</option><option value="anterior">ACTA ANTERIOR · YA TIENE NÚMERO</option></select></label>
  <label class="actaPreviousNumber" hidden>NÚMERO ORIGINAL DEL ACTA<input name="numeroAnterior" type="number" min="1" step="1" inputmode="numeric" disabled placeholder="Ejemplo: 8"></label>
  <label>FECHA<input name="fecha" type="date" required></label>
  <label class="actaArea">ÁREA<select name="area"><option value="">SELECCIONAR…</option><option>ADMINISTRATIVA</option><option>BODEGA DE SUPERFICIE</option><option>DESMIN</option><option>DESMIN - OBRAS CIVILES</option><option>PRODUCCIÓN</option><option>SEGURIDAD FÍSICA</option></select></label>
  <label class="actaMotivo">MOTIVO DEL ACTA<select name="motivo"><option value="">SELECCIONAR…</option><option>DE COMPROMISO</option><option>DAR DE BAJA HERRAMIENTAS</option><option>INVENTARIO GENERAL</option></select></label>
  <label class="oficioAsunto" hidden>ASUNTO<input name="asunto" type="text"></label>
  <label class="oficioDestinatario" hidden>DIRIGIDO A<input name="dirigidoA" type="text"></label>
  <label class="documentLinkLabel">ENLACE AL ACTA DIGITALIZADA (OPCIONAL)<input name="enlace" type="url" inputmode="url" placeholder="https://…"></label>
  <button type="submit" id="actaSave">REGISTRAR ACTA</button><p id="actaStatus" class="status" hidden></p></form><div id="actaList" class="actaList"></div>`;
  document.querySelector('main')?.append(section);
  section.querySelector('#actaForm').addEventListener('submit',save);
  section.querySelector('#newActa').addEventListener('click',reset);
  section.querySelector('[name="modoRegistro"]').addEventListener('change',()=>{updateMode();document.getElementById('actaStatus').hidden=true;updateNumber();if(isPreviousActa(document.getElementById('actaForm')))document.querySelector('#actaForm [name="numeroAnterior"]').focus()});
  section.querySelectorAll('[data-document-type]').forEach(button=>button.addEventListener('click',()=>selectMode(button.dataset.documentType)));
  section.querySelector('#actaList').addEventListener('click',event=>{const row=event.target.closest('[data-acta-id]');if(row)edit(row.dataset.actaId)});
  reset();render();
}
window.SKActasAdmin={render,reset};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
