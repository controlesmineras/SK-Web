// Vista de lista de activos v1: usa NÚMERO DE CLASE y agrupa YT externas al final.
(()=>{
const txt=v=>(v??'').toString().trim();
const numberOf=a=>txt(window.SKAssetFields?.numero(a)||a.numeroClase||a.numeroYT||a.orden);
const isExternalYT=a=>/^yt$/i.test(txt(a.clase)) && (/^p\d+$/i.test(numberOf(a)) || /providencia/i.test(txt(a.mina)) || /\bexterna\b/i.test([a.marcaActual,a.marcaInterna,a.marcaAnterior].join(' ')));
function label(a){
  const n=numberOf(a),parts=[a.clase];
  if(n)parts.push(n);
  const mark=txt(window.SKAssetFields?.marca(a)||a.marcaActual||a.marcaInterna);
  if(mark&&mark.toLowerCase()!=='no aplica')parts.push(mark);
  if(a.serial)parts.push(a.serial);
  if(a.modelo)parts.push(`Mod. ${a.modelo}`);
  if(a.largo)parts.push(`${a.largo} ft`);
  return parts.filter(Boolean).join(' - ');
}
function compare(a,b){
  const ae=isExternalYT(a),be=isExternalYT(b);if(ae!==be)return ae?1:-1;
  const ac=txt(a.clase),bc=txt(b.clase),cc=ac.localeCompare(bc,'es',{numeric:true,sensitivity:'base'});if(cc)return cc;
  return numberOf(a).localeCompare(numberOf(b),'es',{numeric:true,sensitivity:'base'})||label(a).localeCompare(label(b),'es',{numeric:true,sensitivity:'base'});
}
window.assetLabel=label;
window.renderAssetList=function(rows){const host=document.querySelector('#assetAdminList');if(!host)return;const q=(document.querySelector('#assetSearch')?.value||'').toLowerCase();const f=rows.filter(x=>Object.values(x).join(' ').toLowerCase().includes(q)).sort(compare);host.innerHTML=f.map(x=>`<button class="assetRow" data-id="${x.id}"><b>${label(x)}</b><small>${x.ubicacion||'Sin ubicación'} · ${x.estado||'Sin estado'}</small></button>`).join('')||'<p class="hint">No hay activos que coincidan.</p>'};
async function redraw(){if(typeof all!=='function'||!document.querySelector('#assetAdminList'))return;window.renderAssetList(await all('assets'))}
window.addEventListener('load',()=>setTimeout(redraw,1750));
window.addEventListener('skweb-assets-normalized',()=>setTimeout(redraw,60));
})();