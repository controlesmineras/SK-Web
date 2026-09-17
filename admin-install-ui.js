// Instalación, apertura y actualización independiente de SK Admin.
(()=>{
  'use strict';
  const button=document.querySelector('#installBtn');
  let installPrompt=null;
  const standalone=()=>window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;
  const installed=async()=>{
    if(standalone())return true;
    try{if(typeof navigator.getInstalledRelatedApps==='function'){const apps=await navigator.getInstalledRelatedApps();if(apps.some(app=>app.platform==='webapp'))return true}}catch(error){console.warn('No se pudo consultar la instalación de SK Admin:',error)}
    return localStorage.getItem('skAdminInstalled')==='yes';
  };
  async function updateButton(){if(!button)return;if(standalone()){button.hidden=true;return}if(await installed()){button.hidden=false;button.dataset.action='open';button.textContent='ABRIR APP';return}button.hidden=false;button.dataset.action=installPrompt?'install':'waiting';button.textContent='INSTALAR APP'}
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;updateButton()});
  window.addEventListener('appinstalled',()=>{localStorage.setItem('skAdminInstalled','yes');installPrompt=null;updateButton()});
  button?.addEventListener('click',async()=>{if(button.dataset.action==='install'&&installPrompt){installPrompt.prompt();const choice=await installPrompt.userChoice;if(choice.outcome==='accepted')localStorage.setItem('skAdminInstalled','yes');installPrompt=null;updateButton();return}if(button.dataset.action==='open'){const link=document.createElement('a');link.href='./?source=open-app';link.hidden=true;link.setAttribute('aria-hidden','true');document.body.append(link);link.click();setTimeout(()=>link.remove(),0);return}alert('Chrome todavía está preparando la instalación. Espera unos segundos y vuelve a intentarlo, o usa Instalar aplicación desde el menú del navegador.')});
  async function updateApp(){if(!navigator.onLine)throw new Error('Necesitas conexión a Internet para actualizar la aplicación.');const stamp=Date.now();if('caches'in window){const keys=await caches.keys();await Promise.all(keys.filter(key=>key.startsWith('sk-web-shell-')).map(key=>caches.delete(key)))}if('serviceWorker'in navigator){const regs=await navigator.serviceWorker.getRegistrations();for(const reg of regs){await reg.update();if(reg.waiting)reg.waiting.postMessage({type:'SKWEB_SKIP_WAITING'})}}await Promise.all(['./index.html','./styles.css','./app.js','./offline-navigation.js','./admin-home-navigation.js','./inventory-admin.js','./sync-api.js'].map(path=>fetch(`${path}?update=${stamp}`,{cache:'reload'}).then(r=>{if(!r.ok)throw new Error(`No se pudo actualizar ${path}`)})));localStorage.setItem('skAdminAppUpdatedAt',new Date().toISOString());location.replace(`./?update=${stamp}`)}
  function addUpdateAppButton(){const home=document.querySelector('#home');if(!home||document.querySelector('#adminUpdateAppBtn'))return;const btn=document.createElement('button');btn.id='adminUpdateAppBtn';btn.type='button';btn.textContent='↻ ACTUALIZAR APP';btn.style.cssText='margin-top:16px;min-height:52px;padding:12px 18px;border-radius:12px;font-weight:800';btn.addEventListener('click',async()=>{if(btn.disabled)return;const old=btn.textContent;try{btn.disabled=true;btn.textContent='↻ ACTUALIZANDO APP…';await updateApp()}catch(error){console.error(error);alert(error?.message||'No se pudo actualizar la aplicación.');btn.disabled=false;btn.textContent=old}});home.append(btn)}
  window.SKAdminInstall={updateApp};
  window.addEventListener('load',()=>{updateButton();addUpdateAppButton()});
})();
