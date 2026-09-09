// Sincronización SK Web v2: conciliación registro por registro.
// Regla: para el mismo id gana updatedAt más reciente. Un dato real nunca es
// reemplazado por una copia inicial (syncState=seed), aunque esa semilla se haya
// creado después en otro dispositivo.
(()=>{
  const stamp=x=>{
    const t=Date.parse(x?.updatedAt||x?.createdAt||'');
    return Number.isFinite(t)?t:0;
  };
  const chooseLatest=(local,remote)=>{
    if(!local)return remote;
    if(!remote)return local;
    const ls=local.syncState==='seed', rs=remote.syncState==='seed';
    if(ls!==rs)return ls?remote:local;
    return stamp(remote)>stamp(local)?remote:local;
  };
  async function mergeLatest(cloud){
    const merged={schema:2,updatedAt:now()};
    for(const store of stores){
      const local=await all(store);
      const remote=Array.isArray(cloud?.[store])?cloud[store]:[];
      const map=new Map();
      for(const x of remote)if(x?.id)map.set(x.id,x);
      for(const x of local)if(x?.id)map.set(x.id,chooseLatest(x,map.get(x.id)));
      merged[store]=[...map.values()];
    }
    return merged;
  }
  async function writeMergedLocal(data){
    for(const store of stores){
      if(!Array.isArray(data[store]))continue;
      await clearStore(store);
      for(const x of data[store])await put(store,x);
    }
  }
  async function syncLatest(){
    const b=document.querySelector('#syncBtn'),s=document.querySelector('#syncStatus');
    try{
      b.disabled=true;b.textContent='☁ Sincronizando…';
      if(s)s.textContent='Comparando cambios con Google Drive…';
      const id=await cloudFileId();
      let cloud={};
      if(id){
        const r=await driveFetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`);
        cloud=await r.json();
      }
      const merged=await mergeLatest(cloud);
      await writeMergedLocal(merged);
      await uploadCloud(id,merged);
      await seedParts();
      await refresh();
      // searchable-consumption.js mantiene su propia lista en memoria.
      // Recargarla evita que Personal/Responsable muestre la versión anterior.
      window.dispatchEvent(new Event('skweb-synced'));
      if(s)s.textContent=`Sincronizado · se conservó el dato más reciente · ${new Date().toLocaleString('es-CO')}`;
      alert(id?'Sincronización completada. Se conservaron los cambios más recientes.':'Base central creada y sincronizada.');
    }catch(e){
      console.error('SK Web sync v2:',e);
      if(s)s.textContent='Error de sincronización: '+(e?.message||e);
      alert('No se pudo sincronizar: '+(e?.message||e));
    }finally{b.disabled=false;b.textContent='☁ Sincronizar'}
  }
  window.addEventListener('load',()=>{
    const old=document.querySelector('#syncBtn');
    if(!old)return;
    const fresh=old.cloneNode(true);
    old.replaceWith(fresh); // elimina el listener de la sincronización anterior
    fresh.addEventListener('click',syncLatest);
  });
})();