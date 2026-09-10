// Sincronización SK Web v5: OAuth se inicia directamente desde el toque del usuario.
(()=>{
  // Safari/iOS puede bloquear el popup si requestAccessToken ocurre después de un await.
  // Sustituimos getToken para abrir Google mientras el gesto del botón sigue activo.
  getToken=function(){
    if(accessToken)return Promise.resolve(accessToken);
    if(!window.google?.accounts?.oauth2)return Promise.reject(new Error('Google todavía está cargando. Espera un momento y pulsa Sincronizar nuevamente.'));
    return new Promise((ok,no)=>{
      let settled=false;
      const doneError=msg=>{if(settled)return;settled=true;no(new Error(msg))};
      tokenClient=google.accounts.oauth2.initTokenClient({
        client_id:GOOGLE_CLIENT_ID,
        scope:DRIVE_SCOPE,
        callback:r=>{if(settled)return;if(r?.error)return doneError(r.error_description||r.error);if(!r?.access_token)return doneError('Google no entregó un token de acceso.');settled=true;accessToken=r.access_token;ok(accessToken)},
        error_callback:e=>doneError(e?.type==='popup_failed_to_open'?'El iPhone bloqueó la ventana de autorización de Google. Vuelve a pulsar Sincronizar.':e?.type==='popup_closed'?'Se cerró la autorización de Google antes de terminar.':'No se pudo abrir la autorización de Google.')
      });
      // Debe ejecutarse aquí, sin await previo, para conservar el gesto táctil en iOS.
      tokenClient.requestAccessToken({prompt:''});
    });
  };

  const stamp=x=>{const t=Date.parse(x?.updatedAt||x?.createdAt||'');return Number.isFinite(t)?t:0};
  const chooseLatest=(local,remote)=>{if(!local)return remote;if(!remote)return local;const ls=local.syncState==='seed',rs=remote.syncState==='seed';if(ls!==rs)return ls?remote:local;return stamp(remote)>stamp(local)?remote:local};
  const buzz=pattern=>{try{if(typeof navigator.vibrate==='function')navigator.vibrate(pattern)}catch(_){}};
  function timeout(promise,ms,label){return Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error(label)),ms))])}
  async function normalizeLocal(store,rows){const out=[];for(const original of rows){let x=original;if(!x?.id){x={...x,id:uuid(),updatedAt:now(),createdAt:x?.createdAt||now(),syncState:'pending'};await put(store,x)}out.push(x)}return out}
  async function mergeLatest(cloud){const merged={schema:5,updatedAt:now()};for(const store of stores){const local=await normalizeLocal(store,await all(store));const remote=Array.isArray(cloud?.[store])?cloud[store]:[];const map=new Map();for(const x of remote)if(x?.id)map.set(x.id,x);for(const x of local)if(x?.id)map.set(x.id,chooseLatest(x,map.get(x.id)));merged[store]=[...map.values()]}return merged}
  async function writeMergedLocal(data){for(const store of stores){if(!Array.isArray(data[store]))continue;await clearStore(store);for(const x of data[store])await put(store,x)}}
  async function syncLatest(){
    const b=document.querySelector('#syncBtn'),s=document.querySelector('#syncStatus');if(!b||b.disabled)return;
    try{
      b.disabled=true;b.textContent='☁ Sincronizando…';buzz(18);if(s)s.textContent='Autorizando Google Drive…';
      // PRIMERA operación: autorización. No poner ningún await antes de esta llamada.
      await timeout(getToken(),45000,'Google no respondió a la autorización en 45 segundos.');
      if(s)s.textContent='Conectado a Google · protegiendo datos locales…';
      const localAssetIds=new Set((await all('assets')).map(x=>x.id).filter(Boolean));
      const id=await timeout(cloudFileId(),45000,'Google Drive tardó demasiado en localizar la base central.');let cloud={};
      if(s)s.textContent='Comparando con la base central…';
      if(id){const r=await timeout(driveFetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`),45000,'Google Drive tardó demasiado en descargar la base central.');cloud=await timeout(r.json(),15000,'La base central tardó demasiado en procesarse.')}
      const merged=await mergeLatest(cloud),mergedAssetIds=new Set((merged.assets||[]).map(x=>x.id));
      for(const assetId of localAssetIds)if(!mergedAssetIds.has(assetId))throw new Error('Protección local: un activo iba a perderse durante la conciliación. Sincronización cancelada.');
      if(s)s.textContent='Guardando copia central protegida…';await timeout(uploadCloud(id,merged),60000,'Google Drive tardó demasiado en guardar la base central.');
      await writeMergedLocal(merged);await seedParts();await refresh();if(s)s.textContent=`Sincronizado · cambios locales protegidos · ${new Date().toLocaleString('es-CO')}`;buzz([22,45,22]);alert(id?'Sincronización completada. Los registros locales fueron conservados.':'Base central creada y sincronizada.');location.reload();
    }catch(e){console.error('SK Web sync v5:',e);buzz([45,35,45]);if(s)s.textContent='Sin sincronizar · '+(e?.message||e);alert('No se pudo sincronizar: '+(e?.message||e))}
    finally{b.disabled=false;b.textContent='☁ Sincronizar'}
  }
  window.addEventListener('load',()=>{const old=document.querySelector('#syncBtn');if(!old)return;const fresh=old.cloneNode(true);old.replaceWith(fresh);fresh.addEventListener('click',syncLatest)});
})();