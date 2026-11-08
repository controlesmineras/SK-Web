// Device-local interface language. Record values are never translated.
(()=>{
'use strict';
const KEY='skweb-interface-language';
const dictionary={"Idioma":"Language","Configuración":"Settings","Cerrar":"Close","Inicio":"Home","Colaboradores":"Staff","Activos fijos":"Fixed assets","Novedades":"Updates","Consumo YT":"YT consumption","Ingresos":"Receipts","Consultas":"Queries","Importar Excel":"Import Excel","Inventario y control de activos SK 3.7":"SK 3.7 inventory and asset management","INSTALAR APP":"INSTALL APP","SIN SINCRONIZAR":"NOT SYNCED","HACER CONSULTAS":"VIEW RECORDS","HACER REGISTROS":"CREATE RECORDS","CONSULTAR PERSONAL":"VIEW STAFF","USUARIOS P. BLENDING":"P. BLENDING USERS","DESCARTAR REGISTROS PENDIENTES":"DISCARD PENDING RECORDS","↻ ACTUALIZAR APP":"↻ UPDATE APP","Colaboradores registrados":"Registered staff","Activos":"Assets","Consumo activos":"Asset consumption","Volver al inicio":"Back to home","Administrar activos fijos":"Manage fixed assets","+ Agregar":"+ Add","Guardar colaborador":"Save staff member","Registrar activo":"Register asset","Eliminar activo":"Delete asset","Novedades de activos":"Asset updates","Guardar novedad":"Save update","Registros recientes":"Recent records","Desde":"From","Hasta":"To","Activo":"Asset","Todos los activos":"All assets","Limpiar filtros":"Clear filters","Observaciones":"Notes","Estado":"Status","Ubicación":"Location","Modelo":"Model","Inventario":"Inventory","Fecha":"Date","Hora registro":"Registration time","Hora de registro":"Registration time","Máquina":"Machine","No. marca actual":"Current marking no.","Número de item":"Item number","Repuesto":"Spare part","Cantidad":"Quantity","Cantidad total":"Total quantity","Nombre del repuesto":"Spare part name","Consultas / Control de repuestos":"Queries / Spare parts management","CONSUMOS INDIVIDUALES":"INDIVIDUAL CONSUMPTION","CONSUMOS AGRUPADOS":"GROUPED CONSUMPTION","POR REPUESTO":"BY SPARE PART","Agregar criterio de orden":"Add sorting criterion","Agregar criterio…":"Add criterion…","Ascendente":"Ascending","Descendente":"Descending","Primero":"First","← Antes":"← Earlier","Después →":"Later →","⬇ Exportar Excel":"⬇ Export Excel","CANCELAR":"CANCEL","Cancelar":"Cancel","Guardar":"Save","Buscar":"Search","Seleccionar…":"Select…","Tipo de equipo":"Equipment type","Número de YT / marca actual":"YT number / current marking","Inventario origen":"Source inventory","Buscador item":"Search item","No. de item":"Item no.","Nombre de repuesto":"Spare part name","Responsable":"Responsible person","Registrar consumo":"Record consumption","DOCUMENTO":"ID DOCUMENT","PRIMER NOMBRE":"FIRST NAME","SEGUNDO NOMBRE (OPCIONAL)":"MIDDLE NAME (OPTIONAL)","PRIMER APELLIDO":"FIRST SURNAME","SEGUNDO APELLLIDO (OPCIONAL)":"SECOND SURNAME (OPTIONAL)","SEGUNDO APELLIDO (OPCIONAL)":"SECOND SURNAME (OPTIONAL)","EMPRESA":"COMPANY","ÁREA":"AREA","CARGO":"JOB TITLE","TELÉFONO O MÓVIL (OPCIONAL)":"PHONE OR MOBILE (OPTIONAL)","CLASE":"CLASS","ASIGNADA A":"ASSIGNED TO","NÚMERO DE CLASE":"CLASS NUMBER","MODELO":"MODEL","MARCA COMERCIAL":"BRAND","MARCA ACTUAL":"CURRENT MARKING","No. DE MARCA ACTUAL":"CURRENT MARKING NO.","NUEVA MARCA":"NEW MARKING","MARCA ANTERIOR":"PREVIOUS MARKING","MINA PROPIETARIA":"OWNER MINE","FECHA DE INGRESO":"RECEIPT DATE","FECHA NOVEDAD":"UPDATE DATE","HORA NOVEDAD":"UPDATE TIME","DESCRIPCIÓN DE LA NOVEDAD":"UPDATE DESCRIPTION","DOCUMENTO RESPONSABLE":"RESPONSIBLE PERSON ID","NOMBRE RESPONSABLE":"RESPONSIBLE PERSON NAME","DOCUMENTO BODEGUERO/A":"STOREKEEPER ID","NOMBRE BODEGUERO/A":"STOREKEEPER NAME","UBICACIÓN":"LOCATION","ESTADO":"STATUS","DISPONIBLE ENTREGA":"AVAILABLE FOR DELIVERY","FUNCIONARIO ASIGNADO":"ASSIGNED STAFF MEMBER","OBSERVACIONES":"NOTES","1. INFORMACIÓN PRINCIPAL":"1. MAIN INFORMATION","2. ÚLTIMA NOVEDAD / ESTADO ACTUAL":"2. LATEST UPDATE / CURRENT STATUS","3. ASIGNACIÓN":"3. ASSIGNMENT","4. INFORMACIÓN ADICIONAL":"4. ADDITIONAL INFORMATION","Fecha de la novedad":"Update date","Hora de la novedad":"Update time","Novedad":"Update","Responsable / transportador":"Responsible person / carrier","Bodeguero/a que entrega o recibe":"Storekeeper handing over or receiving","Importar datos desde Excel":"Import data from Excel","TABLA DE DESTINO":"DESTINATION TABLE","ARCHIVO EXCEL":"EXCEL FILE","HOJA":"SHEET","REVISAR ARCHIVO":"REVIEW FILE","Importar filas válidas":"Import valid rows","Sin selección":"No selection","Sin asignar":"Unassigned","Seleccionar área…":"Select area…","Seleccione modelo…":"Select model…","Seleccionar estado…":"Select status…","Seleccionar responsable…":"Select responsible person…","Seleccionar bodeguero/a…":"Select storekeeper…","Buscar y seleccionar clase…":"Search and select class…","Buscar y seleccionar área…":"Search and select area…","Buscar o elegir ubicación…":"Search or select location…","Buscar por nombre o documento…":"Search by name or ID…","Selecciona un colaborador":"Select a staff member","Buscar por nombre, documento, empresa, área, cargo o teléfono…":"Search by name, ID, company, area, job title or phone…","Buscar clase, número de clase, marca actual, nueva marca, serial…":"Search class, class number, current or new marking, serial…","Sincronizar datos":"Sync data"};
const translations=new Map();
for(const [es,en] of Object.entries(dictionary)){translations.set(es,en);translations.set(es.toUpperCase(),en.toUpperCase())}
let language='es';try{language=localStorage.getItem(KEY)==='en'?'en':'es'}catch{}
const originals=new WeakMap(),attrs=new WeakMap();
const selector='header button,header small,nav button,h1,h2,h3,label,button,th,.homeAccessBtn span,.cards span';
function translateText(value){const trimmed=value.trim(),en=translations.get(trimmed);return en?value.replace(trimmed,en):value}
function apply(){
 observer.disconnect();
 document.documentElement.lang=language;
 document.documentElement.setAttribute('translate','no');
 document.querySelectorAll(selector).forEach(el=>{
  if(el.closest('[data-language-menu],option,svg'))return;
  for(const node of el.childNodes){
   if(node.nodeType!==3||!node.nodeValue.trim())continue;
   const previous=originals.get(node);
   const source=previous&&node.nodeValue===previous.rendered?previous.source:node.nodeValue;
   const rendered=language==='en'?translateText(source):source;
   if(node.nodeValue!==rendered)node.nodeValue=rendered;
   originals.set(node,{source,rendered});
  }
 });
 document.querySelectorAll('[placeholder],[title],[aria-label]').forEach(el=>{
  if(el.closest('[data-language-menu],tbody,.list,.assetAdminList'))return;
  let saved=attrs.get(el)||{};
  for(const attr of ['placeholder','title','aria-label']){
   if(!el.hasAttribute(attr))continue;
   const value=el.getAttribute(attr),previous=saved[attr];
   const source=previous&&value===previous.rendered?previous.source:value;
   const rendered=language==='en'?translateText(source):source;
   if(value!==rendered)el.setAttribute(attr,rendered);
   saved[attr]={source,rendered};
  }
  attrs.set(el,saved);
 });
 const toggle=document.getElementById('adminSettingsToggle');
 if(toggle)toggle.setAttribute('aria-label',language==='en'?'Settings':'Configuración');
 const done=document.getElementById('adminLanguageDone');if(done)done.textContent=language==='en'?'Done':'Listo';
 const title=document.getElementById('adminLanguageTitle');
 if(title)title.textContent=language==='en'?'Language':'Idioma';
 document.querySelectorAll('[data-interface-language]').forEach(b=>{
  const chosen=b.dataset.interfaceLanguage===language;
  b.setAttribute('aria-pressed',String(chosen));b.style.fontWeight=chosen?'800':'400';
  b.textContent=(chosen?'✓ ':'')+(b.dataset.interfaceLanguage==='es'?'Español':'English');
 });
 observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['placeholder','title','aria-label']});
}
let queued=false;
const observer=new MutationObserver(()=>{if(!queued){queued=true;queueMicrotask(()=>{queued=false;apply()})}});
function init(){
 const actions=document.querySelector('.headerActions');if(!actions)return;
 const wrapper=document.createElement('div');wrapper.dataset.languageMenu='';wrapper.style.cssText='position:relative;flex:0 0 auto';
 wrapper.innerHTML='<button id="adminSettingsToggle" type="button" aria-label="Configuración" aria-expanded="false" aria-controls="adminSettingsPanel" style="width:30px;min-width:0;min-height:44px;font-size:28px;line-height:1;padding:0;background:transparent;color:#fff;border:0;box-shadow:none">⋮</button><div id="adminSettingsPanel" hidden style="position:absolute;right:0;top:calc(100% + 8px);z-index:10000;min-width:210px;padding:14px;border:1px solid #bccbd5;border-radius:12px;background:#fff;color:#102c40;box-shadow:0 8px 28px #0004"><strong id="adminLanguageTitle" style="display:block;margin-bottom:10px">Idioma</strong><div role="group" aria-labelledby="adminLanguageTitle" style="display:grid;gap:8px"><button type="button" data-interface-language="es" lang="es">Español</button><button type="button" data-interface-language="en" lang="en">English</button></div><button type="button" id="adminLanguageDone" style="width:100%;margin-top:10px">Listo</button></div>';
 const style=document.createElement('style');style.textContent='#adminSettingsPanel[hidden]{display:none!important}';document.head.append(style);
 actions.append(wrapper);
 const toggle=wrapper.querySelector('#adminSettingsToggle'),panel=wrapper.querySelector('#adminSettingsPanel');
 const close=()=>{panel.hidden=true;panel.style.setProperty('display','none','important');toggle.setAttribute('aria-expanded','false')};
 wrapper.querySelector('#adminLanguageDone').addEventListener('click',()=>{close();toggle.focus()});
 close();
 toggle.addEventListener('click',()=>{panel.hidden=!panel.hidden;panel.style.setProperty('display',panel.hidden?'none':'block','important');toggle.setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden)panel.querySelector('[aria-pressed="true"]')?.focus()});
 wrapper.querySelectorAll('[data-interface-language]').forEach(button=>button.addEventListener('click',()=>{
  language=button.dataset.interfaceLanguage;try{localStorage.setItem(KEY,language)}catch{}
  apply();close();toggle.focus();window.dispatchEvent(new CustomEvent('skweb-language-changed',{detail:{language}}));
 }));
 document.addEventListener('click',e=>{if(!wrapper.contains(e.target))close()});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden){close();toggle.focus()}});
 apply();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
