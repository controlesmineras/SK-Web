// Catálogos cerrados compartidos por SK Admin y Plaza Blending.
(()=>{
'use strict';
const RECORD_ID='SYSTEM-FORM-OPTIONS-V1';
const defaults={
  'personal.company':['SK 3.7','DESMIN'],
  'personal.area':['Seguridad física','Desmin - Obras civiles','Producción','Producción - Selectivo (Corteros)','Administrativa'],
  'personal.role':['Operador minero','Operador de seguridad','Escolta','Machinero','Supervisor','No informado'],
  'inventory.unit':['Unidad','Par'],
  'asset.model.yt':['28','29'],
  'asset.model.autorrescatador':['Oxypro 50'],
  'asset.manufacturer.yt':['Gisi','Irreconocible'],
  'asset.manufacturer.autorrescatador':['Steel pro'],
  'asset.viewerColor':['Marrón','Azul celeste','Blanco','Negro','Amarillo','Averiado'],
  'asset.owner':['Sandra K','Providencia','El Silencio','Carla','Alianza'],
  'asset.location':['Bodega de Superficie','Bodega de Producción-N. 4','Socavón','Extraviado'],
  'asset.state.standard':['Operativo/a','Averiado/a','En reparación','No apareció','Por dar de baja','Dado/a de baja','Extraviado/a'],
  'asset.state.autorrescatador':['Apto según inspección','Pendiente de inspección','No apto – Abierto o activado','No apto – Daño físico visible','No apto – Sello o precinto alterado','No apto – Indicador negro','No apto – Vida útil vencida','En oficina para garantía','Dado de baja'],
  'asset.physicallyMarked':['Sí','No','Desconocido'],
  'asset.deliveryAvailable':['Sí','No'],
  'delivery.destination':['Operación','Traslado','Reparación']
};
const labels={
  'personal.company':'Personal · Empresa','personal.area':'Personal · Área','personal.role':'Personal · Cargo','inventory.unit':'Inventario · Unidad de medida',
  'asset.model.yt':'Activos · Modelos de YT','asset.model.autorrescatador':'Activos · Modelos de autorrescatador','asset.manufacturer.yt':'Activos · Marca comercial de YT','asset.manufacturer.autorrescatador':'Activos · Marca comercial de autorrescatador','asset.viewerColor':'Activos · Color del visor','asset.owner':'Activos · Mina propietaria','asset.location':'Activos · Ubicación','asset.state.standard':'Activos · Estados generales','asset.state.autorrescatador':'Activos · Estados de autorrescatador','asset.physicallyMarked':'Activos · Marcación física','asset.deliveryAvailable':'Activos · Disponible para entrega','delivery.destination':'Entregas · Destino'
};
const clean=value=>String(value||'').trim(),norm=value=>clean(value).toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' '),esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
let config=null;
function plazaRecord(){return(window.SKPlaza?.getData?.().inventoryCriteria||[]).find(row=>row.id===RECORD_ID||row.recordType==='formOptions')}
async function adminRecord(){if(typeof all!=='function'||typeof db==='undefined'||!db)return null;return(await all('inventoryCriteria')).find(row=>row.id===RECORD_ID||row.recordType==='formOptions')}
function normalized(raw){const out={};for(const [key,list] of Object.entries(defaults)){const supplied=raw?.options?.[key];out[key]=Array.isArray(supplied)?supplied.map(clean).filter(Boolean):[...list]}return out}
function values(key,fallback=[]){return[...(config?.[key]||defaults[key]||fallback)]}
function allowedPersonalAreas(company){return values('personal.area').filter(area=>!(norm(company)==='desmin'&&norm(area)==='produccion - selectivo (corteros)'))}
function validPersonalArea(company,area){return allowedPersonalAreas(company).some(option=>norm(option)===norm(area))}
function options(select,list,{placeholder,attributes}={}){if(!select)return;const current=select.value,first=placeholder??select.querySelector('option[value=""]')?.textContent??'';select.replaceChildren();if(first){const option=document.createElement('option');option.value='';option.textContent=first;select.append(option)}for(const value of list){const option=document.createElement('option');option.value=value;option.textContent=value;if(attributes)for(const [name,v] of Object.entries(attributes(value)||{}))option.dataset[name]=v;select.append(option)}if([...select.options].some(option=>option.value===current))select.value=current}
function combined(keyA,keyB){return values(keyA).map(value=>({value,exclude:'autorrescatador'})).concat(values(keyB).map(value=>({value,only:'autorrescatador'})))}
function apply(){
  for(const form of [document.querySelector('#personalForm'),document.querySelector('#plazaCollaboratorForm')])if(form){options(form.elements.empresa,values('personal.company'));options(form.elements.area,allowedPersonalAreas(form.elements.empresa?.value));options(form.elements.cargo,values('personal.role'));if(form.elements.empresa&&!form.elements.empresa.dataset.areaRule){form.elements.empresa.dataset.areaRule='1';form.elements.empresa.addEventListener('change',()=>options(form.elements.area,allowedPersonalAreas(form.elements.empresa.value)))}}
  options(document.querySelector('#inventoryItemForm [name="unit"]'),values('inventory.unit'));
  options(document.querySelector('#noveltyForm [name="estado"]'),values('asset.state.standard'));
  const asset=document.querySelector('#assetForm');if(asset){
    const models=values('asset.model.yt').map(value=>({value,only:'yt'})).concat(values('asset.model.autorrescatador').map(value=>({value,only:'autorrescatador'})));
    const brands=values('asset.manufacturer.yt').map(value=>({value,only:'yt'})).concat(values('asset.manufacturer.autorrescatador').map(value=>({value,only:'autorrescatador'})));
    options(asset.elements.modelo,models.map(row=>row.value),{attributes:value=>({classOnly:models.find(row=>row.value===value)?.only||''})});
    options(asset.elements.fabricante,brands.map(row=>row.value),{attributes:value=>({classOnly:brands.find(row=>row.value===value)?.only||''})});
    options(asset.elements.estadoVisor,values('asset.viewerColor'));
    options(asset.elements.mina,values('asset.owner'));
    options(asset.elements.ubicacion,values('asset.location'));
    const states=combined('asset.state.standard','asset.state.autorrescatador');options(asset.elements.estado,states.map(row=>row.value),{attributes:value=>{const row=states.find(item=>item.value===value);return{classOnly:row?.only||'',classExclude:row?.exclude||''}}});
    options(asset.elements.marcada,values('asset.physicallyMarked'));
    options(asset.elements.disponibleEntrega,values('asset.deliveryAvailable'));
    for(const name of ['modelo','fabricante','estado'])if(asset.elements[name])delete asset.elements[name]._classCatalog;
    asset.elements.clase?.dispatchEvent(new Event('change',{bubbles:true}));
  }
  options(document.querySelector('#deliveryForm [name="destination"]'),values('delivery.destination'));
  window.dispatchEvent(new CustomEvent('skweb-options-applied'));
}
async function load(){const raw=window.SKPlaza?plazaRecord():await adminRecord();config=normalized(raw);apply();return config}
async function saveOptions(next){const old=await adminRecord(),time=new Date().toISOString(),record={...(old||{}),id:RECORD_ID,recordType:'formOptions',options:next,deleted:true,active:false,createdAt:old?.createdAt||time,updatedAt:time,syncState:'pending'};await put('inventoryCriteria',record);config=normalized(record);apply();window.skSyncApi?.schedule?.(300);return record}
function mountAdmin(){if(window.SKPlaza||document.querySelector('#optionCatalog'))return;const main=document.querySelector('main');if(!main)return;const section=document.createElement('section');section.id='optionCatalog';section.className='view';section.innerHTML=`<div class="sectionHead"><h2>Catálogos de opciones</h2></div><p class="hint">Administra las opciones cerradas de ambas aplicaciones. Retirar una opción no modifica los registros históricos.</p><div class="catalogLayout"><label>CAMPO<select id="catalogGroup">${Object.keys(defaults).map(key=>`<option value="${esc(key)}">${esc(labels[key]||key)}</option>`).join('')}</select></label><form id="catalogAdd"><label>NUEVA OPCIÓN<input name="value" autocomplete="off" required></label><button type="submit">AGREGAR OPCIÓN</button></form><div id="catalogList" class="catalogList"></div></div>`;main.append(section);const style=document.createElement('style');style.textContent='.catalogLayout{display:grid;gap:14px}.catalogLayout>label{max-width:620px}.catalogLayout form{grid-template-columns:1fr auto;align-items:end}.catalogLayout form button{grid-column:auto}.catalogList{display:grid;gap:8px}.catalogOption{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 13px;background:#fff;border:1px solid #dbe2e8;border-radius:9px}.catalogOption button{background:#fff;color:#922;border:1px solid #c99}@media(max-width:720px){.catalogLayout form{grid-template-columns:1fr}.catalogLayout form button{grid-column:1}}';document.head.append(style);const group=section.querySelector('#catalogGroup'),list=section.querySelector('#catalogList'),draw=()=>{const key=group.value;list.innerHTML=values(key).map((value,index)=>`<div class="catalogOption"><span>${esc(value)}</span><button type="button" data-remove-option="${index}">RETIRAR</button></div>`).join('')||'<p class="hint">Este campo no tiene opciones activas.</p>'};group.addEventListener('change',draw);section.querySelector('#catalogAdd').addEventListener('submit',async event=>{event.preventDefault();const value=clean(new FormData(event.currentTarget).get('value')),key=group.value,current=values(key);if(current.some(item=>norm(item)===norm(value)))return alert('Esa opción ya existe en este campo.');const next={...config,[key]:[...current,value]};await saveOptions(next);event.currentTarget.reset();draw()});list.addEventListener('click',async event=>{const button=event.target.closest('[data-remove-option]');if(!button)return;const key=group.value,current=values(key),value=current[Number(button.dataset.removeOption)];if(!confirm(`¿Retirar “${value}” de las opciones disponibles?\n\nLos registros históricos conservarán este valor.`))return;const next={...config,[key]:current.filter((_,index)=>index!==Number(button.dataset.removeOption))};await saveOptions(next);draw()});window.SKFormOptions.render=draw;draw()}
window.SKFormOptions={values,allowedPersonalAreas,validPersonalArea,load,apply,mountAdmin,labels,defaults};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{mountAdmin();load().then(()=>window.SKFormOptions.render?.())},{once:true});else{mountAdmin();load().then(()=>window.SKFormOptions.render?.())}
window.addEventListener('load',()=>setTimeout(()=>load().then(()=>window.SKFormOptions.render?.()),500),{once:true});
window.addEventListener('skweb-synced',load);
})();
