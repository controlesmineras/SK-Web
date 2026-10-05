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
function show(assets,confirmed){
  if(!assets.length)return;
  const view=mount(),title=view.querySelector('h2'),message=view.querySelector('#assetMarkMessage'),cards=view.querySelector('#assetMarkCards');
  title.textContent=confirmed?'MARCA EL ACTIVO':assets.length===1?'ACTIVO REGISTRADO':'ACTIVOS REGISTRADOS';
  message.textContent=confirmed?'Registro guardado correctamente.':navigator.onLine?'El registro está guardado. La marca se mostrará al confirmar la sincronización.':'El registro está guardado sin conexión. Al sincronizar aparecerá la marca para identificar el activo.';
  cards.replaceChildren();shown=confirmed?assets.map(asset=>asset.id):[];
  for(const asset of assets){
    const card=document.createElement('article');card.className='assetMarkCard';const name=clean(asset.clase)||'activo',description=document.createElement('p');
    description.textContent=confirmed?`Ponle esta marca ${/^(motosierra|pulidora|columna|sierra|pistola)\b/i.test(name)?'a la':'al'} ${name.toLocaleLowerCase('es')}${/^[A-Z]-[A-Z]{2}$/.test(asset.nuevaMarca||'')?', incluyendo el guion':''}:`:name;card.append(description);
    if(confirmed){const code=document.createElement('strong');code.className='assetMarkCode';code.textContent=asset.nuevaMarca;card.append(code)}
    const detail=document.createElement('small');detail.textContent=[(asset.numeroClase||asset.numeroYT)&&`N.º de clase: ${asset.numeroClase||asset.numeroYT}`,asset.serial&&`Serial: ${asset.serial}`,asset.minaOrigen&&`Mina de origen: ${asset.minaOrigen}`,!confirmed&&'Marca pendiente de sincronización'].filter(Boolean).join(' · ');card.append(detail);cards.append(card);
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
  const ids=tracked();if(!ids.length)return;
  const version=++scanVersion;
  let assets=[];
  if(scope==='plaza')assets=window.SKPlaza?.getData?.().assets||[];
  else if(typeof db!=='undefined'&&db&&typeof all==='function')assets=await all('assets');
  if(version!==scanVersion)return;
  const ready=assets.filter(asset=>ids.includes(asset.id)&&asset.markingPolicy===POLICY&&asset.markStatus==='assigned'&&/^(?:[A-Z]{3}|[A-Z]-[A-Z]{2})$/.test(asset.nuevaMarca||''));
  if(ready.length)show(ready,true);
}
window.SKAssetMarking={eligible,prepare,saved,scan,syncSaved};
window.addEventListener('skweb-synced',scan);window.addEventListener('skplaza-synced',scan);
window.addEventListener('load',()=>setTimeout(scan,800));window.addEventListener('focus',scan);
})();
