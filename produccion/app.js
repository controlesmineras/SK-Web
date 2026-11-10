
'use strict';
const byId=id=>document.getElementById(id);
const form=byId('record'),fields=form.elements;
const status=message=>{byId('status').textContent=message};
const inventoryOrigin='29';
byId('inventoryOrigin').value=inventoryOrigin;
function createDeviceAccess(namespace) {
    const key = namespace + ':device-access:v1';
    const id = (value) => String(value).trim().toLowerCase();
    const read = () => { try {
        return Object.assign(Object.create(null), JSON.parse(localStorage.getItem(key) || '{}'));
    }
    catch {
        return Object.create(null);
    } };
    const write = (rows) => localStorage.setItem(key, JSON.stringify(rows));
    const hex = (bytes) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    async function hash(password, salt) { const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']); return hex(new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 150000, hash: 'SHA-256' }, material, 256))); }
    return {
        async remember(username, password, session) { const salt = hex(crypto.getRandomValues(new Uint8Array(16))), derived = await hash(password, salt), rows = read(); rows[id(username)] = { salt, hash: derived, session, confirmedAt: new Date().toISOString() }; write(rows); },
        async verify(username, password) { const row = read()[id(username)]; if (!row || await hash(password, row.salt) !== row.hash)
            return null; return row.session; },
        byToken(token) { return Object.values(read()).find(row => row.session?.token === token)?.session || null; },
        remove(username) { const rows = read(); delete rows[id(username)]; write(rows); },
        revokeToken(token) { const rows = read(); for (const name of Object.keys(rows))
            if (rows[name].session?.token === token)
                delete rows[name]; write(rows); }
    };
}
const deviceAccess=createDeviceAccess('sk-production');
const sessionKey='sk-production-session';
const db=true;
async function all(name){return name==='consumptions'?[...(state.consumptions||[]),...(state.pending||[]).filter(row=>!row.kind)]:state[name]||[]}
let syncFailed=false;
let session=null,state={},draft=[],syncing=false,saving=false;
try{session=JSON.parse(localStorage.getItem(sessionKey)||'null')}catch{}
if(session&&Number(session.expiresAt)<=Date.now()){
 session=navigator.onLine?null:deviceAccess.byToken(session.token);
}

const invitation=new URLSearchParams(location.hash.slice(1)).get('invitation');
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Bogota'}).format(new Date());
const bogotaHour=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Bogota',hour:'2-digit',hourCycle:'h23'});
function currentShift(date=new Date()){
 const hour=Number(bogotaHour.format(date));
 return hour<6||hour>=22?'S':hour<14?'D':'T';
}
let manualShift=false;
for(const radio of fields.turno)radio.onchange=()=>{manualShift=true};
function refreshShift(){
 if(!manualShift)fields.turno.value=currentShift();
}
const norm=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const roleLabels={admin:'Administrador',assistant:'Auxiliar',mechanic:'Mecánico'};
const ownPerson=()=>session.user.personId||(state.personal||[]).find(row=>String(row.documento).trim()===session.user.document)?.id;
const canSync=()=>session?.token&&Number(session.expiresAt)>Date.now();
const database=new Promise((resolve,reject)=>{
 const request=indexedDB.open('sk-production',1);
 request.onblocked=()=>reject(new Error('Cierra las otras ventanas de Producción y vuelve a abrir la app.'));
 request.onupgradeneeded=()=>request.result.createObjectStore('accounts');
 request.onsuccess=()=>resolve(request.result);
 request.onerror=()=>reject(new Error('No se pudo abrir el almacenamiento local de Producción.'));
});
database.catch(()=>{});
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
 if(!navigator.onLine)throw new Error('Sin conexión. Conéctate a internet e inténtalo de nuevo.');
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),30000);
 let response,result;
 try{
  response=await fetch(window.SK_SYNC_CONFIG.apiUrl,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action,...data}),signal:controller.signal,cache:'no-store',credentials:'omit'});
  if(response.ok)result=await response.json();
 }catch(error){
  if(controller.signal.aborted)throw new Error('El servidor tardó demasiado en responder. Inténtalo de nuevo.');
  throw new Error('No se pudo conectar con el servidor de Producción. Revisa la conexión e inténtalo de nuevo.');
 }finally{clearTimeout(timeout)}
 if(!response.ok)throw new Error('Error de conexión ('+response.status+')');
 if(!result.ok){
  const error=new Error(result.error||'No se pudo completar la solicitud');
  error.centralResponse=true;
  throw error;
 }
 return result;
}
const labelAsset=row=>[row.clase,row.modelo,row.marcaActual||row.marcaInterna,row.numeroMarcaActual,row.serial].filter(Boolean).join(' · ');
const personLabel=row=>[row.nombre,row.documento].filter(Boolean).join(' · ');
function partOptions(){
 const rows=window.SKSpareCatalog.merge(state.parts||[],state.inventoryCriteria||[]);
 return window.SKSpareCatalog.filter(rows,fields.tipoEquipo.value,inventoryOrigin);
}
const machineSearch=byId('machineSearch'),partSearch=byId('partSearch');
const selectPart=byId('selectPart');
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
 selectPart.setAttribute('aria-expanded','false');
 partSearch.value='';
}
setupPicker(machineSearch,machineOptions,()=>{
 machineSearch.value='';
 machineOptions.hidden=false;
 filterMachines();
},closeMachine);
const machinePicker=byId('machinePicker');
document.addEventListener('click',event=>{
 if(!machineOptions.hidden&&!machinePicker.contains(event.target))closeMachine();
},true);
function openParts(){
 partCards.hidden=false;
 selectPart.setAttribute('aria-expanded','true');
 paintParts();
}
setupPicker(partSearch,partCards,openParts,closeParts);
selectPart.onclick=()=>{
 if(partCards.hidden)openParts();
 else closeParts();
};
const partPicker=byId('partPicker');
partPicker.addEventListener('keydown',event=>{
 if(event.key==='Escape'&&!partCards.hidden){
  selectPart.focus();
  closeParts();
 }
});
document.addEventListener('click',event=>{
 if(!partCards.hidden&&!partPicker.contains(event.target))closeParts();
},true);
const incomeForm=byId('productionIncome'),stockEditForm=byId('productionStockEdit');
const stockViews=[
 {form:incomeForm,panel:byId('incomePanel'),button:byId('showIncome'),kind:'income'},
 {form:stockEditForm,panel:byId('stockEditPanel'),button:byId('showStockEdit'),kind:'initial'}
];
function canSaveStock(kind,role){
 return role==='admin'||(kind==='income'&&role==='assistant');
}
const catalog=()=>window.SKSpareCatalog.merge(state.parts||[],state.inventoryCriteria||[]);
const incomeMovements=()=>[...(state.incomes||[]),...(state.pending||[]).filter(row=>row.kind)];
function stockFor(part,origin){
 const matches=row=>row.origen===origin&&(row.partId===part.id||Boolean(part.criterionId)&&row.partId===part.criterionId);
 const income=incomeMovements().filter(matches);
 const initial=income.find(row=>row.kind==='initial');
 const since=row=>!initial||row.fechaISO>=initial.fechaISO;
 const received=income.filter(row=>row.kind==='income'&&since(row)).reduce((sum,row)=>sum+row.cantidad,0);
 const used=[...(state.consumptions||[]),...(state.pending||[])]
  .filter(row=>!row.kind&&!row.deleted&&matches(row)&&since(row)).reduce((sum,row)=>sum+row.cantidad,0);
 return (initial?.cantidad||0)+received-used;
}
function filterParts(parts,search){
 const query=norm(search).trim();
 const itemQuery=query.match(/\bitem\s*(\d+)\b/);
 const exactNumber=itemQuery?.[1]||(/^\d+$/.test(query)?query:'');
 const nameQuery=itemQuery?query.replace(itemQuery[0],' ').replace(/\s+/g,' ').trim():exactNumber?'':query;
 return parts.filter(row=>{
  const number=String(row.numero??'').trim();
  return (!exactNumber||number===exactNumber)&&norm(row.nombre).includes(nameQuery);
 });
}
function paintStockView({form:stockForm,panel,kind}){
 const incomeFields=stockForm.elements;
 const rows=catalog(),origin=incomeFields.origen.value;
 const options=filterParts(window.SKSpareCatalog.filter(rows,origin.replace(/\d+$/,''),origin),incomeFields.search.value);
 const selected=incomeFields.partId.value;
 incomeFields.partId.replaceChildren(new Option('Selecciona un repuesto',''),...options.map(row=>new Option([row.numero,row.nombre].filter(Boolean).join(' · '),row.id)));
 if(options.some(row=>row.id===selected))incomeFields.partId.value=selected;
 const part=options.find(row=>row.id===incomeFields.partId.value);
 const enabled=Array.isArray(state.incomes);
 const allowed=canSaveStock(kind,session?.user.role);
 panel.querySelector('[data-stock-balance]').textContent=!enabled?'El servidor debe actualizarse y sincronizarse antes de registrar movimientos.':part?'Existencia registrada: '+stockFor(part,origin):options.length?'Selecciona un repuesto para ver su existencia.':'Sin repuestos que coincidan.';
 stockForm.querySelector('button').disabled=saving||!enabled||!allowed||!part;
 if(kind==='initial')paintStockRows(panel.querySelector('[data-stock-rows]'),kind,rows);
}
function paintStockRows(body,kind,rows=catalog()){
 body.replaceChildren(...incomeMovements().filter(row=>row.kind===kind).reverse().map(row=>{
  const tr=document.createElement('tr'),item=rows.find(x=>x.id===row.partId);
  const values=[row.fechaISO,item?.nombre||row.partId,row.kind==='initial'?'Saldo inicial':row.origen,row.cantidad];
  if(kind==='initial')values.splice(1,0,item?.numero||'—');
  for(const value of values){
   const td=document.createElement('td');td.textContent=value;tr.append(td);
  }
  return tr;
 }));
}
async function saveStock(event,{form:stockForm,kind}){
 event.preventDefault();
 const active=session;
 if(!active||saving||!Array.isArray(state.incomes)||!canSaveStock(kind,active.user.role))return;
 const {origen,partId,fechaISO,cantidad}=stockForm.elements;
 if(cantidad.value==='')return;
 const row={kind,origen:origen.value,partId:partId.value,fechaISO:fechaISO.value,cantidad:Number(cantidad.value)};
 if(!Number.isSafeInteger(row.cantidad)||row.cantidad<(row.kind==='initial'?0:1))return;
 saving=true;
 try{
  const record={...row,id:crypto.randomUUID(),createdAt:new Date().toISOString()};
  const fresh=await changeState(active.user.document,current=>{
   if(row.kind==='initial'&&[...(current.incomes||[]),...(current.pending||[])].some(x=>x.kind==='initial'&&x.partId===row.partId&&x.origen===row.origen))throw new Error('El repuesto ya tiene un saldo inicial.');
   return {...current,pending:[...(current.pending||[]),record]};
  });
  if(session===active){state=fresh;cantidad.value='';status(kind==='initial'?'Saldo inicial guardado.':'Ingreso guardado.');}
 }catch(error){if(session===active)status(error.message)}
 finally{saving=false;if(session===active)paint()}
 if(session===active&&navigator.onLine)await sync();
}
for(const view of stockViews){
 view.form.addEventListener('change',()=>paintStockView(view));
 view.form.elements.search.addEventListener('input',()=>paintStockView(view));
 view.form.addEventListener('submit',event=>saveStock(event,view));
}
function paintParts(){
 if(partCards.hidden)return;
 const rows=filterParts(partOptions(),partSearch.value);
 partCards.replaceChildren(...rows.map(row=>{
  const button=document.createElement('button');
  button.type='button';
  button.textContent=[row.numero,row.nombre,Array.isArray(state.incomes)?'Existencia: '+stockFor(row,fields.tipoEquipo.value+inventoryOrigin):''].filter(Boolean).join(' · ');
  button.onclick=()=>{
   if(saving)return;
   draft.push({partId:row.id,itemId:row.criterionId||'',noItem:row.numero||'',nombreRepuesto:row.nombre,cantidad:1,origen:fields.tipoEquipo.value+inventoryOrigin,tipoEquipo:fields.tipoEquipo.value});
   selectPart.focus();
   closeParts();
   paintDraft();
  };
  return button;
 }));
 if(!rows.length)partCards.textContent='No hay repuestos que coincidan.';
}
const personSearch=byId('personSearch'),responsibleOptions=byId('responsibleOptions');
setupPicker(personSearch,responsibleOptions,()=>{
 responsibleOptions.hidden=false;
 paintPeople();
},()=>{responsibleOptions.hidden=true});
function paintPeople(){
 const mechanic=session?.user.role==='mechanic';
 byId('responsiblePicker').hidden=mechanic;
 if(mechanic){fields.responsableId.value=ownPerson()||'';return}
 const people=(state.personal||[]).filter(row=>!row.deleted);
 const selected=people.find(row=>String(row.id)===fields.responsableId.value);
 if(!selected)fields.responsableId.value='';
 if(responsibleOptions.hidden)return;
 const terms=selected?[]:norm(personSearch.value).split(/\s+/);
 const matches=people.filter(row=>terms.every(term=>norm(personLabel(row)).includes(term)));
 responsibleOptions.replaceChildren(...matches.map(row=>{
  const button=document.createElement('button');
  button.type='button';
  button.textContent=personLabel(row);
  button.setAttribute('aria-pressed',String(row===selected));
  button.onclick=()=>{
   fields.responsableId.value=row.id;
   personSearch.value=personLabel(row);
   personSearch.blur();
   responsibleOptions.hidden=true;
  };
  return button;
 }));
 if(!matches.length)responsibleOptions.textContent='No se encontraron colaboradores.';
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
  quantity.id='partQuantity'+index;quantityLabel.htmlFor=quantity.id;
  quantityLabel.textContent='Cantidad';
  quantity.type='number';quantity.min='1';quantity.step='1';quantity.required=true;
  quantity.value=row.cantidad;
  const stepper=document.createElement('div'),down=document.createElement('button'),up=document.createElement('button');
  const quantityField=document.createElement('div'),quantityButtons=document.createElement('div');
  stepper.className='quantityStepper';
  quantityField.className='quantityField';
  quantityButtons.className='quantityButtons';
  down.type=up.type='button';
  down.textContent='▼';up.textContent='▲';
  down.setAttribute('aria-label','Disminuir cantidad de '+row.nombreRepuesto);
  up.setAttribute('aria-label','Aumentar cantidad de '+row.nombreRepuesto);
  const updateQuantity=()=>{
   if(quantity.value!==''&&Number(quantity.value)<1)quantity.value='1';
   row.cantidad=quantity.value;
   down.disabled=Number(quantity.value)<=1;
  };
  const step=delta=>{
   if(saving)return;
   const current=Math.floor(Number(quantity.value));
   quantity.value=Math.min(Number.MAX_SAFE_INTEGER,Math.max(1,current+delta));
   updateQuantity();
  };
  down.onclick=()=>step(-1);up.onclick=()=>step(1);
  quantity.oninput=updateQuantity;
  updateQuantity();
  quantityField.append(quantityLabel,quantity);
  quantityButtons.append(up,down);
  stepper.append(quantityField,quantityButtons);
  button.type='button';button.className='removePart';button.textContent='×';button.setAttribute('aria-label','Retirar '+row.nombreRepuesto);
  button.onclick=()=>{if(!saving){draft.splice(index,1);paintDraft()}};
  li.append(identity,button,stepper);return li;
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
function availableForConsumption(asset){
 return !/^yt/i.test(asset.clase||'')||!/dad(?:o\/a|o|a) de baja|retirad[oa]|desechad[oa]/.test(norm(asset.estado)+' '+norm(asset.ubicacion));
}
function machinePickerLabel(row){
 const label=labelAsset(row);
 return /^YT$/i.test(row.clase)&&row.modelo?label.replace(/^YT · /i,'YT'):label;
}
function paint(){
 const machines=(state.assets||[]).filter(row=>norm(row.clase).startsWith(norm(fields.tipoEquipo.value))&&availableForConsumption(row));
 const selected=machines.find(row=>String(row.id)===fields.assetId.value);
 fields.assetId.value=selected?.id??'';
 selectedMachineLabel=selected?machinePickerLabel(selected):'';
 if(machineOptions.hidden)machineSearch.value=selectedMachineLabel;
 byId('machineOptions').replaceChildren(...machines.map(row=>{
  const button=document.createElement('button');
  button.type='button';
  button.textContent=machinePickerLabel(row);
  button.setAttribute('aria-pressed',String(row===selected));
  button.onclick=()=>{
   fields.assetId.value=row.id;
   selectedMachineLabel=machinePickerLabel(row);
   machineOptions.querySelector('[aria-pressed="true"]')?.setAttribute('aria-pressed','false');
   button.setAttribute('aria-pressed','true');
   machineSearch.blur();
   closeMachine();
  };
  return button;
 }));
 if(!machines.length)byId('machineOptions').textContent='No hay equipos disponibles para este tipo.';
 filterMachines();
 paintParts();paintPeople();paintDraft();
 for(const view of stockViews)if(!view.panel.hidden)paintStockView(view);
 paintSync();
 if(!byId('productionQueries').hidden){
  if(!byId('incomeQueries').hidden)paintIncomeQueries();
  else window.dispatchEvent(new Event('skweb-consumption-changed'));
 }
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
 badge.title=count?count+(count===1?' movimiento pendiente':' movimientos pendientes'):syncing?label:syncFailed?'Error de sincronización':complete?'Todo sincronizado':'Sin sincronizar';
 badge.setAttribute('aria-label',badge.title);
 const date=new Date(state.lastSyncAt);
 byId('headerLastSync').textContent=Number.isNaN(date.getTime())?'SIN SINCRONIZAR':
  'Sinc. '+date.toLocaleDateString('es-CO',{timeZone:'America/Bogota',day:'numeric',month:'numeric'})+' '+date.toLocaleTimeString('es-CO',{timeZone:'America/Bogota',hour:'numeric',minute:'2-digit'});
}
let syncRequested=false;
async function sync(){
 if(!session)return;
 if(syncing){syncRequested=true;return}
 if(!navigator.onLine){syncFailed=true;paintSync();return}
 if(!canSync()){syncFailed=true;paintSync();status('Vuelve a iniciar sesión con internet para sincronizar. Tus registros siguen guardados.');return}
 const active=session,document=active.user.document;
 syncing=true;syncFailed=false;paintSync();
 try{
  do{
   syncRequested=false;
   const local=await changeState(document),pending=(local.pending||[]).slice(0,1000);
   const data=await api('productionSync',{token:active.token,pending});
   const acknowledged=new Set(Array.isArray(data.ack)?data.ack:[]);
   const savedIds=new Set([...(data.incomes||[]),...(data.consumptions||[])].map(row=>row.id));
   if(pending.some(row=>!acknowledged.has(row.id)||!savedIds.has(row.id))){
    throw new Error('La base central no confirmó todos los movimientos. Siguen pendientes para reintentar.');
   }
   const fresh=await changeState(document,current=>({...data,lastSyncAt:new Date().toISOString(),pending:(current.pending||[]).filter(row=>!acknowledged.has(row.id)||!savedIds.has(row.id))}));
   if(session===active){state=fresh;paint()}
  }while(session===active&&navigator.onLine&&(syncRequested||state.pending.length));
 }catch(error){
  if(error.centralResponse&&/revocada|sesión no válida|inicia sesión/i.test(error.message)){
   deviceAccess.revokeToken(active.token);
   if(session===active){
    byId('logout').click();
    byId('accessStatus').textContent=error.message+'. Los consumos pendientes siguen guardados.';
   }
  }
  if(session===active){
   syncFailed=true;
   status(error.name==='AbortError'?'La sincronización tardó demasiado. Puedes volver a intentarlo.':error.message);
  }
  console.error('Sincronización de Producción:',error);
 }
 finally{syncing=false;paintSync()}
}
function showConsumptionView(showQueries,stockView){
 if(stockView?.kind==='initial'&&session?.user.role!=='admin')return;
 byId('recordPanel').hidden=showQueries||Boolean(stockView);
 for(const view of stockViews){
  const selected=view===stockView;
  view.panel.hidden=!selected;
  view.button.setAttribute('aria-pressed',String(selected));
  if(selected)paintStockView(view);
 }
 byId('productionQueries').hidden=!showQueries;
 byId('showRecord').setAttribute('aria-pressed',String(!showQueries&&!stockView));
 byId('showConsumptionQueries').setAttribute('aria-pressed',String(showQueries));
 if(showQueries)showQueryType(byId('queryIncome').getAttribute('aria-pressed')==='true');
}
function paintIncomeQueries(){
 const notice=byId('incomeQueryStatus');
 notice.textContent=!Array.isArray(state.incomes)?'Sincroniza para cargar los ingresos.':'Aún no hay ingresos registrados.';
 notice.hidden=incomeMovements().some(row=>row.kind==='income');
 paintStockRows(byId('incomeQueryRows'),'income');
}
function showQueryType(incomes){
 byId('queryIncome').setAttribute('aria-pressed',String(incomes));
 byId('queryConsumption').setAttribute('aria-pressed',String(!incomes));
 byId('incomeQueries').hidden=!incomes;
 byId('queries').hidden=incomes;
 if(incomes)paintIncomeQueries();
 else window.dispatchEvent(new Event('skweb-open-queries'));
}
for(const view of stockViews)view.button.onclick=()=>showConsumptionView(false,view);
byId('showRecord').onclick=()=>showConsumptionView(false);
byId('showConsumptionQueries').onclick=()=>showConsumptionView(true);
byId('queryIncome').onclick=()=>showQueryType(true);
byId('queryConsumption').onclick=()=>showQueryType(false);
function placeInstallControls(container){
 container.append(byId('installProduction'),byId('installProductionHelp'));
}
async function openWorkspace(){
 if(!session)return;
 state=await changeState(session.user.document);
 placeInstallControls(document.querySelector('.productionToolbar'));
 byId('access').hidden=true;byId('productionHeader').hidden=false;byId('workspace').hidden=false;byId('productionSync').hidden=false;syncFailed=false;
 byId('operatorName').textContent=session.user.name;
 byId('operatorRole').textContent=roleLabels[session.user.role]||'Auxiliar';
 byId('showStockEdit').hidden=session.user.role!=='admin';
 for(const view of stockViews)view.form.elements.fechaISO.value=today();
 fields.fechaISO.value=today();manualShift=false;refreshShift();showConsumptionView(false);paint();if(navigator.onLine)await sync();
}
form.onsubmit=async event=>{
 event.preventDefault();if(saving)return;
 if(!session)return status('Inicia sesión para guardar.');
 const active=session;
 saving=true;form.querySelector('[type=submit]').disabled=true;
 try{
  if(!fields.assetId.value)throw new Error('Selecciona el equipo.');
  if(!draft.length)throw new Error('Selecciona al menos un repuesto.');
  const lines=draft.map(row=>({...row,cantidad:Number(row.cantidad)}));
  if(lines.some(row=>!Number.isSafeInteger(row.cantidad)||row.cantidad<1))throw new Error('Ingresa una cantidad entera mayor que cero para cada repuesto.');
  if(lines.some(row=>row.tipoEquipo!==fields.tipoEquipo.value))throw new Error('Todos los repuestos deben corresponder al tipo de equipo seleccionado.');
  refreshShift();
  const shared={turno:fields.turno.value,assetId:fields.assetId.value,responsableId:fields.responsableId.value,fechaISO:fields.fechaISO.value};
  if(!shared.responsableId)throw new Error('Selecciona el mecánico o responsable de la reparación.');
  const records=lines.map(row=>({...shared,...row,syncState:'pending',registradoPorNombre:active.user.name,id:crypto.randomUUID(),createdAt:new Date().toISOString()}));
  const fresh=await changeState(active.user.document,current=>({...current,pending:[...(current.pending||[]),...records]}));
  if(session===active){state=fresh;draft=[];manualShift=false;refreshShift();closeParts();paint();status('Consumos guardados.')}
 }catch(error){status(error.message)}
 finally{saving=false;form.querySelector('[type=submit]').disabled=false}
};
function submitAccess(id,handler){
 const feedback=byId('accessStatus');
 byId(id).onsubmit=async event=>{
  event.preventDefault();const button=event.currentTarget.querySelector('button'),values=Object.fromEntries(new FormData(event.currentTarget));
  if(button.disabled)return;
  button.disabled=true;feedback.textContent=id==='login'?'Verificando acceso…':'Activando acceso…';
  try{await handler(values);feedback.textContent=''}catch(error){feedback.textContent=error.message}finally{button.disabled=false}
 };
}
submitAccess('login',async values=>{
 const {document,password}=values;
 let nextSession;
 try{
  const data=await api('productionLogin',values);
  nextSession={token:data.token,expiresAt:data.expiresAt,user:data.user};
  await deviceAccess.remember(document,password,nextSession);
 }catch(error){
  if(error.centralResponse){
   if(/documento o contraseña incorrectos|colaborador no disponible/i.test(error.message))deviceAccess.remove(document);
   throw error;
  }
  nextSession=await deviceAccess.verify(document,password);
  if(!nextSession)throw new Error(navigator.onLine?error.message:'Acceso local no disponible. Verifica la contraseña o inicia sesión con internet en este dispositivo.');
 }
 session=nextSession;
 localStorage.setItem(sessionKey,JSON.stringify(session));
 await openWorkspace();byId('login').reset();
});
byId('login').querySelector('button').disabled=false;
byId('accessStatus').textContent='';
setInterval(refreshShift,15000);
window.addEventListener('focus',refreshShift);
submitAccess('activate',async values=>{
 await api('accessInvitationAccept',{...values,invitation});history.replaceState(null,'',location.pathname);
 byId('activate').reset();byId('activate').hidden=true;byId('login').hidden=false;byId('login').elements.document.value=values.document;
 status('Acceso activado. Ingresa con tu nueva contraseña.');
});
byId('logout').onclick=()=>{
 fields.responsableId.value='';personSearch.value='';responsibleOptions.hidden=true;
 placeInstallControls(byId('installBeforeLogin'));
 session=null;state={};draft=[];fields.assetId.value='';closeParts();closeMachine();localStorage.removeItem(sessionKey);
 byId('workspace').hidden=true;byId('productionHeader').hidden=true;byId('productionSync').hidden=true;byId('access').hidden=false;status('Sesión cerrada.');
};
byId('sync').onclick=sync;window.addEventListener('online',sync);
for(const radio of fields.tipoEquipo)radio.onchange=()=>{
 byId('machineSearch').value='';
 paint();
};
partSearch.oninput=openParts;personSearch.oninput=()=>{fields.responsableId.value='';paintPeople()};
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
