(()=>{
 'use strict';
 const store=window.SKProductionWarehouseStore;
 let account='',snapshot={},view='home',warehouseDirty=false,busy=false,savingMovement=false,module='',exportRows=[],timer,activeSync;
 const kinds={income:'Ingreso externo',opening:'Saldo de apertura',delivery:'Entrega',loan:'Préstamo',return:'Reintegro',transfer_in:'Ingreso desde Plaza',transfer_out:'Traslado a Plaza'};
 const roles=user=>Array.isArray(user?.roles)?user.roles:[user?.role||'assistant'];
 const permits=(user,scope)=>roles(user).includes('admin')||(scope==='mechanic'?roles(user).some(role=>['mechanic','assistant'].includes(role)):roles(user).includes('warehouse'));
 const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node};
 const button=(text,action)=>{const node=el('button',text);node.type='button';node.onclick=action;return node};
 const host=byId('workspace'),toolbar=host.querySelector('.productionToolbar'),mechanics=el('div');mechanics.id='mechanicsWorkspace';
 let sibling=toolbar.nextElementSibling;while(sibling){const next=sibling.nextElementSibling;mechanics.append(sibling);sibling=next;}host.append(mechanics);
 const home=el('section');home.id='productionModuleHome';home.hidden=true;
 const title=el('h2','PRODUCCIÓN'),intro=el('p','Selecciona el módulo que vas a utilizar.'),modules=el('div');modules.className='productionModules';
 modules.append(button('MECÁNICA',()=>choose('mechanic')),button('BODEGA',()=>choose('warehouse')));home.append(title,intro,modules);
 const change=button('',goBack);change.id='changeProductionModule';change.hidden=true;change.setAttribute('aria-label','Volver a la pantalla anterior');change.title='Volver';change.innerHTML='<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false"><path fill="currentColor" d="M10 5 2 12l8 7v-5h3c4.2 0 7 1.8 9 5-.8-6.5-4-10-9-10h-3V5Z"/></svg>';
 const navigation=el('nav');navigation.id='productionNavigation';navigation.setAttribute('aria-label','Ubicación en Producción');const breadcrumb=el('span');breadcrumb.id='productionBreadcrumb';navigation.append(change,breadcrumb);
 byId('productionHome').onclick=()=>choose('');
 const panel=el('section');panel.id='warehousePanel';panel.hidden=true;
 panel.innerHTML='<h2>BODEGA DE PRODUCCIÓN</h2><p id="warehouseNote" class="warehouseHint"></p><div class="warehouseActions" role="group" aria-label="Tareas de bodega"></div><p id="warehouseStatus" role="status" aria-live="polite"></p><div id="warehousePending"></div><form id="warehouseForm" hidden><label class="wide">BUSCAR ELEMENTO<input name="itemSearch" type="search" placeholder="Nombre, ítem o aplicación" autocomplete="off"></label><label class="wide">ELEMENTO<select name="itemId" required></select></label><label data-asset-mode class="wide" hidden>ACTIVO<select name="assetMode"><option value="registered">Registrado</option><option value="new">Registrar activo nuevo</option></select></label><div data-new-asset class="wide" hidden><label>SERIAL<input name="newSerial" maxlength="160"></label><label>MODELO<input name="newModel" maxlength="100"></label><label>MARCA COMERCIAL<input name="newBrand" maxlength="100"></label><label>MARCA O NÚMERO ANTERIOR<input name="newMark" maxlength="100"></label><label>NÚMERO DE CLASE (YT / COLUMNA)<input name="newNumber" maxlength="30"></label><label>MINA DE ORIGEN<input name="newMine" value="Sandra K" maxlength="100"></label><label>LONGITUD<input name="newLength" maxlength="40" placeholder="Cuando aplique"></label></div><label data-asset class="wide" hidden>ACTIVO REGISTRADO<select name="assetId"></select></label><label data-loan class="wide" hidden>PRÉSTAMO PENDIENTE<select name="loanId"></select></label><label data-source-loan class="wide" hidden>PRÉSTAMO DE PLAZA A DEVOLVER<select name="sourceLoanId"></select></label><label>FECHA<input name="fechaISO" type="text" placeholder="DD/MM/AAAA" inputmode="numeric" maxlength="10" required></label><label>CANTIDAD<input name="quantity" type="number" min="0.001" step="any" required></label><label data-person class="wide">BUSCAR FUNCIONARIO<input name="personSearch" type="search" placeholder="Nombre o documento" autocomplete="off"></label><label data-person class="wide"><span data-person-label>FUNCIONARIO</span><select name="personId"></select></label><label data-destination class="wide">DÓNDE ESTARÁ EL ELEMENTO<input name="destination" maxlength="160" placeholder="Área, nivel o lugar"></label><label data-income class="wide" hidden>MOTIVO DEL INGRESO<select name="incomeType"><option value="ENTRADA">Entrada externa</option><option value="REPARACIÓN">Reparación</option></select></label><label class="wide">OBSERVACIONES<textarea name="notes" rows="2" maxlength="1000"></textarea></label><p class="wide" data-balance></p><button class="wide" type="submit">GUARDAR</button></form><div id="warehouseFilters"><input type="search" id="warehouseSearch" placeholder="Buscar en la consulta"><select id="warehouseLoanFilter" aria-label="Estado de préstamos" hidden><option value="pending">PENDIENTES</option><option value="returned">DEVUELTOS</option><option value="all">TODOS</option></select></div><div id="warehouseExports"><button type="button" data-excel>EXPORTAR EXCEL</button><button type="button" data-pdf>EXPORTAR PDF</button></div><div class="tableWrap"><table id="warehouseTable"><thead></thead><tbody></tbody></table></div>';
 toolbar.after(navigation,home,panel);
 const find=s=>panel.querySelector(s),form=find('form'),f=form.elements,feedback=find('#warehouseStatus');
 const tell=message=>{feedback.textContent=message};
 form.addEventListener('input',()=>{warehouseDirty=true});form.addEventListener('change',()=>{warehouseDirty=true});
 const criteria=()=>snapshot.catalog?.criteria||[],people=()=>snapshot.catalog?.personal||[],assets=()=>snapshot.catalog?.assets||[];
 const pending=()=>snapshot.pending||[],records=()=>[...(snapshot.records||[])].sort((a,b)=>a.revision-b.revision);
 const item=id=>criteria().find(row=>row.id===id),assetLabel=row=>[row.clase,row.marcaActual||row.marcaInterna||row.marcaAnterior,row.numeroClase&&'N.º '+row.numeroClase,row.serial].filter(Boolean).join(' · ');
 const itemLabel=row=>row.isYtSpare?[row.spareEquipment,'Ítem '+row.spareItemNumber,row.spareItemName||row.name,row.spareApplication||row.application].filter(Boolean).join(' · '):[row.name,row.application||row.ubicacionAplicacion].filter(Boolean).join(' · ');
 const outstanding=loan=>loan.quantity-records().filter(row=>row.kind==='return'&&row.loanId===loan.id).reduce((n,row)=>n+row.quantity,0)-pending().filter(row=>!row.syncRejected&&row.kind==='return'&&row.loanId===loan.id).reduce((n,row)=>n+row.quantity,0);
 function balance(id){let value=Number((snapshot.balances||[]).find(row=>row.itemId===id)?.quantity)||0;for(const row of pending())if(row.itemId===id&&!row.syncRejected)value+=Number(row.quantity)*(['delivery','loan','transfer_out'].includes(row.kind)?-1:1);return value;}
 function selectOptions(select,options,placeholder){const before=select.value;select.replaceChildren(new Option(placeholder,''),...options.map(([value,label])=>new Option(label,value)));if(options.some(([value])=>String(value)===before))select.value=before;}
 function choices(){
  const query=norm(f.itemSearch.value),sparesBlocked=['delivery','loan','transfer_out'].includes(view)&&!snapshot.settings?.allowSpareDelivery;
  const rows=criteria().filter(row=>(!query||norm(itemLabel(row)).includes(query))&&(!sparesBlocked||!row.isYtSpare)&&(view!=='loan'||row.allowLoan)&&(view!=='opening'||!row.isYtSpare));
  selectOptions(f.itemId,rows.map(row=>[row.id,itemLabel(row)]),'Seleccionar elemento');fieldsForItem();
 }
 function fieldsForItem(){
  const selected=item(f.itemId.value),fixed=selected?.isFixedAsset,loanMode=view==='return';
  const creating=fixed&&view==='income'&&f.assetMode.value==='new';
  find('[data-asset-mode]').hidden=!fixed||view!=='income';find('[data-new-asset]').hidden=!creating;
  find('[data-asset]').hidden=!fixed||loanMode||creating;find('[data-loan]').hidden=!loanMode;
  f.assetId.required=Boolean(fixed&&!loanMode&&!creating);f.quantity.min=view==='opening'?'0':selected?.isYtSpare||fixed?'1':'0.001';f.quantity.step=selected?.isYtSpare||fixed?'1':'any';f.quantity.readOnly=Boolean(fixed);if(fixed)f.quantity.value='1';
  const selectedAssets=assets().filter(row=>norm(row.clase)===norm(selected?.name)&&!/dado.*baja/i.test(row.estado||''));
  selectOptions(f.assetId,selectedAssets.map(row=>[row.id,assetLabel(row)]),'Seleccionar activo');
  const loans=records().filter(row=>row.kind==='loan'&&row.itemId===selected?.id&&outstanding(row)>0);
  selectOptions(f.loanId,loans.map(row=>[row.id,`${row.personName} · ${row.assetLabel||row.itemName} · pendiente ${outstanding(row)}`]),'Seleccionar préstamo');
  find('[data-source-loan]').hidden=view!=='transfer_out';
  const sourceLoans=records().filter(row=>row.kind==='transfer_in'&&row.sourceLoan&&row.itemId===selected?.id&&!records().some(out=>out.sourceLoanId===row.sourceDeliveryId)&&!pending().some(out=>!out.syncRejected&&out.sourceLoanId===row.sourceDeliveryId));
  selectOptions(f.sourceLoanId,sourceLoans.map(row=>[row.sourceDeliveryId,`${displayDate(row.fechaISO)} · ${row.assetLabel||row.itemName} · ${row.quantity}`]),'Traslado normal / no corresponde a un préstamo');
  f.loanId.required=loanMode;find('[data-balance]').textContent=selected?'DISPONIBLE EN PRODUCCIÓN: '+balance(selected.id)+' '+(selected.unit||'unidades'):'';
 }
 function personChoices(){const query=norm(f.personSearch.value);selectOptions(f.personId,people().filter(row=>norm(row.nombre+' '+row.documento).includes(query)).slice(0,100).map(row=>[row.id,row.nombre+' · '+row.documento]),'Seleccionar funcionario');}
 function setView(next){
  if(savingMovement||next!==view&&!leaveCurrent())return;view=next;warehouseDirty=false;form.hidden=['home','stock','history','loans'].includes(view);
  find('.warehouseActions').hidden=view!=='home';find('.tableWrap').hidden=view==='home';
  find('#warehouseLoanFilter').hidden=view!=='loans';find('#warehouseFilters').hidden=!form.hidden||view==='home';find('#warehouseExports').hidden=!form.hidden||view==='home';
  for(const node of panel.querySelectorAll('[data-view]'))node.setAttribute('aria-pressed',String(node.dataset.view===view));
  if(!form.hidden){form.reset();f.fechaISO.value=displayDate(today());f.quantity.value='';choices();personChoices();f.personId.required=view!=='opening';for(const node of panel.querySelectorAll('[data-person]'))node.hidden=view==='opening';find('[data-person-label]').textContent=['income','return'].includes(view)?'QUIÉN TRAE':'QUIÉN RECIBE';find('[data-destination]').hidden=!['delivery','loan'].includes(view);f.destination.required=['delivery','loan'].includes(view);find('[data-income]').hidden=view!=='income';find('[type=submit]').textContent='GUARDAR '+(kinds[view]||'MOVIMIENTO').toUpperCase();}
  renderTable();paintNavigation();
 }
 const actions=[['ENTREGAS','delivery'],['INGRESOS','income'],['PRÉSTAMOS','loan'],['REINTEGROS','return'],['EXISTENCIAS','stock'],['CONSULTAR MOVIMIENTOS','history'],['PRÉSTAMOS PENDIENTES','loans'],['ENVIAR A PLAZA','transfer_out'],['SALDO DE APERTURA','opening']];
 for(const [label,value] of actions){const node=button(label,()=>setView(value));node.dataset.view=value;find('.warehouseActions').append(node);}
 f.sourceLoanId.onchange=()=>{const loan=records().find(row=>row.sourceDeliveryId===f.sourceLoanId.value);if(loan){f.quantity.value=loan.quantity;f.assetId.value=loan.assetId||'';}};
 f.assetMode.onchange=fieldsForItem;f.itemSearch.oninput=choices;f.itemId.onchange=fieldsForItem;f.personSearch.oninput=personChoices;
 f.loanId.onchange=()=>{const loan=records().find(row=>row.id===f.loanId.value);if(loan){f.assetId.value=loan.assetId||'';f.quantity.value=outstanding(loan);}};
 find('#warehouseSearch').oninput=renderTable;find('#warehouseLoanFilter').onchange=renderTable;
 function renderTable(){
  const query=norm(find('#warehouseSearch').value);let headers,rows;
  if(view==='stock'){
   headers=['ELEMENTO','UNIDAD','DISPONIBLE EN PRODUCCIÓN'];rows=criteria().map(row=>[itemLabel(row),row.unit||'Unidad',balance(row.id)]);
  }else if(view==='loans'){
   headers=['FECHA','ELEMENTO / ACTIVO','QUIÉN RECIBIÓ','PRESTADO','PENDIENTE','ESTADO'];
   const filter=find('#warehouseLoanFilter').value;
   rows=records().filter(row=>row.kind==='loan').map(row=>({...row,left:outstanding(row)})).filter(row=>filter==='all'||(filter==='pending'?row.left>0:row.left<=0)).reverse().map(row=>[displayDate(row.fechaISO),row.assetLabel||row.itemName,row.personName,row.quantity,row.left,row.left>0?'PENDIENTE':'DEVUELTO']);
  }else{
   headers=['FECHA','MOVIMIENTO','ELEMENTO / ACTIVO','CANTIDAD','FUNCIONARIO','DESTINO','ESTADO'];
   rows=[...records(),...pending().map(row=>({...row,itemName:item(row.itemId)?.name,personName:people().find(p=>p.id===row.personId)?.nombre,pending:true}))].reverse().map(row=>[displayDate(row.fechaISO),kinds[row.kind]||row.kind,row.assetLabel||row.itemName,row.quantity,row.personName||'—',row.destination||'—',row.syncRejected?'REQUIERE REVISIÓN':row.pending?'PENDIENTE':'CONFIRMADO']);
  }
  rows=rows.filter(row=>!query||norm(row.join(' ')).includes(query));exportRows=[headers,...rows];
  const head=el('tr');for(const label of headers)head.append(el('th',label));find('thead').replaceChildren(head);
  find('tbody').replaceChildren(...rows.slice(0,250).map(values=>{const tr=el('tr');for(const value of values)tr.append(el('td',value));return tr;}));
  if(rows.length>250){const tr=el('tr'),td=el('td','Se muestran los primeros 250 resultados. Filtra la consulta o exporta el listado completo.');td.colSpan=headers.length;tr.append(td);find('tbody').append(tr);}
 }
 function paintWarehouse(){
  const ready=snapshot.settings?.enabled;
  find('#warehouseNote').textContent=!snapshot.catalog?'Puedes abrir las pantallas. Para registrar movimientos, sincroniza una vez y descarga los criterios de la bodega.':!ready?'BODEGA PENDIENTE DE ACTIVACIÓN. Puedes abrir las pantallas y consultar los datos descargados. Para registrar movimientos: SK Web Admin → USUARIOS DE PRODUCCIÓN → Bodega de Producción → ACTIVAR BODEGA DE PRODUCCIÓN. Después sincroniza aquí.':
   'Cantidades propias de Producción. Ingresos automáticos desde '+new Date(snapshot.settings.transferStartAt).toLocaleString('es-CO',{timeZone:'America/Bogota'})+'.'+(!snapshot.settings.allowSpareDelivery?' La entrega de repuestos YT y Columna está bloqueada.':'');
  for(const node of panel.querySelectorAll('[data-view]')){node.hidden=node.dataset.view==='opening'&&!roles(session?.user).includes('admin');node.disabled=false;}
  find('[type=submit]').disabled=busy||savingMovement||!ready||!snapshot.catalog;
  if(!form.hidden){choices();personChoices();}
  const box=find('#warehousePending');box.replaceChildren();
  for(const row of pending().filter(row=>row.syncRejected)){
   const message=el('p',(item(row.itemId)?.name||row.itemId)+': '+row.syncError);
   message.append(button('RETIRAR RECHAZADO',async()=>{if(!confirm('¿Retirar este movimiento rechazado del equipo? No se modifican los registros confirmados.'))return;await store.discard(account,row);snapshot=await store.read(account);paintWarehouse();}));box.append(message);
  }
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
 function mechanicSection(){
  if(!byId('physicalCount').hidden)return 'Inventario físico';
  if(!byId('productionQueries').hidden)return 'Consultas';
  const selected=stockViews.find(row=>!row.panel.hidden);return selected?(selected.kind==='income'?'Ingresos':'Existencias'):'Consumos';
 }
 function paintNavigation(){
  const both=session&&permits(session.user,'warehouse')&&permits(session.user,'mechanic');
  const child=module==='warehouse'?view!=='home':module==='mechanic'&&mechanicSection()!=='Consumos';
  change.hidden=!module||!both&&!child;
  const path=['Inicio'];if(module==='warehouse')path.push('Bodega');if(module==='mechanic')path.push('Mecánica',mechanicSection());
  if(module==='warehouse'&&view!=='home')path.push(actions.find(([,key])=>key===view)?.[0]||view);
  breadcrumb.textContent=path.join(' / ');byId('productionHome').disabled=!module||!both&&!child;
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
   if(stockDirty){stock.form.elements.cantidad.value='';delete stock.form.dataset.openingDirty;}
  }
  return true;
 }
 function goBack(){
  if(!session||!leaveCurrent())return;
  if(module==='warehouse'&&view!=='home'){setView('home');return;}
  if(module==='mechanic'&&mechanicSection()!=='Consumos'){
   showConsumptionView(false);
   paintNavigation();return;
  }
  choose('');
 }
 function choose(next){
  if(!session||!leaveCurrent())return;
  const both=permits(session.user,'warehouse')&&permits(session.user,'mechanic');
  if(next&&!permits(session.user,next))return;
  module=next||(!both?(permits(session.user,'warehouse')?'warehouse':'mechanic'):'');
  home.hidden=Boolean(module);panel.hidden=module!=='warehouse';mechanics.hidden=module!=='mechanic';
  byId('reviewIncomeConflicts').hidden=module!=='mechanic'||!window.SKProductionSync.pendingSummary(state).incomeRejected||session.user.role!=='admin';
  if(module==='warehouse'){setView('home');void load().then(()=>{if(navigator.onLine)void synchronize()});}else if(module==='mechanic'){showConsumptionView(false);paint();paintSync();if(navigator.onLine)scheduleSync(0);}
  paintNavigation();
 }
 async function synchronize(){
  if(activeSync)return activeSync;
  const active=session;if(!active||!permits(active.user,'warehouse'))return {ok:true};
  if(!navigator.onLine||!canSync()){tell(!navigator.onLine?'Sin conexión. Los movimientos siguen guardados en este equipo.':'Inicia sesión con conexión para sincronizar la bodega.');return {ok:false};}
  activeSync=(async()=>{
   busy=true;find('[type=submit]').disabled=true;paintHeader();
   try{
    let again;
    do{
     const local=await store.read(active.user.document),sent=(local.pending||[]).filter(row=>!row.syncRejected).slice(0,1000).map(store.clean);
     const result=await api('productionWarehouseSync',{token:active.token,protocol:'production-warehouse-v1',pending:sent,cursor:local.cursor||0,catalogRevision:local.catalogRevision||''});
     await store.reconcile(active.user.document,result,sent);
     const fresh=await store.read(active.user.document);
     if(session!==active)return {ok:false};snapshot=fresh;session.user.roles=result.roles;try{localStorage.setItem(sessionKey,JSON.stringify(session))}catch{}
     again=(fresh.pending||[]).some(row=>!row.syncRejected);
    }while(again&&navigator.onLine);
    tell(pending().length?'Datos actualizados. Revisa los movimientos rechazados.':'Bodega sincronizada. Todos los movimientos confirmados.');return {ok:!pending().length};
   }catch(error){tell(error.message);return {ok:false,error:error.message};}
   finally{busy=false;activeSync=null;if(session===active)paintWarehouse();}
  })();return activeSync;
 }
 form.onsubmit=async event=>{
  event.preventDefault();if(savingMovement||!session)return;
  if(busy){tell('Sincronizando. Puedes completar el formulario; espera a que termine para guardar.');return;}
  const active=session,selected=item(f.itemId.value),date=readDate(f.fechaISO);
  try{
   if(!snapshot.settings?.enabled)throw new Error('La bodega aún no está activa.');
   if(!selected||!date)throw new Error('Selecciona el elemento y una fecha válida.');
   if(selected.isYtSpare&&['delivery','loan','transfer_out'].includes(view)&&(state.pending||[]).some(row=>!row.kind&&!row.syncRejected))throw new Error('Hay consumos de Mecánica pendientes en este equipo. Sincronízalos antes de entregar repuestos desde Bodega.');
   const quantity=Number(f.quantity.value);if(f.quantity.value===''||!Number.isFinite(quantity)||quantity<(view==='opening'?0:0.000001))throw new Error('Escribe una cantidad válida.');
   if(['delivery','loan','transfer_out'].includes(view)&&!selected.isFixedAsset&&quantity>balance(selected.id))throw new Error('La cantidad supera lo disponible en este equipo.');
   const loan=records().find(row=>row.id===f.loanId.value),assetId=view==='return'?loan?.assetId||'':f.assetId.value;
   if(view==='return'&&(!loan||quantity>outstanding(loan)))throw new Error('Revisa el préstamo y la cantidad pendiente.');
   const creating=selected.isFixedAsset&&view==='income'&&f.assetMode.value==='new';
   if(selected.isFixedAsset&&!assetId&&!creating)throw new Error('Selecciona el activo registrado.');
   if(view==='transfer_out'&&!confirm('¿Enviar '+quantity+' '+selected.name+' a Plaza Blending? Al sincronizar se descontará en Producción y se registrará el ingreso en Plaza.'))return;
   const row={id:crypto.randomUUID(),kind:view,itemId:selected.id,quantity,fechaISO:date,assetId,personId:f.personId.value,destination:f.destination.value.trim(),loanId:view==='return'?f.loanId.value:'',sourceLoanId:view==='transfer_out'?f.sourceLoanId.value:'',incomeType:view==='income'?f.incomeType.value:'',notes:f.notes.value.trim(),createdAt:new Date().toISOString(),...(creating?{newAsset:{id:crypto.randomUUID(),serial:f.newSerial.value,modelo:f.newModel.value,marcaComercial:f.newBrand.value,marcaAnterior:f.newMark.value,numeroClase:f.newNumber.value,minaOrigen:f.newMine.value,longitud:f.newLength.value}}:{})};
   savingMovement=true;find('[type=submit]').disabled=true;await store.queue(active.user.document,row);snapshot=await store.read(active.user.document);
   if(session!==active){savingMovement=false;return;}
   if(session===active){setTimeout(()=>{savingMovement=false;warehouseDirty=false;setView(view);tell('GUARDADO EN ESTE EQUIPO · PENDIENTE DE SINCRONIZAR.');paintWarehouse();if(navigator.onLine)void synchronize();},0);}
  }catch(error){savingMovement=false;tell(error.message);paintWarehouse();}
 };
 find('[data-excel]').onclick=()=>window.SKDownloadTableExcel?.(exportRows,'Bodega_Produccion_'+today()+'.xlsx');
 find('[data-pdf]').onclick=()=>{
  const target=window.open('','_blank');if(!target){tell('Permite la ventana de impresión para guardar el PDF.');return;}
  target.document.title='Bodega de Producción';const style=target.document.createElement('style');style.textContent='@page{size:A4 landscape;margin:12mm}body{font:12px sans-serif}table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:6px}thead{display:table-header-group}';target.document.head.append(style);
  const heading=target.document.createElement('h1');heading.textContent='BODEGA DE PRODUCCIÓN';const table=target.document.createElement('table');
  exportRows.forEach((values,index)=>{const tr=(index?table.tBodies[0]||table.createTBody():table.createTHead()).insertRow();values.forEach(value=>{const cell=index?tr.insertCell():target.document.createElement('th');cell.textContent=value;if(!index)tr.append(cell);});});target.document.body.append(heading,table);target.print();
 };
 window.SKProductionWarehouse={permits,roles,paintNavigation,get module(){return module},get snapshot(){return snapshot},async open(){await load();choose('')},choose,sync:synchronize,paintHeader,close(){account='';snapshot={};module='';warehouseDirty=false;panel.hidden=true;home.hidden=true;mechanics.hidden=true;},resume(){if(session&&permits(session.user,'warehouse'))void synchronize()}};
 byId('sync').addEventListener('click',event=>{if(module==='warehouse'){event.stopImmediatePropagation();void synchronize();}},true);
 window.addEventListener('online',()=>{if(module==='warehouse')void synchronize()});
 timer=setInterval(()=>{if(module==='warehouse'&&!document.hidden)void synchronize()},300000);
 setView('home');
})();
