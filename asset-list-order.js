// Orden visual de Activos fijos: los equipos de minas distintas de Sandra K son transitorios y aparecen al final.
// La CLASE se conserva: una Columna externa sigue siendo Columna, pero queda resaltada como equipo externo/transitorio.
(()=>{
const clean=v=>(v??'').toString().trim();
const norm=v=>clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const isSK=a=>{const m=norm(a?.mina);return !m||m==='sandra k'||m==='sk'||m==='sk 3.7'};
const num=a=>window.SKAssetFields?.numero?.(a)||clean(a?.numeroClase||a?.numeroYT);
const baseLabel=a=>window.SKAssetRules?.isColumn(a)?window.SKAssetRules.columnLabel(a):window.SKAssetListLabel?window.SKAssetListLabel(a):[a?.clase,num(a),window.SKAssetFields?.marca?.(a)||a?.marcaActual||a?.marcaInterna,a?.serial,a?.modelo&&`Mod. ${a.modelo}`].filter(Boolean).join(' - ');
const label=a=>{
 const summary=baseLabel(a).replace(/Marca actual:/gi,'MARCA:');
 const serial=clean(a?.serial);
 return !isSK(a)&&serial&&norm(serial)!=='no aplica'&&!/\bserial\s*:/i.test(summary)
  ? [summary,'Serial: '+serial].filter(Boolean).join(' · ')
  : summary;
};
const compare=(a,b)=>{const pa=isSK(a)?0:1,pb=isSK(b)?0:1;if(pa!==pb)return pa-pb;const cls=clean(a.clase).localeCompare(clean(b.clase),'es',{numeric:true,sensitivity:'base'});if(cls)return cls;const na=num(a),nb=num(b);if(!!na!==!!nb)return na?-1:1;return na.localeCompare(nb,'es',{numeric:true,sensitivity:'base'})||label(a).localeCompare(label(b),'es',{numeric:true,sensitivity:'base'})};
function search(rows,query){const q=norm(query);return rows.filter(a=>!a.deleted&&(!q||norm(Object.values(a).join(' ')).includes(q))).sort(compare)}
const classPatterns={yt:/^yt(?:\b|\d)/,columna:/^columnas?(?:\b|\d)/,autorrescatador:/^autorrescatador(?:es)?\b/};
let listClass='';
const matchesListClass=asset=>!listClass||classPatterns[listClass].test(norm(asset.clase));
function setupListClasses(){
 const group=document.querySelector('#assetListClasses');
 group?.addEventListener('click',async event=>{
  const button=event.target.closest('button[data-asset-class]');
  if(!button)return;
  const key=button.dataset.assetClass;
  listClass=listClass===key?'':key;
  for(const option of group.querySelectorAll('button'))option.setAttribute('aria-pressed',String(option.dataset.assetClass===listClass));
  window.renderAssetList(await all('assets'));
 });
}
function render(rows){const box=document.querySelector('#assetAdminList');if(!box)return;const filtered=search(rows.filter(matchesListClass),document.querySelector('#assetSearch')?.value);box.innerHTML=filtered.map(a=>{const ext=!isSK(a);return `<button class="assetRow${ext?' assetRowExternal':''}" data-id="${a.id}"><b>${ext?'<span class="externalBadge">EXTERNO</span> ':''}${label(a)}</b><small>Mina propietaria: ${a.mina||'Sin registrar'} · Ubicación: ${a.ubicacion||'Sin ubicación'} · ${a.estado||'Sin estado'}${ext?' · TRANSITORIO':''}</small></button>`}).join('')||'<p class="hint">No hay activos que coincidan.</p>'}
async function rerender(){if(typeof all!=='function')return;render(await all('assets'))}
window.addEventListener('load',()=>{setupListClasses();setTimeout(rerender,1700);document.querySelector('#assetSearch')?.addEventListener('input',()=>rerender(),true);document.querySelector('#nav')?.addEventListener('click',e=>{if(e.target.closest('[data-view="assets"]'))setTimeout(rerender,60)},true);window.addEventListener('skweb-assets-normalized',rerender)});
window.SKAssetOwnership={isSK,compare,search,label,rerender,matchesListClass};
})();
