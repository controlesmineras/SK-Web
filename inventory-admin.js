// Administración del catálogo y existencias que comparte SK Admin con Plaza Blending.
(()=>{
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=s=>String(s||'').trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');
function matchesItemSearch(text,number,query,code=''){
 const q=norm(query),reference=norm(code);
 if(q&&q===reference)return true;
 const haystack=norm([text,reference].filter(Boolean).join(' '));
 const requested=q.match(/\bitem\s*(\d+)\b/);
 if(requested){
  const actual=String(number??'').trim()||haystack.match(/\bitem\s*(\d+)\b/)?.[1]||'';
  const rest=q.replace(requested[0],' ').replace(/\s+/g,' ').trim();
  return actual===requested[1]&&(!rest||haystack.includes(rest));
 }
 if(/^\d+$/.test(q)&&String(number??'').trim())return String(number).trim()===q;
 return !q||haystack.includes(q);
}
const inventoryUnitValues=()=>{const units=window.SKFormOptions?.values('inventory.unit',['Unidad','Par','Rollo'])||['Unidad','Par','Rollo'];return units.some(unit=>norm(unit)===norm('Rollo'))?units:[...units,'Rollo']};
const INVENTORY_UNITS={map:callback=>inventoryUnitValues().map(callback),find:callback=>inventoryUnitValues().find(callback)};
const boolFields=['allowAccessories','isYtSpare','isFixedAsset','usesSerial','usesLength','usesModel','usesManufacturer','requiresInternalMark','isEpp','allowAssignment','allowLoan','allowTransfer','allowRemission','fractionable'];
let catalogKind='common';
const currentSpareType=()=>document.querySelector('#inventoryItemForm')?.elements.spareEquipment.value||'YT 29';
const defaultEnabledOperations=new Set(['allowAssignment','allowTransfer','allowRemission']);
const itemName=x=>x?.name||x?.nombre||x?.elemento||x?.CI_ELEMENTO||x?.ciElemento||'';
const itemSecondary=x=>x?.secondaryName||x?.nombreSecundario||x?.CI_NOMBRE_SECUNDARIO||x?.CI_ALIAS_SECUNDARIO||x?.aliasSecundario||'';
const itemTertiary=x=>x?.tertiaryName||x?.nombreTerciario||x?.CI_NOMBRE_TERCIARIO||x?.CI_ALIAS_TERCIARIO||x?.aliasTerciario||'';
const itemUnit=x=>x?.unit||x?.unidadMedida||x?.CI_UNIDAD_MEDIDA||x?.ciUnidadMedida||'';
function injectStyle(){if(document.querySelector('#inventoryAdminStyle'))return;const s=document.createElement('style');s.id='inventoryAdminStyle';s.textContent=`#inventoryItems .invToolbar{display:flex;gap:10px;flex-wrap:wrap;margin:12px 0}#inventoryItems .invToolbar.invCatalogTabs{display:grid;grid-template-columns:minmax(0,max-content) minmax(0,max-content) auto;align-items:center;justify-content:center;gap:6px;text-align:center}
#inventoryItems .invCatalogTabs [data-catalog-kind]{min-width:0;white-space:normal}
#inventoryItems .invWarehouseButtons{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin:12px 0}
#inventoryItems .invWarehouseButtons button{min-height:44px;padding:8px 18px}
#inventoryItems{container:inventory-catalog / inline-size}
#inventoryItems .invCatalogHeader{
 display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"title add" "tabs tabs";gap:0 10px
}
#inventoryCatalogTitle{grid-area:title}
#newInventoryItem{grid-area:add;justify-self:end}
#inventoryItems .invCatalogHeader .invCatalogTabs{grid-area:tabs;margin-bottom:0}
@container inventory-catalog (min-width:62rem){
 #inventoryItems .invCatalogHeader{
  grid-template-columns:minmax(0,1fr) max-content minmax(0,1fr);grid-template-areas:"title tabs add"
 }
 #inventoryCatalogTitle{margin:0}
 #inventoryItems .invCatalogHeader .invCatalogTabs{
  position:relative;grid-template-columns:repeat(2,max-content);margin:0
 }
 #inventoryItems .invCatalogTabs .invCatalogInfo{position:absolute;inset-inline-start:calc(100% + 6px)}
}
#inventoryItems .invCatalogTabs .invCatalogInfo{width:38px;height:38px;padding:0;border:1px solid #9cc7dc;border-radius:50%;background:#edf6fb;color:#165775;font:bold 1.35rem Georgia,serif;text-transform:none}
#inventoryItems .invCatalogInfo[aria-expanded="true"]{background:#cce7f5}
#inventoryCatalogHelp[hidden]{display:none}
@media(max-width:480px){#inventoryItems .invCatalogTabs [data-catalog-kind]{padding:8px 5px;font-size:.78rem}}
#inventoryItems .invCatalogTabs button{border:2px solid transparent;background:#edf2f5;color:#183747}
#inventoryItems .invCatalogTabs button[aria-pressed="true"]{background:#165775;color:#fff;border-color:#9fdbed;box-shadow:inset 0 -2px #9fdbed}
#inventoryItems .invCatalogTabs button:focus-visible{outline:2px solid #fff;outline-offset:2px}
#inventoryItems .invToolbar input{flex:1;min-width:220px}#inventoryItems .invGrid{display:grid;grid-template-columns:minmax(280px,.9fr) minmax(320px,1.1fr);gap:18px}#inventoryItemList{grid-column:1;min-width:0}#inventoryItemForm{grid-column:2;min-width:0}.invList{display:grid;gap:8px;align-content:start}.invItem{width:100%;text-align:left;display:flex;justify-content:space-between;gap:12px;align-items:center}.invItem small{display:block}#inventoryItems .invMissingCriterion{background:#f1f3f5;color:#606a73;border:1px dashed #bbc3cb;box-shadow:none;opacity:1}#inventoryItems .invMissingCriterion small{color:#606a73;line-height:1.4;margin-top:4px}.invMissingAction{font-size:.8rem;flex:0 0 auto}#inventoryItemForm .invValidationSummary{grid-column:1/-1;background:#fff2f2;color:#9b1c1c;border:1px solid #d88;padding:12px;border-radius:8px;margin:0 0 12px}#inventoryItemForm [aria-invalid="true"]{border:2px solid #b42318!important;background:#fff5f5!important}#inventoryItemForm .invFieldError{display:block;color:#b42318;font-size:.82rem;margin-top:5px;font-weight:600}#inventoryItemForm>label[hidden]{display:none!important}.invQty{font-weight:800;white-space:nowrap}#inventoryItemForm>.invSpareApplication,#inventoryItemForm>h3,#inventoryItemForm>.invPerms,#inventoryItemForm>.invInitialNote,#inventoryItemForm>.invActions,#inventoryItemForm>.status{grid-column:1/-1}
#inventoryItemSearch{background:#fff;color:#182f40;border:1px solid #a9bac6}
#inventoryItemSearch::placeholder{color:#586c7a;opacity:1}
#inventoryItemCount{align-self:center;background:#edf4f8;color:#29475a}
#inventoryItemList{align-self:start;background:#edf3f7;border:1px solid #c8d7e1;border-radius:12px;padding:6px}
#inventoryItemList .invItem{background:#fff;color:#172f40;border:1px solid #cad7df}
#inventoryItemList .invPartUse{font-weight:400;color:#536875}
#inventoryItemList .invItem small{color:#425969}
#inventoryItemList .invMissingCriterion{border-style:dashed}
#inventoryItemList .invItem[aria-current="true"]{background:#d7eefb;color:#0d3a52;border:1px solid #17749b;box-shadow:inset 4px 0 #17749b}
#inventoryItemList .invItem:focus-visible{outline:2px solid #104d6a;outline-offset:1px}
#inventoryItems[data-catalog-kind="spare"] #inventoryItemList{gap:5px}
#inventoryItems[data-catalog-kind="spare"] .invItem{padding-block:8px;min-height:44px}
@media (min-width:761px){
 #inventoryItems[data-catalog-kind="spare"] .invGrid{position:relative}
 /* La ficha define la altura de la fila. Una lista corta ocupa solo su contenido. */
 #inventoryItems[data-catalog-kind="spare"] #inventoryItemList{
  position:absolute;grid-area:1 / 1 / 2 / 2;inset:0 0 auto;max-height:100%;overflow-y:auto
 }
}
#inventoryItemForm{container-type:inline-size}
#inventoryItems[data-catalog-kind="spare"] #inventoryItemForm{
 grid-template-columns:repeat(4,minmax(0,1fr));gap:8px 10px;padding:12px
}
#inventoryItems[data-catalog-kind="spare"] #inventoryItemForm>label{
 grid-column:span 2;min-width:0;gap:3px;font-size:.875rem;line-height:1.25
}
#inventoryItems[data-catalog-kind="spare"] #inventoryItemForm>label :is(input,select,textarea){
 min-width:0;font-size:1rem
}
#inventoryItems[data-catalog-kind="spare"] #inventoryFormTitle,
#inventoryItems[data-catalog-kind="spare"] .invInitialNote{margin:0}
#inventoryItems[data-catalog-kind="spare"] #inventoryItemForm>:is(.invPartName,.invSpareApplication){grid-column:1/-1}
#inventoryItems[data-catalog-kind="spare"] .invSpareApplication textarea{field-sizing:content;max-height:10rem;resize:vertical}
@container (min-width:38rem){
 #inventoryItems[data-catalog-kind="spare"] #inventoryItemForm>.invCompactField{grid-column:span 1}
 #inventoryItems[data-catalog-kind="spare"] #inventoryItemForm>:is(.invPartName,.invSpareApplication){grid-column:span 2}
}
@container (max-width:20rem){
 #inventoryItems[data-catalog-kind="spare"] #inventoryItemForm>.invAliasField{grid-column:1/-1}
}
#inventoryItemForm h3:has(+.invPerms){margin:4px 0 0}
#inventoryItemForm .invPerms{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}
@container (min-width:36rem){#inventoryItemForm .invPerms{grid-template-columns:repeat(3,minmax(0,1fr))}}
@container (max-width:15rem){#inventoryItemForm .invPerms{grid-template-columns:minmax(0,1fr)}}
#inventoryItemForm .invSwitchRow{position:relative;display:flex;flex-direction:row;align-items:center;justify-content:space-between;gap:6px;min-width:0;min-height:44px;padding:5px 8px;margin:0;border:1px solid #cbd5dd;border-radius:7px;background:#f6f8fa;color:#26384a;font-size:.85rem;line-height:1.2;font-weight:650;letter-spacing:normal;cursor:pointer}
#inventoryItemForm .invSwitchRow[hidden]{display:none}
#inventoryItemForm .invSwitchRow input{position:absolute;inset:0;width:100%;height:100%;min-height:0;margin:0;opacity:0;cursor:inherit}
#inventoryItemForm .invSwitchRow>span:first-child{min-width:0;overflow-wrap:anywhere}
#inventoryItemForm .invSwitchText{flex:none;font-size:.8rem;font-weight:750;color:#566575}
#inventoryItemForm .invSwitchRow:has(input:checked){background:#e1f2e9;border-color:#529476;color:#154d38}
#inventoryItemForm .invSwitchRow input:checked+.invSwitchText{color:#14563b}
#inventoryItemForm .invSwitchRow:has(input:focus-visible){outline:2px solid #145575;outline-offset:2px}
#inventoryItemForm .invContainerUnit{grid-column:1/-1}
.invContainerUnit{display:block;margin:0 0 20px;padding:2px 14px 8px}.invContainerUnit[hidden]{display:none!important}.invInitialNote{font-size:.86rem;opacity:.75}.invBadge{font-size:.75rem;padding:3px 7px;border-radius:999px;background:rgba(0,0,0,.08)}#inventoryItemForm{align-content:start}
#inventoryItems .invSpareFilters{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:12px 0;max-width:640px}#inventoryItems .invSpareFilters[hidden]{display:none}#inventoryItems .invSpareFilters button{min-width:0;padding:9px 10px;border:1px solid #b5c2cd;border-radius:6px;background:#edf4f9;color:#173d59;font-size:.9rem}#inventoryItems .invSpareFilters button[aria-pressed="true"]{background:#173d59;color:#fff;border-color:#173d59}#inventoryItems .invSpareFilters button:focus-visible{outline:3px solid #608db0;outline-offset:2px}@media(max-width:520px){#inventoryItems .invSpareFilters{grid-template-columns:repeat(2,minmax(0,1fr))}}
#inventoryItemForm .invActions{display:flex!important;align-items:center!important;justify-content:center!important;gap:8px!important;flex-wrap:wrap;height:auto!important;min-height:0!important}
#inventoryItemForm .invActions>button{height:auto!important;min-height:44px!important;padding:10px 14px!important;align-self:center!important;flex:0 1 auto!important;margin:0!important}
#inventoryItemForm .invActions>button[hidden],#inventoryItemStatus[hidden]{display:none!important}
#inventoryItemForm>#inventoryItemStatus{position:static!important;margin:0;align-self:start}
@media(max-width:760px){#inventoryItemForm .invActions>button{flex:1 1 100%!important;width:100%!important}}.invDanger{background:#fff;border:1px solid #a33;color:#922}@media(max-width:760px){#inventoryItems .invGrid{grid-template-columns:1fr}#inventoryItemList,#inventoryItemForm{grid-column:1}.invContainerUnit{padding-left:11px;padding-right:11px}}`;document.head.append(s)}
const sw=(name,label,checked='')=>`<label class="invSwitchRow"><span>${label}</span><input name="${name}" type="checkbox" ${checked}><span class="invSwitchText" aria-hidden="true">No</span></label>`;
function syncSwitchText(root=document){root.querySelectorAll('.invSwitchRow input[type="checkbox"]').forEach(i=>{const t=i.parentElement.querySelector('.invSwitchText');if(t)t.textContent=i.checked?'Sí':'No'})}
function syncFractionableField(root=document){const f=root.closest?.('form')||root.querySelector?.('#inventoryItemForm')||document.querySelector('#inventoryItemForm');if(!f)return;const on=!!f.elements.fractionable?.checked,wrap=f.querySelector('.invContainerUnit'),input=f.elements.containerUnit;if(wrap)wrap.hidden=!on;if(input){input.disabled=!on;input.required=on;if(!on)input.value=''}}
function syncFixedAssetFields(root=document){
 const f=root.closest?.('form')||root.querySelector?.('#inventoryItemForm')||document.querySelector('#inventoryItemForm');if(!f)return;
 const fixed=!!f.elements.isFixedAsset?.checked,unit=f.elements.unit;
 if(unit){
  if(fixed){
   if(unit.dataset.fixedUnit!=='1')unit.dataset.nonFixedUnit=unit.value;
   if(!Array.from(unit.options).some(option=>option.value==='Unidad'))unit.add(new Option('Unidad','Unidad'));
   unit.value='Unidad';unit.dataset.fixedUnit='1';
  }else if(unit.dataset.fixedUnit==='1'){
   unit.value=unit.dataset.nonFixedUnit||'';delete unit.dataset.fixedUnit;delete unit.dataset.nonFixedUnit;
  }
  unit.disabled=fixed;unit.required=!fixed;unit.closest('label').hidden=fixed;
 }
 const accessories=f.elements.allowAccessories;if(accessories){accessories.disabled=!fixed;accessories.closest('label').hidden=!fixed;}
}
function syncSpareFields(f){
 const on=!!f.elements.isYtSpare.checked;
 if(f.elements.itemKind)f.elements.itemKind.value=on?'spare':'common';
 f.elements.spareEquipment.disabled=!on;
 for(const key of ['spareItemNumber','spareItemName','spareApplication','sparePartCode']){
  const input=f.elements[key];input.closest('label').hidden=!on;input.disabled=!on;
  input.required=on&&key==='spareItemName';
 }
 f.elements.name.closest('label').hidden=on;f.elements.name.required=!on;
 syncSpareFilterButtons();
 if(on){
  const equipment=f.elements.spareEquipment.value,number=f.elements.spareItemNumber.value.trim(),name=f.elements.spareItemName.value.trim();
  f.elements.name.value=window.SKSpareGroups.recordName({isYtSpare:true,spareEquipment:equipment,spareItemNumber:number,spareItemName:name});
 }
}
const spareUse=item=>item.spareApplication||item.application||item.ubicacionAplicacion||'';
function matchesCatalogItem(item,query){
 if(!query)return true;
 const spare=quantityFlag(item.isYtSpare);
 const text=[itemName(item),spare&&window.SKSpareGroups.recordName(item),itemSecondary(item),itemTertiary(item),
  itemUnit(item),spare&&spareUse(item),item.id].filter(Boolean).join(' ');
 return matchesItemSearch(text,item.spareItemNumber,query,spare?item.sparePartCode:'');
}
const validationLabels={name:'Nombre del elemento',unit:'Unidad de medida',spareEquipment:'Tipo de repuesto',spareItemName:'Nombre del ítem',containerUnit:'Unidad contenedora'};
function clearValidation(f){
 delete f.dataset.validationAttempted;
 f.querySelectorAll('[aria-invalid]').forEach(field=>{field.removeAttribute('aria-invalid');field.removeAttribute('aria-errormessage')});
 f.querySelectorAll('.invFieldError').forEach(error=>error.remove());
 const summary=f.querySelector('#inventoryValidationSummary');if(summary){summary.hidden=true;summary.textContent=''}
}
function validateInventory(f,focus=false){
 clearValidation(f);f.dataset.validationAttempted='1';const invalid=[];
 for(const field of f.querySelectorAll('input,select,textarea')){
  if(field.disabled||!field.willValidate||field.closest('label')?.hidden)continue;
  const missing=field.required&&!String(field.value).trim();
  if(!missing&&field.validity.valid)continue;
  invalid.push(field);field.setAttribute('aria-invalid','true');
  const error=document.createElement('span');error.className='invFieldError';error.id='inv-error-'+field.name;
  error.textContent=missing?'Completa este campo obligatorio.':'Revisa el valor de este campo.';
  field.setAttribute('aria-errormessage',error.id);field.closest('label')?.append(error);
 }
 const summary=f.querySelector('#inventoryValidationSummary');
 if(summary&&invalid.length){summary.hidden=false;summary.textContent='Faltan datos o hay valores inválidos. Completa o corrige: '+invalid.map(field=>validationLabels[field.name]||field.name).join(', ')+'.';}
 if(focus&&invalid.length){invalid[0].scrollIntoView({behavior:'smooth',block:'center'});invalid[0].focus({preventScroll:true});}
 return invalid.length===0;
}
function bindValidation(f){
 const update=()=>{if(f.dataset.validationAttempted)validateInventory(f)};
 f.addEventListener('input',update);f.addEventListener('change',update);
}
function mount(){if(document.querySelector('#inventoryItems'))return;injectStyle();const main=document.querySelector('main');if(!main)return;const sec=document.createElement('section');sec.id='inventoryItems';sec.className='view';sec.innerHTML=`<div class="sectionHead invCatalogHeader"><h2 id="inventoryCatalogTitle">Elementos de inventario</h2>
<div class="invToolbar invCatalogTabs" role="group" aria-label="Tipo de criterio de inventario"><button type="button" data-catalog-kind="common" aria-pressed="true">ELEMENTOS COMUNES</button><button type="button" data-catalog-kind="spare" aria-pressed="false">CRITERIOS YT/COLUMNA</button><button type="button" id="inventoryHelpToggle" class="invCatalogInfo" aria-label="Información sobre los criterios de inventario" aria-expanded="false" aria-controls="inventoryCatalogHelp">i</button></div>
<button type="button" id="newInventoryItem">+ Agregar elemento</button></div>
<div class="invWarehouseButtons" role="group" aria-label="Editar cantidades por bodega"><button type="button" data-quantity-warehouse="plaza">PLAZA B.</button><button type="button" data-quantity-warehouse="production">PRODUCCIÓN</button></div>
<p id="inventoryCatalogHelp" class="hint" hidden>Elige primero Elemento común o Repuesto YT o Columna. Los repuestos quedan disponibles en Plaza Blending y en Consumo de Producción según su tipo. En Plaza Blending se agrupan automáticamente; cada ítem conserva su existencia.</p><div id="spareCatalogFilter" class="invSpareFilters" role="group" aria-label="Tipo de repuesto" hidden><button type="button" data-spare-filter="YT 29" aria-pressed="false">YT29</button><button type="button" data-spare-filter="YT 28" aria-pressed="false">YT28</button><button type="button" data-spare-filter="Columna 29" aria-pressed="false">COLUMNA 29</button><button type="button" data-spare-filter="Columna 28" aria-pressed="false">COLUMNA 28</button></div><div class="invToolbar"><input id="inventoryItemSearch" type="search" aria-label="Buscar elemento" placeholder="Buscar elemento…" autocomplete="off"><span id="inventoryItemCount" class="invBadge"></span></div><div class="invGrid"><div id="inventoryItemList" class="invList"></div><form id="inventoryItemForm" novalidate><input type="hidden" name="id"><h3 id="inventoryFormTitle">Datos del elemento</h3><p id="inventoryValidationSummary" class="invValidationSummary" role="alert" hidden></p><input name="itemKind" type="hidden" value="common"><input name="isYtSpare" type="checkbox" hidden><input type="hidden" name="spareEquipment" value="YT 29" disabled>
<label class="invCompactField" hidden># DE ÍTEM<input name="spareItemNumber" disabled autocomplete="off"></label>
<label class="invCompactField" hidden>CÓDIGO DE ELEMENTO<input name="sparePartCode" disabled autocomplete="off"></label>
<label class="invPartName" hidden>NOMBRE DEL ÍTEM<input name="spareItemName" disabled autocomplete="off"></label>
<label>NOMBRE DEL ELEMENTO<input name="name" required autocomplete="off"></label>
<label class="invAliasField">NOMBRE SECUNDARIO<input name="secondaryName"></label>
<label class="invAliasField">NOMBRE TERCIARIO<input name="tertiaryName"></label>
<label class="invCompactField">UNIDAD DE MEDIDA<select name="unit" required><option value="">Seleccionar…</option>${INVENTORY_UNITS.map(x=>`<option value="${x}">${x}</option>`).join('')}</select></label>
<label class="invSpareApplication" hidden>UBICACIÓN O APLICACIÓN<textarea name="spareApplication" rows="1" placeholder="Opcional. Ej.: Va con el pin de ajuste del cabezal" disabled></textarea></label>
<h3>¿Qué información utiliza?</h3><div class="invPerms">${sw('isFixedAsset','Es activo fijo')}${sw('allowAccessories','Permite registrar accesorios')}${sw('usesSerial','Usa serial')}${sw('usesLength','Usa largo (ft)')}${sw('usesModel','Usa modelo')}${sw('usesManufacturer','Usa fabricante / marca comercial')}${sw('requiresInternalMark','Requiere marca interna')}${sw('isEpp','Es EPP')}</div><h3>¿Qué operaciones permite?</h3><div class="invPerms">${sw('allowAssignment','Asignaciones','checked')}${sw('allowLoan','Préstamos')}${sw('allowTransfer','Traslados','checked')}${sw('allowRemission','Remisiones','checked')}${sw('fractionable','Permite entrega fraccionada')}<label class="invContainerUnit" hidden>UNIDAD CONTENEDORA<input name="containerUnit" placeholder="Rollo, carrete, galón…" disabled></label></div><div class="invActions"><button type="submit" id="inventoryItemSave">Guardar elemento</button><button type="button" id="inventoryItemDeactivate" class="invDanger" hidden>Retirar elemento</button><button type="button" id="inventoryItemCancel" class="adminFormCancel">CANCELAR</button></div><p id="inventoryItemStatus" class="status" hidden></p></form></div>`;main.append(sec);bind();syncSwitchText(sec);syncFractionableField(sec);syncFixedAssetFields(sec);syncSpareFields(sec.querySelector("form"));render()}
let renderVersion=0;
async function render(){
 const form=document.querySelector('#inventoryItemForm');
 if(!form||typeof all!=='function'||typeof db==='undefined'||!db)return;
 const version=++renderVersion,[criteria,assets]=await Promise.all([all('inventoryCriteria'),all('assets')]);if(version!==renderVersion)return;
 const q=norm(document.querySelector('#inventoryItemSearch')?.value),active=criteria.filter(x=>!x.deleted&&x.active!==false&&(catalogKind==='spare'?x.isYtSpare:!x.isYtSpare)&&(catalogKind!=='spare'||x.spareEquipment===currentSpareType()));
 const registeredNames=new Set(active.flatMap(x=>[itemName(x),itemSecondary(x),itemTertiary(x)].map(norm).filter(Boolean))),registeredIds=new Set(active.map(x=>x.id)),classes=new Map();
 for(const asset of catalogKind==='spare'?[]:assets){
  if(asset.deleted)continue;
  const name=String(asset.clase||'').trim(),key=norm(name);
  if(!key||registeredNames.has(key)||registeredIds.has(asset.criteriaId)||q&&!key.includes(q))continue;
  if(!classes.has(key))classes.set(key,name);
 }
 const ordered=catalogKind==='spare'?window.SKSpareGroups.parts(active,currentSpareType()):active;
 const rows=ordered.filter(item=>matchesCatalogItem(item,q)).map(item=>({name:item.isYtSpare?window.SKSpareGroups.recordName(item):itemName(item),item}));
 for(const name of classes.values())rows.push({name});
 if(catalogKind==='common')rows.sort((a,b)=>a.name.localeCompare(b.name,'es',{numeric:true,sensitivity:'base'}));
 const count=document.querySelector('#inventoryItemCount'),list=document.querySelector('#inventoryItemList');
 if(count)count.textContent=(q?`${rows.length} coincidencia${rows.length===1?'':'s'}`:`${rows.length} elementos`)+(classes.size?` · ${classes.size} sin criterio`:'');
 if(list)list.innerHTML=rows.map(({name,item})=>{
  if(!item)return `<button type="button" class="invItem invMissingCriterion" data-inv-class="${esc(name)}"><span><b>${esc(name)}</b><small>Solo en Activos fijos · Sin criterio de inventario</small></span><span class="invMissingAction">Crear criterio</span></button>`;
  const unit=itemUnit(item);
  const application=item.isYtSpare&&spareUse(item);
  return `<button type="button" class="invItem" data-inv-id="${esc(item.id)}"><span><b>${esc(name||'Sin nombre')}</b>${application?` <span class="invPartUse">${esc(application)}</span>`:''}<small>${item.isYtSpare&&item.sparePartCode?esc(item.sparePartCode)+' · ':''}${esc(unit)}</small></span></button>`;
 }).join('')||'<p class="hint">No hay elementos que coincidan.</p>';
 syncResultSelection(form);
}
function syncResultSelection(form){
 const id=form.elements.id.value,draftClass=form.dataset.sourceClass;
 document.querySelectorAll('#inventoryItemList .invItem').forEach(row=>{
  const selected=id ? row.dataset.invId===id : draftClass && row.dataset.invClass===draftClass;
  if(selected)row.setAttribute('aria-current','true');
  else row.removeAttribute('aria-current');
 });
}
function createClassCriterion(name){
 reset();const form=document.querySelector('#inventoryItemForm');form.dataset.sourceClass=name;syncResultSelection(form);form.elements.name.value=name;form.elements.isFixedAsset.checked=true;syncSwitchText(form);syncFixedAssetFields(form);
 const status=document.querySelector('#inventoryItemStatus');status.hidden=false;status.textContent='Esta clase existe en Activos fijos. Completa sus criterios y guarda el elemento.';
 form.scrollIntoView({behavior:'smooth',block:'start'});form.elements.name.focus({preventScroll:true});
}
function syncSpareFilterButtons(){
 const type=currentSpareType();
 document.querySelectorAll('[data-spare-filter]').forEach(button=>{button.setAttribute('aria-pressed',String(button.dataset.spareFilter===type));button.disabled=saving});
 const form=document.querySelector('#inventoryItemForm'),title=document.querySelector('#inventoryFormTitle');
 if(title&&form)title.textContent=form.elements.isYtSpare.checked?'Datos del repuesto · '+type.replace('YT ','YT'):'Datos del elemento';
}
function selectSpareType(type){
 if(saving||!window.SKSpareGroups.types.includes(type)||type===currentSpareType())return;
 const form=document.querySelector('#inventoryItemForm');form.elements.spareEquipment.value=type;syncSpareFields(form);render();
}
function openKind(kind){catalogKind=kind==='spare'?'spare':'common';mount();const spare=catalogKind==='spare',sec=document.querySelector('#inventoryItems');sec.dataset.catalogKind=catalogKind;document.querySelector('#inventoryCatalogTitle').textContent=spare?'CRITERIOS YT/COLUMNA':'Elementos de inventario';document.querySelector('#inventoryFormTitle').textContent=spare?'Datos del repuesto':'Datos del elemento';document.querySelector('#newInventoryItem').textContent=spare?'+ Agregar repuesto':'+ Agregar elemento';document.querySelector('#spareCatalogFilter').hidden=!spare;syncSpareFilterButtons();document.querySelector('#inventoryItemSearch').value='';sec.querySelectorAll('[data-catalog-kind]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.catalogKind===catalogKind)));reset();render();window.dispatchEvent(new Event('skweb-inventory-kind'));}
let editVersion=0,lastSavedItemId='';
function reset(){lastSavedItemId='';editVersion++;const f=document.querySelector('#inventoryItemForm'),type=currentSpareType();clearValidation(f);delete f.elements.unit.dataset.fixedUnit;delete f.elements.unit.dataset.nonFixedUnit;f.reset();f.elements.spareEquipment.value=type;f.elements.id.value='';delete f.dataset.sourceClass;syncResultSelection(f);f.elements.isYtSpare.checked=catalogKind==='spare';if(catalogKind==='spare')f.elements.unit.value='Unidad';f.elements.allowAssignment.checked=true;f.elements.allowLoan.checked=false;f.elements.allowTransfer.checked=true;f.elements.allowRemission.checked=true;syncSwitchText(f);syncFractionableField(f);syncFixedAssetFields(f);syncSpareFields(f);document.querySelector('#inventoryItemSave').textContent='Guardar elemento';document.querySelector('#inventoryItemDeactivate').hidden=true;document.querySelector('#inventoryItemStatus').hidden=true}
async function edit(id){const version=++editVersion;const criteria=await all('inventoryCriteria'),x=criteria.find(r=>r.id===id);if(!x||version!==editVersion)return;const f=document.querySelector('#inventoryItemForm');clearValidation(f);delete f.elements.unit.dataset.fixedUnit;delete f.elements.unit.dataset.nonFixedUnit;for(const [n,v] of Object.entries({id:x.id,name:itemName(x),unit:itemUnit(x),secondaryName:itemSecondary(x),tertiaryName:itemTertiary(x),spareEquipment:x.spareEquipment||"YT 29",spareItemNumber:x.spareItemNumber||"",spareItemName:x.spareItemName||"",sparePartCode:x.sparePartCode||"",spareApplication:x.spareApplication||""}))if(f.elements[n])f.elements[n].value=v;delete f.dataset.sourceClass;syncResultSelection(f);boolFields.forEach(n=>f.elements[n].checked=defaultEnabledOperations.has(n)?x[n]!==false:x[n]===true);syncSwitchText(f);syncFractionableField(f);syncFixedAssetFields(f);syncSpareFields(f);if(f.elements.fractionable.checked)f.elements.containerUnit.value=x.containerUnit||'';document.querySelector('#inventoryItemSave').textContent='Guardar cambios';document.querySelector('#inventoryItemDeactivate').hidden=false;document.querySelector('#inventoryItemDeactivate').textContent=x.isYtSpare?'Eliminar repuesto':'Retirar elemento';await render();if(version===editVersion)f.scrollIntoView({behavior:'smooth',block:'start'})}
let saving=false;
async function save(e){
 e.preventDefault();if(saving)return;
 const f=e.currentTarget,status=document.querySelector('#inventoryItemStatus'),button=document.querySelector('#inventoryItemSave'),cancel=document.querySelector('#inventoryItemCancel');
 syncSpareFields(f);if(!validateInventory(f,true))return;
 saving=true;button.disabled=cancel.disabled=true;syncSpareFilterButtons();let committed=false;
 try{
 syncSpareFields(f);
 if(f.elements.isYtSpare.checked&&(!["YT 29","Columna 29","YT 28","Columna 28"].includes(f.elements.spareEquipment.value)||!f.elements.spareItemName.value.trim())){f.reportValidity();
 return}const id=f.elements.id.value,criteria=await all('inventoryCriteria'),name=f.elements.name.value.trim(),secondaryName=f.elements.secondaryName.value.trim(),tertiaryName=f.elements.tertiaryName.value.trim(),rawUnit=f.elements.unit.value.trim(),unit=f.elements.isFixedAsset.checked?'Unidad':INVENTORY_UNITS.find(x=>norm(x)===norm(rawUnit))||'',candidateNames=[{field:'name',label:'nombre del elemento',value:name},{field:'secondaryName',label:'nombre secundario',value:secondaryName},{field:'tertiaryName',label:'nombre terciario',value:tertiaryName}].filter(x=>x.value),seen=new Map();
 if(!unit){status.hidden=false;
 status.textContent='Selecciona una unidad de medida válida: Unidad, Par o Rollo.';
 f.elements.unit.value='';
 f.elements.unit.focus();
 return}f.elements.unit.value=unit;
 for(const candidate of candidateNames){const key=norm(candidate.value),previous=seen.get(key);
 if(previous){status.hidden=false;
 status.textContent=`“${candidate.value}” está repetido como ${previous.label} y ${candidate.label} en este registro.`;
 f.elements[candidate.field].focus();
 return}seen.set(key,candidate)}const activeCriteria=criteria.filter(x=>!x.deleted&&x.active!==false&&x.id!==id),existingNames=[];
 for(const item of activeCriteria){const official=itemName(item)||'Elemento sin nombre';
 for(const entry of [{label:'nombre del elemento',value:item.isYtSpare?window.SKSpareGroups.recordName(item):itemName(item)},{label:'nombre secundario',value:itemSecondary(item)},{label:'nombre terciario',value:itemTertiary(item)}])if(entry.value)existingNames.push({...entry,official})}for(const candidate of candidateNames){const duplicate=existingNames.find(entry=>norm(entry.value)===norm(candidate.value));
 if(duplicate){status.hidden=false;
 status.textContent=`El ${candidate.label} “${candidate.value}” ya está utilizado como ${duplicate.label} de “${duplicate.official}”. Escribe un nombre diferente.`;
 f.elements[candidate.field].focus();
 return}}const t=new Date().toISOString(),item=id?criteria.find(x=>x.id===id):{id:uuid(),createdAt:t};
 if(!item)throw new Error('No se encontró el criterio que estás editando. Vuelve a seleccionarlo.');
 Object.assign(item,{allowAccessories:f.elements.isFixedAsset.checked&&f.elements.allowAccessories.checked,deliveryWarehouse:f.elements.isYtSpare.checked?'Producción':'',isYtSpare:f.elements.isYtSpare.checked,spareEquipment:f.elements.isYtSpare.checked?f.elements.spareEquipment.value:"",spareItemNumber:f.elements.isYtSpare.checked?f.elements.spareItemNumber.value.trim():"",spareItemName:f.elements.isYtSpare.checked?f.elements.spareItemName.value.trim():"",sparePartCode:f.elements.isYtSpare.checked?f.elements.sparePartCode.value.trim():"",spareApplication:f.elements.isYtSpare.checked?f.elements.spareApplication.value.trim():"",name,unit,secondaryName,tertiaryName,containerUnit:f.elements.fractionable.checked?f.elements.containerUnit.value.trim():'',isFixedAsset:f.elements.isFixedAsset.checked,usesSerial:f.elements.usesSerial.checked,usesLength:f.elements.usesLength.checked,usesModel:f.elements.usesModel.checked,usesManufacturer:f.elements.usesManufacturer.checked,requiresInternalMark:f.elements.requiresInternalMark.checked,isEpp:f.elements.isEpp.checked,allowAssignment:f.elements.allowAssignment.checked,allowLoan:f.elements.allowLoan.checked,allowTransfer:f.elements.allowTransfer.checked,allowRemission:f.elements.allowRemission.checked,fractionable:f.elements.fractionable.checked,active:true,deleted:false,updatedAt:t,syncState:'pending'});

 if(!name)throw new Error('Escribe el nombre del elemento.');
 await put('inventoryCriteria',item);committed=true;
 reset();lastSavedItemId=item.id;status.hidden=false;
 status.textContent=(id?'Cambios guardados en este dispositivo.':'Elemento guardado en este dispositivo.')+' Pendiente de sincronizar; se enviará al tener conexión.';
 window.dispatchEvent(new Event('skweb-inventory-refresh'));
 window.skSyncApi?.schedule?.(300);
 await render();
 }catch(error){
  status.hidden=false;
  status.textContent=committed?'El elemento quedó guardado. No se pudo actualizar el listado; vuelve a abrirlo.':'No se pudo guardar: '+(error?.message||error);
  console.error('SK Admin: guardar criterio',error);
 }finally{saving=false;button.disabled=cancel.disabled=false;syncSpareFilterButtons()}
}

async function deactivate(){
 const f=document.querySelector('#inventoryItemForm'),id=f.elements.id.value;if(!id)return;
 const criteria=await all('inventoryCriteria'),item=criteria.find(x=>x.id===id);if(!item)return;
 if(item.isYtSpare){
  if(!confirm(`¿Eliminar “${itemName(item)||'este repuesto'}”?\n\nSe eliminarán el repuesto, sus existencias y sus ingresos, entregas y consumos asociados. No conservará historial. Esta operación no se puede deshacer.`))return;
  const api=window.SKSpareCatalog,values=await Promise.all(api.deletionStores.map(all)),snapshot=Object.fromEntries(api.deletionStores.map((key,i)=>[key,values[i]]));
  await api.applyDeletion(api.deletionPlan(item,snapshot,new Date().toISOString()));
 }else{
  if(!confirm(`¿Retirar “${itemName(item)||'este elemento'}”?\n\nDejará de estar disponible para ingresos, entregas y existencias. Los movimientos históricos se conservarán.`))return;
  const t=new Date().toISOString();await put('inventoryCriteria',{...item,active:false,deleted:true,deactivatedAt:t,updatedAt:t,syncState:'pending'});
  for(const stock of (await all('inventoryStock')).filter(row=>row.itemId===id))await put('inventoryStock',{...stock,active:false,updatedAt:t,syncState:'pending'});
 }
 reset();await render();window.skSyncApi?.schedule?.(300);window.dispatchEvent(new Event('skweb-inventory-refresh'));window.dispatchEvent(new Event('skweb-consumption-changed'));await refresh();
}

function bind(){
 const criterionForm=document.querySelector('#inventoryItemForm');
 criterionForm.addEventListener('input',()=>{lastSavedItemId=''});
 criterionForm.addEventListener('change',()=>{lastSavedItemId=''});
 document.querySelectorAll('[data-quantity-warehouse]').forEach(button=>{
  button.addEventListener('click',()=>{
   const warehouse=button.dataset.quantityWarehouse;
   const itemId=criterionForm.elements.id.value||(warehouse==='production'?lastSavedItemId:'');
   const query=warehouse==='production'&&!lastSavedItemId?document.querySelector('#inventoryItemSearch').value.trim():'';
   window.SKAdminNav.go('inventoryQuantities',{warehouse,itemId,query});
  });
 });
 const helpButton=document.querySelector('#inventoryHelpToggle'),help=document.querySelector('#inventoryCatalogHelp');
 helpButton.addEventListener('click',()=>{
  help.hidden=!help.hidden;
  helpButton.setAttribute('aria-expanded',String(!help.hidden));
 });
 document.querySelectorAll('[data-catalog-kind]').forEach(b=>b.addEventListener('click',()=>openKind(b.dataset.catalogKind)));document.querySelector('#spareCatalogFilter').addEventListener('click',event=>{const button=event.target.closest('[data-spare-filter]');if(!button)return;selectSpareType(button.dataset.spareFilter)});const search=document.querySelector('#inventoryItemSearch');function searchCatalog(){lastSavedItemId='';return render()}search.addEventListener('input',searchCatalog);search.addEventListener('search',searchCatalog);document.querySelector('#inventoryItemList').addEventListener('click',e=>{const b=e.target.closest('[data-inv-id]');if(b)edit(b.dataset.invId);else{const missing=e.target.closest('[data-inv-class]');if(missing)createClassCriterion(missing.dataset.invClass)}});document.querySelector('#newInventoryItem').addEventListener('click',reset);document.querySelector('#inventoryItemCancel').addEventListener('click',reset);document.querySelector('#inventoryItemForm').addEventListener('change',e=>{if(e.target.name==='itemKind'){openKind(e.target.value);return}if(e.target.matches('.invSwitchRow input'))syncSwitchText(e.target.parentElement);if(e.target.name==='fractionable')syncFractionableField(e.currentTarget);if(e.target.name==='isFixedAsset')syncFixedAssetFields(e.currentTarget);if(['isYtSpare','spareItemNumber','spareItemName'].includes(e.target.name))syncSpareFields(e.currentTarget)});document.querySelector('#inventoryItemForm').addEventListener('input',e=>{if(['spareItemNumber','spareItemName'].includes(e.target.name))syncSpareFields(e.currentTarget)});document.querySelector('#inventoryItemForm').addEventListener('submit',save);document.querySelector('#inventoryItemDeactivate').addEventListener('click',deactivate);window.addEventListener('skweb-inventory-refresh',render);window.addEventListener('skweb-synced',render);window.addEventListener('skweb-options-applied',()=>syncFixedAssetFields());bindValidation(document.querySelector('#inventoryItemForm'))}
const quantityFlag=value=>value===true||['true','si','1','yes'].includes(norm(value));
const stockRevision=stock=>stock?.updatedAt||stock?.createdAt||'';
function isQuantityCriterion(item){
 return item?.id&&!item.deleted&&item.active!==false&&item.recordType!=='formOptions'&&
  item.id!=='SYSTEM-FORM-OPTIONS-V1'&&itemName(item)&&(!quantityFlag(item.isYtSpare)||window.SKAdminAuth.isAdmin());
}
function quantityRestriction(item,stock,warehouse){
 if(quantityFlag(item.isFixedAsset??item.esActivoFijo??item.CI_ES_A_FIJO))return 'Activo fijo · La cantidad se cuenta por fichas.';
 if(warehouse==='production'&&quantityFlag(item.isEpp))return 'EPP · Se maneja en Plaza Blending.';
 if(stock?.deleted||stock?.active===false)return 'Existencia retirada de esta bodega.';
 return '';
}
function canAdjustQuantity(item,stock,warehouse){
 return isQuantityCriterion(item)&&!quantityRestriction(item,stock,warehouse);
}
// La apertura se envía con la revisión inicial. El servidor rechaza el ajuste si otra
// persona ya registró existencias. Un repuesto vinculado puede tener saldo en Mecánica.
function canOpenProductionQuantity(item,meta){
 if(!item||meta?.enabled===false)return false;
 if(!quantityFlag(item.isYtSpare))return true;
 return !item.productionPartId&&window.SKSpareGroups.types.some(type=>norm(type).replace(/ /g,'')===norm(item.spareEquipment).replace(/ /g,''));
}
function adjustmentTransaction(tables,write){
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(tables,'readwrite');
  let failure;
  write(tx,message=>{failure=new Error(message);tx.abort()});
  tx.oncomplete=resolve;
  tx.onabort=()=>reject(failure||tx.error||new Error('No se pudo guardar el ajuste local.'));
 });
}
const stockTable=warehouse=>warehouse==='production'?productionQuantityCache:'inventoryStock';
// Las claves anteriores de Plaza siguen siendo válidas después de actualizar la app.
const queueKey=(warehouse,itemId)=>warehouse==='production'?['production',itemId]:itemId;
function queueQuantity(warehouse,itemId,quantity,observed,opening=false){
 const table=stockTable(warehouse),id=queueKey(warehouse,itemId);
 return adjustmentTransaction(['inventoryCriteria',table,quantityAdjustments],(tx,abort)=>{
  const queue=tx.objectStore(quantityAdjustments);
  const item=tx.objectStore('inventoryCriteria').get(itemId);
  const stocks=tx.objectStore(table).getAll();
  const existing=queue.get(id);
  existing.onsuccess=()=>{
   const current=stocks.result.find(row=>row.itemId===itemId);
   if(!canAdjustQuantity(item.result,current,warehouse))return abort('El criterio ya no permite editar la cantidad.');
   if(existing.result)return abort('Este elemento ya tiene un ajuste pendiente en esta bodega.');
   if(current?.syncState==='pending')return abort('Primero sincroniza los cambios del criterio de este elemento.');
   const meta=warehouse==='production'&&stocks.result.find(row=>!row.itemId);
   if(meta?.enabled===false)return abort('La Bodega de Producción aún no está activada.');
   const newOpening=warehouse==='production'&&!current&&opening&&canOpenProductionQuantity(item.result,meta);
   if(warehouse==='production'&&!current&&!newOpening)return abort('Sincroniza los saldos de Producción antes de ajustar este elemento.');
   if(stockRevision(current)!==stockRevision(observed)||current?.quantity!==observed?.quantity)
    return abort('La existencia cambió. Revisa el saldo actualizado y vuelve a guardar.');
   const change=mark();
   queue.put({...change,id,operationId:change.id,warehouse,itemId,quantity,observedQuantity:Number(current?.quantity||0),stockRevision:newOpening?'0|0':stockRevision(current)});
  };
 });
}
function settleQuantity(adjustment,confirmed,conflict){
 const table=stockTable(adjustment.warehouse);
 return adjustmentTransaction([quantityAdjustments,table],tx=>{
  const queue=tx.objectStore(quantityAdjustments),saved=queue.get(adjustment.id);
  saved.onsuccess=()=>{
   if(saved.result?.operationId!==adjustment.operationId)return;
   if(conflict){queue.put({...saved.result,syncError:conflict});return}
   const stocks=tx.objectStore(table),current=stocks.get(confirmed.id);
   current.onsuccess=()=>{
    const stock=current.result;
    const isNewer=adjustment.warehouse==='production'?stock?.sampledAt<=confirmed.sampledAt:stockRevision(stock)<=stockRevision(confirmed);
    if(!stock||stock.syncState!=='pending'&&isNewer)stocks.put(confirmed);
    queue.delete(adjustment.id);
   };
  };
 });
}
async function syncQuantities(){
 const adjustments=(await all(quantityAdjustments)).filter(row=>!row.syncError);
 if(!adjustments.length)return;
 const pendingCriteria=new Set((await all('inventoryCriteria')).filter(item=>item.syncState==='pending').map(item=>item.id));
 for(const row of adjustments){
  // El criterio pudo haberse creado mientras ya se enviaba la sincronización anterior.
  if(pendingCriteria.has(row.itemId))continue;
  let result;
  try{
   result=row.warehouse?await window.SKAdminAuth.request('adminWarehouseQuantityV1',{
    mode:'set',warehouse:row.warehouse,itemId:row.itemId,quantity:row.quantity,operationId:row.operationId,observedQuantity:row.observedQuantity,stockRevision:row.stockRevision
   }):await window.SKAdminAuth.request('adminSetInventoryQuantity',{
    itemId:row.itemId,quantity:row.quantity,stockRevision:row.stockRevision
   });
  }catch(error){
   if(/cantidad cambió en la base central|criterio no permite editar|existencia fue retirada|requiere una cantidad entera|identificador ya corresponde/i.test(error.message)){
    await settleQuantity(row,null,error.message);
    window.dispatchEvent(new Event('skweb-inventory-refresh'));
    continue;
   }
   if(/solicitud no válida/i.test(error.message))
    throw new Error('El servicio central necesita la versión de Code.gs que admite editar cantidades.');
   throw error;
  }
  const stock=result.stock;
  const acknowledged=row.warehouse?result.operationId===row.operationId&&result.warehouse===row.warehouse&&['accepted','already-applied'].includes(result.status):Number(stock?.quantity)===row.quantity;
  if(!stock?.id||stock.itemId!==row.itemId||!Number.isFinite(stock.quantity)||!acknowledged)
   throw new Error('La base central aún no confirmó el ajuste de cantidad.');
  await settleQuantity(row,{...stock,syncState:'synced'});
  window.dispatchEvent(new Event('skweb-inventory-refresh'));
 }
}
let quantityViewVersion=0;
async function openQuantities(options={}){
 const warehouse=options.warehouse==='production'?'production':'plaza',production=warehouse==='production';
 if(production&&!window.SKAdminAuth.isAdmin())throw new Error('Tu rol no permite editar cantidades de Producción.');
 const warehouseName=production?'Producción':'Plaza Blending',table=stockTable(warehouse);

 let section=document.querySelector('#inventoryQuantities');
 if(!section){
  section=document.createElement('section');section.id='inventoryQuantities';section.className='view';
  section.innerHTML=`<style>
   .quantityPicker{position:relative;display:grid;align-content:start;gap:6px}
   #quantityItems{position:absolute;z-index:30;top:100%;left:0;right:0;max-height:300px;overflow:auto;margin-top:4px;padding:5px;background:#fff;color:#173d59;border:1px solid #b9c6d1;border-radius:9px;box-shadow:0 12px 28px #173d5930}
   #quantityItems button{display:grid;width:100%;padding:10px 12px;text-align:left;background:#fff;color:#173d59}
   #quantityItems button:is(:hover,:focus){background:#eaf1f6}
   #quantityItems small{font-weight:500}
   #quantityItems button:disabled{color:#475569;opacity:1;cursor:default}
   #inventoryQuantities .status:empty{margin:0;padding:0;border:0;min-height:0}
   #inventoryQuantities .quantityWarehouseLogo{display:block;width:clamp(8rem,40vw,12rem);max-width:100%;height:auto;object-fit:contain;margin:clamp(1rem,4vw,2rem) auto .25rem}
  </style><div class="sectionHead"><h2>Editar cantidades</h2></div>

   <form><div class="quantityPicker">
     <label for="quantityItemSearch">Elemento</label>
     <input id="quantityItemSearch" type="search" autocomplete="off" placeholder="Escribe o elige un elemento…" aria-controls="quantityItems">
     <div id="quantityItems" role="group" aria-label="Elementos disponibles" hidden></div>
    </div>
    <label>Cantidad<input name="quantity" type="number" min="0" step="any" required disabled></label>
    <div class="formActions"><button type="submit" disabled>Guardar cantidad</button>
     <button type="button" id="backFromQuantities" class="adminFormCancel">Volver</button></div>
   </form><p class="status" role="status" aria-live="polite"></p>
   <img class="quantityWarehouseLogo" width="192" height="192" alt="">`;
  document.querySelector('main').append(section);
  section.querySelector('#backFromQuantities').onclick=()=>window.SKAdminNav?.back();
  const picker=section.querySelector('.quantityPicker'),choices=section.querySelector('#quantityItems');
  picker.addEventListener('focusout',event=>{
   if(event.relatedTarget&&!picker.contains(event.relatedTarget))choices.hidden=true;
  });
  document.addEventListener('pointerdown',event=>{if(!picker.contains(event.target))choices.hidden=true});
  for(const event of ['skweb-inventory-refresh','skweb-local-change','skweb-production-balances'])
   window.addEventListener(event,()=>section._refreshQuantity?.());
 }
 const form=section.querySelector('form'),search=section.querySelector('#quantityItemSearch'),
  menu=section.querySelector('#quantityItems'),quantity=form.elements.quantity,
  button=form.querySelector('[type=submit]'),status=section.querySelector('.status');
 const view=++quantityViewVersion;
 section.querySelector('h2').textContent='Cantidades · '+warehouseName;
 const logo=section.querySelector('.quantityWarehouseLogo');
 logo.alt='Logo de '+warehouseName;
 logo.src=production?'./produccion/produccion-perforadora-512.png':'./plaza/icon-volqueta.svg';
 form.reset();search.disabled=true;menu.hidden=true;quantity.disabled=button.disabled=true;
 status.textContent='';section._refreshQuantity=null;form.onsubmit=null;
 if(typeof db==='undefined'||!db){status.textContent='El almacenamiento local todavía está cargando. Vuelve a abrir el módulo.';return}
 let criteria=[],restrictions=new Map(),registeredIds=new Set(),meta,selected,stock,pending,opening=false,selectionVersion=0,listVersion=0;
 async function loadList(){
  const version=++listVersion;
  const [catalog,stocks,adjustments]=await Promise.all([all('inventoryCriteria'),all(table),production?all(quantityAdjustments):[]]);
  if(view!==quantityViewVersion||version!==listVersion)return;
  const balances=new Map(stocks.filter(row=>row.itemId).map(row=>[row.itemId,row]));
  meta=production&&stocks.find(row=>!row.itemId);
  registeredIds=new Set([...balances.keys(),...adjustments.filter(row=>row.warehouse==='production').map(row=>row.itemId)]);
  restrictions=new Map();
  criteria=catalog.filter(row=>{
   if(!isQuantityCriterion(row))return false;
   const reason=quantityRestriction(row,balances.get(row.id),warehouse);
   if(reason)restrictions.set(row.id,reason);
   return production||!reason;
  });
  criteria.sort((a,b)=>{
   if(restrictions.has(a.id)!==restrictions.has(b.id))return restrictions.has(a.id)?1:-1;
   if(production&&registeredIds.has(a.id)!==registeredIds.has(b.id))return registeredIds.has(a.id)?-1:1;
   return itemName(a).localeCompare(itemName(b),'es',{numeric:true,sensitivity:'base'});
  });
  if(!menu.hidden)drawItems();
  if(!selected&&production){
   if(!meta)status.textContent='Sincroniza SK Web Admin para descargar los saldos de Producción en este equipo.';
   else if(!meta.enabled)status.textContent='La Bodega de Producción aún no está activada.';
   else status.textContent=registeredIds.size?'':'Busca un elemento del catálogo para ingresar su saldo inicial.';
  }
 }
 try{await loadList()}catch(error){status.textContent='No se pudo leer el inventario local: '+error.message;return}
 if(view!==quantityViewVersion)return;
 function drawItems(){
  const query=selected?'':search.value.trim();
  const matches=criteria.filter(row=>
   (query||!restrictions.has(row.id)&&(!production||registeredIds.has(row.id)||quantityFlag(row.isYtSpare)))&&
   matchesCatalogItem(row,query));
  menu.replaceChildren(...matches.map(row=>{
   const option=document.createElement('button');
   option.type='button';option.dataset.itemId=row.id;option.textContent=itemName(row);
   const aliases=[itemSecondary(row),itemTertiary(row)].filter(Boolean);
   const reason=restrictions.get(row.id);
   if(reason){option.disabled=true;aliases.push(reason)}
   else if(production&&!registeredIds.has(row.id)&&meta?.enabled!==false)
    aliases.push(canOpenProductionQuantity(row,meta)?'Ingresar saldo inicial':'Saldo por sincronizar');
   if(aliases.length){const detail=document.createElement('small');detail.textContent=aliases.join(' · ');option.append(detail)}
   return option;
  }));
  if(!matches.length)menu.textContent='No hay elementos que coincidan.';
  menu.hidden=false;
 }
 async function readSelected(keepInput=false){
  const id=selected?.id,version=++selectionVersion;
  if(!id)return;
  const [currentItems,currentStocks,adjustments]=await Promise.all([all('inventoryCriteria'),all(table),all(quantityAdjustments)]);
  if(view!==quantityViewVersion||version!==selectionVersion)return;
  const wasPending=pending,current=currentStocks.find(row=>row.itemId===id);
  const dirty=!quantity.disabled&&quantity.value!==(stock?String(stock.quantity):production?'':'0');
  pending=adjustments.find(row=>row.itemId===id&&(row.warehouse||'plaza')===warehouse);
  const item=currentItems.find(row=>row.id===id);
  const restriction=isQuantityCriterion(item)?quantityRestriction(item,current,warehouse):'El criterio ya no permite editar la cantidad.';
  const eligible=!restriction;
  const currentMeta=production&&currentStocks.find(row=>!row.itemId);
  opening=production&&!current&&eligible&&canOpenProductionQuantity(item,currentMeta);

  if(!keepInput||!dirty||pending||!eligible){
   stock=current;
   quantity.value=pending?.quantity??current?.quantity??(production?'':0);
  }
  quantity.disabled=button.disabled=Boolean(pending||!eligible||currentMeta?.enabled===false||production&&!current&&!opening||current?.syncState==='pending');
  if(pending?.syncError)status.textContent=pending.syncError+' Puedes descartar el ajuste desde Inicio y volver a registrarlo con el saldo actualizado.';
  else if(pending)status.textContent='Guardado en este equipo · pendiente de sincronizar con '+warehouseName+'.';
  else if(!eligible)status.textContent=restriction;
  else if(current?.syncState==='pending')status.textContent='Primero sincroniza los cambios del criterio de este elemento.';
  else if(currentMeta?.enabled===false)status.textContent='La Bodega de Producción aún no está activada.';
  else if(wasPending&&current)status.textContent='Ajuste procesado. Saldo en la base sincronizada: '+quantity.value+'.';
  else if(opening)status.textContent=currentMeta?'Escribe el saldo inicial de este elemento en Producción.':'Escribe el saldo inicial. Al sincronizar se comprobará si ya hay existencias registradas en Producción.';
  else if(production&&!current)status.textContent='Sincroniza SK Web Admin para consultar el saldo de este repuesto en Producción.';
  else status.textContent='';
 }
 function report(error){status.textContent=error.message}
 search.disabled=false;
 search.onfocus=search.onclick=drawItems;
 search.oninput=()=>{
  selected=stock=pending=null;selectionVersion++;
  quantity.value='';quantity.disabled=button.disabled=true;status.textContent='';
  drawItems();
 };
 form.onkeydown=event=>{
  if(event.key==='Escape'&&!menu.hidden){event.preventDefault();if(event.target!==search)search.focus();menu.hidden=true}
  if(event.key==='ArrowDown'&&event.target===search){event.preventDefault();if(menu.hidden)drawItems();menu.querySelector('button:not(:disabled)')?.focus()}
  if(event.key==='Enter'&&event.target===search){
   event.preventDefault();
   if(selected){menu.hidden=true;if(!quantity.disabled)quantity.focus()}
   else if(menu.hidden)drawItems();
   else menu.querySelector('button:not(:disabled)')?.click();
  }
 };
 async function selectItem(item){
  if(!item)return;
  selected=item;search.value=itemName(item);menu.hidden=true;
  stock=pending=null;quantity.value='';quantity.disabled=button.disabled=true;
  quantity.step=quantityFlag(item.isYtSpare)||production&&!quantityFlag(item.fractionable)?'1':'any';
  await readSelected();
  if(view!==quantityViewVersion||selected!==item)return;
  if(!quantity.disabled&&section.classList.contains('active'))quantity.focus();
 }
 menu.onclick=event=>{
  const option=event.target.closest('[data-item-id]');
  if(option&&!option.disabled)selectItem(criteria.find(row=>String(row.id)===option.dataset.itemId)).catch(report);
 };
 section._refreshQuantity=()=>{
  if(!section.classList.contains('active')||button.dataset.saving==='1')return;
  loadList().then(()=>readSelected(true)).catch(report);
 };
 form.onsubmit=async event=>{
  event.preventDefault();
  if(button.disabled||!window.SKAdminAuth?.canView?.('inventoryQuantities')||!form.reportValidity())return;
  const id=selected?.id,value=quantity.valueAsNumber;
  if(!id||!Number.isFinite(value)||value<0)return;
  button.dataset.saving='1';search.disabled=quantity.disabled=button.disabled=true;menu.hidden=true;
  let failure;
  try{await queueQuantity(warehouse,id,value,stock,opening)}
  catch(error){failure=error}
  finally{delete button.dataset.saving;search.disabled=false}
  if(!failure)window.dispatchEvent(new Event('skweb-local-change'));
  if(view!==quantityViewVersion)return;
  try{await readSelected()}
  catch(error){report(failure||error);return}
  if(failure)report(failure);
 };
 const item=options.itemId&&criteria.find(row=>String(row.id)===String(options.itemId));
 if(item&&matchesCatalogItem(item,options.query))selectItem(item).catch(report);
 else if(production&&options.query){
  search.value=options.query;drawItems();
 }else if(options.itemId)status.textContent='Este elemento se controla por ficha o no admite ajuste de cantidad en '+warehouseName+'.';
}
window.SKInventoryAdmin={mount,render,openKind,openQuantities,syncQuantities};window.addEventListener('load',()=>setTimeout(mount,120));
})();

