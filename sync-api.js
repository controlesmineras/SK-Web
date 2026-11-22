// Sincronización automática local-first. Una falla de red nunca impide registrar.
(()=>{
  const config=()=>window.SK_SYNC_CONFIG||{};let running=false,timer=0,activePromise=null,queued=false,collaboratorRevisionApi='',retryAfter=0,discarding=false;
  const configured=()=>/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec(?:\?.*)?$/.test(config().apiUrl||'');
  const ui=state=>window.SKAdminSyncUI?.setState?.(state);const buttonText=value=>{const button=document.querySelector('#updateAppBtn');if(button){button.setAttribute('aria-label',value);button.title=value}};
  function buttonStart(){const b=document.querySelector('#updateAppBtn');if(!b||b.dataset.busy==='true')return null;b.disabled=true;b.dataset.autoSync='true';b.classList.add('isSyncing');buttonText('Sincronizando datos');return b}
  function buttonStop(b){if(!b||b.dataset.busy==='true')return;delete b.dataset.autoSync;b.disabled=false;b.classList.remove('isSyncing');buttonText('Sincronizar datos')}
  async function pendingSnapshot(){if(typeof repairPersonalIds==='function')await repairPersonalIds();const snapshot={schema:6,updatedAt:new Date().toISOString()};const rows=await Promise.all(stores.map(typeof storedRows==='function'?storedRows:all));stores.forEach((store,index)=>{snapshot[store]=rows[index].filter(row=>row?.syncState==='pending')});return snapshot}
  const pendingStores=typeof localStores==='undefined'?stores:localStores;
  const readAdjustments=()=>typeof quantityAdjustments==='undefined'?Promise.resolve([]):all(quantityAdjustments);
  async function pendingRecords(){
    if(!window.SKAdminAuth?.ready?.())throw new Error('Ingresa a SK Web Admin para consultar los pendientes.');
    if(typeof db==='undefined'||!db)throw new Error('El almacenamiento local todavía está iniciando. Intenta nuevamente.');
    const rows=await Promise.all(pendingStores.map(typeof storedRows==='function'?storedRows:all));
    return pendingStores.flatMap((store,index)=>rows[index].filter(row=>row?.syncState==='pending').map(row=>({store,row})));
  }
  async function discardPending(store,row){
    if(!window.SKAdminAuth?.ready?.())throw new Error('Ingresa a SK Web Admin para descartar un pendiente.');
    if(!pendingStores.includes(store)||!row||row.syncState!=='pending')throw new Error('Selecciona un registro pendiente válido.');
    if(discarding)throw new Error('Ya se está descartando un registro. Espera un momento.');
    discarding=true;clearTimeout(timer);queued=false;
    try{
      // Let the current response finish before removing anything it may confirm.
      // Block new sends until the local transaction has completed.
      if(activePromise)await activePromise;
      if(!window.SKAdminAuth?.ready?.())throw new Error('Tu sesión cambió. Vuelve a ingresar para revisar los pendientes.');
      await new Promise((resolve,reject)=>{
        const related=store==='assets'||assetEventStores.includes(store),tx=db.transaction(related?[store,assetProfileStore]:store,'readwrite'),table=tx.objectStore(store),read=table.get(row.id);let failure;
        read.onsuccess=()=>{
          const current=read.result;
          if(current?.syncState!=='pending'||JSON.stringify(current)!==JSON.stringify(row)){
            failure=new Error('El registro cambió o ya se sincronizó. Revisa la lista actualizada antes de descartarlo.');tx.abort();return;
          }
          // Local discard only: never send a deletion to the central database.
          if(related)tx.objectStore(assetProfileStore).clear();
          table.delete(row.id);
        };
        tx.oncomplete=resolve;tx.onerror=()=>reject(failure||tx.error);tx.onabort=()=>reject(failure||tx.error||new Error('No se pudo descartar el registro.'));
      });
      // Fetch the central version again if this was an edit of an existing row.
      collaboratorRevisionApi='';localStorage.removeItem('skWebServerUpdatedAt');retryAfter=0;
      phase('Registro pendiente descartado · falta comprobar la sincronización con la base central.');ui('error');
      window.dispatchEvent(new Event('skweb-local-change'));
      return true;
    }finally{discarding=false;schedule(300)}
  }
  async function markSnapshotSynced(snapshot){await Promise.all(stores.map(store=>new Promise((resolve,reject)=>{const rows=snapshot[store]||[];if(!rows.length)return resolve();const tx=db.transaction(store,'readwrite'),table=tx.objectStore(store);for(const row of rows){const read=table.get(row.id);read.onsuccess=()=>{const current=read.result;if(current?.syncState==='pending'&&JSON.stringify(current)===JSON.stringify(row))table.put({...current,syncState:'synced'})}}tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('No se confirmó el registro local'))}))) }
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  function isTransient(error){const msg=String(error?.message||error||'').toLowerCase();return error?.name==='AbortError'||msg.includes('load failed')||msg.includes('failed to fetch')||msg.includes('network')||msg.includes('respondió 429')||msg.includes('respondió 5')}
  function phase(message){const status=document.querySelector('#syncStatus');if(status)status.textContent=message;}
  // Las revisiones proceden de la misma IndexedDB que las cantidades. Un registro antiguo leído
  // individualmente también se concilia en la primera sincronización del conjunto.
  async function productionVersions(){
    if(!window.SKAdminAuth?.isAdmin?.()||typeof productionQuantityCache==='undefined')return undefined;
    return (await all(productionQuantityCache)).filter(row=>row.itemId).map(row=>[row.itemId,row.updatedAt]);
  }
  async function applyProductionBalances(versions,reply){
    if(!reply)throw new Error('Actualiza Code.gs y publica la nueva versión para sincronizar los saldos de Producción.');
    if(reply.error)throw new Error(reply.error);
    const {enabled,sampledAt,count,rows,removed}=reply;
    const ids=new Set(),expected=new Map(versions);
    if(reply.protocol!=='production-balances-v1'||typeof enabled!=='boolean'||!Number.isFinite(Date.parse(sampledAt))||
      !Number.isSafeInteger(count)||count<0||!Array.isArray(rows)||!Array.isArray(removed))throw new Error('Respuesta de saldos de Producción incompleta.');
    for(const row of rows){
      if(!row?.itemId||ids.has(row.itemId)||!Number.isFinite(row.quantity)||!row.updatedAt)throw new Error('Saldo de Producción sin confirmar.');
      ids.add(row.itemId);expected.set(row.itemId,row.updatedAt);
    }
    for(const id of removed){
      if(ids.has(id)||!expected.delete(id))throw new Error('Retiro de saldo sin confirmar.');
    }
    if(expected.size!==count||!enabled&&count)throw new Error('La lista de saldos de Producción está incompleta.');
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(productionQuantityCache,'readwrite'),table=tx.objectStore(productionQuantityCache),req=table.getAll();
      let failure;
      req.onsuccess=()=>{
        const previous=req.result.find(row=>!row.itemId);
        if(previous?.sampledAt>sampledAt)return;
        const current=new Map(req.result.filter(row=>row.itemId).map(row=>[row.itemId,row.updatedAt]));
        if(current.size!==versions.length||versions.some(([id,rev])=>current.get(id)!==rev)){
          failure=new Error('Otra pestaña actualizó los saldos de Producción. Se comprobarán en la próxima sincronización.');
          tx.abort();return;
        }
        for(const id of removed)table.delete(id);
        for(const row of rows)table.put({id:row.itemId,itemId:row.itemId,quantity:row.quantity,updatedAt:row.updatedAt,sampledAt});
        table.put({id:productionBalanceMetaKey,enabled,sampledAt});
      };
      tx.oncomplete=resolve;tx.onabort=()=>reject(failure||tx.error||new Error('No se guardaron los saldos de Producción.'));
    });
    window.dispatchEvent(new Event('skweb-production-balances'));
  }
  async function sendOnce(snapshot,attempt,forceFull=false,versions){
    const c=config(),controller=new AbortController();let timeout;
    phase(attempt===1?'Enviando cambios y consultando la base central…':'Reintentando la conexión con la base central…');
    const expired=new Promise((_,reject)=>{timeout=setTimeout(()=>{
      const error=new Error('Google tardó más de 45 segundos en responder. Los pendientes se conservan; pulsa la nube para reintentar.');
      error.code='SK_SYNC_TIMEOUT';reject(error);controller.abort();
    },45000)});
    try{
      // Abort alone is insufficient if a browser/redirect/body reader never settles.
      // Racing the entire exchange also ignores late replies without confirming data.
      const exchange=(async()=>{
        const r=await fetch(c.apiUrl,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({productionBalanceVersions:versions,action:snapshot.novelties?.some(row=>row.noveltyAction?.status==='pending')?'syncNoveltyChanges':snapshot.novelties?.some(row=>row.datedNovelty)?'syncDatedNovelties':'sync',key:c.apiKey,token:window.SKAdminAuth?.token?.()||'',since:forceFull||collaboratorRevisionApi!==c.apiUrl?'':(localStorage.getItem('skWebServerUpdatedAt')||''),data:snapshot}),signal:controller.signal,redirect:'follow',cache:'no-store',credentials:'omit'});
        if(!r.ok)throw new Error(`El servicio respondió ${r.status}`);
        let result;try{result=await r.json()}catch(error){if(controller.signal.aborted||error?.name==='AbortError')throw error;throw new Error('El servicio devolvió una respuesta incompleta. Pulsa la nube para reintentar.');}
        if(!result?.ok)throw new Error(result?.error||'El servicio rechazó la sincronización');return result;
      })();
      return await Promise.race([exchange,expired]);
    }finally{clearTimeout(timeout)}
  }
  function sessionRejected(error){return /sesión.*venció|sesion.*vencio|inicia sesión/i.test(String(error?.message||''))}
  async function send(snapshot,forceFull=false,allowRenewal=true,versions){
    let lastError;
    for(let attempt=1;attempt<=2;attempt++){
      const sentToken=window.SKAdminAuth?.token?.()||'';
      try{return await sendOnce(snapshot,attempt,forceFull,versions)}catch(error){
        lastError=error;
        if(sessionRejected(error)&&attempt===1){
          // Cached login renews its token in the background. Use that result first.
          phase('Comprobando la renovación del acceso…');
          await window.SKAdminAuth?.waitForLoginRenewal?.();
          const currentToken=window.SKAdminAuth?.token?.()||'';
          if(currentToken&&currentToken!==sentToken)continue;
          if(allowRenewal){phase('Esperando tu contraseña para renovar la sincronización. Puedes seguir trabajando localmente.');if(await window.SKAdminAuth?.renewForSync?.())continue;}
          throw new Error('Tu sesión necesita renovarse. Pulsa la nube para ingresar tu contraseña y sincronizar. Los pendientes se conservan.');
        }
        if(!isTransient(error)||attempt===2)break;
        await wait(1200);
      }
    }
    throw lastError;
  }
  async function finishSync(label,detail,versions,balances){
    let balanceError;
    if(versions){
      try{await applyProductionBalances(versions,balances);}
      catch(error){balanceError=error.message;}
    }
    await window.SKInventoryAdmin?.syncQuantities?.();
    const pending=await pendingSnapshot(),adjustments=await readAdjustments(),status=document.querySelector('#syncStatus');
    const count=stores.reduce((total,store)=>total+pending[store].length,adjustments.length);
    const adjustmentError=adjustments.find(row=>row.syncError)?.syncError;
    if(detail.waitingForServer&&pending.novelties?.some(row=>row.datedNovelty||row.noveltyAction)){if(status)status.textContent='Novedades guardadas en este dispositivo. Falta actualizar Apps Script para sincronizarlas.';ui('idle');return false;}
    if(count){
      if(status)status.textContent=`Sincronización parcial · ${count} ${count===1?'registro pendiente':'registros pendientes'}; se conservan en este dispositivo.${adjustmentError?' · '+adjustmentError:''}${balanceError?' · Producción: '+balanceError:''}`;
      ui('idle');if(pending.personal?.length)schedule(300);return false;
    }
    if(balanceError){if(status)status.textContent='Sincronización parcial · Saldos de Producción pendientes. '+balanceError;ui('error');return false;}
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
  function confirmAssetMarkRequests(snapshot,result){
    const requested=(snapshot.assets||[]).filter(row=>row.markRequest==='existing-v1'&&row.markStatus==='pending');
    if(!requested.length)return;
    const central=result.data?.assets||[];
    if(requested.some(row=>!central.some(remote=>remote?.id===row.id&&(remote.deleted||String(remote.nuevaMarca||'').trim()))))throw new Error('La base central aún no confirmó la marca solicitada. Actualiza Code.gs y su implementación, y vuelve a sincronizar. La solicitud se conserva pendiente.');
  }
  async function performSync({silent=false,forceFull=false}={}){
    const b=buttonStart(),s=document.querySelector('#syncStatus');
    try{
      running=true;ui('syncing');phase('Revisando los cambios guardados en este dispositivo…');
      const snapshot=await pendingSnapshot(),versions=await productionVersions();
      const changed=snapshot.novelties?.filter(row=>row.noveltyAction?.status==='pending')||[];
      const dated=snapshot.novelties?.filter(row=>row.datedNovelty&&!row.noveltyAction)||[];
      let waitingForServer=false;
      // A full response confirms each person and returns the canonical ID if the
      // document already exists centrally. A generic ACK cannot prove that.
      // Older servers do not change their shared revision after a Plaza person edit.
      // Negotiate that guarantee before trusting an unchanged snapshot.
      forceFull=forceFull||!silent||Boolean(snapshot.personal?.length)||(snapshot.assets||[]).some(row=>row.markRequest==='existing-v1'&&row.markStatus==='pending');
      let result;
      try{result=await send(snapshot,forceFull||dated.length>0||changed.length>0,!silent,versions);}
      catch(error){
        if(!(dated.length||changed.length)||!/solicitud no v[aá]lida/i.test(error.message))throw error;
        // El servicio anterior rechaza la acción antes de escribir. El resto de la cola puede avanzar.
        snapshot.novelties=snapshot.novelties.filter(row=>!row.datedNovelty&&!row.noveltyAction);
        waitingForServer=true;result=await send(snapshot,true,!silent,versions);
      }
      const hasPending=stores.some(store=>snapshot[store]?.length);
      const valid=result=>result&&(result.notModified||result.acknowledged||(result.data&&typeof result.data==='object'&&!Array.isArray(result.data)));
      if(!valid(result)||(result.notModified&&hasPending)){localStorage.removeItem('skWebServerUpdatedAt');result=await send(snapshot,true,!silent,versions)}
      if(!valid(result))throw new Error('El servicio no devolvió la confirmación de sincronización');
      if(result.notModified&&hasPending)throw new Error('El servicio no confirmó los cambios pendientes');
      if(dated.length&&!waitingForServer&&dated.some(row=>!result.data?.novelties?.some(remote=>remote.id===row.id&&remote.datedNovelty&&typeof remote.historyOnly==='boolean')))
        throw new Error('La base central aún no confirmó las novedades fechadas. Se conservan pendientes.');
      if(!waitingForServer&&changed.some(row=>!result.data?.novelties?.some(remote=>remote.id===row.id&&(
        remote.deleted||remote.noveltyAction?.id===row.noveltyAction.id&&remote.noveltyAction.status==='applied'&&
        (row.noveltyAction.kind==='delete'?remote.deleted:remote.reversed)))))
        throw new Error('La base central aún no confirmó la reversión o eliminación. Se conserva pendiente en este dispositivo.');
      confirmPersonal(snapshot,result);
      confirmAssetMarkRequests(snapshot,result);
      collaboratorRevisionApi=result.capabilities?.collaboratorRevisionsV1===true?config().apiUrl:'';
      const serverUpdatedAt=result.updatedAt||result.data?.updatedAt||'';
      if(result.notModified){
        if(serverUpdatedAt)localStorage.setItem('skWebServerUpdatedAt',serverUpdatedAt);
        return await finishSync('Sincronizado · sin cambios',{notModified:true,waitingForServer},versions,result.productionBalances);
      }
      if(result.acknowledged){
        phase('Confirmando los registros guardados…');await markSnapshotSynced(snapshot);phase('Actualizando las listas…');await refresh();window.SKInventoryAdmin?.render?.();
        if(serverUpdatedAt)localStorage.setItem('skWebServerUpdatedAt',serverUpdatedAt);
        window.dispatchEvent(new Event('skweb-inventory-refresh'));
        return await finishSync('Sincronizado rápidamente',{acknowledged:true,waitingForServer},versions,result.productionBalances);
      }
      const merged=result.data,localAssetIds=new Set((await all('assets')).map(x=>x.id).filter(Boolean)),mergedAssetIds=new Set((merged.assets||[]).map(x=>x.id));
      for(const [store,rows] of Object.entries(merged))if(Array.isArray(rows))merged[store]=rows.map(row=>row?.syncState==='pending'?{...row,syncState:'synced'}:row);
      for(const id of localAssetIds)if(!mergedAssetIds.has(id))throw new Error('Protección local: un activo iba a perderse.');
      if(typeof window.writeSyncedSnapshot!=='function')throw new Error('No se cargó el conciliador local');
      phase('Aplicando la respuesta en este dispositivo…');await window.writeSyncedSnapshot(merged,snapshot);await seedParts();phase('Actualizando las listas…');await refresh();window.SKInventoryAdmin?.render?.();
      if(serverUpdatedAt)localStorage.setItem('skWebServerUpdatedAt',serverUpdatedAt);
      window.dispatchEvent(new Event('skweb-inventory-refresh'));
      return await finishSync('Sincronizado automáticamente',{waitingForServer},versions,result.productionBalances);
    }catch(e){
      retryAfter=Date.now()+60000;console.error('SK Web automatic sync:',e);ui('error');
      if(s)s.textContent=navigator.onLine?'Sincronización pendiente · '+(e?.message||e):'Sin conexión · cambios seguros en este dispositivo';
      if((await readAdjustments().catch(()=>[])).some(row=>!row.syncError))schedule(60000);
      if(!silent)alert('Los datos están seguros en este dispositivo, pero aún no se sincronizaron: '+(e?.message||e));return false;
    }finally{running=false;buttonStop(b)}
  }
  function sync(options={}){
    if(discarding)return Promise.resolve(false);
    if(!configured()||!navigator.onLine||!window.SKAdminAuth?.ready?.())return Promise.resolve(false);
    if(activePromise){queued=true;return activePromise}
    clearTimeout(timer);if(!options.silent)retryAfter=0;
    activePromise=performSync(options).finally(()=>{activePromise=null;if(queued){queued=false;schedule(300)}});return activePromise;
  }
  function schedule(delay=1500){if(!configured()||!window.SKAdminAuth?.ready?.())return;clearTimeout(timer);timer=setTimeout(()=>sync({silent:true}),Math.max(delay,retryAfter-Date.now()))}
  function resumeSync(){if(!document.hidden&&!activePromise)schedule(300)}
  let readyToken='';
  function accessReady(){const next=window.SKAdminAuth?.ready?.()?window.SKAdminAuth.token():'';if(next!==readyToken){readyToken=next;if(next)resumeSync()}}
  window.skSyncApi={configured,sync,schedule,pendingRecords,discardPending};
  document.addEventListener?.('visibilitychange',resumeSync);
  for(const event of ['pageshow','focus'])window.addEventListener(event,resumeSync);
  window.addEventListener('skadmin-permissions',accessReady);
  window.addEventListener('skweb-db-ready',resumeSync);
  window.addEventListener('skweb-local-change',()=>schedule());
  window.addEventListener('online',()=>schedule(300));
  window.addEventListener('offline',()=>ui('error'));
  window.addEventListener('load',()=>{
    if(!configured())return;accessReady();schedule(300);
    // Cinco minutos como máximo, incluso si quedó una configuración antigua mayor.
    setInterval(()=>{if(!activePromise)schedule(0)},Math.min(300000,Math.max(60000,Number(config().intervalMs)||300000)));
    document.addEventListener('submit',()=>schedule(3500),true);
  });
})();

