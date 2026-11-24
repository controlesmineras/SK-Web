// El mismo equipo puede guardar activaciones individuales y una activación de bodega.
(()=>{
 'use strict';
 const style=document.createElement('style');
 style.textContent='.entryTablet{margin-top:12px;text-align:left}.entryTablet summary,.entryLink{cursor:pointer}.entryTablet label,.entryDialog label{display:grid;gap:4px;margin:10px 0}.entryTablet button,.entryDialog button{margin:6px 6px 4px 0}.entryDialog{max-width:min(460px,92vw);color:#17384f;border:1px solid #8a9ba5;border-radius:12px;padding:22px}.entryDialog input{box-sizing:border-box;width:100%;padding:10px;border:1px solid #8096a4;border-radius:6px}.entryDialog::backdrop{background:#102b4280}.entryLink{margin-top:6px}';
 document.head.append(style);
 const apps=['admin','plaza','labor','production'];
 const key=(scope,id)=>'sk:entrada:v1:'+scope+':'+id;
 const device=(scope,id)=>localStorage.getItem(key(scope,id))||localStorage.getItem(key(scope,'@tablet'));
 function save(scope,id,value){
  if(typeof value!=='string'||!value.startsWith('sk2.'))throw new Error('La base central no confirmó la activación. Actualiza Code.gs.');
  localStorage.setItem(key(scope,id),value);
 }
 function secret(scope,id,password){
  const name=String(id||'').trim();
  if(password)return password;
  if(name.toLowerCase()==='admin')throw new Error('Escribe la contraseña de admin.');
  const stored=device(scope,name);
  if(stored)return stored;
  throw new Error('Abre tu enlace de acceso en este dispositivo o activa la tablet de trabajo.');
 }
 function validLocal(s){
  if(!s?.token?.startsWith('sk2.'))return Boolean(s);
  try{
   const encoded=s.token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
   const claims=JSON.parse(atob(encoded));
   return claims.type==='session'&&claims.expiresAt>Date.now();
  }catch{return false;}
 }
 function setup(form,scope,identity,password){
  if(!form||form.dataset.entryReady)return;
  form.dataset.entryReady='1';
  const id=form.elements[identity],pw=form.elements[password],label=pw.closest('label');
  id.removeAttribute('inputmode');id.autocapitalize='none';
  const refresh=()=>{
   const name=id.value.trim(),admin=name.toLowerCase()==='admin'||(scope==='admin'&&name&&!/^\d+$/.test(name));
   const visible=Boolean(admin||manual);
   label.hidden=!visible;label.style.display=visible?'':'none';pw.disabled=!visible;pw.required=visible;
   if(!visible)pw.value='';
   alternate.hidden=Boolean(admin);alternate.textContent=manual?'Ingresar solo con documento':'Ingresar con contraseña';
  };
  let manual=false;
  const alternate=document.createElement('button');alternate.type='button';alternate.className='entryLink';
  alternate.onclick=()=>{manual=!manual;refresh();if(manual)pw.focus();};
  const details=document.createElement('details');details.className='entryTablet';
  details.innerHTML='<summary>Activar tablet de trabajo</summary><label>Contraseña de admin para activar las cuatro apps<input type="password" autocomplete="off"></label><button type="button">Activar este equipo</button><p role="status"></p>';
  const input=details.querySelector('input'),button=details.querySelector('button'),status=details.querySelector('p');
  const tabletState=()=>{
   const active=Boolean(localStorage.getItem(key(scope,'@tablet')));
   details.querySelector('summary').textContent=active?'Tablet de trabajo activada':'Activar tablet de trabajo';
   input.closest('label').hidden=active;input.closest('label').style.display=active?'none':'';
   button.textContent=active?'Desactivar en este equipo':'Activar este equipo';
  };
  tabletState();
  button.onclick=async()=>{
   if(localStorage.getItem(key(scope,'@tablet'))){
    for(const app of apps)localStorage.removeItem(key(app,'@tablet'));
    tabletState();status.textContent='Activación de la tablet retirada en este navegador.';return;
   }
   if(!input.value){input.focus();return;}
   button.disabled=true;status.textContent='Activando equipo…';
   try{
    const response=await fetch(window.SK_SYNC_CONFIG.apiUrl,{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({action:'entryAuthorizeTablet',scope,password:input.value}),cache:'no-store',credentials:'omit'});
    const data=await response.json();
    if(!data.ok||data.scope!==scope)throw new Error(data.error||'Actualiza Code.gs para activar el equipo.');
    if(!apps.every(app=>data.deviceKeys?.[app]?.startsWith('sk2.')))throw new Error('Actualiza Code.gs para activar las cuatro apps.');
    for(const app of apps)save(app,'@tablet',data.deviceKeys[app]);input.value='';manual=false;tabletState();refresh();
    status.textContent='Equipo activado. Cada trabajador puede ingresar con su documento.';
   }catch(error){status.textContent=error.message;}finally{button.disabled=false;}
  };
  details.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target===input){e.preventDefault();button.click();}});
  form.append(alternate,details);
  id.addEventListener('input',()=>{manual=false;refresh();});
  form.addEventListener('reset',()=>queueMicrotask(()=>{manual=false;refresh();}));
  form.addEventListener('focusin',e=>{if(e.target===id)refresh();});
  refresh();
 }
 function mountSettings(){
  const auth=window.SKAdminAuth,host=document.querySelector('#adminUserManagement .adminAccessRow');
  if(!host||!auth)return;
  let button=document.getElementById('entryPrincipalSettings');
  if(!auth.isOwner()){if(button)button.remove();document.querySelector('#entryPrincipalDialog[open]')?.close();return;}
  if(button)return;
  button=document.createElement('button');button.id='entryPrincipalSettings';button.type='button';button.className='homeAccessBtn';button.textContent='CONFIGURAR USUARIO ADMIN';host.append(button);
  button.onclick=()=>{
   const dialog=document.createElement('dialog');dialog.id='entryPrincipalDialog';dialog.className='entryDialog';
   dialog.innerHTML='<form><h2>Usuario admin</h2><p>Esta contraseña da acceso de administrador a las cuatro aplicaciones. Los registros quedan a nombre del colaborador que identifiques aquí.</p><label>Tu documento en Personal<input name="document" inputmode="numeric" required></label><label>Contraseña de la cuenta principal actual<input name="currentPassword" type="password" autocomplete="current-password" required></label><label>Nueva contraseña de admin<input name="newPassword" type="password" minlength="8" autocomplete="new-password" required></label><label>Confirmar contraseña<input name="confirm" type="password" minlength="8" autocomplete="new-password" required></label><button type="submit">Guardar contraseña</button><button type="button">Cerrar</button><p role="status"></p></form>';
   document.body.append(dialog);const form=dialog.querySelector('form'),status=form.querySelector('[role=status]'),submit=form.querySelector('[type=submit]');
   form.elements.document.value=auth.user()?.document||'';
   dialog.onclose=()=>{form.reset();dialog.remove();button.focus();};
   form.querySelector('[type=button]').onclick=()=>dialog.close();
   form.onsubmit=async e=>{
    e.preventDefault();if(submit.disabled||!auth.isOwner())return;
    if(form.elements.newPassword.value!==form.elements.confirm.value){status.textContent='Las contraseñas no coinciden.';return;}
    submit.disabled=true;status.textContent='Guardando…';
    try{
     const {document,currentPassword,newPassword}=Object.fromEntries(new FormData(form));
     const result=await auth.request('entryConfigure',{document,currentPassword,newPassword});
     if(result.username!=='admin')throw new Error('Actualiza Code.gs para configurar admin.');
     form.reset();status.textContent='Contraseña guardada. Ya puedes ingresar como admin en las cuatro apps.';
    }catch(error){status.textContent=error.message;}finally{submit.disabled=false;}
   };
   dialog.showModal();
  };
 }
 window.addEventListener('skadmin-permissions',()=>queueMicrotask(mountSettings));
 document.addEventListener('DOMContentLoaded',mountSettings);
 window.SKEntry={setup,secret,save,validLocal,device};
})();
