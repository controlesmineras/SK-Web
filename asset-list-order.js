// Orden visual de Activos fijos: los equipos de minas distintas de Sandra K son transitorios y aparecen al final.
// La CLASE se conserva: una Columna externa sigue siendo Columna, pero queda resaltada como equipo externo/transitorio.
(()=>{
const clean=v=>(v??'').toString().trim();
const norm=v=>clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const isSK=a=>{const m=norm(a?.mina);return !m||m==='sandra k'||m==='sk'||m==='sk 3.7'};
const num=a=>window.SKAssetFields?.numero?.(a)||clean(a?.numeroClase||a?.numeroYT);
const baseLabel=a=>window.SKAssetRules?.isColumn(a)?window.SKAssetRules.columnLabel(a):window.SKAssetListLabel?window.SKAssetListLabel(a):[a?.clase,num(a),window.SKAssetFields?.marca?.(a)||a?.marcaActual||a?.marcaInterna,window.SKAssetRules?.searchSerial(a?.serial),a?.modelo&&`Mod. ${a.modelo}`].filter(Boolean).join(' - ');
const label=a=>{
 const summary=baseLabel(a).replace(/Marca actual:/gi,'MARCA:');
 const serial=window.SKAssetRules?.searchSerial(a?.serial)??clean(a?.serial);
 return !isSK(a)&&serial&&norm(serial)!=='no aplica'&&!/\bserial\s*:/i.test(summary)
  ? [summary,'Serial: '+serial].filter(Boolean).join(' · ')
  : summary;
};
const compare=(a,b)=>{const pa=isSK(a)?0:1,pb=isSK(b)?0:1;if(pa!==pb)return pa-pb;const cls=clean(a.clase).localeCompare(clean(b.clase),'es',{numeric:true,sensitivity:'base'});if(cls)return cls;const na=num(a),nb=num(b);if(!!na!==!!nb)return na?-1:1;return na.localeCompare(nb,'es',{numeric:true,sensitivity:'base'})||label(a).localeCompare(label(b),'es',{numeric:true,sensitivity:'base'})};
function results(rows,value){
 const query=window.SKAssetSearch.query(value);
 const entries=query.rows(rows.filter(a=>!a.deleted),a=>[
  label(a),
  'Mina propietaria: '+(a.mina||'Sin registrar')+' · Ubicación: '+(a.ubicacion||'Sin ubicación')+' · '+(a.estado||'Sin estado')+(isSK(a)?'':' · TRANSITORIO'),
  isSK(a)?'':'EXTERNO'
 ]);
 return entries.sort((a,b)=>compare(a.asset,b.asset)).map(({asset,lines:[title,note,badge],detail})=>({
  asset,external:!!badge,content:'<b>'+(badge?'<span class="externalBadge">'+query.html(badge)+'</span> ':'')+query.html(title)+'</b><small>'+query.html(note)+'</small>'+(detail?'<small>'+query.html(detail)+'</small>':'')
 }));
}
function search(rows,value){return results(rows,value).map(entry=>entry.asset)}
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
function render(rows){
 const box=document.querySelector('#assetAdminList');if(!box)return;
 const hits=results(rows.filter(matchesListClass),document.querySelector('#assetSearch')?.value);
 box.innerHTML=hits.map(({asset,external,content})=>`<button type="button" class="assetRow${external?' assetRowExternal':''}" data-id="${window.SKAssetSearch.escape(asset.id)}">${content}</button>`).join('')||'<p class="hint">No hay activos que coincidan.</p>';
}
async function rerender(){if(typeof all!=='function')return;render(await all('assets'))}
window.addEventListener('load',()=>{setupListClasses();setTimeout(rerender,1700);document.querySelector('#assetSearch')?.addEventListener('input',()=>rerender(),true);document.querySelector('#nav')?.addEventListener('click',e=>{if(e.target.closest('[data-view="assets"]'))setTimeout(rerender,60)},true);window.addEventListener('skweb-assets-normalized',rerender)});
window.SKAssetOwnership={isSK,compare,search,results,label,render,rerender,matchesListClass};
})();
