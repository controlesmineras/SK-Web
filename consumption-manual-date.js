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
let adding=false;
function renderDraft(){
 const list=document.querySelector('#consumptionDraft');
 document.querySelector('#partSearch').required=!draft.length;
 list.replaceChildren();
 draft.forEach((row,index)=>{
  const li=document.createElement('li'),remove=document.createElement('button');
  li.append(row.nombreRepuesto+' × '+row.cantidad+' · '+row.origen+' ');
  remove.type='button';remove.textContent='Quitar';remove.onclick=()=>{draft.splice(index,1);renderDraft()};li.append(remove);list.append(li);
 });
}
async function currentPart(f){
 const values=fd(f),cantidad=Number(values.cantidad),tipoEquipo=document.querySelector('#equipmentType').value;
 if(!Number.isSafeInteger(cantidad)||cantidad<1)throw new Error('Ingresa una cantidad entera mayor que cero.');
 const p=await window.SKSpareCatalog.resolve(values.partId,tipoEquipo,values.origen);
 if(!p)throw new Error('Selecciona un repuesto del buscador.');
 return {partId:p.id,cantidad,tipoEquipo,origen:values.origen,noItem:p.numero||'',nombreRepuesto:p.nombre,itemId:p.criterionId||''};
}
function mountDraft(){
 const f=document.querySelector('#consumptionForm');if(!f)return;
 const add=document.createElement('button'),list=document.createElement('ul');
 add.type='button';add.textContent='+ Agregar repuesto';list.id='consumptionDraft';
 f.querySelector('button[type="submit"],button:not([type])').before(add,list);
 add.onclick=async()=>{
  if(adding||f.dataset.consumptionSaveBusy||f.dataset.editingConsumptionId)return;
  adding=true;add.disabled=true;
  try{draft.push(await currentPart(f));for(const id of ['part','partSearch','partNo','partName'])document.getElementById(id).value='';f.elements.cantidad.value=1;renderDraft()}
  catch(error){alert(error.message)}
  finally{adding=false;add.disabled=false}
 };
}
function saveBatch(rows){
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('consumptions','readwrite');
  tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||new Error('No se guardó el consumo'));
  try{for(const row of rows)tx.objectStore('consumptions').put(row)}catch(error){tx.abort();reject(error)}
 });
}

async function save(e){const f=e.target;if(f?.id!=='consumptionForm'||f.dataset.manualDateSaving==='1')return;if(f.dataset.editingConsumptionId)return;e.preventDefault();e.stopImmediatePropagation();if(adding||f.dataset.consumptionSaveBusy==='1')return;const button=f.querySelector('button[type="submit"],button:not([type])'),oldText=button?.textContent||'Registrar consumo';f.dataset.consumptionSaveBusy='1';if(button){button.disabled=true;button.textContent='Guardando…'}let saved=false;const status=document.querySelector('#consumptionSaveStatus');try{const x=fd(f),date=x.fechaConsumo,responsableId=x.responsableId,responsableTexto=document.querySelector('#responsibleSearch')?.value||'';if(!x.assetId)return alert('Selecciona la máquina en el buscador.');if(!date)return alert('Selecciona la fecha del consumo.');if(!responsableId)return alert('Selecciona el responsable.');const lines=draft.slice();if(x.partId||!lines.length||document.querySelector('#partSearch').value.trim())lines.push(await currentPart(f));if(lines.some(row=>row.tipoEquipo!==document.querySelector('#equipmentType').value))throw new Error('Los repuestos de la lista deben corresponder al tipo de equipo seleccionado.');const d=new Date(),horaRegistro=localTime(d);delete x.fechaConsumo;await saveBatch(lines.map(row=>({...mark(),...x,...row,fechaISO:date,fechaLocal:localFromISO(date),horaRegistro,horaLocal:horaRegistro})));saved=true;draft.length=0;renderDraft();if(status){status.textContent='Registro guardado en este dispositivo · Pendiente de sincronizar';status.hidden=false}f.dataset.manualDateSaving='1';f.reset();f.elements.assetId.value='';f.elements.partId.value='';delete f.dataset.manualDateSaving;f.cantidad.value=1;document.querySelector('#consumptionDate').value=date;document.querySelector('#equipmentType').value='YT';window.SKConsumptionParts?.syncOrigin('29');await window.SKConsumptionParts?.loadParts();const rs=document.querySelector('#responsible'),ri=document.querySelector('#responsibleSearch');if(rs){if(!Array.from(rs.options).some(option=>option.value===responsableId))rs.add(new Option(responsableTexto,responsableId));rs.value=responsableId;}if(ri)ri.value=responsableTexto;const total=(await all('consumptions')).filter(row=>!row.deleted).length;const counter=document.querySelector('#cCount');if(counter)counter.textContent=total;window.dispatchEvent(new CustomEvent('skweb-consumption-changed',{detail:{total,source:'create'}}))}catch(err){console.error('SK Web consumo local:',err);if(saved)return;const message=err?.name==='QuotaExceededError'?'El almacenamiento del dispositivo está lleno. No se perdió el formulario; libera espacio y vuelve a intentar.':`No se pudo guardar en este dispositivo: ${err?.message||err}`;alert(message)}finally{delete f.dataset.consumptionSaveBusy;if(button){button.disabled=false;button.textContent=oldText}}}
mount();mountDraft();document.addEventListener('submit',save,true);
})();