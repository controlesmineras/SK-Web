// Administración del catálogo y existencias que comparte SK Admin con Plaza Blending.
(()=>{
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=s=>String(s||'').trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');
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
const inventoryUnitValues=()=>{const units=window.SKFormOptions?.values('inventory.unit',['Unidad','Par','Rollo'])||['Unidad','Par','Rollo'];return units.some(unit=>norm(unit)===norm('Rollo'))?units:[...units,'Rollo']};
const INVENTORY_UNITS={map:callback=>inventoryUnitValues().map(callback),find:callback=>inventoryUnitValues().find(callback)};
const boolFields=['allowAccessories','isYtSpare','isFixedAsset','usesSerial','usesLength','usesModel','usesManufacturer','requiresInternalMark','isEpp','allowAssignment','allowLoan','allowTransfer','allowRemission','fractionable'];
let catalogKind='common';
const defaultEnabledOperations=new Set(['allowAssignment','allowTransfer','allowRemission']);
const itemName=x=>x?.name||x?.nombre||x?.elemento||x?.CI_ELEMENTO||x?.ciElemento||'';
const itemSecondary=x=>x?.secondaryName||x?.nombreSecundario||x?.CI_NOMBRE_SECUNDARIO||x?.CI_ALIAS_SECUNDARIO||x?.aliasSecundario||'';
const itemTertiary=x=>x?.tertiaryName||x?.nombreTerciario||x?.CI_NOMBRE_TERCIARIO||x?.CI_ALIAS_TERCIARIO||x?.aliasTerciario||'';
const itemUnit=x=>x?.unit||x?.unidadMedida||x?.CI_UNIDAD_MEDIDA||x?.ciUnidadMedida||'';
function injectStyle(){if(document.querySelector('#inventoryAdminStyle'))return;const s=document.createElement('style');s.id='inventoryAdminStyle';s.textContent=`#inventoryItems .invToolbar{display:flex;gap:10px;flex-wrap:wrap;margin:12px 0}#inventoryItems .invToolbar input{flex:1;min-width:220px}#inventoryItems .invGrid{display:grid;grid-template-columns:minmax(280px,.9fr) minmax(320px,1.1fr);gap:18px}#inventoryItemList{grid-column:1;min-width:0}#inventoryItemForm{grid-column:2;min-width:0}.invList{display:grid;gap:8px;align-content:start}.invItem{width:100%;text-align:left;display:flex;justify-content:space-between;gap:12px;align-items:center}.invItem small{display:block}#inventoryItems .invMissingCriterion{background:#f1f3f5;color:#606a73;border:1px dashed #bbc3cb;box-shadow:none;opacity:1}#inventoryItems .invMissingCriterion small{color:#606a73;line-height:1.4;margin-top:4px}.invMissingAction{font-size:.8rem;flex:0 0 auto}#inventoryItemForm .invValidationSummary{grid-column:1/-1;background:#fff2f2;color:#9b1c1c;border:1px solid #d88;padding:12px;border-radius:8px;margin:0 0 12px}#inventoryItemForm [aria-invalid="true"]{border:2px solid #b42318!important;background:#fff5f5!important}#inventoryItemForm .invFieldError{display:block;color:#b42318;font-size:.82rem;margin-top:5px;font-weight:600}#inventoryItemForm>label[hidden]{display:none!important}.invQty{font-weight:800;white-space:nowrap}.invZero{opacity:.68}#inventoryItemForm>h3,#inventoryItemForm>.invPerms,#inventoryItemForm>.invInitialNote,#inventoryItemForm>.invActions,#inventoryItemForm>.status{grid-column:1/-1}.invPerms{display:grid;grid-template-columns:1fr;gap:7px;margin:10px 0 20px}.invSwitchRow{display:flex!important;align-items:center!important;justify-content:space-between;gap:18px;padding:13px 14px!important;margin:0!important;border:1px solid rgba(16,44,64,.10);border-radius:10px;background:rgba(16,47,69,.025);font-weight:700}.invSwitchRow>span:first-child{line-height:1.25}.invSwitchRow[hidden]{display:none!important}.invSwitchRow input{position:absolute;opacity:0;pointer-events:none}.invSwitchControl{display:flex;align-items:center;gap:9px;flex:0 0 auto}.invSwitch{position:relative;width:48px;height:28px;border-radius:999px;background:#c7cbd0;box-shadow:inset 0 0 0 1px rgba(0,0,0,.06);transition:.2s}.invSwitch:after{content:'';position:absolute;width:22px;height:22px;left:3px;top:3px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.25);transition:.2s}.invSwitchText{width:22px;font-size:.88rem;font-weight:700;color:#66717d}.invSwitchRow input:checked+.invSwitchControl .invSwitch{background:#34c759}.invSwitchRow input:checked+.invSwitchControl .invSwitch:after{transform:translateX(20px)}.invSwitchRow input:checked+.invSwitchControl .invSwitchText{color:#198b37}.invSwitchRow input:focus-visible+.invSwitchControl .invSwitch{outline:3px solid rgba(0,122,255,.28);outline-offset:2px}.invContainerUnit{display:block;margin:0 0 20px;padding:2px 14px 8px}.invContainerUnit[hidden]{display:none!important}.invInitialNote{font-size:.86rem;opacity:.75}.invBadge{font-size:.75rem;padding:3px 7px;border-radius:999px;background:rgba(0,0,0,.08)}#inventoryItemForm .invActions{display:flex!important;justify-content:center!important;gap:12px!important;flex-wrap:wrap}#inventoryItemForm .invActions>.adminFormCancel{margin-left:0!important}.invDanger{background:#fff;border:1px solid #a33;color:#922}@media(max-width:760px){#inventoryItems .invGrid{grid-template-columns:1fr}#inventoryItemList,#inventoryItemForm{grid-column:1}.invSwitchRow{padding:12px 11px!important}.invPerms{gap:6px}.invContainerUnit{padding-left:11px;padding-right:11px}}`;document.head.append(s)}
const sw=(name,label,checked='')=>`<label class="invSwitchRow"><span>${label}</span><input name="${name}" type="checkbox" ${checked}><span class="invSwitchControl"><span class="invSwitch"></span><span class="invSwitchText">No</span></span></label>`;
function syncSwitchText(root=document){root.querySelectorAll('.invSwitchRow input[type="checkbox"]').forEach(i=>{const t=i.parentElement.querySelector('.invSwitchText');if(t)t.textContent=i.checked?'Sí':'No'})}
function syncFractionableField(root=document){const f=root.closest?.('form')||root.querySelector?.('#inventoryItemForm')||document.querySelector('#inventoryItemForm');if(!f)return;const on=!!f.elements.fractionable?.checked,wrap=f.querySelector('.invContainerUnit'),input=f.elements.containerUnit;if(wrap)wrap.hidden=!on;if(input){input.disabled=!on;input.required=on;if(!on)input.value=''}}
function syncFixedAssetFields(root=document){
 const f=root.closest?.('form')||root.querySelector?.('#inventoryItemForm')||document.querySelector('#inventoryItemForm');if(!f)return;
 const fixed=!!f.elements.isFixedAsset?.checked,qty=f.elements.initialQuantity,unit=f.elements.unit;
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
 if(qty){qty.disabled=fixed;qty.required=!fixed;qty.closest('label').hidden=fixed;if(fixed)qty.value=''}
 const accessories=f.elements.allowAccessories;if(accessories){accessories.disabled=!fixed;accessories.closest('label').hidden=!fixed;}
 const note=f.querySelector('.invInitialNote');if(note)note.textContent=fixed?'Cada activo se registra individualmente. Los demás campos se activan manualmente con sus interruptores.':'La cantidad inicial solo se define al crear el elemento.';
}
function syncSpareFields(f){
 const on=!!f.elements.isYtSpare.checked;
 if(f.elements.itemKind)f.elements.itemKind.value=on?'spare':'common';
 for(const key of ['spareEquipment','spareItemNumber','spareItemName']){
  const input=f.elements[key];input.closest('label').hidden=!on;input.disabled=!on;
  input.required=on&&key!=='spareItemNumber';
 }
 f.elements.name.closest('label').hidden=on;f.elements.name.required=!on;
 if(on){
  const equipment=f.elements.spareEquipment.value,number=f.elements.spareItemNumber.value.trim(),name=f.elements.spareItemName.value.trim();
  f.elements.name.value=['Repuesto '+equipment,number?'Ítem '+number:'',name].filter(Boolean).join(' - ');
 }
}
const validationLabels={name:'Nombre del elemento',unit:'Unidad de medida',initialQuantity:'Cantidad inicial',spareEquipment:'Equipo',spareItemName:'Nombre del ítem',containerUnit:'Unidad contenedora'};
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
  error.textContent=missing?'Completa este campo obligatorio.':field.name==='initialQuantity'?'Escribe una cantidad válida, cero o mayor.':'Revisa el valor de este campo.';
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
function mount(){if(document.querySelector('#inventoryItems'))return;injectStyle();const main=document.querySelector('main');if(!main)return;const sec=document.createElement('section');sec.id='inventoryItems';sec.className='view';sec.innerHTML=`<div class="sectionHead"><h2 id="inventoryCatalogTitle">Elementos de inventario</h2><button type="button" id="newInventoryItem">+ Agregar elemento</button></div><p class="hint">Elige primero Elemento común o Repuesto YT o Columna. Los repuestos quedan disponibles en Plaza Blending y en Consumo de Producción según su equipo y modelo.</p><div class="invToolbar"><button type="button" data-catalog-kind="common">ELEMENTOS COMUNES</button><button type="button" data-catalog-kind="spare">REPUESTOS YT / COLUMNA</button></div><div class="invToolbar"><select id="spareCatalogFilter" hidden aria-label="Filtrar equipo y modelo"><option value="">Todos los repuestos</option><option>YT 29</option><option>YT 28</option><option>Columna 29</option><option>Columna 28</option></select><input id="inventoryItemSearch" type="search" placeholder="Buscar elemento…" autocomplete="off"><span id="inventoryItemCount" class="invBadge"></span></div><div class="invGrid"><div id="inventoryItemList" class="invList"></div><form id="inventoryItemForm" novalidate><input type="hidden" name="id"><h3 id="inventoryFormTitle">Datos del elemento</h3><p id="inventoryValidationSummary" class="invValidationSummary" role="alert" hidden></p><input name="itemKind" type="hidden" value="common"><input name="isYtSpare" type="checkbox" hidden><label hidden>EQUIPO<select name="spareEquipment" disabled><option value="YT 29">YT 29</option><option value="Columna 29">Columna 29</option><option value="YT 28">YT 28</option><option value="Columna 28">Columna 28</option></select></label><label hidden>NÚMERO DE ÍTEM<input name="spareItemNumber" disabled autocomplete="off"></label><label hidden>NOMBRE DEL ÍTEM<input name="spareItemName" disabled autocomplete="off"></label><label>NOMBRE DEL ELEMENTO<input name="name" required autocomplete="off"></label><label>NOMBRE SECUNDARIO<input name="secondaryName"></label><label>UNIDAD DE MEDIDA<select name="unit" required><option value="">Seleccionar…</option>${INVENTORY_UNITS.map(x=>`<option value="${x}">${x}</option>`).join('')}</select></label><label>NOMBRE TERCIARIO<input name="tertiaryName"></label><label>CANTIDAD INICIAL<input name="initialQuantity" type="number" min="0" step="any" placeholder="0" required></label><p class="invInitialNote">La cantidad inicial solo se define al crear el elemento.</p><h3>¿Qué información utiliza?</h3><div class="invPerms">${sw('isFixedAsset','Es activo fijo')}${sw('allowAccessories','Permite registrar accesorios')}${sw('usesSerial','Usa serial')}${sw('usesLength','Usa largo (ft)')}${sw('usesModel','Usa modelo')}${sw('usesManufacturer','Usa fabricante / marca comercial')}${sw('requiresInternalMark','Requiere marca interna')}${sw('isEpp','Es EPP')}</div><h3>¿Qué operaciones permite?</h3><div class="invPerms">${sw('allowAssignment','Asignaciones','checked')}${sw('allowLoan','Préstamos')}${sw('allowTransfer','Traslados','checked')}${sw('allowRemission','Remisiones','checked')}${sw('fractionable','Permite entrega fraccionada')}<label class="invContainerUnit" hidden>UNIDAD CONTENEDORA<input name="containerUnit" placeholder="Rollo, carrete, galón…" disabled></label></div><div class="invActions"><button type="submit" id="inventoryItemSave">Guardar elemento</button><button type="button" id="inventoryItemDeactivate" class="invDanger" hidden>Retirar elemento</button></div><p id="inventoryItemStatus" class="status" hidden></p></form></div>`;main.append(sec);bind();syncSwitchText(sec);syncFractionableField(sec);syncFixedAssetFields(sec);syncSpareFields(sec.querySelector("form"));render()}
let renderVersion=0;
async function render(){
 if(typeof all!=='function'||typeof db==='undefined'||!db)return;
 const version=++renderVersion,[criteria,stock,assets]=await Promise.all([all('inventoryCriteria'),all('inventoryStock'),all('assets')]);if(version!==renderVersion)return;
 const sm=new Map(stock.map(x=>[x.itemId,x])),q=norm(document.querySelector('#inventoryItemSearch')?.value),active=criteria.filter(x=>!x.deleted&&x.active!==false&&(catalogKind==='spare'?x.isYtSpare:!x.isYtSpare)&&(!document.querySelector('#spareCatalogFilter')?.value||catalogKind!=='spare'||x.spareEquipment===document.querySelector('#spareCatalogFilter').value));
 const registeredNames=new Set(active.flatMap(x=>[itemName(x),itemSecondary(x),itemTertiary(x)].map(norm).filter(Boolean))),registeredIds=new Set(active.map(x=>x.id)),classes=new Map();
 for(const asset of catalogKind==='spare'?[]:assets){
  if(asset.deleted)continue;
  const name=String(asset.clase||'').trim(),key=norm(name);
  if(!key||registeredNames.has(key)||registeredIds.has(asset.criteriaId)||q&&!key.includes(q))continue;
  if(!classes.has(key))classes.set(key,name);
 }
 const rows=active.filter(x=>matchesItemSearch([itemName(x),itemSecondary(x),itemTertiary(x),itemUnit(x),x.id].filter(Boolean).join(' '),x.spareItemNumber,q)).map(item=>({name:itemName(item),item}));
 for(const name of classes.values())rows.push({name});
 rows.sort((a,b)=>a.name.localeCompare(b.name,'es',{numeric:true,sensitivity:'base'}));
 const count=document.querySelector('#inventoryItemCount'),list=document.querySelector('#inventoryItemList');
 if(count)count.textContent=(q?`${rows.length} coincidencia${rows.length===1?'':'s'}`:`${rows.length} elementos`)+(classes.size?` · ${classes.size} sin criterio`:'');
 if(list)list.innerHTML=rows.map(({name,item})=>{
  if(!item)return `<button type="button" class="invItem invMissingCriterion" data-inv-class="${esc(name)}"><span><b>${esc(name)}</b><small>Solo en Activos fijos · Sin criterio de inventario</small></span><span class="invMissingAction">Crear criterio</span></button>`;
  const qty=Number(sm.get(item.id)?.quantity)||0,unit=itemUnit(item);
  return `<button type="button" class="invItem ${qty===0?'invZero':''}" data-inv-id="${esc(item.id)}"><span><b>${esc(name||'Sin nombre')}</b><small>${esc(unit)} · ${qty===0?'Sin existencias':'Disponible'}</small></span><span class="invQty">${qty}</span></button>`;
 }).join('')||'<p class="hint">No hay elementos que coincidan.</p>';
}
function createClassCriterion(name){
 reset();const form=document.querySelector('#inventoryItemForm');form.elements.name.value=name;form.elements.isFixedAsset.checked=true;syncSwitchText(form);syncFixedAssetFields(form);
 const status=document.querySelector('#inventoryItemStatus');status.hidden=false;status.textContent='Esta clase existe en Activos fijos. Completa sus criterios y guarda el elemento.';
 form.scrollIntoView({behavior:'smooth',block:'start'});form.elements.name.focus({preventScroll:true});
}
function openKind(kind){catalogKind=kind==='spare'?'spare':'common';mount();const spare=catalogKind==='spare',sec=document.querySelector('#inventoryItems');sec.dataset.catalogKind=catalogKind;document.querySelector('#inventoryCatalogTitle').textContent=spare?'Repuestos YT / Columna':'Elementos de inventario';document.querySelector('#inventoryFormTitle').textContent=spare?'Datos del repuesto':'Datos del elemento';document.querySelector('#newInventoryItem').textContent=spare?'+ Agregar repuesto':'+ Agregar elemento';document.querySelector('#spareCatalogFilter').hidden=!spare;document.querySelector('#spareCatalogFilter').value='';document.querySelector('#inventoryItemSearch').value='';sec.querySelectorAll('[data-catalog-kind]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.catalogKind===catalogKind)));reset();render();window.dispatchEvent(new Event('skweb-inventory-kind'));}
function reset(){const f=document.querySelector('#inventoryItemForm');clearValidation(f);delete f.elements.unit.dataset.fixedUnit;delete f.elements.unit.dataset.nonFixedUnit;f.reset();f.elements.id.value='';f.elements.isYtSpare.checked=catalogKind==='spare';if(catalogKind==='spare')f.elements.unit.value='Unidad';f.elements.initialQuantity.disabled=false;f.elements.initialQuantity.value='';f.elements.allowAssignment.checked=true;f.elements.allowLoan.checked=false;f.elements.allowTransfer.checked=true;f.elements.allowRemission.checked=true;syncSwitchText(f);syncFractionableField(f);syncFixedAssetFields(f);syncSpareFields(f);document.querySelector('#inventoryItemSave').textContent='Guardar elemento';document.querySelector('#inventoryItemDeactivate').hidden=true;document.querySelector('#inventoryItemStatus').hidden=true}
async function edit(id){const [criteria,stock]=await Promise.all([all('inventoryCriteria'),all('inventoryStock')]),x=criteria.find(r=>r.id===id);if(!x)return;const f=document.querySelector('#inventoryItemForm'),st=stock.find(r=>r.itemId===id);clearValidation(f);delete f.elements.unit.dataset.fixedUnit;delete f.elements.unit.dataset.nonFixedUnit;for(const [n,v] of Object.entries({id:x.id,name:itemName(x),unit:itemUnit(x),secondaryName:itemSecondary(x),tertiaryName:itemTertiary(x),spareEquipment:x.spareEquipment||"YT 29",spareItemNumber:x.spareItemNumber||"",spareItemName:x.spareItemName||""}))if(f.elements[n])f.elements[n].value=v;f.elements.initialQuantity.value=Number(st?.quantity)||0;f.elements.initialQuantity.disabled=false;boolFields.forEach(n=>f.elements[n].checked=defaultEnabledOperations.has(n)?x[n]!==false:x[n]===true);syncSwitchText(f);syncFractionableField(f);syncFixedAssetFields(f);syncSpareFields(f);if(f.elements.fractionable.checked)f.elements.containerUnit.value=x.containerUnit||'';document.querySelector('#inventoryItemSave').textContent='Guardar cambios';document.querySelector('#inventoryItemDeactivate').hidden=false;document.querySelector('#inventoryItemDeactivate').textContent=x.isYtSpare?'Eliminar repuesto':'Retirar elemento';f.scrollIntoView({behavior:'smooth',block:'start'})}
// El criterio, su saldo y el ingreso inicial se confirman en una sola transacción.
function persistInventory(item,quantity,isNew){return new Promise((resolve,reject)=>{
 const tx=db.transaction(['inventoryCriteria','inventoryStock','incomes'],'readwrite');
 const stocks=tx.objectStore('inventoryStock'),read=stocks.getAll();
 tx.objectStore('inventoryCriteria').put(item);
 read.onsuccess=()=>{
  const current=read.result.find(row=>row.itemId===item.id),t=item.updatedAt;
  if(isNew||!current){
   stocks.put({id:'stock-'+item.id,itemId:item.id,quantity,initialQuantity:quantity,active:true,initialRecordedAt:t,createdAt:t,updatedAt:t,syncState:'pending'});
  }else if(quantity!==Number(current.quantity||0)){
   stocks.put({...current,quantity,updatedAt:t,syncState:'pending'});
  }
  if(isNew&&quantity>0)tx.objectStore('incomes').put({id:uuid(),itemId:item.id,nombre:item.name,cantidad:quantity,unidad:item.unit,tipo:'Existencia inicial',fechaLocal:new Date().toLocaleString('es-CO'),createdAt:t,updatedAt:t,syncState:'pending',source:'inventory-admin'});
 };
 tx.oncomplete=()=>{resolve();window.dispatchEvent(new Event('skweb-local-change'))};
 tx.onerror=()=>reject(tx.error||new Error('No se pudo guardar el elemento en este dispositivo.'));
 tx.onabort=()=>reject(tx.error||new Error('Se canceló el guardado local. No se guardó ningún cambio.'));
})}
let saving=false;
async function save(e){
 e.preventDefault();if(saving)return;
 const f=e.currentTarget,status=document.querySelector('#inventoryItemStatus'),button=document.querySelector('#inventoryItemSave');
 syncSpareFields(f);if(!validateInventory(f,true))return;
 saving=true;button.disabled=true;let committed=false;
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
 for(const entry of [{label:'nombre del elemento',value:itemName(item)},{label:'nombre secundario',value:itemSecondary(item)},{label:'nombre terciario',value:itemTertiary(item)}])if(entry.value)existingNames.push({...entry,official})}for(const candidate of candidateNames){const duplicate=existingNames.find(entry=>norm(entry.value)===norm(candidate.value));
 if(duplicate){status.hidden=false;
 status.textContent=`El ${candidate.label} “${candidate.value}” ya está utilizado como ${duplicate.label} de “${duplicate.official}”. Escribe un nombre diferente.`;
 f.elements[candidate.field].focus();
 return}}const t=new Date().toISOString(),item=id?criteria.find(x=>x.id===id):{id:uuid(),createdAt:t};
 if(!item)throw new Error('No se encontró el criterio que estás editando. Vuelve a seleccionarlo.');
 Object.assign(item,{allowAccessories:f.elements.isFixedAsset.checked&&f.elements.allowAccessories.checked,deliveryWarehouse:f.elements.isYtSpare.checked?'Producción':'',isYtSpare:f.elements.isYtSpare.checked,spareEquipment:f.elements.isYtSpare.checked?f.elements.spareEquipment.value:"",spareItemNumber:f.elements.isYtSpare.checked?f.elements.spareItemNumber.value.trim():"",spareItemName:f.elements.isYtSpare.checked?f.elements.spareItemName.value.trim():"",name,unit,secondaryName,tertiaryName,containerUnit:f.elements.fractionable.checked?f.elements.containerUnit.value.trim():'',isFixedAsset:f.elements.isFixedAsset.checked,usesSerial:f.elements.usesSerial.checked,usesLength:f.elements.usesLength.checked,usesModel:f.elements.usesModel.checked,usesManufacturer:f.elements.usesManufacturer.checked,requiresInternalMark:f.elements.requiresInternalMark.checked,isEpp:f.elements.isEpp.checked,allowAssignment:f.elements.allowAssignment.checked,allowLoan:f.elements.allowLoan.checked,allowTransfer:f.elements.allowTransfer.checked,allowRemission:f.elements.allowRemission.checked,fractionable:f.elements.fractionable.checked,active:true,deleted:false,updatedAt:t,syncState:'pending'});

 const quantity=f.elements.isFixedAsset.checked?0:Number(f.elements.initialQuantity.value);
 if(!name)throw new Error('Escribe el nombre del elemento.');
 if(!Number.isFinite(quantity)||quantity<0)throw new Error('La cantidad debe ser cero o mayor.');
 await persistInventory(item,quantity,!id);committed=true;
 reset();status.hidden=false;
 status.textContent=(id?'Cambios guardados en este dispositivo.':'Elemento guardado en este dispositivo.')+' Pendiente de sincronizar; se enviará al tener conexión.';
 window.dispatchEvent(new Event('skweb-inventory-refresh'));
 window.skSyncApi?.schedule?.(300);
 await render();
 }catch(error){
  status.hidden=false;
  status.textContent=committed?'El elemento quedó guardado. No se pudo actualizar el listado; vuelve a abrirlo.':'No se pudo guardar: '+(error?.message||error);
  console.error('SK Admin: guardar criterio',error);
 }finally{saving=false;button.disabled=false}
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

function bind(){document.querySelectorAll('[data-catalog-kind]').forEach(b=>b.addEventListener('click',()=>openKind(b.dataset.catalogKind)));document.querySelector('#spareCatalogFilter').addEventListener('change',render);const search=document.querySelector('#inventoryItemSearch');search.addEventListener('input',render);search.addEventListener('search',render);document.querySelector('#inventoryItemList').addEventListener('click',e=>{const b=e.target.closest('[data-inv-id]');if(b)edit(b.dataset.invId);else{const missing=e.target.closest('[data-inv-class]');if(missing)createClassCriterion(missing.dataset.invClass)}});document.querySelector('#newInventoryItem').addEventListener('click',reset);document.querySelector('#inventoryItemForm').addEventListener('change',e=>{if(e.target.name==='itemKind'){openKind(e.target.value);return}if(e.target.matches('.invSwitchRow input'))syncSwitchText(e.target.parentElement);if(e.target.name==='fractionable')syncFractionableField(e.currentTarget);if(e.target.name==='isFixedAsset')syncFixedAssetFields(e.currentTarget);if(['isYtSpare','spareEquipment','spareItemNumber','spareItemName'].includes(e.target.name))syncSpareFields(e.currentTarget)});document.querySelector('#inventoryItemForm').addEventListener('input',e=>{if(['spareItemNumber','spareItemName'].includes(e.target.name))syncSpareFields(e.currentTarget)});document.querySelector('#inventoryItemForm').addEventListener('submit',save);document.querySelector('#inventoryItemDeactivate').addEventListener('click',deactivate);window.addEventListener('skweb-inventory-refresh',render);window.addEventListener('skweb-synced',render);window.addEventListener('skweb-options-applied',()=>syncFixedAssetFields());bindValidation(document.querySelector('#inventoryItemForm'))}
const quantityFlag=value=>value===true||['true','si','1','yes'].includes(norm(value));
const stockRevision=stock=>stock?.updatedAt||stock?.createdAt||'';
function canAdjustQuantity(item,stock){
 return item?.id&&!item.deleted&&item.active!==false&&item.recordType!=='formOptions'&&
  item.id!=='SYSTEM-FORM-OPTIONS-V1'&&!quantityFlag(item.isYtSpare)&&
  !quantityFlag(item.isFixedAsset??item.esActivoFijo??item.CI_ES_A_FIJO)&&itemName(item)&&
  !stock?.deleted&&stock?.active!==false;
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
function queueQuantity(itemId,quantity,observed){
 return adjustmentTransaction(['inventoryCriteria','inventoryStock',quantityAdjustments],(tx,abort)=>{
  const queue=tx.objectStore(quantityAdjustments);
  const item=tx.objectStore('inventoryCriteria').get(itemId);
  const stocks=tx.objectStore('inventoryStock').getAll();
  const existing=queue.get(itemId);
  existing.onsuccess=()=>{
   const current=stocks.result.find(row=>row.itemId===itemId);
   if(!canAdjustQuantity(item.result,current))return abort('El criterio ya no permite editar la cantidad.');
   if(existing.result)return abort('Este elemento ya tiene un ajuste pendiente.');
   if(current?.syncState==='pending')return abort('Primero sincroniza los cambios del criterio de este elemento.');
   if(stockRevision(current)!==stockRevision(observed)||current?.quantity!==observed?.quantity)
    return abort('La existencia cambió. Revisa el saldo actualizado y vuelve a guardar.');
   queue.put({...mark(),id:itemId,operationId:uuid(),itemId,quantity,stockRevision:stockRevision(current)});
  };
 });
}
function settleQuantity(adjustment,confirmed,conflict){
 return adjustmentTransaction([quantityAdjustments,'inventoryStock'],tx=>{
  const queue=tx.objectStore(quantityAdjustments),saved=queue.get(adjustment.id);
  saved.onsuccess=()=>{
   if(saved.result?.operationId!==adjustment.operationId)return;
   if(conflict){queue.put({...saved.result,syncError:conflict});return}
   const stocks=tx.objectStore('inventoryStock'),current=stocks.get(confirmed.id);
   current.onsuccess=()=>{
    const stock=current.result;
    if(stock?.syncState!=='pending'&&(!stock||stockRevision(stock)<=stockRevision(confirmed)))stocks.put(confirmed);
    queue.delete(adjustment.id);
   };
  };
 });
}
async function syncQuantities(){
 const adjustments=(await all(quantityAdjustments)).filter(row=>!row.syncError);
 for(const row of adjustments){
  let result;
  try{
   result=await window.SKAdminAuth.request('adminSetInventoryQuantity',{
    itemId:row.itemId,quantity:row.quantity,stockRevision:row.stockRevision
   });
  }catch(error){
   if(/cantidad cambió en la base central|criterio no permite editar|existencia fue retirada/i.test(error.message)){
    await settleQuantity(row,null,error.message);
    window.dispatchEvent(new Event('skweb-inventory-refresh'));
    continue;
   }
   if(/solicitud no válida/i.test(error.message))
    throw new Error('El servicio central necesita la versión de Code.gs que admite editar cantidades.');
   throw error;
  }
  const stock=result.stock;
  if(!stock?.id||stock.itemId!==row.itemId||Number(stock.quantity)!==row.quantity)
   throw new Error('La base central aún no confirmó el ajuste de cantidad.');
  await settleQuantity(row,{...stock,syncState:'synced'});
  window.dispatchEvent(new Event('skweb-inventory-refresh'));
 }
}
async function openQuantities(){
 let section=document.querySelector('#inventoryQuantities');
 if(!section){
  section=document.createElement('section');section.id='inventoryQuantities';section.className='view';
  section.innerHTML=`<style>
   .quantityPicker{position:relative;display:grid;align-content:start;gap:6px}
   #quantityItems{position:absolute;z-index:30;top:100%;left:0;right:0;max-height:300px;overflow:auto;margin-top:4px;padding:5px;background:#fff;color:#173d59;border:1px solid #b9c6d1;border-radius:9px;box-shadow:0 12px 28px #173d5930}
   #quantityItems button{display:grid;width:100%;padding:10px 12px;text-align:left;background:#fff;color:#173d59}
   #quantityItems button:is(:hover,:focus){background:#eaf1f6}
   #quantityItems small{font-weight:500}
  </style><div class="sectionHead"><h2>Editar cantidades</h2></div>
   <p class="hint">Ajusta la cantidad del elemento. Puedes guardar sin internet. Plaza Blending verá el cambio después de sincronizar.</p>
   <form><div class="quantityPicker">
     <label for="quantityItemSearch">Elemento</label>
     <input id="quantityItemSearch" type="search" autocomplete="off" placeholder="Escribe o elige un elemento…" aria-controls="quantityItems">
     <div id="quantityItems" role="group" aria-label="Elementos disponibles" hidden></div>
    </div>
    <label>Cantidad inicial<input name="quantity" type="number" min="0" step="any" required disabled></label>
    <div class="formActions"><button type="submit" disabled>Guardar cantidad</button>
     <button type="button" id="backFromQuantities">Volver</button></div>
   </form><p class="status" role="status" aria-live="polite"></p>`;
  document.querySelector('main').append(section);
  section.querySelector('#backFromQuantities').onclick=()=>window.SKAdminNav?.back();
  const picker=section.querySelector('.quantityPicker'),choices=section.querySelector('#quantityItems');
  picker.addEventListener('focusout',event=>{
   if(event.relatedTarget&&!picker.contains(event.relatedTarget))choices.hidden=true;
  });
  document.addEventListener('pointerdown',event=>{if(!picker.contains(event.target))choices.hidden=true});
  for(const event of ['skweb-inventory-refresh','skweb-local-change'])
   window.addEventListener(event,()=>section._refreshQuantity?.());
 }
 const form=section.querySelector('form'),search=section.querySelector('#quantityItemSearch'),
  menu=section.querySelector('#quantityItems'),quantity=form.elements.quantity,
  button=form.querySelector('[type=submit]'),status=section.querySelector('.status');
 if(button.dataset.saving==='1')return;
 form.reset();search.disabled=true;menu.hidden=true;quantity.disabled=button.disabled=true;
 status.textContent='';section._refreshQuantity=null;form.onsubmit=null;
 if(typeof db==='undefined'||!db){status.textContent='El almacenamiento local todavía está cargando. Vuelve a abrir el módulo.';return}
 let criteria,stocks;
 try{[criteria,stocks]=await Promise.all([all('inventoryCriteria'),all('inventoryStock')])}
 catch(error){status.textContent='No se pudo leer el inventario local: '+error.message;return}
 const balances=new Map(stocks.map(row=>[row.itemId,row]));
 const items=criteria.filter(row=>canAdjustQuantity(row,balances.get(row.id)))
  .sort((a,b)=>itemName(a).localeCompare(itemName(b),'es',{numeric:true,sensitivity:'base'}));
 let selected,stock,pending,selectionVersion=0;
 function drawItems(){
  const query=selected?'':search.value;
  const matches=items.filter(row=>matchesItemSearch([itemName(row),itemSecondary(row),itemTertiary(row)].join(' '),'',query));
  menu.replaceChildren(...matches.map(row=>{
   const option=document.createElement('button');
   option.type='button';option.dataset.itemId=row.id;option.textContent=itemName(row);
   const aliases=[itemSecondary(row),itemTertiary(row)].filter(Boolean);
   if(aliases.length){const detail=document.createElement('small');detail.textContent=aliases.join(' · ');option.append(detail)}
   return option;
  }));
  if(!matches.length)menu.textContent='No hay elementos que coincidan.';
  menu.hidden=false;
 }
 async function readSelected(keepInput=false){
  const id=selected?.id,version=++selectionVersion;
  if(!id)return;
  const [currentItems,currentStocks,adjustments]=await Promise.all([all('inventoryCriteria'),all('inventoryStock'),all(quantityAdjustments)]);
  if(version!==selectionVersion)return;
  const wasPending=pending,current=currentStocks.find(row=>row.itemId===id);
  const dirty=!quantity.disabled&&quantity.value!==String(stock?.quantity??0);
  pending=adjustments.find(row=>row.itemId===id);
  const eligible=canAdjustQuantity(currentItems.find(row=>row.id===id),current);
  if(!keepInput||!dirty||pending||!eligible){
   stock=current;
   quantity.value=pending?.quantity??current?.quantity??0;
  }
  quantity.disabled=button.disabled=Boolean(pending||!eligible||current?.syncState==='pending');
  if(pending?.syncError)status.textContent=pending.syncError+' Puedes descartar el ajuste desde Inicio y volver a registrarlo con el saldo actualizado.';
  else if(pending)status.textContent='Guardado en este equipo · pendiente de sincronizar con Plaza Blending.';
  else if(!eligible)status.textContent='El criterio ya no permite editar la cantidad.';
  else if(current?.syncState==='pending')status.textContent='Primero sincroniza los cambios del criterio de este elemento.';
  else if(wasPending)status.textContent='Ajuste procesado. Saldo en la base sincronizada: '+quantity.value+'.';
  else if(!keepInput)status.textContent='';
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
  if(event.key==='ArrowDown'&&event.target===search){event.preventDefault();if(menu.hidden)drawItems();menu.querySelector('button')?.focus()}
  if(event.key==='Enter'&&event.target===search){
   event.preventDefault();
   if(selected){menu.hidden=true;if(!quantity.disabled)quantity.focus()}
   else if(menu.hidden)drawItems();
   else menu.querySelector('button')?.click();
  }
 };
 menu.onclick=event=>{
  const option=event.target.closest('[data-item-id]');
  if(!option)return;
  selected=items.find(row=>row.id===option.dataset.itemId);
  search.value=itemName(selected);menu.hidden=true;
  stock=pending=null;quantity.value='';quantity.disabled=button.disabled=true;
  readSelected().then(()=>{if(selected?.id===option.dataset.itemId&&!quantity.disabled&&section.classList.contains('active'))quantity.focus()}).catch(report);
 };
 section._refreshQuantity=()=>{
  if(section.classList.contains('active')&&button.dataset.saving!=='1')readSelected(true).catch(report);
 };
 form.onsubmit=async event=>{
  event.preventDefault();
  if(button.disabled||!window.SKAdminAuth?.canView?.('inventoryQuantities')||!form.reportValidity())return;
  const id=selected?.id,value=quantity.valueAsNumber;
  if(!id||!Number.isFinite(value)||value<0)return;
  button.dataset.saving='1';search.disabled=quantity.disabled=button.disabled=true;menu.hidden=true;
  let failure;
  try{await queueQuantity(id,value,stock)}
  catch(error){failure=error}
  finally{delete button.dataset.saving;search.disabled=false}
  if(!failure)window.dispatchEvent(new Event('skweb-local-change'));
  try{await readSelected()}
  catch(error){report(failure||error);return}
  if(failure)report(failure);
 };
}
window.SKInventoryAdmin={mount,render,openKind,openQuantities,syncQuantities};window.addEventListener('load',()=>setTimeout(mount,120));
})();

