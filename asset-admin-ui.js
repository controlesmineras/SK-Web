(()=>{
function setAssetMode(editing){const b=document.querySelector('#assetSaveBtn');if(b)b.textContent=editing?'Actualizar activo':'Registrar activo'}
function openNewAsset(prefillYT=false){
  const f=document.querySelector('#assetForm');if(!f)return;
  f.reset();
  if(f.elements.id)f.elements.id.value='';
  if(f.elements.ubicacion)f.elements.ubicacion.value='Bodega de Superficie';
  if(prefillYT&&f.elements.clase)f.elements.clase.value='YT';
  document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id==='assets'));
  document.querySelectorAll('#nav [data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view==='assets'));
  setAssetMode(false);
  setTimeout(()=>f.scrollIntoView({behavior:'smooth',block:'start'}),0);
}
window.addEventListener('load',()=>{
  const list=document.querySelector('#assetAdminList'),add=document.querySelector('#newAssetBtn'),quick=document.querySelector('#quickYT'),form=document.querySelector('#assetForm');
  list?.addEventListener('click',e=>{if(e.target.closest('[data-id]'))setTimeout(()=>setAssetMode(true),0)});
  // Captura estos botones antes de otros manejadores y garantiza formulario nuevo.
  add?.addEventListener('click',()=>setTimeout(()=>openNewAsset(false),0));
  quick?.addEventListener('click',()=>setTimeout(()=>openNewAsset(true),0));
  form?.addEventListener('reset',()=>setTimeout(()=>setAssetMode(false),0));
  setAssetMode(!!form?.elements?.id?.value);
});
})();