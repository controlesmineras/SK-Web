// Orden visual de Activos fijos: los equipos de minas distintas de Sandra K son transitorios y aparecen al final.
// La CLASE se conserva: una Columna externa sigue siendo Columna, pero queda resaltada como equipo externo/transitorio.
(()=>{
const clean=v=>(v??'').toString().trim();
const norm=v=>clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const isSK=a=>{const m=norm(a?.mina);return !m||m==='sandra k'||m==='sk'||m==='sk 3.7'};
const num=a=>window.SKAssetFields?.numero?.(a)||clean(a?.numeroClase||a?.numeroYT);
const label=a=>[a?.clase,num(a),window.SKAssetFields?.marca?.(a)||a?.marcaActual||a?.marcaInterna,a?.serial,a?.modelo&&`Mod. ${a.modelo}`].filter(Boolean).join(' - ');
const compare=(a,b)=>{const pa=isSK(a)?0:1,pb=isSK(b)?0:1;if(pa!==pb)return pa-pb;return label(a).localeCompare(label(b),'es',{numeric:true,sensitivity:'base'})};
function render(rows){const box=document.querySelector('#assetAdminList');if(!box)return;const q=norm(document.querySelector('#assetSearch')?.value);const filtered=rows.filter(a=>!q||norm(Object.values(a).join(' ')).includes(q)).sort(compare);box.innerHTML=filtered.map(a=>{const ext=!isSK(a);return `<button class="assetRow${ext?' assetRowExternal':''}" data-id="${a.id}"><b>${ext?'<span class="externalBadge">EXTERNO</span> ':''}${label(a)}</b><small>${a.ubicacion||'Sin ubicación'} · ${a.estado||'Sin estado'}${ext?` · Propiedad: ${a.mina||'Otra mina'} · TRANSITORIO`:''}</small></button>`}).join('')||'<p class="hint">No hay activos que coincidan.</p>'}
async function rerender(){if(typeof all!=='function')return;render(await all('assets'))}
window.addEventListener('load',()=>{setTimeout(rerender,1700);document.querySelector('#assetSearch')?.addEventListener('input',()=>rerender(),true);document.querySelector('#nav')?.addEventListener('click',e=>{if(e.target.closest('[data-view="assets"]'))setTimeout(rerender,60)},true);window.addEventListener('skweb-assets-normalized',rerender)});
window.SKAssetOwnership={isSK,compare,rerender};
})();