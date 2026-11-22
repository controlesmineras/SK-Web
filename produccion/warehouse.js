(()=>{
 'use strict';
 const store=window.SKProductionWarehouseStore;
 let account='',snapshot={},view='home',warehouseDirty=false,busy=false,savingMovement=false,module='',exportRows=[],timer,activeSync;
 const spareGroups=window.SKSpareGroups;
 const stockExpanded=new Map();
 let selectedReturnId='',openingHistoryFrom='home';
 const openingHistoryLabel='CONSULTAR SALDOS DE APERTURA';
 const kinds={quantity_adjustment:'Ajuste de cantidad',income:'Ingreso externo',opening:'Saldo de apertura',delivery:'Entrega',loan:'Préstamo',return:'Reintegro',transfer_in:'Ingreso desde Plaza',transfer_out:'Traslado a Plaza'};
 const roles=user=>Array.isArray(user?.roles)?user.roles:[user?.role||'assistant'];
 const permits=(user,scope)=>roles(user).some(role=>role==='admin'||role==='assistant'||role===scope);
 const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node};
 const button=(text,action)=>{const node=el('button',text);node.type='button';node.onclick=action;return node};
 const host=byId('workspace'),toolbar=host.querySelector('.productionToolbar'),mechanics=el('div');mechanics.id='mechanicsWorkspace';
 let sibling=toolbar.nextElementSibling;while(sibling){const next=sibling.nextElementSibling;mechanics.append(sibling);sibling=next;}host.append(mechanics);
 const home=el('section');home.id='productionModuleHome';home.hidden=true;
 const title=el('h2','PRODUCCIÓN'),intro=el('p','Selecciona el módulo que vas a utilizar.'),modules=el('div');modules.className='productionModules';
 modules.append(button('MECÁNICA',()=>choose('mechanic')),button('BODEGA',()=>choose('warehouse')));home.append(title,intro,modules);
 const change=button('',goBack);change.id='changeProductionModule';change.hidden=true;change.setAttribute('aria-label','Volver a la pantalla anterior');change.title='Volver';change.innerHTML='<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false"><path fill="currentColor" d="M10 5 2 12l8 7v-5h3c4.2 0 7 1.8 9 5-.8-6.5-4-10-9-10h-3V5Z"/></svg>';
 const breadcrumb=byId('productionBreadcrumb');
 const navigation=el('nav');navigation.id='productionNavigation';navigation.setAttribute('aria-label','Navegación del módulo');navigation.append(change);
 const mechanicTitle=byId('mechanicTitle');mechanicTitle.hidden=true;navigation.append(mechanicTitle);
 byId('productionHome').onclick=()=>choose('');
 const panel=el('section');panel.id='warehousePanel';panel.hidden=true;
 function personField(key,caption){
  const id=key==='keeper'?'warehouseKeeper':'warehousePerson';
  return `<div data-${key} class="productionField wide" ${key==='keeper'?'hidden':''}>
   <label for="${id}Search" data-${key}-label>${caption}</label>
   <div class="warehousePersonInput">
    <input id="${id}Search" name="${key}Search" type="text" placeholder="Buscar en Personal por nombre o documento…" autocomplete="off" aria-controls="${id}Results" aria-describedby="${id}Info">
    <button type="button" data-${key}-clear aria-label="Quitar ${caption.toLowerCase()}" hidden>×</button>
   </div>
   <input type="hidden" name="${key}Id">
   <div id="${id}Results" class="machineOptions" hidden></div>
   <small id="${id}Info" hidden></small>
  </div>`;
 }
 panel.innerHTML='<div class="warehouseHeading"><h2>BODEGA DE PRODUCCIÓN</h2><button type="button" id="warehouseInfoToggle" aria-label="Información de la bodega" aria-expanded="false" aria-controls="warehouseNote">i</button></div><p id="warehouseNote" class="warehouseHint" hidden></p><div class="warehouseActions" role="group" aria-label="Tareas de bodega"></div><p id="warehouseStatus" role="status" aria-live="polite"></p><div id="warehousePending"></div><div id="warehouseReturnPicker" hidden><label>BUSCAR PRÉSTAMO<input id="warehouseReturnSearch" type="search" placeholder="Elemento, marca, serial, nombre o documento" autocomplete="off"></label><div id="warehouseReturnList"></div></div><form id="warehouseForm" hidden>'+personField('keeper','BODEGUERO/A DE TURNO')+'<strong data-return-summary class="wide" hidden></strong><label class="wide" id="warehouseItemField"><span data-item-caption>SELECCIONE ELEMENTO A ENTREGAR</span><select name="itemId" required></select></label><label data-asset-mode class="wide" hidden>ACTIVO<select name="assetMode"><option value="registered">Registrado</option><option value="new">Registrar activo nuevo</option></select></label><div data-new-asset class="wide" hidden><label>SERIAL<input name="newSerial" maxlength="160"></label><label>MODELO<input name="newModel" maxlength="100"></label><label>MARCA COMERCIAL<input name="newBrand" maxlength="100"></label><label>MARCA O NÚMERO ANTERIOR<input name="newMark" maxlength="100"></label><label>NÚMERO DE CLASE (YT / COLUMNA)<input name="newNumber" maxlength="30"></label><label>MINA DE ORIGEN<input name="newMine" value="Sandra K" maxlength="100"></label><label>LONGITUD<input name="newLength" maxlength="40" placeholder="Cuando aplique"></label></div><label data-asset class="wide" hidden>ACTIVO REGISTRADO<select name="assetId"></select></label><label data-source-loan class="wide" hidden>PRÉSTAMO DE PLAZA A DEVOLVER<select name="sourceLoanId"></select></label><label>FECHA<input name="fechaISO" type="text" placeholder="DD/MM/AAAA" inputmode="numeric" maxlength="10" required></label><label>CANTIDAD<input name="quantity" type="number" min="0.001" step="any" required></label>'+personField('person','QUIÉN RECIBE')+'<label data-destination class="wide">DÓNDE ESTARÁ EL ELEMENTO<input name="destination" maxlength="160" placeholder="Área, nivel o lugar"></label><label data-income class="wide" hidden>MOTIVO DEL INGRESO<select name="incomeType"><option value="ENTRADA">Entrada externa</option><option value="REPARACIÓN">Reparación</option></select></label><label class="wide">OBSERVACIONES<textarea name="notes" rows="2" maxlength="1000"></textarea></label><button class="wide" type="submit">GUARDAR</button><button type="button" class="wide" data-cancel-return hidden>CANCELAR</button></form><div id="warehouseFilters"><input type="search" id="warehouseSearch" placeholder="Buscar en la consulta"><select id="warehouseLoanFilter" aria-label="Estado de préstamos" hidden><option value="pending">PENDIENTES</option><option value="returned">DEVUELTOS</option><option value="all">TODOS</option></select></div><div id="warehouseExports"><button type="button" data-excel>EXPORTAR EXCEL</button><button type="button" data-pdf>EXPORTAR PDF</button></div><div class="tableWrap"><table id="warehouseTable"><thead></thead><tbody></tbody></table></div>';
 toolbar.after(navigation,home,panel);
 const find=s=>panel.querySelector(s),form=find('form'),f=form.elements,feedback=find('#warehouseStatus');
 const infoToggle=find('#warehouseInfoToggle'),warehouseNote=find('#warehouseNote');
 function showWarehouseInfo(expanded){
  warehouseNote.hidden=!expanded;
  infoToggle.setAttribute('aria-expanded',String(expanded));
 }
 infoToggle.onclick=()=>showWarehouseInfo(warehouseNote.hidden);
 const tell=message=>{feedback.textContent=message};
 const openingHistoryButton=button(openingHistoryLabel,()=>setView('openingHistory'));
 openingHistoryButton.hidden=true;form.after(openingHistoryButton);
 form.addEventListener('input',()=>{warehouseDirty=true});form.addEventListener('change',()=>{warehouseDirty=true});
 const isEpp=row=>row.isEpp===true||['true','si','sí','1','yes'].includes(String(row.isEpp||'').trim().toLowerCase());
 const criteria=()=>(snapshot.catalog?.criteria||[]).filter(row=>!row.deleted&&row.active!==false&&!isEpp(row)),people=()=>snapshot.catalog?.personal||[];
 const pending=()=>snapshot.pending||[],records=()=>[...(snapshot.records||[])].sort((a,b)=>a.revision-b.revision);
 const item=id=>criteria().find(row=>row.id===id),assetLabel=row=>[row.clase,row.marcaActual||row.marcaInterna||row.marcaAnterior,row.numeroClase&&'N.º '+row.numeroClase,row.serial].filter(Boolean).join(' · ');
 const itemLabel=row=>row.isYtSpare?[row.spareEquipment,String(row.spareItemNumber??'').trim()?'Ítem '+row.spareItemNumber:'',row.spareItemName||row.name,row.spareApplication||row.application||row.ubicacionAplicacion].filter(Boolean).join(' · '):[row.name,row.application||row.ubicacionAplicacion].filter(Boolean).join(' · ');
 // Los préstamos y sus reintegros locales participan antes de que llegue la confirmación.
 function warehouseLoans(snapshot){
  const movements=new Map(),returned=new Map();
  const confirmed=[...(snapshot.records||[])].sort((a,b)=>a.revision-b.revision);
  for(const row of [...confirmed,...(snapshot.pending||[])]){
   if(!movements.has(row.id)&&!row.syncRejected&&row.status!=='rejected')movements.set(row.id,row);
  }
  for(const row of movements.values()){
   if(row.kind==='return')returned.set(row.loanId,(returned.get(row.loanId)||0)+Number(row.quantity));
  }
  const catalog=snapshot.catalog||{};
  const persons=new Map((catalog.personal||[]).map(row=>[row.id,row]));
  const items=new Map((catalog.criteria||[]).map(row=>[row.id,row]));
  const assets=new Map((catalog.assets||[]).map(row=>[row.id,row]));
  const loans=[];
  for(const loan of movements.values()){
   if(loan.kind!=='loan')continue;
   const person=persons.get(loan.personId),criterion=items.get(loan.itemId),asset=assets.get(loan.assetId);
   const name=loan.itemName||criterion?.name||'Elemento';
   const mark=loan.assetLabel||(asset&&assetLabel({...asset,clase:''}));
   const quantity=Number(loan.quantity),remaining=quantity-(returned.get(loan.id)||0);
   // Una diferencia de redondeo al sumar fracciones no abre otro reintegro.
   const left=remaining>2*Number.EPSILON*quantity?remaining:0;
   loans.push({...loan,label:mark?name+' · '+mark:name,
    borrower:loan.personName||person?.nombre||'Sin nombre registrado',document:person?.documento||'',
    unit:loan.unit||criterion?.unit||'Unidad',left});
  }
  return loans.reverse();
 }
 let loanSnapshot,loanRows;
 function loans(){
  if(loanSnapshot!==snapshot){loanRows=warehouseLoans(snapshot);loanSnapshot=snapshot;}
  return loanRows;
 }
 function returnLoan(){return loans().find(row=>row.id===selectedReturnId&&row.left>0);}
 const assetClass=value=>norm(value).trim().replace(/\s+/g,' ');
 const outgoing=kind=>['delivery','loan','transfer_out'].includes(kind);
 function groupWarehouseAssets(snapshot){
  const catalog=snapshot.catalog||{},latest=new Map(),states=new Map(),groups=new Map();
  const legacy=catalog.assets?.some(asset=>asset.inWarehouse===undefined);
  if(legacy)for(const row of snapshot.records||[]){
   if(row.assetId&&row.status!=='rejected'&&row.revision>(latest.get(row.assetId)?.revision||0))latest.set(row.assetId,row);
  }
  for(const asset of catalog.assets||[]){
   if(asset.deleted||/^dad[oa](?:\/[oa])? de baja$/.test(assetClass(asset.estado)))continue;
   const last=latest.get(asset.id),location=assetClass(asset.ubicacion);
   // Un catálogo anterior solo permite las ubicaciones que su servidor puede confirmar.
   const stored=asset.inWarehouse??((!last||last.delta>0)&&['produccion','inventario de produccion','bodega de produccion'].includes(location));
   states.set(asset.id,{asset,stored,canIssue:asset.canIssue??true});
  }
  for(const row of snapshot.pending||[]){
   if(row.syncRejected)continue;
   if(row.newAsset&&row.kind==='income'){
    const criterion=catalog.criteria?.find(item=>item.id===row.itemId);
    if(criterion)states.set(row.newAsset.id,{asset:{...row.newAsset,clase:criterion.name},stored:true,canIssue:row.incomeType!=='REPARACIÓN'});
    continue;
   }
   const state=states.get(row.assetId);
   if(!state)continue;
   state.stored=!outgoing(row.kind);
   if(row.kind==='income'&&row.incomeType==='REPARACIÓN')state.canIssue=false;
  }
  for(const state of states.values()){
   const key=assetClass(state.asset.clase);
   if(!groups.has(key))groups.set(key,{registered:[],stored:[],available:[]});
   const group=groups.get(key);group.registered.push(state.asset);
   if(state.stored){group.stored.push(state.asset);if(state.canIssue)group.available.push(state.asset);}
  }
  return groups;
 }
 let indexedSnapshot,assetGroups;
 function fixedAssets(criterion,kind){
  if(!criterion?.isFixedAsset)return [];
  if(indexedSnapshot!==snapshot){assetGroups=groupWarehouseAssets(snapshot);indexedSnapshot=snapshot;}
  const group=assetGroups.get(assetClass(criterion.name));
  if(kind==='transfer_out')return group?.stored||[];
  if(['stock','delivery','loan'].includes(kind))return group?.available||[];
  return group?.registered||[];
 }
 function balance(criterion){
  if(criterion.isFixedAsset)return fixedAssets(criterion,view==='transfer_out'?view:'stock').length;
  const id=criterion.id;
  let value=Number((snapshot.balances||[]).find(row=>row.itemId===id)?.quantity)||0;
  for(const row of pending())if(row.itemId===id&&!row.syncRejected)value+=Number(row.quantity)*(outgoing(row.kind)?-1:1);
  return value;
 }
 function selectOptions(select,options,placeholder){const before=select.value;select.replaceChildren(new Option(placeholder,''),...options.map(([value,label])=>new Option(label,value)));if(options.some(([value])=>String(value)===before))select.value=before;}
 function selectableCriteria(){
  const sparesBlocked=['delivery','loan','transfer_out'].includes(view)&&!snapshot.settings?.allowSpareDelivery;
  return criteria().filter(row=>(!sparesBlocked||!row.isYtSpare)&&(view!=='loan'||row.allowLoan)&&(view!=='opening'||!row.isYtSpare)).sort((a,b)=>itemLabel(a).localeCompare(itemLabel(b),'es',{numeric:true,sensitivity:'base'}));
 }
 function choices(){
  const rows=selectableCriteria(),before=f.itemId.value;
  selectOptions(f.itemId,rows.map(row=>[row.id,itemLabel(row)]),'Seleccionar elemento');
  if(before&&!rows.some(row=>row.id===before))itemPicker.clear();
  itemPicker.refresh();fieldsForItem();
 }
 function fieldsForItem(){
  const selected=item(f.itemId.value),fixed=selected?.isFixedAsset;
  const creating=fixed&&view==='income'&&f.assetMode.value==='new';
  find('[data-asset-mode]').hidden=!fixed||view!=='income';find('[data-new-asset]').hidden=!creating;
  find('[data-asset]').hidden=!fixed||creating;
  f.assetId.required=Boolean(fixed&&!creating);f.quantity.min=view==='opening'?'0':selected?.isYtSpare||fixed?'1':'0.001';f.quantity.step=selected?.isYtSpare||fixed?'1':'any';f.quantity.readOnly=Boolean(fixed);if(fixed)f.quantity.value='1';
  const selectedAssets=fixedAssets(selected,view);
  selectOptions(f.assetId,selectedAssets.map(row=>[row.id,assetLabel(row)]),fixed&&outgoing(view)&&!selectedAssets.length?'Sin activos disponibles en Producción':'Seleccionar activo');
  find('[data-source-loan]').hidden=view!=='transfer_out';
  const sourceLoans=records().filter(row=>row.kind==='transfer_in'&&row.sourceLoan&&row.itemId===selected?.id&&!records().some(out=>out.sourceLoanId===row.sourceDeliveryId)&&!pending().some(out=>!out.syncRejected&&out.sourceLoanId===row.sourceDeliveryId));
  selectOptions(f.sourceLoanId,sourceLoans.map(row=>[row.sourceDeliveryId,`${displayDate(row.fechaISO)} · ${row.assetLabel||row.itemName} · ${row.quantity}`]),'Traslado normal / no corresponde a un préstamo');
 }
 const itemPicker=window.SKSparePicker.mount(form,{
  title:'SELECCIONE ELEMENTO A ENTREGAR',showAllItems:true,showPartCode:false,
  get isDelivery(){return ['delivery','loan','transfer_out'].includes(view)},loan:()=>view==='loan',
  items:selectableCriteria,
  fixed:row=>row.isFixedAsset===true,availability:balance,
  aliases:row=>[...spareGroups.aliases(row),row.spareApplication||row.application||row.ubicacionAplicacion].filter(Boolean),
  badge:quantity=>quantity<=0?{className:'empty',text:'SIN EXISTENCIAS'}:quantity<=3?{className:'low',text:'QUEDAN: '+quantity}:{className:'available',text:'HAY: '+quantity}
 });
 itemPicker.main.input.placeholder='Nombre principal, secundario o terciario…';
 itemPicker.detail.input.closest('label').classList.add('wide');
 function itemCaption(){
  const action={delivery:'A ENTREGAR',income:'A INGRESAR',loan:'A PRESTAR',transfer_out:'A ENVIAR A PLAZA',opening:'PARA SALDO DE APERTURA'}[view]||'';
  const caption='SELECCIONE ELEMENTO '+action;find('[data-item-caption]').textContent=caption;itemPicker.main.input.setAttribute('aria-label',caption);
 }
 function mountPersonPicker(key,onPick){
  const field=find('[data-'+key+']'),search=f[key+'Search'],id=f[key+'Id'];
  const personResults=field.querySelector('.machineOptions'),personInfo=field.querySelector('small'),clearPerson=field.querySelector('button');
  function selectedPerson(){
   return people().find(row=>row.id&&String(row.id)===id.value&&!row.deleted&&row.active!==false);
  }
  function selectPerson(person){
   id.value=person?.id||'';
   search.value=person?.nombre||'';
   search.setCustomValidity('');
   personInfo.textContent=[person?.documento&&'Documento: '+person.documento,person?.empresa].filter(Boolean).join(' · ');
   personInfo.hidden=!personInfo.textContent;clearPerson.hidden=!person;
   personResults.hidden=true;
  }
  function showPersonMatches(){
   const query=norm(search.value).trim();
   if(!query||id.value){personResults.hidden=true;return;}
   const tokens=query.split(/\s+/),digits=/^[\d.\s-]+$/.test(query)?query.replace(/\D/g,''):'';
   const matches=people().filter(person=>{
    if(!person.id||person.deleted||person.active===false)return false;
    const label=norm(personLabel(person));
    return tokens.every(token=>label.includes(token))||Boolean(digits&&String(person.documento||'').replace(/\D/g,'').includes(digits));
   }).sort((a,b)=>String(a.nombre||'').localeCompare(String(b.nombre||''),'es',{sensitivity:'base'}));
   personResults.replaceChildren(...matches.slice(0,20).map(person=>{
    const option=button('',()=>{selectPerson(person);onPick?.(person);warehouseDirty=true;search.focus();});
    option.append(el('strong',person.nombre),el('span',[person.documento,person.empresa].filter(Boolean).join(' · ')));
    return option;
   }));
   if(!matches.length)personResults.textContent=people().length?'Sin coincidencias.':'Sin personal descargado. Sincroniza la bodega para cargar el listado.';
   personResults.hidden=false;
  }
  setupPicker(search,personResults,showPersonMatches,()=>{personResults.hidden=true});
  search.oninput=()=>{
   if(id.value)onPick?.(null);
   id.value='';clearPerson.hidden=true;personInfo.hidden=true;personInfo.textContent='';
   search.setCustomValidity('');showPersonMatches();
  };
  search.addEventListener('keydown',event=>{
   if(personResults.hidden)return;
   const first=personResults.querySelector('button');
   if(event.key==='ArrowDown'&&first){event.preventDefault();first.focus();}
   if(event.key==='Enter'&&first&&personResults.childElementCount===1){event.preventDefault();first.click();}
  });
  clearPerson.onclick=()=>{selectPerson(null);onPick?.(null);warehouseDirty=true;search.focus();};
  function refreshPersonPicker(){
   if(id.value)selectPerson(selectedPerson());
   else if(document.activeElement===search)showPersonMatches();
  }
  return {selected:selectedPerson,select:selectPerson,refresh:refreshPersonPicker};
 }
 const recipientPicker=mountPersonPicker('person');
 const keeperPicker=mountPersonPicker('keeper',rememberKeeper);
 // Los turnos de Colombia cambian a las 06:00, 14:00 y 22:00.
 const currentShift=()=>Math.floor((Date.now()-11*3600000)/(8*3600000));
 const shiftKey=()=>`sk-production-warehouse-shift:${session.user.document}`;
 let keeperShift=null;
 function rememberKeeper(person){
  keeperShift=currentShift();
  try{
   if(person)localStorage.setItem(shiftKey(),JSON.stringify({shift:keeperShift,id:person.id}));
   else localStorage.removeItem(shiftKey());
  }catch{}
 }
 function updateKeeper(reset=false){
  const required=Boolean(session)&&!roles(session.user).includes('warehouse');
  find('[data-keeper]').hidden=!required;f.keeperSearch.required=required;
  if(!required){keeperPicker.select(null);keeperShift=null;return;}
  if(!reset&&keeperShift===currentShift()){keeperPicker.refresh();return;}
  keeperShift=currentShift();
  let saved;
  try{saved=JSON.parse(localStorage.getItem(shiftKey()));}catch{}
  keeperPicker.select(saved?.shift===keeperShift?people().find(p=>p.id===saved.id&&!p.deleted&&p.active!==false):null);
 }
 function resetMovementForm(date){
  form.reset();
  recipientPicker.select(null);updateKeeper(true);
  itemPicker.clear();
  f.fechaISO.setCustomValidity('');f.fechaISO.value=displayDate(date);
  f.quantity.value='';
  warehouseDirty=false;
 }
 function renderReturns(){
  const selected=returnLoan();
  if(selectedReturnId&&!selected){
   selectedReturnId='';resetMovementForm(today());
   tell('El préstamo ya no está pendiente. La lista se actualizó.');
  }
  form.hidden=!selected;
  find('#warehouseReturnPicker').hidden=Boolean(selected);
  if(selected){
   find('[data-return-summary]').textContent=selected.label+' · Prestado a '+selected.borrower+' · Pendiente: '+selected.left+' '+selected.unit;
   f.quantity.max=selected.left;
   return;
  }
  const query=norm(find('#warehouseReturnSearch').value).trim();
  const rows=loans().filter(row=>row.left>0&&matchesQuery([row.label,row.borrower,row.document],row.itemId,query));
  const list=find('#warehouseReturnList');
  list.replaceChildren(...rows.map(loan=>{
   const card=el('article'),details=el('div');
   details.append(el('strong',loan.label),el('span','Prestado a: '+loan.borrower),
    el('span',displayDate(loan.fechaISO)+' · '+registrationHour(loan)+' · Pendiente: '+loan.left+' '+loan.unit));
   card.append(details,button('REINTEGRAR',()=>selectReturn(loan.id)));return card;
  }));
  if(!rows.length)list.append(el('p',query?'No hay préstamos pendientes que coincidan con la búsqueda.':'No hay préstamos pendientes de reintegro.'));
 }
 function selectReturn(id){
  selectedReturnId=id;
  const loan=returnLoan();
  if(!loan){renderReturns();return;}
  resetMovementForm(today());
  const person=people().find(row=>row.id===loan.personId);
  if(person&&!person.deleted&&person.active!==false)recipientPicker.select(person);
  const fixed=Boolean(loan.assetId),criterion=item(loan.itemId);
  const wholeUnits=fixed||criterion?.isYtSpare||criterion&&!criterion.fractionable;
  f.quantity.readOnly=fixed;
  f.quantity.min=wholeUnits?'1':'0.000001';
  f.quantity.step=wholeUnits?'1':'any';
  f.quantity.value=loan.left;
  renderReturns();(f.keeperSearch.required&&!keeperPicker.selected()?f.keeperSearch:f.fechaISO).focus();
 }
 f.fechaISO.addEventListener('input',()=>f.fechaISO.setCustomValidity(''));
 find('#warehouseReturnSearch').oninput=renderReturns;
 find('[data-cancel-return]').onclick=()=>{
  if(!leaveCurrent())return;
  selectedReturnId='';renderReturns();find('#warehouseReturnSearch').focus();
 };
 function setView(next){
  if(savingMovement||next!==view&&!leaveCurrent())return;
  if(next!==view){
   showWarehouseInfo(false);
   if(next==='openingHistory')openingHistoryFrom=view;
   find('#warehouseSearch').value='';
  }
  stockExpanded.clear();view=next;warehouseDirty=false;selectedReturnId='';
  const returning=view==='return',queryView=['stock','history','openingHistory','loans'].includes(view);
  form.hidden=view==='home'||queryView;
  openingHistoryButton.hidden=view!=='income'&&view!=='opening';
  find('.warehouseActions').hidden=view!=='home';find('.tableWrap').hidden=view==='home'||returning;
  find('#warehouseLoanFilter').hidden=view!=='loans';find('#warehouseFilters').hidden=!queryView;find('#warehouseExports').hidden=!queryView;
  find('#warehousePending').hidden=returning;
  find('#warehouseReturnSearch').value='';find('#warehouseReturnPicker').hidden=!returning;
  find('#warehouseItemField').hidden=returning;find('[data-return-summary]').hidden=!returning;find('[data-cancel-return]').hidden=!returning;
  for(const node of panel.querySelectorAll('[data-view]'))node.setAttribute('aria-pressed',String(node.dataset.view===view));
  if(!form.hidden){
   resetMovementForm(today());f.quantity.removeAttribute('max');f.personSearch.required=view!=='opening';
   for(const node of panel.querySelectorAll('[data-person]'))node.hidden=view==='opening';
   find('[data-person-label]').textContent=returning?'QUIÉN DEVUELVE':view==='income'?'QUIÉN TRAE':view==='transfer_out'?'QUIÉN LLEVA EL ELEMENTO A PLAZA':view==='loan'?'QUIÉN RECIBE EL PRÉSTAMO':'QUIÉN RECIBE';
   find('[data-destination]').hidden=!['delivery','loan'].includes(view);f.destination.required=['delivery','loan'].includes(view);
   find('[data-income]').hidden=view!=='income';find('[type=submit]').textContent='GUARDAR '+kinds[view].toUpperCase();
   if(returning){
    for(const selector of ['[data-asset-mode]','[data-new-asset]','[data-asset]','[data-source-loan]'])find(selector).hidden=true;
    f.assetId.required=false;renderReturns();
   }else{itemCaption();choices();}
  }
  renderTable();paintNavigation();
 }
 const actions=[['ENTREGAS','delivery'],['INGRESOS','income'],['PRÉSTAMOS','loan'],['REINTEGROS','return'],['PRÉSTAMOS PENDIENTES','loans'],['CONSULTAR MOVIMIENTOS','history'],['EXISTENCIAS','stock'],['ENVIAR A PLAZA','transfer_out'],['SALDO DE APERTURA','opening'],[openingHistoryLabel,'openingHistory']];
 for(const [label,value] of actions){
  const node=button('',()=>setView(value));
  node.dataset.view=value;
  node.append(el('span',label));
  find('.warehouseActions').append(node);
 }
 f.sourceLoanId.onchange=()=>{const loan=records().find(row=>row.sourceDeliveryId===f.sourceLoanId.value);if(loan){f.quantity.value=loan.quantity;f.assetId.value=loan.assetId||'';}};
 f.assetMode.onchange=fieldsForItem;f.itemId.onchange=fieldsForItem;
 find('#warehouseSearch').oninput=()=>{stockExpanded.clear();renderTable()};find('#warehouseLoanFilter').onchange=renderTable;
 function matchesQuery(values,itemId,query){
  return !query||norm(values.join(' ')).includes(query)||spareGroups.aliases(criteriaById().get(itemId)).some(name=>norm(name).includes(query));
 }
 let indexedCatalog,indexedItems;
 function criteriaById(){
  if(!indexedItems||indexedCatalog!==snapshot.catalog){
   indexedCatalog=snapshot.catalog;
   indexedItems=new Map((indexedCatalog?.criteria||[]).map(row=>[row.id,row]));
  }
  return indexedItems;
 }
 function stockRows(query){
  const values=new Map();
  const items=criteria().filter(row=>{
   const cells=[[itemLabel(row),row.isYtSpare&&row.sparePartCode].filter(Boolean).join(' · '),row.unit||'Unidad',balance(row)];
   values.set(row.id,cells);
   const type=spareGroups.key(row);
   if(type&&(/\bitem\s*\d+\b/.test(query)||/^\d+$/.test(query)))return spareGroups.matches(row,query);
   return !query||spareGroups.matches(row,query)||norm(cells.join(' ')).includes(query)||
    (type&&norm(spareGroups.groupName(type)).includes(query));
  });
  const rows=[],display=[];let commonCount=0,truncated=false;
  for(const entry of spareGroups.entries(items)){
   if(entry.item){
    const cells=values.get(entry.item.id);
    rows.push(cells);
    if(++commonCount<=250)display.push(cells);else truncated=true;
   }else{
    const expanded=stockExpanded.get(entry.type)??Boolean(query);
    display.push({type:entry.type,label:entry.label,expanded});
    for(const [index,part] of entry.items.entries()){
     const cells=values.get(part.id);
     rows.push(cells);
     if(!expanded)continue;
     if(index>=250){truncated=true;continue;}
     display.push([[spareGroups.partName(part),part.spareApplication||part.application||part.ubicacionAplicacion,part.sparePartCode].filter(Boolean).join(' · '),cells[1],cells[2]]);
    }
   }
  }
  return {rows,display,truncated};
 }
 function registrationHour(row){return window.SKMovementTime.hour(window.SKMovementTime.warehouse(row))||'—';}
 function movementKind(row){
  if(row.kind!=='quantity_adjustment')return row.kind;
  if(row.id?.startsWith('opening-'))return 'opening';
  // En registros anteriores, la primera apertura de un elemento común conserva la revisión inicial.
  const criterion=criteriaById().get(row.itemId);
  if(criterion&&!criterion.isYtSpare&&row.balanceBefore===0&&row.requestSignature){
   try{
    const signature=JSON.parse(row.requestSignature);
    if(Array.isArray(signature)&&signature[0]==='production'&&signature[1]===row.itemId&&signature[3]==='0|0'&&signature[4]===0)return 'opening';
   }catch{}
  }
  return row.kind;
 }
 function movementInView(kind){
  if(view==='income')return kind==='income'||kind==='transfer_in';
  if(view==='openingHistory'||view==='opening')return kind==='opening';
  if(view==='delivery'||view==='loan'||view==='transfer_out'||view==='return')return kind===view;
  return true;
 }
 function renderTable(){
  renderRejected();
  if(view==='return'||view==='home')return;
  const query=find('#warehouseFilters').hidden?'':norm(find('#warehouseSearch').value).trim();let headers,rows,display,truncated;
  if(view==='stock'){
   headers=['ELEMENTO','UNIDAD','DISPONIBLE EN PRODUCCIÓN'];
   ({rows,display,truncated}=stockRows(query));
  }else if(view==='loans'){
   headers=['FECHA','HORA REGISTRO','ELEMENTO / ACTIVO','QUIÉN RECIBIÓ','PRESTADO','PENDIENTE','ESTADO'];
   const filter=find('#warehouseLoanFilter').value;
   rows=loans().filter(row=>filter==='all'||(filter==='pending'?row.left>0:row.left<=0)).flatMap(row=>{
    const cells=[displayDate(row.fechaISO),registrationHour(row),row.label,row.borrower,row.quantity,row.left,row.left>0?'PENDIENTE':'DEVUELTO'];
    return matchesQuery(cells,row.itemId,query)?[cells]:[];
   });
  }else{
   headers=['FECHA','HORA REGISTRO','MOVIMIENTO','ELEMENTO / ACTIVO','CANTIDAD','FUNCIONARIO','BODEGUERO/A DE TURNO','REGISTRADO POR','DESTINO','ESTADO'];
   rows=[...records(),...pending().map(row=>({...row,itemName:item(row.itemId)?.name,personName:people().find(p=>p.id===row.personId)?.nombre,pending:true}))].reverse().flatMap(row=>{
    const kind=movementKind(row);
    if(!movementInView(kind))return [];
    const amount=kind==='quantity_adjustment'?row.balanceBefore+' → '+row.balanceAfter:
     kind==='opening'&&row.kind==='quantity_adjustment'?row.balanceAfter:row.quantity;
    const cells=[displayDate(row.fechaISO),registrationHour(row),kinds[kind]||kind,row.assetLabel||row.itemName,amount,row.personName||'—',row.shiftKeeperName||'—',row.recordedByName||row.recordedBy||'—',row.destination||'—',row.syncRejected?'REQUIERE REVISIÓN':row.pending?'PENDIENTE':'CONFIRMADO'];
    return matchesQuery(cells,row.itemId,query)?[cells]:[];
   });
  }
  exportRows=[headers,...rows];
  const head=el('tr');for(const label of headers)head.append(el('th',label));find('thead').replaceChildren(head);
  const body=find('tbody'),visible=display||rows.slice(0,250);
  body.replaceChildren(...visible.map(entry=>{
   const tr=el('tr');
   if(Array.isArray(entry)){for(const value of entry)tr.append(el('td',value));return tr}
   const cell=el('td'),toggle=button(entry.label,()=>{
    stockExpanded.set(entry.type,!entry.expanded);renderTable();
    body.querySelector('[data-stock-group="'+entry.type+'"]').focus();
   });
   toggle.dataset.stockGroup=entry.type;toggle.setAttribute('aria-expanded',String(entry.expanded));
   const icon=el('span',entry.expanded?'📂':'📁');icon.setAttribute('aria-hidden','true');toggle.prepend(icon);
   cell.colSpan=headers.length;cell.append(toggle);tr.append(cell);return tr;
  }));
  if(view==='openingHistory'&&!rows.length){
   const tr=el('tr'),td=el('td',query?'No hay saldos de apertura que coincidan.':'Aún no hay saldos de apertura registrados.');
   td.colSpan=headers.length;tr.append(td);body.append(tr);
  }
  if(truncated||(!display&&rows.length>250)){const tr=el('tr'),td=el('td','Hay más resultados. Filtra la consulta o exporta el listado completo.');td.colSpan=headers.length;tr.append(td);body.append(tr);}
 }
 function renderRejected(){
  const box=find('#warehousePending');box.replaceChildren();
  for(const row of pending().filter(row=>row.syncRejected&&movementInView(movementKind(row)))){
   const message=el('p',(item(row.itemId)?.name||row.itemId)+': '+row.syncError);
   message.append(button('RETIRAR RECHAZADO',async()=>{if(!confirm('¿Retirar este movimiento rechazado del equipo? No se modifican los registros confirmados.'))return;await store.discard(account,row);snapshot=await store.read(account);paintWarehouse();}));box.append(message);
  }
 }
 function paintWarehouse(){
  const ready=snapshot.settings?.enabled;
  if(!snapshot.catalog){
   warehouseNote.textContent='Para registrar movimientos, sincroniza una vez y descarga los criterios de la bodega. Mientras tanto, puedes abrir las pantallas.';
  }else if(!ready){
   warehouseNote.textContent='Bodega pendiente de activación. Puedes consultar los datos descargados. Para registrar movimientos, abre SK Web Admin → Usuarios de Producción → Bodega de Producción, pulsa «Activar Bodega de Producción» y sincroniza aquí.';
  }else{
   const start=new Date(snapshot.settings.transferStartAt).toLocaleString('es-CO',{timeZone:'America/Bogota'});
   const notes=['Producción lleva sus propias existencias. Los ingresos desde Plaza Blending se registran automáticamente desde '+start.replace(/\.$/,'')+'.'];
   if(!snapshot.settings.allowSpareDelivery){
    notes.push('La entrega de repuestos YT y Columna está bloqueada para toda la bodega en SK Web.');
    if(session?.user&&!roles(session.user).includes('mechanic'))notes.push('Tu cuenta no tiene asignado el rol de Mecánico.');
   }
   if(!String(snapshot.catalogRevision||'').startsWith('warehouse-assets-v2|'))notes.push('Para incluir los activos de la bodega del nivel 4, actualiza Code.gs y sincroniza.');
   warehouseNote.textContent=notes.join('\n');
  }
  for(const node of panel.querySelectorAll('[data-view]')){node.hidden=node.dataset.view==='opening'&&!roles(session?.user).includes('admin');node.disabled=false;}
  find('[type=submit]').disabled=savingMovement||!ready||!snapshot.catalog;
  if(view==='return'){renderReturns();if(!form.hidden)recipientPicker.refresh();}
  else if(!form.hidden){choices();recipientPicker.refresh();}
  if(!form.hidden)updateKeeper();
  renderTable();paintNavigation();if(module==='warehouse')paintHeader();
 }
 function paintHeader(){
  if(module!=='warehouse'||!session)return;
  const count=pending().length,badge=byId('pendingBadge');badge.textContent=count?String(count):busy?'↻':snapshot.syncedAt?'✓':'0';badge.className='pendingBadge'+(!count&&snapshot.syncedAt?' synced':'');badge.title=count+' movimientos de bodega pendientes';
  byId('headerLastSync').textContent=snapshot.syncedAt?'Sinc. '+new Date(snapshot.syncedAt).toLocaleString('es-CO',{timeZone:'America/Bogota',day:'2-digit',month:'2-digit',hour:'numeric',minute:'2-digit'}):'SIN SINCRONIZAR';
  byId('sync').disabled=busy;
  byId('status').textContent=count?'BODEGA · '+count+' movimientos pendientes.':busy?'BODEGA · SINCRONIZANDO…':snapshot.syncedAt?'BODEGA · Todos los movimientos confirmados.':'BODEGA · Sincroniza para descargar los datos.';
 }
 async function load(){
  if(!session)return;account=session.user.document;snapshot=await store.read(account);paintWarehouse();
 }
 function paintNavigation(){
  const both=session&&permits(session.user,'warehouse')&&permits(session.user,'mechanic');
  const child=module==='warehouse'?view!=='home':module==='mechanic'&&mechanicMenu.hidden;
  change.hidden=!module||!both&&!child;
  mechanicTitle.hidden=module!=='mechanic';
  breadcrumb.hidden=module!=='warehouse';
  if(!breadcrumb.hidden){
   const label=view==='home'?'':actions.find(([,key])=>key===view)?.[0]||view;
   breadcrumb.textContent=label?'Bodega / '+label:'Bodega';
  }
  byId('productionHome').disabled=!module||!both&&!child;
 }
 function leaveCurrent(){
  if(savingMovement||saving||countSaving){status('Espera a que termine el guardado.');return false;}
  const stock=module==='mechanic'&&!mechanics.hidden?stockViews.find(row=>!row.panel.hidden):null;
  const stockDirty=stock&&(stock.kind==='income'?stock.form.elements.cantidad.value!=='':stock.form.dataset.openingDirty==='true');
  const dirty=module==='warehouse'?warehouseDirty:module==='mechanic'&&(draft.length||countDirty||stockDirty);
  if(dirty&&!confirm('Hay datos sin guardar en esta pantalla. ¿Descartarlos y volver?'))return false;
  if(module==='warehouse'&&warehouseDirty){form.reset();warehouseDirty=false;}
  if(module==='mechanic'){
   if(draft.length){draft=[];closeParts();paintDraft();}
   if(countDirty)selectCount(countSelection);
   if(stockDirty){
    stock.form.elements.cantidad.value='';
    delete stock.form.dataset.openingDirty;delete stock.form.dataset.openingDateEdited;delete stock.form.dataset.openingPart;
   }
  }
  return true;
 }
 function goBack(){
  if(!session)return;
  if(module==='warehouse'&&view!=='home'){setView(view==='openingHistory'?openingHistoryFrom:'home');return;}
  if(module==='mechanic'&&mechanicMenu.hidden){
   if(!leaveCurrent())return;
   const previous=mechanicMenu.querySelector('[aria-pressed="true"]');
   showConsumptionView();
   previous?.focus();return;
  }
  choose('');
 }
 function choose(next){
  if(!session||!leaveCurrent())return;
  const both=permits(session.user,'warehouse')&&permits(session.user,'mechanic');
  if(next&&!permits(session.user,next))return;
  showWarehouseInfo(false);
  module=next||(!both?(permits(session.user,'warehouse')?'warehouse':'mechanic'):'');
  home.hidden=Boolean(module);panel.hidden=module!=='warehouse';mechanics.hidden=module!=='mechanic';
  byId('reviewIncomeConflicts').hidden=module!=='mechanic'||!window.SKProductionSync.pendingSummary(state).incomeRejected||session.user.role!=='admin';
  if(module==='warehouse'){setView('home');void load().then(()=>{if(navigator.onLine)void synchronize()});}else if(module==='mechanic'){showConsumptionView();paint();paintSync();if(navigator.onLine)scheduleSync(0);}
  paintNavigation();
 }
 async function synchronize(){
  if(activeSync)return activeSync;
  const active=session;if(!active||!permits(active.user,'warehouse'))return {ok:true};
  if(!navigator.onLine||!canSync()){tell(!navigator.onLine?'Sin conexión. Los movimientos siguen guardados en este equipo.':'Inicia sesión con conexión para sincronizar la bodega.');return {ok:false};}
  activeSync=(async()=>{
   busy=true;paintHeader();
   try{
    let again;
    do{
     const local=await store.read(active.user.document),waiting=(local.pending||[]).filter(row=>!row.syncRejected).slice(0,1000);
     // Respeta el orden de captura cuando quedan pendientes de una versión anterior.
     const withShift=Boolean(waiting[0]?.recordedBy),boundary=waiting.findIndex(row=>Boolean(row.recordedBy)!==withShift);
     const sent=(boundary<0?waiting:waiting.slice(0,boundary)).map(store.clean);
     const result=await api('productionWarehouseSync',{token:active.token,protocol:'production-warehouse-v1',...(withShift?{shiftMovements:sent}:{pending:sent}),cursor:local.cursor||0,catalogRevision:local.catalogRevision||''});
     if(withShift&&!result.shiftKeeperV1)throw new Error('Actualiza Code.gs y publica la nueva versión para sincronizar el bodeguero de turno. Los registros siguen guardados en este equipo.');
     await store.reconcile(active.user.document,result,sent);
     const fresh=await store.read(active.user.document);
     if(session!==active)return {ok:false};snapshot=fresh;session.user.roles=result.roles;try{localStorage.setItem(sessionKey,JSON.stringify(session))}catch{}
     again=(fresh.pending||[]).some(row=>!row.syncRejected);
    }while(again&&navigator.onLine);
    tell(pending().length?'Datos actualizados. Revisa los movimientos rechazados.':'Bodega sincronizada. Todos los movimientos confirmados.');return {ok:!pending().length};
   }catch(error){
    const message=/Web Admin|Solicitud no válida/i.test(error.message)?'El servidor aún no reconoce Bodega de Producción. Actualiza Code.gs, publica una nueva versión de la implementación y vuelve a sincronizar. Tus registros pendientes se conservan.':error.message;
    tell(message);return {ok:false,error:message};
   }
   finally{busy=false;activeSync=null;if(session===active)paintWarehouse();}
  })();return activeSync;
 }
 form.onsubmit=async event=>{
  event.preventDefault();if(form.hidden||savingMovement||!session)return;
  const active=session,returning=view==='return',loan=returning?returnLoan():null;
  const selected=item(returning?loan?.itemId:f.itemId.value),date=readDate(f.fechaISO);
  try{
   if(!snapshot.settings?.enabled)throw new Error('La bodega aún no está activa.');
   updateKeeper();
   const actor=active.user,keeper=roles(actor).includes('warehouse')?
    {id:actor.personId,documento:actor.document,nombre:actor.name}:keeperPicker.selected();
   if(!keeper){
    f.keeperSearch.setCustomValidity('Busca y selecciona al bodeguero o bodeguera de turno.');
    f.keeperSearch.reportValidity();return;
   }
   if(returning&&!loan)throw new Error('Selecciona un préstamo pendiente de reintegro.');
   if(returning&&!selected)throw new Error('El elemento de este préstamo ya no está habilitado en el catálogo.');
   if(returning&&!date)throw new Error('Escribe una fecha válida para el reintegro.');
   if(!returning&&(!find('#warehouseItemField')._validateItemSearch()||!selected||!date))throw new Error('Selecciona el elemento de la lista y una fecha válida.');
   if(selected.isYtSpare&&['delivery','loan','transfer_out'].includes(view)&&(state.pending||[]).some(row=>!row.kind&&!row.syncRejected))throw new Error('Hay consumos de Mecánica pendientes en este equipo. Sincronízalos antes de entregar repuestos desde Bodega.');
   if(view!=='opening'&&!recipientPicker.selected()){
    f.personSearch.setCustomValidity('Busca y selecciona una persona del listado de Personal.');
    f.personSearch.reportValidity();return;
   }
   const quantity=Number(f.quantity.value);if(f.quantity.value===''||!Number.isFinite(quantity)||quantity<(view==='opening'?0:0.000001))throw new Error('Escribe una cantidad válida.');
   if(['delivery','loan','transfer_out'].includes(view)&&!selected.isFixedAsset&&quantity>balance(selected))throw new Error('La cantidad supera lo disponible en este equipo.');
   const assetId=returning?loan.assetId||'':f.assetId.value;
   if(returning&&quantity>loan.left)throw new Error('Revisa el préstamo y la cantidad pendiente.');
   const creating=selected.isFixedAsset&&view==='income'&&f.assetMode.value==='new';
   if(selected.isFixedAsset&&!assetId&&!creating)throw new Error('Selecciona el activo registrado.');
   if(selected.isFixedAsset&&outgoing(view)&&!fixedAssets(selected,view).some(asset=>asset.id===assetId))throw new Error('El activo no está disponible en Bodega de Producción.');
   if(view==='transfer_out'&&!confirm('¿Enviar '+quantity+' '+selected.name+' a Plaza Blending? Al sincronizar se descontará en Producción y se registrará el ingreso en Plaza.'))return;
   const row={id:crypto.randomUUID(),kind:view,recordedBy:actor.document,recordedByName:actor.name,shiftKeeperId:keeper.id,shiftKeeperDocument:keeper.documento,shiftKeeperName:keeper.nombre,itemId:selected.id,quantity,fechaISO:date,assetId,personId:f.personId.value,destination:f.destination.value.trim(),loanId:loan?.id||'',sourceLoanId:view==='transfer_out'?f.sourceLoanId.value:'',incomeType:view==='income'?f.incomeType.value:'',notes:f.notes.value.trim(),createdAt:new Date().toISOString(),...(creating?{newAsset:{id:crypto.randomUUID(),serial:f.newSerial.value,modelo:f.newModel.value,marcaComercial:f.newBrand.value,marcaAnterior:f.newMark.value,numeroClase:f.newNumber.value,minaOrigen:f.newMine.value,longitud:f.newLength.value}}:{})};
   savingMovement=true;find('[type=submit]').disabled=true;
   await store.queue(active.user.document,row);
   if(session!==active)return;
   snapshot={...snapshot,pending:[...pending(),row]};
   selectedReturnId='';
   resetMovementForm(row.kind==='opening'?row.fechaISO:today());
   tell('GUARDADO EN ESTE EQUIPO · PENDIENTE DE SINCRONIZAR.');
   if(navigator.onLine)void synchronize();
  }catch(error){if(session===active)tell(error.message);}
  finally{savingMovement=false;if(session===active)paintWarehouse();}
 };
 find('[data-excel]').onclick=()=>window.SKDownloadTableExcel?.(exportRows,(view==='openingHistory'?'Saldos_de_apertura_Produccion_':'Bodega_Produccion_')+today()+'.xlsx');
 find('[data-pdf]').onclick=()=>{
  const target=window.open('','_blank');if(!target){tell('Permite la ventana de impresión para guardar el PDF.');return;}
  target.document.title='Bodega de Producción';const style=target.document.createElement('style');style.textContent='@page{size:A4 landscape;margin:12mm}body{font:12px sans-serif}table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:6px}thead{display:table-header-group}';target.document.head.append(style);
  const heading=target.document.createElement('h1');heading.textContent=view==='openingHistory'?'SALDOS DE APERTURA · BODEGA DE PRODUCCIÓN':'BODEGA DE PRODUCCIÓN';const table=target.document.createElement('table');
  exportRows.forEach((values,index)=>{const tr=(index?table.tBodies[0]||table.createTBody():table.createTHead()).insertRow();values.forEach(value=>{const cell=index?tr.insertCell():target.document.createElement('th');cell.textContent=value;if(!index)tr.append(cell);});});target.document.body.append(heading,table);target.print();
 };
 window.SKProductionWarehouse={permits,roles,paintNavigation,get module(){return module},get snapshot(){return snapshot},async open(){await load();choose('')},choose,sync:synchronize,paintHeader,close(){account='';snapshot={};module='';warehouseDirty=false;panel.hidden=true;home.hidden=true;mechanics.hidden=true;},resume(){if(session&&permits(session.user,'warehouse'))void synchronize()}};
 byId('sync').addEventListener('click',event=>{if(module==='warehouse'){event.stopImmediatePropagation();void synchronize();}},true);
 window.addEventListener('online',()=>{if(module==='warehouse')void synchronize()});
 timer=setInterval(()=>{if(module==='warehouse'&&!document.hidden)void synchronize()},300000);
 setView('home');
})();
