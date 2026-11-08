// Fecha manual para consumo de repuestos.
// Conserva fecha y responsable entre registros consecutivos.
// Guarda también la hora real de registro para ordenar la transcripción.
// IMPORTANTE: si el formulario está en modo edición, este manejador NO crea otro registro.
(()=>{
const isoToday=()=>{const d=new Date(),z=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`};
const localFromISO=iso=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(iso||''))return'';const [y,m,d]=iso.split('-');return `${Number(d)}/${Number(m)}/${y}`};
const localTime=d=>d.toLocaleTimeString('es-CO',{hour12:false});
function mount(){const f=document.querySelector('#consumptionForm');if(!f||document.querySelector('#consumptionDate'))return;const machine=document.querySelector('#conAssetSearch')?.closest('label');const lab=document.createElement('label');lab.innerHTML='Fecha de consumo<input name="fechaConsumo" id="consumptionDate" type="date" required>';if(machine)machine.after(lab);else f.insertBefore(lab,f.querySelector('button'));document.querySelector('#consumptionDate').value=isoToday()}
const draft=[];
function clearPart(form){
 form.elements.partId.value='';
 form.elements.cantidad.value=1;
 for(const id of ['partSearch','partNo','partName'])document.getElementById(id).value='';
}
async function readPart(form){
 const {cantidad,partId,origen}=fd(form);
 const tipoEquipo=document.querySelector('#equipmentType').value;
 const part=await window.SKSpareCatalog.resolve(partId,tipoEquipo,origen);
 if(!part)throw new Error('Selecciona un repuesto.');
 if(!(Number(cantidad)>0))throw new Error('Cantidad mínima no válida.');
 return {partId,origen,tipoEquipo,cantidad:Number(cantidad),noItem:part.numero||'',nombreRepuesto:part.nombre,itemId:part.criterionId||''};
}
function renderDraft(){
 const list=document.querySelector('#consumptionDraft');
 list.replaceChildren(...draft.map((row,index)=>{
  const item=document.createElement('li'),remove=document.createElement('button');
  item.textContent=[row.origen,row.noItem,row.nombreRepuesto,'× '+row.cantidad].filter(Boolean).join(' · ')+' ';
  remove.type='button';remove.textContent='Quitar';
  remove.onclick=()=>{if(list.closest('form').dataset.consumptionSaveBusy)return;draft.splice(index,1);renderDraft()};
  item.append(remove);return item;
 }));
}
function mountBatch(){
 const form=document.querySelector('#consumptionForm');
 const submit=form.querySelector('button[type="submit"],button:not([type])');
 const add=document.createElement('button'),list=document.createElement('ul');
 add.type='button';add.textContent='Agregar repuesto';list.id='consumptionDraft';
 submit.before(add,list);
 const search=document.querySelector('#partSearch');
 search.required=false;
 add.onclick=async()=>{
  if(form.dataset.editingConsumptionId||form.dataset.consumptionSaveBusy)return;
  form.dataset.consumptionSaveBusy='1';add.disabled=true;
  try{draft.push(await readPart(form));clearPart(form);renderDraft();search.focus()}
  catch(error){alert(error.message)}
  finally{delete form.dataset.consumptionSaveBusy;add.disabled=false}
 };
}
function putBatch(rows){
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('consumptions','readwrite');
  tx.oncomplete=resolve;
  tx.onabort=()=>reject(tx.error||new Error('No se pudo completar el guardado.'));
  for(const row of rows)tx.objectStore('consumptions').put(row);
 });
}
async function save(e){const f=e.target;if(f?.id!=='consumptionForm'||f.dataset.manualDateSaving==='1')return;if(f.dataset.editingConsumptionId)return;e.preventDefault();e.stopImmediatePropagation();if(f.dataset.consumptionSaveBusy==='1')return;const button=f.querySelector('button[type="submit"],button:not([type])'),oldText=button?.textContent||'Registrar consumo';f.dataset.consumptionSaveBusy='1';if(button){button.disabled=true;button.textContent='Guardando…'}let saved=false;const status=document.querySelector('#consumptionSaveStatus');try{const x=fd(f),date=x.fechaConsumo,responsableId=x.responsableId,responsableTexto=document.querySelector('#responsibleSearch')?.value||'';
if(!x.assetId||!date||!responsableId)throw new Error('Selecciona la máquina, la fecha y el responsable.');
const lines=draft.slice();
if(x.partId||document.querySelector('#partSearch').value.trim()||!lines.length)lines.push(await readPart(f));
const equipment=document.querySelector('#equipmentType').value;
if(lines.some(line=>line.tipoEquipo!==equipment))throw new Error('Todos los repuestos deben corresponder al tipo de equipo seleccionado.');
const horaRegistro=localTime(new Date()),consumptionBatchId=mark().id;
await putBatch(lines.map(line=>({...mark(),...line,assetId:x.assetId,bodega:x.bodega,responsableId,consumptionBatchId,fechaISO:date,fechaLocal:localFromISO(date),horaRegistro,horaLocal:horaRegistro})));
draft.length=0;renderDraft();saved=true;if(status){status.textContent='Registro guardado en este dispositivo · Pendiente de sincronizar';status.hidden=false}f.dataset.manualDateSaving='1';f.reset();f.elements.assetId.value='';f.elements.partId.value='';delete f.dataset.manualDateSaving;f.cantidad.value=1;document.querySelector('#consumptionDate').value=date;document.querySelector('#equipmentType').value='YT';window.SKConsumptionParts?.syncOrigin('29');await window.SKConsumptionParts?.loadParts();const rs=document.querySelector('#responsible'),ri=document.querySelector('#responsibleSearch');if(rs){if(!Array.from(rs.options).some(option=>option.value===responsableId))rs.add(new Option(responsableTexto,responsableId));rs.value=responsableId;}if(ri)ri.value=responsableTexto;const total=(await all('consumptions')).filter(row=>!row.deleted).length;const counter=document.querySelector('#cCount');if(counter)counter.textContent=total;window.dispatchEvent(new CustomEvent('skweb-consumption-changed',{detail:{total,source:'create'}}))}catch(err){console.error('SK Web consumo local:',err);if(saved)return;const message=err?.name==='QuotaExceededError'?'El almacenamiento del dispositivo está lleno. No se perdió el formulario; libera espacio y vuelve a intentar.':`No se pudo guardar en este dispositivo: ${err?.message||err}`;alert(message)}finally{delete f.dataset.consumptionSaveBusy;if(button){button.disabled=false;button.textContent=oldText}}}
mount();mountBatch();document.addEventListener('submit',save,true);
})();