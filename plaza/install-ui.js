(()=>{
  'use strict';
  const button=document.querySelector('#installAppBtn'),syncButton=document.querySelector('#syncBtn');
  let installPrompt=null,registration=null;
  const standalone=()=>window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;
  const isIOS=()=>/iphone|ipad|ipod/i.test(navigator.userAgent);
  const isMobileAndroid=()=>/android/i.test(navigator.userAgent);
  async function installed(){if(standalone())return true;try{if(typeof navigator.getInstalledRelatedApps==='function'){const apps=await navigator.getInstalledRelatedApps();if(apps.some(app=>app.platform==='webapp'))return true}}catch(error){console.warn('No se pudo consultar la instalación:',error)}return localStorage.getItem('skPlazaInstalled')==='yes'}
  async function updateButton(){
    if(!button)return;
    if(standalone()){button.hidden=true;return}
    button.hidden=false;button.disabled=false;button.textContent='INSTALAR APP';button.dataset.action=installPrompt?'install':isIOS()?'ios':'waiting';
    if(await installed()){
      button.hidden=false;button.disabled=false;button.dataset.action='open';button.textContent='ABRIR APP';return;
    }
    button.hidden=false;button.disabled=false;
    button.dataset.action=installPrompt?'install':isIOS()?'ios':'waiting';
    button.textContent='INSTALAR APP';
  }
  async function register(){
    if(!('serviceWorker'in navigator))return null;
    try{registration=await navigator.serviceWorker.register('./sw.js',{scope:'/SK-Web/plaza/',updateViaCache:'none'});return registration}
    catch(error){console.error('No se pudo preparar Plaza Blending para instalación:',error);return null}
  }
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;updateButton()});
  window.addEventListener('appinstalled',()=>{localStorage.setItem('skPlazaInstalled','yes');installPrompt=null;updateButton()});
  button?.addEventListener('click',async()=>{
    if(button.dataset.action==='install'&&installPrompt){
      const prompt=installPrompt;
      prompt.prompt();
      const choice=await prompt.userChoice;
      if(choice.outcome==='accepted')localStorage.setItem('skPlazaInstalled','yes');
      installPrompt=null;updateButton();return;
    }
    if(button.dataset.action==='open'){
      const link=document.createElement('a');link.href='./?source=open-app';link.hidden=true;link.setAttribute('aria-hidden','true');document.body.append(link);link.click();setTimeout(()=>link.remove(),0);return;
    }
    if(button.dataset.action==='ios'){alert('Para instalar P. Blending en iPhone: toca Compartir y luego Agregar a pantalla de inicio.');return}
    const instruction=isMobileAndroid()?'En Chrome, abre el menú de tres puntos y toca Instalar aplicación o Agregar a pantalla principal.':'En Chrome o Edge para Windows, abre el menú del navegador y selecciona Instalar P. Blending. Si no aparece, recarga la página y vuelve a pulsar INSTALAR APP.';
    alert(instruction);
  });
  async function updateApp(){if(!navigator.onLine)throw new Error('Sin conexión para actualizar la aplicación');const stamp=Date.now(),assets=['./index.html','./plaza.js','./plaza.css','./plaza-pending.css','./plaza-home.css','./plaza-collaborator.js','./install-ui.js','./manifest.webmanifest'];await Promise.all(assets.map(path=>fetch(`${path}?update=${stamp}`,{cache:'no-store'}).then(response=>{if(!response.ok)throw new Error(`No se pudo actualizar ${path}`)})));const reg=registration||await register();if(reg){await reg.update();if(reg.waiting)reg.waiting.postMessage({type:'PLAZA_SKIP_WAITING'})}localStorage.setItem('skPlazaAppUpdatedAt',new Date().toISOString());setTimeout(()=>location.replace(`./?appUpdate=${stamp}`),650);return true}
  function addUpdateAppButton(){const home=document.querySelector('#home');if(!home||document.querySelector('#plazaUpdateAppBtn'))return;const btn=document.createElement('button');btn.id='plazaUpdateAppBtn';btn.type='button';btn.textContent='↻ ACTUALIZAR APP';btn.style.cssText='display:block;margin:16px auto 0;min-height:52px;padding:12px 18px;border-radius:12px;font-weight:800';btn.addEventListener('click',async()=>{if(btn.disabled)return;const old=btn.textContent;try{btn.disabled=true;btn.textContent='↻ ACTUALIZANDO APP…';await updateApp();btn.textContent='✓ APP ACTUALIZADA';setTimeout(()=>{btn.disabled=false;btn.textContent=old},1800)}catch(error){console.error(error);alert(error?.message||'No se pudo actualizar la aplicación.');btn.disabled=false;btn.textContent=old}});home.append(btn)}
  // Plaza.js antiguo enlaza SINCRONIZAR a datos+app. Interceptamos ese toque antes
  // de su listener y disparamos exclusivamente la ruta de sincronización de datos.
  syncButton?.addEventListener('click',event=>{event.preventDefault();event.stopImmediatePropagation();window.dispatchEvent(new Event('online'))},true);
  window.SKPlazaInstall={updateApp};
  updateButton();addUpdateAppButton();register().then(updateButton);window.addEventListener('load',updateButton);
})();