// Instalación, apertura y actualización de SK Admin como aplicación independiente.
(()=>{
  'use strict';
  const button=document.querySelector('#installBtn');
  let installPrompt=null;
  const standalone=()=>window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;
  const installed=async()=>{
    if(standalone())return true;
    try{
      if(typeof navigator.getInstalledRelatedApps==='function'){
        const apps=await navigator.getInstalledRelatedApps();
        if(apps.some(app=>app.platform==='webapp'))return true;
      }
    }catch(error){console.warn('No se pudo consultar la instalación de SK Admin:',error)}
    return localStorage.getItem('skAdminInstalled')==='yes';
  };
  async function updateButton(){
    if(!button)return;
    if(standalone()){button.hidden=true;return}
    if(await installed()){
      button.hidden=false;
      button.dataset.action='open';
      button.textContent='ABRIR APP';
      return;
    }
    button.hidden=false;
    button.dataset.action=installPrompt?'install':'waiting';
    button.textContent='INSTALAR APP';
  }
  window.addEventListener('beforeinstallprompt',event=>{
    event.preventDefault();
    installPrompt=event;
    updateButton();
  });
  window.addEventListener('appinstalled',()=>{
    localStorage.setItem('skAdminInstalled','yes');
    installPrompt=null;
    updateButton();
  });
  button?.addEventListener('click',async()=>{
    if(button.dataset.action==='install'&&installPrompt){
      installPrompt.prompt();
      const choice=await installPrompt.userChoice;
      if(choice.outcome==='accepted')localStorage.setItem('skAdminInstalled','yes');
      installPrompt=null;
      updateButton();
      return;
    }
    if(button.dataset.action==='open'){
      const link=document.createElement('a');
      link.href='./?source=open-app';
      link.hidden=true;
      link.setAttribute('aria-hidden','true');
      document.body.append(link);
      link.click();
      setTimeout(()=>link.remove(),0);
      return;
    }
    alert('Chrome todavía está preparando la instalación. Espera unos segundos y vuelve a intentarlo, o usa Instalar aplicación desde el menú del navegador.');
  });

  // Criterios de inventario: el buscador no muestra el catálogo completo.
  // Los resultados aparecen únicamente al escribir y permanecen dentro de una lista desplazable.
  function installInventorySearchUX(){
    if(!document.querySelector('#inventorySearchUXStyle')){
      const style=document.createElement('style');
      style.id='inventorySearchUXStyle';
      style.textContent=`#inventoryItems .invList{max-height:300px;overflow-y:auto;overscroll-behavior:contain;border-radius:12px}#inventoryItems .invList[hidden]{display:none!important}#inventoryItems .invToolbar #inventoryItemCount[hidden]{display:none!important}@media(max-width:760px){#inventoryItems .invGrid{grid-template-columns:1fr}#inventoryItems .invList{max-height:260px}}`;
      document.head.append(style);
    }
    const wire=()=>{
      const search=document.querySelector('#inventoryItemSearch'),list=document.querySelector('#inventoryItemList'),count=document.querySelector('#inventoryItemCount');
      if(!search||!list||search.dataset.searchUx==='1')return false;
      search.dataset.searchUx='1';
      const update=()=>{
        const hasText=search.value.trim().length>0;
        list.hidden=!hasText;
        if(count)count.hidden=!hasText;
      };
      search.addEventListener('input',()=>requestAnimationFrame(update));
      search.addEventListener('search',()=>requestAnimationFrame(update));
      document.querySelector('#newInventoryItem')?.addEventListener('click',()=>{search.value='';update()});
      list.addEventListener('click',event=>{
        if(!event.target.closest('[data-inv-id]'))return;
        search.value='';
        update();
      });
      update();
      return true;
    };
    if(wire())return;
    const observer=new MutationObserver(()=>{if(wire())observer.disconnect()});
    observer.observe(document.body,{childList:true,subtree:true});
  }
  installInventorySearchUX();
  window.addEventListener('load',updateButton);
})();
