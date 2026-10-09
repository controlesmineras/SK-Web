// Novedades compartidas por administrador y auxiliares, con guardado local atómico.
(()=>{
'use strict';
const VISOR_CHANGE='Cambio de color del visor';
const norm=value=>String(value||'').trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const isRescuer=asset=>norm(asset?.clase)==='autorrescatador';
const isVisorChange=value=>norm(value)===norm(VISOR_CHANGE);
const colors=()=>window.SKFormOptions?.values('asset.viewerColor')||['Marrón','Azul celeste','Blanco','Negro','Amarillo','Averiado'];

const isRetirement=value=>/^(?:dada|dado) de baja mediante acta$/.test(norm(value));
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
 mountActaField();const active=isRetirement(form.elements.descripcion.value),select=form.elements.actaId,label=document.querySelector('#novActaField'),preview=document.querySelector('#novActaPreview');if(!select)return;
 label.hidden=!active;label.style.display=active?'':'none';preview.hidden=!active;select.disabled=!active;select.required=active;
 if(!active){select.value='';preview.replaceChildren();return}
 const current=select.value;select.replaceChildren(new Option('Seleccionar acta registrada…',''),...actaRows.map(row=>new Option('Acta N.º '+row.consecutivo+' · '+(row.fecha||'Sin fecha')+' · '+(row.motivo||row.area||''),row.id)));select.value=current;
 select.dispatchEvent(new Event('change'));
 form.elements.estado.value=isRescuer(selectedAsset)?'Dado de baja':'Dado/a de baja';
}

let selectedAsset=null,generation=0,saving=false;
function fill(select,values,current,placeholder){
  select.replaceChildren();
  if(placeholder)option(select,'',placeholder);
  values.forEach(value=>option(select,value,value));
  if(values.includes(current))select.value=current;
}
function updateFields(){
  const form=document.querySelector('#noveltyForm');if(!form)return;
  const active=selectedAsset?.id===form.elements.assetId.value&&isRescuer(selectedAsset)&&isVisorChange(form.elements.descripcion.value);
  const field=document.querySelector('#novVisorField'),select=form.elements.estadoVisor;
  field.hidden=!active;field.style.display=active?'':'none';select.disabled=!active;select.required=active;
  if(!active)select.value='';updateActaField(form);
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
  const ticket=++generation,assetId=form.elements.assetId.value,assets=await all('assets');actaRows=(await all('actas')).filter(validActa).sort((a,b)=>Number(b.consecutivo)-Number(a.consecutivo));
  if(ticket!==generation||assetId!==form.elements.assetId.value)return;
  const asset=assets.find(row=>row.id===assetId&&!row.deleted),changed=selectedAsset?.id!==asset?.id;
  selectedAsset=asset||null;
  const catalog=window.SKFormOptions?.values('novelty.description')||['Revista física','Encontrada abandonada','Dada de baja mediante acta'];
  const descriptions=catalog.filter(value=>!isVisorChange(value));
  if(isRescuer(asset))descriptions.push(VISOR_CHANGE);
  fill(form.elements.descripcion,descriptions,form.elements.descripcion.value,'Seleccionar novedad…');
  fill(form.elements.estadoVisor,colors(),changed?'':form.elements.estadoVisor.value,'Seleccionar color…');
  const states=window.SKFormOptions?.values(isRescuer(asset)?'asset.state.autorrescatador':'asset.state.standard')||[];
  const current=changed?asset?.estado||'':form.elements.estado.value;
  // Conservar el estado histórico aunque haya sido retirado del catálogo.
  if(current&&!states.includes(current))states.push(current);
  fill(form.elements.estado,states,current,'Seleccionar estado…');
  const locations=document.querySelector('#novLocationOptions');
  if(locations){const values=window.SKFormOptions?.values('asset.location')||['Bodega de Superficie','Bodega de Producción-N. 4','Socavón','Extraviado'];const choices=[...new Set([...values,asset?.ubicacion].filter(Boolean))];locations.replaceChildren(...choices.map(value=>new Option(value,value)));}
  if(changed)form.elements.ubicacion.value=asset?.ubicacion||'';
  updateFields();
}
async function save(event){
  event.preventDefault();if(saving)return;
  const form=event.target;if(!window.SKAdminAuth?.canView?.('novelties'))return;
  saving=true;const button=form.querySelector('button[type="submit"],button:not([type])');if(button)button.disabled=true;
  try{
    const data=fd(form),asset=(await all('assets')).find(row=>row.id===data.assetId&&!row.deleted);
    if(!asset)throw new Error('Selecciona un activo.');
    if(isRetirement(data.descripcion)){const acta=(await all('actas')).find(row=>row.id===data.actaId&&validActa(row));if(!acta)throw new Error('Selecciona un acta de Registro de documentos.');data.actaNumero=acta.consecutivo;data.actaEnlace=safeActaUrl(acta.enlace);data.estado=isRescuer(asset)?'Dado de baja':'Dado/a de baja'}else{delete data.actaId;delete data.actaNumero;delete data.actaEnlace}
    const visor=isVisorChange(data.descripcion);
    if(visor&&!isRescuer(asset))throw new Error('El cambio de color del visor solo está disponible para autorrescatadores.');
    if(visor&&!colors().includes(data.estadoVisor))throw new Error('Selecciona el color del visor.');
    if(!visor)delete data.estadoVisor;
    const date=new Date(data.fechaNovedad+'T'+data.horaNovedad+':00-05:00'),meta=mark();
    if(!/^\d{4}-\d{2}-\d{2}$/.test(data.fechaNovedad)||!/^\d{2}:\d{2}$/.test(data.horaNovedad)||!Number.isFinite(date.getTime()))throw new Error('Selecciona la fecha y hora de la novedad.');
    const novelty={...meta,...data,occurredAt:date.toISOString(),fechaLocal:date.toLocaleDateString('es-CO',{timeZone:'America/Bogota'}),horaLocal:date.toLocaleTimeString('es-CO',{timeZone:'America/Bogota'})};
    if(visor)novelty.estadoVisorAnterior=asset.estadoVisor||'';
    const updated={...asset,ubicacion:data.ubicacion,estado:data.estado,updatedAt:meta.updatedAt,syncState:'pending'};
    if(visor)updated.estadoVisor=data.estadoVisor;
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(['novelties','assets'],'readwrite');
      tx.objectStore('novelties').put(novelty);tx.objectStore('assets').put(updated);
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('No se pudo guardar la novedad.'));
    });
    form.reset();selectedAsset=null;await refresh();await update();
    const status=document.querySelector('#noveltySaveStatus');status.hidden=false;status.textContent='✓ Novedad guardada correctamente.';
    window.skSyncApi?.schedule?.(300);
  }catch(error){alert(error.message||'No se pudo guardar la novedad.');}
  finally{saving=false;if(button)button.disabled=false;}
}

