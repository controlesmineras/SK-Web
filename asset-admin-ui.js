(()=>{
function setAssetMode(editing){const b=document.querySelector('#assetSaveBtn');if(b)b.textContent=editing?'Actualizar activo':'Registrar activo'}
window.addEventListener('load',()=>{
  const list=document.querySelector('#assetAdminList');
  const add=document.querySelector('#newAssetBtn');
  const quick=document.querySelector('#quickYT');
  const form=document.querySelector('#assetForm');
  list?.addEventListener('click',e=>{if(e.target.closest('[data-id]'))setTimeout(()=>setAssetMode(true),0)});
  add?.addEventListener('click',()=>setTimeout(()=>setAssetMode(false),0));
  quick?.addEventListener('click',()=>setTimeout(()=>setAssetMode(false),0));
  form?.addEventListener('reset',()=>setTimeout(()=>setAssetMode(false),0));
  setAssetMode(!!form?.elements?.id?.value);
});
})();