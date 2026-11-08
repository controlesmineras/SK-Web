
(()=>{
'use strict';
const auth=()=>window.SKAdminAuth;
function mount(){
 const home=document.querySelector('#home .homeAccess');
 if(!home||document.getElementById('productionUsersBtn'))return;
 const button=document.createElement('button');
 button.type='button';button.id='productionUsersBtn';button.className='homeAccessBtn';button.textContent='USUARIOS DE PRODUCCIÓN';button.style.gridColumn='1 / -1';
 
 const adminButton=document.getElementById('adminUsersBtn');
 if(adminButton)adminButton.before(button);
 else (home.querySelector('.adminAccessRow')||home).append(button);
}

const apps={
 admin:{name:'SK Web Admin',roles:{assistant:'Auxiliar administrativo'}},
 plaza:{name:'Plaza Blending',roles:{assistant:'Auxiliar',operator:'Bodeguero/a',supervisor:'Supervisor/a'}},
 production:{name:'Producción',roles:{mechanic:'Mecánico',assistant:'Auxiliar',admin:'Administrador'}}
};
const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const doc=person=>String(person?.documento??person?.document??'').trim();
const labels=(scope,row)=>String(apps[scope].roles[row.role]|| (row.role==='owner'?'Administrador principal':row.role||'Usuario')).trim();
const same=(a,b)=>Boolean((a.personId&&a.personId===b.personId)||(doc(a)&&doc(a)===doc(b)));
function button(label,action){
 const node=document.createElement('button');
 node.type='button';node.textContent=label;node.onclick=action;
 return node;
}
let dialog;
async function open(scope){
 if(!auth()?.isOwner()||dialog?.open)return;
 const app=apps[scope];
 if(!dialog){
  dialog=document.createElement('dialog');
  dialog.style.cssText='width:min(680px,94vw);max-height:90dvh;border:0;border-radius:14px;padding:16px;color:#102f45';
  document.body.append(dialog);
 }
 dialog.innerHTML='<div class="sectionHead"><h2></h2><button type="button" data-close>Cerrar</button></div><section class="plazaAccessPeople"><h3>Accesos activos</h3><div data-active class="list" style="max-height:34vh"></div></section><section class="plazaAccessPeople"><h3>Nuevo acceso</h3><input type="search" aria-label="Buscar colaborador" placeholder="Buscar por nombre o documento…" autocomplete="off"><div data-results class="list" style="max-height:26vh"></div></section><section data-manage class="plazaAccessPeople" hidden></section><p role="status" aria-live="polite"></p><div data-copy></div>';
 const find=selector=>dialog.querySelector(selector);
 const active=find('[data-active]'),results=find('[data-results]'),manage=find('[data-manage]'),search=find('input'),status=find('[role=status]'),copy=find('[data-copy]');
 find('h2').textContent='Accesos a '+app.name;
 find('[data-close]').onclick=()=>dialog.close();
 const request=(action,data)=>auth().request(action,data);
 let people=[],selected=null,inviteUrl='',busy=false;
 const access={admin:null,plaza:null,production:null};
 function clearInvite(){inviteUrl='';copy.replaceChildren()}
 function identity(p){return [p.nombre||p.name||'Sin nombre',doc(p),p.cargo].filter(Boolean).join(' · ')}
 function rolesFor(row){
  return Object.entries(access).flatMap(([key,list])=>(list||[]).filter(other=>other===row||same(other,row)).map(other=>apps[key].name+' — '+labels(key,other)));
 }
 function renderActive(){
  const rows=access[scope];
  active.replaceChildren();
  if(!rows){active.textContent='No se pudieron cargar los accesos de esta app.';return}
  if(!rows.length){active.textContent='No hay accesos activos.';return}
  for(const row of rows){
   const card=document.createElement('div');
   card.className='plazaAccessPeople';
   const name=document.createElement('b'),roles=document.createElement('p');
   name.textContent=identity(row);roles.textContent=[...new Set(rolesFor(row))].join(' · ');
   card.append(name,roles);
   if(row.role!=='owner'){
    card.append(button('Restablecer acceso',()=>generate(row,row.role)),button('Gestionar accesos',()=>choose(row,true)));
   }
   active.append(card);
  }
 }
 function eligible(person){return doc(person)&&(scope!=='admin'||normalize(person.area).replace(/\s+/g,' ')==='seguridad fisica')}
 function renderSearch(){
  results.replaceChildren();
  const query=normalize(search.value);
  if(!query)return;
  if(!access[scope]){results.textContent='Carga los accesos activos antes de conceder un acceso.';return}
  const matches=people.filter(person=>eligible(person)&&normalize([person.nombre,doc(person)].join(' ')).includes(query)&&!access[scope].some(row=>same(row,{personId:person.id,document:doc(person)})));
  for(const person of matches){
   const row=button(identity(person),()=>choose({...person,personId:person.id},false));
   row.className='plazaUserRow';results.append(row);
  }
  if(!matches.length)results.textContent='No hay colaboradores disponibles que coincidan.';
 }
 function choose(row,existing){
  if(busy)return;
  selected=row;clearInvite();status.textContent='';manage.hidden=false;
  const title=document.createElement('h3');
  title.textContent=(existing?'Gestionar accesos de ':'Nuevo acceso para ')+identity(row);
  manage.replaceChildren(title);
  let role;
  if(scope!=='admin'){
   const label=document.createElement('label');
   label.textContent='Rol en '+app.name;role=document.createElement('select');
   for(const key of scope==='production'?Object.keys(app.roles):['assistant','operator'])role.add(new Option(app.roles[key],key));
   if(scope==='plaza'&&row.role==='supervisor')role.add(new Option(app.roles.supervisor,'supervisor'));
   role.value=row.role||'assistant';label.append(role);manage.append(label);
  }
  manage.append(button(existing?'Generar enlace con el rol seleccionado':'Generar enlace',()=>generate(row,role?.value||row.role)));
  if(existing)manage.append(button('Quitar acceso',()=>disable(row)));
  manage.scrollIntoView({block:'nearest'});
 }
 async function run(message,fn){
  if(busy)return;
  busy=true;status.textContent=message;
  try{await fn()}catch(error){status.textContent=error.message||String(error)}finally{busy=false}
 }
 function generate(row,role){
  if(busy)return;
  clearInvite();
  if(!row.personId){status.textContent='Esta cuenta no está vinculada a un colaborador de Personal.';return}
  run('Generando invitación para '+identity(row)+'…',async()=>{
   const data={scope,personId:row.personId};
   if(scope==='plaza')data.plazaRole=role;
   if(scope==='production')data.productionRole=role;
   const result=await request('accessInvitationCreate',data);
   if(scope==='plaza'&&result.plazaRole!==role)throw new Error('El servicio devolvió un rol distinto. Revisa la versión de Code.gs.');
   if(scope==='production'&&result.productionRole!==role)throw new Error('Actualiza y despliega Code.gs para asignar roles de Producción.');
   if(!result.token)throw new Error('El servicio no devolvió una invitación.');
   const url=new URL(scope==='production'?'produccion/':'crear-acceso.html',location.href);
   if(scope==='production')url.hash=new URLSearchParams({invitation:result.token});
   else url.searchParams.set('invite',result.token);
   inviteUrl=url.href;
   status.textContent='Invitación para '+identity(row)+'. Válida durante 24 horas y para un solo uso.';
   copy.append(button('Copiar enlace',async()=>{
    try{await navigator.clipboard.writeText(inviteUrl);status.textContent='Enlace copiado.'}
    catch{
     const field=document.createElement('textarea');
     field.value=inviteUrl;field.readOnly=true;
     field.style.cssText='position:fixed;left:0;top:0;opacity:0;pointer-events:none';
     dialog.append(field);field.select();field.setSelectionRange(0,field.value.length);
     let copied=false;
     try{copied=document.execCommand('copy')}catch{}finally{field.remove()}
     status.textContent=copied?'Enlace copiado.':'El navegador no permitió copiar. Vuelve a intentarlo desde el botón.';
    }
   }));
   copy.scrollIntoView({block:'nearest'});
  });
 }
 function disable(row){
  if(busy||!confirm('¿Quitar acceso a '+app.name+' a '+identity(row)+'?'))return;
  clearInvite();
  run('Quitando acceso…',async()=>{
   if(scope==='admin')await request('adminUserDisable',{id:row.id});
   if(scope==='production')await request('productionDisable',{document:doc(row)});
   if(scope==='plaza'){
    await request('plazaUserAdmin',{document:doc(row),enabled:false});
    for(const person of people.filter(person=>doc(person)===doc(row))){
     await put('personal',{...person,plazaEnabled:false,plazaRole:'',updatedAt:new Date().toISOString()});
    }
   }
   access[scope]=access[scope].filter(other=>other!==row);
   if(selected===row){selected=null;manage.hidden=true}
   renderActive();renderSearch();status.textContent='Acceso retirado.';
  });
 }
 search.oninput=renderSearch;
 dialog.showModal();
 await run('Cargando Personal y accesos…',async()=>{
  const [local,admin,production]=await Promise.allSettled([all('personal'),request('adminUsersList'),request('productionUsers')]);
  if(local.status==='fulfilled'){
   people=local.value.filter(person=>!person.deleted).sort((a,b)=>String(a.nombre||'').localeCompare(String(b.nombre||''),'es'));
   access.plaza=people.filter(person=>person.plazaEnabled).map(person=>({...person,personId:person.id,role:person.plazaRole||'operator'}));
  }
  if(admin.status==='fulfilled')access.admin=(admin.value.users||[]).filter(row=>row.enabled).map(row=>{
   const person=people.find(p=>same({personId:p.id,document:doc(p)},row));
   return {...row,personId:row.personId||person?.id};
  });
  if(production.status==='fulfilled')access.production=(production.value.users||[]).filter(row=>row.enabled!==false).map(row=>{
   const person=people.find(p=>same({personId:p.id,document:doc(p)},row));
   return {...person,...row,nombre:person?.nombre||row.name||row.nombre,role:row.role||'assistant'};
  });
  renderActive();renderSearch();
  const missing=Object.keys(access).filter(key=>!access[key]).map(key=>apps[key].name);
  status.textContent=missing.length?'Accesos sin verificar: '+missing.join(', ')+'.':'';
 });
}
document.addEventListener('click',event=>{
 const trigger=event.target.closest('#adminUsersBtn,.plazaAccessBtn,#productionUsersBtn');
 if(!trigger||!auth()?.isOwner())return;
 event.preventDefault();event.stopImmediatePropagation();
 open(trigger.id==='adminUsersBtn'?'admin':trigger.id==='productionUsersBtn'?'production':'plaza');
},true);
function permissions(){mount();const button=document.getElementById('productionUsersBtn');if(button){button.hidden=!auth()?.isOwner();if(button.hidden)button.style.setProperty('display','none','important');else button.style.removeProperty('display')}}
window.addEventListener('skadmin-permissions',permissions);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',permissions);else permissions();
})();
