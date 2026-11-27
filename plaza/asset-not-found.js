// Registro local-first de un activo fijo que no aparece en Entregas.
(()=>{
'use strict';
const norm=value=>String(value||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const clean=value=>String(value||'').trim();
// La llegada inicial usa el día en Colombia, aunque el dispositivo tenga otra zona horaria.
const arrivalDateFormat=new Intl.DateTimeFormat('en-US',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'});
const initialArrivalDate=timestamp=>{const parts=Object.fromEntries(arrivalDateFormat.formatToParts(new Date(timestamp)).map(part=>[part.type,part.value]));return `${parts.year}-${parts.month}-${parts.day}`};
function initialArrivalDetails(timestamp,person,shift){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Bogota',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(timestamp)).map(part=>[part.type,part.value]));
 return {fechaNovedad:initialArrivalDate(timestamp),horaNovedad:`${parts.hour}:${parts.minute}`,descripcionNovedad:'Llegada a mina',documentoResponsable:person?.documento||'',nombreResponsable:person?.nombre||'',documentoBodeguero:shift?.shiftKeeperDocument||'',nombreBodeguero:shift?.shiftKeeperName||''};
}
const uuid=()=>crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`;
const itemName=item=>clean(item?.name||item?.element||item?.nombre||item?.elemento||item?.CI_ELEMENTO);
const flag=(item,key,legacy)=>{const value=item?.[key]??item?.[legacy];return value===true||['true','si','sí','1','yes'].includes(norm(value))};
const isFixed=item=>flag(item,'isFixedAsset','CI_ES_A_FIJO')||flag(item,'esActivoFijo','fixedAsset');
const isRepairClass=value=>/^(yt(?:\b|\d)|columnas?\b)/i.test(clean(value));
const minePrefixes={'Providencia':'P','El Silencio':'S','Carla':'C','Alianza':'L'};
const prefixFor=mine=>Object.entries(minePrefixes).find(([name])=>norm(name)===norm(mine))?.[1]||'';
const isSandraK=value=>norm(value).replace(/[.\s-]/g,'')==='sandrak';
const CLASS_NUMBER_HELP='El número de clase indica el orden de llegada de los activos fijos dentro de su propia categoría. Por ejemplo, la categoría Motosierra lleva una numeración independiente de Pulidora, Rotomartillo y las demás categorías.';
const assetNumber=asset=>clean(asset?.numeroClase||asset?.numeroYT||asset?.orden);
const automaticClassNumber=clase=>window.SKAssetRules.automaticNumberEligible(clase);
const nextClassNumber=(clase,rows=window.SKPlaza?.getData?.().assets||[])=>window.SKAssetRules.classNumber(rows,{clase});
function recentManufacturerControl(control,clase){
 if(!control||control.tagName!=='INPUT')return;
 const id=control.closest('[id]')?.id+'ManufacturerOptions';let list=document.getElementById(id);
 if(!list){list=document.createElement('datalist');list.id=id;control.after(list)}
 control.setAttribute('list',id);
 const rows=(window.SKPlaza?.getData?.().assets||[]).filter(row=>norm(row.clase)===norm(clase)&&clean(row.fabricante)).sort((a,b)=>String(b.createdAt||b.fechaIngreso||'').localeCompare(String(a.createdAt||a.fechaIngreso||'')));
 const seen=new Set(),brands=rows.map(row=>clean(row.fabricante)).filter(value=>{const key=norm(value);if(seen.has(key))return false;seen.add(key);return true}).slice(0,12);
 list.replaceChildren(...window.SKAssetRules.withUnrecordedOption(brands).map(value=>new Option(value,value)));
}

const assetLabel=asset=>{
 const heading=window.SKAssetRules?.equipmentHeading?.(asset)||asset.clase;
 if(window.SKAssetRules.isColumn(asset))return window.SKAssetRules.columnLabel(asset,heading);
 return [heading,assetNumber(asset)&&`N.º ${assetNumber(asset)}`,asset?.marcaActual||asset?.marcaInterna||asset?.marcaAnterior,window.SKAssetRules.searchSerial(asset?.serial)&&`Serial ${asset.serial}`,asset?.minaOrigen&&`Origen: ${asset.minaOrigen}`].filter(Boolean).join(' · ');
};

const assetAreas=()=>{const record=(window.SKPlaza?.getData?.().inventoryCriteria||[]).find(row=>row.id==='SYSTEM-FORM-OPTIONS-V1'||row.recordType==='formOptions');return window.SKAssetRules.assignmentAreas(window.SKFormOptions?.values?.('personal.area')||record?.options?.['personal.area'])};
function fillAssetArea(control,value=''){const values=assetAreas();control.replaceChildren(new Option('Seleccionar área…',''),...values.map(area=>new Option(area,area)));if(value&&!values.includes(value))control.add(new Option(value,value));control.value=value}

function selectedItem(){const data=window.SKPlaza?.getData?.()||{},id=document.querySelector('#deliveryForm [name="itemId"]')?.value;return(data.inventoryCriteria||[]).find(item=>item.id===id)}
function field(panel,name){return panel.querySelector(`[name="${name}"]`)}
function visibleFields(item,newAsset=false,assetContext=null){return{numeroYT:true,modelo:flag(item,'usesModel','CI_USA_MODELO'),serial:!window.SKAssetRules.isColumn(itemName(item)),marcaPrevia:true,largo:flag(item,'usesLength','CI_USA_LARGO'),fabricante:/^motosierras?$/.test(norm(itemName(item)))||flag(item,'usesManufacturer','CI_USA_FABRICANTE'),marcaInterna:!(newAsset&&window.SKAssetMarking.eligible(assetContext||itemName(item)))&&flag(item,'requiresInternalMark','CI_REQUIERE_MARCA_INTERNA')}}
const serialPrompt='Ingresa el serial o escribe «No registra».';
const assetFieldLabels={numeroYT:'NÚMERO DE CLASE',modelo:'MODELO',largo:'LARGO FT',fabricante:'MARCA COMERCIAL / FABRICANTE',marcaInterna:'MARCA INTERNA'};
function requiredField(name,item){
 if(name==='serial')return window.SKAssetRules.requiresSerial({clase:itemName(item)},item);
 return name!=='marcaPrevia';
}
function newAssetIssue(item,asset){
 if(!isFixed(item)||item.deleted||item.active===false||norm(itemName(item))!==norm(asset.clase)){
  return {message:'Selecciona una clase activa del catálogo local de activos fijos.'};
 }
 for(const [name,show] of Object.entries(visibleFields(item,true,asset))){
  if(!show||!requiredField(name,item))continue;
  if(name==='serial'){
   if(!window.SKAssetRules.hasIdentity(asset,item))return {name,message:serialPrompt};
  }else if(!clean(asset[name])&&!(name==='marcaInterna'&&asset.marcaInternaNoRegistra===true))return {name,message:'Completa '+assetFieldLabels[name]+' para registrar '+asset.clase+'.'};
 }
}
function readAssetFields(fields,getInput,clase){
 const asset={clase};
 for(const [name,show] of Object.entries(fields))if(show)asset[name]=clean(getInput(name).value);
 window.SKAssetRules.normalizeAssetIdentification(asset);
 return asset;
}
function validAssetForm(item,asset,getInput){
 const issue=newAssetIssue(item,asset);
 if(!issue)return true;
 if(issue.name)getInput(issue.name).focus();
 alert(issue.message);return false;
}
function newAssetHint(item){
 return window.SKAssetRules.requiresSerial({clase:itemName(item)},item)?serialPrompt:'Completa los datos requeridos para esta clase.';
}
function incomeManufacturerControl(panel,item){
 const selector='[data-income-asset-input="fabricante"]';let control=panel.querySelector(selector);
 const dropdown=/^motosierras?$/.test(norm(itemName(item)));
 if((control.tagName==='SELECT')!==dropdown){const replacement=document.createElement(dropdown?'select':'input');replacement.dataset.incomeAssetInput='fabricante';if(!dropdown)replacement.autocomplete='off';control.replaceWith(replacement);control=replacement}
 if(!dropdown){control.placeholder='Marca comercial o No registra';recentManufacturerControl(control,itemName(item));}
 if(dropdown){const brands=window.SKFormOptions?.values?.('asset.manufacturer.motosierra')||['Makita','Stihl'];control.replaceChildren(new Option('Seleccionar marca…',''),...window.SKAssetRules.withUnrecordedOption(brands).map(brand=>new Option(brand,brand)))}
}
function duplicate(rows,candidate){return window.SKAssetRules.duplicateIdentity(rows,candidate)||window.SKAssetRules.mineIdentifierConflict(rows,candidate)?.found}
function injectStyle(){if(document.querySelector('#plazaNewAssetStyle'))return;const style=document.createElement('style');style.id='plazaNewAssetStyle';style.textContent=`#assetNotFoundBtn{grid-column:1/-1}.deliveryAssetDetails{grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:14px;border:1px solid #ccd8e0;border-radius:11px;background:#f7f9fa}.deliveryAssetDetails[hidden]{display:none}.deliveryAssetDetails h3,.deliveryAssetDetails .assetRegisterHint,.deliveryAssetDetails .assetRegisterActions{grid-column:1/-1;margin:0}.deliveryAssetDetails label[hidden]{display:none}.deliveryAssetDetails select:disabled{background:#e9eef2;color:#52687a;opacity:1;cursor:default}.deliveryAssetDetails input[readonly]{background:#e9eef2;color:#52687a}.assetClassNumberField{position:relative}.assetFieldInfo{position:absolute;top:-5px;right:0;width:28px!important;height:28px!important;min-height:28px!important;padding:0!important;border:1px solid #1a4a68!important;border-radius:50%!important;background:#eef6fa!important;color:#173d59!important;font:700 16px/26px system-ui,sans-serif!important;text-align:center!important;box-shadow:none!important}.assetFieldInfo:focus-visible{outline:3px solid #8bc7e8;outline-offset:2px}.assetRegisterActions{display:flex;justify-content:center;gap:10px}.assetRegisterActions button{width:auto}.assetRegisterActions [data-cancel-new-asset]{background:#eef2f5;color:#173d59}@media(max-width:560px){.deliveryAssetDetails{grid-template-columns:1fr}}`;document.head.append(style)}
function createAssetSummary(id){
 const card=document.createElement('article');
 card.id=id;card.className='selectedAssetSummary';card.hidden=true;
 card.innerHTML='<small>ACTIVO SELECCIONADO</small><h3></h3><dl></dl>';
 const title=card.querySelector('h3');
 title.id=id+'Title';card.setAttribute('aria-labelledby',title.id);
 return card;
}
// El paso de búsqueda conserva el mismo formulario, el borrador y sus controles de movimiento.
function mountAssetSelection(form,card,search){
 const bar=document.createElement('div');
 bar.className='assetSearchBar';bar.hidden=true;
 bar.innerHTML='<h2></h2><button type="button" class="secondaryAction">CANCELAR</button>';
 form.prepend(bar);
 const remove=document.createElement('button');
 remove.type='button';remove.className='removeSelectedAsset';remove.textContent='×';remove.hidden=true;
 remove.setAttribute('aria-label','Quitar activo seleccionado');remove.title='Quitar activo';
 card.tabIndex=-1;card.append(remove);
 function clear(){
  const item=form.elements.itemId,label=item.closest('label');
  label._clearItemSearch();form.elements.notes.value='';
  item.dispatchEvent(new Event('change',{bubbles:true}));
  label.querySelector('.itemSearchInput')?.focus();
 }
 remove.addEventListener('click',clear);
 bar.querySelector('button').addEventListener('click',clear);
 form.addEventListener('keydown',event=>{
  if(form.dataset.assetStep==='search'&&event.key==='Escape'){
   event.preventDefault();clear();
  }
 });
 form.addEventListener('submit',event=>{
  if(form.dataset.assetStep==='search'){event.preventDefault();event.stopImmediatePropagation()}
 },true);
 return (active,item,asset)=>{
  const previous=form.dataset.assetStep,step=active?(asset?'selected':'search'):'';
  if(step)form.dataset.assetStep=step;else delete form.dataset.assetStep;
  bar.hidden=step!=='search';remove.hidden=step!=='selected';
  if(step==='search')bar.querySelector('h2').textContent='Seleccionar '+itemName(item);
  if(step===previous||!form.closest('.view.active'))return;
  if(step==='search')search.focus();
  if(step==='selected')card.focus();
 };
}
function renderSelectedAsset(card,item,asset,originMine=''){
 const fields=visibleFields(item),mark=clean(asset.nuevaMarca||asset.marcaActual||asset.marcaInterna);
 const previous=clean(asset.marcaPrevia||asset.marcaAnterior||asset.numeroMarcaActual);
 const title=card.querySelector('h3'),details=card.querySelector('dl');
 const heading=window.SKAssetRules?.equipmentHeading?.(asset);
 title.textContent=[heading||clean(asset.clase)||itemName(item),mark].filter(Boolean).join(' · ');
 const values=[
  ['Serial',fields.serial&&asset.serial],
  ['Modelo',!heading&&fields.modelo&&asset.modelo],
  ['N.º de clase',assetNumber(asset)],
  ['Marca interna',!mark&&asset.marcaInternaNoRegistra&&'No registra'],
  ['Marca anterior',previous!==mark&&previous],
  ['Largo (ft)',fields.largo&&asset.largo],
  ['Fabricante',fields.fabricante&&(asset.fabricante||asset.marcaComercial)],
  ['Destinado a',asset.areaAsignada],
  ['Mina de origen',originMine]
 ];
 details.replaceChildren();
 for(const [label,value] of values){
  if(!clean(value)||norm(value)==='no aplica')continue;
  const pair=document.createElement('div'),term=document.createElement('dt'),description=document.createElement('dd');
  term.textContent=label;
  description.textContent=value;
  pair.append(term,description);
  details.append(pair);
 }
}
function mount(){
 const assetField=document.querySelector('#deliveryAssetField'),form=document.querySelector('#deliveryForm');
 if(!assetField||!form||document.querySelector('#assetNotFoundBtn'))return;
 injectStyle();
 const select=document.querySelector('#deliveryAssetId'),button=document.createElement('button'),panel=document.createElement('fieldset');
 const summary=createAssetSummary('deliveryAssetSummary');
 button.type='button';button.id='assetNotFoundBtn';button.className='secondaryAction';button.textContent='NO LO ENCONTRÉ';button.hidden=true;
 panel.id='deliveryAssetDetails';panel.className='deliveryAssetDetails';panel.hidden=true;panel.disabled=true;panel.innerHTML=`<h3>DATOS DEL ACTIVO</h3><p class="assetRegisterHint"></p><label class="assetClassNumberField" data-asset-field="numeroYT">NÚMERO DE CLASE<button type="button" class="assetFieldInfo" data-class-number-info aria-label="¿Qué es el número de clase?">i</button><input name="numeroYT" autocomplete="off"></label><label data-asset-field="modelo">MODELO<input name="modelo" autocomplete="off"></label><label data-asset-field="marcaPrevia">MARCA ANTERIOR<input name="marcaPrevia" autocomplete="off"></label><label data-asset-field="serial">SERIAL<input name="serial" list="plazaNoRegistraOptions" placeholder="Serial o No registra" autocomplete="off"></label><label data-asset-field="largo">LARGO FT<input name="largo" type="number" min="0" step="any"></label><label data-asset-field="fabricante">MARCA COMERCIAL / FABRICANTE<input name="fabricante" placeholder="Marca comercial o No registra" autocomplete="off"></label><label data-asset-field="marcaInterna">MARCA INTERNA<input name="marcaInterna" list="plazaNoRegistraOptions" placeholder="Marca o No registra" autocomplete="off"></label><label data-asset-area>DESTINADO A<select name="areaAsignada"></select></label><div class="assetRegisterActions"><button type="button" data-save-new-asset>REGISTRAR ACTIVO</button><button type="button" data-cancel-new-asset>CANCELAR</button></div>`;
 assetField.after(summary,button,panel);
 const updateSelection=mountAssetSelection(form,summary,assetField.querySelector('#deliveryAssetSearch'));
 const warning=assetField.querySelector('[role="status"]');
 const refresh=()=>{
  const item=selectedItem(),fixed=isFixed(item);
  const asset=fixed&&select.value&&(window.SKPlaza.getData().assets||[]).find(row=>row.id===select.value);
  if(!fixed||asset||panel.dataset.itemId!==item.id){panel.hidden=true;panel.disabled=true}
  summary.hidden=!asset;
  if(asset)renderSelectedAsset(summary,item,asset);
  const warehouse=form.dataset.deliveryMode==='warehouse';
  const warningHost=warehouse&&asset?summary:assetField;
  if(warning&&warning.parentElement!==warningHost)warningHost.append(warning);
  updateSelection(warehouse&&fixed&&panel.hidden,item,asset);
  button.hidden=!fixed||Boolean(asset)||!panel.hidden;
  button.textContent=Array.from(select.options).some(option=>option.value)?'¿NO LO ENCONTRASTE?':'NO LO ENCONTRÉ';
 };
 const beginNew=()=>{
  const item=selectedItem();
  if(!isFixed(item))return;
  select.value='';select.dispatchEvent(new Event('change',{bubbles:true}));
  panel.dataset.itemId=item.id;panel.hidden=false;panel.disabled=false;button.hidden=true;updateSelection(false,item,null);
  panel.querySelector('h3').textContent='REGISTRAR '+itemName(item).toUpperCase();
  panel.querySelector('.assetRegisterHint').textContent=newAssetHint(item)+' El activo también quedará registrado en Ingresos.';
  const automatic=automaticClassNumber(itemName(item));
  for(const [name,show] of Object.entries(visibleFields(item,true))){
   const input=field(panel,name);
   input.closest('label').hidden=!show||(name==='numeroYT'&&automatic);
   input.disabled=!show;
   input.required=show&&requiredField(name,item);
   input.value=name==='numeroYT'&&automatic?nextClassNumber(itemName(item)):'';
  }
  fillAssetArea(field(panel,'areaAsignada'));
  recentManufacturerControl(field(panel,'fabricante'),itemName(item));
  panel.scrollIntoView({behavior:'smooth',block:'nearest'});
  panel.querySelector('label:not([hidden]) input:enabled')?.focus();
 };
 const cancelNew=()=>{panel.hidden=true;panel.disabled=true;refresh();if(form.dataset.assetStep!=='search')button.focus()};
 const saveButton=panel.querySelector('[data-save-new-asset]');
 let savingNew=false;
 const saveNew=async()=>{if(savingNew||panel.hidden||panel.disabled)return;savingNew=true;saveButton.disabled=true;try{const item=selectedItem(),data=JSON.parse(JSON.stringify(window.SKPlaza?.getData?.()||null)),user=window.SKPlaza?.getUser?.();if(!item||!data||!isFixed(item))return;const getInput=name=>field(panel,name);
 if(automaticClassNumber(itemName(item)))getInput('numeroYT').value=nextClassNumber(itemName(item));
 const candidate=readAssetFields(visibleFields(item,true),getInput,itemName(item));
 if(!validAssetForm(item,candidate,getInput))return;
 if(automaticClassNumber(candidate.clase))candidate.classNumberPolicy='auto-v1';candidate.areaAsignada=clean(field(panel,'areaAsignada').value);const found=duplicate(data.assets||[],candidate);if(found)return alert(`Este activo ya está registrado: ${assetLabel(found)}.`);const times=window.SKPlaza.movementTimes(form),assetId=uuid(),incomeId=uuid(),asset={id:assetId,mina:'Sandra K',...candidate,numeroClase:candidate.numeroYT,marcaActual:candidate.marcaInterna||'',criteriaId:item.id,ubicacion:'Bodega de Superficie',estado:'Operativo/a',disponibleEntrega:'Sí',fechaIngreso:initialArrivalDate(times.createdAt),...times,syncState:'pending',registeredFrom:'plaza-delivery',registeredBy:user?.documento||''},income={id:incomeId,syncEventId:incomeId,itemId:item.id,itemName:itemName(item),assetId,assetLabel:assetLabel(asset),quantity:1,notes:'Alta de activo fijo desde el menú Entregas',operatorId:user?.id||'',operatorDocument:user?.documento||'',operatorName:user?.nombre||'',...times,syncState:'pending'};if(asset.areaAsignada)asset.areaAsignadaRevision={value:asset.areaAsignada,at:asset.createdAt};Object.assign(asset,window.SKAssetMarking.prepare(asset));(data.assets||(data.assets=[])).push(asset);(data.blendingIncomes||(data.blendingIncomes=[])).push(income);form.inert=true;await window.SKPlaza.saveData(data);
 panel.hidden=true;panel.disabled=true;
 for(const control of panel.querySelectorAll('input,select'))control.value='';
 form.inert=false;window.SKPlaza.refreshDelivery?.();select.value=assetId;select.dispatchEvent(new Event('change',{bubbles:true}));window.SKPlaza.updatePendingBadge?.();if(!window.SKAssetMarking.saved([asset]))alert('Activo registrado. También se creó una fila en Ingresos y ya quedó seleccionado para continuar la entrega.');window.SKPlaza.sync?.(true)}catch(error){alert(error.message||'No fue posible guardar el activo.')}finally{form.inert=false;savingNew=false;saveButton.disabled=false}};
 form.elements.itemId.addEventListener('change',refresh);
 select.addEventListener('change',refresh);
 new MutationObserver(refresh).observe(select,{childList:true});
 panel.addEventListener('focusin',event=>{if(event.target===field(panel,'fabricante'))recentManufacturerControl(event.target,itemName(selectedItem()))});button.addEventListener('click',beginNew);panel.querySelector('[data-class-number-info]').addEventListener('click',()=>alert(CLASS_NUMBER_HELP));panel.querySelector('[data-cancel-new-asset]').addEventListener('click',cancelNew);saveButton.addEventListener('click',saveNew);refresh();
}
function incomeFields(item,newAsset=false,assetContext=null){
 const fields=visibleFields(item,newAsset,assetContext);
 delete fields.marcaPrevia;
 return fields;
}
function mountIncome(){
 const form=document.querySelector('#incomeForm');if(!form||document.querySelector('#incomeAssetPanel'))return;
 const quantityField=form.elements.quantity.closest('label'),panel=document.createElement('div');
 quantityField.id='incomeQuantityField';panel.id='incomeAssetPanel';panel.className='deliveryAssetDetails';panel.hidden=true;
 panel.innerHTML=`<h3>ACTIVO FIJO QUE INGRESA</h3>
 <div class="incomeAssetMode" role="group" aria-label="Estado del registro del activo"><button type="button" data-income-mode="new" aria-pressed="false">ACTIVO NUEVO</button><button type="button" data-income-mode="registered" aria-pressed="true">ACTIVO REGISTRADO</button></div>
 <p class="assetRegisterHint"></p>
 <select name="assetId" id="incomeAssetId" hidden aria-label="Activo seleccionado"><option value="">Seleccionar…</option></select>
 <label class="incomeAssetSearchField">BUSCAR ACTIVO<input type="search" id="incomeAssetSearch" placeholder="Buscar por serial, marca o número de clase…" autocomplete="off" aria-controls="incomeAssetResults" aria-describedby="incomeAssetSearchStatus"></label>
 <p id="incomeAssetSearchStatus" role="status" aria-live="polite"></p><div id="incomeAssetResults"></div>
 <label data-income-area-field>DESTINADO A<select data-income-asset-input="areaAsignada"></select></label>\n <label id="incomeConditionField">ESTADO AL INGRESAR<select id="incomeCondition" required><option value="">Seleccionar…</option><option>Operativo/a</option><option>Averiado/a</option></select></label> <label id="incomeTypeField">TIPO DE INGRESO<select id="incomeType"><option value="">Seleccionar…</option><option value="TRASLADO">TRASLADO</option><option value="REPARACIÓN">REPARACIÓN</option></select></label>
 <label id="incomeOriginField">MINA DE ORIGEN<select id="incomeOriginMine"><option value="">Seleccionar…</option></select></label>
 <p id="incomeOriginHint" class="assetRegisterHint"></p>
 <label class="assetClassNumberField" data-income-asset-field="numeroYT">NÚMERO DE CLASE<button type="button" class="assetFieldInfo" data-class-number-info aria-label="¿Qué es el número de clase?">i</button><input data-income-asset-input="numeroYT" autocomplete="off"></label><label data-income-asset-field="fabricante">MARCA COMERCIAL<input data-income-asset-input="fabricante" autocomplete="off"></label><label data-income-asset-field="modelo">MODELO<input data-income-asset-input="modelo" autocomplete="off"></label><label data-income-asset-field="serial">SERIAL<input data-income-asset-input="serial" list="plazaNoRegistraOptions" placeholder="Serial o No registra" autocomplete="off"></label><label data-income-asset-field="largo">LARGO FT<input data-income-asset-input="largo" type="number" min="0" step="any"></label><label data-income-asset-field="marcaInterna">MARCA INTERNA<input data-income-asset-input="marcaInterna" list="plazaNoRegistraOptions" placeholder="Marca o No registra" autocomplete="off"></label>`;
 const summary=createAssetSummary('incomeAssetSummary');
 panel.querySelector('#incomeAssetResults').after(summary);
 quantityField.after(panel);
 const style=document.createElement('style');style.textContent=`#incomeAssetPanel .incomeAssetMode,#incomeAssetPanel .incomeAssetSearchField,#incomeAssetSearchStatus,#incomeAssetResults{grid-column:1/-1}#incomeAssetPanel [hidden]{display:none!important}.incomeAssetMode{display:grid;grid-template-columns:1fr 1fr;gap:4px;background:#e1e9ef;padding:4px;border-radius:12px}.incomeAssetMode button{min-width:0;padding:12px 8px;background:transparent;color:#36556c;border-radius:9px;font-size:.85rem;white-space:normal}.incomeAssetMode button[aria-pressed="true"]{background:#173d59;color:#fff;box-shadow:0 2px 5px #173d5926}.incomeAssetMode button:focus-visible{outline:3px solid #e7b45a;outline-offset:1px}#incomeAssetSearchStatus{margin:0;font-size:.9rem;color:#52687a;overflow-wrap:anywhere}#incomeAssetResults{display:grid;gap:8px;max-height:260px;overflow:auto}#incomeAssetResults button{text-align:left;background:#fff;color:#173d59;border:1px solid #c8d6df;display:grid;gap:5px;overflow-wrap:anywhere}#incomeAssetResults button small{color:#52687a}#incomeAssetResults button:disabled{opacity:.75;cursor:default}#incomeAssetResults button:focus-visible{outline:3px solid #e7b45a;outline-offset:1px}`;document.head.append(style);
 const select=panel.querySelector('#incomeAssetId'),search=panel.querySelector('#incomeAssetSearch'),results=panel.querySelector('#incomeAssetResults'),status=panel.querySelector('#incomeAssetSearchStatus'),incomeType=panel.querySelector('#incomeType'),originMine=panel.querySelector('#incomeOriginMine'),originHint=panel.querySelector('#incomeOriginHint');
 const updateSelection=mountAssetSelection(form,summary,search);
 let mode='registered',lastItemId='',newValues={},registeredId='';
 const input=name=>panel.querySelector(`[data-income-asset-input="${name}"]`),currentItem=()=>{const data=window.SKPlaza?.getData?.()||{};return(data.inventoryCriteria||[]).find(item=>item.id===form.elements.itemId.value)},selectedAsset=()=> (window.SKPlaza?.getData?.().assets||[]).find(row=>row.id===registeredId);
 const classAssets=item=>{const type=norm(itemName(item));return(window.SKPlaza?.getData?.().assets||[]).filter(asset=>!window.SKPlaza.incomeHasAsset(asset.id)&&!asset.deleted&&!/dado\/?a? de baja|retirado|desechado/i.test(`${asset.estado||''} ${asset.ubicacion||''}`)&&norm(asset.clase)===type).sort((a,b)=>assetNumber(a).localeCompare(assetNumber(b),'es',{numeric:true}))};
 const blockedReason=asset=>/dado\/?a? de baja|retirado|desechado/i.test(`${asset.estado||''} ${asset.ubicacion||''}`)?'Este activo está dado de baja o retirado.':norm(asset.ubicacion)==='bodega de superficie'?'Este activo ya está en Bodega de Superficie. No necesita otro ingreso.':'';
 const matches=query=>query.rows(classAssets(currentItem()),asset=>[
  assetLabel(asset),blockedReason(asset)||[asset.ubicacion||'Sin ubicación registrada',asset.minaOrigen&&'Origen: '+asset.minaOrigen].filter(Boolean).join(' · ')
 ]);
 const fillMines=()=>{const current=originMine.value,values=window.SKFormOptions?.values?.('asset.owner')||['Sandra K','Providencia','El Silencio','Carla','Alianza'];originMine.replaceChildren(new Option('Seleccionar…',''),...values.map(value=>new Option(value,value)));if(current&&!values.includes(current))originMine.add(new Option(current,current));originMine.value=current};
 const markingContext=()=>{const special=isRepairClass(itemName(currentItem())),external=special&&incomeType.value==='REPARACIÓN'&&!!originMine.value&&!isSandraK(originMine.value);return{clase:itemName(currentItem()),minaOrigen:originMine.value,activoExterno:external,incomeMarking:special&&!!originMine.value&&!!incomeType.value&&window.SKPlaza?.getData?.().capabilities?.externalIncomeV1===true}};
 const rememberNew=()=>{if(mode==='new')newValues.areaAsignada=input('areaAsignada').value;if(mode==='new')for(const name of Object.keys(incomeFields(currentItem(),true,markingContext())))newValues[name]=input(name).value};
 const configure=()=>{
  const item=currentItem(),fixed=isFixed(item),special=fixed&&isRepairClass(itemName(item)),isNew=mode==='new',asset=isNew?null:selectedAsset(),fields=incomeFields(item,isNew,markingContext());
  panel.hidden=!fixed;quantityField.hidden=!!fixed;quantityField.style.display=fixed?'none':'';form.elements.quantity.disabled=!!fixed;form.elements.quantity.required=!fixed;if(fixed)form.elements.quantity.value='1';
  for(const button of panel.querySelectorAll('[data-income-mode]'))button.setAttribute('aria-pressed',String(button.dataset.incomeMode===mode));
  const editing=fixed&&isNew;
  panel.querySelector('.incomeAssetSearchField').hidden=isNew;
  search.disabled=!fixed||isNew;status.hidden=isNew||!!asset;results.hidden=isNew||!!asset;
  const areaControl=input('areaAsignada');
  areaControl.closest('label').hidden=!editing;areaControl.disabled=!editing;
  if(editing){
   fillAssetArea(areaControl,newValues.areaAsignada||'');
   incomeManufacturerControl(panel,item);
  }
  for(const [name,enabled] of Object.entries(fields)){
   const control=input(name),show=editing&&enabled;
   control.closest('label').hidden=!show||(name==='numeroYT'&&automaticClassNumber(itemName(item)));
   control.disabled=!show;control.required=show&&requiredField(name,item);
   control.value=editing?(newValues[name]||''):'';
  }
  if(isNew&&automaticClassNumber(itemName(item)))input('numeroYT').value=nextClassNumber(itemName(item));
  for(const control of [incomeType,originMine]){control.closest('label').hidden=!special;control.disabled=!special;control.required=special}
  const registeredMine=asset?clean(asset.mina||asset.minaOrigen):'';
  if(special&&registeredMine){if(!Array.from(originMine.options).some(option=>option.value===registeredMine))originMine.add(new Option(registeredMine,registeredMine));originMine.value=registeredMine;}
  originMine.disabled=!special||!!registeredMine;
  originMine.closest('label').hidden=originMine.disabled;
  summary.hidden=!fixed||!asset;
  if(!summary.hidden)renderSelectedAsset(summary,item,asset,special?registeredMine:'');
  updateSelection(fixed&&!isNew,item,asset);
  originHint.hidden=!special;
  const context=markingContext(),markSeparator=window.SKPlaza?.getData?.().capabilities?.externalMarkSeparator==='-'?'-':'';
  originHint.textContent=!special?'':incomeType.value==='TRASLADO'?'El activo quedará asignado a Sandra K. '+(isNew&&context.incomeMarking?'Recibirá una marca de la secuencia de tres letras de Sandra K.':'Se conserva su identificación.'):incomeType.value==='REPARACIÓN'?'Ingreso para reparación; se conserva la mina propietaria. '+(isNew&&context.activoExterno?(context.incomeMarking?`La marca llevará el prefijo ${prefixFor(originMine.value)||'de la mina'}${markSeparator?', un guion':''} y dos letras únicas (ej.: ${prefixFor(originMine.value)||'P'}${markSeparator}AA). Se conservará cuando regrese.`:'Conserva la marca de origen del equipo.'):''):'Indica si llega asignado a Sandra K o para reparación.';
  const hint=panel.querySelector('.assetRegisterHint');
  hint.hidden=!!asset;
  hint.textContent=isNew?newAssetHint(item):'Busca y selecciona un activo existente. Si aún no está registrado, elige ACTIVO NUEVO.';
  select.replaceChildren(new Option('Seleccionar…',''));if(fixed&&(isNew||asset)){select.add(new Option(isNew?'Nuevo activo':assetLabel(asset),isNew?'__new__':asset.id));select.value=isNew?'__new__':asset.id}
 };
 const choose=asset=>{if(blockedReason(asset))return;registeredId=asset.id;search.value=window.SKAssetRules.isColumn(asset)?(window.SKAssetRules.columnIdentity(asset).number||window.SKAssetRules.columnIdentity(asset).mark):(window.SKAssetRules.searchSerial(asset.serial)||asset.marcaActual||asset.marcaInterna||assetNumber(asset));const mine=clean(asset.mina||asset.minaOrigen);if(mine){if(!Array.from(originMine.options).some(option=>option.value===mine))originMine.add(new Option(mine,mine));originMine.value=mine}configure()};
 const renderSearch=()=>{
  const item=currentItem();if(!isFixed(item)||mode!=='registered')return;
  const query=clean(search.value),matcher=window.SKAssetSearch.query(query),rows=matches(matcher);results.replaceChildren();results.hidden=false;
  status.textContent=rows.length?`${rows.length} ${rows.length===1?'activo encontrado':'activos encontrados'}. Selecciona el que ingresa.`:query?`No se encontró un activo con “${query}”. Si no está registrado, elige ACTIVO NUEVO.`:'No hay activos registrados de esta clase. Elige ACTIVO NUEVO para registrarlo.';
  rows.slice(0,20).forEach(({asset,lines,detail})=>{
   const button=document.createElement('button'),label=document.createElement('b'),note=document.createElement('small');
   button.type='button';button.dataset.incomeAsset=asset.id;button.disabled=!!blockedReason(asset);
   label.innerHTML=matcher.html(lines[0]);note.innerHTML=matcher.html([lines[1],detail].filter(Boolean).join(' · '));
   button.append(label,note);button.addEventListener('click',()=>choose(asset));results.append(button);
  });
 };
 const refresh=()=>{const id=form.elements.itemId.value;if(id!==lastItemId){lastItemId=id;mode='registered';newValues={};registeredId='';search.value='';incomeType.value='';originMine.value='';panel.querySelector('#incomeCondition').value=''}fillMines();configure();if(!registeredId)renderSearch()};
 panel.querySelector('[data-class-number-info]').addEventListener('click',()=>alert(CLASS_NUMBER_HELP));
 panel.querySelectorAll('[data-income-mode]').forEach(button=>button.addEventListener('click',()=>{rememberNew();mode=button.dataset.incomeMode;configure();if(mode==='registered'&&!registeredId)renderSearch()}));
 search.addEventListener('input',()=>{
  if(registeredId&&originMine.disabled)originMine.value='';
  registeredId='';configure();renderSearch();
 });
 search.addEventListener('keydown',event=>{if(event.key==='ArrowDown'){const first=results.querySelector('button:not(:disabled)');if(first){event.preventDefault();first.focus()}}if(event.key==='Enter'){event.preventDefault();const rows=matches(window.SKAssetSearch.query(search.value)).filter(({asset})=>!blockedReason(asset));if(rows.length===1)choose(rows[0].asset)}});
 for(const control of [incomeType,originMine])control.addEventListener('change',()=>{rememberNew();configure()});
 panel.addEventListener('focusin',event=>{if(event.target===input('fabricante'))recentManufacturerControl(event.target,itemName(currentItem()))});
 form.elements.itemId.addEventListener('change',refresh);
 form.addEventListener('reset',()=>setTimeout(()=>{lastItemId='__reset__';refresh()},0));
 window.addEventListener('skplaza-synced',()=>{rememberNew();refresh()});
 window.addEventListener('skweb-options-applied',()=>{rememberNew();refresh()});
 const captureCurrent=()=>{
  const item=currentItem();if(!isFixed(item))return{};
  const special=isRepairClass(itemName(item)),context=special?{incomeType:incomeType.value,originMine:clean((mode==='registered'&&(selectedAsset()?.mina||selectedAsset()?.minaOrigen))||originMine.value)}:{};
  if(special&&!['TRASLADO','REPARACIÓN'].includes(context.incomeType)){alert('Selecciona TIPO DE INGRESO: TRASLADO o REPARACIÓN.');return null}if(special&&!context.originMine){alert('Selecciona la MINA DE ORIGEN.');return null}
  const condition=panel.querySelector('#incomeCondition');
  const receivedState=condition.value;
  if(!receivedState){alert('Selecciona el ESTADO AL INGRESAR.');condition.focus();return null}
  context.receivedState=receivedState;
  if(mode==='registered'){const asset=selectedAsset();if(!asset){alert('Busca y selecciona el ACTIVO REGISTRADO.');return null}const reason=blockedReason(asset);if(reason){alert(reason);return null}return{assetId:asset.id,assetLabel:assetLabel(asset),...context}}
  rememberNew();if(automaticClassNumber(itemName(item)))input('numeroYT').value=nextClassNumber(itemName(item));const candidate=readAssetFields(incomeFields(item,true,markingContext()),input,itemName(item));
  if(automaticClassNumber(candidate.clase))candidate.classNumberPolicy='auto-v1';candidate.areaAsignada=clean(input('areaAsignada').value);candidate.numeroClase=candidate.numeroYT;candidate.marcaActual=candidate.marcaInterna||'';
  if(special){const marking=markingContext();if(marking.incomeMarking&&marking.activoExterno&&!prefixFor(context.originMine)){alert('La mina seleccionada necesita un prefijo de marcación. Solicita al administrador que lo configure.');return null}Object.assign(candidate,{mina:context.incomeType==='TRASLADO'?'Sandra K':context.originMine,minaOrigen:context.originMine,tipoIngresoInicial:context.incomeType,activoExterno:marking.activoExterno,incomeMarking:marking.incomeMarking})}
  if(!validAssetForm(item,candidate,input))return null;
  const found=duplicate(window.SKPlaza?.getData?.().assets||[],candidate);if(found){alert(`Este activo ya está registrado: ${assetLabel(found)}. Elige ACTIVO REGISTRADO para buscarlo.`);return null}
  return{assetCandidate:candidate,assetLabel:assetLabel(candidate),...context};
 };
 const checkDraft=(draft,data,known)=>{
  const asset=draft.assetCandidate;
  if(automaticClassNumber(asset.clase)){asset.numeroYT=window.SKAssetRules.classNumber(known,asset);asset.numeroClase=asset.numeroYT;}
  const item=(data?.inventoryCriteria||[]).find(row=>row.id===draft.itemId);
  const issue=newAssetIssue(item,asset);
  if(issue)throw new Error(issue.message);
 };
 const commit=(draft,timestamp,person,snapshot,recordedAt=timestamp,shift)=>{
  const data=snapshot||window.SKPlaza?.getData?.(),user=window.SKPlaza?.getUser?.();if(!data)return null;
  let asset;if(draft.assetCandidate){checkDraft(draft,data,data.assets||[]);if(duplicate(data.assets||[],draft.assetCandidate))throw new Error('El activo ya fue registrado. Selecciónalo como ACTIVO REGISTRADO.');asset={id:uuid(),mina:'Sandra K',...draft.assetCandidate,...initialArrivalDetails(timestamp,person,shift),criteriaId:draft.itemId,ubicacion:'Bodega de Superficie',estado:'Operativo/a',disponibleEntrega:'Sí',fechaIngreso:initialArrivalDate(timestamp),createdAt:timestamp,recordedAt,updatedAt:recordedAt,syncState:'pending',registeredFrom:'plaza-income',registeredBy:user?.documento||''};if(asset.areaAsignada)asset.areaAsignadaRevision={value:asset.areaAsignada,at:asset.createdAt};Object.assign(asset,window.SKAssetMarking.prepare(asset));(data.assets||(data.assets=[])).push(asset)}else asset=(data.assets||[]).find(row=>row.id===draft.assetId);
  if(asset){asset.ubicacion='Bodega de Superficie';asset.updatedAt=recordedAt;asset.syncState='pending';if(draft.incomeType){asset.ultimoTipoIngreso=draft.incomeType;asset.ultimaMinaOrigen=draft.originMine;if(!asset.minaOrigen)asset.minaOrigen=draft.originMine;if(draft.incomeType==='TRASLADO')asset.mina='Sandra K';else if(!asset.mina)asset.mina=draft.originMine;asset.activoExterno=!isSandraK(asset.mina);asset.ingresoTemporal=draft.incomeType==='REPARACIÓN'&&!isSandraK(asset.mina||asset.minaOrigen);if(draft.incomeType==='REPARACIÓN'){asset.estado='En reparación';asset.disponibleEntrega='No'}}}
  if(asset&&draft.receivedState){asset.estado=draft.receivedState;asset.disponibleEntrega=draft.receivedState==='Operativo/a'?'Sí':'No'}
  return asset||null;
 };
 const validateBatch=batch=>{
  const data=window.SKPlaza?.getData?.(),known=data?.assets||[],candidates=[],ids=new Set();
  for(const draft of batch){if(draft.assetCandidate){checkDraft(draft,data,known.concat(candidates));draft.assetLabel=assetLabel(draft.assetCandidate);const found=duplicate(known.concat(candidates),draft.assetCandidate);if(found)throw new Error('El lote contiene un activo ya registrado o repetido. Revisa marca, serial y número de clase.');candidates.push(draft.assetCandidate)}else if(draft.assetId){if(ids.has(draft.assetId))throw new Error('Este activo ya está agregado al ingreso.');ids.add(draft.assetId);const asset=known.find(row=>row.id===draft.assetId&&!row.deleted);if(!asset)throw new Error('El activo seleccionado ya no está disponible.');const reason=blockedReason(asset);if(reason)throw new Error(reason);
   if(draft.incomeType==='TRASLADO'){
    const target={...asset,mina:'Sandra K'},conflict=window.SKAssetRules.mineIdentifierConflict(known.concat(candidates),target,asset);
    if(conflict)throw new Error(conflict.field+' '+conflict.value+' ya existe en Sandra K para la clase '+asset.clase+'.');
    if(window.SKAssetRules.duplicateNewMark(known.concat(candidates),target))throw new Error('La marca de este activo ya existe en Sandra K.');
    candidates.push(target);
   }
  }}
 };
 window.SKPlazaIncomeAsset={captureCurrent,commit,validateBatch};refresh();
}
window.addEventListener('DOMContentLoaded',()=>{mount();mountIncome()},{once:true});
})();

