// Revisión y descarte individual de cambios pendientes en este dispositivo.
(()=>{
  'use strict';
  const button=document.querySelector('#adminPendingRecords');
  const labels={personal:'Colaborador',assets:'Activo fijo',novelties:'Novedad de activo',parts:'Repuesto',consumptions:'Consumo',incomes:'Ingreso',inventoryCriteria:'Criterio de inventario',inventoryStock:'Existencia',blendingIncomes:'Ingreso Plaza Blending',blendingDeliveries:'Entrega Plaza Blending',actas:'Documento'};
  let dialog,list,status,entries=[],busy=false,renderVersion=0;
  const text=value=>String(value??'').trim();
  const name=row=>text(row?.name||row?.nombre||row?.elemento||row?.CI_ELEMENTO);
  function identify(store,row,lookup){
    if(store==='personal')return [row.nombre||[row.primerNombre,row.primerApellido].filter(Boolean).join(' '),row.documento].filter(Boolean).join(' · ');
    if(store==='assets')return typeof assetLabel==='function'?assetLabel(row):[row.clase,row.nuevaMarca,row.marcaInterna,row.marcaAnterior,row.serial].filter(Boolean).join(' · ');
    if(store==='actas')return [row.tipo||'ACTA',row.consecutivo,row.asunto||row.motivo].filter(Boolean).join(' · ');
    const asset=lookup.assets.get(row.assetId),item=lookup.inventoryCriteria.get(row.itemId),part=lookup.parts.get(row.partId);
    return [row.descripcion,name(row)||name(item)||row.nombreRepuesto||name(part),asset&&(typeof assetLabel==='function'?assetLabel(asset):asset.clase),row.numero||row.noItem,row.cantidad!=null?`Cantidad: ${row.cantidad}`:row.quantity!=null?`Cantidad: ${row.quantity}`:''].filter(Boolean).join(' · ')||text(row.id)||'Registro sin descripción';
  }
  function node(tag,value,className){const element=document.createElement(tag);if(value)element.textContent=value;if(className)element.className=className;return element;}
  async function render(){
    if(!dialog?.open)return;
    const version=++renderVersion;
    try{
      const pending=await window.skSyncApi.pendingRecords();
      const tables=await Promise.all(['assets','inventoryCriteria','parts'].map(all));
      if(version!==renderVersion||!dialog.open)return;
      const lookup=Object.fromEntries(['assets','inventoryCriteria','parts'].map((store,index)=>[store,new Map(tables[index].map(row=>[row.id,row]))]));
      entries=pending.map(entry=>({...entry,title:identify(entry.store,entry.row,lookup)}));
      list.replaceChildren();
      for(const [index,entry]of entries.entries()){
        const card=node('article',null,'pendingRecord'),info=node('div'),type=labels[entry.store]||entry.store;
        info.append(node('small',type),node('strong',entry.title));
        const date=new Date(entry.row.updatedAt||entry.row.createdAt||'');
        if(!Number.isNaN(date.getTime()))info.append(node('small',date.toLocaleString('es-CO')));
        if(entry.row.deleted)info.append(node('small','Eliminación pendiente'));
        const discard=node('button','Descartar');discard.type='button';discard.dataset.pendingIndex=String(index);discard.disabled=busy;
        discard.setAttribute('aria-label',`Descartar pendiente: ${type} · ${entry.title}`);
        card.append(info,discard);list.append(card);
      }
      if(!entries.length)list.append(node('p','No hay registros pendientes en este dispositivo.','hint'));
      dialog.querySelector('[data-pending-count]').textContent=`${entries.length} ${entries.length===1?'registro sin sincronizar':'registros sin sincronizar'}`;
    }catch(error){status.textContent=error.message||String(error);}
  }
  function mount(){
    if(dialog)return;
    const style=node('style');
    style.textContent=`#adminPendingDialog{box-sizing:border-box;width:min(680px,calc(100% - 24px));max-height:85dvh;padding:20px;border:1px solid #b8cedd;border-radius:16px;background:#f4f8fb;color:#173d59;box-shadow:0 18px 45px #0004}#adminPendingDialog::backdrop{background:#071926a3}#adminPendingDialog .pendingHeader{display:flex;align-items:center;justify-content:space-between;gap:12px}#adminPendingDialog h2{margin:0;font-size:1.2rem}#adminPendingDialog p{line-height:1.45}#adminPendingDialog [data-pending-close]{background:#e1ebf2;color:#173d59;min-height:44px}#adminPendingDialog [data-pending-list]{display:grid;gap:10px}#adminPendingDialog .pendingRecord{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px;border:1px solid #c6d8e5;border-radius:12px;background:#fff;overflow-wrap:anywhere}#adminPendingDialog .pendingRecord>div{display:grid;gap:5px;min-width:0}#adminPendingDialog small{color:#536d7f}#adminPendingDialog .pendingRecord button{flex-shrink:0;background:#fff1ef;color:#9e2d28;border:1px solid #e5b9b4;min-height:44px}#adminPendingDialog [data-pending-status]{color:#8d342b;white-space:pre-line}#adminPendingRecords{margin-top:0!important;min-height:48px!important;font-size:.9rem!important}@media(max-width:440px){#adminPendingDialog .pendingRecord{align-items:stretch;flex-direction:column}#adminPendingDialog .pendingRecord button{align-self:flex-end}}`;
    document.head.append(style);
    dialog=node('dialog');dialog.id='adminPendingDialog';dialog.setAttribute('aria-labelledby','adminPendingTitle');
    dialog.innerHTML='<div class="pendingHeader"><h2 id="adminPendingTitle">Registros sin sincronizar</h2><button type="button" data-pending-close>Cerrar</button></div><p>Solo se muestran los cambios pendientes de este dispositivo. Descarta únicamente el registro que quieras quitar del próximo envío.</p><p data-pending-count></p><p data-pending-status role="status" aria-live="polite"></p><div data-pending-list></div>';
    document.body.append(dialog);list=dialog.querySelector('[data-pending-list]');status=dialog.querySelector('[data-pending-status]');
    dialog.querySelector('[data-pending-close]').addEventListener('click',()=>dialog.close());
    dialog.addEventListener('close',()=>{renderVersion++;button.focus();});
    dialog.addEventListener('click',async event=>{
      const target=event.target.closest('[data-pending-index]');if(!target||busy)return;
      const entry=entries[Number(target.dataset.pendingIndex)];if(!entry)return;
      if(!confirm(`¿Descartar este cambio pendiente?\n\n${labels[entry.store]||entry.store}: ${entry.title}\n\nSe quitará de este dispositivo. Si ya existe una versión en la base central, se recuperará al sincronizar. Esta acción no elimina datos de la base central.`))return;
      busy=true;dialog.querySelectorAll('[data-pending-index]').forEach(item=>item.disabled=true);
      status.textContent='Descartando… Si hay una sincronización en curso, se esperará su respuesta.';
      try{
        await window.skSyncApi.discardPending(entry.store,entry.row);
        status.textContent=navigator.onLine?'Registro descartado. Reintentando la sincronización…':'Registro descartado. La sincronización se reintentará cuando haya internet.';
        try{await refresh();window.SKInventoryAdmin?.render?.();window.dispatchEvent(new Event('skweb-inventory-refresh'));}catch(error){console.error('Actualización de listas tras descartar:',error);}
      }catch(error){status.textContent=error.message||String(error);}
      finally{busy=false;await window.SKAdminSyncUI?.refresh?.();await render();}
    });
  }
  button?.addEventListener('click',()=>{
    if(!window.SKAdminAuth?.ready?.())return;
    mount();status.textContent='';if(!dialog.open)dialog.showModal();render();
  });
  for(const event of ['skweb-synced','skweb-local-change','skweb-inventory-refresh'])window.addEventListener(event,()=>{if(!busy)render();});
  window.addEventListener('skadmin-permissions',()=>{if(!window.SKAdminAuth?.ready?.())dialog?.close();});
})();
