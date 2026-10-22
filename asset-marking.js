// Aviso de marcación física. Solo se muestra una marca confirmada por el servidor.
(()=>{
'use strict';
const POLICY='letters-v1',scope=location.pathname.includes('/plaza/')?'plaza':'admin',key='skAssetMarkNotifications-'+scope;
const clean=value=>String(value??'').trim();
const eligible=value=>{
 const type=clean(typeof value==='string'?value:value?.clase).toLowerCase();
 if(!type||/^autorrescatador(?:es)?\b/i.test(type))return false;
 if(/^(yt(?:\b|\d)|columnas?\b)/i.test(type)){const origin=clean(value?.minaOrigen||value?.mina).toLowerCase().replace(/[.\s-]/g,'');return value?.incomeMarking===true&&!!origin}
 return true;
};
function prepare(asset){
  if(!eligible(asset))return asset;
  return{...asset,marcaInterna:'',marcaActual:'',nuevaMarca:'',markingPolicy:POLICY,markStatus:'pending'};
}
function tracked(){try{return JSON.parse(localStorage.getItem(key)||'[]').filter(value=>typeof value==='string')}catch{return[]}}
function remember(ids){localStorage.setItem(key,JSON.stringify([...new Set(ids)]))}
let dialog=null,shown=[],returnFocus=null,scanVersion=0;
function mount(){
  if(dialog)return dialog;
  const style=document.createElement('style');style.textContent=`.assetMarkDialog{width:min(520px,calc(100vw - 32px));max-height:88vh;overflow:auto;box-sizing:border-box;border:1px solid #dbe4ea;border-radius:18px;padding:28px;background:#fff;color:#173d59;text-align:center;box-shadow:0 24px 70px #102d4152;font-family:system-ui,-apple-system,Segoe UI,sans-serif}.assetMarkDialog::backdrop{background:#102d4199}.assetMarkCheck{width:54px;height:54px;margin:0 auto 18px;display:grid;place-items:center;border-radius:50%;background:#dff5e8;color:#22824e;font-size:1.8rem;font-weight:800}.assetMarkDialog h2{margin:0 0 12px;font-size:1.4rem}.assetMarkDialog p{line-height:1.45}.assetMarkCard{margin:14px 0;padding:16px 12px;background:#f2f6f9;border-radius:12px;border:1px solid #dce5ec}.assetMarkCard p{margin:0 0 8px;font-weight:650}.assetMarkCode{display:block;font-size:clamp(3.4rem,16vw,5.4rem);line-height:1.15;font-weight:900;letter-spacing:.12em;padding-left:.12em;color:#102f45}.assetMarkCard small{display:block;margin-top:10px;color:#52687a;font-size:.9rem;overflow-wrap:anywhere}.assetMarkDialog>button{width:100%;margin-top:14px;padding:14px;border:0;border-radius:10px;background:#173d59;color:#fff;font:700 1rem system-ui;cursor:pointer}.assetMarkDialog>button:focus-visible{outline:3px solid #f2c66d;outline-offset:3px}`;
  document.head.append(style);dialog=document.createElement('dialog');dialog.className='assetMarkDialog';dialog.id='assetMarkDialog';dialog.setAttribute('aria-labelledby','assetMarkTitle');dialog.innerHTML='<div class="assetMarkCheck" aria-hidden="true">✓</div><h2 id="assetMarkTitle"></h2><p id="assetMarkMessage"></p><div id="assetMarkCards"></div><button type="button">ENTENDIDO</button>';
  dialog.addEventListener('cancel',event=>event.preventDefault());
  dialog.querySelector('button').addEventListener('click',()=>{
    if(shown.length)remember(tracked().filter(id=>!shown.includes(id)));
    shown=[];dialog.close();returnFocus?.focus?.();
  });
  document.body.append(dialog);return dialog;
}
function show(assets,confirmed,conflict=false){
  if(!assets.length)return;
  const view=mount(),title=view.querySelector('h2'),message=view.querySelector('#assetMarkMessage'),cards=view.querySelector('#assetMarkCards');
  title.textContent=confirmed?'MARCA EL ACTIVO':assets.length===1?'ACTIVO REGISTRADO':'ACTIVOS REGISTRADOS';
  message.textContent=confirmed?'Registro guardado correctamente.':navigator.onLine?'El registro está guardado. La marca se mostrará al confirmar la sincronización.':'El registro está guardado sin conexión. Al sincronizar aparecerá la marca para identificar el activo.';
  if(!confirmed&&assets.every(asset=>asset.markRequest==='existing-v1')){title.textContent='SOLICITUD GUARDADA';message.textContent=navigator.onLine?'La marca se mostrará cuando la base central confirme la solicitud.':'La solicitud está guardada sin conexión. Al sincronizar aparecerá la marca para identificar el activo.';}
  if(conflict){title.textContent='MARCA EN REVISIÓN';message.textContent='Esta marca aparece en más de un activo. Revisa la ficha en SK Admin y usa «Corregir marca duplicada» antes de marcar físicamente el equipo.';}
  cards.replaceChildren();shown=confirmed?assets.map(asset=>asset.id):[];
  for(const asset of assets){
    const card=document.createElement('article');card.className='assetMarkCard';const name=clean(asset.clase)||'activo',description=document.createElement('p');
    description.textContent=confirmed?`Ponle esta marca ${/^(motosierra|pulidora|columna|sierra|pistola)\b/i.test(name)?'a la':'al'} ${name.toLocaleLowerCase('es')}${/^[A-Z]-[A-Z]{2}$/.test(asset.nuevaMarca||'')?', incluyendo el guion':''}:`:name;card.append(description);
    if(confirmed){const code=document.createElement('strong');code.className='assetMarkCode';code.textContent=asset.nuevaMarca;card.append(code)}
    const detail=document.createElement('small');detail.textContent=[(asset.numeroClase||asset.numeroYT)&&`N.º de clase: ${asset.numeroClase||asset.numeroYT}`,!window.SKAssetRules?.isColumn(asset)&&asset.serial&&`Serial: ${asset.serial}`,asset.minaOrigen&&`Mina de origen: ${asset.minaOrigen}`,!confirmed&&(conflict?'Marca repetida: '+asset.nuevaMarca:'Marca pendiente de sincronización')].filter(Boolean).join(' · ');card.append(detail);cards.append(card);
  }
  const confirmation=document.querySelector('#recordConfirmation');if(confirmation){confirmation.hidden=true;confirmation.classList.remove('visible')}
  if(!view.open){returnFocus=document.activeElement;view.showModal()}
  view.querySelector('button').focus();
}
function saved(assets){
  const pending=assets.filter(asset=>asset?.markingPolicy===POLICY&&eligible(asset));if(!pending.length)return false;
  remember(tracked().concat(pending.map(asset=>asset.id)));show(pending,false);return true;
}
// Si otra sincronización ya estaba en curso, el alta nueva puede no estar en su lote.
async function syncSaved(asset){
  if(scope!=='admin'||asset?.markingPolicy!==POLICY||!navigator.onLine||!window.skSyncApi?.configured?.())return false;
  const success=await window.skSyncApi.sync({silent:true,forceFull:true});
  if(!success)return false;
  const current=(await all('assets')).find(row=>row.id===asset.id);
  if(current?.syncState==='pending'&&current.markStatus==='pending'){
    if(!await window.skSyncApi.sync({silent:true,forceFull:true}))return false;
  }
  await scan();return true;
}
async function scan(){
  const ids=tracked();
  const version=++scanVersion;
  let assets=[];
  if(scope==='plaza')assets=window.SKPlaza?.getData?.().assets||[];
  else if(typeof db!=='undefined'&&db&&typeof all==='function')assets=await all('assets');
  if(version!==scanVersion)return;
  const conflicts=markConflicts(assets);renderIntegrityNotice(conflicts);if(!ids.length)return;
  const conflictingIds=new Set(conflicts.flatMap(row=>row.assetIds));
  const blocked=assets.filter(asset=>ids.includes(asset.id)&&!asset.deleted&&conflictingIds.has(asset.id));
  if(blocked.length){show(blocked,false,true);return;}
  const ready=assets.filter(asset=>ids.includes(asset.id)&&!asset.deleted&&asset.syncState==='synced'&&asset.markingPolicy===POLICY&&asset.markStatus==='assigned'&&/^(?:[A-Z]{3}|[A-Z]-[A-Z]{2})$/.test(asset.nuevaMarca||''));
  if(ready.length)show(ready,true);
}
function markConflicts(assets){
 const codes=new Map();
 for(const asset of assets){
  if(!asset?.id)continue;
  for(const field of ['nuevaMarca','marcaActual','marcaInterna']){
   const code=clean(asset[field]).toUpperCase();if(!/^(?:[A-Z]{3}|[A-Z]-[A-Z]{2})$/.test(code))continue;
   if(!codes.has(code))codes.set(code,new Map());codes.get(code).set(asset.id,asset);
  }
 }
 return [...codes].filter(([,rows])=>rows.size>1&&[...rows.values()].some(row=>!row.deleted)).map(([code,rows])=>({code,assetIds:[...rows.keys()]}));
}
function renderIntegrityNotice(conflicts){
 if(typeof document==='undefined')return;
 for(const target of scope==='admin'?['home','assets']:['home']){
  const host=document.querySelector('#'+target);if(!host)continue;
  const id='assetMarkIntegrity-'+target;let note=document.querySelector('#'+id);
  if(!note){note=document.createElement('p');note.id=id;note.setAttribute('role','status');note.style.cssText='padding:12px;border:1px solid #b77b1d;border-radius:10px;background:#fff6dd;color:#654208;line-height:1.45';host.append(note);}
  note.hidden=!conflicts.length;note.textContent=conflicts.length?'Marcas repetidas: '+conflicts.map(row=>row.code).join(', ')+'. Revisa las fichas en SK Admin. Si la repetición está en «Nueva marca», pulsa «Corregir marca duplicada» en la ficha que corresponda.':'';
 }
}
let requesting=false,requestViewVersion=0;
function hasDuplicateMark(assets,asset){
 const code=value=>clean(value).toUpperCase(),mark=code(asset?.nuevaMarca);
 return /^(?:[A-Z]{3}|[A-Z]-[A-Z]{2})$/.test(mark)&&assets.some(row=>row.id!==asset.id&&['nuevaMarca','marcaActual','marcaInterna'].some(key=>code(row[key])===mark));
}
async function refreshRequestButton(){
  const form=document.querySelector('#assetForm'),label=form?.elements.nuevaMarca?.closest('label');if(scope!=='admin'||!label)return;
  let button=document.querySelector('#assetRequestMarkBtn');
  if(!button){button=document.createElement('button');button.id='assetRequestMarkBtn';button.type='button';button.textContent='Solicitar marca nueva';button.style.marginTop='8px';button.hidden=true;button.addEventListener('click',()=>button.dataset.mode==='correct'?correctDuplicate(form.elements.id.value):requestExisting(form.elements.id.value));label.append(button);}
  let note=document.querySelector('#assetMarkCorrectionNote');if(!note){note=document.createElement('small');note.id='assetMarkCorrectionNote';note.style.whiteSpace='pre-line';label.append(note);}note.textContent='';note.hidden=true;
  button.hidden=true;const version=++requestViewVersion,id=form.elements.id.value;
  if(!id||!window.SKAdminAuth?.isOwner?.()||typeof all!=='function')return;
  const assets=await all('assets'),asset=assets.find(row=>row.id===id);
  if(version!==requestViewVersion||form.elements.id.value!==id||!asset||asset.deleted||!eligible(asset))return;
  if(asset.markCorrections?.length){note.textContent=asset.markCorrections.map(row=>`Corrección: ${row.from} → ${row.to} · ${new Date(row.at).toLocaleString('es-CO')} · ${row.byName||row.by}`).join('\n');note.hidden=false;}
  const correcting=!!clean(asset.nuevaMarca);if(correcting&&!hasDuplicateMark(assets,asset))return;
  label.classList.remove('criterion-disabled-field');
  const pending=asset.markRequest==='existing-v1'&&asset.markStatus==='pending';
  button.hidden=false;button.disabled=requesting||pending;button.dataset.mode=correcting?'correct':'request';
  button.textContent=requesting?'Procesando solicitud…':pending?'Marca pendiente de sincronización':correcting?'Corregir marca duplicada':'Solicitar marca nueva';
}
async function correctDuplicate(id){
  if(requesting||!id||!window.SKAdminAuth?.isOwner?.())return false;
  const form=document.querySelector('#assetForm');
  if(form?.dataset.historyEditRevision){alert('Guarda los cambios de la ficha y vuelve a abrirla antes de corregir la marca.');return false;}
  if(!navigator.onLine||!window.skSyncApi?.configured?.()){alert('Conéctate a internet para que la base central compruebe y corrija la marca duplicada.');return false;}
  requesting=true;
  try{
    await refreshRequestButton();
    if(!await window.skSyncApi.sync({silent:true,forceFull:true}))throw new Error('No se pudo sincronizar. Resuelve el aviso de la nube y vuelve a intentar la corrección.');
    if(form?.elements.id.value!==id||form?.dataset.historyEditRevision)return false;
    const assets=await all('assets'),asset=assets.find(row=>row.id===id);
    if(!asset||asset.deleted||!eligible(asset)||!hasDuplicateMark(assets,asset)){alert('No se encontró una marca duplicada en esta ficha después de sincronizar.');return false;}
    if(asset.syncState==='pending')throw new Error('Este activo tiene cambios pendientes. Sincronízalos antes de corregir su marca.');
    const expectedMark=clean(asset.nuevaMarca).toUpperCase(),identity=[asset.clase,asset.fabricante,asset.serial&&'Serial: '+asset.serial].filter(Boolean).join(' · ');
    if(!confirm(`¿Corregir la marca duplicada ${expectedMark} de este activo?\n\n${identity}\n\nSe asignará la siguiente marca libre y se conservará el historial del mismo activo.`))return false;
    let result;
    try{result=await window.SKAdminAuth.request('adminCorrectAssetMark',{assetId:id,expectedMark});}
    catch(error){if(/Solicitud no válida/i.test(error?.message||''))throw new Error('Actualiza Code.gs y publica una nueva versión de la implementación existente para habilitar esta corrección.');throw error;}
    if(result?.asset?.id!==id||result?.correction?.from!==expectedMark||!result.asset.nuevaMarca||result.asset.nuevaMarca===expectedMark)throw new Error('La base central no confirmó la corrección. Sincroniza para comprobar el resultado antes de volver a intentarlo.');
    remember(tracked().filter(assetId=>assetId!==id));
    // No sobrescribir desde una respuesta parcial: la conciliación descarga la ficha vigente.
    const synced=await window.skSyncApi.sync({silent:true,forceFull:true});
    if(synced&&form?.elements.id.value===id&&!form.dataset.historyEditRevision)await window.SKAssetAdminUI?.hydrateEdit?.();
    show([result.asset],true);
    if(!synced)alert('La base central confirmó la marca '+result.asset.nuevaMarca+'. Pulsa la nube para actualizar la ficha de este dispositivo.');
    return true;
  }catch(error){console.error(error);alert('No se pudo completar la corrección: '+(error?.message||error)+'. Si se perdió la conexión, sincroniza y vuelve a intentar; no se asignará otra marca por repetir la misma solicitud.');return false;}
  finally{requesting=false;refreshRequestButton().catch(console.error);}
}
async function requestExisting(id){
  if(requesting||!id||!window.SKAdminAuth?.isOwner?.())return false;
  const form=document.querySelector('#assetForm');
  if(form?.dataset.historyEditRevision){alert('Guarda primero los cambios de la ficha y vuelve a abrir el activo para solicitar su marca.');return false;}
  requesting=true;
  try{
    const asset=(await all('assets')).find(row=>row.id===id);
    if(!asset||asset.deleted||!eligible(asset)||clean(asset.nuevaMarca))return false;
    if(asset.markRequest==='existing-v1'&&asset.markStatus==='pending')return false;
    if(asset.syncState==='pending'){alert('Sincroniza primero los cambios guardados de este activo y luego solicita su marca nueva.');window.skSyncApi?.schedule?.(300);return false;}
    const timestamp=new Date(Math.max(Date.now(),(Date.parse(asset.updatedAt||asset.createdAt)||0)+1)).toISOString();
    const request={...asset,markRequest:'existing-v1',markRequestedAt:timestamp,markingPolicy:POLICY,markStatus:'pending',updatedAt:timestamp,syncState:'pending'};
    await put('assets',request);saved([request]);
    if(form?.elements.id.value===id){form.dataset.autoMarkPolicy=POLICY;form.elements.marcaInterna.readOnly=true;}
    await refreshRequestButton();window.skSyncApi?.schedule?.(300);
    await syncSaved(request);return true;
  }catch(error){console.error(error);alert('No se pudo completar la solicitud de marca: '+(error?.message||error));return false;}
  finally{requesting=false;refreshRequestButton().catch(console.error);}
}
window.SKAssetMarking={eligible,prepare,saved,scan,syncSaved,refreshRequestButton,requestExisting,correctDuplicate,hasDuplicateMark,markConflicts};
if(scope==='admin')for(const event of ['skweb-synced','skadmin-permissions'])window.addEventListener(event,()=>refreshRequestButton().catch(console.error));
window.addEventListener('skweb-synced',scan);window.addEventListener('skplaza-synced',scan);
window.addEventListener('load',()=>setTimeout(scan,800));window.addEventListener('focus',scan);
})();

