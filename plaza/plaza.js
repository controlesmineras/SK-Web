(()=>{
  'use strict';
  let localSaveTask=null,appReady=false,collaboratorRevisionApi='',lastSyncAttempt=Date.now(),syncRenderPending=false;
  const $=selector=>document.querySelector(selector),api=()=>window.SK_SYNC_CONFIG?.apiUrl||'',uuid=()=>crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`,nativeAlert=window.alert.bind(window);
  function createDeviceAccess(namespace) {
    const key = namespace + ':device-access:v1';
    const id = (value) => String(value).trim().toLowerCase();
    const read = () => { try {
        return Object.assign(Object.create(null), JSON.parse(localStorage.getItem(key) || '{}'));
    }
    catch {
        return Object.create(null);
    } };
    const write = (rows) => localStorage.setItem(key, JSON.stringify(rows));
    const hex = (bytes) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    async function hash(password, salt) { const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']); return hex(new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 150000, hash: 'SHA-256' }, material, 256))); }
    return {
        async remember(username, password, session) { const salt = hex(crypto.getRandomValues(new Uint8Array(16))), derived = await hash(password, salt), rows = read(); rows[id(username)] = { salt, hash: derived, session, confirmedAt: new Date().toISOString() }; write(rows); },
        async verify(username, password) { const row = read()[id(username)]; if (!row || await hash(password, row.salt) !== row.hash)
            return null; return row.session; },
        byToken(token) { return Object.values(read()).find(row => row.session?.token === token)?.session || null; },
        refresh(token, session) { const rows = read(); for (const row of Object.values(rows))
            if (row.session?.token === token) {
                row.session = session;
                row.confirmedAt = new Date().toISOString();
            } write(rows); },
        remove(username) { const rows = read(); delete rows[id(username)]; write(rows); },
        revokeToken(token) { const rows = read(); for (const name of Object.keys(rows))
            if (rows[name].session?.token === token)
                delete rows[name]; write(rows); }
    };
}

const deviceAccess=createDeviceAccess('sk-plaza');
  let token=sessionStorage.getItem('skPlazaToken')||'',user=JSON.parse(sessionStorage.getItem('skPlazaUser')||'null'),data={},deliveryMode='assignment',deliveryDraft=[],incomeDraft=[],currentView='home',navigationRoute='home',syncRunning=false,syncQueued=false,retryTimer=0,retryAttempts=0,deliverySaving=false,incomeSaving=false,pendingDeliveryAfterCollaborator=false;
  if(token&&window.SKEntry&&!window.SKEntry.validLocal({token})){
    token='';user=null;sessionStorage.removeItem('skPlazaToken');sessionStorage.removeItem('skPlazaUser');
  }
  async function post(body){
    if(!api())throw new Error('El servicio central todavía no está configurado.');
    const controller=new AbortController();let timeout;
    const expired=new Promise((_,reject)=>{timeout=setTimeout(()=>{reject(new Error('La base central tardó demasiado en responder. Los pendientes se conservan y se reintentará automáticamente.'));controller.abort()},45000)});
    try{
      const exchange=(async()=>{
        const response=await fetch(api(),{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(body),redirect:'follow',signal:controller.signal,cache:'no-store',credentials:'omit'});
        const text=await response.text();let result;
        try{result=JSON.parse(text)}catch{throw new Error('El servicio central devolvió una respuesta incompleta. Se reintentará automáticamente.')}
        if(!response.ok)throw new Error(result.error||`El servicio respondió ${response.status}`);
        if(!result.ok)throw new Error(result.error||'Solicitud rechazada');return result;
      })();
      return await Promise.race([exchange,expired]);
    }finally{clearTimeout(timeout)}
  }
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const norm=value=>String(value||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  function authMessage(message){const text=String(message||'').trim();if(/contraseña incorrecta|pin incorrecto/i.test(text))return 'Contraseña incorrecta';if(/usuario no habilitado/i.test(text))return 'Usuario no habilitado para Plaza Blending';if(/documento y (contraseña|pin).*obligatorios/i.test(text))return 'Documento y contraseña son obligatorios';if(/servicio central|base central|conectar/i.test(text))return 'El servicio central no está disponible en este momento. Intenta nuevamente.';return text.replace(/\bPIN\b/gi,'contraseña')||'No fue posible iniciar sesión.'}
  const itemName=item=>String(item?.name||item?.nombre||item?.element||item?.elemento||item?.CI_ELEMENTO||item?.ciElemento||item?.itemName||'').trim();
  const itemRecordName=item=>window.SKSpareGroups?.recordName(item)||itemName(item);
  const itemAliases=item=>window.SKSpareGroups.aliases(item);
  const itemSearchLabel=item=>[itemName(item)||'Elemento',...itemAliases(item)].join(' · ');
  const assetNumber=asset=>String(asset.numeroClase||asset.numeroYT||asset.orden||'').trim();
  function options(rows,label){return '<option value="">Seleccionar…</option>'+rows.filter(row=>!row.deleted).map(row=>`<option value="${esc(row.id)}">${esc(label(row))}</option>`).join('')}
  function isRetired(asset){return /dado\/?a? de baja|retirado|desechado/i.test(`${asset.estado||''} ${asset.ubicacion||''}`)}
  function isFixedItem(item){const value=item?.isFixedAsset??item?.esActivoFijo??item?.fixedAsset??item?.CI_ES_A_FIJO;return value===true||['true','si','sí','1','yes'].includes(norm(value))}
  function isEppDeliveryItem(item){return item?.isEpp===true&&!isFixedItem(item)}
  function replacementApplies(item,row={}){return isEppDeliveryItem(item)&&!row.assetId&&norm(row.deliveryType)!=='prestamo'}
  const replacementAnswers={yes:true,no:false,first:'first-delivery'};
  const validReplacement=value=>value===true||value===false||value==='first-delivery';
  const externalAssetDestination='A cargo de ARIS MINING';
  function deliveryItems(){return(data.inventoryCriteria||[]).filter(item=>!item.deleted&&item.active!==false).sort((a,b)=>{const group=item=>item?.isEpp===true?0:isFixedItem(item)?2:1;return group(a)-group(b)||itemName(a).localeCompare(itemName(b),'es',{numeric:true,sensitivity:'base'})})}
  function permitsLoan(item){return item&&!isEppDeliveryItem(item)&&!item.deleted&&item.active!==false&&[true,'true','si','sí','1','yes'].includes(typeof item.allowLoan==='string'?norm(item.allowLoan):item.allowLoan)}
  function allowsDeliveryItem(item){
    if(deliveryMode==='loan')return permitsLoan(item);
    if(deliveryMode==='warehouse')return item&&!['true','si','1','yes'].includes(norm(item.isEpp));
    return item&&!isFixedItem(item);
  }
  function deliveryCatalog(){return deliveryItems().filter(allowsDeliveryItem)}
  function findItem(id){return(data.inventoryCriteria||[]).find(item=>item.id===id)||deliveryItems().find(item=>item.id===id)}
  function assetAvailableForDelivery(asset){return Boolean(asset&&window.SKAssetHistory?.available(asset,data))}
  function availableAssets(item){const className=norm(itemName(item)),reserved=new Set(deliveryDraft.map(row=>row.assetId).filter(Boolean));return(data.assets||[]).filter(asset=>norm(asset.clase)===className&&!reserved.has(asset.id)&&assetAvailableForDelivery(asset)).sort((a,b)=>(Number(assetNumber(a))||Number.MAX_SAFE_INTEGER)-(Number(assetNumber(b))||Number.MAX_SAFE_INTEGER)||assetNumber(a).localeCompare(assetNumber(b),'es',{numeric:true})||(a.serial||'').localeCompare(b.serial||'','es',{numeric:true}))}
  function movementAssetLabel(row){return window.SKAssetRules.movementLabel(row,data.assets||[])}
  function assetLabel(asset){if(window.SKAssetRules?.isColumn(asset))return window.SKAssetRules.columnLabel(asset);return[asset.clase,assetNumber(asset)&&`N.º ${assetNumber(asset)}`,asset.marcaActual||asset.marcaInterna||asset.marcaAnterior,asset.serial&&!/no aplica/i.test(asset.serial)?`Serial ${asset.serial}`:'',asset.minaOrigen&&`Origen: ${asset.minaOrigen}`].filter(Boolean).join(' · ')}
  function assetSelectionLabel(asset){
    const clean=value=>/^no aplica$/i.test(String(value??'').trim())?'':String(value??'').trim();
    const newMark=[asset.nuevaMarca,asset.marcaActual,asset.marcaInterna].map(clean).find(value=>/^(?:[a-z]{3}|[a-z]-[a-z]{2})$/i.test(value));
    const usesPreviousMark=/^(?:yt(?:\b|\d)|columnas?\b|autorrescatador(?:es)?\b)/i.test(clean(asset.clase));
    const previousMark=usesPreviousMark?[asset.marcaPrevia,asset.marcaAnterior,asset.numeroMarcaActual,asset.marcaActual,asset.marcaInterna].map(clean).find(Boolean):'';
    return[clean(asset.fabricante||asset.marcaComercial),window.SKAssetRules.isColumn(asset)?'':clean(asset.serial),newMark||previousMark,clean(asset.modelo)].filter(Boolean).join(' · ')||'Sin datos de identificación';
  }
  function deliveryAssetResults(assets,query){
    return query.rows(assets,asset=>[assetSelectionLabel(asset)]);
  }
  function setupDeliveryAssetSearch(){
    const form=$('#deliveryForm'),field=$('#deliveryAssetField'),select=$('#deliveryAssetId');
    if(!field||field._refreshAssetSearch)return;
    const input=document.createElement('input'),menu=document.createElement('div');
    field.classList.add('itemSearchField');
    input.id='deliveryAssetSearch';input.type='search';input.className='itemSearchInput';input.autocomplete='off';input.placeholder='Buscar por marca, serial o modelo…';
    input.setAttribute('aria-label','Buscar y seleccionar el activo específico');input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-controls','deliveryAssetSearchMenu');input.setAttribute('aria-expanded','false');
    menu.id='deliveryAssetSearchMenu';menu.className='itemSearchMenu';menu.hidden=true;menu.setAttribute('role','listbox');menu.setAttribute('aria-label','Activos disponibles');
    select.hidden=true;select.required=false;field.insertBefore(input,select);field.append(menu);
    const warning=document.createElement('p');
    warning.className='permission';warning.hidden=true;warning.setAttribute('role','status');
    warning.style.cssText='margin:8px 0;color:#7a350d;background:#fff2d9;white-space:pre-wrap';
    field.append(warning);
    let editing=false,typing=false,lastItemId='',visibleRows=[],activeIndex=-1;
    const close=()=>{menu.hidden=true;field.classList.remove('isOpen');input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');activeIndex=-1};
    const draw=()=>{
      if(input.disabled)return close();
      const item=findItem(form.elements.itemId.value),rows=availableAssets(item),query=window.SKAssetSearch.query(input.value);
      const hits=deliveryAssetResults(rows,query);
      visibleRows=hits.map(hit=>hit.asset);activeIndex=-1;input.removeAttribute('aria-activedescendant');
      menu.innerHTML=hits.map(({asset,lines,detail},index)=>`<button type="button" role="option" tabindex="-1" id="deliveryAssetOption-${index}" data-asset-id="${esc(asset.id)}" aria-selected="${asset.id===select.value}"><span class="itemSearchNames"><strong>${query.html(lines[0])}</strong>${detail?'<small>'+query.html(detail)+'</small>':''}</span></button>`).join('')||`<p role="status">${rows.length?'No hay activos que coincidan con la búsqueda.':'No hay activos disponibles de esta clase.'}</p>`;
      menu.hidden=false;field.classList.add('isOpen');input.setAttribute('aria-expanded','true');
    };
    const refresh=()=>{
      const item=findItem(form.elements.itemId.value),fixed=isFixedItem(item),changed=lastItemId!==form.elements.itemId.value;
      lastItemId=form.elements.itemId.value;select.required=false;input.disabled=!fixed;input.required=fixed;
      if(!fixed||changed){editing=false;input.value='';close()}
      const asset=fixed?availableAssets(item).find(row=>row.id===select.value):null;
      if(asset){input.value=assetSelectionLabel(asset);editing=false}else if(!editing)input.value='';
      const damaged=asset&&window.SKAssetHistory.damaged(asset);
      const note=damaged?window.SKAssetHistory.latestIncomeNote(asset,data):'';
      warning.hidden=!damaged;
      warning.textContent=damaged?'Estado del activo: '+asset.estado+'.'+(note?'\nObservación del ingreso: '+note:''):'';
      input.setCustomValidity(fixed&&!asset?'Selecciona un activo de la lista.':'');
      if(!menu.hidden)draw();
    };
    const choose=id=>{
      const item=findItem(form.elements.itemId.value),asset=availableAssets(item).find(row=>row.id===id);
      if(!asset){refresh();draw();return}
      if(!Array.from(select.options).some(option=>option.value===id))select.add(new Option(assetSelectionLabel(asset),id));
      select.value=id;editing=false;select.dispatchEvent(new Event('change',{bubbles:true}));input.focus();close();
    };
    input.addEventListener('focus',()=>{if(select.value)input.select();draw()});input.addEventListener('click',draw);
    input.addEventListener('input',()=>{editing=true;select.value='';typing=true;try{select.dispatchEvent(new Event('change',{bubbles:true}))}finally{typing=false}draw()});
    select.addEventListener('change',()=>{if(!typing)editing=false;refresh();if(!typing)close()});
    input.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();close();return}
      if(event.key==='Tab'){close();return}
      if(event.key==='Enter'&&!menu.hidden){event.preventDefault();if(activeIndex>=0)choose(visibleRows[activeIndex].id);else if(visibleRows.length===1)choose(visibleRows[0].id);return}
      if(!['ArrowDown','ArrowUp'].includes(event.key))return;
      event.preventDefault();const opening=menu.hidden;if(opening)draw();if(!visibleRows.length)return;
      activeIndex=opening||activeIndex<0?(event.key==='ArrowDown'?0:visibleRows.length-1):(activeIndex+(event.key==='ArrowDown'?1:-1)+visibleRows.length)%visibleRows.length;
      menu.querySelectorAll('[data-asset-id]').forEach((button,index)=>{button.dataset.active=String(index===activeIndex)});
      const button=menu.querySelector(`#deliveryAssetOption-${activeIndex}`);input.setAttribute('aria-activedescendant',button.id);button.scrollIntoView({block:'nearest'});
    });
    menu.addEventListener('click',event=>{const button=event.target.closest('[data-asset-id]');if(button)choose(button.dataset.assetId)});
    document.addEventListener('click',event=>{if(!field.contains(event.target))close()});
    field._refreshAssetSearch=refresh;refresh();
  }
  function injectItemSearchStyle(){if(document.querySelector('#itemSearchStyle'))return;const style=document.createElement('style');style.id='itemSearchStyle';style.textContent='.itemSearchField{position:relative}.itemSearchBalance{font-weight:600;letter-spacing:normal}.itemSearchField>select[hidden]{display:none}.itemSearchMenu{position:absolute;z-index:30;left:0;right:0;top:100%;max-height:360px;overflow:auto;margin-top:4px;padding:5px;background:#fff;border:1px solid #b9c6d1;border-radius:9px;box-shadow:0 12px 28px rgba(23,61,89,.18)}.itemSearchMenu[hidden]{display:none}.itemSearchMenu button{display:grid;width:100%;grid-template-columns:minmax(0,1fr) auto;gap:3px 12px;padding:11px 12px;border-radius:7px;background:#fff;color:#21344b;text-align:left;font-weight:600}.itemSearchMenu button:hover,.itemSearchMenu button:focus{background:#eaf1f6}.itemSearchMenu button:disabled{opacity:.72;cursor:not-allowed;background:#fff7f7}.itemSearchNames{display:grid;gap:2px;min-width:0}.itemSearchNames strong{font-size:.86rem}.itemSearchNames strong,.itemSearchNames span{overflow:hidden;text-overflow:ellipsis}.itemSearchNames span{font-size:.82rem;color:#7a8792;font-weight:500}.itemSearchNames mark{padding:0 2px;border-radius:3px;background:#ffe58a;color:#243746;font-weight:850}.itemStock{grid-column:2;grid-row:1/4;align-self:center;white-space:nowrap;font-size:.86rem;font-weight:850}.itemStock:before{content:"";display:inline-block;width:9px;height:9px;margin-right:5px;border-radius:50%;background:currentColor}.itemStock.available{color:#258653}.itemStock.low{color:#dc7924}.itemStock.empty{color:#c52c32}.itemSearchMenu p{margin:8px;color:#667085;font-weight:500}.itemSearchField.isOpen .itemSearchInput{border-color:#397497;box-shadow:0 0 0 3px rgba(57,116,151,.14)}';document.head.append(style)}
  function highlightMatch(value,query){const text=String(value||''),index=norm(text).indexOf(query);if(!query||index<0)return esc(text);return`${esc(text.slice(0,index))}<mark>${esc(text.slice(index,index+query.length))}</mark>${esc(text.slice(index+query.length))}`}
  function stockForItem(item,source=data){const rows=source.inventoryStock||[],id=String(item?.id||''),name=norm(itemName(item));return rows.find(row=>String(row.itemId||row.criteriaId||row.idElemento||'')===id)||rows.find(row=>name&&norm(row.nombre||row.name||row.elemento||row.itemName)===name)}
  function itemAvailability(item){if(isFixedItem(item))return availableAssets(item).length;const stock=stockForItem(item);return Number(stock?.quantity??stock?.cantidad??stock?.stock??stock?.existencia??0)||0}
  function stockBadge(quantity){if(quantity<=0)return{className:'empty',text:'SIN EXISTENCIAS'};if(quantity<=3)return{className:'low',text:`${quantity===1?'QUEDA':'QUEDAN'}: ${quantity}`};return{className:'available',text:`HAY: ${quantity}`}}
