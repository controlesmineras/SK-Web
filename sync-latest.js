// Sincronización SK Web v3: conciliación segura registro por registro.
// Los registros locales siempre deben conservarse. Si una versión antigua creó
// un registro sin id, se le asigna uno permanente ANTES de comparar con Drive.
(()=>{
  const stamp=x=>{const t=Date.parse(x?.updatedAt||x?.createdAt||'');return Number.isFinite(t)?t:0};
  const chooseLatest=(local,remote)=>{
    if(!local)return remote;if(!remote)return local;
    const ls=local.syncState==='seed',rs=remote.syncState==='seed';
    if(ls!==rs)return ls?remote:local;
    return stamp(remote)>stamp(local)?remote:local;
  };
  async function normalizeLocal(store,rows){
    const out=[];
    for(const original of rows){
      let x=original;
      if(!x?.id){
        x={...x,id:uuid(),updatedAt:now(),createdAt:x?.createdAt||now(),syncState:'pending'};
        await put(store,x);
      }
      out.push(x);
    }
    return out;
  }
  async function mergeLatest(cloud){
    const merged={schema:3,updatedAt:now()};
    for(const store of stores){
      const local=await normalizeLocal(store,await all(store));
      const remote=Array.isArray(cloud?.[store])?cloud[store]:[];
      const map=new Map();
      for(const x of remote)if(x?.id)map.set(x.id,x);
      for(const x of local)if(x?.id)map.set(x.id,chooseLatest(x,map.get(x.id)));
      merged[store]=[...map.values()];
    }
    return merged;
  }
  async function writeMergedLocal(data){for(const store of stores){if(!Array.isArray(data[store]))continue;await clearStore(store);for(const x of data[store])await put(store,x)}}
  async function syncLatest(){
    const b=document.querySelector('#syncBtn'),s=document.querySelector('#syncStatus');
    try{
      b.disabled=true;b.textContent='☁ Sincronizando…';if(s)s.textContent='Protegiendo cambios locales y comparando con Google Drive…';
      const localAssetIds=new Set((await all('assets')).map(x=>x.id).filter(Boolean));
      const id=await cloudFileId();let cloud={};
      if(id){const r=await driveFetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`);cloud=await r.json()}
      const merged=await mergeLatest(cloud);
      const mergedAssetIds=new Set((merged.assets||[]).map(x=>x.id));
      for(const assetId of localAssetIds)if(!mergedAssetIds.has(assetId))throw new Error('Protección local: un activo iba a perderse durante la conciliación. Sincronización cancelada.');
      // Primero se confirma la copia central; solo después se reescribe la copia local.
      await uploadCloud(id,merged);
      await writeMergedLocal(merged);await seedParts();await refresh();
      if(s)s.textContent=`Sincronizado · cambios locales protegidos · ${new Date().toLocaleString('es-CO')}`;
      alert(id?'Sincronización completada. Los registros locales fueron conservados.':'Base central creada y sincronizada.');
      location.reload();
    }catch(e){console.error('SK Web sync v3:',e);if(s)s.textContent='Error de sincronización: '+(e?.message||e);alert('No se pudo sincronizar: '+(e?.message||e))}
    finally{b.disabled=false;b.textContent='☁ Sincronizar'}
  }
  window.addEventListener('load',()=>{const old=document.querySelector('#syncBtn');if(!old)return;const fresh=old.cloneNode(true);old.replaceWith(fresh);fresh.addEventListener('click',syncLatest)});
})();