function installAssetPicker(){
 const form=document.querySelector('#noveltyForm'),select=document.querySelector('#novAsset');if(!form||!select||document.querySelector('#novAssetSearch'))return;
 const assetField=select.closest('label'),classField=document.createElement('label'),classes=document.createElement('select');
 classField.append('CLASE',classes);classes.id='novAssetClass';classes.add(new Option('Todas las clases',''));assetField.before(classField);
 const input=document.createElement('input'),results=document.createElement('div'),status=document.createElement('small');
 input.id='novAssetSearch';input.type='search';input.required=true;input.autocomplete='off';input.placeholder='Buscar por serial o marca…';input.setAttribute('role','combobox');input.setAttribute('aria-expanded','false');input.setAttribute('aria-controls','novAssetSearchResults');
 results.id='novAssetSearchResults';results.hidden=true;status.id='novAssetSearchStatus';status.style.cssText='color:#667085;font-size:.86rem;font-weight:400';input.setAttribute('aria-describedby',status.id);
 select.hidden=true;select.required=false;assetField.insertBefore(input,select);assetField.append(status,results);
 const style=document.createElement('style');style.textContent='#noveltyForm #novAssetSearchResults{display:grid;gap:5px;max-height:280px;overflow:auto;margin-top:6px}#noveltyForm #novAssetSearchResults[hidden]{display:none}#novAssetSearchResults button{width:100%;text-align:left;white-space:normal;background:#f2f6f9;color:#173d59;border:1px solid #ccd8e0;padding:10px;font-weight:500}#novAssetSearchResults button:focus-visible{outline:3px solid #e7b45a}';document.head.append(style);
 let rows=[],version=0;
 const label=asset=>[asset.clase,asset.fabricante,asset.serial&&'Serial: '+asset.serial,asset.marcaPrevia&&'Marca: '+asset.marcaPrevia,asset.marcaActual||asset.marcaInterna,asset.nuevaMarca,(asset.numeroClase||asset.numeroYT)&&'N.º '+(asset.numeroClase||asset.numeroYT),asset.mina].filter(Boolean).join(' · ');
 const filtered=()=>rows.filter(asset=>(!classes.value||norm(asset.clase)===norm(classes.value))&&(!norm(input.value)||norm([asset.serial,asset.marcaPrevia,asset.marcaAnterior,asset.marcaActual,asset.marcaInterna,asset.nuevaMarca,asset.numeroClase,asset.numeroYT,asset.fabricante].filter(Boolean).join(' ')).includes(norm(input.value))));
 const close=()=>{results.hidden=true;input.setAttribute('aria-expanded','false')};
 const choose=asset=>{if(![...select.options].some(option=>option.value===asset.id))select.add(new Option(label(asset),asset.id));select.value=asset.id;classes.value=asset.clase;input.value=label(asset);input.setCustomValidity('');status.textContent='Activo seleccionado.';close();select.dispatchEvent(new Event('change',{bubbles:true}))};
 const draw=()=>{const selected=rows.find(asset=>asset.id===select.value),matches=selected?rows.filter(asset=>!classes.value||norm(asset.clase)===norm(classes.value)):filtered();results.replaceChildren();for(const asset of matches.slice(0,30)){const button=document.createElement('button');button.type='button';button.textContent=label(asset);button.addEventListener('click',()=>choose(asset));results.append(button)}status.textContent=matches.length?matches.length+' activos encontrados. Selecciona uno.':'No hay coincidencias. Revisa la clase, el serial o la marca.';results.hidden=false;input.setAttribute('aria-expanded','true')};
 const load=async()=>{if(typeof db==='undefined'||!db)return;const token=++version,next=(await all('assets')).filter(asset=>!asset.deleted);if(token!==version)return;rows=next;const current=classes.value,values=[...new Set(rows.map(asset=>asset.clase).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));classes.replaceChildren(new Option('Todas las clases',''),...values.map(value=>new Option(value,value)));classes.value=values.includes(current)?current:'';const selected=rows.find(asset=>asset.id===select.value);if(selected){input.value=label(selected);input.setCustomValidity('');status.textContent='Activo seleccionado.'}else if(!results.hidden)draw()};
 classes.addEventListener('change',()=>{select.value='';input.value='';input.setCustomValidity('Selecciona un activo de la lista.');update();draw()});
 input.addEventListener('input',()=>{select.value='';input.setCustomValidity('Selecciona un activo de la lista.');update();draw()});
 input.addEventListener('focus',()=>{load().then(draw).catch(console.error)});input.addEventListener('click',draw);
 input.addEventListener('keydown',event=>{if(event.key==='Escape')close();if(event.key==='ArrowDown'){event.preventDefault();draw();results.querySelector('button')?.focus()}if(event.key==='Enter'&&!select.value){event.preventDefault();const matches=filtered();if(matches.length===1)choose(matches[0])}});
 results.addEventListener('pointerdown',event=>event.preventDefault());document.addEventListener('pointerdown',event=>{if(!assetField.contains(event.target))close()});
 form.addEventListener('reset',()=>setTimeout(()=>{classes.value='';input.value='';input.setCustomValidity('');status.textContent='';close();load().catch(console.error)},0));
 new MutationObserver(()=>load().catch(console.error)).observe(select,{childList:true});
 window.addEventListener('skweb-synced',()=>load().catch(console.error));window.addEventListener('skweb-db-ready',()=>load().catch(console.error));load().catch(console.error);
}
installAssetPicker();

mountActaField();window.SKNoveltyForm={update,updateFields,save,actaHTML};window.addEventListener('skweb-synced',update);
document.querySelector('#novDesc')?.addEventListener('change',updateFields);
document.querySelector('#noveltyForm')?.addEventListener('reset',()=>setTimeout(update,0));
window.addEventListener('skweb-options-applied',update);
})();
