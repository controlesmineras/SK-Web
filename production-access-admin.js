
(()=>{
'use strict';
const auth=()=>window.SKAdminAuth;
function mount(){
 const home=document.querySelector('#home .homeAccess');
 if(!home||document.getElementById('productionUsersBtn'))return;
 const button=document.createElement('button');
 button.type='button';button.id='productionUsersBtn';button.className='homeAccessBtn';button.textContent='USUARIOS DE PRODUCCIÓN';button.style.gridColumn='1 / -1';
 button.onclick=open;
 const adminButton=document.getElementById('adminUsersBtn');
 if(adminButton)adminButton.before(button);
 else (home.querySelector('.adminAccessRow')||home).append(button);
}
let dialog;
async function open(){
 if(!auth()?.isOwner())return;
 if(!dialog){
  dialog=document.createElement('dialog');
  dialog.style.cssText='width:min(580px,92vw);border:0;border-radius:14px;padding:20px;color:#102f45';
  dialog.innerHTML='<h2>Accesos a Producción</h2><p><a href="produccion/">Abrir Producción</a></p><div class="plazaAccessPeople"><input type="search" id="productionPersonSearch" aria-label="Buscar colaborador" placeholder="Buscar por nombre o documento..."><div id="productionPersonCount" aria-live="polite"></div><div id="productionPersonList" class="list" style="max-height:35vh"></div></div><p id="productionAccessState" role="status"></p><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button type="button" id="productionInvite">Generar enlace</button><button type="button" id="productionDisable">Quitar acceso</button></div><input id="productionInviteUrl" hidden readonly aria-label="Enlace de invitación"><div style="display:flex;justify-content:center;margin-top:14px"><button type="button" id="productionClose">Cerrar</button></div>';
  document.body.append(dialog);
 }
 const get=id=>dialog.querySelector('#'+id),list=get('productionPersonList'),count=get('productionPersonCount'),search=get('productionPersonSearch'),status=get('productionAccessState'),invite=get('productionInvite'),disable=get('productionDisable'),url=get('productionInviteUrl');
 if(dialog.open)return;
 let people=[],enabled=new Set(),busy=false,selected=null,accessKnown=false;
 const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es');
 const accessError=error=>/solicitud no válida|aplicación no válida/i.test(error.message)?'El servicio no reconoce esta opción. Actualiza Code.gs del servicio central de SK Web y publica una nueva versión de la implementación existente.':error.message;
 function update(){
  invite.disabled=busy||!selected?.documento;
  disable.disabled=busy||!selected?.documento;
  invite.textContent=enabled.has(selected?.id)?'Generar nuevo enlace':'Generar enlace';
 }
 function filter(){
  const query=normalize(search.value.trim());
  const matches=people.filter(p=>normalize([p.nombre,p.documento].join(' ')).includes(query));
  if(selected&&!matches.includes(selected)){selected=null;clearUrl()}
  count.textContent=matches.length+' colaboradores';
  list.replaceChildren(...matches.map(person=>{
   const row=document.createElement('button');
   const hasAccess=enabled.has(person.id);
   row.type='button';
   row.className='plazaUserRow'+(person===selected?' active':'');
   row.setAttribute('aria-pressed',String(person===selected));
   const details=document.createElement('span'),name=document.createElement('b'),info=document.createElement('small'),badge=document.createElement('span');
   name.textContent=person.nombre||'Sin nombre';
   info.textContent=(person.documento||'Sin documento')+' · '+(person.cargo||'Sin cargo');
   details.append(name,info);
   badge.className='plazaAccessBadge'+(hasAccess?' enabled':'');
   badge.textContent=hasAccess?'Habilitado':accessKnown?'Sin acceso':'Sin verificar';
   row.append(details,badge);
   row.onclick=()=>{
    list.querySelector('.active')?.setAttribute('aria-pressed','false');
    list.querySelector('.active')?.classList.remove('active');
    selected=person;
    row.classList.add('active');
    row.setAttribute('aria-pressed','true');
    clearUrl();
    update();
   };
   return row;
  }));
  if(!matches.length)list.textContent='No hay colaboradores que coincidan.';
  update();
 }
 function clearUrl(){url.hidden=true;url.value=''}
 get('productionClose').onclick=()=>dialog.close();
 search.oninput=filter;
 async function run(fn){
  if(busy)return;
  busy=true;update();try{await fn()}catch(error){status.textContent=accessError(error)}finally{busy=false;update()}
 }
 invite.onclick=()=>run(async()=>{
  const person=selected;
  const result=await auth().request('accessInvitationCreate',{scope:'production',personId:person.id});
  if(selected!==person||!dialog.open)return;
  const link=new URL('produccion/',location.href);link.hash=new URLSearchParams({invitation:result.token});
  url.value=link.href;url.hidden=false;url.focus();url.select();
  try{await navigator.clipboard.writeText(link.href);status.textContent='Enlace copiado. Válido por 24 horas y para un solo uso.'}
  catch{status.textContent='Copia el enlace seleccionado. Válido por 24 horas y para un solo uso.'}
 });
 disable.onclick=()=>run(async()=>{
  const person=selected;
  if(!person?.documento||!confirm('¿Quitar acceso a Producción a '+person.nombre+'?'))return;
  await auth().request('productionDisable',{document:person.documento});enabled.delete(person.id);clearUrl();filter();status.textContent='Acceso retirado.';
 });
 search.value='';list.replaceChildren();count.textContent='';clearUrl();status.textContent='Cargando colaboradores…';dialog.showModal();
 await run(async()=>{
  const local=await all('personal');
  people=local.filter(row=>!row.deleted).sort((a,b)=>String(a.nombre||'').localeCompare(String(b.nombre||''),'es'));
  filter();
  status.textContent=people.length?'Consultando accesos…':'Sincroniza SK Web Admin para cargar Personal.';
  try{
   const result=await auth().request('productionUsers');
   enabled=new Set(result.users.map(row=>row.personId));accessKnown=true;filter();
   if(people.length)status.textContent='';
  }catch(error){
   status.textContent='No se pudo verificar quién tiene acceso. '+accessError(error);
  }
 });
}
function permissions(){mount();const button=document.getElementById('productionUsersBtn');if(button){button.hidden=!auth()?.isOwner();if(button.hidden)button.style.setProperty('display','none','important');else button.style.removeProperty('display')}}
window.addEventListener('skadmin-permissions',permissions);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',permissions);else permissions();
})();
