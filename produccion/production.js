const $=selector=>document.querySelector(selector);
const fd=form=>Object.fromEntries(new FormData(form));
const option=(select,id,label)=>select.add(new Option(label,id));
const assetLabel=asset=>[asset.clase,asset.marcaActual||asset.marcaInterna,asset.serial].filter(Boolean).join(' · ');
let db,session,activeSync,loading;
const tables=['personal','assets','parts','inventoryCriteria','consumptions','deliveries'];
const mark=()=>{
  const time=new Date().toISOString();
  return {id:crypto.randomUUID(),createdAt:time,updatedAt:time,syncState:'pending',createdBy:session.personId};
};
function openDB(personId){
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('sk-production-'+personId,1);
    request.onupgradeneeded=()=>tables.forEach(name=>request.result.createObjectStore(name,{keyPath:'id'}));
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}
function all(name){
  return new Promise((resolve,reject)=>{
    const request=db.transaction(name).objectStore(name).getAll();
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}
async function request(action,body){
  const response=await fetch(window.SK_SYNC_CONFIG.apiUrl,{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},
    body:JSON.stringify({action,...body}),signal:AbortSignal.timeout(45000)});
  const result=await response.json();
  if(!result.ok)throw new Error(result.error||'Solicitud rechazada.');
  return result;
}
function displayList(selector,rows,label){
  $(selector).replaceChildren(...rows.map(row=>{
    const item=document.createElement('li');
    item.textContent=label(row);
    return item;
  }));
}
async function renderHistory(){
  const rows=await all('consumptions');
  displayList('#history',rows.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)),row=>
    [row.fechaLocal,row.origen,row.noItem,row.nombreRepuesto,'× '+row.cantidad,row.syncState==='pending'?'Pendiente':''].filter(Boolean).join(' · '));
  $('#sync').textContent='Sincronizar ('+rows.filter(row=>row.syncState==='pending').length+' pendientes)';
  const deliveries=(await all('deliveries')).filter(row=>!row.deleted&&!row.reversalOf);
  displayList('#deliveries',deliveries.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))),row=>
    [row.createdAt?.slice(0,10),row.itemName,'× '+row.quantity,row.reversed?'Reversada':''].filter(Boolean).join(' · '));
}
function saveSnapshot(data){
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(tables,'readwrite');
    tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);
    for(const name of tables){
      const table=tx.objectStore(name);
      if(name!=='consumptions')table.clear();
      for(const row of data[name]||[])table.put(row);
    }
  });
}
function sync(){
  if(!session||!db||activeSync)return activeSync;
  $('#sync').disabled=true;
  $('#status').textContent='Sincronizando…';
  activeSync=(async()=>{
    try{
      const pending=(await all('consumptions')).filter(row=>row.syncState==='pending');
      for(let offset=0;offset<Math.max(1,pending.length);offset+=1000){
        const {data}=await request('productionSync',{token:session.token,consumptions:pending.slice(offset,offset+1000)});
        await saveSnapshot(data);
      }
      window.dispatchEvent(new Event('skweb-synced'));
      await window.refreshConsumptionMachines();
      await renderHistory();
      $('#status').textContent='Datos sincronizados.';
      $('#consumptionSaveStatus').hidden=true;
    }catch(error){$('#status').textContent=error.message||'Sin conexión. Los registros locales se conservan.'}
    finally{activeSync=null;$('#sync').disabled=false}
  })();
  return activeSync;
}
async function enter(next){
  db=await openDB(next.personId);
  session=next;
  localStorage.setItem('sk-production-session',JSON.stringify(next));
  $('#login').hidden=true;$('#productionWorkspace').hidden=false;
  window.dispatchEvent(new Event('skweb-db-ready'));
  await renderHistory();
  if(navigator.onLine)void sync();
}
window.addEventListener('load',async()=>{
  const invite=new URLSearchParams(location.search).get('invite');
  if(invite){
    $('#login button').textContent='Crear contraseña';
    $('#login [name=password]').minLength=8;
    $('#login [name=password]').autocomplete='new-password';
    $('#status').textContent='Escribe tu documento y crea una contraseña de al menos 8 caracteres.';
  }else{
    const saved=JSON.parse(localStorage.getItem('sk-production-session')||'null');
    if(saved)await enter(saved);
  }
  $('#login').onsubmit=async event=>{
    event.preventDefault();
    if(loading)return;
    loading=true;$('#login button').disabled=true;
    const credentials=fd(event.currentTarget);
    try{
      if(invite&&new URLSearchParams(location.search).has('invite')){
        await request('accessInvitationAccept',{...credentials,scope:'production',invitation:invite});
        history.replaceState(null,'',location.pathname);
      }
      await enter(await request('productionLogin',credentials));
      $('#login').reset();
    }catch(error){$('#status').textContent=error.message}
    finally{loading=false;$('#login button').disabled=false}
  };
  $('#sync').onclick=sync;
  $('#logout').onclick=async()=>{
    $('#logout').disabled=true;
    await activeSync;
    localStorage.removeItem('sk-production-session');
    location.reload();
  };
  window.addEventListener('online',sync);
  window.addEventListener('skweb-consumption-changed',()=>{void renderHistory();if(navigator.onLine)void sync()});
  navigator.serviceWorker?.register('sw.js').catch(console.error);
});
