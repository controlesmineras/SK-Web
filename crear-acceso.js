(()=>{
 'use strict';
 const params=new URLSearchParams(location.search),token=params.get('invite')||'';
 const destinations=new Map([
  ['admin',{name:'SK Web Admin',href:'./'}],
  ['plaza',{name:'Plaza Blending',href:'plaza/'}],
  ['labor',{name:'Labor',href:'frentes/'}],
  ['production',{name:'Producción',href:'produccion/'}]
 ]);
 const form=document.querySelector('#form'),intro=document.querySelector('#intro'),status=document.querySelector('#status');
 let scope,documentAccess=false;
 async function call(action,body={}){
  const response=await fetch(window.SK_SYNC_CONFIG.apiUrl,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action,invitation:token,...body}),redirect:'follow',cache:'no-store'});
  const result=await response.json();
  if(!result.ok)throw new Error(result.error||'No se pudo completar la solicitud');
  return result;
 }
 async function init(){
  if(!token){intro.textContent='Falta el enlace de invitación.';return}
  try{
   const info=await call('accessInvitationInfo'),app=destinations.get(info.scope);
   if(!app||(params.has('app')&&params.get('app')!==info.scope))throw new Error('El enlace no corresponde a esta aplicación.');
   scope=info.scope;documentAccess=info.documentAccess===true;
   for(const name of ['password','confirm']){
    const field=form.elements[name];field.disabled=documentAccess;field.closest('label').hidden=documentAccess;
    if(documentAccess)field.closest('label').style.display='none';
   }
   intro.textContent=documentAccess?'Acceso a '+app.name+'. Escribe tu documento para activar este dispositivo.':'Acceso a '+app.name+'. Escribe tu documento y crea tu contraseña.';
   if(documentAccess)form.querySelector('button').textContent='Activar en este dispositivo';
   form.hidden=false;
  }catch(error){intro.textContent=error.message}
 }
 form.addEventListener('submit',async event=>{
  event.preventDefault();const button=form.querySelector('button');
  if(!scope||button.disabled)return;
  const fields=new FormData(form),password=String(fields.get('password'));
  if(password!==String(fields.get('confirm'))){status.textContent='Las contraseñas no coinciden.';return}
  button.disabled=true;status.textContent='Creando acceso…';
  try{
   const result=await call('accessInvitationAccept',{document:String(fields.get('document')).trim(),...(documentAccess?{activateDevice:true}:{password}),expectedScope:scope});
   if(result.scope!==scope)throw new Error('El servicio no confirmó el acceso a esta aplicación.');
   if(documentAccess)window.SKEntry.save(scope,String(fields.get('document')).trim(),result.deviceKey);
   form.reset();form.hidden=true;history.replaceState({},'',location.pathname);
   const app=destinations.get(scope),link=document.createElement('a');
   link.href=app.href;link.textContent='Ingresar a '+app.name;
   intro.textContent=documentAccess?'Equipo activado. Para ingresar, escribe tu documento.':'Tu usuario de '+app.name+' quedó creado.';status.replaceChildren(link);
  }catch(error){status.textContent=error.message}finally{button.disabled=false}
 });
 init();
})();
