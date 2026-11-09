
'use strict';
const byId=id=>document.getElementById(id);
const form=byId('record'),fields=form.elements;
const status=message=>{byId('status').textContent=message};
const inventoryOrigin='29';
byId('inventoryOrigin').value=inventoryOrigin;
const sessionKey='sk-production-session';
const db=true;
async function all(name){return name==='consumptions'?[...(state.consumptions||[]),...(state.pending||[])]:state[name]||[]}
let syncFailed=false;
let session=null,state={},draft=[],syncing=false,saving=false;
try{session=JSON.parse(localStorage.getItem(sessionKey)||'null')}catch{}
const invitation=new URLSearchParams(location.hash.slice(1)).get('invitation');
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Bogota'}).format(new Date());
const norm=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const roleLabels={admin:'Administrador',assistant:'Auxiliar',mechanic:'Mecánico'};
const ownPerson=()=>session.user.personId||(state.personal||[]).find(row=>String(row.documento).trim()===session.user.document)?.id;
const valid=()=>session?.token&&Number(session.expiresAt)>Date.now();
const database=new Promise((resolve,reject)=>{
 const request=indexedDB.open('sk-production',1);
 request.onupgradeneeded=()=>request.result.createObjectStore('accounts');
 request.onsuccess=()=>resolve(request.result);
 request.onerror=()=>reject(request.error);
});
async function changeState(document,update){
 const db=await database;
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('accounts',update?'readwrite':'readonly'),store=tx.objectStore('accounts'),read=store.get(document);
  let next;
  read.onsuccess=()=>{next=read.result||{};if(update){next=update(next);store.put(next,document)}};
  tx.oncomplete=()=>resolve(next);tx.onabort=()=>reject(tx.error||new Error('No se pudo guardar en este dispositivo'));
 });
}
async function api(action,data={}){
 const response=await fetch(window.SK_SYNC_CONFIG.apiUrl,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action,...data}),signal:AbortSignal.timeout(30000),cache:'no-store',credentials:'omit'});
 if(!response.ok)throw new Error('Error de conexión ('+response.status+')');
 const result=await response.json();if(!result.ok)throw new Error(result.error||'No se pudo completar la solicitud');
 return result;
}
const labelAsset=row=>[row.clase,row.modelo,row.marcaActual||row.marcaInterna,row.numeroMarcaActual,row.serial].filter(Boolean).join(' · ');
function options(select,rows,label){
 const value=select.value;
 select.replaceChildren(new Option('Selecciona…',''),...rows.map(row=>new Option(label(row),row.id)));
 select.value=rows.some(row=>row.id===value)?value:'';
}
const personLabel=row=>[row.nombre,row.documento].filter(Boolean).join(' · ');
function partOptions(){
 const rows=window.SKSpareCatalog.merge(state.parts||[],state.inventoryCriteria||[]);
 return window.SKSpareCatalog.filter(rows,fields.tipoEquipo.value,inventoryOrigin);
}
const machineSearch=byId('machineSearch'),partSearch=byId('partSearch');
const machineOptions=byId('machineOptions'),partCards=byId('partOptions');
let selectedMachineLabel='';
function setupPicker(input,container,open,close){
 input.onfocus=open;
 input.onclick=()=>{if(container.hidden)open()};
 input.onkeydown=event=>{
  if(event.key==='Enter')event.preventDefault();
  if(event.key==='Escape')input.blur();
 };
 input.closest('.productionField').onfocusout=event=>{
  if(!event.currentTarget.contains(event.relatedTarget))close();
 };
 container.onpointerdown=event=>{
  if(event.target.closest('button'))event.preventDefault();
 };
}
function closeMachine(){
 machineOptions.hidden=true;
 byId('machineSearchEmpty').hidden=true;
 machineSearch.value=selectedMachineLabel;
}
function closeParts(){
 partCards.hidden=true;
 partSearch.value='';
}
setupPicker(machineSearch,machineOptions,()=>{
 machineSearch.value='';
 machineOptions.hidden=false;
 filterMachines();
},closeMachine);
setupPicker(partSearch,partCards,()=>{
 partCards.hidden=false;
 paintParts();
},closeParts);
function paintParts(){
 if(partCards.hidden)return;
 const terms=norm(partSearch.value).trim().split(/\s+/);
 const rows=partOptions().filter(row=>terms.every(term=>norm((row.numero??'')+' '+row.nombre).includes(term)));
 partCards.replaceChildren(...rows.map(row=>{
  const button=document.createElement('button');
  button.type='button';
  button.textContent=[row.numero,row.nombre].filter(Boolean).join(' · ');
  button.onclick=()=>{
   if(saving)return;
   draft.push({partId:row.id,itemId:row.criterionId||'',noItem:row.numero||'',nombreRepuesto:row.nombre,cantidad:1,origen:fields.tipoEquipo.value+inventoryOrigin,tipoEquipo:fields.tipoEquipo.value});
   partSearch.blur();
   closeParts();
   paintDraft();
  };
  return button;
 }));
 if(!rows.length)partCards.textContent='No hay repuestos que coincidan.';
}
function paintPeople(){
 const query=norm(byId('personSearch').value);
 const mechanic=session?.user.role==='mechanic';
 byId('responsibleSearchLabel').hidden=mechanic;
 fields.responsableId.disabled=mechanic;
 const people=(state.personal||[]).filter(row=>mechanic?row.id===ownPerson():norm(personLabel(row)).includes(query));
 options(fields.responsableId,people,personLabel);
 if(mechanic)fields.responsableId.value=ownPerson()||'';
}
function list(id,rows,label){
 byId(id).replaceChildren(...rows.map(row=>{const li=document.createElement('li');li.textContent=label(row);return li}));
}
function paintDirectory(){
 const query=norm(byId('directorySearch').value);
 list('directory',(state.personal||[]).filter(row=>norm(personLabel(row)).includes(query)),personLabel);
}
function paintDraft(){
 const list=byId('draft');
 list.hidden=!draft.length;
 list.replaceChildren(...draft.map((row,index)=>{
  const li=document.createElement('li'),button=document.createElement('button');
  const identity=document.createElement('strong'),origin=document.createElement('small');
  identity.textContent=[row.noItem,row.nombreRepuesto].filter(Boolean).join(' · ');
  origin.textContent='Inventario '+row.origen;
  identity.append(origin);
  const quantityLabel=document.createElement('label'),quantity=document.createElement('input');
  quantityLabel.textContent='Cantidad';
  quantity.type='number';quantity.min='1';quantity.step='1';quantity.required=true;
  quantity.value=row.cantidad;
  quantity.oninput=()=>{row.cantidad=quantity.value};
  quantityLabel.append(quantity);
  button.type='button';button.textContent='×';button.setAttribute('aria-label','Retirar '+row.nombreRepuesto);
  button.onclick=()=>{if(!saving){draft.splice(index,1);paintDraft()}};
  li.append(identity,button,quantityLabel);return li;
 }));
}
function filterMachines(){
 const terms=norm(byId('machineSearch').value).trim().split(/\s+/);
 const cards=Array.from(byId('machineOptions').children);
 for(const card of cards){
  const label=norm(card.textContent);
  card.hidden=!terms.every(term=>label.includes(term));
 }
 byId('machineSearchEmpty').hidden=machineOptions.hidden||!cards.length||cards.some(card=>!card.hidden);
}
byId('machineSearch').oninput=filterMachines;
function paint(){
 const machines=(state.assets||[]).filter(row=>norm(row.clase).startsWith(norm(fields.tipoEquipo.value)));
 const selected=machines.find(row=>String(row.id)===fields.assetId.value);
 fields.assetId.value=selected?.id??'';
 selectedMachineLabel=selected?labelAsset(selected):'';
 if(machineOptions.hidden)machineSearch.value=selectedMachineLabel;
 byId('machineOptions').replaceChildren(...machines.map(row=>{
  const button=document.createElement('button');
  button.type='button';
  button.textContent=labelAsset(row);
  button.setAttribute('aria-pressed',String(row===selected));
  button.onclick=()=>{
   fields.assetId.value=row.id;
   selectedMachineLabel=labelAsset(row);
   machineOptions.querySelector('[aria-pressed="true"]')?.setAttribute('aria-pressed','false');
   button.setAttribute('aria-pressed','true');
   machineSearch.blur();
   closeMachine();
  };
  return button;
 }));
 if(!machines.length)byId('machineOptions').textContent='No hay máquinas disponibles para este tipo.';
 filterMachines();
 paintParts();paintPeople();paintDirectory();paintDraft();
 const people=new Map((state.personal||[]).map(row=>[row.id,row.nombre]));
 const assets=new Map((state.assets||[]).map(row=>[row.id,labelAsset(row)]));
 byId('history').replaceChildren(...[...(state.consumptions||[]),...(state.pending||[]).map(row=>({...row,syncState:'pending'}))].sort((a,b)=>b.fechaISO.localeCompare(a.fechaISO)).map(row=>{
  const tr=document.createElement('tr');
  for(const value of [row.fechaISO,assets.get(row.assetId)||row.assetId,row.origen,row.nombreRepuesto,row.cantidad,row.responsableNombre||people.get(row.responsableId)||'—',row.registradoPorNombre||row.registradoPor||(row.syncState==='pending'?session.user.name:'—'),row.syncState==='pending'?'Pendiente':'Sincronizado']){const td=document.createElement('td');td.textContent=value;tr.append(td)}
  return tr;
 }));
 list('deliveries',state.deliveries||[],row=>[row.createdAt?.slice(0,10),row.itemName,row.quantity,row.reversed?'Reversado':''].filter(Boolean).join(' · '));
 paintSync();
 window.dispatchEvent(new Event('skweb-consumption-changed'));
}
function paintSync(){
 const count=(state.pending||[]).length,badge=byId('pendingBadge'),button=byId('sync');
 const complete=Boolean(state.lastSyncAt)&&!count;
 const label=syncing?'Sincronizando':'Sincronizar';
 button.disabled=syncing;
 button.classList.toggle('isSyncing',syncing);
 byId('syncLabel').textContent=label;
 badge.className='pendingBadge'+(syncFailed?' error':!syncing&&complete?' synced':'');
 badge.textContent=count?String(count):syncing?'↻':syncFailed?'!':complete?'✓':'0';
 badge.title=count?count+' pendientes':syncing?label:syncFailed?'Error de sincronización':complete?'Todo sincronizado':'Sin sincronizar';
 badge.setAttribute('aria-label',badge.title);
 const date=new Date(state.lastSyncAt);
 byId('headerLastSync').textContent=Number.isNaN(date.getTime())?'SIN SINCRONIZAR':
  'Sinc. '+date.toLocaleDateString('es-CO',{timeZone:'America/Bogota',day:'numeric',month:'numeric'})+' '+date.toLocaleTimeString('es-CO',{timeZone:'America/Bogota',hour:'numeric',minute:'2-digit'});
}
async function sync(){
 if(!valid()||syncing)return;
 if(!navigator.onLine){syncFailed=true;paintSync();return}
 const active=session,document=active.user.document;
 syncing=true;syncFailed=false;paintSync();
 try{
  const local=await changeState(document),pending=(local.pending||[]).slice(0,1000);
  const data=await api('productionSync',{token:active.token,pending});
  const acknowledged=new Set(data.ack);
  const fresh=await changeState(document,current=>({...data,lastSyncAt:new Date().toISOString(),pending:(current.pending||[]).filter(row=>!acknowledged.has(row.id))}));
  if(session===active){state=fresh;paint()}
 }catch(error){if(session===active)syncFailed=true;console.error('Sincronización de Producción:',error)}
 finally{syncing=false;paintSync()}
}
async function openWorkspace(){
 if(!valid())return;
 state=await changeState(session.user.document);
 byId('access').hidden=true;byId('workspace').hidden=false;byId('productionSync').hidden=false;syncFailed=false;
 byId('operatorName').textContent=session.user.name;
 byId('operatorRole').textContent=roleLabels[session.user.role]||'Auxiliar';
 fields.fechaISO.value=today();paint();window.dispatchEvent(new Event('skweb-open-queries'));await sync();
}
form.onsubmit=async event=>{
 event.preventDefault();if(saving)return;
 if(!valid())return status('La sesión venció. Vuelve a iniciar sesión para guardar.');
 const active=session;
 saving=true;form.querySelector('[type=submit]').disabled=true;
 try{
  if(!fields.assetId.value)throw new Error('Selecciona la máquina.');
  if(!draft.length)throw new Error('Selecciona al menos un repuesto.');
  const lines=draft.map(row=>({...row,cantidad:Number(row.cantidad)}));
  if(lines.some(row=>!Number.isSafeInteger(row.cantidad)||row.cantidad<1))throw new Error('Ingresa una cantidad entera mayor que cero para cada repuesto.');
  if(lines.some(row=>row.tipoEquipo!==fields.tipoEquipo.value))throw new Error('Todos los repuestos deben corresponder al tipo de máquina seleccionado.');
  const shared={assetId:fields.assetId.value,responsableId:fields.responsableId.value,fechaISO:fields.fechaISO.value};
  if(!shared.responsableId)throw new Error('Selecciona el mecánico o responsable de la reparación.');
  const records=lines.map(row=>({...shared,...row,syncState:'pending',registradoPorNombre:active.user.name,id:crypto.randomUUID(),createdAt:new Date().toISOString()}));
  const fresh=await changeState(active.user.document,current=>({...current,pending:[...(current.pending||[]),...records]}));
  if(session===active){state=fresh;draft=[];closeParts();paint();status('Consumos guardados. '+state.pending.length+' pendientes de sincronizar.')}
 }catch(error){status(error.message)}
 finally{saving=false;form.querySelector('[type=submit]').disabled=false}
};
function submitAccess(id,handler){
 byId(id).onsubmit=async event=>{
  event.preventDefault();const button=event.currentTarget.querySelector('button'),values=Object.fromEntries(new FormData(event.currentTarget));
  if(button.disabled)return;
  button.disabled=true;try{await handler(values)}catch(error){status(error.message)}finally{button.disabled=false}
 };
}
submitAccess('login',async values=>{
 const data=await api('productionLogin',values);
 session={token:data.token,expiresAt:data.expiresAt,user:data.user};localStorage.setItem(sessionKey,JSON.stringify(session));
 byId('login').reset();await openWorkspace();
});
submitAccess('activate',async values=>{
 await api('accessInvitationAccept',{...values,invitation});history.replaceState(null,'',location.pathname);
 byId('activate').reset();byId('activate').hidden=true;byId('login').hidden=false;byId('login').elements.document.value=values.document;
 status('Acceso activado. Ingresa con tu nueva contraseña.');
});
byId('logout').onclick=()=>{
 session=null;state={};draft=[];fields.assetId.value='';closeParts();closeMachine();localStorage.removeItem(sessionKey);
 byId('workspace').hidden=true;byId('productionSync').hidden=true;byId('access').hidden=false;status('Sesión cerrada.');
};
byId('sync').onclick=sync;window.addEventListener('online',sync);
for(const radio of fields.tipoEquipo)radio.onchange=()=>{
 byId('machineSearch').value='';
 paint();
};
byId('partSearch').oninput=paintParts;byId('personSearch').oninput=paintPeople;byId('directorySearch').oninput=paintDirectory;
if(invitation){
 byId('login').hidden=true;
 api('accessInvitationInfo',{invitation}).then(info=>{
  if(info.scope!=='production')throw new Error('Esta invitación corresponde a otra aplicación');
  byId('activate').elements.document.value=info.document;byId('activate').hidden=false;
 }).catch(error=>{status(error.message);byId('login').hidden=false});
}else openWorkspace().catch(error=>status(error.message));
const workerRegistration=navigator.serviceWorker?.register('sw.js',{updateViaCache:'none'})
 .catch(error=>console.error(error));

byId('updateProduction').onclick=async event=>{
 const button=event.currentTarget;
 if(saving||syncing)return status('Espera a que termine el guardado o la sincronización.');
 if(draft.length)return status('Guarda o quita los repuestos seleccionados antes de actualizar.');
 button.disabled=true;
 status('Buscando la versión más reciente de Producción…');
 try{
  const url=new URL(location.href);
  url.searchParams.set('_appUpdate',Date.now());
  const response=await fetch(url,{cache:'no-store'});
  if(!response.ok)throw new Error('No se pudo abrir Producción.');
  const registration=await workerRegistration;
  await registration?.update();
  if(saving||syncing||draft.length){
   status('Versión comprobada. Termina el registro y vuelve a pulsar Actualizar app.');
   return;
  }
  location.replace(url.href);
 }catch{
  status('No se pudo actualizar Producción. Revisa la conexión y vuelve a intentarlo.');
 }finally{
  button.disabled=false;
 }
};
