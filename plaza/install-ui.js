(()=>{
  'use strict';
  const button=document.querySelector('#installAppBtn'),syncButton=document.querySelector('#syncBtn');
  let installPrompt=null,registration=null,installedThisSession=false,prompting=false,buttonRevision=0;
  const standalone=()=>window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;
  const isIOS=()=>/iphone|ipad|ipod/i.test(navigator.userAgent);
  const isMobileAndroid=()=>/android/i.test(navigator.userAgent);
  async function installed(){
    if(standalone())return true;
    try{
      if(typeof navigator.getInstalledRelatedApps==='function'){
        const apps=await navigator.getInstalledRelatedApps(),appId=new URL('./',location.href).href,manifest=new URL('./manifest.webmanifest',location.href).href;
        return apps.some(app=>app.platform==='webapp'&&[app.id,app.url].some(value=>{if(!value)return false;try{const url=new URL(value,location.href).href;return url===appId||url===manifest}catch(_){return false}}))||installedThisSession;
      }
    }catch(error){console.warn('No se pudo consultar la instalación:',error)}
    // Una marca local antigua no demuestra que la aplicación siga instalada.
    return installedThisSession;
  }
  async function updateButton(){
    if(!button)return;
    const revision=++buttonRevision;
    if(standalone()){button.hidden=true;return}
    button.hidden=false;button.disabled=prompting;
    button.dataset.action=installPrompt?'install':isIOS()?'ios':'waiting';
    button.textContent='INSTALAR APP';button.title='Instalar Plaza Blending';
    // La oferta actual del navegador tiene prioridad sobre cualquier detección previa.
    if(installPrompt)return;
    const present=await installed();if(revision!==buttonRevision||standalone()||installPrompt)return;
    if(present){button.dataset.action='installed';button.textContent='APP INSTALADA';button.title='Ver cómo abrir la aplicación o recuperar su acceso directo'}
  }
  function installationHelp(alreadyInstalled=false){
    if(isIOS()){alert(alreadyInstalled?'Abre P. Blending desde su icono en la pantalla de inicio.':'Para instalar P. Blending en iPhone: toca Compartir y luego Agregar a pantalla de inicio.');return}
    if(isMobileAndroid()){alert(alreadyInstalled?'Abre P. Blending desde la lista de aplicaciones de tu teléfono.':'En Chrome, abre el menú de tres puntos y toca Instalar aplicación o Agregar a pantalla principal. Si ya está instalada, ábrela desde la lista de aplicaciones.');return}
    const edge=/Edg\//.test(navigator.userAgent),appsPage=edge?'edge://apps':'chrome://apps';
    alert((alreadyInstalled?'P. Blending ya está instalada en este navegador. Quitar su icono de la barra de tareas no la desinstala.\n\n':'Usa la opción de instalar esta página como aplicación en el menú de Chrome o Edge.\n\nSi no aparece la opción o ya la habías instalado: ')+`Escribe ${appsPage} en la barra de direcciones y busca P. Blending o Gestión de inventario Plaza Blending. Ábrela desde allí y vuelve a anclarla a la barra de tareas. Usa el mismo perfil del navegador con el que la instalaste.`);
  }
  async function register(){
    if(!('serviceWorker'in navigator))return null;
    try{registration=await navigator.serviceWorker.register('./sw.js',{scope:'/SK-Web/plaza/',updateViaCache:'none'});return registration}
    catch(error){console.error('No se pudo preparar Plaza Blending para instalación:',error);return null}
  }
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;updateButton()});
  window.addEventListener('appinstalled',()=>{installedThisSession=true;installPrompt=null;updateButton()});
  button?.addEventListener('click',async()=>{
    if(prompting)return;
    if(button.dataset.action==='install'&&installPrompt){
      const prompt=installPrompt;installPrompt=null;prompting=true;button.disabled=true;
      try{await prompt.prompt();const choice=await prompt.userChoice;if(choice.outcome==='accepted')installedThisSession=true}
      catch(error){console.warn('No se pudo mostrar la instalación:',error);installationHelp()}
      finally{prompting=false;updateButton()}
      return;
    }
    installationHelp(button.dataset.action==='installed');
  });
  window.addEventListener('focus',()=>{installedThisSession=false;updateButton()});
  window.matchMedia('(display-mode: standalone)').addEventListener?.('change',updateButton);
  async function updateApp(){if(!navigator.onLine)throw new Error('Sin conexión para actualizar la aplicación');const stamp=Date.now(),assets=['./index.html','./plaza.js','./plaza.css','./plaza-pending.css','./plaza-home.css','./plaza-collaborator.js','./install-ui.js','../asset-marking.js','./asset-not-found.js','./manifest.webmanifest'];await Promise.all(assets.map(path=>fetch(`${path}?update=${stamp}`,{cache:'no-store'}).then(response=>{if(!response.ok)throw new Error(`No se pudo actualizar ${path}`)})));const reg=registration||await register();if(reg){await reg.update();if(reg.waiting)reg.waiting.postMessage({type:'PLAZA_SKIP_WAITING'})}localStorage.setItem('skPlazaAppUpdatedAt',new Date().toISOString());setTimeout(()=>location.replace(`./?appUpdate=${stamp}`),650);return true}
  function addUpdateAppButton(){const home=document.querySelector('#home');if(!home||document.querySelector('#plazaUpdateAppBtn'))return;const btn=document.createElement('button');btn.id='plazaUpdateAppBtn';btn.type='button';btn.textContent='↻ ACTUALIZAR APP';btn.style.cssText='display:block;margin:16px auto 0;min-height:52px;padding:12px 18px;border-radius:12px;font-weight:800';btn.addEventListener('click',async()=>{if(btn.disabled)return;const old=btn.textContent;try{btn.disabled=true;btn.textContent='↻ ACTUALIZANDO APP…';await updateApp();btn.textContent='✓ APP ACTUALIZADA';setTimeout(()=>{btn.disabled=false;btn.textContent=old},1800)}catch(error){console.error(error);alert(error?.message||'No se pudo actualizar la aplicación.');btn.disabled=false;btn.textContent=old}});home.append(btn)}
  // Plaza.js antiguo enlaza SINCRONIZAR a datos+app. Interceptamos ese toque antes
  // de su listener y disparamos exclusivamente la ruta de sincronización de datos.
  syncButton?.addEventListener('click',event=>{event.preventDefault();event.stopImmediatePropagation();window.dispatchEvent(new Event('online'))},true);
  window.SKPlazaInstall={updateApp};
  updateButton();addUpdateAppButton();register().then(updateButton);window.addEventListener('load',updateButton);
})();
