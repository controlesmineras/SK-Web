// Navegación interna offline para registrar activos desde Consumo YT.
(()=>{
function show(view){
  document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id===view));
  document.querySelectorAll('#nav [data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  window.scrollTo({top:0,behavior:'instant'});
}
function openNewAsset(){
  show('assets');
  if(typeof newAsset==='function') newAsset(true);
  else {
    const f=document.querySelector('#assetForm');
    f?.reset();
    if(f?.elements?.id) f.elements.id.value='';
    const b=document.querySelector('#assetSaveBtn');if(b)b.textContent='Registrar activo';
  }
  document.querySelector('#assetForm')?.scrollIntoView({block:'start'});
}
window.addEventListener('load',()=>{
  const q=document.querySelector('#quickYT');
  q?.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();openNewAsset()},true);
  document.querySelector('#nav')?.addEventListener('click',e=>{
    const b=e.target.closest('[data-view]');if(!b)return;
    e.preventDefault();show(b.dataset.view);
  },true);
});
})();