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
  let promptEvent=null;const install=document.querySelector('#installBtn'),standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true,ios=/iphone|ipad|ipod/i.test(navigator.userAgent);
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();promptEvent=e;if(install&&!standalone())install.hidden=false});
  install?.addEventListener('click',async()=>{if(promptEvent){promptEvent.prompt();await promptEvent.userChoice;promptEvent=null;install.hidden=true}else if(ios)alert('Toca Compartir y luego “Agregar a pantalla de inicio”.');else alert('Abre el menú del navegador y selecciona “Instalar aplicación”.')});
  if(install&&ios&&!standalone())install.hidden=false;
  if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(e=>console.error('SK Web service worker:',e));
});
})();
