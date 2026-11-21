(()=>{
 'use strict';
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';');
 const identity=p=>[p.name,p.document&&'Doc. '+p.document].filter(Boolean).join(' · ')||'No registrado';
 const label=asset=>typeof assetLabel==='function'?assetLabel(asset):asset.clase||'Activo';
 const versions=new Map();
 async function read(){const names=['personal','novelties','blendingIncomes','blendingDeliveries'];return Object.fromEntries(await Promise.all(names.map(async name=>[name,await all(name)])));}
 function actionButtons(entry){
  if(entry.kind!=='novelty'||!window.SKAdminAuth?.isAdmin?.())return '';
  return '<div class="noveltyActions">'+
   (entry.reversed?'':'<button type="button" data-novelty-action="revert" data-novelty-id="'+escape(entry.raw.id)+'">Revertir novedad</button>')+
   '<button type="button" class="dangerBtn" data-novelty-action="delete" data-novelty-id="'+escape(entry.raw.id)+'">Eliminar novedad</button></div>';
 }
 function eventHTML(entry,asset,acta,editable=false){
  const responsibleLabel={assignment:'Recibe',loan:'Recibe en préstamo',income:'Trae',return:'Devuelve',novelty:'Responsable'}[entry.kind];
  const warehouseLabel=['assignment','loan'].includes(entry.kind)?'Entrega (bodeguero/a)':entry.kind==='novelty'?'Bodeguero/a':'Recibe en bodega';
  const row=entry.raw,stamp=entry.date?entry.date.split('-').reverse().join('/')+' · '+entry.time+' (Colombia)':'Fecha no registrada';
  return `<article class="assetHistoryEntry${entry.reversed?' isReversed':''}"><b>${escape(entry.title)}${entry.reversed?' · REVERTIDO':''}</b><small>${escape(stamp)} · ${entry.source==='novelties'?'SK Web':'Plaza Blending'}${row.historyOnly?' · Solo historial':''}${entry.pending?' · Pendiente de sincronización':''}</small>${asset?`<small>${escape(label(asset))}</small>`:''}<small>${escape(responsibleLabel)}: <strong>${escape(identity(entry.responsible))}</strong></small><small>${escape(warehouseLabel)}: <strong>${escape(identity(entry.warehouse))}</strong></small><small>${escape([entry.location,entry.state].filter(Boolean).join(' · '))}</small>${row.areaAsignada?`<small>Asignada a: ${escape(row.areaAsignada)}</small>`:''}${row.notes||row.observaciones?`<small>${escape(row.notes||row.observaciones)}</small>`:''}${window.SKNoveltyForm?.actaHTML?.(row,acta)||''}${row.estadoVisor?`<small>Color del visor: ${row.estadoVisorAnterior?escape(row.estadoVisorAnterior)+' → ':''}${escape(row.estadoVisor)}</small>`:''}${editable?actionButtons(entry):''}</article>`;
 }
 function panel(target){
  const id=target==='asset'?'assetHistory':'noveltyAssetHistory';let box=document.getElementById(id);if(box)return box;
  const form=document.querySelector(target==='asset'?'#assetForm':'#noveltyForm');if(!form)return null;
  box=document.createElement('section');box.id=id;box.className='assetHistory';box.hidden=true;box.setAttribute('aria-label','Historial del activo');box.setAttribute('aria-live','polite');
  // Outside the form so read-only users can open the full history as well.
  form.before(box);return box;
 }
 function show(target,asset,events,actas=[]){
  const box=typeof target==='string'?panel(target):target;if(!box)return;if(!asset){box.hidden=true;box.replaceChildren();return;}
  box.hidden=false;const actaMap=new Map(actas.map(row=>[row.id,row]));
  const draw=expanded=>{const shown=expanded?events:events.slice(0,10);box.innerHTML=`<h3>Últimas novedades del activo</h3><p class="hint">${escape(label(asset))}</p><p class="hint">${shown.length} de ${events.length} novedades · Más recientes primero.</p>${shown.map(entry=>eventHTML(entry,null,actaMap.get(entry.raw.actaId),target==='novelty')).join('')||'<p class="hint">Este activo aún no tiene novedades registradas.</p>'}${events.length>10?`<button type="button" class="historyMore">${expanded?'Mostrar últimas 10':'Ver las '+events.length+' novedades'}</button>`:''}`;box.querySelector('.historyMore')?.addEventListener('click',()=>draw(!expanded));};draw(false);
 }
 async function select(target,id){
  const ticket=(versions.get(target)||0)+1;versions.set(target,ticket);if(!id){show(target,null,[]);return;}
  const [assets,data,actas]=await Promise.all([all('assets'),read(),all('actas')]);
  if(versions.get(target)!==ticket)return;
  const current=document.querySelector(target==='asset'?'#assetForm [name="id"]':'#novAsset')?.value;if(current!==id)return;
  const asset=assets.find(row=>row.id===id&&!row.deleted);show(target,asset,window.SKAssetHistory.timeline(data,id),actas);
 }
 async function renderList(rows,assets){
  const [data,actas]=await Promise.all([read(),all('actas')]);data.novelties=rows;
  const list=document.querySelector('#noveltyList');if(!list)return;
  const from=document.querySelector('#novFilterFrom')?.value||'',to=document.querySelector('#novFilterTo')?.value||'',select=document.querySelector('#novFilterAsset'),assetId=select?.value||'',assetMap=new Map(assets.map(row=>[row.id,row])),actaMap=new Map(actas.map(row=>[row.id,row]));
  if(select){select.replaceChildren(new Option('Todos los activos',''),...assets.slice().sort((a,b)=>label(a).localeCompare(label(b),'es',{numeric:true})).map(asset=>new Option(label(asset),asset.id)));select.value=assetId;}
  const events=window.SKAssetHistory.timeline(data).filter(entry=>(!from||entry.date>=from)&&(!to||entry.date<=to)&&(!assetId||entry.assetId===assetId));
  list.innerHTML=events.slice(0,100).map(entry=>`<div class="assetHistoryResult">${eventHTML(entry,assetMap.get(entry.assetId),actaMap.get(entry.raw.actaId),true)}<button type="button" data-history-asset="${escape(entry.assetId)}">Ver historial del activo</button></div>`).join('')||'<p class="hint">No hay novedades que coincidan con los filtros.</p>';
  const counter=document.querySelector('#nCount');if(counter)counter.textContent=window.SKAssetHistory.timeline(data).filter(entry=>!entry.reversed).length;
  await selectCurrent();
 }
 async function selectCurrent(){await Promise.all([select('asset',document.querySelector('#assetForm [name="id"]')?.value),select('novelty',document.querySelector('#novAsset')?.value)]);}
 let changing=false;
 async function changeNovelty(id,kind){
  if(changing)return false;
  if(!window.SKAdminAuth?.isAdmin?.())throw new Error('Se requiere rol Administrador para revertir o eliminar novedades.');
  if(!['revert','delete'].includes(kind))throw new Error('Acción de novedad inválida.');
  changing=true;
  try{
   const original=await idbResult(db.transaction('novelties').objectStore('novelties').get(id));
   if(!original||original.deleted)throw new Error('La novedad ya fue eliminada. Actualiza la consulta.');
   if(kind==='revert'&&(original.reversed||original.reversedAt))return false;
   const when=window.SKAssetHistory.localTime(original.occurredAt||original.fechaNovedad&&original.fechaNovedad+'T'+(original.horaNovedad||'00:00')+':00-05:00'||original.createdAt);
   const title=(original.descripcion||'Novedad')+(when.date?' · '+when.date.split('-').reverse().join('/')+' '+when.time:'');
   const message=kind==='delete'?'¿Eliminar esta novedad del listado y deshacer sus efectos en la ficha?':'¿Revertir esta novedad y recuperar los datos anteriores? El registro quedará marcado como revertido.';
   if(!confirm(message+'\n\n'+title))return false;
   const tx=db.transaction(['novelties',assetProfileStore],'readwrite'),table=tx.objectStore('novelties');
   const committed=new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||new Error('No se pudo actualizar la novedad.'));});
   const write=async()=>{
    const row=await idbResult(table.get(id));
    if(!row||JSON.stringify(row)!==JSON.stringify(original))throw new Error('La novedad cambió mientras confirmabas. Revisa el registro actualizado.');
    const at=new Date(Math.max(Date.now(),(Date.parse(row.updatedAt)||0)+1)).toISOString();
    const user=window.SKAdminAuth.user?.()||{};
    const updated={...row,updatedAt:at,syncState:'pending',noveltyAction:{
     id:uuid(),kind,status:'pending',requestedAt:at,by:user.username||'',
     localOnly:row.noveltyAction?.localOnly??Boolean(row.datedNovelty&&row.syncState==='pending'&&!row.syncedAt)
    }};
    if(kind==='delete')Object.assign(updated,{deleted:true,deletedAt:at,deletedBy:user.username||''});
    else Object.assign(updated,{reversed:true,reversedAt:at,reversedBy:user.username||''});
    await idbResult(table.put(updated));await idbResult(tx.objectStore(assetProfileStore).delete(row.assetId));
   };
   await Promise.all([committed,write().catch(error=>{try{tx.abort()}catch{} throw error;})]);
   await refresh();
   const status=document.querySelector('#noveltySaveStatus');
   if(status){status.hidden=false;status.textContent=kind==='delete'?'✓ Novedad eliminada. Ficha recalculada.':'✓ Novedad revertida. Ficha recalculada.';}
   window.dispatchEvent(new Event('skweb-local-change'));
   window.skSyncApi?.schedule?.(300);
   return true;
  }finally{changing=false;}
 }
 document.addEventListener('click',event=>{
  const button=event.target.closest?.('[data-novelty-action]');
  if(!button)return;
  button.disabled=true;
  changeNovelty(button.dataset.noveltyId,button.dataset.noveltyAction).catch(error=>alert(error.message)).finally(()=>button.disabled=false);
 });
 window.SKAssetHistoryUI={read,show,select,renderList,changeNovelty};
 window.addEventListener('load',()=>{
  const style=document.createElement('style');style.textContent='.assetHistory{margin:0 0 20px;padding:16px;border:1px solid #ccd8e0;border-radius:12px;background:#f8fafc}.assetHistory[hidden]{display:none}.assetHistory h3{margin:0 0 8px}.assetHistoryEntry{padding:12px 0;border-bottom:1px solid #dce4ea;overflow-wrap:anywhere}.assetHistoryEntry>b,.assetHistoryEntry>small{display:block;margin-bottom:5px}.assetHistoryEntry>small{line-height:1.45;color:#3c4b59}.assetHistoryEntry.isReversed{border-left:3px solid #ab6a21;padding-left:10px}.assetHistoryResult{padding:10px 0;border-bottom:1px solid #dce4ea}.assetHistoryResult button,.assetHistory .historyMore{margin-top:10px;width:auto}.assetHistoryEntry strong{font-weight:600}.noveltyActions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.noveltyActions button{width:auto;font-size:.85rem;padding:8px 12px}';document.head.append(style);
  document.querySelector('#novAsset')?.addEventListener('change',event=>select('novelty',event.target.value).catch(console.error));
  document.querySelector('#assetForm')?.addEventListener('reset',()=>{versions.set('asset',(versions.get('asset')||0)+1);show('asset',null,[]);});
  document.querySelector('#noveltyList')?.addEventListener('click',event=>{const button=event.target.closest('[data-history-asset]');if(!button)return;const selectAsset=document.querySelector('#novAsset');selectAsset.value=button.dataset.historyAsset;selectAsset.dispatchEvent(new Event('change',{bubbles:true}));select('novelty',selectAsset.value).then(()=>document.getElementById('noveltyAssetHistory')?.scrollIntoView({behavior:'smooth',block:'start'})).catch(console.error);});
  window.addEventListener('skweb-synced',()=>selectCurrent().catch(console.error));
 });
})();
