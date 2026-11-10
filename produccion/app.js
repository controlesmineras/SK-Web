
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
let syncFailed=false,syncConnectionFailed=false;
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
 if(!navigator.onLine){const error=new Error('Sin conexión. Conéctate a internet e inténtalo de nuevo.');error.connectionFailure=true;throw error;}
 const controller=new AbortController();let timeout;
 const deadline=new Promise((_,reject)=>{timeout=setTimeout(()=>{
  const error=new Error('El servidor tardó más de 45 segundos. Tus registros siguen guardados para reintentar.');
  error.connectionFailure=true;reject(error);controller.abort();
 },45000)});
 try{
  const exchange=(async()=>{
   let response,result;
   try{
    response=await fetch(window.SK_SYNC_CONFIG.apiUrl,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action,...data}),signal:controller.signal,redirect:'follow',cache:'no-store',credentials:'omit'});
    if(response.ok)result=await response.json();
   }catch(cause){const error=new Error('No se pudo conectar con el servidor de Producción. Los registros pendientes se conservan.');error.connectionFailure=true;throw error;}
   if(!response.ok)throw new Error('Error de conexión ('+response.status+')');
   if(result?.ok!==true){const error=new Error(result?.error||'No se pudo completar la solicitud');error.centralResponse=true;throw error;}
   return result;
  })();
  return await Promise.race([exchange,deadline]);
 }finally{clearTimeout(timeout)}
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
 {form:stockEditForm,panel:byId('stockEditPanel'),button:byId('showStockEdit'),kind:'adjustment'}
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
const incomeMovements=(snapshot=state)=>{
 const rows=new Map((snapshot.incomes||[]).map(row=>[row.id,row]));
 for(const row of snapshot.pending||[])if(row.kind&&(row.kind!=='adjustment'||!rows.has(row.id)))rows.set(row.id,row);
 return Array.from(rows.values());
};
const initialFor=(part,origin,snapshot=state)=>incomeMovements(snapshot).reverse().find(row=>
 !row.deleted&&row.kind==='initial'&&row.origen===origin&&(row.partId===part.id||row.partId===part.criterionId));
