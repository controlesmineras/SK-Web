(()=>{
  'use strict';
  const button=document.querySelector('#installAppBtn');
  let installPrompt=null;
  const standalone=()=>window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;
  const isIOS=()=>/iphone|ipad|ipod/i.test(navigator.userAgent);
  async function installed(){
    if(standalone())return true;
    try{
      if(typeof navigator.getInstalledRelatedApps==='function'){
        const apps=await navigator.getInstalledRelatedApps();
        if(apps.some(app=>app.platform==='webapp'))return true;
      }
    }catch(error){console.warn('No se pudo consultar la instalación:',error)}
    return localStorage.getItem('skPlazaInstalled')==='yes';
  }
  async function updateButton(){
    if(!button)return;
    if(standalone()){button.hidden=true;return}
    if(await installed()){button.hidden=false;button.dataset.action='open';button.textContent='ABRIR APP';return}
    button.hidden=false;button.dataset.action=installPrompt?'install':isIOS()?'ios':'waiting';button.textContent=installPrompt?'INSTALAR APP':isIOS()?'INSTALAR APP':'INSTALAR APP';
  }
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;updateButton()});
  window.addEventListener('appinstalled',()=>{localStorage.setItem('skPlazaInstalled','yes');installPrompt=null;updateButton()});
  button?.addEventListener('click',async()=>{
    const action=button.dataset.action;
    if(action==='install'&&installPrompt){
      installPrompt.prompt();
      const choice=await installPrompt.userChoice;
      if(choice.outcome==='accepted')localStorage.setItem('skPlazaInstalled','yes');
      installPrompt=null;updateButton();return;
    }
    if(action==='open'){location.assign('./?source=open-app');return}
    if(isIOS()){alert('Para instalar Plaza Blending en iPhone: toca Compartir y luego Agregar a pantalla de inicio.');return}
    alert('La instalación todavía no está disponible. Espera unos segundos y vuelve a intentarlo, o usa la opción Instalar aplicación del menú del navegador.');
  });
  async function register(){
    if(!('serviceWorker'in navigator))return;
    try{
      const registration=await navigator.serviceWorker.register('./sw.js?v=20260915-1',{scope:'./',updateViaCache:'none'});
      await registration.update();
      if(registration.waiting)registration.waiting.postMessage({type:'PLAZA_SKIP_WAITING'});
    }catch(error){console.error('No se pudo preparar Plaza Blending para instalación:',error)}
  }
  window.addEventListener('load',()=>{register();updateButton()});
})();
