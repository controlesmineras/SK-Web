// Sincronización SK Web v4: conciliación segura + límite de espera para iOS/PWA.
(()=>{
  const stamp=x=>{const t=Date.parse(x?.updatedAt||x?.createdAt||'');return Number.isFinite(t)?t:0};
  const chooseLatest=(local,remote)=>{if(!local)return remote;if(!remote)return local;const ls=local.syncState==='seed',rs=remote.syncState==='seed';if(ls!==rs)return ls?remote:local;return stamp(remote)>stamp(local)?remote:local};
  const buzz=pattern=>{try{if(typeof navigator.vibrate==='function')navigator.vibrate(pattern)}catch(_){}};
  function timeout(promise,ms,label){return Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error(label)),ms))])}
  async function normalizeLocal(store,rows){const out=[];for(const original of rows){let x=original;if(!x?.id){x={...x,id:uuid(),updatedAt:now(),createdAt:x?.createdAt||now(),syncState:'pending'};await put(store,x)}out.push(x)}return out}
  async function mergeLatest(cloud){const merged={schema:4,updatedAt:now()};for(const store of stores){const local=await normalizeLocal(store,await all(store));const remote=Array.isArray(cloud?.[store])?cloud[store]:[];const map=new Map();for(const x of remote)if(x?.id)map.set(x.id,x);for(const x of local)if(x?.id)map.set(x.id,chooseLatest(x,map.get(x.id)));merged[store]=[...map.values()]}return merged}
  async function writeMergedLocal(data){for(const store of stores){if(!Array.isArray(data[store]))continue;await clearStore(store);for(const x of data[store])await put(store,x)}}
  async function syncLatest(){
    const b=document.querySelector('#syncBtn'),s=document.querySelector('#syncStatus');
    if(!b||b.disabled)return;
    try{
      b.disabled=true;b.textContent='☁ Sincronizando…';buzz(18);if(s)s.textContent='Conectando con Google Drive…';
      const localAssetIds=new Set((await all('assets')).map(x=>x.id).filter(Boolean));
      const id=await timeout(cloudFileId(),45000,'Google no respondió a la autorización en 45 segundos. Vuelve a pulsar Sincronizar.');let cloud={};
      if(s)s.textContent='Protegiendo cambios locales y comparando con Google Drive…';
      if(id){const r=await timeout(driveFetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`),45000,'Google Drive tardó demasiado en descargar la base central.');cloud=await timeout(r.json(),15000,'La base central tardó demasiado en procesarse.')}
      const merged=await mergeLatest(cloud);const mergedAssetIds=new Set((merged.assets||[]).map(x=>x.id));
      for(const assetId of localAssetIds)if(!mergedAssetIds.has(assetId))throw new Error('Protección local: un activo iba a perderse durante la conciliación. Sincronización cancelada.');
      if(s)s.textContent='Guardando copia central protegida…';
      await timeout(uploadCloud(id,merged),60000,'Google Drive tardó demasiado en guardar la base central.');
      await writeMergedLocal(merged);await seedParts();await refresh();
      if(s)s.textContent=`Sincronizado · cambios locales protegidos · ${new Date().toLocaleString('es-CO')}`;buzz([22,45,22]);
      alert(id?'Sincronización completada. Los registros locales fueron conservados.':'Base central creada y sincronizada.');location.reload();
    }catch(e){console.error('SK Web sync v4:',e);buzz([45,35,45]);if(s)s.textContent='Sin sincronizar · '+(e?.message||e);alert('No se pudo sincronizar: '+(e?.message||e))}
    finally{b.disabled=false;b.textContent='☁ Sincronizar'}
  }
  window.addEventListener('load',()=>{const old=document.querySelector('#syncBtn');if(!old)return;const fresh=old.cloneNode(true);old.replaceWith(fresh);fresh.addEventListener('click',syncLatest)});
})();