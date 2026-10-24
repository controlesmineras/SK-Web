// Consulta y administración de movimientos de Plaza Blending.
(()=>{
'use strict';
const $=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let tab='delivery',reversing=false;
const store=()=>tab==='delivery'?'blendingDeliveries':'blendingIncomes';
const days=()=>tab==='delivery'?7:30;
const owner=()=>window.SKAdminAuth?.isOwner?.()===true;
function movementOperator(row,people,peopleByDocument){
  const document=String(row.actorDocument||row.operatorDocument||'').trim();
  const person=(document?peopleByDocument.get(document):null)||people.get(row.operatorId);
  return person?.nombre||row.operatorName||document||'No informado';
}
async function rows(){const cutoff=Date.now()-days()*86400000;return(await all(store())).filter(x=>!x.deleted&&Date.parse(x.createdAt||x.updatedAt||0)>=cutoff).sort((a,b)=>Date.parse(b.createdAt||b.updatedAt||0)-Date.parse(a.createdAt||a.updatedAt||0))}
function balanceLine(row){if(row.movementType==='REVERSIÓN')return '<small><b>Saldo anterior:</b> '+esc(row.balanceBefore)+' · <b>'+(row.stockDelta>0?'+ Cantidad reintegrada:':'− Cantidad retirada:')+'</b> '+esc(row.quantity)+' · <b>Nuevo saldo:</b> '+esc(row.balanceAfter)+'</small>';if(tab!=='delivery'||row.assetId)return'';if(row.movementType==='DEVOLUCIÓN')return '<small><b>Cantidad retornada:</b> '+esc(row.quantity)+' · <b>Nuevo saldo:</b> '+esc(row.balanceAfter??'No disponible')+'</small>';const before=Number(row.balanceBefore),quantity=Number(row.quantity),after=Number(row.balanceAfter);if(!Number.isFinite(before)||!Number.isFinite(quantity)||!Number.isFinite(after))return'<small><b>Saldo anterior:</b> No disponible · <b>Cantidad entregada:</b> '+esc(row.quantity||1)+' · <b>Nuevo saldo:</b> No disponible</small>';return'<small><b>Saldo anterior:</b> '+esc(before)+' · <b>Cantidad entregada:</b> '+esc(quantity)+' · <b>Nuevo saldo:</b> '+esc(after)+'</small>'}
async function render(){const list=$('#plazaMovementList'),status=$('#plazaMovementStatus');if(!list)return;document.querySelectorAll('[data-movement-tab]').forEach(button=>{const active=button.dataset.movementTab===tab;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active))});const result=await rows(),people=await all('personal'),assets=await all('assets'),names=new Map(people.map(x=>[x.id,x])),peopleByDocument=new Map(people.filter(x=>x.documento).map(x=>[String(x.documento).trim(),x]));status.textContent=(tab==='delivery'?result.length+' movimientos de entrega y devolución en los últimos 7 días':result.length+' ingresos en el último mes')+(owner()?'':' · Modo consulta');list.innerHTML=result.map(row=>{const isReturn=row.movementType==='DEVOLUCIÓN',isReversal=row.movementType==='REVERSIÓN',person=names.get(isReturn?row.returnedById:row.recipientId),operatorName=movementOperator(row,names,peopleByDocument),reversed=row.reversed===true||row.reversado===true,date=new Date(row.createdAt||row.updatedAt),actions=owner()&&!row.assetId&&!isReturn&&!isReversal&&!reversed&&row.deliveryType!=='PRÉSTAMO'?'<div class="rowActions"><button type="button" class="reverseBtn" data-reverse="'+esc(row.id)+'">REVERTIR</button></div>':'';return '<div class="row"'+(reversed?' style="background:#fff3cd;border-left:4px solid #b7791f"':isReversal?' style="background:#e9f6ed;border-left:4px solid #2f855a"':'')+'><div><b>'+(isReversal?'REVERSIÓN · ':isReturn?'DEVOLUCIÓN · ':'')+esc(row.itemName||row.itemId||'Elemento')+'</b><small>'+esc(date.toLocaleString('es-CO'))+(tab==='income'?' · Cantidad: '+esc(row.quantity||1):'')+'</small>'+balanceLine(row)+(tab==='delivery'&&(row.assetId||row.deliveryType||isReturn)?'<small>'+esc(window.SKAssetRules.movementLabel(row,assets)||row.assetId||'Cantidad: '+row.quantity+' '+(row.unit||'Unidad'))+'</small><small>'+esc(isReturn?'Regresa a Bodega de Superficie':'Tipo de entrega: '+(row.deliveryType||'No especificado'))+'</small>':'')+(tab==='delivery'?'<small>'+(isReturn?'Devuelve: ':'Recibe: ')+esc(person?.nombre||(isReturn?row.returnedByName:row.recipientName)||'No informado')+'</small>'+(isReturn?'<small>Fecha de devolución: '+esc(new Date(row.returnedAt||row.createdAt).toLocaleString('es-CO'))+'</small><small>Recibe en bodega: '+esc(operatorName)+'</small>':''):'')+(isReversal?'<small>Movimiento original: '+esc(new Date(row.originalCreatedAt).toLocaleString('es-CO'))+'</small>':'')+(row.reversalRequestedBy?'<small><b>Reversión solicitada por:</b> '+esc(row.reversalRequestedBy)+'</small>':'')+'<small><b>'+(isReversal?'Bodeguero del movimiento original:':'Bodeguero que registró:')+'</b> '+esc(operatorName)+'</small>'+(reversed?'<small><b>REVERSADO</b> · '+esc(row.reversedAt?new Date(row.reversedAt).toLocaleString('es-CO'):'')+'</small>':'')+'</div>'+actions+'</div>'}).join('')||'<p class="hint">No hay movimientos en este período.</p>'}
async function reverse(id){
 if(!owner())return alert('Tu rol permite consultar, pero no revertir movimientos.');
 if(reversing)return;
 const type=tab,row=(await rows()).find(x=>x.id===id);
 if(!row||row.reversed===true||row.reversado===true||row.movementType==='REVERSIÓN')return;
 const entered=prompt('Reversión solicitada por:\n\nEscribe el nombre de la persona que solicitó la reversión.');
 if(entered===null)return;
 const reversalRequestedBy=entered.trim();
 if(!reversalRequestedBy||reversalRequestedBy.length>200)return alert('Indica quién solicitó la reversión (máximo 200 caracteres).');
 if(!confirm('¿REVERTIR este '+(type==='delivery'?'registro de entrega':'registro de ingreso')+' de '+(row.quantity||1)+'?\n\n'+(type==='delivery'?'La cantidad se SUMARÁ a las existencias actuales.':'La cantidad se RESTARÁ de las existencias actuales.')+'\n\nSe creará un movimiento con la fecha y hora de la reversión. El original quedará REVERSADO y los saldos históricos se conservarán.\n\nReversión solicitada por: '+reversalRequestedBy))return;
 reversing=true;
 try{
  $('#plazaMovementStatus').textContent='Revirtiendo movimiento en la base central…';
  const result=await window.SKAdminAuth.request('adminReverseMovementV2',{type,movementId:id,reversalRequestedBy});
  if(typeof window.writeSyncedSnapshot==='function')await window.writeSyncedSnapshot(result.data);
  else for(const name of ['inventoryStock','blendingDeliveries','blendingIncomes'])if(Array.isArray(result.data?.[name])){await clearStore(name);for(const item of result.data[name])await put(name,item)}
  await refresh();await render();
  alert((result.alreadyApplied?'Esta reversión ya estaba registrada.':'Reversión registrada.')+' Nuevo saldo: '+result.movement.balanceAfter);
 }catch(error){
  const message=String(error?.message||error);
  alert('No se pudo revertir: '+(/Solicitud no válida/.test(message)?'Actualiza Code.gs y publica una nueva versión de la implementación existente antes de usar esta reversión.':message));await render();
 }finally{reversing=false}
}
window.addEventListener('load',()=>{$('.plazaMovementsBtn')?.addEventListener('click',async()=>{if(window.SKAdminNav?.go)await window.SKAdminNav.go('plazaMovements');else showView('plazaMovements');render()});document.querySelectorAll('[data-movement-tab]').forEach(button=>button.addEventListener('click',()=>{tab=button.dataset.movementTab;render()}));$('#plazaMovementList')?.addEventListener('click',event=>{const reverseButton=event.target.closest('[data-reverse]');if(reverseButton)reverse(reverseButton.dataset.reverse)});window.addEventListener('skweb-synced',()=>{if($('#plazaMovements')?.classList.contains('active'))render()});window.addEventListener('skadmin-permissions',()=>{if($('#plazaMovements')?.classList.contains('active'))render()})});
})();
