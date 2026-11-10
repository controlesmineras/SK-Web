
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
const displayDate=value=>value?value.split('-').reverse().join('/'):'';
function parseDate(value){
 const match=value.trim().match(/^(\d{2})(\/?)(\d{2})\2(\d{4})$/);
 if(!match)return '';
 const [,day,,month,year]=match,iso=year+'-'+month+'-'+day;
 const date=new Date(iso+'T00:00:00Z');
 return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===iso?iso:'';
}
function readDate(input){
 const iso=parseDate(input.value);
 input.setCustomValidity(input.value&&!iso?'Escribe una fecha válida en formato DD/MM/AAAA.':'');
 if(iso)input.value=displayDate(iso);
 return iso;
}
window.SKProductionDates={displayDate,readDate};
document.querySelectorAll('input[name="fechaISO"]').forEach(input=>{
 input.oninput=()=>input.setCustomValidity('');
 input.onchange=()=>readDate(input);
});
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
  read.onsuccess=()=>{
   next=read.result||{};
   if(update)try{next=update(next);store.put(next,document)}
   catch(error){reject(error);tx.abort()}
  };
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
 return window.SKSpareCatalog.filter(catalog(),fields.tipoEquipo.value,inventoryOrigin);
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
const machinePicker=byId('machinePicker');
document.addEventListener('click',event=>{
 if(!machineOptions.hidden&&!machinePicker.contains(event.target))closeMachine();
},true);
function openParts(){
 partCards.hidden=false;
 paintParts();
}
setupPicker(partSearch,partCards,openParts,closeParts);
const partPicker=byId('partPicker');
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
const trailingParts=['tapon lubricador','lubricador','funda de revestimiento'];
function partOrder(part){
 const item=String(part.numero??'').trim();
 const special=trailingParts.indexOf(norm(part.nombre).trim().replace(/\s+/g,' '));
 if(special!==-1)return [2,special];
 if(/^\d+$/.test(item))return [0,Number(item)];
 return [1,0];
}
function compareParts(left,right){
 const [leftGroup,leftOrder]=partOrder(left),[rightGroup,rightOrder]=partOrder(right);
 return leftGroup-rightGroup||leftOrder-rightOrder||left.nombre.localeCompare(right.nombre,'es');
}
const catalog=()=>window.SKSpareCatalog.merge(state.parts||[],state.inventoryCriteria||[]).sort(compareParts);
const incomeMovements=()=>Array.from(new Map([...(state.incomes||[]),...(state.pending||[]).filter(row=>row.kind)].map(row=>[row.id,row])).values());
function countTotals(origin,date,parts){
 const closed=(state.inventoryLatest||[]).find(row=>row.origin===origin&&(!date||row.date<date));
 const prior=new Map(),aliases=new Map(),totals=new Map();
 for(const row of closed?.rows||[])for(const id of row.aliases||[row.partId])prior.set(id,row);
 for(const part of parts){
  const ids=[part.id,part.criterionId].filter(Boolean),previous=ids.map(id=>prior.get(id)).find(Boolean);
  const total={opening:previous?.physical??0,incomes:0,consumptions:0,cutoff:previous?closed.date:'',initialDate:''};
  totals.set(part.id,total);
  for(const id of ids)aliases.set(id,total);
 }
 const get=row=>row.origen===origin&&!row.deleted&&(!date||row.fechaISO<=date)&&aliases.get(row.partId);
 const incomes=incomeMovements();
 for(const row of incomes){
  const total=get(row);
  if(total&&!total.cutoff&&row.kind==='initial'){total.opening=row.cantidad;total.initialDate=row.fechaISO;}
 }
 const include=(row,total)=>total&&(total.cutoff?row.fechaISO>total.cutoff:!total.initialDate||row.fechaISO>=total.initialDate);
 for(const row of incomes){const total=get(row);if(row.kind==='income'&&include(row,total))total.incomes+=row.cantidad;}
 const movements=new Map([...(state.consumptions||[]),...(state.pending||[]).filter(row=>!row.kind)].map(row=>[row.id,row]));
 for(const row of movements.values()){const total=get(row);if(include(row,total))total.consumptions+=row.cantidad;}
 return totals;
}
let stockCacheState,stockCache=new Map();
function stockFor(part,origin){
 if(stockCacheState!==state){stockCacheState=state;stockCache=new Map();}
 if(!stockCache.has(origin))stockCache.set(origin,countTotals(origin,'',window.SKSpareCatalog.filter(catalog(),origin.replace(/\d+$/,''),origin)));
 const total=stockCache.get(origin).get(part.id);
 return total?total.opening+total.incomes-total.consumptions:0;
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
 const options=window.SKSpareCatalog.filter(rows,origin.replace(/\d+$/,''),origin);
 const part=options.find(row=>row.id===incomeFields.partId.value);
 if(!part)incomeFields.partId.value='';
 const picker=stockForm.querySelector('.partOptions');
 if(!picker.hidden)paintPartCards(picker,filterParts(options,part?'':incomeFields.search.value),origin,row=>{
  incomeFields.partId.value=row.id;
  incomeFields.search.value=partLabel(row);
  picker.hidden=true;
  paintStockView({form:stockForm,panel,kind});
 });
 const enabled=Array.isArray(state.incomes);
 const allowed=canSaveStock(kind,session?.user.role);
 panel.querySelector('[data-stock-balance]').textContent=!enabled?'El servidor debe actualizarse y sincronizarse antes de registrar movimientos.':part?'Existencia registrada: '+stockFor(part,origin):options.length?'Selecciona un repuesto para ver su existencia.':'Sin repuestos que coincidan.';
 stockForm.querySelector('button[type=submit]').disabled=saving||!enabled||!allowed||!part;
 if(kind==='initial')paintBalances(panel.querySelector('[data-stock-rows]'),options,origin,enabled);
}
function paintBalances(body,parts,origin,enabled){
 body.replaceChildren(...parts.map(part=>{
  const tr=document.createElement('tr');
  for(const value of [origin,part.numero||'—',part.nombre,enabled?stockFor(part,origin):'—']){
   const td=document.createElement('td');td.textContent=value;tr.append(td);
  }
  return tr;
 }));
}
function paintStockRows(body,kind,rows=catalog()){
 body.replaceChildren(...incomeMovements().filter(row=>row.kind===kind).reverse().map(row=>{
  const tr=document.createElement('tr'),item=rows.find(x=>x.id===row.partId);
  const values=[displayDate(row.fechaISO),item?.nombre||row.partId,row.kind==='initial'?'Saldo inicial':row.origen,row.cantidad];
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
 if(!partId.value||cantidad.value==='')return;
 const date=readDate(fechaISO);
 if(!date){fechaISO.reportValidity();return}
 const row={kind,origen:origen.value,partId:partId.value,fechaISO:date,cantidad:Number(cantidad.value)};
 if(!Number.isSafeInteger(row.cantidad)||row.cantidad<(row.kind==='initial'?0:1))return;
 saving=true;
 try{
  const record={...row,id:crypto.randomUUID(),createdAt:new Date().toISOString()};
  const fresh=await changeState(active.user.document,current=>{
   const pending=current.pending||[];
   const part=catalog().find(item=>item.id===row.partId);
   const existing=kind==='initial'&&[...pending,...(current.incomes||[])].find(item=>
    item.kind==='initial'&&item.origen===row.origen&&(item.partId===row.partId||item.partId===part?.criterionId));
   const movement=existing?{...existing,cantidad:row.cantidad,correctionId:record.id}:record;
   return {...current,pending:[...pending.filter(item=>item.id!==movement.id),movement]};
  });
  if(session===active){state=fresh;cantidad.value='';status(kind==='initial'?'Saldo inicial guardado.':'Ingreso guardado.');}
 }catch(error){if(session===active)status(error.message)}
 finally{saving=false;if(session===active)paint()}
 if(session===active&&navigator.onLine)await sync();
}
for(const view of stockViews){
 const {search,partId,origen}=view.form.elements;
 const picker=view.form.querySelector('.partOptions');
 const close=()=>{picker.hidden=true;if(!partId.value)search.value=''};
 const open=()=>{picker.hidden=false;paintStockView(view)};
 setupPicker(search,picker,()=>{
  if(partId.value)search.select();
  open();
 },close);
 search.oninput=()=>{partId.value='';open()};
 origen.onchange=()=>{partId.value='';close();paintStockView(view)};
 document.addEventListener('click',event=>{
  if(!picker.hidden&&!search.closest('.productionField').contains(event.target))close();
 },true);
 view.form.addEventListener('submit',event=>saveStock(event,view));
}
const partLabel=row=>[row.numero,row.nombre].filter(Boolean).join(' · ');
function paintPartCards(container,rows,origin,choose){
 container.replaceChildren(...rows.map(row=>{
  const button=document.createElement('button');
  button.type='button';
  button.textContent=partLabel(row)+(Array.isArray(state.incomes)?' · Existencia: '+stockFor(row,origin):'');
  button.onclick=()=>{if(!saving)choose(row)};
  return button;
 }));
 if(!rows.length)container.textContent='No hay repuestos que coincidan.';
}
function paintParts(){
 if(partCards.hidden)return;
 const origin=fields.tipoEquipo.value+inventoryOrigin;
 paintPartCards(partCards,filterParts(partOptions(),partSearch.value),origin,row=>{
  draft.push({partId:row.id,itemId:row.criterionId||'',noItem:row.numero||'',nombreRepuesto:row.nombre,cantidad:1,origen:origin,tipoEquipo:fields.tipoEquipo.value});
  partSearch.blur();
  closeParts();
  paintDraft();
 });
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
 paintCount();paintSync();
 if(!byId('productionQueries').hidden){
  if(!byId('incomeQueries').hidden)paintIncomeQueries();
  else window.dispatchEvent(new Event('skweb-consumption-changed'));
 }
}
function paintSync(){
 const count=(state.pending||[]).length+(state.countQueue||[]).length,badge=byId('pendingBadge'),button=byId('sync');
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
  'Sinc. '+date.toLocaleDateString('es-CO',{timeZone:'America/Bogota',day:'2-digit',month:'2-digit',year:'numeric'})+' '+date.toLocaleTimeString('es-CO',{timeZone:'America/Bogota',hour:'numeric',minute:'2-digit'});
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
   const inventoryRequest=(local.countQueue||[])[0];
   const data=await api('productionSync',{token:active.token,pending,inventoryRequest});
   const acknowledged=new Set(Array.isArray(data.ack)?data.ack:[]);
   const savedRows=new Map([...(data.incomes||[]),...(data.consumptions||[])].map(row=>[row.id,row]));
   const confirmed=row=>acknowledged.has(row.id)&&savedRows.has(row.id)&&savedRows.get(row.id).correctionId===row.correctionId;
   if(pending.some(row=>!confirmed(row))){
    throw new Error('La base central no confirmó todos los movimientos. Siguen pendientes para reintentar.');
   }
   const {inventoryResult,...snapshot}=data;
   const countError=inventoryRequest&&(inventoryResult?.error||(!inventoryResult?.count?'Actualiza Apps Script para sincronizar el inventario físico.':''));
   const fresh=await changeState(document,current=>{
    let countQueue=current.countQueue||[];
    if(inventoryRequest&&!countError){
     countQueue=countQueue.filter(row=>!(row.id===inventoryRequest.id&&row.revision===inventoryRequest.revision&&row.action===inventoryRequest.action))
      .map(row=>row.id===inventoryRequest.id?{...row,baseRevision:inventoryResult.count.revision}:row);
    }
    return {...snapshot,lastSyncAt:new Date().toISOString(),countQueue,countSyncError:countError||'',pending:(current.pending||[]).filter(row=>!confirmed(row))};
   });
   if(session===active){
    state=fresh;
    if(inventoryResult?.count?.status==='closed'&&countSelection===inventoryResult.count.id){
     countReport=inventoryResult.count;countSelection='';countValues=new Map();
    }
    if(countError)syncFailed=true;
    paint();
   }
   if(countError&&!fresh.pending.length)break;
  }while(session===active&&navigator.onLine&&(syncRequested||state.pending.length||state.countQueue.length));
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
function showConsumptionView(showQueries,stockView,physical=false){
 if(stockView?.kind==='initial'&&session?.user.role!=='admin')return;
 byId('physicalCount').hidden=!physical;
 byId('showPhysicalCount').setAttribute('aria-pressed',String(physical));
 byId('recordPanel').hidden=showQueries||Boolean(stockView)||physical;
 for(const view of stockViews){
  const selected=view===stockView;
  view.panel.hidden=!selected;
  view.button.setAttribute('aria-pressed',String(selected));
  if(selected)paintStockView(view);
 }
 byId('productionQueries').hidden=!showQueries;
 byId('showRecord').setAttribute('aria-pressed',String(!showQueries&&!stockView&&!physical));
 byId('showConsumptionQueries').setAttribute('aria-pressed',String(showQueries));
 if(physical)paintCount();
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
const countForm=byId('countForm'),countFields=countForm.elements;
const countHeaders=['FECHA DE INVENTARIO','INVENTARIO','REPUESTO','SALDO DE APERTURA','INGRESOS','CONSUMOS','SALDO ESPERADO','EXISTENCIA FÍSICA','DIFERENCIA','SALDO DE CIERRE'];
const countStatus=message=>{byId('countStatus').textContent=message};
let countSelection='',countValues=new Map(),countReport=null,countDirty=false,countAccount='';
const canCount=()=>['admin','assistant'].includes(session?.user.role);
function countRecords(){
 const records=new Map((state.inventoryCounts||[]).map(row=>[row.id,row]));
 for(const row of state.countQueue||[])if(['save','submit'].includes(row.action))
  records.set(row.id,{...row,owner:session?.user.document,status:'draft'});
 return [...records.values()];
}
const selectedCount=()=>countRecords().find(row=>row.id===countSelection);
function selectCount(id){
 countSelection=id;
 const selected=selectedCount();
 countValues=new Map((selected?.values||[]).map(row=>[row.partId,row.physical]));
 countDirty=false;
 if(selected){countFields.origin.value=selected.origin;countFields.date.value=displayDate(selected.date);}
 paintCount();
}
function countReportRows(report){
 return report.rows.map(row=>[displayDate(report.date),report.origin,row.name,row.opening,row.incomes,row.consumptions,row.expected,row.physical,row.difference,row.physical]);
}
function paintCount(){
 if(byId('physicalCount').hidden)return;
 const enabled=Array.isArray(state.inventoryCounts),records=countRecords(),selected=selectedCount();
 const queued=(state.countQueue||[]).find(row=>row.id===countSelection);
 const review=selected?.status==='submitted',admin=session?.user.role==='admin';
 const editable=enabled&&!countReport&&!review&&queued?.action!=='submit'&&(!selected||selected.owner===session?.user.document);
 countFields.record.replaceChildren(new Option('NUEVO CONTEO',''),...records.map(row=>new Option(
  [row.origin,displayDate(row.date),({draft:'BORRADOR',submitted:'PENDIENTE DE APROBACIÓN',returned:'DEVUELTO'})[row.status],row.countedBy].filter(Boolean).join(' · '),row.id)));
 countFields.record.value=countSelection;
 countFields.origin.disabled=Boolean(selected)||Boolean(countValues.size);
 countFields.date.disabled=Boolean(selected)||review;
 countForm.querySelector('[type=submit]').disabled=!editable;
 byId('submitCount').disabled=!editable;
 byId('approveCount').hidden=byId('returnCount').hidden=!(admin&&review);
 byId('approveCount').disabled=byId('returnCount').disabled=Boolean(queued);
 byId('discardCount').hidden=!queued||!state.countSyncError;
 if(!enabled)countStatus('Sincroniza después de actualizar Apps Script para habilitar el inventario físico.');
 else if(state.countSyncError)countStatus(state.countSyncError);
 else if(queued)countStatus('PENDIENTE DE SINCRONIZAR');
 else if(countReport){
  const late=[...(state.incomes||[]),...(state.consumptions||[])].some(row=>row.kind!=='initial'&&!row.deleted&&row.origen===countReport.origin&&row.fechaISO<=countReport.date&&row.createdAt>countReport.closedAt);
  countStatus('CIERRE APROBADO POR '+countReport.approvedBy+(late?' · Hay movimientos del período recibidos después del cierre. Revísalos en Consultas.':''));
 }
 else if(review)countStatus('PENDIENTE DE APROBACIÓN');
 else if(selected?.status==='returned')countStatus('DEVUELTO PARA CORRECCIÓN · '+selected.note);
 else if(selected)countStatus('BORRADOR SINCRONIZADO');
 else countStatus('Registra la cantidad física. Usa 0 si contaste el repuesto y no había unidades.');
 const table=byId('countTable'),origin=countFields.origin.value,date=readDate(countFields.date);
 const reportRows=countReport?countReportRows(countReport):null;
 const headers=reportRows?countHeaders:countHeaders.slice(2,9);
 const header=document.createElement('tr');
 for(const title of headers){const th=document.createElement('th');th.scope='col';th.textContent=title;header.append(th)}
 table.tHead.replaceChildren(header);
 const parts=window.SKSpareCatalog.filter(catalog(),origin.replace(/\d+$/,''),origin);
 const totals=reportRows?null:countTotals(origin,date,parts);
 const rows=reportRows||filterParts(parts,countFields.search.value).map(part=>{
  const total=totals.get(part.id),expected=total.opening+total.incomes-total.consumptions;
  const amount=countValues.get(part.id),input=document.createElement('input');
  input.type='number';input.min='0';input.step='1';input.inputMode='numeric';input.disabled=!editable;
  input.value=amount??'';input.setAttribute('aria-label','Existencia física de '+partLabel(part));
  const difference=document.createElement('span');
  difference.textContent=amount==null?'—':amount-expected;
  input.oninput=()=>{
   countValues.set(part.id,input.value===''?null:input.valueAsNumber);
   countDirty=true;
   difference.textContent=input.value===''||!input.validity.valid?'—':input.valueAsNumber-expected;
  };
  return [partLabel(part),total.opening,total.incomes,total.consumptions,expected,input,difference];
 });
 table.tBodies[0].replaceChildren(...rows.map(values=>{
  const tr=document.createElement('tr');
  for(const value of values){const td=document.createElement('td');if(value instanceof Node)td.append(value);else td.textContent=value;tr.append(td)}
  return tr;
 }));
 byId('countExcel').disabled=byId('countPdf').disabled=!countReport;
}
async function queueCount(action,note){
 const active=session,selected=selectedCount();
 if(!active||!canCount()||!Array.isArray(state.inventoryCounts)||countReport)return;
 const revision=crypto.randomUUID(),id=selected?.id||crypto.randomUUID();
 let request={id,action,revision:selected?.revision,note};
 if(action==='save'||action==='submit'){
  const date=readDate(countFields.date),origin=countFields.origin.value;
  if(!date||date>today()){countStatus('Ingresa una fecha de inventario válida, hasta hoy.');return}
  const values=[...countValues].filter(([,value])=>value!==null).map(([partId,physical])=>({partId,physical}));
  if(values.some(row=>!Number.isSafeInteger(row.physical)||row.physical<0)){countStatus('Registra cantidades enteras de cero en adelante.');return}
  if(action==='submit'&&window.SKSpareCatalog.filter(catalog(),origin.replace(/\d+$/,''),origin).some(part=>!values.some(row=>row.partId===part.id))){
   countStatus('Completa todos los repuestos antes de solicitar autorización.');return;
  }
  request={id,action,revision,origin,date,values,baseRevision:selected?.baseRevision??selected?.revision??''};
 }else if(!navigator.onLine){countStatus('Conéctate para aprobar o devolver el inventario.');return;}
 try{
  const fresh=await changeState(active.user.document,current=>({...current,countSyncError:'',countQueue:[...(current.countQueue||[]).filter(row=>row.id!==id),request]}));
  if(session!==active)return;
  state=fresh;countSelection=id;countDirty=false;paintCount();paintSync();
  if(navigator.onLine)await sync();
 }catch(error){if(session===active)countStatus(error.message)}
}
countForm.onsubmit=event=>{event.preventDefault();queueCount('save')};
byId('submitCount').onclick=()=>queueCount('submit');
byId('approveCount').onclick=()=>{if(confirm('¿Confirmar el cierre con las existencias físicas registradas?'))queueCount('approve')};
byId('returnCount').onclick=()=>{const note=prompt('OBSERVACIÓN PARA CORRECCIÓN');if(note?.trim())queueCount('return',note)};
byId('discardCount').onclick=async()=>{
 const active=session,id=countSelection;
 if(!active||!confirm('¿Descartar el cambio pendiente y recuperar la versión sincronizada?'))return;
 try{
  const fresh=await changeState(active.user.document,current=>({...current,countSyncError:'',countQueue:(current.countQueue||[]).filter(row=>row.id!==id)}));
  if(session===active){state=fresh;selectCount(id);paintSync();}
 }catch(error){if(session===active)countStatus(error.message)}
};
countFields.record.onchange=()=>{
 if(countDirty&&!confirm('Hay cambios sin guardar. ¿Cambiar de registro?')){countFields.record.value=countSelection;return;}
 countReport=null;selectCount(countFields.record.value);
};
for(const field of [countFields.origin,countFields.date])field.onchange=()=>{countReport=null;paintCount()};
countFields.search.oninput=()=>paintCount();
countFields.date.oninput=()=>countFields.date.setCustomValidity('');
async function loadCountHistory(id){
 const active=session;
 if(!active||!canSync())return;
 try{
  const result=await api('productionSync',{token:active.token,inventoryRequest:{action:'history',id}});
  if(session!==active)return;
  if(!result.inventoryResult||result.inventoryResult.error)throw new Error(result.inventoryResult?.error||'Actualiza Apps Script para consultar los cierres.');
  const {history,report}=result.inventoryResult,picker=byId('countHistory');
  picker.replaceChildren(new Option('Selecciona un cierre',''),...history.sort((a,b)=>b.date.localeCompare(a.date)).map(row=>new Option(row.origin+' · '+displayDate(row.date),row.id)));
  picker.disabled=false;picker.value=id||'';countReport=report;paintCount();
 }catch(error){if(session===active)countStatus(error.message)}
}
byId('newPhysicalCount').onclick=()=>{
 if(countDirty&&!confirm('Hay cambios sin guardar. ¿Iniciar un nuevo conteo?'))return;
 countReport=null;countFields.date.value=displayDate(today());countFields.search.value='';
 byId('countHistory').value='';selectCount('');
};
byId('loadCountHistory').onclick=()=>loadCountHistory();
byId('countHistory').onchange=()=>loadCountHistory(byId('countHistory').value);
byId('countExcel').onclick=()=>{if(countReport)window.SKDownloadTableExcel([countHeaders,...countReportRows(countReport)],'Inventario_'+countReport.origin+'_'+countReport.date+'.xlsx')};
byId('countPdf').onclick=()=>{
 if(!countReport)return;
 const report=window.open('','_blank');
 if(!report){countStatus('Permite las ventanas emergentes para guardar el PDF.');return}
 const doc=report.document;
 doc.title='Inventario '+countReport.origin+' '+countReport.date;
 const style=doc.createElement('style');
 style.textContent='@page{size:A4 landscape;margin:10mm}body{font:12px system-ui}table{width:100%;border-collapse:collapse}th,td{border:1px solid #777;padding:6px}th{background:#e7edf1}thead{display:table-header-group}tr{break-inside:avoid}';
 doc.head.append(style);
 const title=doc.createElement('h1');title.textContent='CIERRE DE INVENTARIO FÍSICO';
 const info=doc.createElement('p');info.textContent='CONTEO: '+countReport.countedBy+' · APROBACIÓN: '+countReport.approvedBy;
 const table=doc.createElement('table'),head=table.createTHead().insertRow(),body=table.createTBody();
 for(const text of countHeaders){const th=doc.createElement('th');th.textContent=text;head.append(th)}
 for(const row of countReportRows(countReport)){const tr=body.insertRow();for(const value of row)tr.insertCell().textContent=value}
 doc.body.append(title,info,table);report.focus();report.print();
};

byId('showPhysicalCount').onclick=()=>showConsumptionView(false,undefined,true);
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
 byId('showPhysicalCount').hidden=!canCount();
 if(countAccount!==session.user.document){
  countAccount=session.user.document;countSelection='';countValues=new Map();countReport=null;countDirty=false;
  countFields.date.value=displayDate(today());countFields.search.value='';
  byId('countHistory').replaceChildren(new Option('Selecciona un cierre',''));
  byId('countHistory').disabled=true;
 }
 placeInstallControls(document.querySelector('.productionToolbar'));
 byId('access').hidden=true;byId('productionHeader').hidden=false;byId('workspace').hidden=false;byId('productionSync').hidden=false;syncFailed=false;
 byId('operatorName').textContent=session.user.name;
 byId('operatorRole').textContent=roleLabels[session.user.role]||'Auxiliar';
 byId('showStockEdit').hidden=session.user.role!=='admin';
 for(const view of stockViews)view.form.elements.fechaISO.value=displayDate(today());
 fields.fechaISO.value=displayDate(today());manualShift=false;refreshShift();showConsumptionView(false);paint();if(navigator.onLine)await sync();
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
  const shared={turno:fields.turno.value,assetId:fields.assetId.value,responsableId:fields.responsableId.value,fechaISO:readDate(fields.fechaISO)};
  if(!shared.fechaISO){fields.fechaISO.reportValidity();return}
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
 if(countDirty)return status('Guarda el borrador de inventario antes de actualizar.');
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