function matchesItemSearch(text,number,query){
 const q=norm(query),haystack=norm(text);
 const requested=q.match(/\bitem\s*(\d+)\b/);
 if(requested){
  const actual=String(number??'').trim()||haystack.match(/\bitem\s*(\d+)\b/)?.[1]||'';
  const rest=q.replace(requested[0],' ').replace(/\s+/g,' ').trim();
  return actual===requested[1]&&(!rest||haystack.includes(rest));
 }
 if(/^\d+$/.test(q)&&String(number??'').trim())return String(number).trim()===q;
 return !q||haystack.includes(q);
}
  function setupItemSearch(form,title){
    if(['deliveryForm','incomeForm'].includes(form.id)&&window.SKSparePicker&&window.SKSpareGroups)return window.SKSparePicker.mount(form,{title,isDelivery:form.id==='deliveryForm',loan:()=>deliveryMode==='loan',items:()=>form.id==='deliveryForm'?deliveryCatalog():deliveryItems(),fixed:isFixedItem,availability:itemAvailability,aliases:itemAliases,badge:stockBadge});
    const label=form.elements.itemId.closest('label'),select=form.elements.itemId,input=document.createElement('input'),menu=document.createElement('div'),isDelivery=form.id==='deliveryForm',isMovement=isDelivery||form.id==='incomeForm',balance=isMovement?document.createElement('small'):null,isRecent=/^(delivery|income)HistoryQueryForm$/.test(form.id);label.classList.add('itemSearchField');input.type='search';input.className='itemSearchInput';input.placeholder=isRecent?'Todos los elementos · escribe para buscar…':'Escribe para buscar un elemento…';input.autocomplete='off';input.setAttribute('aria-label',title);menu.className='itemSearchMenu';menu.hidden=true;select.hidden=true;select.required=false;label.insertBefore(input,select);label.append(menu);if(balance){balance.className='itemSearchBalance';balance.setAttribute('aria-live','polite');label.append(balance)}const refreshBalance=()=>{if(!balance)return;const item=findItem(select.value);balance.textContent=item?`Existencia disponible: ${itemAvailability(item)} ${isFixedItem(item)?'activos':item.unit||item.CI_UNIDAD_MEDIDA||'unidades'}`:'';balance.hidden=!item};select.addEventListener('change',refreshBalance);label._refreshItemAvailability=()=>{refreshBalance();if(!menu.hidden)draw()};const close=()=>{menu.hidden=true;label.classList.remove('isOpen')};const draw=()=>{const query=norm(input.value),rows=(isDelivery?deliveryCatalog():deliveryItems()).filter(item=>matchesItemSearch([itemName(item),...itemAliases(item),item.spareItemName,item.spareItemNumber,item.spareEquipment,item.spareItemNumber?'item '+item.spareItemNumber:''].join(' '),item.spareItemNumber,query));menu.innerHTML=(isRecent?'<button type="button" data-clear-item>Todos los elementos</button>':'')+(rows.slice(0,80).map(item=>{const aliases=itemAliases(item),availability=/QueryForm$/.test(form.id)?queryStock(item):itemAvailability(item),stock=stockBadge(availability),fixed=isFixedItem(item),disabled=isDelivery&&!fixed&&availability<=0,status=fixed&&availability<=0?{className:'empty',text:'SIN ACTIVOS REGISTRADOS'}:stock;return`<button type="button" data-item-id="${esc(item.id)}" ${disabled?'disabled':''}><span class="itemSearchNames"><strong>${highlightMatch(itemName(item)||'Elemento',query)}</strong>${query?window.SKSpareGroups.aliasLine(item,query):aliases.slice(0,2).map(alias=>`<span>${esc(alias)}</span>`).join('')}</span><span class="itemStock ${status.className}">${status.text}</span></button>`}).join('')||'<p>No hay elementos que coincidan.</p>');menu.hidden=false;label.classList.add('isOpen')};input.addEventListener('focus',draw);input.addEventListener('input',()=>{select.value='';draw();refreshBalance();if(isDelivery)updateDeliveryFields();else select.dispatchEvent(new Event('change',{bubbles:true}))});input.addEventListener('keydown',event=>{if(event.key==='Escape')close()});menu.addEventListener('click',event=>{if(isRecent&&event.target.closest('[data-clear-item]')){select.value='';input.value='';close();select.dispatchEvent(new Event('change',{bubbles:true}));return}const button=event.target.closest('[data-item-id]');if(!button||button.disabled)return;const item=findItem(button.dataset.itemId);select.value=button.dataset.itemId;input.value=itemName(item);close();select.dispatchEvent(new Event('change',{bubbles:true}))});document.addEventListener('click',event=>{if(!label.contains(event.target))close()});label._refreshItemSearch=()=>{const item=findItem(select.value);if(item||menu.hidden)input.value=item?itemName(item):'';refreshBalance()};label._clearItemSearch=()=>{select.value='';input.value='';close();refreshBalance()};refreshBalance()}
  function refreshItemSearches(){document.querySelectorAll('.itemSearchField').forEach(label=>label._refreshItemSearch?.())}
  function clearItemSearch(form){form.elements.itemId.closest('label')?._clearItemSearch?.()}
  function setupDeliveryForm(){const form=$('#deliveryForm'),itemLabel=form.elements.itemId.closest('label'),quantityLabel=form.elements.quantity.closest('label'),recipientLabel=$('#recipientSearch').closest('label'),submit=form.querySelector('button[type="submit"],button:not([type])');itemLabel.childNodes[0].textContent='SELECCIONE ELEMENTO A ENTREGAR';itemLabel.id='deliveryItemField';quantityLabel.id='deliveryQuantityField';recipientLabel.id='deliveryRecipientField';recipientLabel.childNodes[0].textContent='RECEPTOR';const assetLabelElement=document.createElement('label');assetLabelElement.id='deliveryAssetField';assetLabelElement.hidden=true;assetLabelElement.innerHTML='SELECCIONE EL ACTIVO ESPECÍFICO<select name="assetId" id="deliveryAssetId"><option value="">Seleccionar…</option></select>';itemLabel.after(assetLabelElement);const destination=form.elements.destination.closest('label'),notes=form.elements.notes.closest('label'),newButton=$('#newRecipientBtn'),editButton=$('#editRecipientBtn'),addButton=document.createElement('button'),draft=document.createElement('div');destination.id='deliveryDestinationField';destination.childNodes[0].textContent='¿DÓNDE VA A ESTAR EL ACTIVO?';form.elements.destination.add(new Option('Socavón','Socavón'));const levelField=document.createElement('label');levelField.id='deliveryLevelField';levelField.hidden=true;levelField.innerHTML='NIVEL (OPCIONAL)<select name="destinationLevel"><option value="">Sin especificar</option>'+Array.from({length:15},(_,i)=>'<option value="'+(i+1)+'">Nivel '+(i+1)+'</option>').join('')+'</select>';form.elements.destination.addEventListener('change',()=>{if(form.elements.destination.dataset.assignmentArea==='1')form.elements.destination.dataset.manualArea='1';updateDestinationLevel()});notes.id='deliveryNotesField';addButton.type='button';addButton.id='addDeliveryItem';addButton.textContent='+ AGREGAR ELEMENTO';draft.id='deliveryDraft';draft.className='deliveryDraft';editButton.textContent='Editar colaborador';submit.textContent='REGISTRAR ENTREGA';const actions=document.createElement('div'),cancel=document.createElement('button');actions.className='deliveryFormActions';cancel.type='button';cancel.id='cancelDeliveryBtn';cancel.textContent='CANCELAR';cancel.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();goBackPlaza()});actions.append(submit,cancel);const replacementField=document.createElement('fieldset');replacementField.id='deliveryReplacementField';replacementField.className='recipientCompany';replacementField.hidden=true;replacementField.disabled=true;replacementField.innerHTML='<legend>TRAE REPOSICIÓN</legend><label><input type="radio" name="bringsReplacement" value="yes"><span>SÍ</span></label><label><input type="radio" name="bringsReplacement" value="no"><span>NO</span></label><label><input type="radio" name="bringsReplacement" value="first"><span>PRIMERA ENTREGA</span></label>';const companyField=form.elements.recipientCompany[0].closest('fieldset');form.append(itemLabel,assetLabelElement,quantityLabel,replacementField,$("#deliveryWarehouseField"),companyField,recipientLabel,newButton,editButton,destination,levelField,notes,addButton,draft,actions);form.elements.itemId.addEventListener('change',updateDeliveryFields);addButton.addEventListener('click',addDeliveryItem);draft.addEventListener('click',event=>{const button=event.target.closest('[data-remove-delivery]');if(!button)return;deliveryDraft.splice(Number(button.dataset.removeDelivery),1);renderDeliveryDraft();updateDeliveryFields()})}
  function assignmentAreas(){
    const record=(data.inventoryCriteria||[]).find(row=>row.id==='SYSTEM-FORM-OPTIONS-V1'||row.recordType==='formOptions');
    const configured=record?.options?.['personal.area'],fallback=['Seguridad física','Desmin - Obras civiles','Producción','Producción - Selectivo (Corteros)','Administrativa'];
    return window.SKAssetRules.assignmentAreas(Array.isArray(configured)?configured:window.SKFormOptions?.values?.('personal.area',fallback)||fallback);
  }
  function matchedAssignmentArea(area){return assignmentAreas().find(value=>norm(value)===norm(area))||''}
  function selectedRecipientArea(){const person=(data.personal||[]).find(row=>row.id===$('#recipientId')?.value&&!row.deleted);return matchedAssignmentArea(person?.area)}
  function configureDeliveryDestination(){
    const form=$('#deliveryForm'),item=findItem(form.elements.itemId.value),select=form.elements.destination,fixed=isFixedItem(item),assignment=fixed&&deliveryMode!=='loan',current=select.value;
    if(deliveryMode==='warehouse'){
      if(!Array.from(select.options).some(option=>option.value==='Producción'))select.add(new Option('Producción','Producción'));
      select.value='Producción';select.disabled=true;updateDestinationLevel();return;
    }
    if(assignment){
      const manual=select.dataset.assignmentArea==='1'&&select.dataset.manualArea==='1',areas=assignmentAreas();
      select.replaceChildren(new Option('Seleccionar inventario del área…',''),...areas.map(area=>new Option('Inventario de '+area,'Inventario de '+area)),new Option(externalAssetDestination,externalAssetDestination));
      select.dataset.assignmentArea='1';select.disabled=false;
      const preferred=manual?current:'Inventario de '+selectedRecipientArea();
      select.value=[...select.options].some(option=>option.value===preferred)?preferred:'';
      if(!manual)delete select.dataset.manualArea;
    }else{
      if(select.dataset.assignmentArea==='1'){
        select.replaceChildren(new Option('Seleccionar…',''),...(window.SKFormOptions?.values?.('delivery.destination')||['Operación','Traslado','Reparación']).map(value=>new Option(value,value)),new Option('Socavón','Socavón'),new Option('Producción','Producción'));
        delete select.dataset.assignmentArea;delete select.dataset.manualArea;
      }
      if(!Array.from(select.options).some(option=>option.value===externalAssetDestination))select.add(new Option(externalAssetDestination,externalAssetDestination));
      const spare=deliveryMode==='loan'&&item?.isYtSpare===true;
      if(spare){select.value='Producción';select.dataset.productionOnly='1'}
      else if(select.dataset.productionOnly==='1'){select.value='';delete select.dataset.productionOnly}
      if(!fixed&&!spare)select.value='';select.disabled=!fixed||spare;
    }
    updateDestinationLevel();
  }
  function recipientDestinationChanged(){
    configureDeliveryDestination();const area=selectedRecipientArea();
    for(const row of deliveryDraft)if(row.assetId&&row.deliveryType==='ASIGNACIÓN'&&row.destinationAreaMode!=='manual'&&row.destination!==externalAssetDestination){row.destinationArea=area;row.destination=area?'Inventario de '+area:'';}
    renderDeliveryDraft();
  }
  function updateDestinationLevel(){const form=$('#deliveryForm'),show=isFixedItem(findItem(form.elements.itemId.value))&&form.elements.destination.value==='Socavón',field=$('#deliveryLevelField');if(!field)return;field.hidden=!show;field.style.display=show?'flex':'none';form.elements.destinationLevel.disabled=!show;if(!show)form.elements.destinationLevel.value='';}
  function deliveryDestination(form){const item=findItem(form.elements.itemId.value);if(deliveryMode==='warehouse'||deliveryMode==='loan'&&item?.isYtSpare===true)return 'Producción';if(deliveryMode!=='loan')return '';if(!isFixedItem(item))return form.elements.destinationWarehouseId?.value==='production'?'Producción':'';const destination=form.elements.destination.value,level=form.elements.destinationLevel.value;if(destination==='Socavón'&&level){if(!/^(?:[1-9]|1[0-5])$/.test(level))throw new Error('El nivel debe estar entre 1 y 15.');return destination+' · Nivel '+level;}return destination;}
  function updateDeliveryReplacementField(item){
    const field=$('#deliveryReplacementField');if(!field)return;
    const required=deliveryMode==='assignment'&&replacementApplies(item),itemId=required?String(item.id):'',changed=field.dataset.itemId!==itemId;
    field.hidden=!required;field.disabled=!required;field.style.display=required?'flex':'none';
    field.querySelectorAll('input').forEach(input=>{input.required=required;if(changed||!required)input.checked=false});
    field.dataset.itemId=itemId;
  }
  function updateDeliveryFields(){
    const form=$('#deliveryForm'),item=findItem(form.elements.itemId.value),fixed=Boolean(item&&isFixedItem(item)),loan=deliveryMode==='loan',needsQuantity=Boolean(item&&!fixed),wholeUnits=(loan||deliveryMode==='warehouse')&&item?.fractionable!==true;
    const companyField=$('#loanRecipientCompanyField'),companyInput=$('#loanRecipientCompanyInput');
    if(companyField&&companyInput){companyField.hidden=!loan;companyField.style.display=loan?'flex':'none';companyInput.disabled=!loan;companyInput.required=loan;if(!loan)companyInput.checked=false;}
    $('#delivery>h2').textContent=loan?'PRESTAR ELEMENTOS':deliveryMode==='warehouse'?'TRASLADO A PRODUCCIÓN':'REGISTRAR ENTREGA';
    $('#deliveryItemField').childNodes[0].textContent=loan?'SELECCIONE ELEMENTO A PRESTAR':deliveryMode==='warehouse'?'SELECCIONE ELEMENTO A TRASLADAR':'SELECCIONE ELEMENTO A ENTREGAR';
    form.querySelector('button[type="submit"],button:not([type])').textContent=loan?'REGISTRAR PRÉSTAMO':deliveryMode==='warehouse'?'REGISTRAR TRASLADO':'REGISTRAR ENTREGA';
    for(const [selector,visible] of [['#deliveryAssetField',fixed],['#deliveryQuantityField',needsQuantity],['#deliveryDestinationField',fixed&&deliveryMode!=='warehouse'],['#deliveryNotesField',fixed||loan]]){const field=$(selector);field.hidden=!visible;field.style.display=visible?'flex':'none'}
    // A selected asset always represents one unit; an added draft needs no extra quantity.
    form.elements.quantity.required=needsQuantity;form.elements.quantity.disabled=!needsQuantity;form.elements.destination.required=fixed;
    const warehouseField=$('#deliveryWarehouseField');
    if(warehouseField&&form.elements.destinationWarehouseId){const visible=Boolean(loan&&item&&!fixed&&!item.isYtSpare);warehouseField.hidden=!visible;warehouseField.style.display=visible?'flex':'none';const picker=form.elements.destinationWarehouseId;if(warehouseField.dataset.itemId!==item?.id||!visible)picker.value='';warehouseField.dataset.itemId=item?.id||'';}
    updateDeliveryReplacementField(item);
    configureDeliveryDestination();
    form.elements.quantity.min=wholeUnits?'1':'0.01';form.elements.quantity.step=wholeUnits?'1':'any';
    updateDestinationLevel();
    const assetSelect=$('#deliveryAssetId'),selectedAsset=assetSelect.value;assetSelect.required=fixed;assetSelect.disabled=!fixed;
    if(fixed){form.elements.quantity.value='1';const rows=availableAssets(item);assetSelect.innerHTML=options(rows,assetSelectionLabel);if(rows.some(asset=>asset.id===selectedAsset))assetSelect.value=selectedAsset;if(!rows.length)assetSelect.innerHTML='<option value="">No hay activos disponibles de esta clase</option>'}
    else{assetSelect.value='';assetSelect.dispatchEvent(new Event('change',{bubbles:true}));if(!loan)form.elements.notes.value='';if(!form.elements.quantity.value)form.elements.quantity.value='1'}
    $('#deliveryAssetField')._refreshAssetSearch?.();
  }
  function openDeliveryMode(mode){
    if(deliveryMode!==mode){
      discardDeliveryForm();deliveryMode=mode;
      const form=$('#deliveryForm'),company=form.elements.recipientCompany[0].closest('fieldset');
      const item=$('#deliveryItemField'),quantity=$('#deliveryQuantityField'),replacement=$('#deliveryReplacementField');
      if(mode==='loan'){
        item.before(company);
        $('#editRecipientBtn').after(quantity,replacement);
      }else{
        $('#deliveryAssetField').after(quantity,replacement,company);
      }
      clearItemSearch(form);
    }
    $('#deliveryForm').elements.itemId.innerHTML=options(deliveryCatalog(),item=>itemName(item)||'Elemento');
    updateDeliveryFields();renderDeliveryDraft();
  }
  function renderDeliveryDraft(){const host=$('#deliveryDraft');$('#deliveryForm').elements.itemId.required=false;host.innerHTML=deliveryDraft.length?`<p><b>${deliveryDraft.length} ${deliveryDraft.length===1?'elemento agregado':'elementos agregados'}</b></p>${deliveryDraft.map((row,index)=>`<article><span><b>${esc(row.itemName)}</b>${row.assetLabel?`<small>${esc(movementAssetLabel(row))}</small>`:`<small>Cantidad: ${row.quantity}</small>`}${row.destination?`<small>Ubicación: ${esc(row.destination)}</small>`:''}${row.deliveryType?`<small>Tipo de entrega: ${esc(row.deliveryType)}</small>`:''}${deliveryReplacementLabel(row)?`<small>Trae reposición: ${esc(deliveryReplacementLabel(row))}</small>`:''}</span><button type="button" data-remove-delivery="${index}">Quitar</button></article>`).join('')}`:`<p class="permission">Aún no has agregado elementos a ${deliveryMode==='loan'?'este préstamo':'esta entrega'}.</p>`}
  function currentDeliveryItem(){
    const form=$('#deliveryForm'),item=findItem(form.elements.itemId.value),loan=deliveryMode==='loan';
    if(!item){alert(loan?'Selecciona el elemento a prestar.':'Selecciona el elemento a entregar.');return null}
    if(!loan&&!allowsDeliveryItem(item)){alert(deliveryMode==='warehouse'?'Producción no recibe este elemento.':'Los activos fijos se registran en otra opción de salida.');return null}
    if(loan&&!permitsLoan(item)){alert('Este elemento no permite préstamos en Criterios de inventario.');return null}
    const epp=!loan&&replacementApplies(item),replacement=form.elements.bringsReplacement?.value;
    if(epp&&!Object.hasOwn(replacementAnswers,replacement)){alert('Selecciona SÍ, NO o PRIMERA ENTREGA en TRAE REPOSICIÓN para este elemento EPP.');return null}
    const fixed=isFixedItem(item),quantity=fixed?1:Number(form.elements.quantity.value),asset=fixed?(data.assets||[]).find(row=>row.id===form.elements.assetId.value):null;
    if(fixed&&(!asset||!availableAssets(item).some(row=>row.id===asset.id))){alert('Selecciona un activo disponible.');return null}
    if(!Number.isFinite(quantity)||!(quantity>0)){alert('Cantidad mínima no válida');return null}
    if((loan||deliveryMode==='warehouse')&&!fixed&&item.fractionable!==true&&!Number.isInteger(quantity)){alert('Este elemento requiere una cantidad entera.');return null}
    if(fixed&&!form.elements.destination.value){alert('Selecciona dónde va a estar el activo.');return null}
    if(!fixed){const stock=Number(stockForItem(item)?.quantity)||0,already=deliveryDraft.filter(row=>row.itemId===item.id&&!row.assetId).reduce((total,row)=>total+Number(row.quantity||0),0);if(already+quantity>stock){alert('La cantidad ingresada supera la disponibilidad');return null}}
    return{itemId:item.id,itemName:itemRecordName(item),quantity,...(deliveryMode==='assignment'?{exitKind:'delivery'}:{}),...(epp?{bringsReplacement:replacementAnswers[replacement]}:{}),assetId:asset?.id||'',assetLabel:asset?assetLabel(asset):'',...(deliveryMode==='warehouse'?{exitKind:'warehouse',destinationWarehouseId:'production',deliveryType:'TRASLADO A BODEGAS'}:loan?{deliveryType:'PRÉSTAMO',loanProtocol:1,unit:item.unit||item.CI_UNIDAD_MEDIDA||'Unidad'}:fixed?{deliveryType:'ASIGNACIÓN',destinationArea:matchedAssignmentArea(form.elements.destination.value.replace(/^Inventario de /,'')),destinationAreaMode:form.elements.destination.dataset.manualArea==='1'||form.elements.destination.value===externalAssetDestination?'manual':'recipient'}:{}),destination:deliveryDestination(form),notes:fixed||loan?form.elements.notes.value.trim():''};
  }
  function addDeliveryItem(){const row=currentDeliveryItem();if(!row)return;deliveryDraft.push(row);const form=$('#deliveryForm');clearItemSearch(form);form.elements.quantity.value='1';form.elements.destination.value='';delete form.elements.destination.dataset.manualArea;form.elements.destinationLevel.value='';form.elements.notes.value='';renderDeliveryDraft();updateDeliveryFields()}
  function setupIncomeForm(){const form=$('#incomeForm'),itemLabel=form.elements.itemId.closest('label'),quantityLabel=form.elements.quantity.closest('label'),notesLabel=form.elements.notes.closest('label'),personLabel=$('#incomeCollaboratorSearch').closest('label'),newButton=$('#newIncomeCollaborator'),editButton=$('#editIncomeCollaborator'),submit=form.querySelector('button[type="submit"],button:not([type])'),addButton=document.createElement('button'),draft=document.createElement('div');itemLabel.childNodes[0].textContent='SELECCIONE ELEMENTO A INGRESAR';itemLabel.id='incomeItemField';quantityLabel.id='incomeQuantityField';notesLabel.id='incomeNotesField';personLabel.childNodes[0].textContent='QUIÉN TRAE';addButton.type='button';addButton.id='addIncomeItem';addButton.textContent='+ AGREGAR ELEMENTO';draft.id='incomeDraft';draft.className='deliveryDraft';submit.textContent='REGISTRAR INGRESO';const cancel=document.createElement('button');cancel.type='button';cancel.id='cancelIncomeBtn';cancel.textContent='CANCELAR';cancel.addEventListener('click',goBackPlaza);const actions=document.createElement('div');actions.className='deliveryFormActions';actions.append(submit,cancel);form.append(itemLabel,quantityLabel,notesLabel,addButton,draft,personLabel,newButton,editButton,actions);addButton.addEventListener('click',addIncomeItem);form.elements.itemId.addEventListener('change',renderIncomeDraft);draft.addEventListener('click',event=>{const button=event.target.closest('[data-remove-income]');if(!button)return;incomeDraft.splice(Number(button.dataset.removeIncome),1);renderIncomeDraft()})}
  function currentIncomeItem(){const form=$('#incomeForm'),item=findItem(form.elements.itemId.value);if(!item){alert('Selecciona el elemento a ingresar.');return null}const fixed=isFixedItem(item),quantity=fixed?1:Number(form.elements.quantity.value);if(!(quantity>0)){alert('Cantidad mínima no válida');return null}let assetData={};if(fixed){assetData=window.SKPlazaIncomeAsset?.captureCurrent?.()||{};if(!assetData.assetId&&!assetData.assetCandidate)return null}return{itemId:item.id,itemName:itemRecordName(item),quantity,notes:fixed?form.elements.notes.value.trim():'',...assetData}}
  function renderIncomeDraft(){
    const host=$('#incomeDraft'),form=$('#incomeForm'),currentItem=findItem(form.elements.itemId.value);
    const notes=form.elements.notes,notesField=notes.closest('label'),showNotes=Boolean(currentItem&&isFixedItem(currentItem));
    notesField.hidden=!showNotes;notesField.style.display=showNotes?'flex':'none';notes.disabled=!showNotes;
    if(!showNotes)notes.value='';
    form.elements.itemId.required=false;
    const added=incomeDraft.length?`<p><b>${incomeDraft.length} ${incomeDraft.length===1?'elemento agregado':'elementos agregados'}</b></p>${incomeDraft.map((row,index)=>`<article><span><b>${esc(row.itemName)}</b>${row.assetLabel?`<small>${esc(movementAssetLabel(row))}</small>`:`<small>Cantidad: ${row.quantity}</small>`}${row.incomeType?`<small>${esc(row.incomeType)} · Origen: ${esc(row.originMine)}</small>`:''}</span><button type="button" data-remove-income="${index}">Quitar</button></article>`).join('')}`:'';
    const current=currentItem?`<p class="permission"><b>Elemento en preparación: ${esc(itemRecordName(currentItem))}.</b> Completa sus datos y pulsa REGISTRAR INGRESO para guardarlo${incomeDraft.length?' junto con los elementos agregados':''}. Usa + AGREGAR ELEMENTO si vas a incluir otro.</p>`:'';
    host.innerHTML=added+current||'<p class="permission">Selecciona un elemento y completa sus datos para registrar el ingreso.</p>';
  }
  function clearCurrentIncomeItem(){const form=$('#incomeForm');clearItemSearch(form);form.elements.quantity.value='1';form.elements.notes.value='';form.elements.itemId.dispatchEvent(new Event('change',{bubbles:true}))}
  function addIncomeItem(){const row=currentIncomeItem();if(!row)return;const assetKey=row.assetId||row.assetCandidate&&norm(row.assetLabel);if(assetKey&&incomeDraft.some(saved=>(saved.assetId||saved.assetCandidate&&norm(saved.assetLabel))===assetKey)){alert('Este activo ya está agregado al ingreso.');return}incomeDraft.push(row);clearCurrentIncomeItem();renderIncomeDraft()}
  async function saveIncomeBatch(form){if(incomeSaving)return false;if(form.elements.itemId.closest?.('label')?._validateItemSearch?.()===false)return false;let shift;try{shift=movementShift()}catch(error){alert(error.message);return false}incomeSaving=true;const submit=form.querySelector('button[type="submit"],button:not([type])');if(submit)submit.disabled=true;try{const batch=incomeDraft.map(row=>({...row}));if(form.elements.itemId.value){const row=currentIncomeItem();if(!row)return false;batch.push(row)}if(!batch.length){alert('Agrega por lo menos un elemento al ingreso.');return false}const broughtById=form.elements.broughtById.value;if(!broughtById){alert('Busca y selecciona quién trae.');return false}if(!validateIncomeCollaborator(broughtById))return false;try{window.SKPlazaIncomeAsset?.validateBatch?.(batch)}catch(error){alert(error.message);return false}const next=JSON.parse(JSON.stringify(data));const person=(data.personal||[]).find(row=>row.id===broughtById),times=movementTimes(form),syncEventId=uuid(),newMarkedAssets=[];for(const draft of batch){let asset=null;if(draft.assetId||draft.assetCandidate){asset=window.SKPlazaIncomeAsset?.commit?.(draft,times.createdAt,person,next,times.recordedAt)||null;if(!asset)throw new Error(`No fue posible preparar el activo ${draft.itemName}.`);if(draft.assetCandidate&&asset.markingPolicy==='letters-v1'&&!newMarkedAssets.some(row=>row.id===asset.id))newMarkedAssets.push(asset)}const rowId=uuid(),row={id:rowId,syncEventId,itemId:draft.itemId,itemName:draft.itemName,quantity:draft.quantity,notes:draft.notes||'',broughtById,broughtByName:person?.nombre||'',broughtByDocument:person?.documento||'',assetId:asset?.id||draft.assetId||'',assetLabel:asset?assetLabel(asset):draft.assetLabel||'',...(draft.incomeType?{incomeType:draft.incomeType,originMine:draft.originMine}:{}),operatorId:user?.id||'',operatorDocument:user?.documento||'',operatorName:user?.nombre||'',...shift,...times,syncState:'pending'};(next.blendingIncomes||(next.blendingIncomes=[])).push(row)}await persistLocalChange(next);incomeDraft=[];discardIncomeForm();renderRecentQueries();updatePendingBadge();if(!window.SKAssetMarking.saved(newMarkedAssets))alert(`INGRESO REGISTRADO\n\n${batch.length} ${batch.length===1?'elemento ingresado':'elementos ingresados'}.\n\nCada elemento quedó guardado como un registro individual y pendiente de sincronización.`);setTimeout(()=>sync(true),0);return true}catch(error){alert(error.message||'No fue posible guardar el registro.');return false}finally{incomeSaving=false;if(submit)submit.disabled=false}}
  function catalogHas(key,value){const clean=String(value||'').trim();if(!clean)return false;const catalog=window.SKFormOptions?.values?.(key)||[];return !catalog.length||catalog.some(option=>norm(option)===norm(clean))}
  function deliveryRecipientIssues(person){if(!person)return['funcionario'];const company=String(person.empresa||person.EMPRESA||'').trim(),area=String(person.area||person.AREA||'').trim(),cargo=String(person.cargo||person.CARGO||'').trim(),fields=[];if(!catalogHas('personal.company',company))fields.push('empresa');const validArea=area&&(window.SKFormOptions?.validPersonalArea?window.SKFormOptions.validPersonalArea(company,area):catalogHas('personal.area',area));if(!validArea)fields.push('área');if(!catalogHas('personal.role',cargo)||norm(cargo)==='no informado')fields.push('cargo');if(norm(area)==='seguridad fisica'&&norm(company)==='desmin')fields.push('empresa','área');return[...new Set(fields)]}
  function validateDeliveryRecipient(recipientId,{announce=true}={}){const person=(data.personal||[]).find(row=>row.id===recipientId&&!row.deleted);if(!person){if(announce)alert('No se puede registrar la entrega porque el funcionario seleccionado no aparece en Personal. Busca y selecciona nuevamente el funcionario.');return false}const fields=deliveryRecipientIssues(person);if(!fields.length)return true;const name=person.nombre||person.documento||'El funcionario seleccionado',securityConflict=norm(person.area||person.AREA)==='seguridad fisica'&&norm(person.empresa||person.EMPRESA)==='desmin';window.SKPlaza?.showRecipientEdit?.(person.id,fields);if(announce){const cause=securityConflict?'La combinación EMPRESA DESMIN y ÁREA Seguridad física no es válida.':'Uno o más datos ya no coinciden con las opciones vigentes del formulario de Personal.';alert(`Hay información del funcionario por actualizar.\n\n${name}\n\n${cause}\n\nCampo${fields.length>1?'s':''} a actualizar: ${fields.join(', ').toUpperCase()}.\n\nUsa EDITAR COLABORADOR para corregir la información antes de registrar la entrega.`)}return false}
  function validateIncomeCollaborator(personId,{announce=true}={}){const person=(data.personal||[]).find(row=>row.id===personId&&!row.deleted);if(!person){if(announce)alert('No se puede registrar el ingreso porque la persona seleccionada no aparece en Personal. Busca y selecciona nuevamente quién trae.');return false}const fields=deliveryRecipientIssues(person);if(!fields.length)return true;const name=person.nombre||person.documento||'La persona seleccionada',securityConflict=norm(person.area||person.AREA)==='seguridad fisica'&&norm(person.empresa||person.EMPRESA)==='desmin';window.SKPlaza?.showIncomeCollaboratorEdit?.(person.id,fields);if(announce){const cause=securityConflict?'La combinación EMPRESA DESMIN y ÁREA Seguridad física no es válida.':'Uno o más datos ya no coinciden con las opciones vigentes del formulario de Personal.';alert(`Hay información de quien trae por actualizar.\n\n${name}\n\n${cause}\n\nCampo${fields.length>1?'s':''} a actualizar: ${fields.join(', ').toUpperCase()}.\n\nUsa EDITAR COLABORADOR para corregir la información antes de registrar el ingreso.`)}return false}
  function recipientSnapshot(id){const person=(data.personal||[]).find(row=>row.id===id);return {recipientName:person?.nombre||'',recipientDocument:person?.documento||'',recipientArea:person?.area||'',recipientCargo:person?.cargo||''}}
  async function saveDeliveryBatch(form){if(deliverySaving)return false;if(form.elements.itemId.closest?.('label')?._validateItemSearch?.()===false)return false;let shift;try{shift=movementShift()}catch(error){alert(error.message);return false}deliverySaving=true;const submit=form.querySelector('button[type="submit"],button:not([type])');if(submit)submit.disabled=true;try{const recipientCompany=form.elements.recipientCompany.value,recipientCompanies=deliveryMode==='loan'?['SK','DESMIN','ARIS MINING']:['SK','DESMIN'];if(!recipientCompanies.includes(recipientCompany)){alert('Selecciona la EMPRESA RECEPTORA: '+recipientCompanies.join(', ')+'.');return false}const batch=deliveryDraft.map(row=>({...row}));if(form.elements.itemId.value){const row=currentDeliveryItem();if(!row)return false;batch.push(row)}if(!batch.length){alert('Agrega por lo menos un elemento a la entrega.');return false}if(batch.some(row=>!allowsDeliveryItem(findItem(row.itemId)))){alert('Un elemento ya no está habilitado para esta salida. Revisa el registro.');return false}if(recipientCompany==='ARIS MINING'&&batch.some(row=>norm(row.deliveryType)!=='prestamo')){alert('ARIS MINING solo está disponible para préstamos.');return false}const incompleteEpp=batch.find(row=>replacementApplies(findItem(row.itemId),row)&&!validReplacement(row.bringsReplacement));if(incompleteEpp){alert(`Falta TRAE REPOSICIÓN para ${incompleteEpp.itemName||itemName(findItem(incompleteEpp.itemId))}. Quita ese elemento y agrégalo nuevamente seleccionando SÍ, NO o PRIMERA ENTREGA.`);return false}for(const row of batch)if(!replacementApplies(findItem(row.itemId),row))delete row.bringsReplacement;if(batch.some(row=>row.deliveryType==='PRÉSTAMO'&&!permitsLoan(findItem(row.itemId)))){alert('Uno de los elementos ya no permite préstamo. Revisa Criterios de inventario.');return false}const recipientId=form.elements.recipientId.value;if(!recipientId){alert('Busca y selecciona el colaborador que recibe.');return false}if(!validateDeliveryRecipient(recipientId)){pendingDeliveryAfterCollaborator=true;return false}pendingDeliveryAfterCollaborator=false;const seenAssets=new Set();for(const draft of batch){if(!draft.assetId)continue;const asset=(data.assets||[]).find(row=>row.id===draft.assetId);if(seenAssets.has(draft.assetId)||!assetAvailableForDelivery(asset)){alert('El activo '+(draft.assetLabel||draft.itemName||'seleccionado')+' ya no está disponible en Bodega de Superficie. Revisa su última novedad antes de entregarlo.');return false}seenAssets.add(draft.assetId);if(draft.deliveryType==='ASIGNACIÓN'){if(draft.destination===externalAssetDestination){delete draft.destinationArea;draft.destinationAreaMode='manual';continue}const person=(data.personal||[]).find(row=>row.id===recipientId),area=matchedAssignmentArea(draft.destinationAreaMode==='manual'?draft.destinationArea:person?.area);if(!area){alert('Selecciona el inventario del área para '+(draft.itemName||'el activo')+'. Puedes elegirlo manualmente aunque el funcionario tenga otra área.');return false}draft.destinationArea=area;draft.destination='Inventario de '+area;}}const next=JSON.parse(JSON.stringify(data));const times=movementTimes(form),syncEventId=uuid(),runningBalances=new Map();for(const draft of batch){const rowId=uuid(),item=findItem(draft.itemId),stock=item?stockForItem(item,next):null,isFixed=Boolean(draft.assetId)||Boolean(item&&isFixedItem(item));let balanceBefore=null,balanceAfter=null;if(!isFixed){const stockKey=String(stock?.id||stock?.itemId||draft.itemId||itemName(item));const starting=runningBalances.has(stockKey)?runningBalances.get(stockKey):Number(stock?.quantity??stock?.cantidad??stock?.stock??stock?.existencia??0);balanceBefore=Number.isFinite(starting)?starting:0;balanceAfter=balanceBefore-Number(draft.quantity||0);if(balanceAfter<0)throw new Error('La cantidad ingresada supera la disponibilidad de '+(draft.itemName||'este elemento')+'.');runningBalances.set(stockKey,balanceAfter);if(stock){stock.quantity=balanceAfter;stock.updatedAt=times.recordedAt}}const row={id:rowId,syncEventId,...draft,recipientId,recipientCompany,...recipientSnapshot(recipientId),operatorId:user?.id||'',operatorDocument:user?.documento||'',operatorName:user?.nombre||'',...shift,...times,syncState:'pending',...(isFixed?{}:{balanceBefore,balanceAfter})};(next.blendingDeliveries||(next.blendingDeliveries=[])).push(row);const asset=(next.assets||[]).find(item=>item.id===draft.assetId);if(asset){asset.ubicacion=draft.destination||'Operación';asset.updatedAt=times.recordedAt;asset.syncState='pending'}}await persistLocalChange(next);deliveryDraft=[];discardDeliveryForm();renderRecentQueries();updatePendingBadge();const recipient=(data.personal||[]).find(person=>person.id===recipientId),recipientName=recipient?.nombre||recipient?.documento||'el colaborador',itemCount=batch.length;alert(`${deliveryMode==='loan'?'PRÉSTAMO REGISTRADO':deliveryMode==='warehouse'?'TRASLADO A PRODUCCIÓN REGISTRADO':'ENTREGA REGISTRADA'}\n\n${itemCount} ${deliveryMode==='loan'?(itemCount===1?'elemento prestado':'elementos prestados'):(itemCount===1?'elemento entregado':'elementos entregados')} a ${recipientName}.\n\n${deliveryMode==='loan'?'El préstamo ya aparece en Préstamos y devoluciones':'La entrega ya aparece en Entregas recientes'} y queda pendiente de sincronización.`);setTimeout(()=>sync(true),0);return true}catch(error){alert(error.message||'No fue posible guardar el registro.');return false}finally{deliverySaving=false;if(submit)submit.disabled=false}}
  function pendingCount(){const events=new Set();for(const name of ['personal','assets','blendingIncomes','blendingDeliveries'])for(const row of data[name]||[])if(row.syncState==='pending')events.add(`${name}:${row.syncEventId||row.id}`);return events.size}
  function setSyncButtonText(value){const label=$('#syncBtnLabel'),button=$('#syncBtn');if(label)label.textContent=value.replace(/^☁\s*/, '');if(button){button.setAttribute('aria-label',label?.textContent||value);button.title=label?.textContent||value}}
  function updatePendingBadge(state='idle'){const badge=$('#pendingBadge');if(!badge)return;const count=pendingCount();badge.hidden=false;badge.className='pendingBadge';badge.removeAttribute('title');badge.removeAttribute('aria-label');if(state==='syncing'){badge.classList.add('retrying');badge.textContent=count?String(count):'↻';badge.title=count?`${count} ${count===1?'evento pendiente':'eventos pendientes'} · sincronizando`:'Sincronizando';badge.setAttribute('aria-label',badge.title);return}if(state==='retrying'){badge.classList.add('retrying');badge.textContent=count?String(count):'↻';badge.title=count?`${count} ${count===1?'evento pendiente':'eventos pendientes'} · reintentando`:'Reconectando';return}if(state==='error'){badge.classList.add('error');badge.textContent=count?String(count):'!';badge.title=count?`${count} ${count===1?'evento pendiente':'eventos pendientes'}`:'Sin conexión con la base central';return}if(count){badge.classList.add('pending');badge.textContent=String(count);badge.title=`${count} ${count===1?'evento por sincronizar':'eventos por sincronizar'}`;badge.setAttribute('aria-label',badge.title)}else{badge.classList.add('synced');badge.textContent='✓';badge.title='Todo sincronizado';badge.setAttribute('aria-label','Todo sincronizado')}}
  function showLastSync(value){const el=$('#headerLastSync');if(!el)return;const stamp=value||localStorage.getItem('skPlazaLastSync');if(!stamp){el.textContent='SIN SINCRONIZAR';return}const date=new Date(stamp);el.textContent=Number.isNaN(date.getTime())?'SIN SINCRONIZAR':`Sinc. ${date.getDate()}/${date.getMonth()+1} ${date.toLocaleTimeString('es-CO',{hour:'numeric',minute:'2-digit'})}`}

  // El calendario usa la hora de la operación en Colombia, independiente del dispositivo.
  function canEditMovementTime(){
    return ['plaza_assistant','plaza_supervisor','plaza_admin'].includes(user?.role);
  }
  function movementTimeChanged(form){
    const {movementDay, movementHour}=form.elements;
    return movementDay.value!==movementDay.defaultValue || movementHour.value!==movementHour.defaultValue;
  }
  function normalizedMovementHour(value){
    const match=/^(\d{1,2}):?(\d{2})$/.exec(value.trim());
    if(!match||Number(match[1])>23||Number(match[2])>59)return '';
    return match[1].padStart(2,'0')+':'+match[2];
  }
  function setupMovementHour(){
    document.addEventListener('input',event=>{
      const input=event.target;
      if(input.name!=='movementHour')return;
      input.setCustomValidity('');
      if(/^\d{4}$/.test(input.value))input.value=normalizedMovementHour(input.value)||input.value;
    });
    document.addEventListener('change',event=>{
      const input=event.target;
      if(input.name!=='movementHour')return;
      const hour=normalizedMovementHour(input.value);
      if(hour)input.value=hour;
      input.setCustomValidity(hour?'':'Escribe una hora entre 00:00 y 23:59.');
    });
  }
  function resetMovementTime(form){
    const {movementDay, movementHour}=form.elements;
    const {date,time}=window.SKAssetHistory.localTime(new Date());
    const locked=!canEditMovementTime();
    movementDay.disabled=movementHour.disabled=locked;
    movementDay.defaultValue=movementDay.value=date;
    movementHour.defaultValue=movementHour.value=time;
    movementHour.setCustomValidity('');
  }
  function refreshMovementTimeAccess(){
    for(const day of document.querySelectorAll('input[name="movementDay"]')){
      if(!day.defaultValue || day.disabled===canEditMovementTime())resetMovementTime(day.form);
    }
  }
  function movementTimes(form, now=new Date()){
    const recordedAt=now.toISOString();
    let createdAt=recordedAt;
    if(canEditMovementTime() && movementTimeChanged(form)){
      const day=form.elements.movementDay.value, hour=normalizedMovementHour(form.elements.movementHour.value);
      const occurred=new Date(day+'T'+hour+'-05:00');
      if(!Number.isFinite(occurred.getTime()))throw new Error('Completa la fecha y la hora del movimiento.');
      const {date,time}=window.SKAssetHistory.localTime(occurred);
      if(date!==day || time!==hour)throw new Error('Revisa la fecha y la hora del movimiento.');
      if(occurred>now)throw new Error('La fecha y la hora del movimiento no pueden ser futuras.');
      createdAt=occurred.toISOString();
    }
    return {createdAt,recordedAt,updatedAt:recordedAt};
  }
  // Turnos de ocho horas desde las 06:00 en Colombia (11:00 UTC).
  const plazaShiftId=(now=Date.now())=>Math.floor((now-11*3600000)/(8*3600000));
  const shiftStorageKey=()=>`skPlazaShift:${user?.documento||''}`;
  const shiftPeople=()=> (data.personal||[]).filter(person=>!person.deleted&&person.active!==false&&String(person.documento||'').trim());
  const shiftName=person=>person.nombre||[person.primerNombre,person.segundoNombre,person.primerApellido,person.segundoApellido].filter(Boolean).join(' ')||String(person.documento);
  function selectedShiftPerson(){
    if(!user)return null;
    let selection;
    try{selection=JSON.parse(sessionStorage.getItem(shiftStorageKey())||'null')}catch(_){}
    if(selection?.shift===plazaShiftId()){
      return shiftPeople().find(person=>String(person.documento)===selection.document)||null;
    }
    return null;
  }
  function renderShiftStatus(){
    const field=$('#plazaShift'),search=$('#plazaShiftSearch'),clear=$('#plazaShiftClear'),results=$('#plazaShiftResults'),status=$('#plazaShiftStatus');
    if(!field||!search)return;
    const person=selectedShiftPerson(),wasSelected=search.readOnly;
    field.hidden=!user||currentView!=='home';
    search.readOnly=Boolean(person);
    if(person)search.value=shiftName(person);
    else if(wasSelected)search.value='';
    clear.hidden=!person;
    if(field.hidden||person||wasSelected){results.innerHTML='';results.hidden=true}
    status.hidden=Boolean(person);
    status.textContent=person?'':'Selecciona quién está de turno antes de guardar un movimiento.';
    const summary=$('#plazaShiftSummary');
    summary.hidden=!user||currentView==='home';
    $('#plazaShiftName').textContent=person?shiftName(person):'Sin seleccionar';
  }
  function renderShiftResults(){
    if(currentView!=='home'||!user||selectedShiftPerson())return;
    const search=$('#plazaShiftSearch'),results=$('#plazaShiftResults'),query=norm(search.value);
    const matches=shiftPeople().filter(person=>norm(shiftName(person)+' '+person.documento).includes(query))
      .sort((a,b)=>shiftName(a).localeCompare(shiftName(b),'es')).slice(0,30);
    results.innerHTML=matches.map(person=>`<button type="button" data-shift-person="${esc(person.documento)}"><b>${esc(shiftName(person))}</b><span>${esc(person.documento)}</span></button>`).join('')||'<small>Sin coincidencias</small>';
    results.hidden=false;
  }
  function movementShift(){
    const person=selectedShiftPerson();
    if(!person){
      renderShiftStatus();
      throw new Error('Selecciona al bodeguero o bodeguera de turno en Inicio antes de guardar.');
    }
    return {shiftKeeperId:person.id,shiftKeeperDocument:String(person.documento),shiftKeeperName:shiftName(person)};
  }
  function saveShiftSelection(documento){
    if(documento)sessionStorage.setItem(shiftStorageKey(),JSON.stringify({shift:plazaShiftId(),document:documento}));
    else sessionStorage.removeItem(shiftStorageKey());
    renderShiftStatus();
  }
  $('#plazaShiftSearch')?.addEventListener('input',renderShiftResults);
  $('#plazaShiftSearch')?.addEventListener('focus',renderShiftResults);
  $('#plazaShift')?.addEventListener('focusout',event=>{
    if(event.relatedTarget&&!event.currentTarget.contains(event.relatedTarget))$('#plazaShiftResults').hidden=true;
  });
  $('#plazaShiftResults')?.addEventListener('pointerdown',event=>{
    if(event.button===0&&event.target.closest('[data-shift-person]'))event.preventDefault();
  });
  $('body')?.addEventListener('pointerdown',event=>{
    const results=$('#plazaShiftResults');
    if(!results.hidden&&!$('#plazaShift').contains(event.target))results.hidden=true;
  });
  $('#plazaShiftResults')?.addEventListener('click',event=>{
    const button=event.target.closest('[data-shift-person]');
    if(!user||currentView!=='home'||!button)return;
    if(!shiftPeople().some(person=>String(person.documento)===button.dataset.shiftPerson)){renderShiftResults();return}
    saveShiftSelection(button.dataset.shiftPerson);
    $('#plazaShiftSearch').focus();
  });
  $('#plazaShiftClear')?.addEventListener('click',()=>{
    if(!user||currentView!=='home')return;
    saveShiftSelection('');
    $('#plazaShiftSearch').focus();
    renderShiftResults();
  });
  $('#plazaShiftInfo')?.addEventListener('click',()=>{
    const help=$('#plazaShiftHelp');
    help.hidden=!help.hidden;
    $('#plazaShiftInfo').setAttribute('aria-expanded',String(!help.hidden));
  });
  function render(){showLastSync();renderShiftStatus();const incomeId=$('#incomeForm').elements.itemId.value,deliveryId=$('#deliveryForm').elements.itemId.value;const criteria=(data.inventoryCriteria||[]).filter(item=>!item.deleted&&item.active!==false);$('#incomeForm').elements.itemId.innerHTML=options(criteria,item=>itemName(item)||'Elemento');$('#deliveryForm').elements.itemId.innerHTML=options(deliveryCatalog(),item=>itemName(item)||'Elemento');$('#incomeForm').elements.itemId.value=incomeId;$('#deliveryForm').elements.itemId.value=deliveryId;refreshRecentItemFilters();refreshItemSearches();renderIncomeDraft();window.SKPlaza?.renderRecipients?.();const collaborator=(data.personal||[]).find(person=>person.id===user?.id||String(person.documento||'')===String(user?.documento||''));$('#userName').textContent=collaborator?.nombre||user?.nombre||user?.documento||'';$('#homeUserRole').textContent='Rol en Plaza: '+({plaza_assistant:'Auxiliar',plaza_admin:'Administrador',plaza_supervisor:'Supervisor/a',plaza_operator:'Bodeguero/a'}[user?.role]||'Sin confirmar');updateDeliveryFields();updatePendingBadge();renderRecentQueries();renderInventoryQueries();window.SKPlazaReturns?.refresh()}
  function overlayPendingStock(snapshot){
    const stocks=snapshot.inventoryStock||(snapshot.inventoryStock=[]);
    const changes=[...(snapshot.blendingIncomes||[]).map(row=>({row,sign:1})),...(snapshot.blendingDeliveries||[]).map(row=>({row,sign:row.movementType==='DEVOLUCIÓN'?1:-1}))];
    for(const {row,sign} of changes){if(row.syncState!=='pending'||row.assetId||!row.itemId)continue;let stock=stocks.find(entry=>entry.itemId===row.itemId);if(!stock){stock={id:'stock-'+row.itemId,itemId:row.itemId,quantity:0};stocks.push(stock)}stock.quantity=(Number(stock.quantity)||0)+sign*Number(row.quantity||0);stock.updatedAt=row.updatedAt;}
  }
  function scheduleRetry(){clearTimeout(retryTimer);const delays=[3000,8000,20000,45000],delay=delays[Math.min(retryAttempts,delays.length-1)];retryAttempts++;const state=retryAttempts>=4?'error':'retrying';updatePendingBadge(state);$('#syncStatus').textContent=state==='error'?'Sincronización pendiente · se reintentará automáticamente':'Reconectando automáticamente…';retryTimer=setTimeout(()=>sync(true),delay)}
  const syncStores=['assets','blendingIncomes','blendingDeliveries'];
  function samePendingRow(a,b){
    const clean=row=>{const copy={...row};delete copy.syncError;return JSON.stringify(copy)};
    return Boolean(a&&b&&clean(a)===clean(b));
  }
  function reconcilePlazaSnapshot(result,sent,previous){
    if(!result||result.ok!==true||!result.data||typeof result.data!=='object'||Array.isArray(result.data))throw new Error('La base central no devolvió los registros confirmados. Los pendientes se conservaron.');
    const incoming=JSON.parse(JSON.stringify(result.data));
    const aliases={personal:['people','personnel'],inventoryCriteria:['criteria','criteriosInventario'],inventoryStock:['stock','existencias'],assets:['fixedAssets','activosFijos']};
    for(const [name,alternatives] of Object.entries(aliases))if(!Array.isArray(incoming[name]))incoming[name]=alternatives.map(key=>incoming[key]).find(Array.isArray);
    for(const name of ['personal','inventoryCriteria','inventoryStock',...syncStores])if(!Array.isArray(incoming[name]))throw new Error('La respuesta central está incompleta. Los pendientes se conservaron.');
    const receipts=result.syncProtocol==='plaza-receipts-v1';
    if(receipts&&syncStores.some(name=>!Array.isArray(result.acknowledgements?.[name])))throw new Error('Faltan las confirmaciones individuales. Los pendientes se conservaron.');
    if(receipts)for(const name of syncStores){
      const acknowledgements=new Map(result.acknowledgements[name].map(row=>[row.id,row]));
      const remote=new Map(incoming[name].map(row=>[row.id,row]));
      for(const row of sent[name]){
        const receipt=acknowledgements.get(row.id),accepted=['accepted','already-applied'].includes(receipt?.status);
        if(!receipt||(!accepted&&receipt.status!=='rejected')||(accepted&&(!remote.has(row.id)||remote.get(row.id).syncState==='pending'))||(!accepted&&remote.has(row.id)))throw new Error('La confirmación individual está incompleta o no coincide con los registros centrales. Los pendientes se conservaron.');
      }
    }
    // Los movimientos se concilian antes de los activos: un activo con un movimiento
    // aún pendiente debe conservar también su estado local.
    for(const name of ['blendingIncomes','blendingDeliveries','assets']){
      const sentRows=new Map(sent[name].map(row=>[row.id,row])),remote=new Map(incoming[name].map(row=>[row.id,row]));
      const acknowledgements=new Map((result.acknowledgements?.[name]||[]).map(row=>[row.id,row]));
      for(const row of previous[name]||[]){
        if(row.syncState!=='pending')continue;
        const original=sentRows.get(row.id),receipt=acknowledgements.get(row.id),central=remote.get(row.id);
        const dependent=name==='assets'&&['blendingIncomes','blendingDeliveries'].some(store=>incoming[store].some(movement=>movement.assetId===row.id&&movement.syncState==='pending'));
        const unchanged=samePendingRow(row,original),confirmed=unchanged&&!dependent&&central&&central.syncState!=='pending'&&(!receipts||['accepted','already-applied'].includes(receipt?.status));
        if(confirmed){const accepted={...central,syncState:'synced'};delete accepted.syncError;remote.set(row.id,accepted)}
        else{
          const pending={...row,syncState:'pending'};
          if(unchanged&&!dependent)pending.syncError=receipt?.error||'La base central no confirmó este registro; se conserva pendiente.';
          remote.set(row.id,pending);
        }
      }
      incoming[name]=[...remote.values()];
    }
    const people=new Map(incoming.personal.map(row=>[row.id,row]));
    for(const row of previous.personal||[])if(row.syncState==='pending')people.set(row.id,row);
    incoming.personal=[...people.values()];
    overlayPendingStock(incoming);
    return {...previous,...incoming,capabilities:result.capabilities||{}};
  }
  async function syncPendingCollaborators(){
    const pending=(data.personal||[]).filter(person=>person.syncState==='pending'&&!person.deleted);
    for(const person of pending){
      const sent=JSON.parse(JSON.stringify(person)),localId=person.id;
      try{
        const result=await post({action:'plazaCollaborator',token,collaborator:sent,update:person.pendingOperation!=='create'});
        if(result.exists&&person.pendingOperation==='create'){const retry=await post({action:'plazaCollaborator',token,collaborator:sent,update:true});result.user=retry.user}
        if(!result?.user?.id)throw new Error('No fue posible confirmar el colaborador en la base central.');if(localSaveTask)await localSaveTask;
        const index=(data.personal||[]).findIndex(row=>row.id===localId),current=index>=0?data.personal[index]:person;
        const confirmed=samePendingRow(current,sent)?{...sent,...result.user}:{...result.user,...current,id:result.user.id};
        if(samePendingRow(current,sent)){delete confirmed.syncState;delete confirmed.pendingOperation;delete confirmed.syncError}
        if(index>=0)data.personal[index]=confirmed;else(data.personal||(data.personal=[])).push(confirmed);
        if(localId!==confirmed.id){for(const delivery of data.blendingDeliveries||[]){if(delivery.recipientId===localId)delivery.recipientId=confirmed.id;if(delivery.returnedById===localId)delivery.returnedById=confirmed.id}for(const income of data.blendingIncomes||[])if(income.broughtById===localId)income.broughtById=confirmed.id}
      }catch(error){
        if(/no tiene acceso (?:a Plaza Blending|operativo)|(?:cuenta|equipo) ya no tiene acceso/i.test(error.message)){deviceAccess.revokeToken(token);logout();return false}
      if(/sesión venció|sesión no válida/i.test(error.message))throw error;
        const current=(data.personal||[]).find(row=>row.id===localId);if(current)current.syncError=String(error.message||error);
      }
      await window.SKPlazaLocal.write(data);
    }
  }
  async function sync(silent=false){
    if(!appReady||!token||!user)return false;
    if(syncRunning){syncQueued=true;return false}
    if(!navigator.onLine){scheduleRetry();return false}
    const syncButton=$('#syncBtn'),ownsButton=Boolean(syncButton&&syncButton.dataset.busy!=='true');
    if(ownsButton){syncButton.disabled=true;syncButton.classList.add('isSyncing');setSyncButtonText('☁ SINCRONIZANDO')}
    syncRunning=true;lastSyncAttempt=Date.now();clearTimeout(retryTimer);retryTimer=0;
    try{
      $('#syncStatus').textContent='Sincronizando…';updatePendingBadge('syncing');if(localSaveTask)await localSaveTask;
      await syncPendingCollaborators();
      const sent=JSON.parse(JSON.stringify(Object.fromEntries(syncStores.map(name=>[name,(data[name]||[]).filter(row=>row.syncState==='pending')]))));
      let loanServiceError='';
      const loanRow=row=>row.movementType==='DEVOLUCIÓN'||norm(row.deliveryType)==='prestamo';
      if(sent.blendingDeliveries.some(row=>row.exitKind==='mine'||loanRow(row))){
        const probe=await post({action:'plazaSync',token,data:{}});
        const held=sent.blendingDeliveries.filter(row=>{
          if(row.exitKind!=='mine')return loanRow(row)&&probe.capabilities?.inventoryLoansV1!==true;
          if(row.deliveryType==='SALIDA A REPARACIÓN'&&row.destinationMine!=='Segovia')return probe.capabilities?.mineRepairDestinationV1!==true;
          if(row.destinationMine==='Segovia'&&row.deliveryType!=='SALIDA A REPARACIÓN')return probe.capabilities?.mineSegoviaRepairOnly!==true;
          return probe.capabilities?.mineReturnOwnerV2!==true||row.destinationMine==='Segovia'&&probe.capabilities?.mineSegoviaV1!==true;
        });
        if(held.length){
          loanServiceError=held.some(row=>row.exitKind==='mine')?'Salida guardada. Falta actualizar el servicio central para sincronizar Fuera de mina.':'El registro está guardado. Falta actualizar el servicio central para sincronizar préstamos y retornos.';
          const heldAssets=new Set(held.map(row=>row.assetId).filter(Boolean)),heldIds=new Set(held.map(row=>row.id));
          // Mantener juntos los movimientos sucesivos del mismo activo mientras espera el servidor.
          for(const name of syncStores)sent[name]=sent[name].filter(row=>!heldAssets.has(name==='assets'?row.id:row.assetId)&&!heldIds.has(row.id));
          for(const row of data.blendingDeliveries||[])if(heldIds.has(row.id))row.syncError=loanServiceError;
          await window.SKPlazaLocal.write(data);
          if(!syncStores.some(name=>sent[name].length))throw new Error(loanServiceError);
        }
      }
      const syncToken=token;
      const result=await post({action:'plazaSync',token:syncToken,syncProtocol:'plaza-receipts-v1',since:silent&&collaboratorRevisionApi&&collaboratorRevisionApi===api()?(localStorage.getItem('skPlazaServerUpdatedAt')||''):'',data:sent});
      if(!result||result.ok!==true)throw new Error('No se recibió confirmación de la base central.');
      if(syncToken===token && ['plaza_operator','plaza_assistant','plaza_supervisor','plaza_admin'].includes(result.sessionRole) && result.sessionRole!==user?.role){
        user={...user,role:result.sessionRole};
        sessionStorage.setItem('skPlazaUser',JSON.stringify(user));
        const cached=deviceAccess.byToken(token);
        if(cached)deviceAccess.refresh(token,{...cached,user});
        refreshMovementTimeAccess();
      }
      if(result.notModified){
        if(syncStores.some(name=>sent[name].length))throw new Error('La base central no confirmó los registros enviados. Se conservaron pendientes.');
        data.capabilities=result.capabilities||data.capabilities||{};
      }else{
        // A new local record can be saved while IndexedDB commits the response.
        // Reconcile again if memory changed during that write, retaining those pending rows.
        for(;;){
          if(localSaveTask)await localSaveTask;
          const before=JSON.stringify(data),reconciled=reconcilePlazaSnapshot(result,sent,data);
          await window.SKPlazaLocal.write(reconciled);
          if(localSaveTask)await localSaveTask;
          if(JSON.stringify(data)===before){data=reconciled;break}
        }
      }
      collaboratorRevisionApi=result.capabilities?.collaboratorRevisionsV1===true?api():'';
      const serverUpdatedAt=result.updatedAt||result.data?.updatedAt;
      if(serverUpdatedAt)localStorage.setItem('skPlazaServerUpdatedAt',serverUpdatedAt);
      const pending=pendingCount();syncRenderPending=true;refreshSyncedView();
      if(currentView==='income'||currentView==='delivery')$('#'+currentView+'ItemField')._refreshItemAvailability?.();
      if(pending){
        scheduleRetry();
        const firstError=loanServiceError||['personal',...syncStores].flatMap(name=>data[name]||[]).find(row=>row.syncState==='pending'&&row.syncError)?.syncError||'';
        $('#syncStatus').textContent=`Sincronización parcial · ${pending} ${pending===1?'evento pendiente':'eventos pendientes'}${firstError?' · '+firstError:''}`;
        if(firstError)window.SKPlazaReturns?.setSyncError?.(firstError);
        if(!silent&&firstError)alert($('#syncStatus').textContent);
        return false;
      }
      const syncedAt=new Date().toISOString();localStorage.setItem('skPlazaLastSync',syncedAt);retryAttempts=0;
      updatePendingBadge();showLastSync(syncedAt);$('#syncStatus').textContent=`Sincronizado${result.notModified?' · sin cambios':''} · ${new Date().toLocaleString('es-CO')}`;
      return true;
    }catch(error){
      if(/no tiene acceso (?:a Plaza Blending|operativo)|(?:cuenta|equipo) ya no tiene acceso/i.test(error.message)){deviceAccess.revokeToken(token);logout();return false}
      if(/sesión venció|sesión no válida/i.test(error.message)){if(silent){scheduleRetry();$('#syncStatus').textContent='Sesión pendiente de validar · registros guardados en este dispositivo';return false}logout();return false}
      scheduleRetry();$('#syncStatus').textContent='Sincronización pendiente · '+String(error.message||error);
      const hasReturns=(data.blendingDeliveries||[]).some(row=>row.syncState==='pending'&&(row.movementType==='DEVOLUCIÓN'||norm(row.deliveryType)==='prestamo'));
      if(hasReturns)window.SKPlazaReturns?.setSyncError?.(error.message);
      if(!silent)alert('Los registros pendientes se conservan en este dispositivo. '+String(error.message||error));
      return false;
    }finally{
      syncRunning=false;
      if(ownsButton){syncButton.disabled=false;syncButton.classList.remove('isSyncing');setSyncButtonText('☁ SINCRONIZAR')}
      if(syncQueued){syncQueued=false;setTimeout(()=>sync(true),0)}
    }
  }

  function refreshSyncedView(){
    if(!syncRenderPending||document.hidden||hasUnsavedData()||$('#collaboratorDialog')?.hidden===false)return;
    syncRenderPending=false;render();window.dispatchEvent(new Event('skplaza-synced'));
  }
  function refreshSharedData(){
    refreshSyncedView();
    if(!token||!user||!navigator.onLine||document.hidden||syncRunning||retryTimer||Date.now()-lastSyncAttempt<30000)return;
    sync(true);
  }
  function periodicSync(){
    if(user)renderShiftStatus();
    if(token&&user&&navigator.onLine&&!syncRunning)sync(true);
  }

  async function syncDataAndApp(){const button=$('#syncBtn');if(button?.dataset.busy==='true')return;if(button){button.dataset.busy='true';button.disabled=true;button.classList.add('isSyncing');setSyncButtonText('☁ SINCRONIZANDO')}let dataOk=false,appOk=false;try{dataOk=await sync(false);if(button)setSyncButtonText('↻ ACTUALIZANDO APP');if(window.SKPlazaInstall?.updateApp){await window.SKPlazaInstall.updateApp();appOk=true}else appOk=true;if(dataOk&&appOk){$('#syncStatus').textContent=`Datos y aplicación actualizados · ${new Date().toLocaleString('es-CO')}`;updatePendingBadge()}}catch(error){console.error('Actualización de Plaza:',error);if(dataOk)alert('Los datos se sincronizaron, pero la aplicación no pudo comprobar actualizaciones. Se intentará nuevamente al abrirla.')}finally{if(button){button.dataset.busy='false';button.disabled=false;button.classList.remove('isSyncing');setSyncButtonText('☁ SINCRONIZAR')}}}
  async function persistLocalChange(next){
    if(localSaveTask)throw new Error('Hay un registro guardándose. Espera a que termine y vuelve a intentar.');
    const task=(async()=>{await window.SKPlazaLocal.write(next);data=next})();
    localSaveTask=task;
    try{await task}finally{if(localSaveTask===task)localSaveTask=null}
  }
  function readLocalData(){return window.SKPlazaLocal.read()}
  async function openApp(showGreeting=false){
    refreshMovementTimeAccess();
    appReady=false;data=await readLocalData();appReady=true;$('#login').hidden=true;$('#app').hidden=false;$('#syncBtn').hidden=false;$('#logoutBtn').hidden=false;render();sync(true);if(showGreeting)showWelcomeMessage();
  }
  const welcomeMessages=['TU TRABAJO MANTIENE TODO EN MOVIMIENTO.','CADA REGISTRO PRECISO HACE LA DIFERENCIA.','ORDEN, COMPROMISO Y SEGURIDAD EN CADA TAREA.','HOY ES UNA NUEVA OPORTUNIDAD PARA HACERLO BIEN.','GRACIAS POR CUIDAR LOS RECURSOS QUE ESTÁN EN TUS MANOS.','RESPIRA: VAS MEJOR DE LO QUE CREES.','QUE HOY TE PASE ALGO BONITO.','CONFÍA EN TI; HAS SUPERADO DÍAS MÁS DIFÍCILES.','UN PASO A LA VEZ TAMBIÉN TE LLEVA LEJOS.','HOY TAMBIÉN CUENTA PARA EMPEZAR DE NUEVO.','NO OLVIDES REGALARTE UN MOMENTO DE CALMA.','TU SONRISA TAMBIÉN PUEDE CAMBIAR EL DÍA.','QUE TENGAS UN DÍA TRANQUILO Y LLENO DE COSAS BUENAS.'];
  function showWelcomeMessage(){const dialog=$('#sessionWelcome');if(!dialog)return;const firstName=String(user?.nombre||'').trim().split(/\s+/)[0];$('#sessionWelcomeTitle').textContent=firstName?`¡HOLA, ${firstName.toUpperCase()}!`:'¡HOLA!';$('#sessionWelcomeMessage').textContent=welcomeMessages[Math.floor(Math.random()*welcomeMessages.length)];dialog.hidden=false;requestAnimationFrame(()=>dialog.classList.add('visible'))}
  function closeWelcomeMessage(){const dialog=$('#sessionWelcome');if(!dialog)return;dialog.classList.remove('visible');setTimeout(()=>{dialog.hidden=true;if(currentView==='home'&&!selectedShiftPerson())$('#plazaShiftSearch').focus()},180)}
  let recordConfirmationTimer=0;
  function setupRecordConfirmation(){if($('#recordConfirmation'))return;const overlay=document.createElement('section');overlay.id='recordConfirmation';overlay.className='recordConfirmation';overlay.hidden=true;overlay.setAttribute('role','status');overlay.setAttribute('aria-live','assertive');overlay.innerHTML='<div class="recordConfirmationCard"><div class="recordConfirmationCheck" aria-hidden="true">✓</div><h2>REGISTRO GUARDADO</h2><p>Ya tenemos tu registro.<br>No necesitas volver a ingresarlo.</p><strong id="recordConfirmationCount"></strong><small>Toca cualquier lugar para continuar</small></div>';const close=()=>{clearTimeout(recordConfirmationTimer);overlay.classList.remove('visible');setTimeout(()=>{overlay.hidden=true},180)};overlay.addEventListener('pointerdown',close);overlay.addEventListener('click',close);document.addEventListener('keydown',event=>{if(!overlay.hidden&&(event.key==='Escape'||event.key==='Enter'||event.key===' '))close()});overlay._show=count=>{clearTimeout(recordConfirmationTimer);$('#recordConfirmationCount').textContent=`${count} ${count===1?'elemento guardado correctamente':'elementos guardados correctamente'}`;overlay.hidden=false;requestAnimationFrame(()=>overlay.classList.add('visible'));recordConfirmationTimer=setTimeout(close,3000)};document.body.append(overlay)}
  function showRecordConfirmation(count){setupRecordConfirmation();$('#recordConfirmation')._show(Math.max(1,Number(count)||1))}
  window.alert=message=>{const text=String(message||''),success=/^(INGRESO|ENTREGA) REGISTRAD[AO]/.test(text);if(!success)return nativeAlert(message);const match=text.match(/\n\n(\d+)\s/);showRecordConfirmation(match?Number(match[1]):1)};
  async function acceptLogin(result,greet=false){token=result.token;user=result.user;if(greet)sessionStorage.removeItem(shiftStorageKey());sessionStorage.setItem('skPlazaToken',token);sessionStorage.setItem('skPlazaUser',JSON.stringify(user));await openApp(greet)}
  async function renewLogin(document,pin,previousToken){try{const result=await loginWithRetry({action:'plazaLogin',document,pin});if(token!==previousToken)return;await acceptLogin(result);await deviceAccess.remember(document,pin,result)}catch(error){if(/contraseña|credenciales|desactiv|no tiene acceso|no habilitado|no autorizado|documento.*incorrect/i.test(error.message)&&token===previousToken){deviceAccess.remove(document);logout()}}}
  function logout(){sessionStorage.removeItem('skPlazaToken');sessionStorage.removeItem('skPlazaUser');location.reload()}
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  async function loginWithRetry(body){const delays=[0,1500,4000];let lastError;for(let attempt=0;attempt<delays.length;attempt++){if(delays[attempt]){const status=$('#loginStatus');status.classList.remove('status');status.textContent='Conexión inestable. Reintentando automáticamente…';await wait(delays[attempt])}try{return await post(body)}catch(error){lastError=error;if(!/servicio central no está disponible|no fue posible conectar/i.test(error.message))throw error}}throw lastError}
  $('#loginForm').addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget,button=form.querySelector('button');button.disabled=true;const fields=new FormData(form);try{$('#loginStatus').classList.remove('status');$('#loginStatus').textContent='Verificando…';const document=String(fields.get('document')),pin=String(fields.get('pin')||''),cached=await deviceAccess.verify(document,pin);if(cached&&window.SKEntry.validLocal(cached)&&!(navigator.onLine&&document.trim().toLowerCase()==='admin')){await acceptLogin(cached,true);if(navigator.onLine)void renewLogin(document,pin,cached.token);}else{if(!navigator.onLine)throw new Error('El primer acceso de esta cuenta en este dispositivo requiere conexión.');const result=await loginWithRetry({action:'plazaLogin',document,pin});await acceptLogin(result,true);await deviceAccess.remember(document,pin,result)}}catch(error){$('#loginStatus').classList.add('status');$('#loginStatus').textContent=authMessage(error.message)}finally{button.disabled=false}});
  function requireShiftAtHome(){
    if(selectedShiftPerson())return true;
    showView('home');
    $('#plazaShiftStatus').textContent='Selecciona al bodeguero/a de turno para abrir los registros.';
    $('#plazaShiftSearch').focus();
    return false;
  }
  function showView(view){if(['income','delivery','loan','assetReturns','exits','warehouses','productionTransfer','mineExit'].includes(view)&&!requireShiftAtHome())return;if(view!==navigationRoute){$('#plazaShiftHelp').hidden=true;$('#plazaShiftInfo').setAttribute('aria-expanded','false')}if(view==='stockQuery'&&currentView!=='stockQuery'){stockGroup='';stockRootFilter='';$('#stockSearch').value=''}navigationRoute=view;if(view==='recentDeliveries'){const allOption=$('#deliveryCategoryFilter input[value="all"]');if(allOption)allOption.checked=true}const returnsQuery=view==='loanHistory';if(returnsQuery||view==='assetReturns'){window.SKPlazaReturns?.setReadOnly(returnsQuery);view='assetReturns'}if(view==='mineExit')mineExitForm.reset();if(['loan','delivery','productionTransfer'].includes(view)){openDeliveryMode(view==='loan'?'loan':view==='productionTransfer'?'warehouse':'assignment');view='delivery'}if((view==='income'||view==='delivery') && currentView!==view){
      const form=$('#'+view+'Form');
      if(!movementTimeChanged(form))resetMovementTime(form);
    }currentView=view;const nav=$('nav'),queryViews=['contacts','recentDeliveries','recentIncomes','stockQuery','personHistory',...(returnsQuery?['assetReturns']:[])],homeButton=$('#plazaHeaderHome'),atHome=view==='home';renderShiftStatus();nav.hidden=atHome;if(homeButton){homeButton.disabled=atHome;homeButton.classList.toggle('isCurrent',atHome);homeButton.setAttribute('aria-label',atHome?'Ubicación actual: Inicio':'Volver a Inicio');homeButton.title=atHome?'':'Volver a Inicio'}document.querySelectorAll('nav button').forEach(button=>{const isHome=button.dataset.view==='home',isCurrent=button.dataset.view===view||(button.dataset.view==='contacts'&&queryViews.includes(view));button.style.display=view==='home'||isHome||isCurrent?'':'none';button.disabled=isCurrent&&!isHome;button.classList.toggle('active',isCurrent);button.classList.toggle('moduleIndicator',isCurrent&&!isHome)});document.querySelectorAll('.view').forEach(section=>section.classList.toggle('active',section.id===view));if(['home','contacts','personal','delivery','income'].includes(view))refreshSharedData();if(queryViews.includes(view)&&view!=='stockQuery')renderRecentQueries();if(view==='stockQuery'||view==='personHistory')renderInventoryQueries();if(view==='assetReturns')window.SKPlazaReturns?.refresh();refreshSyncedView();const scrollTop=$('#deliveryScrollTop');if(scrollTop)scrollTop.hidden=!(view==='recentDeliveries'&&window.scrollY>480);paintPlazaNavigation()}
  function hasUnsavedData(){
    if(['mineExit','income','delivery'].includes(currentView)){
      if(canEditMovementTime() && movementTimeChanged($('#'+currentView+'Form')))return true;
    }
    if(currentView==='mineExit')return mineExitForm.dirty();if(currentView==='assetReturns')return window.SKPlazaReturns?.hasUnsaved()||false;if(currentView==='delivery'){const form=$('#deliveryForm');return Boolean(form.elements.recipientCompany.value||deliveryDraft.length||form.elements.itemId.closest('label')._hasItemSearchDraft?.()||form.elements.itemId.value||form.elements.recipientId.value||(deliveryMode!=='warehouse'&&form.elements.destination.value)||form.elements.notes.value||(String(form.elements.quantity.value||'').trim()&&!['0','1'].includes(String(form.elements.quantity.value))))}if(currentView==='income'){const form=$('#incomeForm');return Boolean(incomeDraft.length||form.elements.itemId.closest('label')._hasItemSearchDraft?.()||form.elements.itemId.value||form.elements.notes.value||$('#incomeCollaboratorSearch')?.value.trim()||(String(form.elements.quantity.value||'').trim()&&!['0','1'].includes(String(form.elements.quantity.value))))}return false}
  function discardDeliveryForm(){deliveryDraft=[];const form=$('#deliveryForm');form.reset();resetMovementTime(form);delete form.elements.destination.dataset.manualArea;clearItemSearch(form);$('#recipientSearch').value='';$('#recipientId').value='';const info=$('#recipientInfo');if(info)info.hidden=true;const results=$('#recipientResults');if(results)results.hidden=true;const noMatch=$('#recipientNoMatch');if(noMatch)noMatch.hidden=true;const register=$('#newRecipientBtn');if(register)register.hidden=true;const edit=$('#editRecipientBtn');if(edit){edit.hidden=true;edit.disabled=true}renderDeliveryDraft();updateDeliveryFields()}
  function discardIncomeForm(){incomeDraft=[];const form=$('#incomeForm');form.reset();resetMovementTime(form);clearItemSearch(form);window.SKPlaza?.clearIncomeCollaborator?.();renderIncomeDraft();form.elements.itemId.dispatchEvent(new Event('change',{bubbles:true}))}
  function leavePlazaScreen(){
    if(deliverySaving||incomeSaving||mineExitForm.saving())return false;
    if(hasUnsavedData()&&!confirm('Hay datos sin registrar. ¿Descartarlos y volver?'))return false;
    if(currentView==='mineExit')mineExitForm.reset();else if(currentView==='delivery')discardDeliveryForm();else if(currentView==='income')discardIncomeForm();else if(currentView==='assetReturns')window.SKPlazaReturns?.reset();
    return true;
  }
  function discardAndGoHome(){if(leavePlazaScreen())showView('home')}
  function plazaParent(){
    if(navigationRoute==='personHistory')return 'contacts';
    if(['delivery','warehouses','mineExit'].includes(navigationRoute))return 'exits';
    if(navigationRoute==='productionTransfer')return 'warehouses';
    if(['income','exits','loan','assetReturns'].includes(navigationRoute))return 'register';
    if(['contacts','recentDeliveries','recentIncomes','stockQuery','loanHistory'].includes(navigationRoute))return 'query';
    return 'home';
  }
  function paintPlazaNavigation(){
    const bar=$('#plazaNavigation');if(!bar)return;bar.hidden=currentView==='home';
    const parent=plazaParent(),titles={exits:'Registrar salidas',warehouses:'Traslado a bodegas',productionTransfer:'Producción',mineExit:'Fuera de mina',income:'Registrar ingresos',delivery:'Registrar entregas',loan:'Prestar elementos',assetReturns:'Retorno de elementos',loanHistory:'Préstamos y devoluciones',recentDeliveries:'Entregas recientes',recentIncomes:'Ingresos recientes',stockQuery:'Existencias',contacts:'Personal',personHistory:'Historial del funcionario',personal:'Registrar colaborador'};
    $('#plazaBreadcrumb').textContent=['Inicio',...(['register','query'].includes(parent)?[parent==='register'?'Hacer registros':'Hacer consultas']:parent==='contacts'?['Hacer consultas','Personal']:parent==='exits'?['Hacer registros','Registrar salidas']:parent==='warehouses'?['Hacer registros','Registrar salidas','Traslado a bodegas']:[]),titles[navigationRoute]||'',navigationRoute==='stockQuery'&&stockGroup?window.SKSpareGroups.groupName(stockGroup):''].filter(Boolean).join(' / ');
  }
  function goBackPlaza(){
    if(currentView==='stockQuery'&&stockGroup){changeStockGroup('');return}
    const returning=currentView==='assetReturns'&&window.SKPlazaReturns?.hasUnsaved();
    if(!leavePlazaScreen())return;
    if(returning)return;
    const parent=plazaParent();
    if(parent==='register')window.openPlazaRegisterMenu();else if(parent==='query')window.openPlazaQueryMenu();else showView(parent);
  }
  function setupSessionHeader(){const welcome=document.querySelector('.welcome'),logout=$('#logoutBtn'),home=$('#home');if(welcome&&home&&!home.contains(welcome))home.append(welcome);if(welcome)welcome.style.display='flex';logout.textContent='Cerrar sesión';logout.hidden=true;$('#plazaHeaderHome').addEventListener('click',discardAndGoHome);const bar=document.createElement('div');bar.id='plazaNavigation';bar.hidden=true;bar.innerHTML='<button type="button" id="plazaBack" aria-label="Volver a la pantalla anterior" title="Volver"><svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false"><path fill="currentColor" d="M10 5 2 12l8 7v-5h3c4.2 0 7 1.8 9 5-.8-6.5-4-10-9-10h-3V5Z"/></svg></button><span id="plazaBreadcrumb"></span>';$('nav').after(bar);$('#plazaBack').addEventListener('click',goBackPlaza)}
  function setupRegisterMenu(){const overlay=document.createElement('div');overlay.id='plazaRegisterMenu';overlay.className='registerMenuOverlay';overlay.hidden=true;overlay.innerHTML='<div class="registerMenu"><div class="registerMenuHead"><h2>HACER REGISTROS</h2><button type="button" data-close-register aria-label="Volver a Inicio">VOLVER</button></div><p>SELECCIONA EL MÓDULO.</p><div class="registerMenuGrid"><button type="button" data-register-view="income">REGISTRAR INGRESOS</button><button type="button" data-register-view="exits">REGISTRAR SALIDAS</button></div><section class="loanMenuSection" aria-labelledby="loanMenuTitle"><h3 id="loanMenuTitle">PRÉSTAMOS</h3><div class="loanMenuActions"><button type="button" data-register-view="loan">PRESTAR ELEMENTOS</button><button type="button" data-register-view="assetReturns">RETORNO DE ELEMENTOS</button></div></section></div>';document.body.append(overlay);const close=()=>{overlay.hidden=true};overlay.addEventListener('click',event=>{if(event.target===overlay||event.target.closest('[data-close-register]'))close();const button=event.target.closest('[data-register-view]');if(button){close();showView(button.dataset.registerView)}});window.openPlazaRegisterMenu=()=>{if(!requireShiftAtHome())return;showView('home');overlay.hidden=false}}
  function movementDate(row){const date=new Date(row.createdAt||row.updatedAt||0);return Number.isNaN(date.getTime())?null:date}
  function movementItem(row){return row.itemName||itemName(findItem(row.itemId))||'Elemento sin nombre'}
  function localDateValue(date){const pad=value=>String(value).padStart(2,'0');return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`}
  const recentOrder={delivery:[],income:[]};
  const defaultRecentOrder=[{key:'date',dir:-1}];
  const activeRecentOrder=kind=>recentOrder[kind].length?recentOrder[kind]:defaultRecentOrder;
  const recentCollator=new Intl.Collator('es-CO',{sensitivity:'base',numeric:true});
  const categoryLabels={all:'Todo',epp:'Solo EPP',assets:'Activos fijos',reversals:'Reversiones'};
  function recentCategory(kind){
    return [...document.querySelectorAll('#'+kind+'CategoryFilter input')].find(input=>input.checked)?.value||'all';
  }
  function recentColumns(kind){
    const delivery=kind==='delivery';
    return {date:'Fecha y hora del movimiento',item:'Elemento',quantity:'Cantidad',
      ...(delivery?{balance:'Saldos'}:{origin:'Origen'}),person:delivery?'Recibe':'Quién trae',
      company:'Empresa / Área',keeper:'Bodeguero/a de turno',operator:'Registrado por'};
  }
  function recentSort(kind,key){
    if(!Object.hasOwn(recentColumns(kind),key))return;
    const order=recentOrder[kind],entry=order.find(column=>column.key===key);
    if(entry)entry.dir=-entry.dir;
    else order.push({key,dir:1});
  }
  function changeRecentPriority(kind,key,action){
    const order=recentOrder[kind],index=order.findIndex(entry=>entry.key===key);
    if(index<0)return;
    if(action==='remove'){order.splice(index,1);return}
    const next=index+({left:-1,right:1}[action]??0);
    if(next>=0&&next<order.length)[order[index],order[next]]=[order[next],order[index]];
  }
  function recentPeople(){
    const personal=data.personal||[];
    return {byId:new Map(personal.map(p=>[p.id,p])),
      byDocument:new Map(personal.filter(p=>p.documento).map(p=>[String(p.documento),p]))};
  }
  function recentDetails(kind,row,people){
    const delivery=kind==='delivery',person=people.byId.get(delivery?row.recipientId:row.broughtById);
    const document=String(row.actorDocument||row.operatorDocument||'');
    const operator=people.byDocument.get(document)||people.byId.get(row.operatorId);
    return {person:person?.nombre||(delivery?row.recipientName:row.broughtByName)||'',
      document:person?.documento||(delivery?row.recipientDocument:row.broughtByDocument),
      company:(delivery?row.recipientCompany:'')||person?.empresa||'',area:person?.area||'',
      keeper:row.shiftKeeperName||row.shiftKeeperDocument||'',operator:operator?.nombre||row.operatorName||document||''};
  }
  function sortRecentGroups(kind,groups,people){
    const order=activeRecentOrder(kind);
    const indexed=groups.map(rows=>{
      const row=rows[rows.length-1],details=recentDetails(kind,row,people);
      const values={...details,date:movementDate(row)?.getTime(),item:movementItem(row),
        quantity:row.quantity==null?null:Number(row.quantity),balance:row.balanceAfter==null?null:Number(row.balanceAfter),
        origin:row.originMine,company:[details.company,details.area].filter(Boolean).join(' / ')};
      return {rows,values};
    });
    indexed.sort((a,b)=>{
      for(const {key,dir} of order){
        const x=a.values[key],y=b.values[key],missingX=x==null||x==='',missingY=y==null||y==='';
        if(missingX!==missingY)return missingX?1:-1;
        if(missingX)continue;
        const diff=typeof x==='number'?x-y:recentCollator.compare(x,y);
        if(diff)return dir*diff;
      }
      return 0;
    });
    return indexed.flatMap(group=>group.rows);
  }
  function reversalGroups(rows,matches){
    const originals=new Map(rows.filter(row=>row.reversalMovementId).map(row=>[row.reversalMovementId,row.id]));
    const linkedIds=new Set(rows.map(row=>row.reversalOf).filter(Boolean)),groups=new Map();
    for(const row of rows){
      if(!(row.reversed||row.reversado||row.reversalOf||row.reversalMovementId||row.movementType==='REVERSIÓN'||linkedIds.has(row.id)||originals.has(row.id)))continue;
      const id=row.reversalOf||originals.get(row.id)||row.id;
      if(!groups.has(id))groups.set(id,[]);
      const group=groups.get(id);
      if(row.id===id)group.unshift(row);else group.push(row);
    }
    return [...groups.values()].filter(group=>group.some(matches));
  }
  function recentItemId(kind){return $('#'+kind+'HistoryQueryForm')?.elements?.itemId?.value||''}
  function refreshRecentItemFilters(){
    for(const kind of ['delivery','income']){
      const form=$('#'+kind+'HistoryQueryForm');if(!form)continue;
      const select=form.elements.itemId,selected=select.value;
      select.innerHTML=options(deliveryItems(),itemName);
      if(selected&&!deliveryItems().some(item=>item.id===selected)){const item=findItem(selected);if(item)select.add(new Option(itemName(item),selected))}
      select.value=selected;
      if(!select.closest('label').classList.contains('isOpen'))select.closest('label')._refreshItemSearch?.();
    }
  }
  function recentDateRange(kind){
    const fromValue=$('#'+kind+'DateFrom')?.value,toValue=$('#'+kind+'DateTo')?.value,fromTime=$('#'+kind+'TimeFrom')?.value||'00:00',toTime=$('#'+kind+'TimeTo')?.value||'23:59';
    return{from:fromValue?new Date(fromValue+'T'+fromTime+':00'):null,to:toValue?new Date(toValue+'T'+toTime+':59.999'):null};
  }
  function recentQueryRows(kind,people=recentPeople()){
    const {from,to}=recentDateRange(kind),itemId=recentItemId(kind),category=recentCategory(kind);
    if(from&&to&&from>to)return [];
    const rows=(data[kind==='delivery'?'blendingDeliveries':'blendingIncomes']||[])
      .filter(row=>!row.deleted&&!(kind==='delivery'&&row.movementType==='DEVOLUCIÓN'));
    function matches(row){
      const date=movementDate(row);
      if(!date||from&&date<from||to&&date>to||itemId&&!queryMatchesItem(row,itemId))return false;
      if(category==='epp')return findItem(row.itemId)?.isEpp===true;
      if(category==='assets')return Boolean(row.assetId||isFixedItem(findItem(row.itemId)));
      return true;
    }
    const groups=category==='reversals'?reversalGroups(rows,matches):rows.filter(matches).map(row=>[row]);
    return sortRecentGroups(kind,groups,people);
  }
  function recentFilterLabel(kind){
    const item=findItem(recentItemId(kind)),labels=[item?itemName(item):'Todos los elementos'];
    labels.push(categoryLabels[recentCategory(kind)]);
    return labels.join(' · ');
  }
  function resetRecentFilters(kind){
    const today=new Date(),from=new Date(today);from.setDate(today.getDate()-(kind==='delivery'?6:29));
    $('#'+kind+'DateFrom').value=localDateValue(from);$('#'+kind+'DateTo').value=localDateValue(today);
    $('#'+kind+'TimeFrom').value='';$('#'+kind+'TimeTo').value='';
    clearItemSearch($('#'+kind+'HistoryQueryForm'));
    $('#'+kind+'CategoryFilter input[value="all"]').checked=true;
    recentOrder[kind]=[];
  }
  function loanReturnSummary(row){if(norm(row.deliveryType)!=='prestamo')return '';const back=(data.blendingDeliveries||[]).find(event=>!event.deleted&&!event.reversed&&!event.reversado&&event.movementType==='DEVOLUCIÓN'&&event.loanId===row.id);return back?`DEVUELTO · ${new Date(back.returnedAt||back.createdAt).toLocaleString('es-CO')} · Devuelve: ${back.returnedByName||back.returnedByDocument||''} · Bodeguero/a de turno: ${back.shiftKeeperName||'Sin dato histórico'} · Registrado por: ${back.operatorName||back.actorDocument||back.operatorDocument||''}${back.notes?' · '+back.notes:''}`:`Préstamo: ${window.SKPlazaReturns?.loanState(data,row)||'PENDIENTE'}`}
  function deliveryReplacementLabel(row){
    if(row.movementType==='DEVOLUCIÓN'||row.queryType==='INGRESO'||row.assetId||isFixedItem(findItem(row.itemId))||norm(row.deliveryType)==='prestamo')return '';
    if(row.bringsReplacement==='first-delivery')return 'PRIMERA ENTREGA';
    if(typeof row.bringsReplacement==='boolean')return row.bringsReplacement?'SÍ':'NO';
    return isEppDeliveryItem(findItem(row.itemId))?'Sin registrar':'';
  }
  function deliveryReportRow(row){const personal=data.personal||[],recipient=personal.find(person=>person.id===row.recipientId),operatorDocument=String(row.actorDocument||row.operatorDocument||''),operator=personal.find(person=>String(person.documento||'')===operatorDocument)||personal.find(person=>person.id===row.operatorId);return{fecha:movementDate(row)?.toLocaleString('es-CO')||'',elemento:movementItem(row),activo:movementAssetLabel(row),tipoEntrega:row.deliveryType||(row.assetId?'No especificado':''),cantidad:row.quantity||1,reposicion:deliveryReplacementLabel(row)||'No aplica',funcionario:recipient?.nombre||row.recipientName||'No informado',documento:recipient?.documento||row.recipientDocument||'No informado',empresa:row.recipientCompany||recipient?.empresa||'No informada',area:recipient?.area||'No informada',turno:row.shiftKeeperName||row.shiftKeeperDocument||'Sin dato histórico',entrego:operator?.nombre||row.operatorName||operatorDocument||'No informado',destino:row.destination||'',observaciones:[row.notes,loanReturnSummary(row),row.reversed===true||row.reversado===true?'REVERSADO':'',row.movementType==='REVERSIÓN'?'REVERSIÓN · Movimiento original: '+new Date(row.originalCreatedAt).toLocaleString('es-CO')+' · Saldo: '+row.balanceBefore+' · '+(row.stockDelta>0?'+ Cantidad reintegrada: ':'− Cantidad retirada: ')+row.quantity+' · Nuevo saldo: '+row.balanceAfter:'',row.reversalRequestedBy?'Reversión solicitada por: '+row.reversalRequestedBy:''].filter(Boolean).join(' · ')}}
  function incomeReportRow(row){
    const person=(data.personal||[]).find(person=>person.id===row.broughtById);
    return{...deliveryReportRow(row),tipoIngreso:row.incomeType||'',origen:row.originMine||'',funcionario:person?.nombre||row.broughtByName||'No informado',documento:person?.documento||row.broughtByDocument||'No informado',empresa:person?.empresa||'No informada',area:person?.area||'No informada'};
  }
  function reportFileBase(kind='delivery'){
    const from=$('#'+kind+'DateFrom')?.value||'inicio',to=$('#'+kind+'DateTo')?.value||'hoy',suffix=({epp:'_EPP',assets:'_ACTIVOS_FIJOS',reversals:'_REVERSIONES'}[recentCategory(kind)]||''),item=findItem(recentItemId(kind)),element=item?'_'+norm(itemName(item)).replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,''):'';
    return`${kind==='delivery'?'entregas':'ingresos'}_${from}_a_${to}${suffix}${element}`;
  }
  function downloadBlob(blob,name){const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1500)}
  function xmlEsc(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]))}
  function exportDeliveriesExcel(){return exportMovementExcel('delivery')}
  function exportIncomesExcel(){return exportMovementExcel('income')}
  function exportMovementExcel(kind){
  const income=kind==='income',rows=recentQueryRows(kind).map(income?incomeReportRow:deliveryReportRow);
  if(!rows.length)return alert('No hay '+(income?'ingresos':'entregas')+' para exportar con los filtros seleccionados.');
  const headers=income?['FECHA Y HORA','ELEMENTO','ACTIVO ESPECÍFICO','TIPO DE INGRESO','CANTIDAD','QUIÉN TRAE','DOCUMENTO','EMPRESA','ÁREA','BODEGUERO/A DE TURNO','REGISTRADO POR','MINA DE ORIGEN','OBSERVACIONES']:['FECHA Y HORA','ELEMENTO','ACTIVO ESPECÍFICO','TIPO DE ENTREGA','CANTIDAD','TRAE REPOSICIÓN','FUNCIONARIO','DOCUMENTO','EMPRESA','ÁREA','BODEGUERO/A DE TURNO','REGISTRADO POR','DESTINO','OBSERVACIONES'];
  const keys=income?['fecha','elemento','activo','tipoIngreso','cantidad','funcionario','documento','empresa','area','turno','entrego','origen','observaciones']:['fecha','elemento','activo','tipoEntrega','cantidad','reposicion','funcionario','documento','empresa','area','turno','entrego','destino','observaciones'];
  const widths=keys.map((key,index)=>{
    const longest=Math.max(headers[index].length,...rows.map(row=>String(row[key]??'').length));
    return Math.min(260,Math.max(55,longest*6.7+14));
  });
  const cell=(value,style='')=>`<Cell${style?` ss:StyleID="${style}"`:''}><Data ss:Type="${typeof value==='number'?'Number':'String'}">${xmlEsc(value)}</Data></Cell>`;
  const columns=widths.map(width=>`<Column ss:AutoFitWidth="1" ss:Width="${width.toFixed(1)}"/>`).join('');
  const table=`<Row ss:StyleID="Header">${headers.map(value=>cell(value,'Header')).join('')}</Row>`+rows.map(row=>`<Row>${keys.map(key=>cell(row[key])).join('')}</Row>`).join('');
  const xml=`<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="11"/></Style><Style ss:ID="Header"><Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1"/><Interior ss:Color="#D9EAF7" ss:Pattern="Solid"/><Alignment ss:Vertical="Center"/></Style></Styles><Worksheet ss:Name="${income?'INGRESOS':'ENTREGAS'}"><Table>${columns}${table}</Table><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane></WorksheetOptions></Worksheet></Workbook>`;
  downloadBlob(new Blob(['\ufeff',xml],{type:'application/vnd.ms-excel;charset=utf-8'}),reportFileBase(kind)+'.xls');
}
  function pdfLiteral(value){return String(value??'').replace(/[–—]/g,'-').replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)').replace(/[^\x20-\x7E\xA0-\xFF]/g,'?').replace(/[\xA0-\xFF]/g,char=>'\\'+char.charCodeAt(0).toString(8).padStart(3,'0'))}
  function exportDeliveriesPdf(){return exportMovementPdf('delivery')}
  function exportIncomesPdf(){return exportMovementPdf('income')}
  function exportMovementPdf(kind){
  const income=kind==='income',rows=recentQueryRows(kind).map(income?incomeReportRow:deliveryReportRow);
  if(!rows.length)return alert('No hay '+(income?'ingresos':'entregas')+' para exportar con los filtros seleccionados.');
  const columns=[
    {label:'FECHA Y HORA',key:'fecha',width:66},
    {label:'ELEMENTO / ACTIVO',key:'elementoActivo',width:120},
    {label:'CANT.',key:'cantidad',width:34},
    {label:income?'QUIÉN TRAE / DOCUMENTO':'FUNCIONARIO / DOCUMENTO',key:'funcionarioDocumento',width:125},
    {label:'EMPRESA',key:'empresa',width:62},
    {label:'ÁREA',key:'area',width:92},
    {label:'BODEGUERO/A DE TURNO',key:'turno',width:55},
    {label:'REGISTRADO POR',key:'entrego',width:50},
    {label:income?'MINA DE ORIGEN':'DESTINO',key:income?'origen':'destino',width:70},
    {label:'OBSERVACIONES',key:'observaciones',width:108}
  ];
  const reportRows=rows.map(row=>({...row,elementoActivo:row.elemento+(row.activo?'\n'+row.activo:'')+(income?(row.tipoIngreso?'\nTipo de ingreso: '+row.tipoIngreso:''):(row.tipoEntrega?'\nTipo de entrega: '+row.tipoEntrega:'')),funcionarioDocumento:row.funcionario+'\n'+row.documento,observaciones:[!income&&row.reposicion!=='No aplica'?'Trae reposición: '+row.reposicion:'',row.observaciones].filter(Boolean).join('\n')}));
  const pageWidth=842,pageHeight=595,left=30,right=30,top=540,bottom=32,lineHeight=8,padding=3,fontSize=6.2;
  const wrap=(value,width)=>{
    const text=String(value??'').trim(),max=Math.max(4,Math.floor((width-padding*2)/(fontSize*.54))),paragraphs=text.split(/\n/),lines=[];
    for(const paragraph of paragraphs){
      const words=paragraph.split(/\s+/).filter(Boolean);
      if(!words.length){lines.push('');continue}
      let line='';
      for(let word of words){
        while(word.length>max){if(line){lines.push(line);line=''}lines.push(word.slice(0,max));word=word.slice(max)}
        if(!line)line=word;
        else if((line+' '+word).length<=max)line+=' '+word;
        else{lines.push(line);line=word}
      }
      if(line)lines.push(line);
    }
    return lines.length?lines:[''];
  };
  const textCommand=(text,x,y,size=fontSize,bold=false)=>`BT /${bold?'F2':'F1'} ${size} Tf 1 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)} Tm (${pdfLiteral(text)}) Tj ET`;
  const rectCommand=(x,y,width,height,fill=false)=>fill?`0.90 0.94 0.97 rg ${x.toFixed(1)} ${y.toFixed(1)} ${width.toFixed(1)} ${height.toFixed(1)} re f 0 g 0 G`:`0.65 G 0.45 w ${x.toFixed(1)} ${y.toFixed(1)} ${width.toFixed(1)} ${height.toFixed(1)} re S 0 G`;
  const drawTableRow=(values,yTop,isHeader=false)=>{
    const wrapped=columns.map(column=>wrap(values[column.key]??'',column.width));
    const height=Math.max(isHeader?2:1,...wrapped.map(lines=>lines.length))*lineHeight+padding*2;
    let x=left,commands=[];
    columns.forEach((column,index)=>{
      const yBottom=yTop-height;
      if(isHeader)commands.push(rectCommand(x,yBottom,column.width,height,true));
      commands.push(rectCommand(x,yBottom,column.width,height,false));
      wrapped[index].forEach((line,lineIndex)=>commands.push(textCommand(line,x+padding,yTop-padding-fontSize-lineIndex*lineHeight,fontSize,isHeader)));
      x+=column.width;
    });
    return{height,commands};
  };
  const from=$('#'+kind+'DateFrom')?.value||'inicio',to=$('#'+kind+'DateTo')?.value||'hoy',fromTime=$('#'+kind+'TimeFrom')?.value||'',toTime=$('#'+kind+'TimeTo')?.value||'',filterText=`RANGO: ${from} ${fromTime} A ${to} ${toTime}  |  ${recentFilterLabel(kind).toUpperCase()}`,filterLines=wrap(filterText,(pageWidth-left-right)*fontSize/8),tableTop=top-(filterLines.length-1)*10,pages=[];
  let commands=[],y=tableTop;
  const beginPage=()=>{
    commands=[
      textCommand((income?'INGRESOS':'ENTREGAS')+' PLAZA BLENDING',left,568,13,true),
      ...filterLines.map((line,index)=>textCommand(line,left,552-index*10,8,false)),
      textCommand(`REGISTROS: ${rows.length}`,pageWidth-right-100,568,8,true)
    ];
    const headerValues={};columns.forEach(column=>headerValues[column.key]=column.label);
    const header=drawTableRow(headerValues,y,true);commands.push(...header.commands);y-=header.height;
  };
  const finishPage=()=>{pages.push(commands.join('\n'));commands=[]};
  beginPage();
  for(const row of reportRows){
    const preview=drawTableRow(row,y,false);
    if(y-preview.height<bottom){finishPage();y=tableTop;beginPage()}
    const rendered=drawTableRow(row,y,false);commands.push(...rendered.commands);y-=rendered.height;
  }
  finishPage();
  pages.forEach((page,index)=>{pages[index]=page+'\n'+textCommand(`PÁGINA ${index+1} DE ${pages.length}`,pageWidth/2-28,16,7,false)});
  const objectCount=4+pages.length*2,objects=new Array(objectCount+1),fontId=3+pages.length*2,fontBoldId=fontId+1;
  objects[1]='<< /Type /Catalog /Pages 2 0 R >>';
  const kids=[];
  pages.forEach((stream,index)=>{
    const pageId=3+index*2,contentId=pageId+1;
    kids.push(pageId+' 0 R');
    objects[pageId]=`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontId} 0 R /F2 ${fontBoldId} 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId]=`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });
  objects[2]=`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>`;
  objects[fontId]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objects[fontBoldId]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  let pdf='%PDF-1.4\n',offsets=[0];
  for(let id=1;id<=objectCount;id++){offsets[id]=pdf.length;pdf+=`${id} 0 obj\n${objects[id]}\nendobj\n`}
  const xref=pdf.length;
  pdf+=`xref\n0 ${objectCount+1}\n0000000000 65535 f \n`;
  for(let id=1;id<=objectCount;id++)pdf+=String(offsets[id]).padStart(10,'0')+' 00000 n \n';
  pdf+=`trailer\n<< /Size ${objectCount+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  downloadBlob(new Blob([pdf],{type:'application/pdf'}),reportFileBase(kind)+'.pdf');
}
  function reversalAppearance(row){return row.reversed===true||row.reversado===true?' style="background:#fff3cd;border-left:4px solid #b7791f"':row.movementType==='REVERSIÓN'?' style="background:#e9f6ed;border-left:4px solid #2f855a"':''}
  function reversalStatus(row){return row.movementType==='REVERSIÓN'?`<span>Movimiento original: ${esc(new Date(row.originalCreatedAt).toLocaleString('es-CO'))}</span>`:row.reversed===true||row.reversado===true?`<span><b>REVERSADO</b>${row.reversedAt?' · '+esc(new Date(row.reversedAt).toLocaleString('es-CO')):''}</span>`:''}
  function reversalRequester(row){return row.reversalRequestedBy?`<span><b>Reversión solicitada por:</b> ${esc(row.reversalRequestedBy)}</span>`:''}
  function reversalBalance(row){return `<span><b>Saldo:</b> ${esc(row.balanceBefore)} · <b>${row.stockDelta>0?'+ Cantidad reintegrada:':'− Cantidad retirada:'}</b> ${esc(row.quantity)} · <b>Nuevo saldo:</b> ${esc(row.balanceAfter)}</span>`}
  function movementPeople(row,operatorName){
    const original=row.movementType==='REVERSIÓN';
    return `<span>Bodeguero/a de turno${original?' del movimiento original':''}: ${esc(row.shiftKeeperName||row.shiftKeeperDocument||'Sin dato histórico')}</span><span>${original?'Movimiento original registrado por':'Registrado por'}: ${esc(operatorName)}</span>`;
  }
  function movementPeopleFromPersonal(row){const people=data.personal||[],document=String(row.actorDocument||row.operatorDocument||''),operator=(document?people.find(person=>String(person.documento||'')===document):null)||people.find(person=>person.id===row.operatorId);return movementPeople(row,operator?.nombre||row.operatorName||document||'No informado')}
  function movementSyncStatus(row){return row.syncState==='pending'?`<span><b>PENDIENTE DE SINCRONIZACIÓN</b>${row.syncError?' · '+esc(row.syncError):''}</span>`:''}
  const wideQueries=window.matchMedia?.('(min-width: 1000px)');
  const recentDateFormat=new Intl.DateTimeFormat('es-CO',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Bogota'});
  function recentHeaderButton(kind,key,title){
    const order=recentOrder[kind],index=order.findIndex(entry=>entry.key===key);
    const dir=activeRecentOrder(kind).find(entry=>entry.key===key)?.dir;
    const name=key==='balance'?'Saldo nuevo':title;
    const hint=index<0?'Ordenar por '+name+' en orden ascendente':
      name+', prioridad '+(index+1)+'. Cambiar a '+(dir===1?'descendente':'ascendente');
    const arrow=dir===1?'↑':dir===-1?'↓':'↕';
    return '<button type="button" data-recent-sort="'+key+'" title="'+hint+'" aria-label="'+hint+'">'+
      title+' <span aria-hidden="true">'+arrow+(index<0?'':'<sup>'+(index+1)+'</sup>')+'</span></button>';
  }
  function recentMovementTable(kind,rows,people,dateLabel){
    const delivery=kind==='delivery',columns=recentColumns(kind),primary=activeRecentOrder(kind)[0];
    const head=Object.entries(columns).map(([key,title])=>{
      const aria=key===primary.key?' aria-sort="'+(primary.dir===1?'ascending':'descending')+'"':'';
      return '<th scope="col"'+aria+'>'+recentHeaderButton(kind,key,title)+'</th>';
    }).join('');
    const line=value=>value?'<span>'+esc(value)+'</span>':'';
    const body=rows.map(row=>{
      const detail=recentDetails(kind,row,people);
      const replacement=delivery?deliveryReplacementLabel(row):'';
      const isReversal=row.movementType==='REVERSIÓN';
      const asset=row.assetId||row.assetLabel?movementAssetLabel(row):'';
      const element='<strong>'+esc((isReversal?'REVERSIÓN · ':'')+movementItem(row))+'</strong>'+
        line(asset)+line(delivery?row.deliveryType:row.incomeType)+line(row.destination)+
        line(replacement?'Trae reposición: '+replacement:'')+line(row.notes)+
        (delivery?line(loanReturnSummary(row)):'')+reversalStatus(row)+reversalRequester(row)+
        (isReversal?line('Bodeguero y registro del movimiento original'):'')+movementSyncStatus(row);
      const balances=delivery||isReversal?
        (row.balanceBefore!=null?line('Anterior: '+row.balanceBefore):'')+
        (row.balanceAfter!=null?line('Nuevo: '+row.balanceAfter):''):'';
      const quantity=esc(row.quantity??'—')+(isReversal?line(row.stockDelta>0?'Reintegrada':'Retirada'):'');
      const values=[esc(dateLabel(row)),element,quantity,
        (balances+(!delivery?line(row.originMine):''))||'—',
        line(detail.person||row.destinationMine||'No informado')+line(detail.document),line(detail.company||'No informada')+line(detail.area),
        line(detail.keeper||'Sin dato histórico'),line(detail.operator||'No informado')];
      return '<tr'+reversalAppearance(row)+'>'+values.map(value=>'<td>'+value+'</td>').join('')+'</tr>';
    }).join('');
    const title=delivery?'Entregas recientes':'Ingresos recientes';
    return '<div class="recentTableScroll" tabindex="0" role="region" aria-label="'+title+'"><table aria-label="'+title+'"><thead><tr>'+head+'</tr></thead><tbody>'+body+'</tbody></table></div>';
  }
  wideQueries?.addEventListener('change',()=>{if($('#app')&&!$('#app').hidden)renderRecentQueries()});
  function renderRecentQueries(){const deliveries=$('#recentDeliveriesList'),incomes=$('#recentIncomesList');if(!deliveries||!incomes)return;const directory=recentPeople(),people=directory.byId,peopleByDocument=directory.byDocument;
    const deliveryRows=recentQueryRows('delivery',directory),incomeRows=recentQueryRows('income',directory),dateLabel=row=>{const date=movementDate(row);return date?recentDateFormat.format(date):'—'};const deliveryRange=recentDateRange('delivery'),incomeRange=recentDateRange('income');$('#recentDeliveriesCount').textContent=deliveryRange.from&&deliveryRange.to&&deliveryRange.from>deliveryRange.to?'La fecha inicial debe ser anterior o igual a la fecha final.':`${deliveryRows.length} ${deliveryRows.length===1?'entrega encontrada':'entregas encontradas'} · ${recentFilterLabel('delivery')}`;deliveries.innerHTML=wideQueries?.matches&&deliveryRows.length?recentMovementTable('delivery',deliveryRows,directory,dateLabel):deliveryRows.map(row=>{const person=people.get(row.recipientId),operatorDocument=String(row.actorDocument||row.operatorDocument||''),operator=peopleByDocument.get(operatorDocument)||people.get(row.operatorId),operatorName=operator?.nombre||row.operatorName||operatorDocument||'No informado';return `<article${reversalAppearance(row)}><div><b>${row.movementType==='REVERSIÓN'?'REVERSIÓN · ':''}${esc(movementItem(row))}</b>${reversalStatus(row)}${row.movementType==='REVERSIÓN'?reversalBalance(row):!row.assetId&&Number.isFinite(Number(row.balanceBefore))&&Number.isFinite(Number(row.balanceAfter))?`<span><b>Saldo:</b> ${esc(row.balanceBefore)} · <b>− Cantidad entregada:</b> ${esc(row.quantity||0)} · <b>Nuevo saldo:</b> ${esc(row.balanceAfter)}</span>`:''}<span>${esc(dateLabel(row))}</span>${deliveryReplacementLabel(row)?`<span>Trae reposición: ${esc(deliveryReplacementLabel(row))}</span>`:''}${movementSyncStatus(row)}<span>Recibe: ${esc(person?.nombre||row.recipientName||'No informado')}</span><span>Documento: ${esc(person?.documento||row.recipientDocument||'No informado')}</span><span>Empresa: ${esc(row.recipientCompany||person?.empresa||'No informada')}</span><span>Área: ${esc(person?.area||'No informada')}</span>${reversalRequester(row)}${movementPeople(row,operatorName)}${row.assetLabel?`<span>Activo específico: ${esc(movementAssetLabel(row))}</span>`:''}${row.assetId||row.deliveryType?`<span>Tipo de entrega: ${esc(row.deliveryType||'No especificado')}</span>`:''}${row.destination?`<span>Destino: ${esc(row.destination)}</span>`:''}${loanReturnSummary(row)?`<span>${esc(loanReturnSummary(row))}</span>`:''}</div></article>`}).join('')||'<p class="permission">No hay entregas que coincidan con el rango y los filtros seleccionados.</p>';$('#recentIncomesCount').textContent=incomeRange.from&&incomeRange.to&&incomeRange.from>incomeRange.to?'La fecha inicial debe ser anterior o igual a la fecha final.':`${incomeRows.length} ${incomeRows.length===1?'ingreso encontrado':'ingresos encontrados'} · ${recentFilterLabel('income')}`;incomes.innerHTML=wideQueries?.matches&&incomeRows.length?recentMovementTable('income',incomeRows,directory,dateLabel):incomeRows.map(row=>`<article${reversalAppearance(row)}><div><b>${row.movementType==='REVERSIÓN'?'REVERSIÓN · ':''}${esc(movementItem(row))}</b><span>${esc(dateLabel(row))} · Cantidad: ${esc(row.quantity||1)}</span>${reversalStatus(row)}${row.movementType==='REVERSIÓN'?reversalBalance(row)+reversalRequester(row):''}${movementPeopleFromPersonal(row)}${movementSyncStatus(row)}${row.assetLabel?`<span>${esc(movementAssetLabel(row))}</span>`:''}${row.incomeType?`<span>${esc(row.incomeType)} · Mina de origen: ${esc(row.originMine)}</span>`:''}${row.notes?`<span>Observaciones: ${esc(row.notes)}</span>`:''}</div></article>`).join('')||'<p class="permission">No hay ingresos que coincidan con el rango y los filtros seleccionados.</p>';
    updateRecentSort('delivery');updateRecentSort('income');
  }
  function recentControls(kind){
    const categories=kind==='delivery'?['all','epp','assets','reversals']:['all','reversals'];
    const choices=categories.map(key=>'<label><input type="radio" name="'+kind+'Category" value="'+key+'"'+
      (key==='all'?' checked':'')+'><span>'+categoryLabels[key].toLocaleUpperCase('es')+'</span></label>').join('');
    return '<fieldset id="'+kind+'CategoryFilter" class="deliveryCategoryFilter"><legend>MOSTRAR</legend>'+
      '<div class="deliveryCategoryOptions">'+choices+'</div></fieldset>';
  }
  function setupRecentSort(kind){
    const list=$('#'+(kind==='delivery'?'recentDeliveriesList':'recentIncomesList'));
    const controls=document.createElement('div');
    controls.className='recentSortControls';controls.id=kind+'SortControls';
    controls.setAttribute('role','group');controls.setAttribute('aria-label','Ordenar por columna');
    const status=document.createElement('div');status.id=kind+'SortStatus';status.className='recentSortStatus';
    status.tabIndex=-1;status.setAttribute('aria-label','Prioridad de orden');
    list.before(status,controls);
    const section=list.closest('section');
    section.addEventListener('click',event=>{
      const button=event.target.closest('[data-recent-sort],[data-priority]');
      if(!button)return;
      const key=button.dataset.recentSort||button.dataset.key,action=button.dataset.priority;
      const scroll=list.querySelector('.recentTableScroll')?.scrollLeft;
      if(action)changeRecentPriority(kind,key,action);
      else recentSort(kind,key);
      renderRecentQueries();
      const table=list.querySelector('.recentTableScroll');
      if(table&&scroll!=null)table.scrollLeft=scroll;
      let focus;
      if(action){
        focus=status.querySelector('[data-key="'+key+'"][data-priority="'+action+'"]:enabled')||
          status.querySelector('[data-key="'+key+'"]:enabled')||status.querySelector('button:enabled')||status;
      }else{
        focus=(wideQueries?.matches?list:controls).querySelector('[data-recent-sort="'+key+'"]');
      }
      focus?.focus({preventScroll:true});
    });
  }
  function updateRecentSort(kind){
    const order=recentOrder[kind],columns=recentColumns(kind);
    const controls=$('#'+kind+'SortControls');
    const headers=Object.entries(columns).map(([key,title])=>recentHeaderButton(kind,key,title)).join('');
    if(controls.innerHTML!==headers)controls.innerHTML=headers;
    const entries=order.map(({key},index)=>{
      const name=key==='balance'?'Saldo nuevo':columns[key];
      const control=(action,symbol,label)=>'<button type="button" data-key="'+key+'" data-priority="'+action+
        '" title="'+label+'" aria-label="'+label+'">'+symbol+'</button>';
      return '<span class="recentSortEntry"><span>'+(index+1)+'. '+name+'</span>'+
        (index>0?control('left','←','Subir prioridad de '+name):'')+
        (index+1<order.length?control('right','→','Bajar prioridad de '+name):'')+
        control('remove','×','Quitar '+name+' del orden')+'</span>';
    });
    const status=$('#'+kind+'SortStatus');
    const line='<span>Orden:</span> '+(entries.join(' ')||'Más recientes primero')+
      (recentCategory(kind)==='reversals'?'<span>Cada par se ordena por la reversión. Incluye ambos movimientos si uno está en el rango.</span>':'');
    if(status.innerHTML!==line)status.innerHTML=line;
  }
  function setupQueryMenu(){if(!$('#recentDeliveries')){const contacts=$('#contacts'),delivery=document.createElement('section'),income=document.createElement('section');delivery.id='recentDeliveries';delivery.className='view recentMovements';delivery.innerHTML='<div class="deliveryQueryTitle"><h2>ENTREGAS RECIENTES</h2><button type="button" id="clearDeliveryFilters">LIMPIAR FILTROS</button></div><div class="deliveryQueryFilters"><label>DESDE FECHA<input id="deliveryDateFrom" type="date"></label><label>DESDE HORA<input id="deliveryTimeFrom" type="time"></label><label>HASTA FECHA<input id="deliveryDateTo" type="date"></label><label>HASTA HORA<input id="deliveryTimeTo" type="time"></label><form id="deliveryHistoryQueryForm" class="recentElementFilter"><label>FILTRAR POR ELEMENTO<select name="itemId"></select></label></form>'+recentControls('delivery')+'<div class="deliveryExportActions"><button type="button" id="exportDeliveriesExcel">DESCARGAR EXCEL</button><button type="button" id="exportDeliveriesPdf">DESCARGAR PDF</button></div></div><p id="recentDeliveriesCount" class="permission"></p><div id="recentDeliveriesList" class="recentMovementList"></div>';income.id='recentIncomes';income.className='view recentMovements';income.innerHTML='<div class="deliveryQueryTitle"><h2>INGRESOS RECIENTES</h2><button type="button" id="clearIncomeFilters">LIMPIAR FILTROS</button></div><div class="deliveryQueryFilters"><label>DESDE FECHA<input id="incomeDateFrom" type="date"></label><label>DESDE HORA<input id="incomeTimeFrom" type="time"></label><label>HASTA FECHA<input id="incomeDateTo" type="date"></label><label>HASTA HORA<input id="incomeTimeTo" type="time"></label><form id="incomeHistoryQueryForm" class="recentElementFilter"><label>FILTRAR POR ELEMENTO<select name="itemId"></select></label></form>'+recentControls('income')+'<div class="deliveryExportActions"><button type="button" id="exportIncomesExcel">DESCARGAR EXCEL</button><button type="button" id="exportIncomesPdf">DESCARGAR PDF</button></div></div><p id="recentIncomesCount" class="permission"></p><div id="recentIncomesList" class="recentMovementList"></div>';contacts.after(delivery,income)}if(!$('#queryMenuStyle')){const style=document.createElement('style');style.id='queryMenuStyle';style.textContent='.queryMenuGrid{display:grid;grid-template-columns:1fr;gap:12px}.queryMenuGrid button{min-height:70px;font-size:1.02rem;background:linear-gradient(145deg,#f4f5f6,#d5dade);color:#263642;border:1px solid #c4cacf}.recentMovementList{display:grid;gap:10px}.recentMovementList article{border:1px solid #d7e0e7;border-radius:10px;padding:12px;background:#fff}.recentMovementList article>div{display:grid;gap:4px}.recentMovementList span{color:#52687a}.deliveryQueryFilters{display:grid;grid-template-columns:repeat(2,minmax(150px,1fr));gap:12px;margin:12px 0 16px}.deliveryQueryFilters label{display:flex;flex-direction:column;gap:6px;font-weight:800}.recentElementFilter{grid-column:1/-1;min-width:0}.deliveryCategoryFilter{grid-column:1/-1;min-width:0;margin:0;padding:0;border:0}.deliveryCategoryFilter legend{font-weight:800;font-size:.85rem;margin-bottom:7px;padding:0}.deliveryCategoryOptions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;padding:5px;background:#edf2f6;border:1px solid #d7e0e7;border-radius:10px}.deliveryCategoryOptions label{position:relative;min-width:0;cursor:pointer}.deliveryCategoryOptions input{position:absolute;opacity:0;width:1px;height:1px;margin:0}.deliveryCategoryOptions span{display:flex;align-items:center;justify-content:center;min-height:42px;padding:7px 5px;border:1px solid transparent;border-radius:7px;text-align:center;color:#334e62;font-size:.82rem;line-height:1.2;box-sizing:border-box}.deliveryCategoryOptions input:checked+span{background:#173d59;color:#fff;border-color:#173d59;box-shadow:0 1px 3px #173d5926}.deliveryCategoryOptions input:focus-visible+span{outline:3px solid #e7b45a;outline-offset:2px}.deliveryQueryTitle{display:flex;align-items:center;justify-content:space-between;gap:12px}.deliveryQueryTitle h2{margin:0}.deliveryQueryTitle button{width:auto;min-height:38px;padding:8px 14px;background:#eef3f7;color:#173d59;border:1px solid #b9c8d3;font-weight:800}.deliveryExportActions{grid-column:1/-1;display:flex;gap:10px;flex-wrap:wrap}.deliveryExportActions button{flex:1;min-width:160px;color:#fff}.deliveryExportActions #exportDeliveriesExcel,.deliveryExportActions #exportIncomesExcel{background:#217346;border:1px solid #185c37}.deliveryExportActions #exportDeliveriesExcel:hover,.deliveryExportActions #exportDeliveriesExcel:focus-visible,.deliveryExportActions #exportIncomesExcel:hover,.deliveryExportActions #exportIncomesExcel:focus-visible{background:#185c37}.deliveryExportActions #exportDeliveriesPdf,.deliveryExportActions #exportIncomesPdf{background:#c62828;border:1px solid #a91f1f}.deliveryExportActions #exportDeliveriesPdf:hover,.deliveryExportActions #exportDeliveriesPdf:focus-visible,.deliveryExportActions #exportIncomesPdf:hover,.deliveryExportActions #exportIncomesPdf:focus-visible{background:#a91f1f}@media(max-width:600px){.deliveryQueryFilters{grid-template-columns:1fr}.recentElementFilter,.deliveryCategoryFilter,.deliveryExportActions{grid-column:1}.deliveryExportActions{flex-direction:column}}';document.head.append(style)}const overlay=document.createElement('div');overlay.id='plazaQueryMenu';overlay.className='registerMenuOverlay';overlay.hidden=true;overlay.innerHTML='<div class="registerMenu"><div class="registerMenuHead"><h2>HACER CONSULTAS</h2><button type="button" data-close-query aria-label="Volver a Inicio">VOLVER</button></div><p>SELECCIONA LA CONSULTA.</p><div class="queryMenuGrid"><button type="button" data-query-view="stockQuery">CONSULTAR EXISTENCIAS</button><button type="button" data-query-view="contacts">PERSONAL</button><button type="button" data-query-view="loanHistory">PRÉSTAMOS Y DEVOLUCIONES</button><button type="button" data-query-view="recentDeliveries">ENTREGAS RECIENTES <small>ÚLTIMOS 7 DÍAS</small></button><button type="button" data-query-view="recentIncomes">INGRESOS RECIENTES <small>ÚLTIMOS 30 DÍAS</small></button></div></div>';document.body.append(overlay);const close=()=>{overlay.hidden=true};overlay.addEventListener('click',event=>{if(event.target===overlay||event.target.closest('[data-close-query]'))close();const button=event.target.closest('[data-query-view]');if(button){close();showView(button.dataset.queryView)}});for(const kind of ['delivery','income']){const form=$('#'+kind+'HistoryQueryForm');setupItemSearch(form,'Filtrar '+(kind==='delivery'?'entregas':'ingresos')+' por elemento');form.addEventListener('submit',event=>event.preventDefault());form.addEventListener('change',renderRecentQueries);resetRecentFilters(kind);$('#clear'+(kind==='delivery'?'Delivery':'Income')+'Filters').addEventListener('click',()=>{resetRecentFilters(kind);renderRecentQueries()});for(const field of ['DateFrom','TimeFrom','DateTo','TimeTo'])$('#'+kind+field).addEventListener('change',renderRecentQueries);
    setupRecentSort(kind);$('#'+kind+'CategoryFilter').addEventListener('change',renderRecentQueries)
  }$('#exportDeliveriesExcel').addEventListener('click',exportDeliveriesExcel);$('#exportDeliveriesPdf').addEventListener('click',exportDeliveriesPdf);$('#exportIncomesExcel').addEventListener('click',exportIncomesExcel);$('#exportIncomesPdf').addEventListener('click',exportIncomesPdf);let scrollTop=$('#deliveryScrollTop');if(!scrollTop){scrollTop=document.createElement('button');scrollTop.id='deliveryScrollTop';scrollTop.type='button';scrollTop.hidden=true;scrollTop.textContent='↑';scrollTop.setAttribute('aria-label','Volver al inicio de Entregas recientes');scrollTop.title='Volver arriba';document.body.append(scrollTop);scrollTop.addEventListener('click',()=>window.scrollTo({top:0,behavior:'smooth'}));window.addEventListener('scroll',()=>{scrollTop.hidden=!(currentView==='recentDeliveries'&&window.scrollY>480)},{passive:true})}window.openPlazaQueryMenu=()=>{showView('home');overlay.hidden=false}}
  let historyPersonId='';
  const validQueryRow=row=>!row.deleted&&!row.reversed&&!row.reversado;
  function queryPerson(row){return(data.personal||[]).find(person=>person.id===row.recipientId||person.id===row.broughtById)||null}
  function queryMatchesPerson(row,id){const person=(data.personal||[]).find(p=>p.id===id);return row.recipientId===id||row.broughtById===id||row.returnedById===id||Boolean(person?.documento&&[row.recipientDocument,row.broughtByDocument,row.returnedByDocument].includes(person.documento))}
  function queryMatchesItem(row,id){if(row.itemId)return String(row.itemId)===String(id);const item=findItem(id),asset=(data.assets||[]).find(a=>a.id===row.assetId);return Boolean(item&&norm(row.itemName||asset?.clase)===norm(itemName(item)))}
  function personHistoryRows(){
    const itemId=$('#personQueryForm').elements.itemId.value;
    const fromValue=$('#personFrom').value,toValue=$('#personTo').value;
    const from=fromValue?new Date(fromValue+'T00:00:00'):null,to=toValue?new Date(toValue+'T23:59:59.999'):null;
    if(!historyPersonId||from&&to&&from>to)return [];
    return (data.blendingDeliveries||[]).filter(row=>{
      const date=movementDate(row);
      return row.movementType!=='DEVOLUCIÓN'&&(validQueryRow(row)||!row.deleted&&row.reversalMovementId)&&date&&
        queryMatchesPerson(row,historyPersonId)&&(!itemId||queryMatchesItem(row,itemId))&&(!from||date>=from)&&(!to||date<=to);
    }).map(row=>({...row,queryType:row.movementType==='REVERSIÓN'?'REVERSIÓN':row.deliveryType||'ENTREGA'}))
      .sort((a,b)=>movementDate(b)-movementDate(a));
  }
  function queryMovementCard(row){if(row.movementType==='REVERSIÓN')return `<article${reversalAppearance(row)}><div><b>REVERSIÓN · ${esc(movementItem(row))}</b><span>${esc(movementDate(row)?.toLocaleString('es-CO'))}</span>${reversalBalance(row)}${reversalStatus(row)}${reversalRequester(row)}${movementPeopleFromPersonal(row)}</div></article>`;const person=queryPerson(row),name=row.queryType==='INGRESO'?(row.broughtByName||person?.nombre):(row.recipientName||person?.nombre),unit=findItem(row.itemId)?.unit||findItem(row.itemId)?.CI_UNIDAD_MEDIDA||'unidades';return `<article${reversalAppearance(row)}><div><b>${esc(row.queryType)} · ${esc(movementItem(row))}</b>${reversalStatus(row)}<span>${esc(movementDate(row)?.toLocaleString('es-CO'))} · Cantidad: ${esc(row.quantity??1)} ${esc(unit)}</span><span>${row.queryType==='INGRESO'?'Trae':'Recibe'}: ${esc(name||'No informado')} · Documento: ${esc(person?.documento||row.recipientDocument||row.broughtByDocument||'No informado')}</span>${!['INGRESO','DEVOLUCIÓN'].includes(row.queryType)?`<span>Empresa receptora: ${esc(String(row.recipientCompany||'').trim()||'Sin empresa registrada')}</span>`:''}${deliveryReplacementLabel(row)?`<span>Trae reposición: ${esc(deliveryReplacementLabel(row))}</span>`:''}${row.assetLabel?`<span>Activo: ${esc(movementAssetLabel(row))}</span>`:''}${row.destination?`<span>Destino: ${esc(row.destination)}</span>`:''}${row.notes?`<span>Observaciones: ${esc(row.notes)}</span>`:''}${loanReturnSummary(row)?`<span>${esc(loanReturnSummary(row))}</span>`:''}${movementPeopleFromPersonal(row)}${movementSyncStatus(row)}</div></article>`}
  function queryStock(item){if(!isFixedItem(item))return itemAvailability(item);return(data.assets||[]).filter(asset=>norm(asset.clase)===norm(itemName(item))&&assetAvailableForDelivery(asset)).length}
  let stockGroup='',stockRootFilter='';
  const stockBalances=new Map();
  function stockEntries(items,group,query){
    const groups=window.SKSpareGroups;
    const catalog=items.filter(item=>item.id&&!item.deleted&&item.active!==false&&item.recordType!=='formOptions'&&item.id!=='SYSTEM-FORM-OPTIONS-V1');
    if(group)return groups.parts(catalog,group,query).map(item=>({item}));
    const groupTypes=new Set(catalog.map(groups.key));
    const folderText=value=>norm(value).replace(/(yt|columna)\s+(?=\d)/g,'$1').replace(/\brepuestos\b/g,'repuesto');
    const words=folderText(query).split(/\s+/);
    const folders=groups.types.filter(type=>groupTypes.has(type)&&words.every(word=>folderText(groups.groupName(type)).includes(word)));
    const common=catalog.filter(item=>!groups.key(item)&&groups.matches(item,query))
      .sort((a,b)=>recentCollator.compare(itemName(a),itemName(b)));
    return [...folders.map(type=>({type})),...common.map(item=>({item}))];
  }
  function renderStockList(){
    const groups=window.SKSpareGroups,search=$('#stockSearch');
    $('#stockQueryTitle').textContent=stockGroup?groups.groupName(stockGroup):'CONSULTAR EXISTENCIAS';
    search.placeholder=stockGroup?'Buscar por ítem, código o nombre…':'Buscar elemento o carpeta…';
    const entries=stockEntries(data.inventoryCriteria||[],stockGroup,search.value);
    const rows=entries.map(({type,item})=>{
      const row=document.createElement('tr');
      if(type){
        const cell=row.insertCell();cell.colSpan=4;
        const button=document.createElement('button');button.type='button';button.dataset.stockGroup=type;
        const folder=document.createElement('span');folder.textContent='📂';folder.setAttribute('aria-hidden','true');
        button.append(folder,groups.groupName(type));cell.append(button);return row;
      }
      const name=stockGroup?groups.partName(item):itemName(item);
      const label=row.insertCell();label.textContent=name;
      label.insertAdjacentHTML('beforeend',groups.aliasLine(item,search.value));
      if(stockGroup&&item.sparePartCode){
        const code=document.createElement('small');code.textContent='Código: '+item.sparePartCode;label.append(code);
      }
      row.insertCell().textContent=item.unit||item.unidadMedida||item.CI_UNIDAD_MEDIDA||'Unidad';
      if(!stockBalances.has(item.id))stockBalances.set(item.id,queryStock(item));
      row.insertCell().textContent=stockBalances.get(item.id);
      row.insertCell().append(window.SKInventoryReference.link(item.referenceUrl,name));return row;
    });
    $('#stockQuery tbody').replaceChildren(...rows);
    const empty=$('#stockEmpty');empty.hidden=rows.length>0;
    empty.textContent=search.value.trim()?'No hay coincidencias en esta lista.':'No hay elementos en esta lista.';
  }
  function changeStockGroup(type){
    const search=$('#stockSearch'),previous=stockGroup;
    if(type)stockRootFilter=search.value;
    stockGroup=type;search.value=type?'':stockRootFilter;
    renderStockList();paintPlazaNavigation();
    if(type)$('#stockQueryTitle').focus();
    else ($('#stockQuery [data-stock-group="'+previous+'"]')||search).focus();
  }
  function queryAssignedAssets(){const person=(data.personal||[]).find(p=>p.id===historyPersonId);return(data.assets||[]).map(asset=>window.SKAssetHistory.project(asset,data).asset).filter(asset=>validQueryRow(asset)&&!isRetired(asset)&&norm(asset.ubicacion)!=='bodega de superficie'&&(String(asset.asignadaId||'')===historyPersonId||person?.documento&&String(asset.documentoAsignado||'')===String(person.documento)))}
  function renderInventoryQueries(){
    if(currentView==='stockQuery'){stockBalances.clear();renderStockList();return}
    if(currentView!=='personHistory')return;
    const form=$('#personQueryForm'),select=form.elements.itemId,selected=select.value,items=deliveryItems();
    select.innerHTML=options(items,itemName);
    if(selected&&!items.some(item=>item.id===selected)){
      const item=findItem(selected);if(item)select.add(new Option(itemName(item),selected));
    }
    select.value=selected;
    const label=select.closest('label');if(!label.classList.contains('isOpen'))label._refreshItemSearch?.();
    const rows=personHistoryRows(),from=$('#personFrom').value,to=$('#personTo').value,invalid=from&&to&&from>to;
    $('#personQueryStatus').textContent=invalid?'La fecha inicial debe ser anterior o igual a la fecha final.':!historyPersonId?'Selecciona un funcionario.':
      rows.length+' movimientos encontrados · Datos de la última sincronización y registros locales pendientes.';
    $('#personMovements').innerHTML=historyPersonId&&!invalid?(rows.map(queryMovementCard).join('')||'<p>No hay movimientos en este rango.</p>'):'';
    const totals=new Map();
    for(const row of rows){
      if(['INGRESO','DEVOLUCIÓN','REVERSIÓN'].includes(row.queryType)||row.reversed===true||row.reversado===true)continue;
      const key=row.itemId||row.itemName,entry=totals.get(key)||{name:movementItem(row),quantity:0,count:0};
      entry.quantity+=Number(row.quantity??1)||0;entry.count++;totals.set(key,entry);
    }
    $('#personTotals').innerHTML=historyPersonId&&!invalid?'<h3>ELEMENTOS RECIBIDOS EN EL RANGO</h3>'+[...totals.values()].sort((a,b)=>b.quantity-a.quantity)
      .map(entry=>`<article><div><b>${esc(entry.name)}</b><span>Cantidad: ${esc(entry.quantity)} · Entregas: ${entry.count}</span></div></article>`).join(''):'';
    const person=(data.personal||[]).find(p=>p.id===historyPersonId);$('#personHistoryTitle').textContent=person?`ENTREGAS Y ASIGNACIONES · ${person.nombre||person.documento}`:'ENTREGAS Y ASIGNACIONES';
    const itemId=$('#personQueryForm').elements.itemId.value,assets=queryAssignedAssets().filter(asset=>!itemId||norm(asset.clase)===norm(itemName(findItem(itemId))));$('#personAssigned').innerHTML='<h3>ACTIVOS ASIGNADOS ACTUALMENTE</h3><p class="permission">Estado actual; el rango de fechas se aplica al historial de entregas.</p>'+assets.map(asset=>`<article><b>${esc(assetLabel(asset))}</b><span>${esc(asset.estado||'')} · ${esc(asset.ubicacion||'')}</span></article>`).join('')+(assets.length?'':'<p>No tiene activos asignados que coincidan.</p>');
  }
  function openPersonHistory(id){historyPersonId=id;clearItemSearch($('#personQueryForm'));resetInventoryDates('person');showView('personHistory')}
  function resetInventoryDates(prefix){const today=new Date(),start=new Date(today);start.setDate(start.getDate()-29);$('#'+prefix+'From').value=localDateValue(start);$('#'+prefix+'To').value=localDateValue(today)}
  function setupInventoryQueries(){
    $('#stockReferenceHeader').append(window.SKInventoryReference.heading());
    $('#stockSearch').addEventListener('input',renderStockList);
    $('#stockQuery tbody').addEventListener('click',event=>{
      const button=event.target.closest('[data-stock-group]');if(button)changeStockGroup(button.dataset.stockGroup);
    });
    const form=$('#personQueryForm');setupItemSearch(form,'Buscar elemento para consultar');
    form.addEventListener('submit',event=>event.preventDefault());
    form.addEventListener('change',renderInventoryQueries);resetInventoryDates('person');
    $('#personResetFilters').addEventListener('click',()=>{
      resetInventoryDates('person');clearItemSearch(form);renderInventoryQueries();
    });
    $('#backHistoryPeople').addEventListener('click',()=>showView('contacts'));
    const style=document.createElement('style');style.textContent='.recipientCompany{display:flex;gap:12px;border:1px solid #b9c8d3;border-radius:10px;padding:12px;grid-column:1/-1}.recipientCompany legend{font-weight:800}.recipientCompany label{flex:1;display:flex;align-items:center;gap:8px;padding:12px;border:1px solid #c4cacf;border-radius:8px;cursor:pointer}.recipientCompany input{width:20px;height:20px;margin:0}.recipientCompany label:has(input:checked){background:#e1eff8;border-color:#173d59}.inventoryQuery form{display:block}.inventoryQuery .recentMovementList{margin:16px 0}.stockBalance{font-weight:800;padding:16px;background:#eaf1f6;border-radius:10px}.inventoryQuery h3{margin-top:20px}';document.head.append(style);renderInventoryQueries();
  }

  injectItemSearchStyle();setupDeliveryForm();setupMovementHour();setupDeliveryAssetSearch();setupIncomeForm();setupItemSearch($('#deliveryForm'),'Buscar elemento a entregar');setupItemSearch($('#incomeForm'),'Buscar elemento a ingresar');renderDeliveryDraft();renderIncomeDraft();setupRegisterMenu();setupQueryMenu();setupInventoryQueries();setupSessionHeader();$('#sessionWelcomeStart').addEventListener('click',closeWelcomeMessage);$('#sessionWelcome').addEventListener('click',event=>{if(event.target.id==='sessionWelcome')closeWelcomeMessage()});
  window.SKPlaza={openPersonHistory,recipientDestinationChanged,post,getData:()=>data,getUser:()=>user,movementShift,movementTimes,resetMovementTime,saveData:persistLocalChange,sync,renderRecentQueries,refreshDelivery:updateDeliveryFields,updatePendingBadge,renderRecipients:null,validateDeliveryRecipient,validateIncomeCollaborator,resumeDeliveryAfterCollaborator:async()=>{if(!pendingDeliveryAfterCollaborator)return false;pendingDeliveryAfterCollaborator=false;return saveDeliveryBatch($('#deliveryForm'))}};
  const mineExitForm=window.SKPlazaMineExits.mount({...window.SKPlaza,uuid,esc,isFixedItem,itemName,assetLabel,assetSelectionLabel,assetAvailableForDelivery});
  $('#app').addEventListener('click',event=>{
    const action=event.target.closest('[data-exit-view]'),info=event.target.closest('[data-exit-help]');
    if(action)showView(action.dataset.exitView);
    if(info){const panel=document.getElementById(info.dataset.exitHelp);panel.hidden=!panel.hidden;info.setAttribute('aria-expanded',String(!panel.hidden))}
  });
  $('#incomeForm').addEventListener('submit',event=>{event.preventDefault();saveIncomeBatch(event.currentTarget)});
  $('#deliveryForm').addEventListener('submit',event=>{event.preventDefault();saveDeliveryBatch(event.currentTarget)});$('nav').addEventListener('click',event=>{const button=event.target.closest('[data-view]');if(!button)return;if(button.dataset.view==='home'){event.preventDefault();event.stopPropagation();discardAndGoHome()}else if(button.dataset.view==='contacts')window.openPlazaQueryMenu();else showView(button.dataset.view)});$('#home').addEventListener('click',event=>{const button=event.target.closest('[data-home-view]');if(!button)return;if(button.dataset.homeView==='income')window.openPlazaRegisterMenu();else if(button.dataset.homeView==='contacts')window.openPlazaQueryMenu();else showView(button.dataset.homeView)});$('#syncBtn').addEventListener('click',syncDataAndApp);$('#logoutBtn').addEventListener('click',logout);window.addEventListener('online',()=>sync(true));document.addEventListener('visibilitychange',refreshSharedData);window.addEventListener('focus',refreshSharedData);window.addEventListener('pageshow',refreshSharedData);setInterval(periodicSync,300000);setInterval(()=>{if(currentView==='income'||currentView==='delivery')refreshSharedData()},30000);showView('home');if(token&&user&&(window.SKEntry?.validLocal({token})??!token.startsWith('sk2.')))void openApp().catch(error=>{$('#login').hidden=false;$('#app').hidden=true;$('#loginStatus').textContent=error.message});
})();




