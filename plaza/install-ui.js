(()=>{
  'use strict';
  const button=document.querySelector('#installAppBtn');
  let installPrompt=null,registration=null,helpTimer=0;
  const standalone=()=>window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;
  const isIOS=()=>/iphone|ipad|ipod/i.test(navigator.userAgent);
  const isMobileAndroid=()=>/android/i.test(navigator.userAgent);
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
    clearTimeout(helpTimer);
    if(standalone()){button.hidden=true;return}
    if(await installed()){button.hidden=false;button.disabled=false;button.dataset.action='open';button.textContent='ABRIR APP';return}
    button.hidden=false;
    if(installPrompt){button.disabled=false;button.dataset.action='install';button.textContent='INSTALAR APP';return}
    if(isIOS()){button.disabled=false;button.dataset.action='ios';button.textContent='INSTALAR APP';return}
    button.disabled=true;button.dataset.action='preparing';button.textContent='PREPARANDO APP';
    helpTimer=setTimeout(()=>{if(!installPrompt&&!standalone()){button.disabled=false;button.dataset.action='help';button.textContent='INSTALAR APP'}},5000);
  }
  async function register(){
    if(!('serviceWorker'in navigator))return null;
    try{
      registration=await navigator.serviceWorker.register('./sw.js',{scope:'/SK-Web/plaza/',updateViaCache:'none'});
      await registration.update();
      await navigator.serviceWorker.ready;
      if(registration.waiting)registration.waiting.postMessage({type:'PLAZA_SKIP_WAITING'});
      return registration;
    }catch(error){console.error('No se pudo preparar Plaza Blending para instalación:',error);return null}
  }
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;updateButton()});
  window.addEventListener('appinstalled',()=>{localStorage.setItem('skPlazaInstalled','yes');installPrompt=null;updateButton()});
  button?.addEventListener('click',async()=>{
    const action=button.dataset.action;
    if(action==='install'&&installPrompt){
      const prompt=installPrompt;installPrompt=null;
      await prompt.prompt();
      const choice=await prompt.userChoice;
      if(choice.outcome==='accepted')localStorage.setItem('skPlazaInstalled','yes');
      await updateButton();return;
    }
    if(action==='open'){const link=document.createElement('a');link.href='./?source=open-app';link.hidden=true;link.setAttribute('aria-hidden','true');document.body.append(link);link.click();setTimeout(()=>link.remove(),0);return}
    if(action==='ios'){alert('Para instalar P. Blending en iPhone: toca Compartir y luego Agregar a pantalla de inicio.');return}
    if(action==='help'){
      const instruction=isMobileAndroid()
        ?'En Chrome, abre el menú de tres puntos y toca Instalar aplicación o Agregar a pantalla principal.'
        :'En Chrome o Edge, abre el menú del navegador y selecciona Instalar P. Blending. Si la opción no aparece, recarga esta página una vez.';
      alert(instruction);
    }
  });
  async function updateApp(){
    if(!navigator.onLine)throw new Error('Sin conexión para actualizar la aplicación');
    const reg=registration||await register(),stamp=Date.now(),assets=['./index.html','./plaza.js','./plaza.css','./plaza-pending.css','./plaza-home.css','./plaza-collaborator.js','./install-ui.js','./manifest.webmanifest'];
    if(reg){await reg.update();if(reg.waiting)reg.waiting.postMessage({type:'PLAZA_SKIP_WAITING'})}
    await Promise.all(assets.map(path=>fetch(`${path}?update=${stamp}`,{cache:'reload'}).then(response=>{if(!response.ok)throw new Error(`No se pudo actualizar ${path}`)})));
    localStorage.setItem('skPlazaAppUpdatedAt',new Date().toISOString());
    return true;
  }
  window.SKPlazaInstall={updateApp};
  updateButton();
  register().finally(updateButton);
})();