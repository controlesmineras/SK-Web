// Instalación y apertura de SK Admin como aplicación independiente.
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
  window.addEventListener('load',updateButton);
})();
