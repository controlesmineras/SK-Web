// Novedades compartidas por administrador y auxiliares, con guardado local atómico.
(()=>{
'use strict';
const noveltyText=value=>String(value||'').replace(/\s*\([^()]*\)\s*$/,'').trim();
const noveltyHint=value=>String(value||'').match(/\([^()]*\)\s*$/)?.[0]||'';
const VISOR_CHANGE='Cambio de color del visor';
const norm=value=>String(value||'').trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const isRescuer=asset=>norm(asset?.clase)==='autorrescatador';
const isVisorChange=value=>norm(value)===norm(VISOR_CHANGE);
const colors=()=>window.SKFormOptions?.values('asset.viewerColor')||['Marrón','Azul celeste','Blanco','Negro','Amarillo','Averiado'];

const requiresActa=value=>/^dad[oa](?:\/[oa])? de baja mediante acta$/.test(norm(value));
const validActa=row=>row&&!row.deleted&&row.tipo!=='OFICIO';
const safeActaUrl=value=>{try{const url=new URL(String(value||'').trim());return ['https:','http:'].includes(url.protocol)?url.href:''}catch{return ''}};
const escapeActa=value=>String(value??'').replace(/[&<>"']/g,char=>'&#'+char.charCodeAt(0)+';');
let actaRows=[];
function actaHTML(novelty,current){const document=current||{consecutivo:novelty.actaNumero,enlace:novelty.actaEnlace};if(!novelty.actaId)return '';const number='Acta N.º '+(document.consecutivo||novelty.actaNumero||'Sin número'),url=safeActaUrl(document.enlace);return '<small>'+escapeActa(number)+(url?' · <a href="'+escapeActa(url)+'" target="_blank" rel="noopener noreferrer">'+escapeActa(url)+'</a>':' · Sin enlace registrado')+'</small>'}
function mountActaField(){
 const form=document.querySelector('#noveltyForm');if(!form||document.querySelector('#novActaField'))return;
 const label=document.createElement('label');label.id='novActaField';label.hidden=true;label.style.display='none';
 label.append('ACTA');const select=document.createElement('select');select.name='actaId';select.id='novActaId';select.disabled=true;label.append(select);form.elements.descripcion.closest('label').after(label);
 const preview=document.createElement('div');preview.id='novActaPreview';preview.className='hint';preview.style.cssText='grid-column:1/-1;overflow-wrap:anywhere';preview.hidden=true;label.after(preview);
 select.addEventListener('change',()=>{const selected=actaRows.find(row=>row.id===select.value);preview.innerHTML=selected?actaHTML({actaId:selected.id,actaNumero:selected.consecutivo},selected):'Selecciona un acta registrada. Si no aparece, regístrala primero en Registro de documentos.'});
}
function updateActaField(form){
 mountActaField();const active=requiresActa(form.elements.descripcion.value),select=form.elements.actaId,label=document.querySelector('#novActaField'),preview=document.querySelector('#novActaPreview');if(!select)return;
 label.hidden=!active;label.style.display=active?'':'none';preview.hidden=!active;select.disabled=!active;select.required=active;
 if(!active){select.value='';preview.replaceChildren();return;}
 const current=select.value;select.replaceChildren(new Option('Seleccionar acta registrada…',''),...actaRows.map(row=>new Option('Acta N.º '+row.consecutivo+' · '+(row.fecha||'Sin fecha')+' · '+(row.motivo||row.area||''),row.id)));select.value=current;
 select.dispatchEvent(new Event('change'));

}


const isRetiredState=value=>window.SKAssetHistory.isRetiredState(value);
function updateRetiredLocation(){
 const form=document.querySelector('#noveltyForm'),location=form?.elements.ubicacion;if(!location)return;
 const state=form.elements.estado,notice=window.SKAssetHistory.isRetirementNotice(form.elements.descripcion.value);
 if(notice){
  if(state.dataset.beforeActa===undefined)state.dataset.beforeActa=state.value;
  const retiredState=isRescuer(selectedAsset)?'Dado de baja':'Dado/a de baja';
  if(!Array.from(state.options).some(option=>option.value===retiredState))state.add(new Option(retiredState,retiredState));
  state.value=retiredState;
 }else if(state.dataset.beforeActa!==undefined){state.value=state.dataset.beforeActa;delete state.dataset.beforeActa;}
 state.disabled=notice;
 const retired=isRetiredState(state.value);
 const availability=form.elements.namedItem('novOperationStatus');
 if(availability){availability.readOnly=true;availability.value=retired?'No':state.value?window.SKAssetHistory.operationStatus({estado:state.value}):(selectedAsset?window.SKAssetHistory.operationStatus(selectedAsset):'');}
 if(retired){if(!location.readOnly)location.dataset.beforeRetirement=location.value;location.value='Desechado/a';location.readOnly=true;location.style.background='#eef2f5';}
 else{if(location.readOnly&&location.dataset.beforeRetirement!==undefined)location.value=location.dataset.beforeRetirement;delete location.dataset.beforeRetirement;location.readOnly=false;location.style.background='';}
}

let selectedAsset=null,generation=0,saving=false;
function fill(select,values,current,placeholder){
  select.replaceChildren();
  if(placeholder)option(select,'',placeholder);
  values.forEach(value=>{if(select.id==='novDesc'){const item=new Option(noveltyText(value),noveltyText(value));item.dataset.hint=noveltyHint(value);select.add(item)}else option(select,value,value)});
  if(select.id==='novDesc')select.value=noveltyText(current);else if(values.includes(current))select.value=current;
}
function updateFields(){
  const form=document.querySelector('#noveltyForm');if(!form)return;
  const active=selectedAsset?.id===form.elements.assetId.value&&isRescuer(selectedAsset)&&isVisorChange(form.elements.descripcion.value);
  const field=document.querySelector('#novVisorField'),select=form.elements.estadoVisor;
  field.hidden=!active;field.style.display=active?'':'none';select.disabled=!active;select.required=active;
  if(!active)select.value='';updateActaField(form);updateRetiredLocation();
}
function defaultEventTime(form){
  const parts=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
  const values=Object.fromEntries(parts.map(p=>[p.type,p.value]));
  if(!form.elements.fechaNovedad.value)form.elements.fechaNovedad.value=`${values.year}-${values.month}-${values.day}`;
  if(!form.elements.horaNovedad.value)form.elements.horaNovedad.value=`${values.hour}:${values.minute}`;
}
async function update(){
  const form=document.querySelector('#noveltyForm');if(!form||typeof db==='undefined'||!db)return;
  defaultEventTime(form);
  const ticket=++generation,assetId=form.elements.assetId.value,[assets,historyData]=await Promise.all([all('assets'),window.SKAssetHistoryUI.read()]);actaRows=(await all('actas')).filter(validActa).sort((a,b)=>Number(b.consecutivo)-Number(a.consecutivo));
  if(ticket!==generation||assetId!==form.elements.assetId.value)return;
  const asset=assets.find(row=>row.id===assetId&&!row.deleted),changed=selectedAsset?.id!==asset?.id;
  const visible=asset&&window.SKAssetHistory.project(asset,historyData).asset;
  selectedAsset=visible||null;
  const assigned=form.elements.areaAsignada,currentArea=changed?'':assigned.value;
  const areas=window.SKAssetRules.assignmentAreas(window.SKFormOptions?.values?.('personal.area'));
  if(currentArea&&!areas.includes(currentArea))areas.push(currentArea);
  fill(assigned,areas,currentArea,visible?.areaAsignada?'Sin cambio · '+visible.areaAsignada:'Sin cambio');
  const catalog=window.SKFormOptions?.values('novelty.description')||['Revista física','Encontrada abandonada','Dada de baja mediante acta'];
  const descriptions=catalog.filter(value=>!isVisorChange(value));
  if(isRescuer(asset))descriptions.push(VISOR_CHANGE);
  fill(form.elements.descripcion,descriptions,form.elements.descripcion.value,'Seleccionar novedad…');
  fill(form.elements.estadoVisor,colors(),changed?'':form.elements.estadoVisor.value,'Seleccionar color…');
  const states=window.SKFormOptions?.values(isRescuer(asset)?'asset.state.autorrescatador':'asset.state.standard')||[];
  const current=changed?'':form.elements.estado.value;
  // Conservar el estado histórico aunque haya sido retirado del catálogo.
  if(current&&!states.includes(current))states.push(current);
  fill(form.elements.estado,states,current,visible?.estado?'Sin cambio · '+visible.estado:'Sin cambio');
  const locations=document.querySelector('#novLocationOptions');
  if(locations){const values=window.SKFormOptions?.values('asset.location')||['Bodega de Superficie','Bodega de Producción-N. 4','Socavón','Extraviado'];const choices=[...new Set([...values,'Desechado/a',asset?.ubicacion].filter(Boolean))];locations.replaceChildren(...choices.map(value=>new Option(value,value)));}
  if(changed){delete form.elements.estado.dataset.beforeActa;form.elements.ubicacion.readOnly=false;delete form.elements.ubicacion.dataset.beforeRetirement;form.elements.ubicacion.value='';}
  form.elements.ubicacion.placeholder=visible?.ubicacion?'Sin cambio · '+visible.ubicacion:'Sin cambio';
  updateFields();
  window.SKAssetHistoryUI?.select('novelty',assetId).catch(console.error);
}
async function save(event){
  event.preventDefault();if(saving)return;
  const form=event.target;if(!window.SKAdminAuth?.canView?.('novelties'))return;
  saving=true;const button=form.querySelector('button[type="submit"],button:not([type])');if(button)button.disabled=true;
  try{
    const data=fd(form);data.descripcion=noveltyText(data.descripcion);if(!data.descripcion)throw new Error('Selecciona la novedad.');const asset=data.assetId&&await idbResult(db.transaction('assets').objectStore('assets').get(data.assetId));
    if(!asset||asset.deleted)throw new Error('Selecciona un activo.');
    if(requiresActa(data.descripcion)){const acta=(await all('actas')).find(row=>row.id===data.actaId&&validActa(row));if(!acta)throw new Error('Selecciona un acta de Registro de documentos.');data.actaNumero=acta.consecutivo;data.actaEnlace=safeActaUrl(acta.enlace);data.estado=isRescuer(asset)?'Dado de baja':'Dado/a de baja'}else{delete data.actaId;delete data.actaNumero;delete data.actaEnlace}
    if(window.SKAssetHistory.isRetirementNotice(data.descripcion))data.estado=isRescuer(asset)?'Dado de baja':'Dado/a de baja';
    if(isRetiredState(data.estado))data.ubicacion='Desechado/a';
    const visor=isVisorChange(data.descripcion);
    if(visor&&!isRescuer(asset))throw new Error('El cambio de color del visor solo está disponible para autorrescatadores.');
    if(visor&&!colors().includes(data.estadoVisor))throw new Error('Selecciona el color del visor.');
    if(!visor)delete data.estadoVisor;
    const date=new Date(data.fechaNovedad+'T'+data.horaNovedad+':00-05:00'),meta=mark();
    if(!/^\d{4}-\d{2}-\d{2}$/.test(data.fechaNovedad)||!/^\d{2}:\d{2}$/.test(data.horaNovedad)||!Number.isFinite(date.getTime()))throw new Error('Selecciona la fecha y hora de la novedad.');
    const novelty={...meta,...data,occurredAt:date.toISOString(),fechaLocal:date.toLocaleDateString('es-CO',{timeZone:'America/Bogota'}),horaLocal:date.toLocaleTimeString('es-CO',{timeZone:'America/Bogota'})};
    novelty.datedNovelty=true;
    const author=window.SKAdminAuth?.user?.();
    if(author?.username){novelty.registeredBy=author.username;novelty.registeredByName=author.name||author.username;}
    for(const field of Object.keys(data))if(!String(data[field]??'').trim())delete novelty[field];
    // Solo la novedad entra en la cola. El servidor compara con su propia ficha.
    window.SKAdminAuth?.requireActive?.();
    form.inert=true;const tx=db.transaction(assetProfileTables,'readwrite');
    const committed=new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||new Error('No se pudo guardar la novedad.'));});
    const saveRow=async()=>{
      const stored=await idbResult(tx.objectStore('assets').get(asset.id));
      if(!stored||stored.deleted)throw new Error('El activo ya no está disponible.');
      const current=await currentAssetProfile(tx,stored);
      const updated=window.SKAssetHistory.applyDatedNovelty(current,novelty);
      novelty.historyOnly=!updated;
      if(updated){novelty.assetBefore=window.SKAssetHistory.snapshot(current);novelty.assetAfter=window.SKAssetHistory.snapshot(updated);}
      tx.objectStore(assetProfileStore).put(updated||current);
      if(visor&&!novelty.historyOnly&&current.estadoVisor)novelty.estadoVisorAnterior=current.estadoVisor;
      await idbResult(tx.objectStore('novelties').add(novelty));
    };
    await Promise.all([committed,saveRow().catch(error=>{try{tx.abort()}catch{} throw error;})]);
    form.reset();selectedAsset=null;
    const status=document.querySelector('#noveltySaveStatus');
    status.setAttribute?.('data-novelty-id',novelty.id);
    renderSaveStatus(status,novelty,asset);
    const showButton=document.querySelector('#noveltyShowSaved');
    if(showButton){
      showButton.hidden=false;
      showButton.onclick=()=>window.SKAssetHistoryUI.showSaved(novelty.id).catch(error=>alert(error.message));
    }
    window.dispatchEvent(new Event('skweb-local-change'));
    window.skSyncApi?.schedule?.(300);
    try{await refresh();await update();}
    catch(error){console.error('La novedad se guardó, pero falló la actualización de la pantalla.',error);}
  }catch(error){alert(error.message||'No se pudo guardar la novedad.');}
  finally{form.inert=false;saving=false;if(button)button.disabled=false;}
}

function renderSaveStatus(status,row,asset){
  status.hidden=false;
  if(row.deleted||row.reversed||row.reversedAt){
    status.textContent=row.deleted?'Esta novedad fue eliminada.':'Esta novedad fue revertida.';
    const button=document.querySelector('#noveltyShowSaved');if(button)button.hidden=!!row.deleted;
    return;
  }
  const state=row.syncState==='pending'?'Pendiente de sincronización.':'Confirmada en la base central.';
  const saved=row.historyOnly?'Novedad guardada solo en el historial.':'Novedad guardada.';
  const name=asset&&(window.SKAssetOwnership?.label(asset)||window.SKAssetRules?.label(asset)||asset.serial||asset.clase);
  status.textContent='✓ '+saved+' '+state+' '+[name,row.descripcion,row.fechaNovedad.split('-').reverse().join('/')+' '+row.horaNovedad].filter(Boolean).join(' · ');
}

function installAssetPicker(){
 const form=document.querySelector('#noveltyForm'),select=document.querySelector('#novAsset');if(!form||!select||document.querySelector('#novAssetSearch'))return;
 const assetField=select.closest('label'),classField=document.createElement('label'),classes=document.createElement('select');
 classField.className='novPickerField';assetField.classList.add('novPickerField');
 const classSearch=document.createElement('input'),classOptions=document.createElement('div');
 classSearch.type='search';classSearch.autocomplete='off';classSearch.placeholder='Mostrando todas las clases — elige o busca';
 classSearch.setAttribute('aria-controls','novClassOptions');classSearch.setAttribute('aria-expanded','false');
 classOptions.id='novClassOptions';classOptions.hidden=true;classes.hidden=true;
 classField.append('CLASE',classSearch,classes,classOptions);classes.id='novAssetClass';classes.add(new Option('Todas las clases',''));assetField.before(classField);
 const input=document.createElement('input'),results=document.createElement('div'),status=document.createElement('small');
 input.id='novAssetSearch';input.type='search';input.autocomplete='off';input.placeholder='Clase, modelo, número de clase, marca o serial…';input.setAttribute('role','combobox');input.setAttribute('aria-expanded','false');input.setAttribute('aria-controls','novAssetSearchResults');
 results.id='novAssetSearchResults';results.hidden=true;status.id='novAssetSearchStatus';status.style.cssText='color:#667085;font-size:.86rem;font-weight:400';input.setAttribute('aria-describedby',status.id);
 select.hidden=true;select.required=false;assetField.insertBefore(input,select);assetField.append(status);results.className='wideField novPickerField';
 const summary=document.createElement('div');
 summary.className='novSelectedAsset wideField';summary.hidden=true;
 const selectedLabel=document.createElement('strong');
 const reset=document.createElement('button');
 reset.type='reset';reset.className='adminFormCancel';reset.textContent='Cancelar';
 summary.append(selectedLabel);
 form.prepend(classField,assetField,results,summary);
 form.append(reset);
 form.setAttribute('data-asset-picker','');
 const style=document.createElement('style');style.textContent=`
 #noveltyForm[data-asset-picker] > :not(.novPickerField){display:none!important}
 #noveltyForm[data-asset-selected] > .novPickerField,
 #noveltyForm > .novSelectedAsset[hidden]{display:none!important}
 #noveltyForm #novClassOptions:not([hidden]){display:grid;gap:4px;max-height:220px;overflow:auto}
 #noveltyForm #novClassOptions button{width:100%;text-align:left;background:#fff;color:#173d59;border:1px solid #ccd8e0;padding:.45rem .7rem;font-weight:400!important;text-transform:none!important}
 #noveltyForm .novSelectedAsset{padding:.65rem .8rem;border-radius:8px;background:#e3eff7;color:#173d59}
 #noveltyForm #novAssetSearchResults{grid-column:1/-1;min-width:0;display:grid;gap:5px;max-height:280px;overflow:auto;margin-top:6px}#noveltyForm #novAssetSearchResults[hidden]{display:none}#noveltyForm #novAssetSearchResults button{width:100%;text-align:left;white-space:normal;background:#fff;color:#173d59;border:1px solid #ccd8e0;padding:.45rem .7rem;font-family:system-ui,sans-serif!important;font-weight:400!important;text-transform:none!important;letter-spacing:normal!important}#novAssetSearchResults button:focus-visible{outline:3px solid #e7b45a}
 #noveltyForm #novAssetSearchResults button.novRetired{background:#e2e5e8;border-color:#9faab3;color:#263744}
 #novAssetSearchResults .novRetiredLabel{display:block;font-size:.8rem;font-weight:400}`;document.head.append(style);
 let rows=[],version=0;
 const label=asset=>window.SKAssetRules?.isColumn(asset)?window.SKAssetRules.columnLabel(asset):[asset.clase,asset.modelo,asset.fabricante,window.SKAssetRules.searchSerial(asset.serial)&&'Serial: '+asset.serial,asset.marcaPrevia&&'Marca: '+asset.marcaPrevia,asset.marcaActual||asset.marcaInterna,asset.nuevaMarca,(asset.numeroClase||asset.numeroYT)&&'N.º '+(asset.numeroClase||asset.numeroYT),asset.mina].filter(Boolean).join(' · ');
 const filtered=query=>query.rows(rows.filter(asset=>!classes.value||norm(asset.clase)===norm(classes.value)),asset=>[label(asset)]);
 const close=()=>{results.hidden=true;input.setAttribute('aria-expanded','false')};
 const showSelected=asset=>{
  form.toggleAttribute('data-asset-selected',Boolean(asset));
  form.toggleAttribute('data-asset-picker',!asset);
  summary.hidden=!asset;
  selectedLabel.textContent=asset?'Activo seleccionado · '+label(asset)+(isRetiredState(asset.estado)?' · Dado de baja':''):'';
 };
 const choose=asset=>{if(![...select.options].some(option=>option.value===asset.id))select.add(new Option(label(asset),asset.id));select.value=asset.id;classes.value=asset.clase;input.value=label(asset);input.setCustomValidity('');status.textContent='Activo seleccionado.';close();showSelected(asset);select.dispatchEvent(new Event('change',{bubbles:true}))};
 const draw=()=>{
  const query=window.SKAssetSearch.query(input.value),matches=filtered(query);
  results.replaceChildren();
  for(const {asset,lines,detail} of matches.slice(0,30)){
   const button=document.createElement('button');button.type='button';
   button.textContent=[...lines,detail].filter(Boolean).join(' · ');
   if(isRetiredState(asset.estado)){
    button.classList.add('novRetired');
    const state=document.createElement('small');state.className='novRetiredLabel';state.textContent='Dado de baja';
    button.append(state);
   }
   button.addEventListener('click',()=>choose(asset));results.append(button);
  }
  status.textContent=matches.length?matches.length+' activos encontrados. Selecciona uno.':'No hay coincidencias. Revisa la clase, el serial o la marca.';
  results.hidden=false;input.setAttribute('aria-expanded','true');
 };
 const load=async()=>{if(typeof db==='undefined'||!db)return;const token=++version,next=(await all('assets')).filter(asset=>!asset.deleted);if(token!==version)return;rows=next;const current=classes.value,values=[...new Set(rows.map(asset=>asset.clase).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));classes.replaceChildren(new Option('Todas las clases',''),...values.map(value=>new Option(value,value)));classes.value=values.includes(current)?current:'';const selected=rows.find(asset=>asset.id===select.value);if(selected){input.value=label(selected);input.setCustomValidity('');status.textContent='Activo seleccionado.'}else if(!results.hidden)draw()};
 const closeClasses=()=>{
  classOptions.hidden=true;
  classSearch.setAttribute('aria-expanded','false');
  classSearch.value=classes.value;
 };
 const drawClasses=(query='')=>{
  classOptions.replaceChildren();
  for(const option of classes.options){
   if(!norm(option.textContent).includes(norm(query)))continue;
   const button=document.createElement('button');
   button.type='button';button.textContent=option.textContent;
   button.addEventListener('click',()=>{
    classes.value=option.value;closeClasses();
    select.value='';input.value='';input.setCustomValidity('Selecciona un activo de la lista.');
    update().catch(console.error);draw();
   });
   classOptions.append(button);
  }
  if(!classOptions.children.length)classOptions.textContent='No hay clases que coincidan.';
  classOptions.hidden=false;
  classSearch.setAttribute('aria-expanded','true');
 };
 classSearch.addEventListener('focus',()=>{drawClasses();classSearch.select()});
 classSearch.addEventListener('click',()=>{if(classOptions.hidden)drawClasses()});
 classSearch.addEventListener('input',()=>drawClasses(classSearch.value));
 classField.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();closeClasses();}
  if(event.target!==classSearch)return;
  if(event.key==='ArrowDown'){event.preventDefault();classOptions.querySelector('button')?.focus();}
  if(event.key==='Enter'){event.preventDefault();if(classOptions.children.length===1)classOptions.firstElementChild.click();}
 });
 document.addEventListener('pointerdown',event=>{if(!classOptions.hidden&&!classField.contains(event.target))closeClasses()});
 classField.addEventListener('focusout',event=>{if(!classField.contains(event.relatedTarget))closeClasses()});
 input.addEventListener('input',()=>{select.value='';input.setCustomValidity('Selecciona un activo de la lista.');update();draw()});
 input.addEventListener('focus',()=>{load().then(draw).catch(console.error)});input.addEventListener('click',draw);
 input.addEventListener('keydown',event=>{if(event.key==='Escape')close();if(event.key==='ArrowDown'){event.preventDefault();draw();results.querySelector('button')?.focus()}if(event.key==='Enter'&&!select.value){event.preventDefault();const matches=filtered(window.SKAssetSearch.query(input.value));if(matches.length===1)choose(matches[0].asset)}});
 results.addEventListener('pointerdown',event=>event.preventDefault());document.addEventListener('pointerdown',event=>{if(!assetField.contains(event.target)&&!results.contains(event.target))close()});
 form.addEventListener('reset',()=>{showSelected(null);setTimeout(()=>{select.value='';classes.value='';closeClasses();input.value='';input.setCustomValidity('');status.textContent='';close();load().catch(console.error)},0)});
 new MutationObserver(()=>load().catch(console.error)).observe(select,{childList:true});
 select.addEventListener('change',()=>{showSelected(rows.find(row=>row.id===select.value));load().catch(console.error)});
 window.addEventListener('skweb-synced',()=>load().catch(console.error));window.addEventListener('skweb-db-ready',()=>load().catch(console.error));load().catch(console.error);
}
installAssetPicker();