function countTotals(origin,date,parts){
 const through=date||today();
 const closed=(state.inventoryLatest||[]).find(row=>row.origin===origin&&(!date||row.date<date));
 const prior=new Map(),aliases=new Map(),totals=new Map(),criterionAliases=new Map();
 for(const item of state.inventoryCriteria||[]){
  if(!item.productionPartId||window.SKSpareCatalog.equipment(item)!==origin.toLowerCase())continue;
  const ids=criterionAliases.get(item.productionPartId)||[];
  ids.push(item.id);criterionAliases.set(item.productionPartId,ids);
 }
 for(const row of closed?.rows||[])for(const id of row.aliases||[row.partId])prior.set(id,row);
 for(const part of parts){
  const ids=[part.id,part.criterionId,...(criterionAliases.get(part.id)||[])].filter(Boolean),previous=ids.map(id=>prior.get(id)).find(Boolean);
  const total={opening:previous?.physical??0,incomes:0,consumptions:0,cutoff:previous?closed.date:'',closedAt:previous?closed.closedAt:'',initialDate:''};
  totals.set(part.id,total);
  for(const id of ids)aliases.set(id,total);
 }
 const get=row=>row.origen===origin&&!row.deleted&&row.fechaISO<=through&&aliases.get(row.partId);
 const incomes=incomeMovements({...state,pending:(state.pending||[]).filter(row=>row.kind==='initial'&&!row.syncRejected)});
 for(const row of incomes){
  const total=get(row);
  if(total&&!total.cutoff&&row.kind==='initial'){total.opening=row.cantidad;total.initialDate=row.fechaISO;}
 }
 const include=(row,total)=>total&&(total.cutoff?(row.fechaISO>total.cutoff||row.fechaISO===total.cutoff&&(row.recordedAt||row.createdAt)>total.closedAt):!total.initialDate||row.fechaISO>=total.initialDate);
 for(const row of incomes){const total=get(row);if(include(row,total)){if(row.kind==='income'||row.kind==='adjustment'&&row.target!=null&&row.cantidad>=0)total.incomes+=row.cantidad;else if(row.kind==='adjustment'&&row.target!=null)total.consumptions-=row.cantidad;}}
 const movements=new Map((state.consumptions||[]).map(row=>[row.id,row]));
 for(const row of movements.values()){const total=get(row);if(include(row,total))total.consumptions+=row.cantidad;}
 const confirmedIds=new Set([...incomes,...movements.values()].map(row=>row.id));
 for(const row of state.pending||[]){
  const total=get(row);
  if(!include(row,total))continue;
  total.pending=true;
  if(row.kind==='initial'||confirmedIds.has(row.id)||row.syncRejected)continue;
  if(row.kind==='income')total.incomes+=row.cantidad;
  else if(row.kind==='adjustment'){
   const delta=row.cantidad-(total.opening+total.incomes-total.consumptions);
   if(delta>=0)total.incomes+=delta;else total.consumptions-=delta;
  }else if(!row.kind)total.consumptions+=row.cantidad;
 }
 return totals;
}
let stockCacheState,stockCache=new Map();
function stockBreakdown(part,origin){
 if(stockCacheState!==state){stockCacheState=state;stockCache=new Map();}
 if(!stockCache.has(origin))stockCache.set(origin,countTotals(origin,'',window.SKSpareCatalog.filter(catalog(),origin.replace(/\d+$/,''),origin)));
 return stockCache.get(origin).get(part.id);
}
function stockFor(part,origin){
 const total=stockBreakdown(part,origin);
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
 const partKey=origin+'|'+(part?.id||'');
 if(stockForm.dataset.stockPartKey&&stockForm.dataset.stockPartKey!==partKey){
  incomeFields.cantidad.value='';delete stockForm.dataset.pendingStockId;
  stockStatus(stockForm,'',false,false);
 }
 stockForm.dataset.stockPartKey=partKey;
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
 if(kind==='adjustment'&&part&&enabled){
  const initial=initialFor(part,origin),total=stockBreakdown(part,origin);
  const pending=initial&&(state.pending||[]).some(row=>row.id===initial.id);
  const detail=initial?' · Saldo inicial '+(pending?'pendiente de sincronizar':'guardado')+': '+initial.cantidad:' · Sin saldo inicial registrado';
  const opening=total.cutoff?' · Cierre del '+displayDate(total.cutoff)+': '+total.opening:'';
  const adjustment=(state.pending||[]).find(row=>row.kind==='adjustment'&&row.origen===origin&&(row.partId===part.id||row.partId===part.criterionId));
  panel.querySelector('[data-stock-balance]').textContent+=detail+opening+' · Entradas y ajustes positivos: '+total.incomes+' · Salidas y ajustes negativos: '+total.consumptions+(adjustment?' · AJUSTE PENDIENTE DE CONFIRMAR: '+adjustment.cantidad:'');
 }
 stockForm.querySelector('button[type=submit]').disabled=saving||!enabled||!allowed||!part;
 if(kind==='adjustment'){
  const pending=(state.pending||[]).find(row=>row.kind==='adjustment'&&row.origen===origin&&(row.partId===part?.id||row.partId===part?.criterionId));
  incomeFields.cantidad.disabled=Boolean(pending);
  byId('reviewStockAdjustment').hidden=!pending?.syncRejected;
  if(pending){
   stockForm.dataset.pendingStockId=pending.id;incomeFields.cantidad.value=pending.cantidad;
   stockForm.querySelector('button[type=submit]').disabled=true;
   stockStatus(stockForm,pending.syncError||'GUARDADO EN ESTE EQUIPO · PENDIENTE DE SINCRONIZAR.',Boolean(pending.syncError),false);
  }else if(stockForm.dataset.pendingStockId){
   const saved=(state.incomes||[]).find(row=>row.id===stockForm.dataset.pendingStockId);
   if(saved)stockStatus(stockForm,'EXISTENCIA CONFIRMADA EN LA BASE CENTRAL: '+saved.target+'.',false,false);
   delete stockForm.dataset.pendingStockId;
  }
  paintBalances(panel.querySelector('[data-stock-rows]'),options,origin,Array.isArray(state.incomes));
  panel.querySelector('[data-adjustment-rows]').replaceChildren(...(state.incomes||[]).filter(row=>row.kind==='adjustment'&&row.origen===origin).reverse().map(row=>{
   const tr=document.createElement('tr'),item=options.find(part=>part.id===row.partId||part.criterionId===row.partId);
   for(const value of [displayDate(row.fechaISO),item?partLabel(item):row.partId,row.before,row.target,row.cantidad,row.registradoPorNombre]){
    const td=document.createElement('td');td.textContent=value;tr.append(td);
   }
   return tr;
  }));
 }
}
function paintBalances(body,parts,origin,enabled){
 body.replaceChildren(...parts.map(part=>{
  const tr=document.createElement('tr');
  for(const value of [origin,part.numero||'—',part.nombre,enabled?stockFor(part,origin)+(stockBreakdown(part,origin)?.pending?' · PENDIENTE':''):'—']){
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
function stockStatus(stockForm,message,isError=false,global=true){
 const feedback=stockForm.querySelector('[data-stock-status]');
 feedback.textContent=message;feedback.hidden=!message;
 feedback.classList.toggle('stockError',isError);
 if(global)status(message);
}
async function saveStock(event,{form:stockForm,kind}){
 event.preventDefault();const active=session;
 if(!active||saving)return;
 const tell=(message,error=false)=>stockStatus(stockForm,message,error);
 if(!canSaveStock(kind,active.user.role)){tell('Tu cuenta no tiene permiso para guardar este movimiento.',true);return;}
 if(!Array.isArray(state.incomes)){tell('Sincroniza una vez para descargar el inventario antes de guardar.',true);return;}
 const {origen,partId,fechaISO,cantidad}=stockForm.elements;
 const part=catalog().find(row=>row.id===partId.value);
 if(!part){tell('Selecciona un repuesto de la lista.',true);return;}
 if(cantidad.value===''){tell('Escribe la cantidad que deseas guardar.',true);return;}
 const date=kind==='adjustment'?today():readDate(fechaISO),quantity=Number(cantidad.value);
 if(!date){fechaISO.reportValidity();return;}
 if(!Number.isSafeInteger(quantity)||quantity<(kind==='adjustment'?0:1)){tell('Escribe una cantidad entera válida.',true);return;}
 const record={kind,origen:origen.value,partId:partId.value,fechaISO:date,cantidad:quantity,id:crypto.randomUUID(),createdAt:new Date().toISOString(),syncState:'pending'};
 if(kind==='adjustment')record.baseQuantity=stockFor(part,record.origen);
 saving=true;
 try{
  const fresh=await changeState(active.user.document,current=>{
   if(kind==='adjustment'&&(current.pending||[]).some(row=>row.kind===kind&&row.origen===record.origen&&(row.partId===part.id||row.partId===part.criterionId)))throw new Error('Este repuesto ya tiene un ajuste pendiente. Revisa su estado antes de guardar otro.');
   return {...current,pending:[...(current.pending||[]),record]};
  });
  if(session!==active)return;
  state=fresh;if(kind!=='adjustment')cantidad.value='';
  tell('GUARDADO EN ESTE EQUIPO · PENDIENTE DE SINCRONIZAR.');
  scheduleSync(300);
 }catch(error){if(session===active)tell(error.message,true);}
 finally{saving=false;if(session===active)paint();}
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
byId('reviewStockAdjustment').onclick=async()=>{
 const active=session,fields=stockEditForm.elements;
 if(!active||active.user.role!=='admin'||saving)return;
 const part=catalog().find(row=>row.id===fields.partId.value);
 const pending=(state.pending||[]).find(row=>row.kind==='adjustment'&&(row.partId===part?.id||row.partId===part?.criterionId)&&row.origen===fields.origen.value&&row.syncRejected);
 if(!pending||!confirm('Este ajuste fue rechazado por la base central. ¿Retirarlo de este equipo para revisar y guardar una nueva cantidad?'))return;
 try{
  if(sync.promise)await sync.promise;
  if(session!==active)return;
  const fresh=await changeState(active.user.document,current=>{
   const found=(current.pending||[]).find(row=>row.id===pending.id);
   if(!found?.syncRejected||!window.SKProductionSync.samePendingRow(found,pending))throw new Error('El ajuste cambió. Revisa la lista actualizada.');
   return {...current,pending:current.pending.filter(row=>row.id!==pending.id)};
  });
  if(session===active){state=fresh;delete stockEditForm.dataset.pendingStockId;paint();fields.cantidad.value=pending.cantidad;stockStatus(stockEditForm,'Revisa la existencia sincronizada y pulsa GUARDAR para registrar la cantidad corregida.');}
 }catch(error){if(session===active)stockStatus(stockEditForm,error.message,true);}
};
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
 byId('refreshOfflineData').disabled=syncing;
 paintOfflineEntry();
}
let syncRequested=false,syncTimer=0,retryAfter=0,lastSyncAttempt=0;
function scheduleSync(delay=1500){
 clearTimeout(syncTimer);
 if(!session||!navigator.onLine||!canSync())return;
 syncTimer=setTimeout(()=>sync(),Math.max(delay,retryAfter-Date.now()));
}
async function sync(){
 if(sync.promise){
  const active=session,owner=sync.owner;syncRequested=true;
  const result=await sync.promise;
  return session===active&&active&&owner!==active?sync():result;
 }
 clearTimeout(syncTimer);
 const active=session,task=performSync();sync.promise=task;sync.owner=active;
 try{return await task;}
 finally{
  if(sync.promise===task)sync.promise=null;
  if(session===active&&session&&(syncFailed||syncRequested)){
   retryAfter=syncFailed?Date.now()+60000:0;
   if((state.pending||[]).some(row=>!row.syncRejected)||(state.countQueue||[]).length||syncRequested)scheduleSync(300);
  }else retryAfter=0;
 }
}
async function performSync(){
 if(!session)return {ok:false,error:'Inicia sesión para sincronizar.'};
 if(!navigator.onLine){syncFailed=true;syncConnectionFailed=true;paintSync();return {ok:false,error:'Sin conexión. Los registros siguen guardados.'};}
 if(!canSync()){syncFailed=true;paintSync();const error='Inicia sesión con internet para renovar la sincronización. Tus registros siguen guardados.';status(error);return {ok:false,error};}
 const active=session,document=active.user.document;let syncError='',countAttempted=false,again;
 syncing=true;syncFailed=false;syncConnectionFailed=false;lastSyncAttempt=Date.now();paintSync();
 try{
  do{
   syncRequested=false;
   const local=await changeState(document),pending=window.SKProductionSync.selectPending(local);
   const inventoryRequest=countAttempted?undefined:(local.countQueue||[])[0];countAttempted=Boolean(inventoryRequest)||countAttempted;
   // Un servidor antiguo ignora checkedPending: nunca aplica un ajuste sin validar el saldo.
   const movements=pending.some(row=>row.kind==='adjustment')?{pending:[],checkedPending:pending}:{pending};
   const result=await api('productionSync',{token:active.token,syncProtocol:window.SKProductionSync.protocol,...movements,inventoryRequest});
   const fresh=await changeState(document,current=>window.SKProductionSync.reconcile(result,pending,current,inventoryRequest));
   if(session===active){
    state=fresh;
    if(result.inventoryResult?.count?.status==='closed'&&countSelection===result.inventoryResult.count.id){countReport=result.inventoryResult.count;countSelection='';countValues=new Map();}
    if(!countDirty&&!countSaving&&countSelection){const selected=selectedCount();countValues=new Map((selected?.values||[]).map(row=>[row.partId,row.physical]));countEditRevision=selected?.revision||'';if(!selected)countSelection='';}
    syncFailed=Boolean(fresh.pending.length||fresh.countQueue.length);
    syncError=fresh.pending.find(row=>row.syncError)?.syncError||fresh.countSyncError||'';
    status(syncFailed?'Sincronización parcial · '+(fresh.pending.length+fresh.countQueue.length)+' pendiente(s). '+syncError:'SINCRONIZADO · todos los registros confirmados.');
    paint();
   }
   const sentIds=new Set(pending.map(row=>row.id));
   again=syncRequested||window.SKProductionSync.selectPending(fresh).some(row=>!sentIds.has(row.id));
  }while(session===active&&navigator.onLine&&again);
 }catch(error){
  syncError=error.message;
  if(error.centralResponse&&/revocada|sesión no válida|inicia sesión/i.test(error.message)){
   deviceAccess.revokeToken(active.token);
   if(session===active){byId('logout').click();byId('accessStatus').textContent=error.message+'. Los registros pendientes siguen guardados.';}
  }
  if(session===active){syncFailed=true;syncConnectionFailed=error.connectionFailure===true;status(error.message);}
  console.error('Sincronización de Producción:',error);
 }finally{syncing=false;paintSync();}
 return {ok:!syncFailed,error:syncError};
}
function resumeSync(){
 if(!document.hidden&&!sync.promise&&Date.now()-lastSyncAttempt>=30000)scheduleSync(300);
}
window.addEventListener('online',()=>scheduleSync(300));
window.addEventListener('focus',resumeSync);window.addEventListener('pageshow',resumeSync);
document.addEventListener('visibilitychange',resumeSync);
setInterval(()=>{if(!document.hidden&&!sync.promise)scheduleSync(0);},300000);
function showConsumptionView(showQueries,stockView,physical=false){
 if(countSaving)return;
 if(!physical&&!byId('physicalCount').hidden&&countDirty&&!confirm('El conteo tiene cambios sin guardar. ¿Salir del inventario físico?'))return;
 if(stockView?.kind==='adjustment'&&session?.user.role!=='admin')return;
 byId('physicalCount').hidden=!physical;
 byId('showPhysicalCount').setAttribute('aria-pressed',String(physical));
 byId('recordPanel').hidden=showQueries||Boolean(stockView)||physical;
 for(const view of stockViews){
  const selected=view===stockView;
  view.panel.hidden=!selected;
  view.button.setAttribute('aria-pressed',String(selected));
  if(selected){if(view.kind==='adjustment')view.form.elements.fechaISO.value=displayDate(today());paintStockView(view);}
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
let countSelection='',countValues=new Map(),countReport=null,countDirty=false,countAccount='',countSaving=false,countEditRevision='';
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
 countDirty=false;countEditRevision=selected?.revision||'';
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
 const editable=enabled&&!countSaving&&!countReport&&!review&&queued?.action!=='submit'&&(!selected||selected.owner===session?.user.document);
 countFields.record.replaceChildren(new Option('NUEVO CONTEO',''),...records.map(row=>new Option(
  [row.origin,displayDate(row.date),({draft:'BORRADOR',submitted:'PENDIENTE DE APROBACIÓN',returned:'DEVUELTO'})[row.status],row.countedBy].filter(Boolean).join(' · '),row.id)));
 countFields.record.value=countSelection;
 countFields.record.disabled=countSaving;
 countFields.origin.disabled=countSaving||Boolean(selected)||Boolean(countValues.size);
 countFields.date.disabled=countSaving||Boolean(selected)||Boolean(countValues.size)||review;
 countForm.querySelector('[type=submit]').disabled=!editable;
 byId('submitCount').disabled=!editable;
 byId('approveCount').hidden=byId('returnCount').hidden=!(admin&&review);
 byId('approveCount').disabled=byId('returnCount').disabled=Boolean(queued);
 byId('discardCount').hidden=!queued||!state.countSyncError;
 if(!enabled)countStatus('Sincroniza después de actualizar Apps Script para habilitar el inventario físico.');
 else if(state.countSyncError)countStatus(state.countSyncError);
 else if(countSaving)countStatus('GUARDANDO BORRADOR EN ESTE DISPOSITIVO…');
 else if(countDirty)countStatus('CAMBIOS SIN GUARDAR · Pulsa GUARDAR BORRADOR.');
 else if(queued)countStatus('PENDIENTE DE SINCRONIZAR');
 else if(countReport){
  const late=[...(state.incomes||[]),...(state.consumptions||[])].some(row=>!['initial','adjustment'].includes(row.kind)&&!row.deleted&&row.origen===countReport.origin&&row.fechaISO<=countReport.date&&row.createdAt>countReport.closedAt&&(row.fechaISO<countReport.date||(row.recordedAt||row.createdAt)<=countReport.closedAt));
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
   countFields.origin.disabled=true;countFields.date.disabled=true;
   countStatus('CAMBIOS SIN GUARDAR · Pulsa GUARDAR BORRADOR.');
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
 if(!active||countSaving||!canCount()||!Array.isArray(state.inventoryCounts)||countReport)return;
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
 if(countDirty&&selected&&countEditRevision!==selected.revision){countStatus('El conteo cambió durante la sincronización. Guarda tus cantidades aparte y vuelve a seleccionar el registro antes de editarlo.');return;}
 countSaving=true;paintCount();
 try{
  const fresh=await changeState(active.user.document,current=>({...current,countSyncError:'',countQueue:[...(current.countQueue||[]).filter(row=>row.id!==id),request]}));
  if(session!==active)return;
  state=fresh;countSelection=id;countDirty=false;countEditRevision=revision;paintSync();
 }catch(error){if(session===active){state={...state,countSyncError:error.message};countStatus(error.message)}}
 finally{countSaving=false;if(session===active)paintCount()}
 if(session===active)scheduleSync(300);
}
countForm.onsubmit=event=>{event.preventDefault();queueCount('save')};
byId('submitCount').onclick=()=>queueCount('submit');
byId('approveCount').onclick=()=>{if(confirm('¿Confirmar el cierre con las existencias físicas registradas?'))queueCount('approve')};
byId('returnCount').onclick=()=>{const note=prompt('OBSERVACIÓN PARA CORRECCIÓN');if(note?.trim())queueCount('return',note)};
byId('discardCount').onclick=async()=>{
 const active=session,id=countSelection;
 if(countSaving||!active||!confirm('¿Descartar el cambio pendiente y recuperar la versión sincronizada?'))return;
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
 if(countSaving)return;
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
 if(countSaving)return;
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
 const note=doc.createElement('p');note.textContent='INGRESOS incluye ajustes positivos. CONSUMOS incluye ajustes negativos del administrador.';
 doc.body.append(title,info,note,table);report.focus();report.print();
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
async function openWorkspace({offlineAccess=!navigator.onLine}={}){
 if(!session)return;
 const active=session;
 const stored=await changeState(active.user.document);
 if(session!==active)return;
 state=stored;
 byId('showPhysicalCount').hidden=!canCount();
 if(countAccount!==session.user.document){
  countAccount=session.user.document;countSelection='';countValues=new Map();countReport=null;countDirty=false;
  countFields.date.value=displayDate(today());countFields.search.value='';
  byId('countHistory').replaceChildren(new Option('Selecciona un cierre',''));
  byId('countHistory').disabled=true;
 }
 placeInstallControls(document.querySelector('.productionToolbar'));
 byId('access').hidden=true;byId('productionHeader').hidden=false;byId('workspace').hidden=offlineAccess;byId('productionSync').hidden=offlineAccess;byId('offlineEntry').hidden=true;syncFailed=false;
 byId('operatorName').textContent=session.user.name;
 byId('operatorRole').textContent=roleLabels[session.user.role]||'Auxiliar';
 byId('showStockEdit').hidden=session.user.role!=='admin';
 for(const view of stockViews)view.form.elements.fechaISO.value=displayDate(today());
 fields.fechaISO.value=displayDate(today());manualShift=false;refreshShift();showConsumptionView(false);paint();
 if(offlineAccess)showOfflineEntry();
 else if(navigator.onLine){
  await sync();
  if(session===active&&syncConnectionFailed)showOfflineEntry();
 }
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
  if(session===active){state=fresh;draft=[];manualShift=false;refreshShift();closeParts();paint();status('CONSUMOS GUARDADOS EN ESTE EQUIPO · PENDIENTES DE SINCRONIZAR.');scheduleSync(300);}
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
 let nextSession,offlineAccess=false;
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
  offlineAccess=true;
  if(!nextSession)throw new Error(navigator.onLine?error.message:'Acceso local no disponible. Verifica la contraseña o inicia sesión con internet en este dispositivo.');
 }
 session=nextSession;
 localStorage.setItem(sessionKey,JSON.stringify(session));
 await openWorkspace({offlineAccess});byId('login').reset();
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
 if(countSaving)return;
 if(countDirty&&!confirm('El conteo tiene cambios sin guardar. ¿Cerrar la sesión?'))return;
 countAccount='';countSelection='';countValues=new Map();countReport=null;countDirty=false;countEditRevision='';
 fields.responsableId.value='';personSearch.value='';responsibleOptions.hidden=true;
 placeInstallControls(byId('installBeforeLogin'));
 session=null;state={};draft=[];fields.assetId.value='';closeParts();closeMachine();localStorage.removeItem(sessionKey);
 byId('offlineEntry').hidden=true;byId('workspace').hidden=true;byId('productionHeader').hidden=true;byId('productionSync').hidden=true;byId('access').hidden=false;status('Sesión cerrada.');
};
window.addEventListener('beforeunload',event=>{if(countDirty||countSaving){event.preventDefault();event.returnValue='';}});
byId('sync').onclick=()=>{retryAfter=0;sync();};
for(const radio of fields.tipoEquipo)radio.onchange=()=>{
 byId('machineSearch').value='';
 paint();
};
partSearch.oninput=openParts;personSearch.oninput=()=>{fields.responsableId.value='';paintPeople()};
function syncAge(lastSyncAt,now=Date.now()){
 const stamp=Date.parse(lastSyncAt);
 if(!Number.isFinite(stamp))return 'SIN SINCRONIZACIONES GUARDADAS';
 const elapsed=now-stamp;
 if(elapsed < -60000)return 'REVISA LA FECHA Y HORA DEL DISPOSITIVO';
 const minutes=Math.max(0,Math.floor(elapsed/60000));
 if(minutes<1)return 'Hace menos de un minuto';
 if(minutes<60)return 'Hace '+minutes+(minutes===1?' minuto':' minutos');
 const hours=Math.floor(minutes/60);
 if(hours<24)return 'Hace '+hours+(hours===1?' hora':' horas');
 const days=Math.floor(hours/24),remaining=hours%24;
 return 'Hace '+days+(days===1?' día':' días')+(remaining?' y '+remaining+(remaining===1?' hora':' horas'):'');
}
function paintOfflineEntry(){
 if(byId('offlineEntry').hidden)return;
 const stamp=Date.parse(state.lastSyncAt),date=new Date(stamp),valid=Number.isFinite(stamp);
 byId('offlineLastSync').textContent=valid?date.toLocaleString('es-CO',{timeZone:'America/Bogota',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'AÚN NO SE HA SINCRONIZADO';
 byId('offlineDataAge').textContent=syncAge(state.lastSyncAt);
 byId('offlineSyncAdvice').textContent=valid?
  'Cuando tengas internet, inicia sesión con conexión y sincroniza para obtener datos recientes y enviar tus registros pendientes.':
  'La cuenta tiene acceso local, pero aún falta descargar los datos. Conéctate e inicia sesión para completar la primera sincronización.';
}
function showOfflineEntry(){
 if(!session)return;
 byId('workspace').hidden=true;byId('productionSync').hidden=true;
 byId('status').textContent='';
 byId('offlineEntry').hidden=false;byId('offlineEntryStatus').textContent='';
 paintOfflineEntry();byId('offlineEntryTitle').focus();
}
byId('continueOffline').onclick=()=>{
 if(!session)return;
 byId('offlineEntry').hidden=true;byId('workspace').hidden=false;byId('productionSync').hidden=false;
 paint();byId('showRecord').focus();
};
byId('refreshOfflineData').onclick=async event=>{
 const active=session,button=event.currentTarget,feedback=byId('offlineEntryStatus');
 if(!active)return;
 if(syncing){feedback.textContent='Actualizando los datos…';return;}
 if(!navigator.onLine){feedback.textContent='Todavía no hay conexión. Puedes continuar con los datos guardados.';paintOfflineEntry();return;}
 if(!canSync()){
  byId('logout').click();
  byId('login').elements.document.value=active.user.document;
  byId('accessStatus').textContent='Inicia sesión con conexión para renovar el acceso y obtener datos recientes.';
  byId('login').elements.password.focus();return;
 }
 button.disabled=true;feedback.textContent='Actualizando los datos…';
 try{
  await sync();
  if(session!==active)return;
  if(syncFailed){feedback.textContent=byId('status').textContent||'No se pudo actualizar. Puedes continuar con los datos guardados.';paintOfflineEntry();}
  else byId('continueOffline').click();
 }finally{button.disabled=false}
};
window.addEventListener('focus',paintOfflineEntry);
window.addEventListener('online',paintOfflineEntry);
setInterval(paintOfflineEntry,60000);
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
 if(saving||syncing||countSaving)return status('Espera a que termine el guardado o la sincronización.');
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
  if(saving||syncing||draft.length||countDirty||countSaving){
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
