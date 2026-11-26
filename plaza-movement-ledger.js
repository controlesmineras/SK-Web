// Consulta compartida de Plaza Blending y SK Web. Los saldos son los guardados en cada movimiento.
(()=>{
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const format=new Intl.DateTimeFormat('es-CO',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false,timeZone:'America/Bogota'});
  const number=new Intl.NumberFormat('es-CO',{maximumFractionDigits:10});
  const types={all:'Todos',delivery:'Entregas',income:'Ingresos',reversal:'Reversiones',adjustment:'Ajustes',returned:'Devoluciones'};
  const labels={delivery:'Entrega',income:'Ingreso',reversal:'Reversión',adjustment:'Actualización de cantidad',returned:'Devolución'};
  const roles={owner:'Desarrollador-administrador',admin:'Administrador',assistant:'Auxiliar administrativo',plaza_admin:'Administrador de Plaza',plaza_assistant:'Auxiliar de Plaza',plaza_operator:'Bodeguero/a',plaza_supervisor:'Supervisor/a'};
  const timestamp=value=>Number.isFinite(Date.parse(value))?Date.parse(value):null;
  const dateLabel=time=>time===null?'Sin hora registrada':format.format(time);
  const amount=value=>value!=null&&value!==''&&Number.isFinite(Number(value))?Number(value):null;
  function entries(data){
    const result=[],criteria=new Map((data.inventoryCriteria||[]).map(item=>[item.id,item]));
    for(const [store,source] of [['blendingIncomes','income'],['blendingDeliveries','delivery'],['warehouseQuantityHistory','adjustment']]){
      const rows=data[store]||[],reversedIds=new Set(rows.filter(r=>!r.deleted&&r.reversalOf).map(r=>r.reversalOf));
      for(const row of rows){
        if(row.deleted||source==='adjustment'&&row.kind!=='quantity_adjustment')continue;
        const type=row.reversalOf||norm(row.movementType)==='reversion'?'reversal':norm(row.movementType)==='devolucion'?'returned':source;
        const criterion=criteria.get(row.itemId),item=row.itemName||criterion?.name||criterion?.CI_ELEMENTO||row.itemId||'Elemento';
        const register=timestamp(type==='reversal'?row.createdAt:row.recordedAt||row.createdAt);
        const original=type==='reversal'?row.originalCreatedAt:row.createdAt;
        const entry={row,type,source,item,register,original:timestamp(original),applied:timestamp(row.balanceAppliedAt),reversed:!!(row.reversed||row.reversado||row.reversedAt)};
        result.push(entry);
        if(entry.reversed&&type!=='reversal'&&row.reversedAt&&!reversedIds.has(row.id)){
          // Algunas versiones antiguas solo anotaban la reversión en la fila original.
          result.push({...entry,type:'reversal',legacy:true,reversed:false,register:timestamp(row.reversedAt),applied:null,
            row:{...row,balanceBefore:row.reversalBalanceBefore,balanceAfter:row.reversalBalanceAfter,stockDelta:null,syncState:'synced'}});
        }
      }
    }
    return result;
  }
  function compare(a,b,order){
    const time=e=>order==='balance'?(e.applied??e.register):e.register;
    const difference=(time(b)??-Infinity)-(time(a)??-Infinity);
    if(difference)return difference;
    const item=String(a.row.itemId||a.item).localeCompare(String(b.row.itemId||b.item),'es');
    if(item)return item;
    if(a.applied!==b.applied)return (b.applied??-Infinity)-(a.applied??-Infinity);
    return 0;
  }
  function ordered(rows,order){
    const sorted=rows.slice().sort((a,b)=>compare(a,b,order));
    // Los renglones de un mismo guardado antiguo comparten hora. Sus saldos indican el orden dentro del lote.
    const batches=new Map();
    sorted.forEach((e,i)=>{
      if(e.applied!==null||!e.row.syncEventId||!['delivery','income'].includes(e.type)||amount(e.row.balanceAfter)===null)return;
      const key=JSON.stringify([e.row.syncEventId,e.type,e.row.itemId,e.register]);
      if(!batches.has(key))batches.set(key,[]);batches.get(key).push(i);
    });
    for(const indices of batches.values()){
      const group=indices.map(i=>sorted[i]).sort((a,b)=>a.type==='delivery'?a.row.balanceAfter-b.row.balanceAfter:b.row.balanceAfter-a.row.balanceAfter);
      indices.forEach((index,i)=>{sorted[index]=group[i]});
    }
    return sorted;
  }
  function actor(e){
    const r=e.row;
    if(e.type==='adjustment'){
      return [r.recordedByName,r.recordedBy!==r.recordedByName?r.recordedBy:'',roles[r.recordedByRole]||r.recordedByRole].filter(Boolean).join(' · ')||'Sin identificar';
    }
    if(e.type==='reversal')return r.reversalRequestedBy?'Solicitada por '+r.reversalRequestedBy:'Solicitante sin registrar';
    return [r.operatorName||r.operatorDocument||r.actorDocument,roles[r.actorRole]||r.actorRole].filter(Boolean).join(' · ')||'Sin identificar';
  }
  function delta(e){
    const r=e.row;
    if(r.assetId)return null;
    if(e.type==='reversal')return amount(r.stockDelta)??(amount(r.balanceBefore)!==null&&amount(r.balanceAfter)!==null?r.balanceAfter-r.balanceBefore:null);
    if(e.type==='adjustment')return amount(r.delta);
    const qty=amount(r.quantity);return qty===null?null:(e.type==='delivery'?-qty:qty);
  }
  function mount(host,actions={}){
    host.innerHTML=`<div class="ledgerFilters"><label>Buscar elemento o persona<input type="search" data-search placeholder="Nombre, serial o responsable…"></label>
      <label>Ordenar por<select data-order><option value="registration">Hora de registro</option><option value="balance">Aplicación al saldo</option></select></label>
      <label>Desde<input type="date" data-from></label><label>Hasta<input type="date" data-to></label></div>
      <div class="ledgerTypes" aria-label="Filtrar movimientos">${Object.entries(types).map(([key,name])=>`<button type="button" data-kind="${key}" aria-pressed="${key==='all'}">${name}</button>`).join('')}</div>
      <div class="ledgerOptions"><label><input type="checkbox" data-skip-reversals> Omitir reversiones y originales reversados</label><label><input type="checkbox" data-skip-adjustments> Omitir ajustes de cantidad</label><label><input type="checkbox" data-balances checked> Mostrar saldos</label></div>
      <p class="ledgerSummary" role="status"></p><div class="ledgerRows"></div>
      <div class="ledgerPages"><button type="button" data-prev>Anterior</button><button type="button" data-next>Siguiente</button></div>`;
    const find=s=>host.querySelector(s),size=50;
    let all=[],kind='all',page=0;
    function paint(){
      const query=norm(find('[data-search]').value).split(/\s+/).filter(Boolean),order=find('[data-order]').value;
      const from=find('[data-from]').value,to=find('[data-to]').value;
      const start=from?Date.parse(from+'T00:00:00-05:00'):-Infinity,end=to?Date.parse(to+'T23:59:59.999-05:00'):Infinity;
      const skipReversals=find('[data-skip-reversals]').checked,skipAdjustments=find('[data-skip-adjustments]').checked,balances=find('[data-balances]').checked;
      const rows=ordered(all.filter(e=>{
        const r=e.row;
        if((kind!=='all'&&kind!==e.type)||skipAdjustments&&e.type==='adjustment'||skipReversals&&(e.type==='reversal'||e.reversed))return false;
        if((from||to)&&(e.register===null||e.register<start||e.register>end))return false;
        const text=norm([e.item,r.itemId,r.assetLabel,r.recipientName,r.broughtByName,r.returnedByName,r.shiftKeeperName,actor(e)].join(' '));
        return query.every(word=>text.includes(word));
      }),order);
      page=Math.min(page,Math.max(0,Math.ceil(rows.length/size)-1));
      const first=page*size,limit=Math.min(rows.length,first+size);
      find('.ledgerSummary').textContent=rows.length?(first+1)+'–'+limit+' de '+rows.length+' movimientos'+(order==='balance'?' · Para movimientos sin orden de aplicación guardado se usa la hora disponible.':''):'No hay movimientos con estos filtros.';
      const canReverse=actions.canReverse?.()===true;
      const columns=['Registro (Colombia)','Movimiento','Elemento','Cantidad',...(balances?['Anterior','Nuevo']:[]),'Responsable',...(canReverse?['Acción']:[])];
      const cell=(label,html)=>'<td data-label="'+label+'">'+html+'</td>';
      find('.ledgerRows').innerHTML=rows.length?'<table><thead><tr>'+columns.map(c=>'<th scope="col">'+c+'</th>').join('')+'</tr></thead><tbody>'+rows.slice(first,limit).map(e=>{
        const r=e.row,d=delta(e);
        const qty=d===null?(r.assetId?esc(r.quantity??1):'—'):(d>0?'+':'')+number.format(d);
        const note=e.legacy?'Consta en el registro original':e.reversed?'Reversado':r.syncState==='pending'?'Pendiente de sincronización':'';
        const detail=e.type==='reversal'?'Movimiento original':e.original!==e.register?'Fecha del movimiento':'';
        const historical=e.type==='adjustment'&&(!r.recordedByRole||r.registrationClock==='central')?'Hora conservada en la base central':'';
        const small=text=>text?'<small>'+esc(text)+'</small>':'';
        const time=esc(dateLabel(e.register))+small(historical)+(detail&&e.original!==null?small(detail+' · '+dateLabel(e.original)):'');
        const recipient=r.returnedByName||r.recipientName||r.broughtByName;
        return '<tr data-type="'+e.type+'">'+cell(columns[0],time)+cell('Movimiento','<b>'+labels[e.type]+'</b>'+small(note))+cell('Elemento','<b>'+esc(e.item)+'</b>'+small(r.assetLabel))+cell('Cantidad',qty)+
          (balances?['balanceBefore','balanceAfter'].map((key,i)=>cell(i?'Nuevo':'Anterior',amount(r[key])===null?'—':number.format(r[key]))).join(''):'')+
          cell('Responsable',esc(actor(e))+(e.type==='delivery'||e.type==='income'||e.type==='returned'?small(recipient?(e.type==='income'?'Trae: ':e.type==='returned'?'Devuelve: ':'Recibe: ')+recipient:'')+small(r.shiftKeeperName?'Bodeguero/a: '+r.shiftKeeperName:''):''))+(canReverse?cell('Acción',!e.reversed&&!r.assetId&&['income','delivery'].includes(e.type)&&norm(r.deliveryType)!=='prestamo'&&r.syncState!=='pending'?'<button type="button" data-reverse-id="'+esc(r.id)+'" data-source="'+e.source+'">Revertir</button>':''):'')+'</tr>';
      }).join('')+'</tbody></table>':'';
      find('.ledgerPages').hidden=rows.length<=size;find('[data-prev]').disabled=page===0;find('[data-next]').disabled=limit===rows.length;
    }
    host.addEventListener('input',()=>{page=0;paint()});
    host.addEventListener('click',event=>{
      const button=event.target.closest('button');if(!button)return;
      if(button.dataset.reverseId){actions.reverse?.(button.dataset.reverseId,button.dataset.source);return}
      if(button.dataset.kind){
        kind=button.dataset.kind;page=0;
        if(kind==='reversal')find('[data-skip-reversals]').checked=false;
        if(kind==='adjustment')find('[data-skip-adjustments]').checked=false;
        host.querySelectorAll('[data-kind]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
      }else if(button.hasAttribute('data-prev'))page--;else if(button.hasAttribute('data-next'))page++;else return;
      paint();
    });
    return data=>{all=entries(data);paint()};
  }
  window.SKPlazaLedger={entries,ordered,mount};
})();
