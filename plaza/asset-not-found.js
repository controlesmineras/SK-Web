// Registro local-first de un activo fijo que no aparece en Entregas.
(()=>{
'use strict';
const norm=value=>String(value||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const clean=value=>String(value||'').trim();
// La llegada inicial usa el día en Colombia, aunque el dispositivo tenga otra zona horaria.
const arrivalDateFormat=new Intl.DateTimeFormat('en-US',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'});
const initialArrivalDate=timestamp=>{const parts=Object.fromEntries(arrivalDateFormat.formatToParts(new Date(timestamp)).map(part=>[part.type,part.value]));return `${parts.year}-${parts.month}-${parts.day}`};
const uuid=()=>crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`;
const itemName=item=>clean(item?.name||item?.element||item?.nombre||item?.elemento||item?.CI_ELEMENTO);
const flag=(item,key,legacy)=>{const value=item?.[key]??item?.[legacy];return value===true||['true','si','sí','1','yes'].includes(norm(value))};
const isFixed=item=>flag(item,'isFixedAsset','CI_ES_A_FIJO')||flag(item,'esActivoFijo','fixedAsset');
const CLASS_NUMBER_HELP='El número de clase indica el orden de llegada de los activos fijos dentro de su propia categoría. Por ejemplo, la categoría Motosierra lleva una numeración independiente de Pulidora, Rotomartillo y las demás categorías.';
const assetNumber=asset=>clean(asset?.numeroClase||asset?.numeroYT||asset?.orden);
const assetLabel=asset=>[asset?.clase,assetNumber(asset)&&`N.º ${assetNumber(asset)}`,asset?.marcaActual||asset?.marcaInterna||asset?.marcaAnterior,asset?.serial&&`Serial ${asset.serial}`].filter(Boolean).join(' · ');
function selectedItem(){const data=window.SKPlaza?.getData?.()||{},id=document.querySelector('#deliveryForm [name="itemId"]')?.value;return(data.inventoryCriteria||[]).find(item=>item.id===id)}
function field(panel,name){return panel.querySelector(`[name="${name}"]`)}
function visibleFields(item,newAsset=false){return{numeroYT:true,modelo:flag(item,'usesModel','CI_USA_MODELO'),serial:flag(item,'usesSerial','CI_USA_SERIAL'),largo:flag(item,'usesLength','CI_USA_LARGO'),fabricante:flag(item,'usesManufacturer','CI_USA_FABRICANTE'),marcaInterna:!(newAsset&&window.SKAssetMarking.eligible(itemName(item)))&&flag(item,'requiresInternalMark','CI_REQUIERE_MARCA_INTERNA')}}
function duplicate(rows,candidate){const type=norm(candidate.clase);return rows.find(asset=>!asset.deleted&&norm(asset.clase)===type&&asset.id!==candidate.id&&((candidate.serial&&norm(asset.serial)===norm(candidate.serial))||(candidate.numeroYT&&norm(assetNumber(asset))===norm(candidate.numeroYT))||(candidate.marcaInterna&&norm(asset.marcaInterna||asset.marcaActual)===norm(candidate.marcaInterna))))}
function injectStyle(){if(document.querySelector('#plazaNewAssetStyle'))return;const style=document.createElement('style');style.id='plazaNewAssetStyle';style.textContent=`#assetNotFoundBtn{grid-column:1/-1}.deliveryAssetDetails{grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:14px;border:1px solid #ccd8e0;border-radius:11px;background:#f7f9fa}.deliveryAssetDetails[hidden]{display:none}.deliveryAssetDetails h3,.deliveryAssetDetails .assetRegisterHint,.deliveryAssetDetails .assetRegisterActions{grid-column:1/-1;margin:0}.deliveryAssetDetails label[hidden]{display:none}.deliveryAssetDetails input[readonly]{background:#e9eef2;color:#52687a}.assetClassNumberField{position:relative}.assetFieldInfo{position:absolute;top:-5px;right:0;width:28px!important;height:28px!important;min-height:28px!important;padding:0!important;border:1px solid #1a4a68!important;border-radius:50%!important;background:#eef6fa!important;color:#173d59!important;font:700 16px/26px system-ui,sans-serif!important;text-align:center!important;box-shadow:none!important}.assetFieldInfo:focus-visible{outline:3px solid #8bc7e8;outline-offset:2px}.assetRegisterActions{display:flex;justify-content:center;gap:10px}.assetRegisterActions button{width:auto}.assetRegisterActions [data-cancel-new-asset]{background:#eef2f5;color:#173d59}@media(max-width:560px){.deliveryAssetDetails{grid-template-columns:1fr}}`;document.head.append(style)}
function mount(){
 const assetField=document.querySelector('#deliveryAssetField'),form=document.querySelector('#deliveryForm');
 if(!assetField||!form||document.querySelector('#assetNotFoundBtn'))return;
 injectStyle();
 const select=document.querySelector('#deliveryAssetId'),button=document.createElement('button'),panel=document.createElement('div');
 button.type='button';button.id='assetNotFoundBtn';button.className='secondaryAction';button.textContent='NO LO ENCONTRÉ';button.hidden=true;
 panel.id='deliveryAssetDetails';panel.className='deliveryAssetDetails';panel.hidden=true;panel.innerHTML=`<h3>DATOS DEL ACTIVO</h3><p class="assetRegisterHint"></p><label class="assetClassNumberField" data-asset-field="numeroYT">NÚMERO DE CLASE<button type="button" class="assetFieldInfo" data-class-number-info aria-label="¿Qué es el número de clase?">i</button><input name="numeroYT" autocomplete="off"></label><label data-asset-field="modelo">MODELO<input name="modelo" autocomplete="off"></label><label data-asset-field="serial">SERIAL<input name="serial" autocomplete="off"></label><label data-asset-field="largo">LARGO FT<input name="largo" type="number" min="0" step="any"></label><label data-asset-field="fabricante">MARCA COMERCIAL / FABRICANTE<input name="fabricante" autocomplete="off"></label><label data-asset-field="marcaInterna">MARCA INTERNA<input name="marcaInterna" autocomplete="off"></label><div class="assetRegisterActions" hidden><button type="button" data-save-new-asset>REGISTRAR ACTIVO</button><button type="button" data-cancel-new-asset>CANCELAR</button></div>`;
 assetField.after(button,panel);
 let newMode=false;
 const configure=(item,asset=null,editing=false)=>{const fields=visibleFields(item,editing);newMode=editing;panel.hidden=!item||(!asset&&!editing);panel.querySelector('h3').textContent=editing?`REGISTRAR ${itemName(item).toUpperCase()}`:'DATOS DEL ACTIVO SELECCIONADO';panel.querySelector('.assetRegisterHint').textContent=editing?'Completa únicamente los campos habilitados por Criterios de inventario. El activo también quedará registrado en Ingresos.':'Información de consulta; para modificarla usa SK Admin.';for(const [name,show] of Object.entries(fields)){const wrap=panel.querySelector(`[data-asset-field="${name}"]`),input=field(panel,name);wrap.hidden=!show;input.disabled=!show;input.readOnly=!editing;input.required=editing&&show;input.value=asset?(name==='numeroYT'?assetNumber(asset):clean(asset[name]||asset[name==='marcaInterna'?'marcaActual':''])):''}panel.querySelector('.assetRegisterActions').hidden=!editing};
 const refresh=()=>{const item=selectedItem(),fixed=isFixed(item),asset=(window.SKPlaza?.getData?.().assets||[]).find(row=>row.id===select.value);button.hidden=!fixed;button.textContent=select&&Array.from(select.options).some(option=>option.value)?'¿NO LO ENCONTRASTE?':'NO LO ENCONTRÉ';if(!fixed)configure(null);else if(!newMode)configure(item,asset,false)};
 const beginNew=()=>{const item=selectedItem();if(!isFixed(item))return;select.value='';configure(item,null,true);panel.scrollIntoView({behavior:'smooth',block:'nearest'});field(panel,'numeroYT')?.focus()};
 const cancelNew=()=>{newMode=false;configure(selectedItem(),null,false);refresh()};
 const saveNew=()=>{const item=selectedItem(),data=window.SKPlaza?.getData?.(),user=window.SKPlaza?.getUser?.();if(!item||!data||!isFixed(item))return;const enabled=visibleFields(item,true),candidate={clase:itemName(item)};for(const [name,show] of Object.entries(enabled))if(show){candidate[name]=clean(field(panel,name).value);if(!candidate[name])return alert(`El campo ${panel.querySelector(`[data-asset-field="${name}"]`).childNodes[0].textContent.trim()} es obligatorio para ${candidate.clase}.`)}const found=duplicate(data.assets||[],candidate);if(found)return alert(`Este activo ya está registrado: ${assetLabel(found)}.`);const timestamp=new Date().toISOString(),assetId=uuid(),incomeId=uuid(),asset={id:assetId,...candidate,numeroClase:candidate.numeroYT,marcaActual:candidate.marcaInterna||'',criteriaId:item.id,ubicacion:'Bodega de Superficie',estado:'Operativo/a',disponibleEntrega:'Sí',fechaIngreso:initialArrivalDate(timestamp),createdAt:timestamp,updatedAt:timestamp,syncState:'pending',registeredFrom:'plaza-delivery',registeredBy:user?.documento||''},income={id:incomeId,syncEventId:incomeId,itemId:item.id,itemName:itemName(item),assetId,assetLabel:assetLabel(asset),quantity:1,notes:'Alta de activo fijo desde el menú Entregas',operatorId:user?.id||'',operatorDocument:user?.documento||'',operatorName:user?.nombre||'',createdAt:timestamp,updatedAt:timestamp,syncState:'pending'};Object.assign(asset,window.SKAssetMarking.prepare(asset));(data.assets||(data.assets=[])).push(asset);(data.blendingIncomes||(data.blendingIncomes=[])).push(income);window.SKPlaza.saveData(data);newMode=false;window.SKPlaza.refreshDelivery?.();select.value=assetId;select.dispatchEvent(new Event('change',{bubbles:true}));configure(item,asset,false);window.SKPlaza.updatePendingBadge?.();if(!window.SKAssetMarking.saved([asset]))alert('Activo registrado. También se creó una fila en Ingresos y ya quedó seleccionado para continuar la entrega.');window.SKPlaza.sync?.(true)};
 form.elements.itemId.addEventListener('change',()=>setTimeout(()=>{newMode=false;refresh()},0));
 select.addEventListener('change',()=>{newMode=false;refresh()});
 new MutationObserver(refresh).observe(select,{childList:true});
 button.addEventListener('click',beginNew);panel.querySelector('[data-class-number-info]').addEventListener('click',()=>alert(CLASS_NUMBER_HELP));panel.querySelector('[data-cancel-new-asset]').addEventListener('click',cancelNew);panel.querySelector('[data-save-new-asset]').addEventListener('click',saveNew);refresh();
}
function mountIncome(){
 const form=document.querySelector('#incomeForm');if(!form||document.querySelector('#incomeAssetPanel'))return;
 const quantityField=form.elements.quantity.closest('label'),panel=document.createElement('div');
 quantityField.id='incomeQuantityField';panel.id='incomeAssetPanel';panel.className='deliveryAssetDetails';panel.hidden=true;
 panel.innerHTML=`<h3>ACTIVO FIJO QUE INGRESA</h3><p class="assetRegisterHint">Busca el activo por su serial.</p>
 <select name="assetId" id="incomeAssetId" hidden aria-label="Activo seleccionado"><option value="">Seleccionar…</option></select>
 <label class="incomeAssetSearchField">BUSCAR ACTIVO<input type="search" id="incomeAssetSearch" placeholder="Buscar por serial, marca o número de clase…" autocomplete="off" aria-controls="incomeAssetResults" aria-describedby="incomeAssetSearchStatus"></label>
 <p id="incomeAssetSearchStatus" role="status" aria-live="polite"></p><div id="incomeAssetResults"></div>
 <button type="button" id="incomeRegisterAssetBtn" hidden>REGISTRAR ACTIVO</button>
 <label class="assetClassNumberField" data-income-asset-field="numeroYT">NÚMERO DE CLASE<button type="button" class="assetFieldInfo" data-class-number-info aria-label="¿Qué es el número de clase?">i</button><input data-income-asset-input="numeroYT" autocomplete="off"></label><label data-income-asset-field="modelo">MODELO<input data-income-asset-input="modelo" autocomplete="off"></label><label data-income-asset-field="serial">SERIAL<input data-income-asset-input="serial" autocomplete="off"></label><label data-income-asset-field="largo">LARGO FT<input data-income-asset-input="largo" type="number" min="0" step="any"></label><label data-income-asset-field="fabricante">MARCA COMERCIAL / FABRICANTE<input data-income-asset-input="fabricante" autocomplete="off"></label><label data-income-asset-field="marcaInterna">MARCA INTERNA<input data-income-asset-input="marcaInterna" autocomplete="off"></label>`;
 quantityField.after(panel);
 const style=document.createElement('style');style.textContent='#incomeAssetPanel .incomeAssetSearchField,#incomeAssetSearchStatus,#incomeAssetResults,#incomeRegisterAssetBtn{grid-column:1/-1}#incomeAssetSearchStatus{margin:0;font-size:.9rem;color:#52687a;overflow-wrap:anywhere}#incomeAssetResults{display:grid;gap:8px;max-height:260px;overflow:auto}#incomeAssetResults[hidden],#incomeRegisterAssetBtn[hidden],#incomeAssetId[hidden]{display:none!important}#incomeAssetResults button{text-align:left;background:#fff;color:#173d59;border:1px solid #c8d6df;display:grid;gap:5px;overflow-wrap:anywhere}#incomeAssetResults button small{color:#52687a}#incomeAssetResults button:disabled{opacity:.75;cursor:default}#incomeAssetResults button:focus-visible{outline:3px solid #e7b45a;outline-offset:1px}';document.head.append(style);
 const select=panel.querySelector('#incomeAssetId'),search=panel.querySelector('#incomeAssetSearch'),results=panel.querySelector('#incomeAssetResults'),status=panel.querySelector('#incomeAssetSearchStatus'),register=panel.querySelector('#incomeRegisterAssetBtn');
 const input=name=>panel.querySelector(`[data-income-asset-input="${name}"]`),currentItem=()=>{const data=window.SKPlaza?.getData?.()||{};return(data.inventoryCriteria||[]).find(item=>item.id===form.elements.itemId.value)};
 const classAssets=item=>{const type=norm(itemName(item));return(window.SKPlaza?.getData?.().assets||[]).filter(asset=>!asset.deleted&&norm(asset.clase)===type).sort((a,b)=>assetNumber(a).localeCompare(assetNumber(b),'es',{numeric:true}))};
 const blockedReason=asset=>/dado\/?a? de baja|retirado|desechado/i.test(`${asset.estado||''} ${asset.ubicacion||''}`)?'Este activo está dado de baja o retirado.':norm(asset.ubicacion)==='bodega de superficie'?'Este activo ya está en Bodega de Superficie. No necesita otro ingreso.':'';
 const matches=()=>{const query=norm(search.value);return classAssets(currentItem()).filter(asset=>!query||norm([asset.serial,assetNumber(asset),asset.marcaActual,asset.marcaInterna,asset.nuevaMarca,asset.marcaAnterior].join(' ')).includes(query))};
 const configure=(item,asset,newAsset)=>{
  const fields=visibleFields(item,newAsset),showDetails=!!asset||newAsset;
  for(const [name,enabled] of Object.entries(fields)){
   const wrap=panel.querySelector(`[data-income-asset-field="${name}"]`),control=input(name),show=showDetails&&enabled;
   wrap.hidden=!show;control.disabled=!show;control.readOnly=!newAsset;control.required=newAsset&&show;
   control.value=asset?(name==='numeroYT'?assetNumber(asset):clean(asset[name]||asset[name==='marcaInterna'?'marcaActual':''])):'';
  }
  panel.querySelector('.assetRegisterHint').textContent=newAsset?'Completa los datos del activo nuevo y luego registra el ingreso.':asset?'Activo seleccionado. Sus datos son de consulta.':'Busca el activo por su serial. Si no aparece, podrás registrarlo.';
 };
 const choose=asset=>{
  if(blockedReason(asset))return;
  select.replaceChildren(new Option('Seleccionar…',''),new Option(assetLabel(asset),asset.id));select.value=asset.id;
  search.value=asset.serial||asset.marcaActual||asset.marcaInterna||assetNumber(asset);results.hidden=true;register.hidden=true;
  status.textContent='Seleccionado: '+assetLabel(asset);configure(currentItem(),asset,false);
 };
 const renderSearch=()=>{
  const item=currentItem();if(!isFixed(item))return;
  const rows=matches(),query=clean(search.value);results.replaceChildren();results.hidden=false;
  register.hidden=rows.length>0;
  status.textContent=rows.length?`${rows.length} ${rows.length===1?'activo encontrado':'activos encontrados'}${rows.length>20?'. Escribe más datos para precisar la búsqueda.':'. Selecciona el que ingresa.'}`:query?`No se encontró un activo de esta clase con “${query}”.`:'No hay activos registrados de esta clase.';
  rows.slice(0,20).forEach(asset=>{
   const button=document.createElement('button'),label=document.createElement('b'),detail=document.createElement('small'),reason=blockedReason(asset);
   button.type='button';button.dataset.incomeAsset=asset.id;button.disabled=!!reason;label.textContent=assetLabel(asset);detail.textContent=reason||asset.ubicacion||'Sin ubicación registrada';button.append(label,detail);button.addEventListener('click',()=>choose(asset));results.append(button);
  });
 };
 const resetSearch=()=>{search.value='';select.replaceChildren(new Option('Seleccionar…',''));configure(currentItem(),null,false);renderSearch()};
 const refresh=()=>{
  const item=currentItem(),fixed=isFixed(item);quantityField.hidden=!!fixed;quantityField.style.display=fixed?'none':'';
  form.elements.quantity.disabled=!!fixed;form.elements.quantity.required=!fixed;if(fixed)form.elements.quantity.value='1';panel.hidden=!fixed;
  select.required=false;resetSearch();
 };
 panel.querySelector('[data-class-number-info]').addEventListener('click',()=>alert(CLASS_NUMBER_HELP));
 search.addEventListener('input',()=>{select.replaceChildren(new Option('Seleccionar…',''));configure(currentItem(),null,false);renderSearch()});
 search.addEventListener('keydown',event=>{
  if(event.key==='ArrowDown'){const first=results.querySelector('button:not(:disabled)');if(first){event.preventDefault();first.focus()}}
  if(event.key==='Enter'&&select.value===''){event.preventDefault();const rows=matches().filter(asset=>!blockedReason(asset));if(rows.length===1)choose(rows[0]);else if(!rows.length&&!register.hidden)register.focus()}
 });
 register.addEventListener('click',()=>{
  // Consultar de nuevo por si terminó una sincronización durante la búsqueda.
  if(matches().length){renderSearch();return}
  const serial=clean(search.value),item=currentItem();select.replaceChildren(new Option('Seleccionar…',''),new Option('Nuevo activo','__new__'));select.value='__new__';
  configure(item,null,true);if(visibleFields(item,true).serial)input('serial').value=serial;
  results.hidden=true;register.hidden=true;status.textContent='Nuevo activo: '+itemName(item);input('numeroYT').focus();
 });
 form.elements.itemId.addEventListener('change',refresh);
 form.addEventListener('reset',()=>setTimeout(refresh,0));
 window.addEventListener('skplaza-synced',()=>{if(!panel.hidden&&!select.value)renderSearch()});
 const captureCurrent=()=>{const item=currentItem();if(!isFixed(item))return{};if(!select.value){alert('Selecciona el activo que ingresa o registra uno nuevo.');return null}if(select.value!=='__new__'){const asset=(window.SKPlaza?.getData?.().assets||[]).find(row=>row.id===select.value);return asset?{assetId:asset.id,assetLabel:assetLabel(asset)}:null}const enabled=visibleFields(item,true),candidate={clase:itemName(item)};for(const [name,show]of Object.entries(enabled))if(show){candidate[name]=clean(input(name).value);if(!candidate[name]){alert(`Completa ${panel.querySelector(`[data-income-asset-field="${name}"]`).childNodes[0].textContent.trim()}.`);return null}}const data=window.SKPlaza?.getData?.()||{},found=duplicate(data.assets||[],candidate);if(found){alert(`Este activo ya está registrado: ${assetLabel(found)}.`);return null}candidate.numeroClase=candidate.numeroYT;candidate.marcaActual=candidate.marcaInterna||'';return{assetCandidate:candidate,assetLabel:assetLabel(candidate)}};
 const commit=(draft,timestamp)=>{const data=window.SKPlaza?.getData?.(),user=window.SKPlaza?.getUser?.();if(!data)return null;if(draft.assetCandidate){const found=duplicate(data.assets||[],draft.assetCandidate);if(found)return found;const asset={id:uuid(),...draft.assetCandidate,criteriaId:draft.itemId,ubicacion:'Bodega de Superficie',estado:'Operativo/a',disponibleEntrega:'Sí',fechaIngreso:initialArrivalDate(timestamp),createdAt:timestamp,updatedAt:timestamp,syncState:'pending',registeredFrom:'plaza-income',registeredBy:user?.documento||''};Object.assign(asset,window.SKAssetMarking.prepare(asset));(data.assets||(data.assets=[])).push(asset);return asset}const asset=(data.assets||[]).find(row=>row.id===draft.assetId);if(asset){asset.ubicacion='Bodega de Superficie';asset.updatedAt=timestamp;asset.syncState='pending'}return asset||null};
 window.SKPlazaIncomeAsset={captureCurrent,commit};
 // El formulario guarda activos e ingresos mediante captureCurrent/commit, después de validar el lote.

 refresh();
}
window.addEventListener('load',()=>setTimeout(()=>{mount();mountIncome()},300));
})();
