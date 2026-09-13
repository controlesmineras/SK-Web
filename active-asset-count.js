// El contador de Inicio muestra únicamente activos vigentes.
(()=>{
  'use strict';
  let updating=false;
  const isRetired=asset=>['dado de baja','dado/a de baja'].includes(String(asset?.estado||'').trim().toLowerCase());
  async function update(){
    if(updating||typeof all!=='function'||typeof db==='undefined'||!db)return;
    updating=true;
    try{
      const counter=document.querySelector('#aCount');
      if(!counter)return;
      const assets=await all('assets');
      const value=String(assets.filter(asset=>!asset.deleted&&!isRetired(asset)).length);
      if(counter.textContent!==value)counter.textContent=value;
    }finally{updating=false}
  }
  window.addEventListener('load',()=>{
    setTimeout(update,400);
    const counter=document.querySelector('#aCount');
    if(counter)new MutationObserver(update).observe(counter,{childList:true,characterData:true,subtree:true});
  });
  window.addEventListener('skweb-synced',update);
})();