function installNoveltyMenu(){
 const select=document.querySelector('#novDesc');if(!select||document.querySelector('#novDescriptionButton'))return;
 const label=select.closest('label'),trigger=document.createElement('button'),menu=document.createElement('div');trigger.type='button';trigger.id='novDescriptionButton';trigger.setAttribute('aria-expanded','false');menu.id='novDescriptionMenu';menu.hidden=true;trigger.setAttribute('aria-controls',menu.id);select.hidden=true;select.required=false;label.append(trigger,menu);
 const style=document.createElement('style');style.textContent='#novDescriptionButton{width:100%;text-align:left;background:#fff;color:#173d59;border:1px solid #ccd8e0;font-weight:500;padding:12px;min-height:44px}#novDescriptionMenu{display:grid;gap:4px;max-height:320px;overflow:auto;margin-top:5px;padding:5px;border:1px solid #ccd8e0;border-radius:8px;background:#fff}#novDescriptionMenu[hidden]{display:none}#novDescriptionMenu button{background:#f7f9fa;color:#173d59;text-align:left;font-weight:500;white-space:normal;padding:10px}#novDescriptionMenu .novDescriptionHint,#novDescriptionButton .novDescriptionHint{color:#7b8794;font-weight:400;font-size:.88em;margin-left:6px}';document.head.append(style);
 const close=()=>{menu.hidden=true;trigger.setAttribute('aria-expanded','false')};
 const content=(host,option)=>{host.replaceChildren(document.createTextNode(option?.textContent||'Seleccionar novedad…'));if(option?.dataset.hint){const small=document.createElement('span');small.className='novDescriptionHint';small.textContent=option.dataset.hint;host.append(small)}};
 const sync=()=>{content(trigger,select.selectedOptions[0]);close()};
 const draw=()=>{menu.replaceChildren();for(const option of [...select.options].filter(option=>option.value)){const button=document.createElement('button');button.type='button';content(button,option);button.addEventListener('click',()=>{select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));sync();trigger.focus()});menu.append(button)}menu.hidden=false;trigger.setAttribute('aria-expanded','true')};
 trigger.addEventListener('click',()=>menu.hidden?draw():close());trigger.addEventListener('keydown',event=>{if(event.key==='ArrowDown'){event.preventDefault();draw();menu.querySelector('button')?.focus()}});
 menu.addEventListener('keydown',event=>{if(event.key==='Escape'){close();trigger.focus()}});document.addEventListener('pointerdown',event=>{if(!label.contains(event.target))close()});select.addEventListener('change',sync);new MutationObserver(sync).observe(select,{childList:true});select.form.addEventListener('reset',()=>setTimeout(sync,0));sync();
}
installNoveltyMenu();

const noveltyForm=document.querySelector('#noveltyForm');if(noveltyForm){noveltyForm.elements.ubicacion.closest('label').before(noveltyForm.elements.estado.closest('label'));noveltyForm.elements.estado.addEventListener('change',updateRetiredLocation);noveltyForm.addEventListener('reset',()=>{delete noveltyForm.elements.estado.dataset.beforeActa;noveltyForm.elements.estado.disabled=false;noveltyForm.elements.ubicacion.readOnly=false;delete noveltyForm.elements.ubicacion.dataset.beforeRetirement;});}
mountActaField();window.SKNoveltyForm={update,updateFields,save,renderSaveStatus,actaHTML};window.addEventListener('skweb-synced',update);
document.querySelector('#novDesc')?.addEventListener('change',updateFields);
document.querySelector('#noveltyForm')?.addEventListener('reset',()=>setTimeout(update,0));
window.addEventListener('skweb-options-applied',update);
})();
