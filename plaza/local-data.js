/* IndexedDB owns the full offline snapshot. localStorage is read only for migration. */
(()=>{
  'use strict';
  const legacyKey='skPlazaData',dbName='sk-plaza-offline-v1',storeName='state',slot='snapshot';
  let opening=null,initializing=null,revision=null,queue=Promise.resolve();
  const clone=value=>JSON.parse(JSON.stringify(value));
  function open(){
    if(opening)return opening;
    opening=new Promise((resolve,reject)=>{
      if(typeof indexedDB==='undefined'){reject(new Error('No se puede abrir la base local en este navegador. Los datos anteriores se conservaron.'));return}
      let done=false;
      const timer=setTimeout(()=>finish(new Error('La base local no respondió. Cierra las otras ventanas de Plaza Blending y vuelve a abrir la app.')),20000);
      const finish=(error,db)=>{if(done){db?.close();return}done=true;clearTimeout(timer);error?reject(error):resolve(db)};
      let request;try{request=indexedDB.open(dbName,1)}catch(error){finish(error);return}
      request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(storeName))db.createObjectStore(storeName)};
      request.onblocked=()=>finish(new Error('Otra ventana está bloqueando la base local. Ciérrala y vuelve a abrir Plaza Blending.'));
      request.onerror=()=>finish(new Error('No se pudo abrir la base local. Los registros anteriores se conservaron.'));
      request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();opening=null};finish(null,db)};
    });
    return opening;
  }
  async function transaction(mode,work){
    const db=await open();
    return new Promise((resolve,reject)=>{
      let tx,result,failure;
      try{tx=db.transaction(storeName,mode)}catch(error){reject(error);return}
      const timer=setTimeout(()=>{failure=new Error('El guardado local tardó demasiado. No se confirmó ningún cambio.');try{tx.abort()}catch(_){}},20000);
      tx.oncomplete=()=>{clearTimeout(timer);resolve(result)};
      tx.onabort=()=>{clearTimeout(timer);reject(failure||tx.error||new Error('No se pudo guardar en la base local. La copia anterior se conservó.'))};
      tx.onerror=()=>{};
      try{work(tx.objectStore(storeName),value=>{result=value},error=>{failure=error;tx.abort()})}
      catch(error){failure=error;tx.abort()}
    });
  }
  const getRow=()=>transaction('readonly',(store,set)=>{const request=store.get(slot);request.onsuccess=()=>set(request.result)});
  function decodeLegacy(raw){
    if(!raw)return {};
    try{
      let data=JSON.parse(raw);
      if(data?.storageFormat==='sk-plaza-lz-v1')data=JSON.parse(LZString.decompressFromUTF16(data.payload));
      if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('invalid snapshot');
      return data;
    }catch(_){throw new Error('No se pudo leer la copia anterior. Se conservó intacta para recuperar los registros pendientes.')}
  }
  function mergeLegacyPending(legacy,current){
    const merged=clone(current),stockChanges=new Map(),dependentAssets=new Set();
    const stamp=row=>Date.parse(row?.updatedAt||row?.createdAt)||0;
    const effect=(name,row)=>!row||row.assetId||row.deleted?0:(name==='blendingIncomes'||row.movementType==='DEVOLUCIÓN'?1:-1)*Number(row.quantity||0);
    for(const name of ['personal','blendingIncomes','blendingDeliveries','assets']){
      const rows=new Map((merged[name]||[]).map(row=>[row.id,row]));
      for(const row of legacy[name]||[]){
        if(!row.id||row.syncState!=='pending')continue;
        const previous=rows.get(row.id);
        // Already-confirmed movements in IndexedDB must not be resurrected as pending.
        if(previous&&stamp(row)<=stamp(previous)&&!(name==='assets'&&dependentAssets.has(row.id)))continue;
        rows.set(row.id,clone(row));
        if(name==='blendingIncomes'||name==='blendingDeliveries'){
          if(row.assetId)dependentAssets.add(row.assetId);
          else if(row.itemId)stockChanges.set(row.itemId,(stockChanges.get(row.itemId)||0)+effect(name,row)-effect(name,previous));
        }
      }
      merged[name]=[...rows.values()];
    }
    if(![...stockChanges.values()].some(delta=>delta))return merged;
    const stocks=merged.inventoryStock||(merged.inventoryStock=[]);
    for(const [itemId,delta] of stockChanges){
      if(!delta)continue;
      let stock=stocks.find(row=>row.itemId===itemId);
      if(!stock){stock={id:'stock-'+itemId,itemId,quantity:0};stocks.push(stock)}
      stock.quantity=(Number(stock.quantity)||0)+delta;
    }
    return merged;
  }
  async function initialize(){
    const raw=localStorage.getItem(legacyKey),legacy=decodeLegacy(raw);
    const row=await transaction('readwrite',(store,set,fail)=>{
      const request=store.get(slot);
      request.onsuccess=()=>{
        const existing=request.result;
        if(existing){
          const merged=raw?mergeLegacyPending(legacy,existing.data):existing.data;
          if(JSON.stringify(merged)!==JSON.stringify(existing.data)){const recovered={revision:existing.revision+1,data:merged};store.put(recovered,slot);set(recovered)}else set(existing);
          return;
        }
        const first={revision:1,data:legacy};store.put(first,slot);set(first);
      };
    });
    // Verify the committed record before retiring the previous storage key.
    const verified=await getRow();
    if(!verified||verified.revision!==row.revision||JSON.stringify(verified.data)!==JSON.stringify(row.data))throw new Error('No se pudo verificar la migración local. La copia anterior se conservó.');
    revision=verified.revision;
    if(raw&&localStorage.getItem(legacyKey)===raw){try{localStorage.removeItem(legacyKey)}catch(_){/* The verified database is already authoritative. */}}
    try{const protection=navigator.storage?.persist?.();protection?.catch(()=>{})}catch(_){}
  }
  function ready(){return initializing||(initializing=initialize())}
  function enqueue(work){const task=queue.then(work);queue=task.catch(()=>{});return task}
  function read(){return enqueue(async()=>{await ready();const row=await getRow();if(!row)throw new Error('No se encontró la copia local. No se realizaron cambios.');revision=row.revision;return clone(row.data)})}
  function write(data){
    // Capture before waiting: edits made later cannot change an in-flight transaction.
    let snapshot;try{snapshot=clone(data)}catch(error){return Promise.reject(error)}
    return enqueue(async()=>{
      await ready();
      const next=await transaction('readwrite',(store,set,fail)=>{
        const request=store.get(slot);
        request.onsuccess=()=>{
          const existing=request.result;
          if(!existing||existing.revision!==revision){fail(new Error('Los datos cambiaron en otra ventana de Plaza Blending. No se sobrescribieron; vuelve a abrir esta ventana antes de registrar.'));return}
          const row={revision:existing.revision+1,data:snapshot};store.put(row,slot);set(row.revision);
        };
      });
      revision=next;
    });
  }
  window.SKPlazaLocal={read,write,engine:'indexeddb'};
})();
