// Novedades compartidas por administrador y auxiliares, con guardado local atómico.
(()=>{
'use strict';
const VISOR_CHANGE='Cambio de color del visor';
const norm=value=>String(value||'').trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const isRescuer=asset=>norm(asset?.clase)==='autorrescatador';
const isVisorChange=value=>norm(value)===norm(VISOR_CHANGE);
const colors=()=>window.SKFormOptions?.values('asset.viewerColor')||['Marrón','Azul celeste','Blanco','Negro','Amarillo','Averiado'];
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
  if(!active)select.value='';
}
async function update(){
  const form=document.querySelector('#noveltyForm');if(!form||typeof db==='undefined'||!db)return;
  const ticket=++generation,assetId=form.elements.assetId.value,assets=await all('assets');
  if(ticket!==generation||assetId!==form.elements.assetId.value)return;
  const asset=assets.find(row=>row.id===assetId),changed=selectedAsset?.id!==asset?.id;
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
  if(changed)form.elements.ubicacion.value=asset?.ubicacion||'';
  updateFields();
}
async function save(event){
  event.preventDefault();if(saving)return;
  const form=event.target;if(!window.SKAdminAuth?.canView?.('novelties'))return;
  saving=true;const button=form.querySelector('button[type="submit"],button:not([type])');if(button)button.disabled=true;
  try{
    const data=fd(form),asset=(await all('assets')).find(row=>row.id===data.assetId);
    if(!asset)throw new Error('Selecciona un activo.');
    const visor=isVisorChange(data.descripcion);
    if(visor&&!isRescuer(asset))throw new Error('El cambio de color del visor solo está disponible para autorrescatadores.');
    if(visor&&!colors().includes(data.estadoVisor))throw new Error('Selecciona el color del visor.');
    if(!visor)delete data.estadoVisor;
    const date=new Date(),meta=mark();
    const novelty={...meta,...data,fechaLocal:date.toLocaleDateString('es-CO'),horaLocal:date.toLocaleTimeString('es-CO')};
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
window.SKNoveltyForm={update,updateFields,save};
document.querySelector('#novDesc')?.addEventListener('change',updateFields);
document.querySelector('#noveltyForm')?.addEventListener('reset',()=>setTimeout(update,0));
window.addEventListener('skweb-options-applied',update);
})();
