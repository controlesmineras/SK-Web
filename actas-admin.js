// Registro y consulta básica de actas administrativas.
(()=>{
'use strict';
const ACTA_BASE=0,OFICIO_BASE=0;
let documentType='ACTA';
const typeOf=row=>row.tipo==='OFICIO'?'OFICIO':'ACTA';
const isPreviousActa=form=>documentType==='ACTA'&&!form.elements.id.value&&form.elements.modoRegistro.value==='anterior';
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function documentUrl(value){try{const url=new URL(String(value||'').trim());return ['http:','https:'].includes(url.protocol)?url.href:''}catch{return ''}}
const today=()=>{const d=new Date(),offset=d.getTimezoneOffset();return new Date(d.getTime()-offset*60000).toISOString().slice(0,10)};
function injectStyles(){
  if(document.getElementById('actasAdminStyles'))return;
  const style=document.createElement('style');
  style.id='actasAdminStyles';
  style.textContent=`#actaForm #actaReplaceHint{grid-column:1/-1!important;width:100%!important;box-sizing:border-box;margin:0!important}#actaForm .adminFormActions{grid-column:1/-1!important;display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;align-items:stretch!important;gap:12px!important;width:100%!important;margin-top:12px!important}#actaForm .adminFormActions>button{grid-column:auto!important;grid-row:auto!important;width:100%!important;min-width:0!important;min-height:56px!important;height:100%!important;margin:0!important;padding:12px 16px!important;box-sizing:border-box!important;display:flex!important;align-items:center!important;justify-content:center!important;text-align:center!important;font-size:1rem!important;line-height:1.2!important;border-radius:10px!important}#actaForm #actaClearLink{grid-column:1/-1!important} #actas [hidden]{display:none!important}#actas .actaNumber{margin:4px 0 18px;padding:16px;border-radius:12px;background:#102f45;color:#fff;text-align:center;font-size:1.14rem;font-weight:850;letter-spacing:.035em}#actas .actaNumber strong{color:#f7c948;font-size:1.35em}.documentTypeTitle{max-width:760px;margin:0 auto 8px;font-weight:850;color:#102f45}.actaForm label[hidden]{display:none!important}.documentTabs{display:grid;grid-template-columns:1fr 1fr;gap:8px;max-width:760px;margin:0 auto 18px}.documentTabs button{border:2px solid #b9cad6;background:#fff;color:#102f45;font-size:1.05rem}.documentTabs button.active{background:#102f45;border-color:#102f45;color:#fff}.actaForm{max-width:760px;margin:auto}.actaList{display:grid;gap:8px;max-width:760px;margin:22px auto 0}.actaRow{display:flex;justify-content:space-between;align-items:center;gap:10px;width:100%;padding:0 8px 0 0;text-align:left;background:#fff;border:1px solid #d6dfe6;border-radius:9px;color:#102f45}.actaEdit{flex:1;min-width:0;text-align:left;background:transparent;color:inherit}.actaEdit span{display:grid;gap:3px}.actaEdit small{font-weight:500;color:#657484;overflow-wrap:anywhere}.actaLink,.actaNoLink{flex-shrink:0;font-size:.84rem;font-weight:750}.actaLink{display:inline-flex;align-items:center;min-height:44px;padding:10px 8px;color:#1769aa;text-decoration:underline;text-underline-offset:3px}.actaLink:focus-visible{outline:2px solid #1769aa;outline-offset:2px;border-radius:5px}.actaNoLink{max-width:110px;color:#657484}@media(max-width:600px){#actas .actaNumber{font-size:1rem;padding:13px}.actaRow{align-items:flex-start}}`;
  document.head.appendChild(style);
}
async function rows(){return (await all('actas')).filter(row=>!row.deleted).sort((a,b)=>Number(b.consecutivo)-Number(a.consecutivo))}
async function nextNumber(type=documentType,list){const records=list||await rows();return Math.max(type==='ACTA'?ACTA_BASE:OFICIO_BASE,...records.filter(x=>!x.deleted&&typeOf(x)===type&&Number.isSafeInteger(Number(x.consecutivo))&&Number(x.consecutivo)>0).map(x=>Number(x.consecutivo)))+1}
async function updateNumber(number){
  const value=number??await nextNumber(),box=document.getElementById('actaNumber');
  if(box)box.innerHTML=`TU NÚMERO DE ${documentType} ES: <strong>${esc(value)}</strong>`;
  const form=document.getElementById('actaForm');
  if(form)form.elements.consecutivo.value=String(value);
}
function updateNotCreated(){
 const form=document.getElementById('actaForm');if(!form)return;
 const field=document.getElementById('actaNotCreatedFields');if(!field)return;
 const allowed=Boolean(form.elements.id.value)&&documentType==='ACTA'&&window.SKAdminAuth?.isOwner?.()===true;
 field.hidden=!allowed;
 const selected=documentType==='ACTA'&&form.elements.noElaborada.checked;
 const special=form.elements.motivo.querySelector('[data-not-created-motive]');
 const areaOption=form.elements.area.querySelector('[data-not-created-area]');
 if(special){special.hidden=!selected;special.disabled=!selected}
 if(areaOption){areaOption.hidden=!selected;areaOption.disabled=!selected}
 if(selected){
  if(!form._notCreatedDraft)form._notCreatedDraft={area:form.elements.area.value,motivo:form.elements.motivo.value,enlace:form.elements.enlace.value};
  form.elements.motivo.value='NO SE REGISTRÓ';form.elements.area.value='NO APLICA';form.elements.enlace.value='';
 }else if(form._notCreatedDraft){
  for(const [key,value]of Object.entries(form._notCreatedDraft))form.elements[key].value=value;
  delete form._notCreatedDraft;
 }
 form.elements.area.disabled=selected;form.elements.motivo.disabled=selected;form.elements.enlace.disabled=selected;
 form.elements.justificacionNoElaborada.disabled=true;
 form.elements.justificacionNoElaborada.required=false;
 document.getElementById('actaNotCreatedReason').hidden=true;
 document.getElementById('actaClearLink')?.toggleAttribute('hidden',selected||!form.elements.id.value);
 document.getElementById('actaReplaceHint')?.toggleAttribute('hidden',selected||!form.elements.id.value);
}

function updateMode(){
  const form=document.getElementById('actaForm');if(!form)return;
  const editing=Boolean(form.elements.id.value),previous=isPreviousActa(form);

  document.getElementById('actaClearLink')?.toggleAttribute('hidden',!editing);
  document.getElementById('actaReplaceHint')?.toggleAttribute('hidden',!editing);
  form.querySelector('.actaRegistrationMode').hidden=documentType!=='ACTA'||editing;
  form.elements.modoRegistro.disabled=documentType!=='ACTA'||editing;
  const editableNumber=previous||(editing&&documentType==='ACTA');
  form.querySelector('.actaPreviousNumber').hidden=!editableNumber;
  form.querySelector('.actaPreviousNumber').firstChild.textContent=editing?'NÚMERO DEL ACTA':'NÚMERO ORIGINAL DEL ACTA';
  form.elements.numeroAnterior.disabled=!editableNumber;
  form.elements.numeroAnterior.required=editableNumber;
  document.getElementById('actaNumber').hidden=editableNumber;
  document.querySelectorAll('#actas [data-document-type]').forEach(button=>{const active=button.dataset.documentType===documentType;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active))});
  for(const [selector,visible] of [['.actaArea',documentType==='ACTA'],['.actaMotivo',documentType==='ACTA'],['.oficioAsunto',documentType==='OFICIO'],['.oficioDestinatario',documentType==='OFICIO']]){const field=form.querySelector(selector);field.hidden=!visible;field.querySelector('input,select').required=visible}
  form.querySelector('.documentLinkLabel').firstChild.textContent=`ENLACE AL ${documentType} DIGITALIZADO (OPCIONAL)`;
  document.getElementById('newActa').textContent=`+ NUEVO ${documentType}`;
  document.getElementById('actaSave').textContent=editing?'GUARDAR CAMBIOS':previous?'REGISTRAR ACTA ANTERIOR':`REGISTRAR ${documentType}`;
  updateNotCreated();
  updateDeleteLast();
}
async function updateDeleteLast(){
 const button=document.getElementById('actaDeleteLast');if(!button)return;
 const form=document.getElementById('actaForm'),last=(await rows()).find(row=>typeOf(row)==='ACTA');
 const allowed=window.SKAdminAuth?.isOwner?.()===true&&documentType==='ACTA';
 const selected=form?.elements.id.value||'',canDelete=Boolean(allowed&&last&&selected===last.id);
 button.hidden=!allowed;
 button.disabled=!canDelete;
 button.textContent='ELIMINAR REGISTRO';
 button.dataset.actaId=last?.id||'';
 button.title=canDelete?'Eliminar la última acta registrada':last?'Solo se puede eliminar la última acta: N.º '+last.consecutivo:'No hay actas para eliminar';
 const hint=document.getElementById('actaDeleteHint');
 if(hint){hint.hidden=!allowed||canDelete;hint.textContent=last?'Para eliminar, selecciona la última acta: N.º '+last.consecutivo+'.':'No hay actas para eliminar.'}
}

