// Catálogos cerrados compartidos por SK Admin y Plaza Blending.
(()=>{
'use strict';
const RECORD_ID='SYSTEM-FORM-OPTIONS-V1';
const defaults={
  'personal.company':['SK 3.7','DESMIN'],
  'personal.area':['Seguridad física','Desmin - Obras civiles','Producción','Producción - Selectivo (Corteros)','Administrativa'],
  'personal.role':['Operador minero','Operador de seguridad','Escolta','Machinero','Supervisor','No informado'],
  'inventory.unit':['Unidad','Par','Rollo'],
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
  'novelty.description':['Se asigna (si es nueva)','Se entrega (cuando es usada)','Sale fuera de mina a reparación','Sale trasladada a otra mina','Revista física','Encontrada abandonada','Dada de baja mediante acta','Ingresa a bodega superficie de reparación','Se devuelve reparada a mina de procedencia'],
  'delivery.destination':['Operación','Traslado','Reparación']
};
const labels={
  'personal.company':'Personal · Empresa','personal.area':'Personal · Área','personal.role':'Personal · Cargo','inventory.unit':'Inventario · Unidad de medida',
  'asset.model.yt':'Activos · Modelos de YT','asset.model.autorrescatador':'Activos · Modelos de autorrescatador','asset.manufacturer.yt':'Activos · Marca comercial de YT','asset.manufacturer.autorrescatador':'Activos · Marca comercial de autorrescatador','asset.viewerColor':'Activos · Color del visor','asset.owner':'Activos · Mina propietaria','asset.location':'Activos · Ubicación','asset.state.standard':'Activos · Estados generales','asset.state.autorrescatador':'Activos · Estados de autorrescatador','asset.physicallyMarked':'Activos · Marcación física','asset.deliveryAvailable':'Activos · Disponible para entrega','novelty.description':'Novedades de activos · Tipo de novedad','delivery.destination':'Entregas · Destino'
};
const clean=value=>String(value||'').trim(),norm=value=>clean(value).toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' '),esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
let config=null;
function plazaRecord(){return(window.SKPlaza?.getData?.().inventoryCriteria||[]).find(row=>row.id===RECORD_ID||row.recordType==='formOptions')}
async function adminRecord(){if(typeof all!=='function'||typeof db==='undefined'||!db)return null;return(await all('inventoryCriteria')).find(row=>row.id===RECORD_ID||row.recordType==='formOptions')}
function normalized(raw){const out={};for(const [key,list] of Object.entries(defaults)){const supplied=raw?.options?.[key];out[key]=Array.isArray(supplied)?supplied.map(clean).filter(Boolean):[...list];if(key==='inventory.unit'&&!out[key].some(value=>norm(value)==='rollo'))out[key].push('Rollo')}return out}
function values(key,fallback=[]){const list=[...(config?.[key]||defaults[key]||fallback)];return key==='personal.role'?list.sort((a,b)=>a.localeCompare(b,'es',{sensitivity:'base'})):list}
function allowedPersonalAreas(company){return values('personal.area').filter(area=>!(norm(company)==='desmin'&&norm(area)==='produccion - selectivo (corteros)'))}
function validPersonalArea(company,area){return allowedPersonalAreas(company).some(option=>norm(option)===norm(area))}
function options(select,list,{placeholder,attributes}={}){if(!select||select.tagName!=='SELECT')return;const current=select.value,first=placeholder??select.querySelector('option[value=""]')?.textContent??'';select.replaceChildren();if(first){const option=document.createElement('option');option.value='';option.textContent=first;select.append(option)}for(const value of list){const option=document.createElement('option');option.value=value;option.textContent=value;if(attributes)for(const [name,v] of Object.entries(attributes(value)||{}))option.dataset[name]=v;select.append(option)}if([...select.options].some(option=>option.value===current))select.value=current}
function combined(keyA,keyB){return values(keyA).map(value=>({value,exclude:'autorrescatador'})).concat(values(keyB).map(value=>({value,only:'autorrescatador'})))}
function apply(){
  for(const form of [document.querySelector('#personalForm'),document.querySelector('#plazaCollaboratorForm')])if(form){options(form.elements.empresa,values('personal.company'));options(form.elements.area,allowedPersonalAreas(form.elements.empresa?.value));options(form.elements.cargo,values('personal.role'));if(form.elements.empresa&&!form.elements.empresa.dataset.areaRule){form.elements.empresa.dataset.areaRule='1';form.elements.empresa.addEventListener('change',()=>options(form.elements.area,allowedPersonalAreas(form.elements.empresa.value)))}}
  options(document.querySelector('#inventoryItemForm [name="unit"]'),values('inventory.unit'));
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
async function saveOptions(next){if(!window.SKAdminAuth?.isOwner())throw new Error('Solo el administrador puede modificar los catálogos.');const old=await adminRecord(),time=new Date().toISOString(),record={...(old||{}),id:RECORD_ID,recordType:'formOptions',options:next,deleted:true,active:false,createdAt:old?.createdAt||time,updatedAt:time,syncState:'pending'};await put('inventoryCriteria',record);config=normalized(record);apply();window.skSyncApi?.schedule?.(300);return record}
function mountAdmin(){
  if(window.SKPlaza||document.querySelector('#optionCatalog'))return;
  const main=document.querySelector('main');if(!main)return;
  const section=document.createElement('section');section.id='optionCatalog';section.className='view';
  section.innerHTML=`<div class="sectionHead"><h2>Catálogos de opciones</h2></div><p id="catalogHint" class="hint"></p><div class="catalogLayout"><label>CAMPO<select id="catalogGroup"></select></label><form id="catalogAdd" hidden><label>NUEVA OPCIÓN<input name="value" autocomplete="off" required></label><button type="submit">AGREGAR OPCIÓN</button></form><form id="catalogCargoSearch" hidden><label>BUSCAR CARGO<input name="query" type="search" autocomplete="off" maxlength="120" placeholder="Escribe el cargo que necesitas" required></label><button type="submit">BUSCAR</button></form><p id="catalogStatus" class="hint" role="status" aria-live="polite"></p><button id="catalogCargoAdd" type="button" hidden></button><div id="catalogList" class="catalogList"></div></div>`;
  main.append(section);
  const style=document.createElement('style');style.textContent='.catalogLayout{display:grid;gap:14px}.catalogLayout [hidden]{display:none!important}.catalogLayout>label{max-width:620px}.catalogLayout form{grid-template-columns:minmax(0,1fr) auto;align-items:end}.catalogLayout form button{grid-column:auto}.catalogList{display:grid;gap:8px}.catalogOption{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 13px;background:#fff;border:1px solid #dbe2e8;border-radius:9px;overflow-wrap:anywhere}.catalogOption button{background:#fff;color:#922;border:1px solid #c99}#catalogCargoAdd{justify-self:start;max-width:100%;min-height:48px;padding:12px 18px;background:#173d59;color:#fff;border:0;border-radius:9px;font:inherit;font-weight:800;white-space:normal;overflow-wrap:anywhere}@media(max-width:720px){.catalogLayout form{grid-template-columns:1fr}.catalogLayout form button{grid-column:1}}';document.head.append(style);
  const group=section.querySelector('#catalogGroup'),list=section.querySelector('#catalogList'),addForm=section.querySelector('#catalogAdd'),searchForm=section.querySelector('#catalogCargoSearch'),query=searchForm.elements.query,addCargo=section.querySelector('#catalogCargoAdd'),status=section.querySelector('#catalogStatus');
  let searchToken='',searchedValue='',matches=[],busy=false,role='';
  const assistant=()=>window.SKAdminAuth?.ready()&&!window.SKAdminAuth.isOwner();
  const invalidateSearch=()=>{searchToken='';searchedValue='';matches=[];addCargo.hidden=true;list.replaceChildren();status.textContent='Busca el cargo antes de agregarlo.'};
  const setBusy=value=>{busy=value;query.disabled=value;searchForm.querySelector('button').disabled=value;addCargo.disabled=value};
  const draw=()=>{
    const owner=window.SKAdminAuth?.isOwner(),nextRole=owner?'owner':assistant()?'assistant':'';
    if(role!==nextRole){role=nextRole;invalidateSearch();group.innerHTML=(owner?Object.keys(defaults):['personal.role']).map(key=>`<option value="${esc(key)}">${esc(labels[key])}</option>`).join('');query.value=''}
    group.disabled=!owner;addForm.hidden=!owner;searchForm.hidden=!assistant();
    section.querySelector('h2').textContent=owner?'Catálogos de opciones':'Catálogo de cargos';
    section.querySelector('#catalogHint').textContent=owner?'Administra las opciones cerradas de ambas aplicaciones. Retirar una opción no modifica los registros históricos.':'Puedes agregar cargos después de buscarlos, si no hay coincidencias. La búsqueda requiere conexión. Los cargos existentes solo los puede modificar el administrador.';
    if(owner){addCargo.hidden=true;status.textContent='';list.innerHTML=values(group.value).map((value,index)=>`<div class="catalogOption"><span>${esc(value)}</span><button type="button" data-remove-option="${index}">RETIRAR</button></div>`).join('')||'<p class="hint">Este campo no tiene opciones activas.</p>'}
    else{list.innerHTML=matches.map(value=>`<div class="catalogOption"><span>${esc(value)}</span></div>`).join('');addCargo.hidden=!assistant()||!searchToken||busy}
  };
  group.addEventListener('change',draw);
  query.addEventListener('input',invalidateSearch);
  searchForm.addEventListener('submit',async event=>{
    event.preventDefault();if(!assistant()||busy)return;
    const value=clean(query.value);invalidateSearch();if(!value)return;
    setBusy(true);status.textContent='Buscando en el catálogo…';
    try{
      const result=await window.SKAdminAuth.request('adminCargoSearch',{query:value});
      if(!assistant()||clean(query.value)!==value)return;
      matches=result.matches||[];searchedValue=result.value;searchToken=matches.length?'':result.searchToken||'';
      status.textContent=matches.length?'Estos cargos ya están disponibles. Si necesitas otro, escribe su nombre completo y vuelve a buscar.':searchToken?'No se encontraron coincidencias. Puedes agregar el cargo buscado.':'No fue posible confirmar la búsqueda. Intenta de nuevo.';
      addCargo.textContent=`AGREGAR CARGO: ${searchedValue||value}`;
    }catch(error){status.textContent='No se pudo consultar el catálogo. '+error.message}
    finally{setBusy(false);draw()}
  });
  addCargo.addEventListener('click',async()=>{
    if(!assistant()||busy||!searchToken||norm(query.value)!==norm(searchedValue))return;
    const ticket=searchToken;setBusy(true);addCargo.hidden=true;status.textContent='Guardando cargo…';
    let saved=false;
    try{
      const result=await window.SKAdminAuth.request('adminCargoAdd',{searchToken:ticket});saved=true;searchToken='';
      await put('inventoryCriteria',result.record);config=normalized(result.record);apply();matches=[result.value];
      status.textContent=`Cargo agregado: ${result.value}. Ya está disponible en los formularios.`;
      window.skSyncApi?.schedule?.(300);
    }catch(error){searchToken='';status.textContent=saved?'El cargo se guardó en el catálogo central. Sincroniza para actualizar los formularios.':'No se pudo agregar el cargo. '+error.message+' Vuelve a buscar antes de agregar.';if(saved)window.skSyncApi?.schedule?.(300)}
    finally{setBusy(false);draw()}
  });
  addForm.addEventListener('submit',async event=>{
    event.preventDefault();if(!window.SKAdminAuth?.isOwner())return;
    const form=event.currentTarget,value=clean(form.elements.value.value),key=group.value,current=values(key);
    if(!value||!Object.hasOwn(defaults,key))return;
    if(current.some(item=>norm(item)===norm(value)))return alert('Esa opción ya existe en este campo.');
    try{await saveOptions({...config,[key]:[...current,value]});form.reset();draw()}catch(error){alert(error.message)}
  });
  list.addEventListener('click',async event=>{
    const button=event.target.closest('[data-remove-option]');if(!button||!window.SKAdminAuth?.isOwner())return;
    const key=group.value,current=values(key),index=Number(button.dataset.removeOption),value=current[index];
    if(!value||!confirm(`¿Retirar “${value}” de las opciones disponibles?\n\nLos registros históricos conservarán este valor.`))return;
    try{await saveOptions({...config,[key]:current.filter((_,i)=>i!==index)});draw()}catch(error){alert(error.message)}
  });
  window.SKFormOptions.render=draw;window.addEventListener('skadmin-permissions',draw);draw();
}
window.SKFormOptions={values,allowedPersonalAreas,validPersonalArea,load,apply,mountAdmin,labels,defaults};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{mountAdmin();load().then(()=>window.SKFormOptions.render?.())},{once:true});else{mountAdmin();load().then(()=>window.SKFormOptions.render?.())}
window.addEventListener('load',()=>setTimeout(()=>load().then(()=>window.SKFormOptions.render?.()),500),{once:true});
window.addEventListener('skweb-db-ready',load);
window.addEventListener('skweb-synced',load);
})();
