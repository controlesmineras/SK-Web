(()=>{
const norm=v=>(v||'').toString().trim().toLowerCase(),txt=v=>(v??'').toString().trim();
const CLASS_NUMBER_HELP='El número de clase indica el orden de llegada de los activos fijos dentro de su propia categoría. Por ejemplo, la categoría Motosierra lleva una numeración independiente de Pulidora, Rotomartillo y las demás categorías.';
const classKey=value=>norm(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');
const autoClassNumber=value=>/^taladros? inalambricos?$/.test(classKey(value));
const nextDrillNumber=(rows,clase)=>String(rows.filter(row=>classKey(row.clase)===classKey(clase)).reduce((max,row)=>{const value=txt(row.numeroClase||row.numeroYT||row.orden);return /^\d+$/.test(value)?Math.max(max,Number(value)):max},0)+1);
async function recentBrands(form){
 const control=form.elements.fabricante,clase=form.elements.clase.value;if(control?.tagName!=='INPUT'||!clase)return;
 const rows=await all('assets');if(control!==form.elements.fabricante||clase!==form.elements.clase.value)return;
 let list=document.querySelector('#assetRecentBrandOptions');if(!list){list=document.createElement('datalist');list.id='assetRecentBrandOptions';form.append(list)}
 const seen=new Set(),brands=rows.filter(row=>classKey(row.clase)===classKey(clase)&&txt(row.fabricante)).sort((a,b)=>txt(b.createdAt||b.fechaIngreso).localeCompare(txt(a.createdAt||a.fechaIngreso))).map(row=>txt(row.fabricante)).filter(value=>{const key=classKey(value);if(seen.has(key))return false;seen.add(key);return true}).slice(0,12);
 control.setAttribute('list',list.id);list.replaceChildren(...brands.map(value=>new Option(value,value)));
}
let criteriaByClass=new Map(),assetSaving=false,classRefreshVersion=0;
const criterionName=item=>txt(item?.name||item?.nombre||item?.element||item?.elemento||item?.CI_ELEMENTO||item?.ciElemento||item?.itemName);
const criterionAliases=item=>[item?.secondaryName||item?.nombreSecundario||item?.CI_NOMBRE_SECUNDARIO||item?.CI_ALIAS_SECUNDARIO||item?.aliasSecundario,item?.tertiaryName||item?.nombreTerciario||item?.CI_NOMBRE_TERCIARIO||item?.CI_ALIAS_TERCIARIO||item?.aliasTerciario].map(txt).filter(Boolean);
const criterionBoolean=value=>value===true||['true','si','sí','1','yes'].includes(norm(value));
function normalizedCriterion(item){return{...item,name:criterionName(item),isFixedAsset:criterionBoolean(item.isFixedAsset??item.esActivoFijo??item.fixedAsset??item.CI_ES_A_FIJO),usesSerial:criterionBoolean(item.usesSerial??item.CI_USA_SERIAL),usesLength:criterionBoolean(item.usesLength??item.CI_USA_LARGO),usesModel:criterionBoolean(item.usesModel??item.CI_USA_MODELO),usesManufacturer:/^motosierras?$/i.test(criterionName(item))||criterionBoolean(item.usesManufacturer??item.CI_USA_FABRICANTE),requiresInternalMark:criterionBoolean(item.requiresInternalMark)}}
function installClassNumberHelp(){const input=document.querySelector('#assetForm [name="numeroYT"]'),label=input?.closest('label');if(!input||!label||label.querySelector('.assetFieldInfo'))return;label.classList.add('assetClassNumberField');const button=document.createElement('button');button.type='button';button.className='assetFieldInfo';button.textContent='i';button.setAttribute('aria-label','¿Qué es el número de clase?');button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();alert(CLASS_NUMBER_HELP)});label.insertBefore(button,input);if(!document.querySelector('#assetFieldInfoStyle')){const style=document.createElement('style');style.id='assetFieldInfoStyle';style.textContent='.assetClassNumberField{position:relative}.assetClassNumberField>.assetFieldInfo{position:absolute;top:-5px;right:0;width:28px!important;height:28px!important;min-height:28px!important;padding:0!important;border:1px solid #1a4a68!important;border-radius:50%!important;background:#eef6fa!important;color:#173d59!important;font:700 16px/26px system-ui,sans-serif!important;text-align:center!important;box-shadow:none!important}.assetClassNumberField>.assetFieldInfo:focus-visible{outline:3px solid #8bc7e8;outline-offset:2px}';document.head.append(style)}}
function setAssetMode(editing){
 const form=document.querySelector('#assetForm'),readOnly=editing&&!window.SKAdminAuth?.isOwner?.();
 if(form)for(const control of form.elements){
  if(readOnly){if(!Object.prototype.hasOwnProperty.call(control.dataset,'assetPermissionDisabled'))control.dataset.assetPermissionDisabled=String(control.disabled);control.disabled=true;}
  else if(Object.prototype.hasOwnProperty.call(control.dataset,'assetPermissionDisabled')){control.disabled=control.dataset.assetPermissionDisabled==='true';delete control.dataset.assetPermissionDisabled;}
 }
 const remove=document.querySelector('#assetDeleteBtn');if(remove){remove.hidden=!editing||!window.SKAdminAuth?.isOwner?.();remove.disabled=assetSaving;}
 const b=document.querySelector('#assetSaveBtn');if(b){b.textContent=readOnly?'SOLO CONSULTA':editing?'Guardar cambios':'Registrar activo';b.disabled=readOnly||assetSaving;}
}
function isRepair(f){const t=[f.elements.descripcionNovedad?.value,f.elements.estado?.value,f.elements.observaciones?.value].join(' ').toLowerCase();return /reparaci[oó]n|reparar/.test(t)}
function suggestedMark(f){return norm(f.elements.clase?.value)==='yt'&&norm(f.elements.mina?.value)==='providencia'&&isRepair(f)?'P-AAA':''}
function applySuggestedMark(){const f=document.querySelector('#assetForm');if(!f?.elements.nuevaMarca)return;const i=f.elements.nuevaMarca,p=suggestedMark(f);if(p){if(!i.value||i.dataset.autoSuggested==='1'){i.value=p;i.dataset.autoSuggested='1';i.title='Marcación sugerida pendiente de aprobación'}}else if(i.dataset.autoSuggested==='1'){i.value='';delete i.dataset.autoSuggested;i.title=''}}
function classOptions(){return[...document.querySelectorAll('#assetClassOptions option')].map(o=>txt(o.value)).filter(Boolean)}
function validClass(value){return classOptions().some(v=>norm(v)===norm(value))}
async function refreshClassOptions(){if(typeof db==='undefined'||!db||typeof all!=='function')return;const version=++classRefreshVersion,rows=(await all('inventoryCriteria')).map(normalizedCriterion).filter(item=>!item.deleted&&item.active!==false&&item.isFixedAsset&&item.name).sort((a,b)=>a.name.localeCompare(b.name,'es',{numeric:true,sensitivity:'base'}));if(version!==classRefreshVersion)return;criteriaByClass=new Map(rows.map(item=>[norm(item.name),item]));const list=document.querySelector('#assetClassOptions');if(list)list.replaceChildren(...rows.map(item=>{const option=document.createElement('option');option.value=item.name;return option}));if(criteriaByClass.has(norm(document.querySelector('#assetClass')?.value)))updateAssetFields();document.querySelector('#assetClass')?._refreshClassSearch?.()}
function initClassPicker(){
 const input=document.querySelector('#assetClass');if(!input||document.querySelector('#assetClassSuggestions'))return;
 input.removeAttribute('list');input.setAttribute('aria-controls','assetClassSuggestions');
 const box=document.createElement('div');box.id='assetClassSuggestions';box.className='liveSuggestions assetClassSuggestions';box.setAttribute('role','listbox');input.insertAdjacentElement('afterend',box);
 let opened=false;
 const close=()=>{opened=false;box.classList.remove('open');input.closest('label')?.classList.remove('class-picker-open');input.setAttribute('aria-expanded','false')};
 const choose=value=>{input.value=value;input.dataset.selected=value;input.setCustomValidity('');close();input.dispatchEvent(new Event('change',{bubbles:true}))};
 const render=()=>{
  const q=norm(input.value),showAll=input.dataset.selected===input.value;
  const rows=[...criteriaByClass.values()].filter(item=>showAll||!q||norm([item.name,...criterionAliases(item)].join(' ')).includes(q));
  box.replaceChildren();
  for(const item of rows){const button=document.createElement('button');button.type='button';button.setAttribute('role','option');button.dataset.classValue=item.name;const title=document.createElement('strong');title.textContent=item.name;button.append(title);for(const alias of criterionAliases(item)){const small=document.createElement('small');small.textContent=alias;small.style.cssText='display:block;color:#7b8794;font-weight:400';button.append(small)}box.append(button)}
  if(!rows.length){const empty=document.createElement('div');empty.className='noSuggestion';empty.textContent='No hay clases de activos fijos que coincidan.';box.append(empty)}
  box.classList.add('open');input.closest('label')?.classList.add('class-picker-open');input.setAttribute('aria-expanded','true');
 };
 const open=()=>{opened=true;render();refreshClassOptions().catch(console.error)};
 input._refreshClassSearch=()=>{if(opened)render()};
 input.addEventListener('focus',open);input.addEventListener('click',open);
 input.addEventListener('input',()=>{delete input.dataset.selected;input.setCustomValidity('');opened=true;render()});
 input.addEventListener('keydown',event=>{if(event.key==='Escape')close();else if(event.key==='ArrowDown'){event.preventDefault();if(!opened)open();box.querySelector('button')?.focus()}else if(event.key==='Enter'&&opened){const exact=classOptions().find(v=>norm(v)===norm(input.value));if(exact){event.preventDefault();choose(exact)}}});
 box.addEventListener('pointerdown',event=>{if(event.target.closest('[data-class-value]'))event.preventDefault()});
 box.addEventListener('click',event=>{const button=event.target.closest('[data-class-value]');if(button)choose(button.dataset.classValue)});
 document.addEventListener('pointerdown',event=>{if(event.target!==input&&!box.contains(event.target))close()});
 input.addEventListener('blur',()=>setTimeout(()=>{if(box.contains(document.activeElement))return;input.setCustomValidity(input.value&&!validClass(input.value)?'Busca y selecciona una clase de activos fijos.':'');close()},150));
}
function updateModelControl(form,type){
 const current=form.elements.modelo;if(!current)return;
 const restricted=type==='yt'||type==='columna',tag=restricted?'SELECT':'INPUT';
 if(current.tagName===tag)return;
 const replacement=document.createElement(restricted?'select':'input'),value=current.value;
 for(const attribute of current.attributes)replacement.setAttribute(attribute.name,attribute.value);
 if(restricted){
  const blank=document.createElement('option');blank.value='';blank.textContent='Seleccione modelo…';replacement.append(blank);
  for(const model of window.SKFormOptions?.values('asset.model.yt',['28','29'])||['28','29']){
   const option=document.createElement('option');option.value=model;option.textContent=model;option.dataset.classOnly='yt';replacement.append(option);
  }
 }else{replacement.type='text';replacement.removeAttribute('pattern');replacement.removeAttribute('maxlength');replacement.placeholder='Ingresa el modelo…';}
 current.replaceWith(replacement);replacement.value=value;
}
function updateManufacturerControl(form,type){
 const current=form.elements.fabricante;if(!current)return;
 const kind=/^motosierras?$/.test(type)?'motosierra':type,restricted=['yt','autorrescatador','motosierra'].includes(kind),tag=restricted?'SELECT':'INPUT';
 if(current.tagName===tag)return;
 const replacement=document.createElement(restricted?'select':'input'),value=current.value;
 for(const attribute of current.attributes)replacement.setAttribute(attribute.name,attribute.value);
 if(restricted){
  const blank=document.createElement('option');blank.value='';blank.textContent='Seleccionar marca…';replacement.append(blank);
  const defaults={yt:['Gisi','Irreconocible'],autorrescatador:['Steel pro'],motosierra:['Makita','Stihl']};
  for(const brand of window.SKFormOptions?.values('asset.manufacturer.'+kind,defaults[kind])||defaults[kind]){const option=document.createElement('option');option.value=brand;option.textContent=brand;option.dataset.classOnly=kind;replacement.append(option)}
 }else{replacement.type='text';replacement.removeAttribute('pattern');replacement.removeAttribute('maxlength');replacement.placeholder='Ingresa la marca comercial…';}
 current.replaceWith(replacement);replacement.value=value;
}
function restoreAssetValue(control,value){
 if(!control)return;
 const text=String(value??'');
 if(control.tagName==='SELECT'&&text&&![...control.options].some(option=>option.value===text)){const option=document.createElement('option');option.value=text;option.textContent=text;control.append(option);if(control._classCatalog)control._classCatalog.push({value:text,text,classOnly:'',classExclude:''})}
 control.value=text;
}
function arrivalDetails(asset,income,person){
 if(!income||asset.descripcionNovedad||asset.fechaNovedad)return {};
 const timestamp=income.createdAt||asset.createdAt;if(!timestamp||!Number.isFinite(Date.parse(timestamp)))return {};
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(timestamp)).map(part=>[part.type,part.value]));
 return {mina:asset.mina||(income.incomeType==='REPARACIÓN'?income.originMine:'Sandra K')||'Sandra K',fechaNovedad:`${parts.year}-${parts.month}-${parts.day}`,horaNovedad:`${parts.hour}:${parts.minute}`,descripcionNovedad:'Llegada a mina',documentoResponsable:income.broughtByDocument||person?.documento||'',nombreResponsable:income.broughtByName||person?.nombre||'',documentoBodeguero:income.operatorDocument||income.actorDocument||'',nombreBodeguero:income.operatorName||''};
}
function updateClassOnlyOptions(type){if(type==='motosierras')type='motosierra';const form=document.querySelector('#assetForm');if(!form)return;['modelo','fabricante','estado'].forEach(name=>{const select=form.elements[name];if(!select||select.tagName!=='SELECT')return;if(!select._classCatalog)select._classCatalog=[...select.options].map(o=>({value:o.value,text:o.textContent,classOnly:o.dataset.classOnly||'',classExclude:o.dataset.classExclude||''}));const current=select.value,allowed=select._classCatalog.filter(o=>!o.value||(o.classOnly?norm(o.classOnly)===type:o.classExclude?norm(o.classExclude)!==type:true));select.replaceChildren(...allowed.map(item=>{const o=document.createElement('option');o.value=item.value;o.textContent=item.text;if(item.classOnly)o.dataset.classOnly=item.classOnly;if(item.classExclude)o.dataset.classExclude=item.classExclude;return o}));if(allowed.some(o=>o.value===current))select.value=current;else select.value=''})}
function requiresSerial(type,criterion){return type==='autorrescatador'||!!criterion?.usesSerial}
function criterionField(form,name,enabled,required=enabled){const input=form.elements[name],label=input?.closest('label');if(!input||!label)return;label.classList.toggle('criterion-disabled-field',!enabled);input.disabled=!enabled;input.required=!!required;if(!enabled)input.value=''}
function updateMarkFieldVisibility(form,type,automatic){
 const creating=!form.elements.id.value,eligible=!!window.SKAssetMarking?.eligible(type);
 const newMark=form.elements.nuevaMarca,label=newMark?.closest('label');
 if(newMark&&label){const visible=!creating&&eligible;label.classList.toggle('criterion-disabled-field',!visible);newMark.disabled=!visible;newMark.required=false;newMark.readOnly=true;}
 let hint=form.querySelector('#assetAutomaticMarkHint');if(!hint){hint=document.createElement('p');hint.id='assetAutomaticMarkHint';hint.className='hint wideField';hint.style.gridColumn='1 / -1';hint.textContent='La marca del activo se asigna automáticamente al guardar y sincronizar. Aparecerá en una ventana para marcarlo físicamente.';label?.after(hint)}hint.hidden=!automatic;
 if(automatic){const mark=form.elements.marcaInterna;mark?.closest('label')?.classList.add('criterion-disabled-field');if(mark){mark.disabled=true;mark.required=false;}}
}
function updateAssetFields(){const f=document.querySelector('#assetForm');if(!f)return;fillAssignedArea();const number=f.elements.numeroYT,numberEligible=window.SKAssetRules.automaticNumberEligible(f.elements.clase?.value),autoNumber=!f.elements.id.value&&numberEligible;number.closest('label').classList.toggle('criterion-disabled-field',autoNumber);number.disabled=autoNumber;number.required=!numberEligible;number.readOnly=numberEligible;number.placeholder=numberEligible?'Se asigna automáticamente al guardar':'';if(autoNumber)number.value='';const type=norm(f.elements.clase?.value),criterion=criteriaByClass.get(type),isColumn=type==='columna',isYT=type==='yt',isSelfRescuer=type==='autorrescatador';f.classList.toggle('asset-is-column',isColumn);f.classList.toggle('asset-is-yt',isYT);f.classList.toggle('asset-is-yt-column',isYT||isColumn);f.classList.toggle('asset-is-autorrescatador',isSelfRescuer);const romanNumber=f.elements.marcaAnterior;if(romanNumber){romanNumber.closest('label').classList.toggle('criterion-disabled-field',!isYT&&!isColumn);romanNumber.disabled=!isYT&&!isColumn;romanNumber.required=false;}updateModelControl(f,type);updateManufacturerControl(f,type);updateClassOnlyOptions(type);criterionField(f,'serial',true,false);criterionField(f,'largo',!!criterion?.usesLength);criterionField(f,'modelo',(!isColumn&&!isYT)||!!criterion?.usesModel,!!criterion?.usesModel);criterionField(f,'fabricante',(!isColumn&&!isYT)||!!criterion?.usesManufacturer,!!criterion?.usesManufacturer);const automatic=!f.elements.id.value&&window.SKAssetMarking?.eligible(type),protectedMark=automatic||f.dataset.autoMarkPolicy==='letters-v1';criterionField(f,'marcaInterna',protectedMark||!!criterion?.requiresInternalMark,false);f.elements.marcaInterna.readOnly=!!protectedMark;f.elements.marcaInterna.placeholder=automatic?'Se asigna automáticamente al sincronizar':'';f.elements.nuevaMarca.readOnly=!!protectedMark;f.elements.nuevaMarca.placeholder=automatic?'Marca de tres letras al sincronizar':'';updateMarkFieldVisibility(f,type,automatic);if(f.elements.estadoVisor){f.elements.estadoVisor.required=isSelfRescuer;if(!isSelfRescuer)f.elements.estadoVisor.value=''}if(f.elements.estado)f.elements.estado.required=isSelfRescuer;applySuggestedMark();setAssetMode(!!f.elements.id.value)}
const numberOf=a=>txt(window.SKAssetFields?.numero(a)||a.numeroClase||a.numeroYT||a.orden);const external=a=>norm(a.clase)==='yt'&&(/^p\d+$/i.test(numberOf(a))||norm(a.mina)==='providencia'||/\bexterna\b/i.test([a.marcaActual,a.marcaInterna].join(' ')));function cleanLabel(a){
 const type=norm(a.clase),yt=/^yt(?:\b|\d)/i.test(type),column=/^columnas?\b/i.test(type),present=value=>txt(value)&&norm(value)!=='no aplica';
 const parts=[txt(a.clase)];
 if(yt||column){
  if(yt&&['28','29'].includes(txt(a.modelo)))parts.push('Modelo '+txt(a.modelo));
  if(column&&present(a.largo))parts.push(txt(a.largo)+' ft');
  const current=txt(window.SKAssetFields?.marca(a)||a.marcaActual||a.marcaInterna),number=txt(a.numeroMarcaActual||a.marcaAnterior);
  if(present(current))parts.push('Marca actual: '+current);
  if(present(number))parts.push('N.º de marca actual: '+number);
 }else{
  if(present(a.fabricante))parts.push(txt(a.fabricante));
  if(present(a.serial))parts.push('Serial: '+txt(a.serial));
  const marks=[];if(present(a.nuevaMarca))marks.push(txt(a.nuevaMarca));
  const previous=txt(a.marcaPrevia||(!a.markingPolicy?a.marcaActual||a.marcaInterna:'')||a.marcaAnterior);
  if(present(previous)&&!marks.some(mark=>norm(mark)===norm(previous)))marks.push(previous);if(marks.length)parts.push('Marca: '+marks.join(' / '));
 }
 return parts.filter(Boolean).join(' · ');
}
window.SKAssetListLabel=cleanLabel;
function assetCompare(a,b){if(external(a)!==external(b))return external(a)?1:-1;const c=txt(a.clase).localeCompare(txt(b.clase),'es',{numeric:true,sensitivity:'base'});return c||(!!numberOf(a)!==!!numberOf(b)?(numberOf(a)?-1:1):numberOf(a).localeCompare(numberOf(b),'es',{numeric:true,sensitivity:'base'}))||cleanLabel(a).localeCompare(cleanLabel(b),'es',{numeric:true})}
function installAssetList(){window.assetLabel=cleanLabel;window.renderAssetList=function(rows){const host=document.querySelector('#assetAdminList');if(!host)return;const q=norm(document.querySelector('#assetSearch')?.value);const f=rows.filter(x=>!x.deleted&&Object.values(x).join(' ').toLowerCase().includes(q)).sort(assetCompare);host.innerHTML=f.map(x=>`<button class="assetRow" data-id="${x.id}"><b>${cleanLabel(x)}</b><small>Mina propietaria: ${x.mina||'Sin registrar'} · Ubicación: ${x.ubicacion||'Sin ubicación'} · ${x.estado||'Sin estado'}</small></button>`).join('')||'<p class="hint">No hay activos que coincidan.</p>'}}
function fillAssignedArea(value){const form=document.querySelector('#assetForm'),control=form?.elements.areaAsignada;if(!control)return;const current=value??control.value,areas=window.SKFormOptions?.values?.('personal.area')||['Seguridad física','Desmin - Obras civiles','Producción','Producción - Selectivo (Corteros)','Administrativa'];control.replaceChildren(new Option('Seleccionar área…',''),...areas.map(area=>new Option(area,area)));if(current&&!areas.includes(current))control.add(new Option(current,current));control.value=current}
async function fillPeople(selected=''){if(typeof db==='undefined'||!db||typeof all!=='function')return;const s=document.querySelector('#assetAssigned');if(!s)return;const rows=(await all('personal')).sort((a,b)=>(a.nombre||'').localeCompare(b.nombre||'','es'));s.innerHTML='<option value="">Sin asignar</option>';for(const p of rows){const o=document.createElement('option');o.value=p.id;o.textContent=`${p.documento||''} - ${p.nombre||''}`;s.append(o)}s.value=selected||'';showAssigned()}async function showAssigned(){const s=document.querySelector('#assetAssigned');if(!s||typeof all!=='function')return;const p=(await all('personal')).find(x=>x.id===s.value);document.querySelector('#assetAssignedDoc').value=p?.documento||'';document.querySelector('#assetAssignedArea').value=p?.area||'';document.querySelector('#assetAssignedCargo').value=p?.cargo||''}
function openNewAsset(prefillYT=false,className=''){const f=document.querySelector('#assetForm');if(!f||!window.SKAdminAuth?.canView?.('assets'))return;f.reset();delete f.dataset.autoMarkPolicy;f.elements.id.value='';setAssetMode(false);refreshClassOptions().catch(console.error);if(navigator.onLine&&window.skSyncApi?.configured?.())window.skSyncApi.sync({silent:true,forceFull:true});f.elements.ubicacion.value='Bodega de Superficie';f.elements.estado.value='Operativo/a';if(className)f.elements.clase.value=className;else if(prefillYT)f.elements.clase.value='YT';updateAssetFields();fillPeople();document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id==='assets'));document.querySelectorAll('#nav [data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view==='assets'));setAssetMode(false);setTimeout(()=>f.scrollIntoView({behavior:'smooth',block:'start'}),0)}
async function hydrateEdit(){const f=document.querySelector('#assetForm');if(!f?.elements.id.value)return;const a=(await all('assets')).find(x=>x.id===f.elements.id.value&&!x.deleted);if(!a)return;f.dataset.autoMarkPolicy=a.markingPolicy||'';const c=window.SKAssetFields?.canonical(a);if(c){f.elements.numeroYT.value=c.numeroClase||'';f.elements.marcaInterna.value=c.marcaActual||'';f.elements.marcaAnterior.value=c.numeroMarcaActual||''}for(const name of ['marcaPrevia','modelo','fabricante','mina','fechaNovedad','horaNovedad','descripcionNovedad','documentoResponsable','nombreResponsable','documentoBodeguero','nombreBodeguero'])if(f.elements[name])f.elements[name].value=a[name]??'';fillAssignedArea(a.areaAsignada||'');await fillPeople(a.asignadaId||'');updateAssetFields();restoreAssetValue(f.elements.modelo,a.modelo);restoreAssetValue(f.elements.fabricante,a.fabricante);const incomes=(await all('blendingIncomes')).filter(row=>row.assetId===a.id&&!row.deleted&&!row.reversed&&!row.reversado).sort((x,y)=>Date.parse(x.createdAt)-Date.parse(y.createdAt));const first=incomes[0],person=first?(await all('personal')).find(row=>row.id===first.broughtById):null;for(const [name,value] of Object.entries(arrivalDetails(a,first,person)))if(f.elements[name]&&!f.elements[name].value)restoreAssetValue(f.elements[name],value);setAssetMode(true)}
function duplicateAsset(rows,x,editing){const identityDuplicate=window.SKAssetRules.duplicateIdentity(rows,x);if(identityDuplicate)return{field:window.SKAssetRules.duplicateSerial(rows,x)?'SERIAL':'MARCA ANTERIOR',value:x.serial||x.marcaPrevia||x.marcaActual||x.marcaInterna,found:identityDuplicate};const cls=norm(x.clase),candidates=rows.filter(a=>!a.deleted&&norm(a.clase)===cls&&(!editing||a.id!==x.id));const serial=txt(x.serial),num=txt(x.numeroClase||x.numeroYT),mark=txt(x.marcaInterna||x.marcaActual);if(serial&&norm(serial)!=='no aplica'){const found=window.SKAssetRules.duplicateSerial(rows,x);if(found)return{field:'SERIAL',value:serial,found}}if(num&&norm(num)!=='no aplica'){const found=candidates.find(a=>norm(numberOf(a))===norm(num));if(found)return{field:'NÚMERO DE CLASE',value:num,found}}if(mark&&norm(mark)!=='no aplica'){const found=candidates.find(a=>norm(a.marcaActual||a.marcaInterna)===norm(mark));if(found)return{field:'MARCA ACTUAL',value:mark,found}}return null}
async function saveAsset(e){
 e.preventDefault();e.stopImmediatePropagation();if(assetSaving)return;
 if(!window.SKAdminAuth?.canView?.('assets'))return;
 if(e.currentTarget.elements.id.value&&!window.SKAdminAuth.isOwner())return alert('Puedes agregar activos nuevos. Las fichas existentes son de solo consulta; registra sus cambios de estado en Novedades de activos.');
 assetSaving=true;let createdAsset=null;const f=e.currentTarget,button=document.querySelector('#assetSaveBtn');if(button)button.disabled=true;
 try{
  const x=fd(f),rows=await all('assets'),editing=!!x.id,type=norm(x.clase),criterion=criteriaByClass.get(type),automatic=!editing&&window.SKAssetMarking?.eligible(x.clase);
  if(!validClass(x.clase)||!criterion)return alert('Selecciona una CLASE activa de Criterios de inventario.');
  if(window.SKAssetRules.automaticNumberEligible(x.clase)){x.numeroYT=window.SKAssetRules.classNumber(rows,x);x.classNumberPolicy='auto-v1';}
  if(!txt(x.numeroYT))return alert('Ingresa el NÚMERO DE CLASE del activo.');
  if(!window.SKAssetRules.hasIdentity(x))return alert('Ingresa SERIAL o MARCA ANTERIOR. El activo debe tener al menos uno de los dos.');
  for(const [flag,field,label] of [['usesSerial','serial','SERIAL'],['usesLength','largo','LARGO FT'],['usesModel','modelo','MODELO'],['usesManufacturer','fabricante','MARCA COMERCIAL'],['requiresInternalMark','marcaInterna','MARCA ACTUAL']])if(!['serial','marcaInterna'].includes(field)&&criterion[flag]&&!((automatic||f.dataset.autoMarkPolicy==='letters-v1')&&field==='marcaInterna')&&!txt(x[field]))return alert(`Ingresa ${label}. Este campo es obligatorio para la clase ${x.clase}.`);
  x.numeroClase=txt(x.numeroYT);x.marcaActual=txt(x.marcaInterna);x.numeroMarcaActual=txt(x.marcaAnterior);
  const dup=duplicateAsset(rows,x,editing);
  if(dup)return alert(`ESTE ACTIVO YA ESTÁ REGISTRADO\n\nYa existe un activo con ${dup.field}: ${dup.value}.\n\nRegistro existente: ${cleanLabel(dup.found)}.\n\nRevisa nuevamente el buscador de activos.`);
  if(editing){
   const old=rows.find(a=>a.id===x.id&&!a.deleted);if(!old)return alert('No se encontró el activo.');
   await put('assets',{...old,...x,updatedAt:now(),syncState:'pending'});alert('Activo actualizado.');
  }else{
   delete x.id;const record=window.SKAssetMarking.prepare({...x,...mark(),ubicacion:x.ubicacion||'Bodega de Superficie'});
   await put('assets',record);
   if(!(await all('assets')).find(a=>a.id===record.id))return alert('No fue posible confirmar el registro local del activo. Intenta nuevamente.');
   createdAsset=record;
   if(!window.SKAssetMarking.saved([record]))alert(`Activo registrado: ${x.clase} ${x.numeroClase}`);
  }
  openNewAsset(false);await refresh();if(window.refreshConsumptionMachines)await window.refreshConsumptionMachines();window.skSyncApi?.schedule?.(300);if(createdAsset)window.SKAssetMarking.syncSaved(createdAsset).catch(console.error);
 }catch(error){console.error(error);alert('No se pudo completar el registro: '+(error.message||error));}
 finally{assetSaving=false;if(button)button.disabled=false;}
}
async function deleteAsset(){
 if(assetSaving||!window.SKAdminAuth?.isOwner?.())return;
 const form=document.querySelector('#assetForm'),id=form?.elements.id.value;if(!id)return;
 assetSaving=true;setAssetMode(true);let saved=false;
 try{
  const asset=(await all('assets')).find(row=>row.id===id&&!row.deleted);if(!asset)return;
  if(!confirm(`¿Eliminar este activo fijo?\n\n${cleanLabel(asset)}\n\nDejará de aparecer en el listado y en las opciones para nuevos registros. Se conservarán sus novedades, ingresos, entregas y consumos.\n\nLa eliminación se enviará a los demás dispositivos al sincronizar.`))return;
  if(!window.SKAdminAuth?.isOwner?.())return;
  const timestamp=new Date(Math.max(Date.now(),(Date.parse(asset.updatedAt||asset.createdAt)||0)+1)).toISOString(),user=window.SKAdminAuth.user?.();
  await put('assets',{...asset,deleted:true,deletedAt:timestamp,deletedBy:user?.username||'admin',deletedByName:user?.name||'',updatedAt:timestamp,syncState:'pending'});
  saved=true;form.reset();form.elements.id.value='';delete form.dataset.autoMarkPolicy;updateAssetFields();
  window.skSyncApi?.schedule?.(300);
  await refresh();await window.refreshConsumptionMachines?.();
  alert('Activo eliminado en este dispositivo. La eliminación está pendiente de sincronizar con los demás equipos.');
 }catch(error){console.error(error);alert(saved?'El activo quedó eliminado. Recarga para actualizar el listado.':'No se pudo eliminar el activo: '+(error.message||error));}
 finally{assetSaving=false;setAssetMode(!!form.elements.id.value);}
}
const warehouseSearch=value=>txt(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es').replace(/\s+/g,' ');
const isWarehousePerson=person=>!person.deleted&&!!txt(person.documento)&&/^bodeguer(?:o|a|o\s*\/\s*a|a\s*\/\s*o)$/.test(warehouseSearch(person.cargo));
function initWarehousePicker(){
 const form=document.querySelector('#assetForm'),input=form?.elements.documentoBodeguero,name=form?.elements.nombreBodeguero,label=input?.closest('label');if(!input||!name||!label||document.querySelector('#assetWarehouseSuggestions'))return;
 input.type='search';input.autocomplete='off';input.placeholder='Buscar bodeguero/a por documento o nombre…';input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-controls','assetWarehouseSuggestions');input.setAttribute('aria-expanded','false');name.readOnly=true;name.classList.add('derived');
 const menu=document.createElement('div');menu.id='assetWarehouseSuggestions';menu.className='liveSuggestions assetClassSuggestions';menu.setAttribute('role','listbox');label.append(menu);
 let people=[],opened=false,version=0;
 const close=()=>{opened=false;menu.classList.remove('open');label.classList.remove('class-picker-open');input.setAttribute('aria-expanded','false')};
 const choose=person=>{input.value=txt(person.documento);name.value=txt(person.nombre)||[person.primerNombre,person.segundoNombre,person.primerApellido,person.segundoApellido].filter(Boolean).join(' ');input.dataset.selected=person.documento;input.setCustomValidity('');close()};
 const draw=()=>{const query=warehouseSearch(input.value),selected=input.dataset.selected===input.value;menu.replaceChildren();for(const person of people.filter(person=>selected||!query||warehouseSearch([person.documento,person.nombre,person.primerNombre,person.segundoNombre,person.primerApellido,person.segundoApellido].join(' ')).includes(query))){const button=document.createElement('button');button.type='button';button.setAttribute('role','option');button.textContent=[person.documento,person.nombre||[person.primerNombre,person.segundoNombre,person.primerApellido,person.segundoApellido].filter(Boolean).join(' ')].filter(Boolean).join(' – ');button.addEventListener('click',()=>choose(person));menu.append(button)}if(!menu.children.length){const empty=document.createElement('div');empty.className='noSuggestion';empty.textContent='No hay bodegueros/as que coincidan.';menu.append(empty)}menu.classList.add('open');label.classList.add('class-picker-open');input.setAttribute('aria-expanded','true')};
 const refresh=async()=>{const current=++version;if(typeof db==='undefined'||!db||typeof all!=='function')return;const rows=await all('personal');if(current!==version)return;people=rows.filter(isWarehousePerson).sort((a,b)=>txt(a.nombre).localeCompare(txt(b.nombre),'es',{sensitivity:'base'}));if(opened)draw()};
 const open=()=>{opened=true;draw();refresh().catch(console.error)};
 input.addEventListener('focus',open);input.addEventListener('click',open);input.addEventListener('input',()=>{delete input.dataset.selected;name.value='';input.setCustomValidity('');opened=true;draw()});
 input.addEventListener('change',()=>{const person=people.find(person=>txt(person.documento)===txt(input.value));if(person)choose(person)});
 input.addEventListener('keydown',event=>{if(event.key==='Escape')close();else if(event.key==='ArrowDown'){event.preventDefault();if(!opened)open();menu.querySelector('button')?.focus()}else if(event.key==='Enter'&&opened){const person=people.find(person=>txt(person.documento)===txt(input.value));if(person){event.preventDefault();choose(person)}}});
 menu.addEventListener('pointerdown',event=>{if(event.target.closest('button'))event.preventDefault()});
 document.addEventListener('pointerdown',event=>{if(!label.contains(event.target))close()});
 input.addEventListener('blur',()=>setTimeout(()=>{if(menu.contains(document.activeElement))return;if(input.value&&!name.value)input.setCustomValidity('Selecciona un colaborador con cargo Bodeguero/a.');close()},150));
 form.addEventListener('reset',()=>{delete input.dataset.selected;input.setCustomValidity('');close()});
 window.addEventListener('skweb-synced',()=>refresh().catch(console.error));window.addEventListener('skweb-db-ready',()=>refresh().catch(console.error));refresh().catch(console.error);
}

function openFromPlaza(){const p=new URLSearchParams(location.search);if(p.get('registerAssetFrom')!=='plaza-delivery')return;let ctx={};try{ctx=JSON.parse(sessionStorage.getItem('skAssetRegistrationContext')||'{}')}catch{}const cls=p.get('class')||ctx.className||'';setTimeout(()=>openNewAsset(false,cls),250)}
window.addEventListener('skadmin-permissions',()=>setAssetMode(!!document.querySelector('#assetForm')?.elements.id.value));
window.addEventListener('load',()=>{document.querySelector('#assetClassOptions')?.replaceChildren();if(!document.querySelector('#criterionAssetFieldStyle')){const style=document.createElement('style');style.id='criterionAssetFieldStyle';style.textContent='.assetDetailedForm label.criterion-disabled-field{display:none!important}';document.head.append(style)}document.querySelector('#assetDeleteBtn')?.addEventListener('click',deleteAsset);installClassNumberHelp();installAssetList();initClassPicker();initWarehousePicker();const list=document.querySelector('#assetAdminList'),add=document.querySelector('#newAssetBtn'),quick=document.querySelector('#quickYT'),form=document.querySelector('#assetForm');updateAssetFields();fillPeople();setTimeout(refreshClassOptions,350);list?.addEventListener('click',e=>{if(e.target.closest('[data-id]'))setTimeout(hydrateEdit,30)});add?.addEventListener('click',()=>setTimeout(()=>openNewAsset(false),0));quick?.addEventListener('click',()=>setTimeout(()=>openNewAsset(true),0));['clase','mina','estado','descripcionNovedad','observaciones'].forEach(n=>{form?.elements?.[n]?.addEventListener('input',updateAssetFields);form?.elements?.[n]?.addEventListener('change',updateAssetFields)});form?.elements?.nuevaMarca?.addEventListener('input',()=>{if(form.elements.nuevaMarca.dataset.autoSuggested==='1')delete form.elements.nuevaMarca.dataset.autoSuggested});document.querySelector('#assetAssigned')?.addEventListener('change',showAssigned);form?.addEventListener('focusin',event=>{if(event.target===form.elements.fabricante)recentBrands(form).catch(console.error)});form?.addEventListener('submit',saveAsset,true);form?.addEventListener('reset',()=>setTimeout(()=>{setAssetMode(false);updateAssetFields()},0));window.addEventListener('skweb-db-ready',()=>{fillPeople();refreshClassOptions()});window.addEventListener('skweb-synced',refreshClassOptions);window.addEventListener('skweb-inventory-refresh',refreshClassOptions);window.addEventListener('skweb-options-applied',()=>fillAssignedArea());setTimeout(async()=>{installAssetList();if(typeof db!=='undefined'&&db&&typeof all==='function')renderAssetList(await all('assets'))},1200);openFromPlaza()});})();

