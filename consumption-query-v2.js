// Consultas SK Web v20 - rango de fechas en Excel por repuesto
(()=>{
const norm=v=>(v??'').toString().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const localISO=d=>{const z=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`};
const dayOf=(x,localCreation)=>{const r=x.fechaISO||'';if(/^\d{4}-\d{2}-\d{2}$/.test(r))return r;const m=(x.fechaLocal||'').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);return m?`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`:window.SKMovementTime.day(window.SKMovementTime.registered(x,localCreation))};
const timeKey=x=>{const t=x.time||'',m=t.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(a\.?\s*m\.?|p\.?\s*m\.?)?/i);if(!m)return t;let h=+m[1],ap=(m[4]||'').toLowerCase();if(ap.includes('p')&&h<12)h+=12;if(ap.includes('a')&&h===12)h=0;return `${String(h).padStart(2,'0')}:${m[2]}:${m[3]||'00'}`};
const fmt=d=>{if(!d)return'';const[y,m,x]=d.split('-');return `${x}/${m}/${y}`},esc=s=>(s??'').toString().replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const markNo=a=>String(a?.numeroMarcaActual||a?.marcaNumero||a?.marcaAnterior||'').trim();
const mineOf=a=>String(a?.mina||a?.minaPropietaria||'').trim();
const external=a=>{const m=norm(mineOf(a));return !!m&&!['sandra k','sandra k.','sk 3.7','sk'].includes(m)};
function romanToInt(s){s=String(s||'').trim().toUpperCase();if(!/^[IVXLCDM]+$/.test(s))return'';const v={I:1,V:5,X:10,L:50,C:100,D:500,M:1000};let n=0;for(let i=0;i<s.length;i++)n+=(v[s[i]]<(v[s[i+1]]||0))?-v[s[i]]:v[s[i]];return n||''}
let mode='detail',orders=[],lastRows=[],renderSequence=0;
const desktopQuery=window.matchMedia('(min-width: 901px)');
const productionQuery=()=>document.querySelector('#queries')?.hasAttribute('data-compact-detail');
const compactDetail=()=>productionQuery()&&!desktopQuery.matches&&mode==='detail';
const defaultOrder=()=>compactDetail()?[{field:'date',dir:'desc'},{field:'time',dir:'desc'}]:[{field:'date',dir:'asc'},{field:'item',dir:'asc'}];
function invKey(c,a){const x=a.get(c.assetId)||{},t=/columna/i.test(x.clase||c.tipoEquipo||'')?'Columna':'YT',m=(c.origen||'').replace(/[^0-9]/g,'')||x.modelo||'';return `${t} ${m}`.trim()}
function historicalMarkNo(c){const direct=String(c.numeroMarcaActual||c.marcaNumero||'').trim();if(direct)return direct;const raw=String(c.assetLabel||c.maquina||'').trim(),parts=raw.split(/\s+-\s+/);for(const p of parts){const n=romanToInt(p);if(n)return String(n)}return''}
function machineShort(c,a){const x=a.get(c.assetId),n=x&&markNo(x);return String(n||historicalMarkNo(c)||'').trim()}
function productionMachine(row,asset,model,mark){
 const type=String(asset?.clase||row.tipoEquipo||'').trim();
 const family=/^yt/i.test(type)?'YT':/^columna/i.test(type)?'Columna':'';
 const parsed=/^(?:(YT|Columna)[ -]*)?(28|29)(A?)$/i.exec(model);
 let modelLabel=model;
 if(parsed){
  const prefix=parsed[1]?(/^yt$/i.test(parsed[1])?'YT':'Columna'):family;
  modelLabel=prefix+(prefix==='Columna'?' ':'')+parsed[2]+parsed[3].toUpperCase();
 }
 const mine=external(asset)?mineOf(asset):'';
 const currentMark=String(asset?.marcaActual||asset?.marcaInterna||'').trim();
 // Cuando el activo guarda P2 y su equivalencia 2, conserva el prefijo registrado.
 const series=/^[A-Z]+(\d+)$/i.exec(currentMark);
 const number=series&&series[1]===mark?currentMark:mark||currentMark;
 return {label:[modelLabel,number].filter(Boolean).join(' ')||'—',mine};
}
function machineText(entry){return [entry.label,entry.mine].filter(Boolean).join(' ')}
function machineCell(row){
 const machines=row.equipment||[{label:row.machine||'—',mine:row.external?(row.mine||'EXTERNO'):''}];
 const labels=machines.map(({label,mine})=>{
  if(row.equipment&&mine)return `<b class="externalMachine">${esc(label)} ${esc(mine)}</b>`;
  return `<b>${esc(label)}</b>${mine?` <span class="externalBadge">${esc(mine)}</span>`:''}`;
 });
 return '<td>'+labels.join(' / ')+'</td>';
}
const partOrderFields=['item','name','qty','stock'];
const fields={date:'Fecha',time:'Registro',item:'# DE ÍTEM',machine:'Máquina',model:'Modelo',inv:'Inventario',name:'Repuesto',qty:'Cantidad',stock:'Saldo actual'};
function inventoryMismatch(model,inv){
 const key=v=>norm(v).replace(/[^a-z0-9]/g,'');
 let m=key(model),i=key(inv);
 if(!m||!i)return false;
 if(/^\d+$/.test(m))m=(i.startsWith('columna')?'columna':'yt')+m;
 return m!==i;
}
function inventoryCell(r){return `<td${r.inventoryMismatch?' style="background:#fff0b3;color:#713f12;font-weight:700" title="Inventario diferente del modelo"':''}>${esc(r.inv)}${r.inventoryMismatch?' <span aria-label="Inventario diferente del modelo">⚠</span>':''}</td>`}
function val(r,k){if(k==='stock')return r.stock??null;if(k==='date')return r.date||'';if(k==='time')return timeKey(r);if(k==='item')return r.item&&r.item!=='—'?r.item:null;return r[k]??''}
function cmpVal(a,b,k){const x=val(a,k),y=val(b,k);if(k==='item'){const ax=x!==null,by=y!==null;if(ax!==by)return ax?-1:1;if(!ax)return String(a.name||'').localeCompare(String(b.name||''),'es',{sensitivity:'base'});const an=Number(x),bn=Number(y);if(Number.isFinite(an)&&Number.isFinite(bn)&&an!==bn)return an-bn}if(k==='qty'||k==='stock')return(Number(x)||0)-(Number(y)||0);return String(x??'').localeCompare(String(y??''),'es',{numeric:true,sensitivity:'base'})}
function sortRows(rows){
 const production=productionQuery(),byPart=production&&mode==='part';
 const effectiveOrder=production&&!orders.length?productionDefaultOrder():orders;
 return rows.sort((a,b)=>{
  for(const order of effectiveOrder){
   if(byPart&&(order.field==='item'||order.field==='stock')){
    const missing=Number(val(a,order.field)===null)-Number(val(b,order.field)===null);
    if(missing)return missing;
   }
   const difference=cmpVal(a,b,order.field);
   if(difference)return order.dir==='asc'?difference:-difference;
  }
  return 0;
 });
}
function productionDefaultOrder(){
 return mode==='part'?[{field:'item',dir:'asc'},{field:'name',dir:'asc'}]:
  [{field:'date',dir:'desc'},...(mode==='detail'?[{field:'time',dir:'desc'}]:[])];
}
function drawProductionHead(){
 const head=document.querySelector('#cqHead'),compact=compactDetail();
 const sortButton=(field,label)=>{
  const index=orders.findIndex(order=>order.field===field);
  const dir=orders[index]?.dir;
  const hint=index<0?'Agregar '+fields[field]+' al orden':
   fields[field]+', prioridad '+(index+1)+'. Cambiar a '+(dir==='asc'?'descendente':'ascendente');
  const arrow=dir==='asc'?'↑':dir==='desc'?'↓':'↕';
  return `<button type="button" data-sort="${field}" title="${hint}" aria-label="${hint}"><span>${label}</span><span class="cqSortArrow" aria-hidden="true">${arrow}${index<0?'':'<sup>'+(index+1)+'</sup>'}</span></button>`;
 };
 const column=(field,label,extra='')=>{
  const primary=orders[0]?.field===field?orders[0]:null;
  const aria=primary?' aria-sort="'+(primary.dir==='asc'?'ascending':'descending')+'"':'';
  return `<th scope="col"${aria}>${sortButton(field,label)}${extra}</th>`;
 };
 const qty=mode==='detail'?(compact?'Cant.':'Cantidad'):'Cantidad total';
 const columns=mode==='part'?partOrderFields.map(field=>column(field,field==='qty'?qty:fields[field])):[
  column('machine',(compact?'Equipo':'Máquina')+'<br><small>No. marca actual</small>'),column('inv','Inventario'),
  column('date','Fecha',compact?sortButton('time','Hora registro'):''),
  ...(mode==='detail'&&!compact?[column('time','Hora registro')]:[]),
  column('item',fields.item),column('name',compact||mode==='daily'?'Nombre del repuesto':'Repuesto'),column('qty',qty)
 ];
 const markup='<tr>'+columns.join('')+'</tr>';
 if(head.dataset.layout===markup)return;
 const focused=head.contains(document.activeElement)?document.activeElement.dataset.sort:null;
 head.innerHTML=markup;
 head.dataset.layout=markup;
 if(focused)head.querySelector(`[data-sort="${focused}"]`)?.focus();
}
function orderLineEntry(order,index){
 const name=fields[order.field],ascending=order.dir==='asc';
 const action=(key,symbol,label)=>`<button type="button" data-${key}="${index}" title="${label}" aria-label="${label}">${symbol}</button>`;
 return '<span class="cqOrderEntry">'+
  action('dir',`${index+1}. ${name} ${ascending?'↑':'↓'}`,`${name}, prioridad ${index+1}. Cambiar a ${ascending?'descendente':'ascendente'}`)+
  (index>0?action('before','←','Subir prioridad de '+name):'')+
  (index+1<orders.length?action('after','→','Bajar prioridad de '+name):'')+
  action('remove','×','Quitar '+name+' del orden')+'</span>';
}
function moveOrder(index,target){
 if(index<0||index>=orders.length||target<0||target>=orders.length||index===target)return;
 const [order]=orders.splice(index,1);orders.splice(target,0,order);
 drawOrders();render();
 document.querySelector(`#cqOrders [data-dir="${target}"]`)?.focus();
}
const lastOrderIcon='<svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M1 3l8 7-8 7zm7 0 8 7-8 7zM16 3h3v14h-3z"/></svg>';
function drawOrders(){
 const host=document.querySelector('#cqOrders');
 const production=productionQuery();
 if(production){
  const entries=orders.map(orderLineEntry).join('');
  host.innerHTML='<strong>Orden</strong>'+(entries||'<span>'+(mode==='part'?'Por número de ítem':'Más recientes primero')+'</span>');
 }else host.innerHTML=orders.map((order,index)=>{
  const name=fields[order.field],ascending=order.dir==='asc';
  const direction=ascending?'Ascendente':'Descendente';
  return `<div class="orderCard">
   <button type="button" class="orderDirection" data-dir="${index}" aria-label="${name}, ${direction}. Cambiar a ${ascending?'descendente':'ascendente'}">
    <strong>${index+1}. ${name}</strong>
    <span class="orderSense"><span aria-hidden="true">${ascending?'↑':'↓'}</span> <span>${direction}</span></span>
   </button>
   <button type="button" class="orderAction" data-remove="${index}" aria-label="Quitar criterio ${name}">×</button>
   <div class="orderMoves">
    <button type="button" class="orderAction" data-first="${index}" ${index===0?'disabled':''} aria-label="Poner ${name} primero" title="Mover al principio"><span class="firstOrderIcon">${lastOrderIcon}</span></button>
    <button type="button" class="orderAction" data-before="${index}" ${index===0?'disabled':''} aria-label="Mover ${name} antes">←</button>
    <button type="button" class="orderAction" data-after="${index}" ${index===orders.length-1?'disabled':''} aria-label="Mover ${name} después">→</button>
    <button type="button" class="orderAction" data-last="${index}" ${index===orders.length-1?'disabled':''} aria-label="Poner ${name} último" title="Mover al final">${lastOrderIcon}</button>
   </div>
  </div>`;
 }).join('');
 host.querySelectorAll('[data-dir]').forEach(button=>{
  const card=button.closest('.orderCard')||button;
  card.onclick=event=>{
   const action=event.target.closest('button');
   if(action&&action!==button)return;
   const index=Number(button.dataset.dir);
   orders[index].dir=orders[index].dir==='asc'?'desc':'asc';
   drawOrders();render();
   host.querySelector(`[data-dir="${index}"]`).focus();
  };
 });
 host.querySelectorAll('[data-first]').forEach(b=>b.onclick=()=>moveOrder(+b.dataset.first,0));
 host.querySelectorAll('[data-last]').forEach(b=>b.onclick=()=>moveOrder(+b.dataset.last,orders.length-1));
 host.querySelectorAll('[data-before]').forEach(b=>b.onclick=()=>moveOrder(+b.dataset.before,+b.dataset.before-1));
 host.querySelectorAll('[data-after]').forEach(b=>b.onclick=()=>moveOrder(+b.dataset.after,+b.dataset.after+1));
 host.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{
  const index=Number(b.dataset.remove);
  orders.splice(index,1);drawOrders();render();
  (host.querySelector(`[data-dir="${Math.min(index,orders.length-1)}"]`)||document.querySelector('#cqAddField')).focus();
 });
 const byPart=production&&mode==='part';
 const available=Object.entries(fields).filter(([key])=>
  (byPart?partOrderFields.includes(key):key!=='stock')&&!(production&&mode==='daily'&&key==='time')&&!orders.some(order=>order.field===key));
 const sortOptions=available.map(([key,label])=>`<option value="${key}">${label}</option>`).join('');
 const grouping=production&&!byPart?'<optgroup label="Agrupar resultados"><option value="totalByPart">Total por repuesto</option></optgroup>':'';
 document.querySelector('#cqAddField').innerHTML='<option value="">Agregar criterio…</option>'+grouping+
  (production?`<optgroup label="Ordenar por">${sortOptions}</optgroup>`:sortOptions);
}
function xml(v){return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function col(n){let s='';while(n){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26)}return s}
function zipStore(files){const te=new TextEncoder(),parts=[],central=[];let off=0;const crcTable=(()=>{let t=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();const crc=b=>{let c=0xffffffff;for(const x of b)c=crcTable[(c^x)&255]^(c>>>8);return(c^0xffffffff)>>>0};const u16=n=>new Uint8Array([n&255,(n>>>8)&255]),u32=n=>new Uint8Array([n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255]);for(const [name,text] of files){const nb=te.encode(name),b=te.encode(text),c=crc(b),local=[u32(0x04034b50),u16(20),u16(0),u16(0),u16(0),u16(0),u32(c),u32(b.length),u32(b.length),u16(nb.length),u16(0),nb,b];const len=local.reduce((a,x)=>a+x.length,0);parts.push(...local);central.push(u32(0x02014b50),u16(20),u16(20),u16(0),u16(0),u16(0),u16(0),u32(c),u32(b.length),u32(b.length),u16(nb.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(off),nb);off+=len}const cs=central.reduce((a,x)=>a+x.length,0);parts.push(...central,u32(0x06054b50),u16(0),u16(0),u16(files.length),u16(files.length),u32(cs),u32(off),u16(0));return new Blob(parts,{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})}
async function exportConsumption(format){
 if(format==='xlsx'&&mode==='part'&&productionQuery()){
  const view=await render();
  if(!view)return;
  if(!view.rows.length)return alert('No hay resultados para exportar.');
  window.SKDownloadPurchaseExcel(view);
  return;
 }
 if(!lastRows.length)return alert('No hay resultados para exportar.');
 const byPart=mode==='part',grouped=mode==='daily',pdf=format==='pdf';
 const production=productionQuery();
 const headers=byPart?['# DE ÍTEM','REPUESTO','CANTIDAD TOTAL',...(production?['SALDO ACTUAL']:[])]:['MÁQUINA - NO. MARCA ACTUAL',...(production?[]:['MODELO']),'INVENTARIO','FECHA',...(grouped?[]:['HORA REGISTRO']),'# DE ÍTEM','REPUESTO',grouped?'CANTIDAD TOTAL':'CANTIDAD'];
 const values=lastRows.map(row=>{
  const part=[row.item||'',row.name||'',row.qty];
  if(byPart)return production?[...part,row.stock??'—']:part;
  const machine=production?row.equipment.map(machineText).join(' / '):row.machine||'';
  return [machine,...(production?[]:[row.model||'']),row.inv||'',fmt(row.date),...(grouped?[]:[row.time||'']),...part];
 });
 const dates=productionDates();
 const [from,to]=['#cqFrom','#cqTo'].map(id=>{
  const input=document.querySelector(id);return dates?dates.readDate(input):input.value;
 });
 const origin=window.SKConsumptionReports?.selectedOrigin()||'';
 const rangeTitle=(origin?origin+' · ':'')+`RANGO DE FECHAS: ${from?fmt(from):'INICIO'} AL ${to?fmt(to):'HOY'}`;
 const filename=`Consumo_Repuestos_${origin?origin+'_':''}${from}_a_${to}${byPart?'_por_repuesto':grouped?'_agrupado':''}`;
 if(pdf){
  const view=document.querySelector('#cqv2 [data-mode].active').textContent;
  const widths=byPart?[68,438,150,126]:[173,78,73,...(grouped?[]:[78]),43,grouped?321:243,94];
  const blob=window.SKConsumptionPdf({title:'Producción · '+view,rangeTitle,headers,widths,values});
  downloadFile(blob,filename+'.pdf');
 }else{
  const rows=byPart?[[rangeTitle],headers,...values]:[headers,...values];
  downloadTableExcel(rows,filename+'.xlsx',byPart);
 }
}
function downloadFile(blob,filename){
 const url=URL.createObjectURL(blob),link=document.createElement('a');
 link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),2000);
}
function downloadTableExcel(rows,filename,mergeRange=false,sheetName='Consumos',columnWidths=[]){
 const widths=columnWidths.map((width,i)=>`<col min="${i+1}" max="${i+1}" width="${width}" customWidth="1"/>`).join('');
 const sheet=rows.map((r,ri)=>`<row r="${ri+1}">${r.map((v,ci)=>{const ref=`${col(ci+1)}${ri+1}`;return typeof v==='number'?`<c r="${ref}"><v>${v}</v></c>`:`<c r="${ref}" t="inlineStr"><is><t>${xml(v)}</t></is></c>`}).join('')}</row>`).join('');const files=[['[Content_Types].xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'],['_rels/.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],['xl/workbook.xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xml(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`],['xl/_rels/workbook.xml.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'],['xl/worksheets/sheet1.xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${widths?'<cols>'+widths+'</cols>':''}<sheetData>${sheet}</sheetData>${mergeRange?`<mergeCells count="1"><mergeCell ref="A1:${col(rows[1].length)}1"/></mergeCells>`:''}</worksheet>`]];downloadFile(zipStore(files),filename)}
const productionDates=()=>window.SKProductionDates;
const dateInputAttrs=()=>productionDates()?'type="text" inputmode="numeric" placeholder="DD/MM/AAAA" maxlength="10"':'type="date"';
window.SKDownloadTableExcel=downloadTableExcel;
window.SKDownloadPurchaseExcel=({rows,origin,period,from,to})=>{
 const blob=window.SKPurchaseWorkbook.build({rows,origin,period,downloadedAt:new Date(),
  lastSyncAt:state.lastSyncAt,offline:!navigator.onLine},{xml,col,zipStore});
 downloadFile(blob,'Compras_'+origin+'_'+(from||'inicio')+'_a_'+(to||'sin_limite')+'.xlsx');
};
function controls(){
 const sec=document.querySelector('#queries');
 if(!sec||document.querySelector('#cqv2'))return;
 const production=sec.hasAttribute('data-compact-detail');
 const orderField=`<label>${production?'Agregar criterio de orden o agrupación':'Agregar criterio de orden'}<select id="cqAddField"></select></label>`;
 const productionOrderField=`<div class="cqCriteriaRow">${orderField}
  <label class="cqAllParts" hidden title="Incluir también los repuestos sin consumo en el período">TODOS<input type="checkbox" id="cqAllParts" aria-label="Todos los repuestos del inventario seleccionado"></label>
 </div>`;
 const orderCards='<div id="cqOrders"></div>';
 const clearButton='<button type="button" id="cqClear">Limpiar filtros</button>';
 const excelButton='<button type="button" id="cqExport">⬇ Exportar Excel</button>';
 const modes=`<div class="queryTabs" role="group" aria-label="Opciones de consulta">
  <button type="button" data-mode="detail" class="active">CONSUMOS INDIVIDUALES</button>
  <button type="button" data-mode="daily">CONSUMOS AGRUPADOS</button>
  <button type="button" data-mode="part">${production?'TOTAL POR REPUESTO':'POR REPUESTO'}</button>
  ${production?clearButton:''}
 </div>`;
 sec.innerHTML=`<div id="cqv2">
  ${production?'':'<div class="sectionHead"><h2>Consultas / Control de repuestos</h2></div>'}
  <form class="queryForm">
   <label>Desde<input id="cqFrom" ${dateInputAttrs()}></label>
   <label>Hasta<input id="cqTo" ${dateInputAttrs()}></label>
   ${production?'':orderField}
   ${production?modes:clearButton}
   ${production?productionOrderField+orderCards:excelButton}
  </form>
  ${production?'':modes+orderCards}
  ${production?`<p class="hint">
   <span id="cqInfo"></span>
   <span class="consumptionExports" role="group" aria-label="Exportar resultados">
    ${excelButton}
    <button type="button" id="cqPdf">Exportar a PDF</button>
   </span>
  </p>`:'<p class="hint" id="cqInfo"></p>'}
  <div class="tableWrap"><table><thead id="cqHead"></thead><tbody id="cqRows"></tbody></table></div>
 </div>`;
 const today=new Date(),from=new Date(today.getFullYear(),today.getMonth()-3,today.getDate());const display=productionDates()?.displayDate||((value)=>value);document.querySelector('#cqFrom').value=display(localISO(from));document.querySelector('#cqTo').value=display(localISO(today));orders=production?[]:defaultOrder();drawOrders();document.querySelector('#cqExport').onclick=()=>exportConsumption('xlsx');
 if(production){
  document.querySelector('#cqPdf').onclick=()=>exportConsumption('pdf');
  document.querySelector('#cqHead').onclick=event=>{
   const button=event.target.closest('[data-sort]');
   if(!button)return;
   const field=button.dataset.sort,existing=orders.find(order=>order.field===field);
   if(existing)existing.dir=existing.dir==='asc'?'desc':'asc';
   else orders.push({field,dir:'asc'});
   drawOrders();render();
  };
 }
 const allParts=sec.querySelector('#cqAllParts');
 if(allParts)allParts.onchange=render;
 const buttons=sec.querySelectorAll('[data-mode]');
 function selectMode(button,keepOrder=false){
  mode=button.dataset.mode;
  if(allParts)allParts.closest('label').hidden=mode!=='part';
  const retained=keepOrder?orders.filter(order=>partOrderFields.includes(order.field)):[];
  orders=production?retained:mode==='part'?[{field:'item',dir:'asc'},{field:'name',dir:'asc'}]:defaultOrder();
  for(const tab of buttons){
   tab.classList.toggle('active',tab===button);
   tab.setAttribute('aria-pressed',String(tab===button));
  }
  drawOrders();render();
 }
 for(const button of buttons){
  button.setAttribute('aria-pressed',String(button.dataset.mode===mode));
  button.onclick=()=>selectMode(button);
 }
 document.querySelector('#cqAddField').onchange=event=>{
  const field=event.target.value;
  if(field==='totalByPart'){selectMode(sec.querySelector('[data-mode="part"]'),true);return}
  if(field){orders.push({field,dir:'asc'});drawOrders();render()}
 };
 document.querySelector('#cqFrom').onchange=render;
 document.querySelector('#cqTo').onchange=render;
 document.querySelector('#cqClear').onclick=()=>{
  if(allParts)allParts.checked=false;
  orders=[];drawOrders();render();
 };
}
async function data(){
 const [consumptions,assets]=await Promise.all([all('consumptions'),all('assets')]);
 const byAsset=new Map(assets.map(asset=>[asset.id,asset]));
 const origin=window.SKConsumptionReports?.selectedOrigin();
 const production=productionQuery();
 return consumptions.filter(row=>!row.deleted&&(!origin||row.origen===origin)).map(row=>{
  const asset=byAsset.get(row.assetId);
  const inv=origin||(compactDetail()&&row.origen)||invKey(row,byAsset);
  const model=String(asset?.modelo||row.modelo||'').trim(),machine=machineShort(row,byAsset);
  const equipment=production?[productionMachine(row,asset,model,machine)]:null;
  return {date:dayOf(row,!production),time:window.SKMovementTime.recordHour(row,!production),inv,model,machine,equipment,partId:row.partId,criterionId:row.itemId,item:row.noItem||'—',
   name:row.nombreRepuesto||'',qty:Number(row.cantidad)||0,external:external(asset),mine:mineOf(asset),inventoryMismatch:inventoryMismatch(model,inv)};
 });
}
function totalsByPart(rows,parts,production,readStock,includeAll=false){
 const byId=new Map(),byLabel=new Map(),groups=new Map();
 const labelKey=(item,name)=>JSON.stringify([norm(item==='—'?'':item),norm(name)]);
 const newGroup=(part,row)=>({
  item:part?.numero||row?.item||'—',name:part?.nombre||row?.name||'Sin nombre',
  application:part?.spareApplication||part?.application||part?.ubicacionAplicacion||'',partCode:part?.sparePartCode||'',
  qty:0,stock:part&&readStock?readStock(part):null
 });
 for(const part of parts){
  byId.set(part.id,part);
  if(part.criterionId)byId.set(part.criterionId,part);
  const key=labelKey(part.numero,part.nombre);
  byLabel.set(key,byLabel.has(key)?null:part);
 }
 for(const row of rows){
  const label=labelKey(row.item,row.name);
  const id=row.partId||row.criterionId;
  const part=byId.get(row.partId)||byId.get(row.criterionId)||(!id&&byLabel.get(label));
  const key=production&&(part||id)?'id:'+(part?.id||id):label;
  let group=groups.get(key);
  if(!group){
   group=newGroup(part,row);
   groups.set(key,group);
  }
  group.qty+=row.qty;
 }
 if(includeAll){
  for(const part of parts){
   const key='id:'+part.id;
   if(!groups.has(key))groups.set(key,newGroup(part));
  }
 }
 return Array.from(groups.values());
}
async function render(){if(!db||!document.querySelector('#cqv2'))return;const sequence=++renderSequence;const dateFields=['#cqFrom','#cqTo'].map(id=>document.querySelector(id)),dates=productionDates();const [from,to]=dateFields.map(input=>dates?dates.readDate(input):input.value);const invalid=dateFields.find(input=>!input.validity.valid);if(invalid||(productionQuery()&&from&&to&&from>to)){
 if(window.SKConsumptionReports){
  lastRows=[];
  document.querySelector('#cqRows').replaceChildren();
  document.querySelector('#cqInfo').textContent='Revisa el rango de fechas para ver los consumos.';
 }
 invalid?.reportValidity();return
}
 const production=productionQuery();
 const modelHeading=production?'':'<th>Modelo</th>';
 const origin=production&&mode==='part'?window.SKConsumptionReports.selectedOrigin():'';
 const [movements,catalog]=await Promise.all([data(),origin?window.SKSpareCatalog.read():[]]);
 if(sequence!==renderSequence)return;
 let rows=movements.filter(x=>(!from||x.date>=from)&&(!to||x.date<=to));
 if(mode==='daily'){
  const groups=new Map();
  for(const row of rows){
   const key=JSON.stringify([row.date,norm(row.model),norm(row.inv),norm(row.item==='—'?'':row.item),norm(row.name)]);
   let group=groups.get(key);
   if(!group){
    group={...row,name:row.name||'Sin nombre',qty:0,time:'',marks:new Set(),models:new Set(),inventories:new Set(),mines:new Set(),equipmentByName:new Map()};
    groups.set(key,group);
   }
   group.qty+=row.qty;
   group.inventoryMismatch||=row.inventoryMismatch;
   group.external||=row.external;
   if(row.machine)group.marks.add(row.machine);
   if(row.model)group.models.add(row.model);
   if(row.inv)group.inventories.add(row.inv);
   if(row.external&&row.mine)group.mines.add(row.mine);
   for(const entry of row.equipment||[])group.equipmentByName.set(machineText(entry),entry);
  }
  const compare=(a,b)=>a.localeCompare(b,'es',{numeric:true});
  rows=sortRows([...groups.values()].map(group=>({...group,
   model:[...group.models].sort(compare).join(' / '),machine:[...group.marks].sort(compare).join('-'),
   inv:[...group.inventories].sort(compare).join(' / '),mine:[...group.mines].join(' / '),
   equipment:production?[...group.equipmentByName.values()].sort((a,b)=>compare(machineText(a),machineText(b))):null
  })));
  lastRows=rows;
  if(!production)document.querySelector('#cqHead').innerHTML=`<tr><th>Máquina<br><small>No. marca actual</small></th>${modelHeading}<th>Inventario</th><th>Fecha</th><th># DE ÍTEM</th><th>Nombre del repuesto</th><th>Cantidad total</th></tr>`;
  document.querySelector('#cqRows').innerHTML=rows.map(x=>`<tr class="${x.external?'consumptionExternal':''}" title="${x.external?`Equipo externo · ${esc(x.mine)}`:''}">${machineCell(x)}${production?'':`<td>${esc(x.model||'—')}</td>`}${inventoryCell(x)}<td>${fmt(x.date)}</td><td>${esc(x.item)}</td><td>${esc(x.name)}</td><td><b>${x.qty}</b></td></tr>`).join('')||`<tr><td colspan="${production?6:7}">No hay consumos para este período.</td></tr>`;
 }else if(mode==='part'){
  const parts=origin?window.SKSpareCatalog.filter(catalog,origin.replace(/\d+$/,''),origin):[];
  const readStock=production?part=>currentProductionStock(part,origin):null;
  const includeAll=production&&document.querySelector('#cqAllParts').checked;
  rows=sortRows(totalsByPart(rows,parts,production,readStock,includeAll));
  lastRows=rows;
  if(!production)document.querySelector('#cqHead').innerHTML='<tr><th># DE ÍTEM</th><th>Repuesto</th><th>Cantidad total</th></tr>';
  document.querySelector('#cqRows').innerHTML=rows.map(x=>`<tr><td>${esc(x.item)}</td><td>${production?`<strong class="spareName">${esc(x.name)}</strong>${x.application?` <span class="spareUse">${esc(x.application)}</span>`:''}`:esc(x.name)}</td><td><b>${x.qty}</b></td>${production?`<td>${esc(x.stock??'—')}</td>`:''}</tr>`).join('')||`<tr><td colspan="${production?4:3}">No hay consumos para este período.</td></tr>`;
 }else{rows=sortRows(rows);lastRows=rows;const compact=compactDetail();
  if(!production)document.querySelector('#cqHead').innerHTML=`<tr><th>Máquina<br><small>No. marca actual</small></th>${modelHeading}<th>Inventario</th><th>Fecha</th><th>Hora registro</th><th># DE ÍTEM</th><th>Repuesto</th><th>Cantidad</th></tr>`;
  document.querySelector('#cqRows').innerHTML=rows.map(x=>`<tr class="${x.external?'consumptionExternal':''}" title="${x.external?`Equipo externo · ${esc(x.mine)}`:''}">${machineCell(x)}${production?'':`<td>${esc(x.model||'—')}</td>`}${inventoryCell(x)}<td>${compact?fmt(x.date).replace(/\b0(?=\d)/g,'')+'<br><small>'+esc(x.time||'—')+'</small>':fmt(x.date)}</td>${compact?'':`<td>${esc(x.time||'—')}</td>`}<td>${esc(x.item)}</td><td>${esc(x.name)}</td><td>${x.qty}</td></tr>`).join('')||`<tr><td colspan="${compact?6:production?7:8}">No hay movimientos para este período.</td></tr>`}
 if(production)drawProductionHead();
 const count=`${rows.length} resultado${rows.length===1?'':'s'}`;
 document.querySelector('#cqInfo').textContent=production?count:`${count} · orden: ${orders.length?orders.map((o,i)=>`${i+1}. ${fields[o.field]} ${o.dir==='asc'?'↑':'↓'}`).join(' → '):'sin filtros de orden'}.`;
 if(production&&mode==='part')return {rows,origin,from,to,period:(from?fmt(from):'Inicio')+' al '+(to?fmt(to):'último registro')};
}
function openQueries(){
 controls();
 return render();
}
desktopQuery.addEventListener('change',()=>{
 if(document.querySelector('#queries[data-compact-detail]:not([hidden])'))render();
});
window.addEventListener('load',controls);
window.addEventListener('skweb-open-queries',openQueries);
window.addEventListener('skweb-db-ready',()=>{
 if(document.querySelector('#queries.active'))openQueries();
});
window.addEventListener('skweb-assets-normalized',()=>setTimeout(render,50));
window.addEventListener('skweb-synced',()=>setTimeout(render,200));
window.addEventListener('skweb-consumption-changed',render);
})();