async function deleteLastActa(){
 if(window.SKAdminAuth?.isOwner?.()!==true)return;
 const button=document.getElementById('actaDeleteLast');if(button.disabled)return;
 button.disabled=true;
 try{
  const last=(await rows()).find(row=>typeOf(row)==='ACTA');
  if(!last)return;
  if(last.id!==button.dataset.actaId){await updateDeleteLast();return alert('La última acta cambió. Revisa el número antes de eliminar.')}
  if(!confirm('¿Eliminar el acta N.º '+last.consecutivo+'?\n\nSe eliminarán el registro y su enlace en la aplicación. El consecutivo '+last.consecutivo+' quedará disponible para reutilizarse.\n\nEl archivo de Drive no se borrará. Esta acción se enviará al sincronizar.'))return;
  await put('actas',{...last,enlace:'',deleted:true,deletedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),syncState:'pending'});
  window.skSyncApi?.schedule?.(300);window.dispatchEvent(new Event('skweb-documents-changed'));
  await reset();await render();
  const status=document.getElementById('actaStatus');status.hidden=false;status.textContent='Acta N.º '+last.consecutivo+' eliminada. Pendiente de sincronizar.';
 }catch(error){alert(error?.message||'No fue posible eliminar el acta.')}
 finally{await updateDeleteLast()}
}

