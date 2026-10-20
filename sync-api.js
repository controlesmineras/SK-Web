// Sincronización automática local-first. Una falla de red nunca impide registrar.
(()=>{
  const config=()=>window.SK_SYNC_CONFIG||{};let running=false,timer=0,activePromise=null,queued=false;
  const configured=()=>/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec(?:\?.*)?$/.test(config().apiUrl||'');
  const ui=state=>window.SKAdminSyncUI?.setState?.(state);const buttonText=value=>{const button=document.querySelector('#updateAppBtn');if(button){button.setAttribute('aria-label',value);button.title=value}};
  function buttonStart(){const b=document.querySelector('#updateAppBtn');if(!b||b.dataset.busy==='true')return null;b.disabled=true;b.dataset.autoSync='true';b.classList.add('isSyncing');buttonText('Sincronizando datos');return b}
  function buttonStop(b){if(!b||b.dataset.busy==='true')return;delete b.dataset.autoSync;b.disabled=false;b.classList.remove('isSyncing');buttonText('Sincronizar datos')}
  async function pendingSnapshot(){if(typeof repairPersonalIds==='function')await repairPersonalIds();const snapshot={schema:6,updatedAt:new Date().toISOString()};const rows=await Promise.all(stores.map(all));stores.forEach((store,index)=>{snapshot[store]=rows[index].filter(row=>row?.syncState==='pending')});return snapshot}
  async function markSnapshotSynced(snapshot){await Promise.all(stores.map(store=>new Promise((resolve,reject)=>{const rows=snapshot[store]||[];if(!rows.length)return resolve();const tx=db.transaction(store,'readwrite'),table=tx.objectStore(store);for(const row of rows){const read=table.get(row.id);read.onsuccess=()=>{const current=read.result;if(current?.syncState==='pending'&&current.updatedAt===row.updatedAt)table.put({...current,syncState:'synced'})}}tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('No se confirmó el registro local'))}))) }
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  function isTransient(error){const msg=String(error?.message||error||'').toLowerCase();return error?.name==='AbortError'||msg.includes('load failed')||msg.includes('failed to fetch')||msg.includes('network')||msg.includes('respondió 429')||msg.includes('respondió 5')}
  async function sendOnce(snapshot,attempt,forceFull=false){const c=config(),controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),attempt===1?18000:30000);try{const r=await fetch(c.apiUrl,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'sync',key:c.apiKey,token:window.SKAdminAuth?.token?.()||'',since:forceFull?'':(localStorage.getItem('skWebServerUpdatedAt')||''),data:snapshot}),signal:controller.signal,redirect:'follow',cache:'no-store',credentials:'omit'});if(!r.ok)throw new Error(`El servicio respondió ${r.status}`);let result;try{result=await r.json()}catch(_){throw new Error('El servicio devolvió una respuesta incompleta')}if(!result.ok)throw new Error(result.error||'El servicio rechazó la sincronización');return result}finally{clearTimeout(timeout)}}
  function sessionRejected(error){return /sesión.*venció|sesion.*vencio|inicia sesión/i.test(String(error?.message||''))}
  async function send(snapshot,forceFull=false,allowRenewal=true){
    let lastError;
    for(let attempt=1;attempt<=2;attempt++){
      const sentToken=window.SKAdminAuth?.token?.()||'';
      try{return await sendOnce(snapshot,attempt,forceFull)}catch(error){
        lastError=error;
        if(sessionRejected(error)&&attempt===1){
          // Cached login renews its token in the background. Use that result first.
          await window.SKAdminAuth?.waitForLoginRenewal?.();
          const currentToken=window.SKAdminAuth?.token?.()||'';
          if(currentToken&&currentToken!==sentToken)continue;
          if(allowRenewal&&await window.SKAdminAuth?.renewForSync?.())continue;
          throw new Error('Tu sesión necesita renovarse. Pulsa la nube para ingresar tu contraseña y sincronizar. Los pendientes se conservan.');
        }
        if(!isTransient(error)||attempt===2)break;
        await wait(1200);
      }
    }
    throw lastError;
  }
  async function finishSync(label,detail){
    const pending=await pendingSnapshot(),count=stores.reduce((total,store)=>total+pending[store].length,0),status=document.querySelector('#syncStatus');
    if(count){
      if(status)status.textContent=`Sincronización parcial · ${count} ${count===1?'registro pendiente':'registros pendientes'}; se conservan en este dispositivo.`;
      ui('idle');if(pending.personal?.length)schedule(300);return false;
    }
    if(status)status.textContent=`${label} · ${new Date().toLocaleString('es-CO')}`;
    ui('synced');window.dispatchEvent(new CustomEvent('skweb-synced',{detail:{source:'api',...detail}}));return true;
  }
  function confirmPersonal(snapshot,result){
    if(!snapshot.personal?.length)return;
    const central=result.data?.personal;
    if(!Array.isArray(central))throw new Error('La base central no confirmó los colaboradores. Se conservan pendientes en este dispositivo.');
    const missing=snapshot.personal.find(row=>!central.some(remote=>remote?.id&&remote.syncState!=='pending'&&(remote.id===row.id||(String(row.documento||'').trim()&&String(remote.documento||'').trim()===String(row.documento).trim()))));
    if(missing)throw new Error('La base central no confirmó al colaborador '+(missing.nombre||missing.documento||'registrado')+'. Se conserva pendiente; pulsa la nube para reintentar.');
  }
  async function performSync({silent=false,forceFull=false}={}){
    const b=buttonStart(),s=document.querySelector('#syncStatus');
    try{
      running=true;ui('syncing');if(s)s.textContent='Guardando cambios en la base central…';
      const snapshot=await pendingSnapshot(),hasPending=stores.some(store=>snapshot[store]?.length);
      // A full response confirms each person and returns the canonical ID if the
      // document already exists centrally. A generic ACK cannot prove that.
      forceFull=forceFull||Boolean(snapshot.personal?.length);
      let result=await send(snapshot,forceFull,!silent);
      const valid=result=>result&&(result.notModified||result.acknowledged||(result.data&&typeof result.data==='object'&&!Array.isArray(result.data)));
      if(!valid(result)||(result.notModified&&hasPending)){localStorage.removeItem('skWebServerUpdatedAt');result=await send(snapshot,true,!silent)}
      if(!valid(result))throw new Error('El servicio no devolvió la confirmación de sincronización');
      if(result.notModified&&hasPending)throw new Error('El servicio no confirmó los cambios pendientes');
      confirmPersonal(snapshot,result);
      const serverUpdatedAt=result.updatedAt||result.data?.updatedAt||'';
      if(result.notModified){
        if(serverUpdatedAt)localStorage.setItem('skWebServerUpdatedAt',serverUpdatedAt);
        return await finishSync('Sincronizado · sin cambios',{notModified:true});
      }
      if(result.acknowledged){
        await markSnapshotSynced(snapshot);await refresh();window.SKInventoryAdmin?.render?.();
        if(serverUpdatedAt)localStorage.setItem('skWebServerUpdatedAt',serverUpdatedAt);
        window.dispatchEvent(new Event('skweb-inventory-refresh'));
        return await finishSync('Sincronizado rápidamente',{acknowledged:true});
      }
      const merged=result.data,localAssetIds=new Set((await all('assets')).map(x=>x.id).filter(Boolean)),mergedAssetIds=new Set((merged.assets||[]).map(x=>x.id));
      for(const [store,rows] of Object.entries(merged))if(Array.isArray(rows))merged[store]=rows.map(row=>row?.syncState==='pending'?{...row,syncState:'synced'}:row);
      for(const id of localAssetIds)if(!mergedAssetIds.has(id))throw new Error('Protección local: un activo iba a perderse.');
      if(typeof window.writeSyncedSnapshot!=='function')throw new Error('No se cargó el conciliador local');
      await window.writeSyncedSnapshot(merged,snapshot);await seedParts();await refresh();window.SKInventoryAdmin?.render?.();
      if(serverUpdatedAt)localStorage.setItem('skWebServerUpdatedAt',serverUpdatedAt);
      window.dispatchEvent(new Event('skweb-inventory-refresh'));
      return await finishSync('Sincronizado automáticamente',{});
    }catch(e){
      console.error('SK Web automatic sync:',e);ui('error');
      if(s)s.textContent=navigator.onLine?'Sincronización pendiente · '+(e?.message||e):'Sin conexión · cambios seguros en este dispositivo';
      if(!silent)alert('Los datos están seguros en este dispositivo, pero aún no se sincronizaron: '+(e?.message||e));return false;
    }finally{running=false;buttonStop(b)}
  }
  function sync(options={}){
    if(!configured()||!navigator.onLine||!window.SKAdminAuth?.ready?.())return Promise.resolve(false);
    if(activePromise){queued=true;return activePromise}
    activePromise=performSync(options).finally(()=>{activePromise=null;if(queued){queued=false;schedule(300)}});return activePromise;
  }
  function schedule(delay=1500){if(!configured()||!window.SKAdminAuth?.ready?.())return;clearTimeout(timer);timer=setTimeout(()=>sync({silent:true}),delay)}
  window.skSyncApi={configured,sync,schedule};window.addEventListener('online',()=>schedule(1200));window.addEventListener('offline',()=>ui('error'));window.addEventListener('load',()=>{if(!configured())return;schedule(2500);setInterval(()=>schedule(0),Math.max(60000,Number(config().intervalMs)||300000));document.addEventListener('submit',()=>schedule(3500),true)});
})();
