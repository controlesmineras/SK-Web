/* Cada movimiento y pendiente se guarda por separado; ninguna escritura borra la cola. */
(()=>{
 'use strict';
 const database=new Promise((resolve,reject)=>{
  const request=indexedDB.open('sk-production-warehouse-v1',1);
  request.onupgradeneeded=()=>{
   request.result.createObjectStore('meta');
   for(const name of ['records','pending'])request.result.createObjectStore(name,{keyPath:['account','id']}).createIndex('account','account');
  };
  request.onsuccess=()=>{request.result.onversionchange=()=>request.result.close();resolve(request.result)};
  request.onerror=()=>reject(request.error);request.onblocked=()=>reject(new Error('Cierra las otras ventanas de Producción para abrir la bodega.'));
 });
 database.catch(()=>{});
 const clean=row=>{const {account,syncRejected,syncError,...value}=row;return value};
 async function read(account){
  const db=await database;
  return new Promise((resolve,reject)=>{
   const tx=db.transaction(['meta','records','pending']),result={};
   const meta=tx.objectStore('meta').get(account);meta.onsuccess=()=>Object.assign(result,meta.result||{});
   for(const name of ['records','pending']){const request=tx.objectStore(name).index('account').getAll(account);request.onsuccess=()=>result[name]=request.result.map(({account,...row})=>row)}
   tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(tx.error);tx.onerror=()=>{};
  });
 }
 async function queue(account,row){
  const db=await database;
  return new Promise((resolve,reject)=>{
   const tx=db.transaction('pending','readwrite');tx.objectStore('pending').add({...row,account});
   tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);tx.onerror=()=>{};
  });
 }
 async function discard(account,reviewed){
  const db=await database;
  return new Promise((resolve,reject)=>{
   const tx=db.transaction('pending','readwrite'),table=tx.objectStore('pending'),request=table.get([account,reviewed.id]);
   request.onsuccess=()=>{if(request.result?.syncRejected&&JSON.stringify(clean(request.result))===JSON.stringify(clean(reviewed)))table.delete([account,reviewed.id]);};
   tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);tx.onerror=()=>{};
  });
 }
 function validate(result,sent,current){
  if(result?.ok!==true||result.protocol!=='production-warehouse-v1'||!Number.isSafeInteger(result.cursor)||result.cursor<0||!Array.isArray(result.rows)||!Array.isArray(result.receipts)||!Array.isArray(result.balances)||!Array.isArray(result.roles)||!result.settings)throw new Error('Respuesta incompleta. Se conservan todos los pendientes.');
  if(!result.reset&&result.cursor<(current.cursor||0))throw new Error('Llegó una respuesta anterior. Vuelve a sincronizar.');
  if(!current.catalog&&!result.catalog)throw new Error('Falta descargar el catálogo de la bodega.');
  const revisions=new Set(result.rows.map(row=>row.revision));
  if(new Set(result.rows.map(row=>row.id)).size!==result.rows.length)throw new Error('Movimientos duplicados en la respuesta.');
  for(let revision=result.reset?1:(current.cursor||0)+1;revision<=result.cursor;revision++)if(!revisions.has(revision))throw new Error('Faltan movimientos de la sincronización. Se conservó la copia anterior.');
  const receipts=new Map(result.receipts.map(row=>[row.id,row]));
  if(receipts.size!==result.receipts.length||receipts.size!==sent.length)throw new Error('Faltan confirmaciones individuales.');
  const records=new Map([...(current.records||[]),...result.rows].map(row=>[row.id,row]));
  for(const request of sent){
   const receipt=receipts.get(request.id),saved=records.get(request.id);
   if(!receipt||!['accepted','already-applied','rejected'].includes(receipt.status))throw new Error('Confirmación no válida.');
   if(receipt.status!=='rejected'&&saved?.requestSignature!==JSON.stringify(clean(request)))throw new Error('El movimiento confirmado no coincide con lo enviado.');
  }
  return receipts;
 }
 async function reconcile(account,result,sent){
  const db=await database;
  return new Promise((resolve,reject)=>{
   const tx=db.transaction(['meta','records','pending'],'readwrite');let failure;
   const fail=error=>{failure=error;tx.abort()};
   const current={records:[]};let ready=0;
   const apply=()=>{if(++ready!==2)return;try{
    const receipts=validate(result,sent,current),records=tx.objectStore('records'),pending=tx.objectStore('pending');
    if(result.reset)for(const row of current.records)records.delete([account,row.id]);
    for(const row of result.rows)records.put({...row,account});
    for(const row of sent){
     const request=pending.get([account,row.id]);request.onsuccess=()=>{
      if(!request.result||JSON.stringify(clean(request.result))!==JSON.stringify(clean(row)))return;
      const receipt=receipts.get(row.id);
      if(receipt.status==='rejected')pending.put({...request.result,syncRejected:true,syncError:receipt.error||'Movimiento rechazado.'});
      else pending.delete([account,row.id]);
     };
    }
    const {rows,receipts:ignored,records:unused,...metadata}=result;
    tx.objectStore('meta').put({...current,...metadata,records:undefined,catalog:result.catalog||current.catalog},account);
   }catch(error){fail(error)}};
   const meta=tx.objectStore('meta').get(account);meta.onsuccess=()=>{Object.assign(current,meta.result||{});apply()};
   const rows=tx.objectStore('records').index('account').getAll(account);rows.onsuccess=()=>{current.records=rows.result;apply()};
   tx.oncomplete=resolve;tx.onabort=()=>reject(failure||tx.error||new Error('No se confirmó el guardado local.'));tx.onerror=()=>{};
  });
 }
 window.SKProductionWarehouseStore={read,queue,discard,reconcile,clean,validate};
})();
