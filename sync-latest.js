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
  async function writeMergedLocal(data,sentSnapshot){for(const store of stores){if(!Array.isArray(data[store]))continue;if(typeof replaceStoreRows==='function')await replaceStoreRows(store,data[store],sentSnapshot?.[store]);else{await clearStore(store);for(const x of data[store])await put(store,x)}}}
  window.writeSyncedSnapshot=writeMergedLocal;
  async function syncLatest(){
    if(window.skSyncApi?.configured())return window.skSyncApi.sync();
    const message='No se cargó el servicio central de sincronización. Pulsa ACTUALIZAR APP y vuelve a intentarlo. Los registros locales se conservan.';
    const status=document.querySelector('#syncStatus');if(status)status.textContent=message;alert(message);return false;
  }
  window.addEventListener('load',()=>{if(window.skSyncApi?.configured())return;const old=document.querySelector('#syncBtn');if(!old)return;const fresh=old.cloneNode(true);old.replaceWith(fresh);fresh.addEventListener('click',syncLatest)});
})();
