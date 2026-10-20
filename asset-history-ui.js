(()=>{
 'use strict';
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';');
 const identity=p=>[p.name,p.document&&'Doc. '+p.document].filter(Boolean).join(' · ')||'No registrado';
 const label=asset=>typeof assetLabel==='function'?assetLabel(asset):asset.clase||'Activo';
 const versions=new Map();
 async function read(){const names=['personal','novelties','blendingIncomes','blendingDeliveries'];return Object.fromEntries(await Promise.all(names.map(async name=>[name,await all(name)])));}
 function eventHTML(entry,asset,acta){
  const responsibleLabel={assignment:'Recibe',loan:'Recibe en préstamo',income:'Trae',return:'Devuelve',novelty:'Responsable'}[entry.kind];
  const warehouseLabel=['assignment','loan'].includes(entry.kind)?'Entrega (bodeguero/a)':entry.kind==='novelty'?'Bodeguero/a':'Recibe en bodega';
  const row=entry.raw,stamp=entry.date?entry.date.split('-').reverse().join('/')+' · '+entry.time+' (Colombia)':'Fecha no registrada';
  return `<article class="assetHistoryEntry${entry.reversed?' isReversed':''}"><b>${escape(entry.title)}${entry.reversed?' · REVERTIDO':''}</b><small>${escape(stamp)} · ${entry.source==='novelties'?'SK Web':'Plaza Blending'}${entry.pending?' · Pendiente de sincronización':''}</small>${asset?`<small>${escape(label(asset))}</small>`:''}<small>${escape(responsibleLabel)}: <strong>${escape(identity(entry.responsible))}</strong></small><small>${escape(warehouseLabel)}: <strong>${escape(identity(entry.warehouse))}</strong></small><small>${escape([entry.location,entry.state].filter(Boolean).join(' · '))}</small>${row.notes||row.observaciones?`<small>${escape(row.notes||row.observaciones)}</small>`:''}${window.SKNoveltyForm?.actaHTML?.(row,acta)||''}${row.estadoVisor?`<small>Color del visor: ${escape(row.estadoVisorAnterior||'Sin registrar')} → ${escape(row.estadoVisor)}</small>`:''}</article>`;
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
  const draw=expanded=>{const shown=expanded?events:events.slice(0,10);box.innerHTML=`<h3>Últimas novedades del activo</h3><p class="hint">${escape(label(asset))}</p><p class="hint">${shown.length} de ${events.length} novedades · Más recientes primero.</p>${shown.map(entry=>eventHTML(entry,null,actaMap.get(entry.raw.actaId))).join('')||'<p class="hint">Este activo aún no tiene novedades registradas.</p>'}${events.length>10?`<button type="button" class="historyMore">${expanded?'Mostrar últimas 10':'Ver las '+events.length+' novedades'}</button>`:''}`;box.querySelector('.historyMore')?.addEventListener('click',()=>draw(!expanded));};draw(false);
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
  list.innerHTML=events.slice(0,100).map(entry=>`<div class="assetHistoryResult">${eventHTML(entry,assetMap.get(entry.assetId),actaMap.get(entry.raw.actaId))}<button type="button" data-history-asset="${escape(entry.assetId)}">Ver historial del activo</button></div>`).join('')||'<p class="hint">No hay novedades que coincidan con los filtros.</p>';
  const counter=document.querySelector('#nCount');if(counter)counter.textContent=window.SKAssetHistory.timeline(data).filter(entry=>!entry.reversed).length;
  await selectCurrent();
 }
 async function selectCurrent(){await Promise.all([select('asset',document.querySelector('#assetForm [name="id"]')?.value),select('novelty',document.querySelector('#novAsset')?.value)]);}
 window.SKAssetHistoryUI={read,show,select,renderList};
 window.addEventListener('load',()=>{
  const style=document.createElement('style');style.textContent='.assetHistory{margin:0 0 20px;padding:16px;border:1px solid #ccd8e0;border-radius:12px;background:#f8fafc}.assetHistory[hidden]{display:none}.assetHistory h3{margin:0 0 8px}.assetHistoryEntry{padding:12px 0;border-bottom:1px solid #dce4ea;overflow-wrap:anywhere}.assetHistoryEntry>b,.assetHistoryEntry>small{display:block;margin-bottom:5px}.assetHistoryEntry>small{line-height:1.45;color:#3c4b59}.assetHistoryEntry.isReversed{border-left:3px solid #ab6a21;padding-left:10px}.assetHistoryResult{padding:10px 0;border-bottom:1px solid #dce4ea}.assetHistoryResult button,.assetHistory .historyMore{margin-top:10px;width:auto}.assetHistoryEntry strong{font-weight:600}';document.head.append(style);
  document.querySelector('#novAsset')?.addEventListener('change',event=>select('novelty',event.target.value).catch(console.error));
  document.querySelector('#assetForm')?.addEventListener('reset',()=>{versions.set('asset',(versions.get('asset')||0)+1);show('asset',null,[]);});
  document.querySelector('#noveltyList')?.addEventListener('click',event=>{const button=event.target.closest('[data-history-asset]');if(!button)return;const selectAsset=document.querySelector('#novAsset');selectAsset.value=button.dataset.historyAsset;selectAsset.dispatchEvent(new Event('change',{bubbles:true}));select('novelty',selectAsset.value).then(()=>document.getElementById('noveltyAssetHistory')?.scrollIntoView({behavior:'smooth',block:'start'})).catch(console.error);});
  window.addEventListener('skweb-synced',()=>selectCurrent().catch(console.error));
 });
})();
