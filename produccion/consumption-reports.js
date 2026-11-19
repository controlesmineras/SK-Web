/* Consultas de solo lectura sobre la copia local de Mecánica. */
(()=>{
 'use strict';
 const el=id=>document.getElementById(id);
 const number=new Intl.NumberFormat('es-CO',{maximumFractionDigits:2});
 const monthName=new Intl.DateTimeFormat('es-CO',{month:'long',timeZone:'UTC'});
 const localStamp=new Intl.DateTimeFormat('es-CO',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true,timeZone:'America/Bogota'});
 const iso=date=>date.toISOString().slice(0,10);
 const utc=day=>new Date(day+'T00:00:00Z');
 const formatDay=day=>day.split('-').reverse().join('/');
 const monthLabel=key=>monthName.format(utc(key+'-01'))+' '+key.slice(0,4);
 function monthEnd(year,month){return iso(new Date(Date.UTC(year,month,0)))}
 function rollingRange(today){
  const end=utc(today);
  const target=new Date(Date.UTC(end.getUTCFullYear(),end.getUTCMonth()-3,1));
  const last=Number(monthEnd(target.getUTCFullYear(),target.getUTCMonth()+1).slice(-2));
  target.setUTCDate(Math.min(end.getUTCDate(),last)+1);
  return {from:iso(target),to:today};
 }
 function periods(state,origin,today){
  const known=new Map();
  for(const row of [...(state.inventoryClosures||[]),...(state.inventoryLatest||[])]){
   if(row.origin===origin&&(!row.status||row.status==='closed')&&row.date<=today&&row.closedAt)known.set(row.id,row);
  }
  const cuts=Array.from(known.values()).sort((a,b)=>a.date.localeCompare(b.date)||Date.parse(a.closedAt)-Date.parse(b.closedAt));
  return cuts.map((start,i)=>{
   const end=cuts[i+1];
   return {key:start.id,from:start.date,to:end?.date||today,start,end};
  }).reverse();
 }
 function afterCut(row,cut){
  if(row.fechaISO!==cut.date)return row.fechaISO>cut.date;
  return Date.parse(row.recordedAt||row.createdAt)>Date.parse(cut.closedAt);
 }
 function selectedOrigin(){
  return el('consumptionInventory').querySelector('input:checked').value;
 }
 function movementOrigin(row,asset){
  const stored=String(row.origen??'').trim().replace(/\s+/g,'');
  const full=/^(yt|columna)(28|29)$/i.exec(stored);
  if(full)return (full[1].toLowerCase()==='yt'?'YT':'Columna')+full[2];
  // Algunos registros antiguos guardaban solo el número de inventario.
  const type=String(row.tipoEquipo||asset?.clase||'').trim().toLowerCase();
  const model=/^(?:yt|columna)?\s*(28|29)a?$/i.exec(stored||String(row.modelo||asset?.modelo||'').trim());
  if(!model||!['yt','columna'].includes(type))return '';
  return (type==='yt'?'YT':'Columna')+model[1];
 }
 function consumptionMovements(state){
  const assets=new Map((state.assets||[]).map(row=>[row.id,row]));
  const records=new Map((state.consumptions||[]).map(row=>[row.id,row]));
  for(const row of state.pending||[]){
   if(!row.kind&&!row.syncRejected&&!records.has(row.id))records.set(row.id,row);
  }
  return Array.from(records.values()).filter(row=>!row.deleted&&!row.syncRejected).map(row=>{
   const origen=movementOrigin(row,assets.get(row.assetId));
   return origen===row.origen?row:{...row,origen};
  });
 }
 function aggregate(context,origin,range){
  const {state,catalog,compareParts,incomeMovements}=context;
  const parts=window.SKSpareCatalog.filter(catalog(),origin.replace(/\d+$/,''),origin);
  const rows=new Map(),aliases=new Map();
  function add(part,active){
   const row={part,active,income:0,consumed:0,days:new Map()};
   rows.set(part.id,row);
   return row;
  }
  for(const part of parts){
   const row=add(part,true);
   aliases.set(part.id,row);
   if(part.criterionId)aliases.set(part.criterionId,row);
  }
  const criteria=new Map();
  for(const item of state.inventoryCriteria||[]){
   if(window.SKSpareCatalog.equipment(item)!==origin.toLowerCase())continue;
   criteria.set(item.id,item);
   const row=rows.get(item.productionPartId);
   if(row)aliases.set(item.id,row);
  }
  const legacy=new Map((state.parts||[]).filter(part=>window.SKSpareCatalog.equipment(part)===origin.toLowerCase()).map(part=>[part.id,part]));
  function count(movement,income){
   const {fechaISO:day,cantidad,partId}=movement;
   if(!partId||movement.deleted||movement.syncRejected||movement.origen!==origin||!day||day<range.from||day>range.to)return;
   if(range.start&&!afterCut(movement,range.start)||range.end&&afterCut(movement,range.end))return;
   const qty=Number(cantidad);
   if(!Number.isFinite(qty)||qty<=0)return;
   let row=aliases.get(partId);
   if(!row){
    // Un repuesto retirado puede conservar movimientos con su identificador anterior.
    const criterion=criteria.get(partId),id=criterion?.productionPartId||partId,old=legacy.get(id);
    row=rows.get(id)||add({id,numero:movement.noItem||criterion?.spareItemNumber||old?.numero||'',
     nombre:movement.nombreRepuesto||criterion?.spareItemName||old?.nombre||id},false);
    aliases.set(partId,row);
   }
   if(income)row.income+=qty;
   else{
    row.consumed+=qty;
    row.days.set(day,(row.days.get(day)||0)+qty);
   }
  }
  for(const row of incomeMovements(state))if(row.kind==='income'||row.kind==='warehouse-return')count({...row,origen:movementOrigin(row)},true);
  for(const row of consumptionMovements(state))count(row,false);
  return Array.from(rows.values()).sort((a,b)=>compareParts(a.part,b.part));
 }
 function rank(rows,stockFor,origin){
  return rows.filter(row=>row.consumed>0).sort((a,b)=>b.consumed-a.consumed).map(row=>{
   const stock=row.active?stockFor(row.part,origin):null;
   const average=row.consumed/3;
   return {...row,stock,average,coverage:stock===null?null:Math.max(0,stock)/average};
  });
 }
 function options(select,items){
  const previous=select.value;
  select.replaceChildren(...items.map(([value,text])=>new Option(text,value)));
  if(items.some(([value])=>value===previous))select.value=previous;
 }
 function monthsBetween(from,to){
  const result=[],d=utc(from.slice(0,7)+'-01');
  while(iso(d)<=to){
   result.push(iso(d).slice(0,7));
   d.setUTCMonth(d.getUTCMonth()+1);
  }
  return result;
 }
 function daysBetween(from,to){
  const days=[],day=utc(from);
  while(iso(day)<=to){days.push(iso(day));day.setUTCDate(day.getUTCDate()+1)}
  return days;
 }
 function make(tag,value){
  const node=document.createElement(tag);
  if(value!=null)node.textContent=value;
  return node;
 }
 function column(row,text,scope='col'){
  const node=make('th',text);node.scope=scope;row.append(node);return node;
 }
 function cutLabel(cut){
  const stamp=new Date(cut.closedAt);
  const [date,time]=localStamp.format(stamp).split(', ');
  return date===formatDay(cut.date)&&time?date+' '+time:formatDay(cut.date)+' (cierre '+localStamp.format(stamp)+')';
 }
 function drawSheet(rows,days){
  const table=el('sheetTable'),months=make('tr'),headers=make('tr');
  for(const title of ['Ítem','Repuesto','Ingresos','Total consumido'])column(months,title).rowSpan=2;
  let previous='',group;
  for(const day of days){
   const month=day.slice(0,7);
   if(month!==previous){group=column(months,monthLabel(month),'colgroup');previous=month}
   else group.colSpan++;
   column(headers,String(Number(day.slice(-2))));
  }
  table.tHead.replaceChildren(months,headers);
  table.tBodies[0].replaceChildren(...rows.map(({part,income,consumed,days:daily})=>{
   const tr=make('tr');
   tr.append(make('td',part.numero||'—'));
   column(tr,part.nombre,'row');
   tr.append(make('td',number.format(income)),make('td',number.format(consumed)));
   for(const day of days){
    const cell=make('td',daily.has(day)?number.format(daily.get(day)):'—');
    if(daily.has(day))cell.className='hasConsumption';
    tr.append(cell);
   }
   return tr;
  }));
 }
 function sheet(context){
  const {state,today}=context,origin=selectedOrigin(),byPeriod=el('sheetMode').value==='period';
  const note=el('sheetDates'),history=el('sheetHistoryNote'),scroll=el('sheetScroll'),pageField=el('sheetPageField');
  const month=el('sheetMonth'),year=el('sheetYear');
  if(!month.options.length){
   options(month,Array.from({length:12},(_,i)=>{
    const key=String(i+1).padStart(2,'0');return [key,monthName.format(utc('2000-'+key+'-01'))];
   }));
   month.value=today.slice(5,7);year.value=today.slice(0,4);
  }
  el('sheetMonthField').hidden=el('sheetYearField').hidden=byPeriod;
  el('sheetPeriodField').hidden=!byPeriod;
  history.hidden=true;pageField.hidden=true;scroll.hidden=true;
  if(!Array.isArray(state.consumptions)||!Array.isArray(state.incomes)){note.textContent='Sincroniza Producción para cargar los movimientos.';return}
  let range;
  if(byPeriod){
   const list=periods(state,origin,today),select=el('sheetPeriod');
   const choices=list.map(p=>[p.key,formatDay(p.from)+' – '+(p.end?formatDay(p.to):'Hoy (abierto)')]);
   options(select,choices);
   select.disabled=!list.length;
   if(!Array.isArray(state.inventoryClosures)){
    history.hidden=false;history.textContent='Para cargar el historial completo de cierres, actualiza el servicio de sincronización y sincroniza Producción.';
   }
   range=list.find(item=>item.key===select.value);
   if(!range){note.textContent='No hay cierres disponibles para '+origin+'. Puedes consultar los movimientos por mes.';return}
   note.textContent='Desde el corte del '+cutLabel(range.start)+(range.end?' hasta el corte del '+cutLabel(range.end):' hasta hoy, '+formatDay(today))+'.';
  }else{
   if(!year.value||!year.validity.valid){note.textContent='Escribe un año válido.';return}
   const key=year.value.padStart(4,'0')+'-'+month.value;
   range={from:key+'-01',to:monthEnd(Number(year.value),Number(month.value))};
   note.textContent='Del '+formatDay(range.from)+' al '+formatDay(range.to)+'.';
  }
  const rows=aggregate(context,origin,range);
  if(!rows.length){note.textContent+=' No hay repuestos en este inventario.';return}
  let from=range.from,to=range.to;
  const months=monthsBetween(from,to);
  if(months.length>3){
   const select=el('sheetPage');
   options(select,months.map(key=>[key,monthLabel(key)]));
   from=from.slice(0,7)===select.value?from:select.value+'-01';
   to=to.slice(0,7)===select.value?to:monthEnd(Number(select.value.slice(0,4)),Number(select.value.slice(-2)));
   pageField.hidden=false;note.textContent+=' Los totales corresponden a todo el período.';
  }
  drawSheet(rows,daysBetween(from,to));scroll.hidden=false;
 }
 function dashboard(context){
  const {state,today,stockFor}=context,origin=selectedOrigin();
  const note=el('dashboardDates'),results=el('dashboardResults');
  results.hidden=true;
  if(!Array.isArray(state.consumptions)||!Array.isArray(state.incomes)){note.textContent='Sincroniza Producción para cargar los movimientos.';return}
  const range=rollingRange(today),rows=rank(aggregate(context,origin,range),stockFor,origin);
  note.textContent='Últimos tres meses · '+formatDay(range.from)+' al '+formatDay(range.to)+'.';
  if(!rows.length){note.textContent+=' Sin consumos registrados en '+origin+' durante este período.';return}
  const max=rows[0].consumed;
  el('consumptionRanking').replaceChildren(...rows.map(({part,consumed})=>{
   const item=make('li'),label=make('span',[part.numero,part.nombre].filter(Boolean).join(' · '));
   const value=make('strong',number.format(consumed)),track=make('div'),bar=make('div');
   track.className='rankTrack';track.setAttribute('aria-hidden','true');
   bar.style.width=(consumed/max*100)+'%';track.append(bar);item.append(label,value,track);return item;
  }));
  el('dashboardTable').tBodies[0].replaceChildren(...rows.map(({part,consumed,average,stock,coverage})=>{
   const row=make('tr');row.append(make('td',part.numero||'—'));column(row,part.nombre,'row');
   for(const value of [consumed,average,stock,coverage])row.append(make('td',value==null?'—':value>0&&value<0.01?'< 0,01':number.format(value)));
   return row;
  }));
  results.hidden=false;
 }
 function render(context){
  if(!el('consumptionSheet').hidden)sheet(context);
  else if(!el('consumptionDashboard').hidden)dashboard(context);
 }
 window.SKConsumptionReports={render,periods,rollingRange,aggregate,rank,selectedOrigin,consumptionMovements};
})();