async function render(){
  if(typeof db==='undefined'||!db)return setTimeout(render,120);
  const list=(await rows()).filter(x=>typeOf(x)===documentType),host=document.getElementById('actaList');
  if(host)host.innerHTML=list.map(x=>{
    const url=documentUrl(x.enlace),label=`${documentType} N.º ${x.consecutivo}`;
    return `<div class="actaRow"><button type="button" class="actaEdit" data-acta-id="${esc(x.id)}" aria-label="Editar ${esc(label)}"><span><b>${esc(label)}</b>${x.documentStatus==='not_created'?`<strong style="display:block;background:#fff0b3;color:#713f12;padding:8px;border-radius:6px">⚠ ACTA NO ELABORADA · CONSECUTIVO RESERVADO</strong><small>${esc(x.notCreatedReason||'')}</small>`:''}<small>${esc(x.fecha||'Sin fecha')} · ${esc(documentType==='ACTA'?x.area||'Sin área':x.dirigidoA||'Sin destinatario')} · ${esc(documentType==='ACTA'?x.motivo||'Sin motivo':x.asunto||'Sin asunto')}</small></span></button>${url?`<a class="actaLink" href="${esc(url)}" target="_blank" rel="noopener noreferrer" aria-label="Abrir ${esc(label)}">ABRIR ${documentType} ↗</a>`:`<span class="actaNoLink">${x.enlace?'ENLACE NO VÁLIDO':'SIN ENLACE'}</span>`}</div>`;
  }).join('')||`<p class="hint">Aún no hay ${documentType==='ACTA'?'actas':'oficios'} registrados en esta aplicación.</p>`;
  const form=document.getElementById('actaForm');if(form&&!form.elements.id.value)await updateNumber();
  await updateDeleteLast();
}
async function reset({keepRegistrationMode=false}={}){
  const form=document.getElementById('actaForm');if(!form)return;
  const mode=keepRegistrationMode?form.elements.modoRegistro.value:'nuevo';
  delete form._notCreatedDraft;form.reset();form.elements.modoRegistro.value=mode;form.elements.id.value='';form.elements.fecha.value=today();document.getElementById('actaStatus').hidden=true;updateMode();await updateNumber();
}
async function selectMode(type){if(type===documentType)return;documentType=type;await reset();await render()}
async function edit(id){
  const acta=(await rows()).find(x=>x.id===id);if(!acta)return;documentType=typeOf(acta);
  const form=document.getElementById('actaForm');
  delete form._notCreatedDraft;form.reset();for(const field of ['id','consecutivo','fecha','area','motivo','asunto','dirigidoA','enlace'])if(form.elements[field])form.elements[field].value=acta[field]||'';
  form.elements.numeroAnterior.value=String(acta.consecutivo||'');
  form.elements.noElaborada.checked=acta.documentStatus==='not_created';
  form.elements.justificacionNoElaborada.value=acta.notCreatedReason||'';
  updateMode();await updateNumber(acta.consecutivo);form.scrollIntoView({behavior:'smooth',block:'start'});
}
async function save(event){
  event.preventDefault();const form=event.currentTarget,button=document.getElementById('actaSave'),status=document.getElementById('actaStatus');
  button.disabled=true;
  try{
    const list=await rows(),id=form.elements.id.value,existing=id?list.find(x=>x.id===id):null,consecutivo=existing?(documentType==='ACTA'?Number(form.elements.numeroAnterior.value):Number(existing.consecutivo)):isPreviousActa(form)?Number(form.elements.numeroAnterior.value):await nextNumber(documentType,list),stamp=new Date().toISOString();
    if(id&&!existing)throw new Error('El documento ya no está disponible. Actualiza los datos e intenta nuevamente.');
    if(existing&&typeOf(existing)!==documentType)throw new Error('El tipo de documento no coincide.');
    if(!Number.isSafeInteger(consecutivo)||consecutivo<1)throw new Error('Ingresa un número de acta entero mayor que cero.');
    if(list.some(x=>!x.deleted&&x.id!==id&&typeOf(x)===documentType&&Number(x.consecutivo)===consecutivo))throw new Error(`${documentType==='ACTA'?'El acta':'El oficio'} N.º ${consecutivo} ya está ${documentType==='ACTA'?'registrada':'registrado'}. Revisa la lista antes de guardar.`);
    const requested=form.elements.noElaborada.checked;
    const wasNotCreated=existing?.documentStatus==='not_created';
    const reason=String(form.elements.justificacionNoElaborada.value||'').trim()||(requested?'Acta registrada, pero no elaborada.':'');
    if(documentType==='ACTA'&&existing&&(requested!==wasNotCreated||(requested&&reason!==String(existing.notCreatedReason||'')))){
      if(window.SKAdminAuth?.isOwner?.()!==true)throw new Error('Solo el administrador puede cambiar el estado de elaboración.');
      if(wasNotCreated&&!requested)throw new Error('El consecutivo de un acta no elaborada se conserva. No puede reutilizarse.');
      if(requested&&!reason)throw new Error('Escribe por qué el acta no fue elaborada.');
    }
    if(form.elements.motivo.value==='NO SE REGISTRÓ'&&!requested)throw new Error('El motivo «No se registró» solo corresponde a un acta no elaborada.');
    if(wasNotCreated&&consecutivo!==Number(existing.consecutivo))throw new Error('El número de un acta no elaborada debe conservarse.');
    const acta=existing||{id:uuid(),createdAt:stamp};
    if(documentType==='ACTA'&&existing&&requested&&window.SKAdminAuth?.isOwner?.()===true){
      acta.documentStatus='not_created';acta.notCreatedReason=reason;
      acta.notCreatedAt=acta.notCreatedAt||stamp;
    }
    Object.assign(acta,{tipo:documentType,consecutivo,fecha:form.elements.fecha.value,area:documentType==='ACTA'?(requested?'NO APLICA':form.elements.area.value):'',motivo:documentType==='ACTA'?(requested?(window.SKAdminAuth?.isOwner?.()===true?'NO SE REGISTRÓ':existing?.motivo||''):form.elements.motivo.value):'',asunto:documentType==='OFICIO'?form.elements.asunto.value.trim():'',dirigidoA:documentType==='OFICIO'?form.elements.dirigidoA.value.trim():'',enlace:requested?'':form.elements.enlace.value.trim(),updatedAt:stamp,syncState:'pending'});
    await put('actas',acta);window.skSyncApi?.schedule?.(300);window.dispatchEvent(new Event('skweb-documents-changed'));status.hidden=false;status.textContent=existing?'Cambios guardados.':`${documentType==='ACTA'?'Acta':'Oficio'} N.º ${consecutivo} ${documentType==='ACTA'?'registrada':'registrado'} y pendiente de sincronización.`;await render();if(!existing)setTimeout(()=>reset({keepRegistrationMode:true}),900);
  }catch(error){status.hidden=false;status.textContent=error?.message||String(error)}
  finally{button.disabled=false}
}
function mount(){
  if(document.getElementById('actas'))return;
  injectStyles();const section=document.createElement('section');section.id='actas';section.className='view';
  section.innerHTML=`<div class="sectionHead"><h2>REGISTRO DE DOCUMENTOS</h2><button type="button" id="newActa">+ NUEVA ACTA</button></div>
  <div class="documentTypeTitle">REGISTRAR</div><div class="documentTabs" role="group" aria-label="REGISTRAR"><button type="button" data-document-type="ACTA">ACTA</button><button type="button" data-document-type="OFICIO">OFICIO</button></div>
  <div id="actaNotCreatedFields" hidden style="max-width:760px;margin:0 auto 12px;border:1px solid #dca528;background:#fff8dc;padding:8px 12px;border-radius:8px"><div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;align-items:center"><label style="display:flex!important;flex-direction:row!important;align-items:center;justify-content:flex-start;gap:10px;margin:0;font-size:.9rem"><input type="checkbox" name="noElaborada" form="actaForm" style="width:18px!important;height:18px!important;min-height:0!important;flex:0 0 18px;margin:0!important;padding:0!important">ACTA NO ELABORADA</label><button type="button" id="actaDeleteLast" class="dangerBtn" hidden style="width:100%;min-height:44px">ELIMINAR REGISTRO</button></div><small id="actaDeleteHint" hidden style="display:block;margin-top:6px;color:#713f12"></small><label id="actaNotCreatedReason" hidden>JUSTIFICACIÓN<textarea name="justificacionNoElaborada" form="actaForm" rows="2" disabled></textarea></label></div>
  <div id="actaNumber" class="actaNumber">CALCULANDO CONSECUTIVO…</div>
  <form id="actaForm" class="actaForm"><input type="hidden" name="id"><input type="hidden" name="consecutivo">
  <label class="actaRegistrationMode" style="grid-column:1/-1">TIPO DE REGISTRO<select name="modoRegistro"><option value="nuevo">ACTA NUEVA · NÚMERO AUTOMÁTICO</option><option value="anterior">ACTA ANTERIOR · YA TIENE NÚMERO</option></select></label>
  <label class="actaPreviousNumber" hidden>NÚMERO ORIGINAL DEL ACTA<input name="numeroAnterior" type="number" min="1" step="1" inputmode="numeric" disabled placeholder="Ejemplo: 8"></label>
  <label>FECHA<input name="fecha" type="date" required></label>
  <label class="actaArea">ÁREA<select name="area"><option value="NO APLICA" data-not-created-area hidden disabled>No aplica</option><option value="">SELECCIONAR…</option><option>ADMINISTRATIVA</option><option>BODEGA DE SUPERFICIE</option><option>DESMIN</option><option>DESMIN - OBRAS CIVILES</option><option>PRODUCCIÓN</option><option>SEGURIDAD FÍSICA</option></select></label>
  <label class="actaMotivo">MOTIVO DEL ACTA<select name="motivo"><option value="">Seleccionar…</option><option value="NO SE REGISTRÓ" data-not-created-motive hidden disabled>No se registró · Acta no elaborada</option><option value="DE COMPROMISO">De compromiso</option><option value="DAR DE BAJA HERRAMIENTAS">Dar de baja herramientas</option><option value="INVENTARIO GENERAL">Inventario general</option><option value="ENTREGA DE ELEMENTOS">Entrega de elementos</option></select></label>
  <label class="oficioAsunto" hidden>ASUNTO<input name="asunto" type="text"></label>
  <label class="oficioDestinatario" hidden>DIRIGIDO A<input name="dirigidoA" type="text"></label>
  <label class="documentLinkLabel">ENLACE AL ACTA DIGITALIZADA (OPCIONAL)<input name="enlace" type="url" inputmode="url" placeholder="https://…"></label>

  <button type="button" id="actaClearLink" hidden>QUITAR ENLACE DEL DOCUMENTO</button><p id="actaReplaceHint" class="hint" hidden>Para reemplazar el documento, quita el enlace anterior y pega el enlace del archivo corregido. Pulsa GUARDAR CAMBIOS para confirmar.</p><button type="submit" id="actaSave">REGISTRAR ACTA</button><p id="actaStatus" class="status" hidden></p></form><div id="actaList" class="actaList"></div>`;
  document.querySelector('main')?.append(section);
  section.querySelector('[name="noElaborada"]').addEventListener('change',updateNotCreated);
  section.querySelector('#actaDeleteLast').addEventListener('click',deleteLastActa);
  section.querySelector('#actaClearLink').addEventListener('click',()=>{
    const form=document.getElementById('actaForm');form.elements.enlace.value='';
    form.elements.enlace.focus();const status=document.getElementById('actaStatus');
    status.hidden=false;status.textContent='Enlace quitado del formulario. Guarda los cambios para confirmar o pega el enlace del documento corregido.';
  });
  section.querySelector('#actaForm').addEventListener('submit',save);
  section.querySelector('#newActa').addEventListener('click',reset);
  section.querySelector('[name="modoRegistro"]').addEventListener('change',()=>{updateMode();document.getElementById('actaStatus').hidden=true;updateNumber();if(isPreviousActa(document.getElementById('actaForm')))document.querySelector('#actaForm [name="numeroAnterior"]').focus()});
  section.querySelectorAll('[data-document-type]').forEach(button=>button.addEventListener('click',()=>selectMode(button.dataset.documentType)));
  section.querySelector('#actaList').addEventListener('click',event=>{const row=event.target.closest('[data-acta-id]');if(row)edit(row.dataset.actaId)});
  reset();render();
}
window.SKActasAdmin={render,reset,edit};
window.addEventListener('skadmin-permissions',()=>{updateDeleteLast();updateNotCreated()});
window.addEventListener('skweb-synced',()=>{if(document.getElementById('actas')?.classList.contains('active'))render()});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
