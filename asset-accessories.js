// Lista descriptiva opcional vinculada a cada activo, sin crear existencias adicionales.
(()=>{
 'use strict';
 const states=new WeakMap(),text=value=>String(value??'').trim();
 const id=()=>crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`;
 function normalize(rows){return (Array.isArray(rows)?rows:[]).map(row=>({id:text(row?.id)||id(),description:text(typeof row==='string'?row:row?.description)})).filter(row=>row.description)}
 function mount(form){
  if(!form)return null;if(states.has(form))return states.get(form);
  const section=document.createElement('section');section.className='assetAccessories';section.hidden=true;
  section.innerHTML='<h3>ACCESORIOS <small>Opcional</small></h3><label>¿TRAE ACCESORIOS?<select data-accessory-choice aria-label="¿Trae accesorios?"><option value="">Sin especificar</option><option value="yes">Sí</option><option value="no">No</option></select></label><div data-accessory-details hidden><div data-accessory-list></div><button type="button" data-accessory-add>+ Agregar accesorio</button></div>';
  const anchor=form.querySelector('[name="observaciones"]')?.closest('label')||form.querySelector('#assetSaveBtn');
  if(anchor)anchor.before(section);else form.append(section);
  const state={section,choice:section.querySelector('[data-accessory-choice]'),details:section.querySelector('[data-accessory-details]'),list:section.querySelector('[data-accessory-list]'),key:text(form.elements.id?.value),readOnly:false};
  states.set(form,state);
  state.choice.addEventListener('change',()=>{state.details.hidden=state.choice.value!=='yes';if(state.choice.value==='yes'&&!state.list.children.length)addRow(state);});
  section.querySelector('[data-accessory-add]').addEventListener('click',()=>{if(state.readOnly)return;addRow(state).focus();changed(form)});
  form.addEventListener('reset',()=>reset(form));
  if(!document.querySelector('#assetAccessoriesStyle')){
   const style=document.createElement('style');style.id='assetAccessoriesStyle';style.textContent='.assetAccessories{grid-column:1/-1;padding:16px;border:1px solid #d4dfe7;border-radius:12px;background:#f7fafc;margin:12px 0}.assetAccessories[hidden],.assetAccessories [hidden]{display:none!important}.assetAccessories h3{margin:0 0 12px;font-size:1rem}.assetAccessories h3 small{font-size:.8rem;font-weight:400;margin-left:8px}.assetAccessoryRow{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:end;margin:12px 0}.assetAccessoryRow label{margin:0!important;min-width:0}.assetAccessoryRow textarea{width:100%;box-sizing:border-box;resize:vertical;min-height:66px}.assetAccessoryRow button{min-width:40px;padding:8px!important}.assetAccessories [data-accessory-add]{margin-top:8px}';document.head.append(style);
  }
  return state;
 }
 function changed(form){form.dispatchEvent(new Event('input',{bubbles:true}))}
 function addRow(state,value={}){
  const row=document.createElement('div');row.className='assetAccessoryRow';row.dataset.accessoryId=text(value.id)||id();
  const label=document.createElement('label');label.append('DESCRIPCIÓN DEL ACCESORIO');
  const input=document.createElement('textarea');input.rows=2;input.placeholder='Ej.: batería marcada con las letras del equipo';input.value=text(value.description);input.disabled=state.readOnly;label.append(input);
  const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.setAttribute('aria-label','Quitar accesorio');remove.disabled=state.readOnly;
  remove.addEventListener('click',()=>{if(state.readOnly)return;row.remove();changed(state.section.closest('form'))});
  row.append(label,remove);state.list.append(row);return input;
 }
 function reset(form){const state=states.get(form);if(!state)return;state.choice.value='';state.list.replaceChildren();state.details.hidden=true;state.key=text(form.elements.id?.value)}
 function configure(form,criterion,readOnly=false){
  const state=mount(form);if(!state)return;
  const key=text(form.elements.id?.value);if(state.key!==key){reset(form);state.key=key;}
  state.section.hidden=!(criterion?.isFixedAsset&&criterion?.allowAccessories);state.readOnly=readOnly;
  state.section.querySelectorAll('input,textarea,select,button').forEach(control=>{control.disabled=state.section.hidden||readOnly;});
 }
 function load(form,asset){
  const state=mount(form);reset(form);state.key=text(asset.id);
  const rows=normalize(asset.accessories);state.choice.value=asset.hasAccessories===false?'no':asset.hasAccessories===true||rows.length?'yes':'';
  rows.forEach(row=>addRow(state,row));state.details.hidden=state.choice.value!=='yes';
  if(state.choice.value==='yes'&&!rows.length)addRow(state);
 }
 function read(form){
  const state=states.get(form);if(!state||state.section.hidden)return {};
  const hasAccessories=state.choice.value==='yes'?true:state.choice.value==='no'?false:null;
  return {hasAccessories,accessories:hasAccessories?normalize([...state.list.children].map(row=>({id:row.dataset.accessoryId,description:row.querySelector('textarea').value}))):[]};
 }
 window.SKAssetAccessories={mount,configure,load,read,reset,normalize};
})();
