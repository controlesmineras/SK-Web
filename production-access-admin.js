
(()=>{
'use strict';
const auth=()=>window.SKAdminAuth;
function mount(){
 const home=document.querySelector('#home .homeAccess');
 if(!home||document.getElementById('productionUsersBtn'))return;
 const button=document.createElement('button');
 button.type='button';button.id='productionUsersBtn';button.className='homeAccessBtn';button.innerHTML='<span class="adminAccessLock" aria-hidden="true">🔐</span><span>USUARIOS DE PRODUCCIÓN</span><img class="adminAccessLogo" src="produccion/produccion-perforadora-512.png" width="34" height="34" alt="">';button.style.gridColumn='1 / -1';
 
 const adminButton=document.getElementById('adminUsersBtn');
 if(adminButton)adminButton.before(button);
 else (home.querySelector('.adminAccessRow')||home).append(button);
}

const apps={
 labor:{name:'Labor',roles:{reporter:'Registro de reportes',admin:'Administrador'}},
 admin:{name:'SK Web Admin',roles:{assistant:'Auxiliar administrativo',admin:'Administrador'}},
 plaza:{name:'Plaza Blending',roles:{assistant:'Auxiliar',operator:'Bodeguero/a',admin:'Administrador',supervisor:'Supervisor/a'}},
 production:{name:'Producción',roles:{mechanic:'Mecánico',warehouse:'Bodeguero/a',mechanic_warehouse:'Mecánico y bodeguero/a',assistant:'Auxiliar',admin:'Administrador'}}
};
const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const doc=person=>String(person?.documento??person?.document??'').trim();
const personName=person=>String(person?.nombre||person?.name||[person?.primerNombre,person?.segundoNombre,person?.primerApellido,person?.segundoApellido].filter(Boolean).join(' ')).trim();
const productionSelection=row=>row.roles?.includes('mechanic')&&row.roles?.includes('warehouse')?'mechanic_warehouse':row.role;
const labels=(scope,row)=>scope==='production'&&row.roles?.length?row.roles.map(role=>apps.production.roles[role]||role).join(' + '):String(apps[scope].roles[row.role]|| (row.role==='owner'?'Administrador principal':row.role||'Usuario')).trim();
const same=(a,b)=>Boolean((a.personId&&a.personId===b.personId)||(doc(a)&&doc(a)===doc(b)));
function button(label,action){
 const node=document.createElement('button');
 node.type='button';node.textContent=label;node.onclick=action;
 return node;
}
let dialog;
async function open(scope){
 if(!auth()?.isAdmin()||dialog?.open)return;
 const app=apps[scope];
 if(!dialog){
  dialog=document.createElement('dialog');
  dialog.style.cssText='width:min(680px,94vw);max-height:90dvh;border:0;border-radius:14px;padding:16px;color:#102f45';
  document.body.append(dialog);
 }
 dialog.classList.toggle('laborAccessDialog',scope==='labor');
 dialog.innerHTML=`
  <div class="sectionHead"><h2></h2><button type="button" data-close>Cerrar</button></div>
  <section class="plazaAccessPeople">
   <h3>Nuevo acceso</h3>
   <div class="accessPersonField">
    <label for="accessPersonSearch">FUNCIONARIO</label>
    <input id="accessPersonSearch" type="search" placeholder="Buscar por nombre o documento…" autocomplete="off" aria-controls="accessPersonResults" aria-expanded="false">
    <div id="accessPersonResults" data-results class="accessPersonResults" hidden></div>
   </div>
   <div data-person-info class="accessPersonInfo" hidden>
    <label>DOCUMENTO<input data-document readonly tabindex="-1"></label>
    <label>EMPRESA DEL FUNCIONARIO<input data-company readonly tabindex="-1"></label>
   </div>
  </section>
  <section data-manage class="plazaAccessPeople" hidden></section>
  <p role="status" aria-live="polite"></p><div data-copy></div>
  <section class="plazaAccessPeople">
   <h3>Accesos activos</h3><div data-active class="list" style="max-height:34vh"></div>
  </section>`;
 const find=selector=>dialog.querySelector(selector);
 const active=find('[data-active]'),results=find('[data-results]'),manage=find('[data-manage]'),search=find('#accessPersonSearch'),status=find('[role=status]'),copy=find('[data-copy]'),info=find('[data-person-info]');
 find('h2').textContent='Accesos a '+app.name;
 if(scope==='labor'){
  active.previousElementSibling.textContent='Usuarios e invitaciones';
  active.style.removeProperty('max-height');
 }
 find('[data-close]').onclick=()=>dialog.close();
 const request=(action,data)=>auth().request(action,data);
 const current=()=>dialog.open&&dialog.querySelector('[data-active]')===active&&auth()?.isAdmin();
 const reload=()=>{dialog.close();return open(scope)};
 const expiredSession=error=>/sesi[oó]n.*(?:venci|caduc|expir)|inicia sesi[oó]n/i.test(error?.message||'');
 let people=[],selected=null,inviteUrl='',busy=false,adminRoles=['assistant'],warehouseV1=false;
 const access={admin:null,plaza:null,production:null,labor:null};
 function clearInvite(){inviteUrl='';copy.replaceChildren()}
 function identity(p){return [personName(p)||'Sin nombre',doc(p),p.cargo].filter(Boolean).join(' · ')}
 function showResults(show){results.hidden=!show;search.setAttribute('aria-expanded',String(show))}
 function showPerson(row){
  const person=people.find(p=>same({personId:p.id,document:doc(p)},row));
  search.value=personName(row)||doc(row);showResults(false);
  find('[data-document]').value=doc(row);
  find('[data-company]').value=row.empresa||person?.empresa||'';
  info.hidden=false;
 }
 function rolesFor(row){
  return Object.entries(access).flatMap(([key,list])=>(list||[]).filter(other=>other===row||same(other,row)).map(other=>apps[key].name+' — '+labels(key,other)));
 }
 function clearLaborSelection(){
  selected=null;search.value='';info.hidden=true;manage.hidden=true;manage.replaceChildren();
  find('[data-document]').value='';find('[data-company]').value='';showResults(false);
 }
 function renderActive(){
  const rows=access[scope];
  active.replaceChildren();
  if(!rows){active.textContent='No se pudieron cargar los accesos de esta app.';return}
  if(!rows.length){active.textContent=scope==='labor'?'Todavía no hay usuarios ni invitaciones de Labor.':'No hay accesos activos.';return}
  for(const row of rows){
   const card=document.createElement('div');
   card.className='plazaAccessPeople';
   const name=document.createElement('b'),roles=document.createElement('p');
   name.textContent=identity(row);roles.textContent=row.pending?'Invitación pendiente de activar · '+labels(scope,row):[...new Set(rolesFor(row))].join(' · ');
   card.append(name,roles);
   if(scope==='labor')card.classList.add(row.pending?'laborInviteCard':'laborUserCard');
   if(row.role!=='owner'){
    const actions=scope==='labor'?document.createElement('div'):card;
    if(scope==='labor'){actions.className='laborCardActions';card.append(actions)}
    actions.append(button(row.pending?'Renovar enlace':'Restablecer acceso',()=>generate(row,scope==='production'?productionSelection(row):row.role)),button('Gestionar accesos',()=>choose(row,true)));
    if(scope==='labor')actions.append(button(row.pending?'Cancelar invitación':'Quitar acceso',()=>disable(row)));
   }
   active.append(card);
  }
 }
 function eligible(person){return person.active!==false&&doc(person)&&(scope!=='admin'||normalize(person.area).replace(/\s+/g,' ')==='seguridad fisica')}
 function renderSearch(){
  results.replaceChildren();
  const query=normalize(search.value);
  if(scope!=='labor'&&!access[scope])results.textContent='Carga los accesos activos antes de conceder un acceso.';
  else{
   const matches=people.filter(person=>eligible(person)&&normalize([personName(person),doc(person)].join(' ')).includes(query)&&!access[scope]?.some(row=>same(row,{personId:person.id,document:doc(person)}))).sort((a,b)=>personName(a).localeCompare(personName(b),'es',{sensitivity:'base'}));
   for(const person of matches.slice(0,60)){
    const row=button('',()=>choose({...person,personId:person.id},false)),name=document.createElement('b'),documentNumber=document.createElement('span');
    name.textContent=personName(person)||'Sin nombre';documentNumber.textContent=doc(person);
    row.append(name,documentNumber);results.append(row);
   }
   if(!matches.length)results.textContent='No hay colaboradores disponibles que coincidan.';
  }
  showResults(document.activeElement===search);
 }
 function addRoleLookup(row){
  if(!row.personId)return;
  const result=document.createElement('div');
  result.setAttribute('data-role-report','');result.setAttribute('aria-live','polite');
  manage.append(button('Ver roles en las cuatro apps',()=>run('Consultando roles…',async()=>{
   result.replaceChildren();
   const data=await request('appRolesForPerson',{personId:row.personId});
   if(!current()||selected!==row)return;
   if(data.personId!==row.personId||!Object.keys(apps).every(key=>Array.isArray(data.roles?.[key])))throw new Error('Actualiza la implementación de Code.gs para consultar los roles.');
   for(const [key,app] of Object.entries(apps)){
    const entry=document.createElement('p'),roles=data.roles[key];
    entry.textContent=app.name+' · '+(roles.length?roles.map(role=>labels(key,{role})).join(' + '):'Sin acceso activo vinculado a este documento');
    result.append(entry);
   }
   if(!data.roles.admin.length){
    const hint=document.createElement('p');hint.className='hint';
    hint.textContent='Las cuentas principales creadas con un nombre de usuario se consultan en Usuarios de Web Admin.';
    result.append(hint);
   }
   status.textContent='Roles confirmados por la base central.';
  })),result);
 }
 function choose(row,existing){
  if(busy)return;
  selected=row;showPerson(row);clearInvite();status.textContent='';manage.hidden=false;
  const title=document.createElement('h3');
  title.textContent=(existing?'Gestionar accesos de ':'Nuevo acceso para ')+identity(row);
  manage.replaceChildren(title);
  if(scope==='labor'){
   const role=document.createElement('select'),label=document.createElement('label');
   label.textContent='Rol en Labor';
   for(const [key,name] of Object.entries(app.roles))role.add(new Option(name,key));
   role.value=row.role||'reporter';label.append(role);manage.append(label);
   const invite=button('Generar enlace de Labor',()=>generate(row,role.value));
   invite.disabled=!access.labor;
   manage.append(invite);
   if(invite.disabled){
    const note=document.createElement('p');
    note.textContent='Para generar el enlace, primero hay que verificar los accesos de Labor.';
    manage.append(note);
   }
   if(existing&&!row.pending){
    const save=button('Guardar rol',()=>run('Guardando rol…',async()=>{
     const requested=role.value;
     const result=await request('laborChangeActiveRole',{document:doc(row),personId:row.personId,previousRole:row.role,role:requested});
     if(!current()||selected!==row)return;
     if(result.personId!==row.personId||result.scope!=='labor'||result.role!==requested)throw new Error('La base central no confirmó el rol de Labor. Revisa la implementación de Code.gs.');
     manage.querySelector('[data-role-report]')?.replaceChildren();
     row.role=requested;role.value=requested;save.hidden=true;clearInvite();renderActive();
     status.textContent='Rol guardado. Sincroniza Labor para aplicarlo en la sesión abierta.';
    }));
    role.onchange=()=>{save.hidden=role.value===row.role};
    save.hidden=true;manage.append(save);
   }
   if(existing)manage.append(button(row.pending?'Cancelar invitación':'Quitar acceso a Labor',()=>disable(row)));
   addRoleLookup(row);
   if(!invite.disabled)invite.focus({preventScroll:true});manage.scrollIntoView({block:'nearest'});return;
  }
  const role=document.createElement('select'),label=document.createElement('label');
  label.textContent='Rol en '+app.name;
  for(const key of scope==='plaza'?['assistant','operator','admin']:Object.keys(app.roles))role.add(new Option(app.roles[key],key));
  if(scope==='plaza'&&row.role==='supervisor')role.add(new Option(app.roles.supervisor,'supervisor'));
  role.value=(scope==='production'?productionSelection(row):row.role)||'assistant';label.append(role);manage.append(label);
  if(scope==='admin'&&!adminRoles.includes('admin')){
   const note=document.createElement('p');note.className='hint';note.textContent='Para habilitar el rol Administrador, actualiza Code.gs y publica una nueva versión del servicio central.';manage.append(note);
  }
  if(scope==='plaza'&&existing){
   const saveRole=button('Guardar rol',()=>run('Guardando rol…',async()=>{
    const person=people.find(p=>p.id===row.personId),updated=await window.SKPlazaAccess.changeActiveRole(person,role.value);
    Object.assign(person,updated);Object.assign(row,{plazaRole:updated.plazaRole,role:updated.plazaRole});
    if(!current())return;
    manage.querySelector('[data-role-report]')?.replaceChildren();
    clearInvite();renderActive();role.value=row.role;saveRole.hidden=true;
    status.textContent='Rol guardado. Sincroniza Plaza Blending para aplicarlo en la sesión abierta.';
   }));
   saveRole.hidden=true;
   role.onchange=()=>{saveRole.hidden=role.value===row.role};
   manage.append(saveRole);
  }
  if(existing&&row.personId&&['admin','production'].includes(scope)){
   const previous=()=>scope==='production'?productionSelection(row):row.role;
   const save=button('Guardar rol',()=>run('Guardando rol…',async()=>{
    const requested=role.value;
    const result=await request('changeAppActiveRole',{scope,personId:row.personId,userId:row.id,role:requested,previousRole:previous()});
    if(!current()||selected!==row)return;
    const confirmed=scope==='production'?productionSelection(result):result.role;
    if(result.personId!==row.personId||result.scope!==scope||confirmed!==requested)throw new Error('La base central no confirmó el rol. Revisa la implementación de Code.gs.');
    manage.querySelector('[data-role-report]')?.replaceChildren();
    Object.assign(row,{role:result.role,roles:result.roles});role.value=confirmed;save.hidden=true;clearInvite();renderActive();
    status.textContent='Rol guardado. Vuelve a ingresar a '+app.name+' con la misma contraseña.';
   }));
   role.onchange=()=>{save.hidden=role.value===previous()};save.hidden=true;manage.append(save);
  }
  manage.append(button(existing?'Generar enlace con el rol seleccionado':'Generar enlace',()=>generate(row,role?.value||row.role)));
  if(existing)manage.append(button('Quitar acceso',()=>disable(row)));
  addRoleLookup(row);
  role.focus({preventScroll:true});
  manage.scrollIntoView({block:'nearest'});
 }
 async function run(message,fn){
  if(busy)return;
  busy=true;search.disabled=true;status.textContent=message;
  try{await fn()}catch(error){status.textContent=error.message||String(error)}finally{busy=false;search.disabled=false}
 }
 function generate(row,role){
  if(busy||(scope==='labor'&&!access.labor))return;
  clearInvite();
  if(scope==='admin'&&role==='admin'&&!adminRoles.includes('admin')){status.textContent='Actualiza Code.gs y su implementación antes de generar un acceso de Administrador.';return}
  if(!row.personId){status.textContent='Esta cuenta no está vinculada a un colaborador de Personal.';return}
  run('Generando invitación para '+identity(row)+'…',async()=>{
   const data={scope,personId:row.personId};
   if(scope==='labor')data.laborRole=role||'reporter';
   if(scope==='admin')data.adminRole=role||'assistant';
   if(scope==='plaza')data.plazaRole=role;
   if(scope==='production'){data.productionRoles=role==='mechanic_warehouse'?['mechanic','warehouse']:[role];data.productionRole=role==='mechanic_warehouse'?'mechanic':role;if(!warehouseV1&&data.productionRoles.includes('warehouse'))throw new Error('Actualiza Code.gs para habilitar Bodega y los roles combinados.');}
   let result;
   if(scope==='plaza'){
    await auth().waitForLoginRenewal?.();
    if(!current())return;
   }
   try{result=await request('accessInvitationCreate',data)}
   catch(error){
    if(scope==='plaza'&&current()&&expiredSession(error)){
     copy.append(button('Renovar sesión de Admin',async()=>{
      dialog.close();
      const renewed=await auth().renewForSync();
      if(dialog.open||dialog.querySelector('[data-active]')!==active||!auth()?.isAdmin())return;
      dialog.showModal();
      if(renewed){clearInvite();status.textContent='Sesión renovada. Vuelve a generar el enlace para '+identity(row)+'.'}
     }));
    }
    throw error;
   }
   if(!current())return;
   if(scope==='labor'&&result.scope!=='labor')throw new Error('El servicio central no confirmó una invitación de Labor.');
   if(scope==='labor'&&(result.laborRole??'reporter')!==data.laborRole)throw new Error('El servicio no confirmó el rol de Labor. Actualiza la implementación de Code.gs.');
   if(scope==='admin'&&((result.adminRole&&result.adminRole!==data.adminRole)||(data.adminRole==='admin'&&result.adminRole!=='admin')))throw new Error('El servicio no confirmó el rol seleccionado. Actualiza Code.gs y su implementación.');
   if(scope==='plaza'&&result.plazaRole!==role)throw new Error('El servicio devolvió un rol distinto. Revisa la versión de Code.gs.');
   if(scope==='production'&&(result.productionRole!==data.productionRole||(data.productionRoles.includes('warehouse')&&JSON.stringify(result.productionRoles)!==JSON.stringify(data.productionRoles))))throw new Error('Actualiza y despliega Code.gs para asignar roles de Producción.');
   if(!result.token)throw new Error('El servicio no devolvió una invitación.');
   const url=new URL(scope==='production'?'produccion/':'crear-acceso.html',location.href);
   if(scope==='production')url.hash=new URLSearchParams({invitation:result.token});
   else url.searchParams.set('invite',result.token);
   if(scope==='labor'){
    url.searchParams.set('app','labor');
    const account=access.labor.find(other=>same(other,row));
    if(!account){
     access.labor.push({...row,role:data.laborRole,pending:true});renderActive();
     clearLaborSelection();
    }else if(account.pending){
     account.role=data.laborRole;renderActive();
    }
   }
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
  const cancelInvite=scope==='labor'&&row.pending;
  const question=cancelInvite?'¿Cancelar la invitación de Labor de '+identity(row)+'?':'¿Quitar acceso a '+app.name+' a '+identity(row)+'?';
  if(busy||!confirm(question))return;
  clearInvite();
  run('Quitando acceso…',async()=>{
   if(scope==='labor')await request('laborDisable',{document:doc(row)});
   if(scope==='admin')await request('adminUserDisable',{id:row.id});
   if(scope==='production')await request('productionDisable',{document:doc(row)});
   if(scope==='plaza'){
    await request('plazaUserAdmin',{document:doc(row),enabled:false});
    for(const person of people.filter(person=>doc(person)===doc(row))){
     await put('personal',{...person,plazaEnabled:false,plazaRole:'',updatedAt:new Date().toISOString()});
    }
   }
   if(!current())return;
   access[scope]=access[scope].filter(other=>other!==row);
   if(selected===row){
    if(scope==='labor')clearLaborSelection();
    else{selected=null;manage.hidden=true}
   }
   renderActive();renderSearch();status.textContent=cancelInvite?'Invitación cancelada.':'Acceso retirado.';
  });
 }
 search.oninput=()=>{
  if(selected&&search.value===(personName(selected)||doc(selected)))return;
  selected=null;manage.hidden=true;manage.replaceChildren();clearInvite();status.textContent='';
  info.hidden=true;find('[data-document]').value='';find('[data-company]').value='';renderSearch();
 };
 search.onfocus=()=>{if(!selected)renderSearch()};
 search.onkeydown=event=>{
  if(event.key==='ArrowDown'){event.preventDefault();renderSearch();results.querySelector('button')?.focus()}
 };
 // Mantén el foco hasta recibir el clic. Un desplazamiento táctil no elige a nadie.
 results.onpointerdown=event=>{
  if(event.button===0&&event.target.closest('button'))event.preventDefault();
 };
 dialog.onpointerdown=event=>{if(!find('.accessPersonField').contains(event.target))showResults(false)};
 dialog.onkeydown=event=>{
  if(event.key==='Escape'&&!results.hidden){event.preventDefault();event.stopPropagation();search.focus();showResults(false)}
 };
 find('.accessPersonField').onfocusout=event=>{
  if(event.relatedTarget&&!find('.accessPersonField').contains(event.relatedTarget))showResults(false);
 };
 dialog.showModal();
 async function loadPeople(){
  people=(await all('personal')).filter(person=>!person.deleted).sort((a,b)=>String(a.nombre||'').localeCompare(String(b.nombre||''),'es'));
  access.plaza=people.filter(person=>person.plazaEnabled).map(person=>({...person,personId:person.id,role:window.SKPlazaAccess.accessRole(person)}));
 }
 async function loadUsers(){
  await auth().waitForLoginRenewal?.();
  if(!current())return [];
  async function readUsers(action){
   const result=await request(action);
   if(!Array.isArray(result?.users))throw new Error('El servicio devolvió una lista de accesos incompleta.');
   return result;
  }
  return Promise.allSettled([readUsers('adminUsersList'),readUsers('productionUsers')]);
 }
 function applyUsers(admin,production){
  if(admin.status==='fulfilled'){
   adminRoles=Array.isArray(admin.value.adminRoles)?admin.value.adminRoles:['assistant'];
   access.admin=(admin.value.users||[]).filter(row=>row.enabled).map(row=>{
    const person=people.find(p=>same({personId:p.id,document:doc(p)},row));
    return {...row,personId:row.personId||person?.id};
   });
  }
  if(production.status==='fulfilled')warehouseV1=production.value.warehouseV1===true;
  if(production.status==='fulfilled')access.production=(production.value.users||[]).filter(row=>row.enabled!==false).map(row=>{
   const person=people.find(p=>same({personId:p.id,document:doc(p)},row));
   return {...person,...row,nombre:person?.nombre||row.name||row.nombre,role:row.role||'assistant'};
  });
 }
 if(scope==='labor'){
  search.disabled=true;
  active.textContent='Cargando usuarios e invitaciones de Labor…';
  try{await loadPeople()}
  catch(error){
   if(current()){
    status.textContent='No se pudo cargar Personal en este dispositivo.';
    active.replaceChildren(button('Reintentar consulta',reload));
   }
   return;
  }
  if(!current())return;
  search.disabled=false;
  renderSearch();
  async function loadLaborUsers(){
   active.textContent='Cargando usuarios e invitaciones de Labor…';
   try{
    await auth().waitForLoginRenewal?.();
    if(!current())return;
    const result=await request('laborUsers');
    if(!current())return;
    if(result?.scope!=='labor'||!Array.isArray(result.users))throw new Error('El servicio central no confirmó los usuarios de Labor.');
    const byId=new Map(people.map(p=>[p.id,p]));
    access.labor=result.users.map(row=>({...byId.get(row.personId),...row})).sort((a,b)=>identity(a).localeCompare(identity(b),'es'));
    renderActive();
    if(selected){
     const existing=access.labor.find(row=>same(row,selected));
     if(existing){
      clearLaborSelection();status.textContent=identity(existing)+(existing.pending?' ya tiene una invitación pendiente.':' ya tiene acceso a Labor.');
     }else choose(selected,false);
    }else renderSearch();
   }catch(error){
    if(!current())return;
    const detail=/solicitud no válida/i.test(error.message)?'Actualiza la implementación de Code.gs para habilitar Labor.':error.message;
    active.textContent=['No se pudieron verificar los accesos de Labor.',detail].filter(Boolean).join(' ');
    active.append(button('Reintentar consulta',loadLaborUsers));
   }
  }
  await loadLaborUsers();
  return;
 }
 if(scope==='plaza'){
  // Los usuarios de Plaza pertenecen a Personal. Las otras apps solo aportan etiquetas.
  await run('Cargando Personal…',async()=>{
   try{await loadPeople()}
   catch(error){copy.append(button('Reintentar consulta',reload));throw error}
   if(current()){renderActive();renderSearch();status.textContent=''}
  });
  if(!current()||!access.plaza)return;
  const [admin,production]=await loadUsers();
  if(current()&&admin&&production){
   applyUsers(admin,production);
   access.plaza.forEach((row,index)=>{
    const roles=active.children[index]?.querySelector('p');
    if(roles)roles.textContent=[...new Set(rolesFor(row))].join(' · ');
   });
  }
  return;
 }
 await run('Cargando Personal y accesos…',async()=>{
  const [local,remote]=await Promise.allSettled([loadPeople(),loadUsers()]);
  if(!current())return;
  if(remote.status==='rejected')throw remote.reason;
  const [admin,production]=remote.value;
  applyUsers(admin,production);
  renderActive();renderSearch();
  if(scope==='production'){
   const section=document.createElement('section');section.className='plazaAccessPeople';section.append(Object.assign(document.createElement('h3'),{textContent:'Bodega de Producción'}));
   const settings=production.status==='fulfilled'?production.value.warehouseSettings:null;
   const settingsReady=warehouseV1&&typeof settings?.enabled==='boolean';
   const note=document.createElement('p');section.append(note);
   if(production.status==='rejected')note.textContent='No se pudo consultar la activación de la bodega. Revisa el detalle de la consulta.';
   else if(!warehouseV1)note.textContent='Actualiza Code.gs y publica su nueva versión para habilitar Bodega.';
   else if(!settingsReady){note.textContent='El servicio respondió sin el estado de activación de la bodega.';section.append(button('Reintentar consulta',reload));}
   else note.textContent=settings.enabled?'Ingresos automáticos desde '+new Date(settings.transferStartAt).toLocaleString('es-CO',{timeZone:'America/Bogota'})+'. Las cantidades pertenecen únicamente a Producción.':'Al activar, solo se incorporarán nuevas salidas de Plaza. Las entregas históricas no se volverán a sumar.';
   if(settingsReady&&!settings.enabled)section.append(button('ACTIVAR BODEGA DE PRODUCCIÓN',()=>{
    if(!confirm('¿Activar Bodega de Producción? Solo se incorporarán salidas de Plaza registradas desde la activación. Los saldos actuales de repuestos se conservan; registra las aperturas de otros elementos en Producción.'))return;
    run('Activando bodega…',async()=>{const result=await request('productionWarehouseConfigure',{enabled:true});Object.assign(settings,result.warehouseSettings);status.textContent='Bodega activada. Los saldos de Producción no se comparten con Plaza.';dialog.close();open(scope);});
   }));
   const label=document.createElement('label'),toggle=document.createElement('input');toggle.type='checkbox';toggle.checked=settings?.allowSpareDelivery===true;toggle.disabled=!settingsReady;label.append(toggle,document.createTextNode('Permitir entregar repuestos YT y Columna desde Bodega de Producción'));section.append(label);
   toggle.onchange=()=>{const value=toggle.checked;run('Guardando permiso…',async()=>{try{const result=await request('productionWarehouseConfigure',{allowSpareDelivery:value});toggle.checked=result.warehouseSettings.allowSpareDelivery;status.textContent='Permiso actualizado. Producción lo recibirá al sincronizar.';}catch(error){toggle.checked=!value;throw error}})};
   active.closest('section').before(section);
  }
  const failures=new Map();
  for(const [name,result] of [['Personal local',local],[apps.admin.name,admin],[apps.production.name,production]]){
   if(result.status!=='rejected')continue;
   const reason=String(result.reason?.message||result.reason||'No se pudo completar la consulta.');
   const message=/failed to fetch|load failed|networkerror|network request failed|fetch failed/i.test(reason)?'No se pudo conectar con el servicio. Comprueba la conexión a internet.':reason;
   failures.set(message,[...(failures.get(message)||[]),name]);
  }
  status.textContent=Array.from(failures,([message,names])=>names.join(' y ')+' · '+message).join(' ');
  if(failures.size){
   copy.append(button('Reintentar consulta',reload));
   if([admin,production].some(result=>result.status==='rejected'&&expiredSession(result.reason))){
    copy.append(button('Renovar sesión de Admin',async()=>{
     dialog.close();
     await auth().renewForSync();
     if(auth()?.isAdmin()&&!dialog.open)open(scope);
    }));
   }
  }
 });
}
document.addEventListener('click',event=>{
 const trigger=event.target.closest('#adminUsersBtn,.plazaAccessBtn,#productionUsersBtn,#laborUsersBtn');
 if(!trigger||!auth()?.isAdmin())return;
 event.preventDefault();event.stopImmediatePropagation();
 open(trigger.id==='laborUsersBtn'?'labor':trigger.id==='adminUsersBtn'?'admin':trigger.id==='productionUsersBtn'?'production':'plaza');
},true);
function permissions(){mount();const button=document.getElementById('productionUsersBtn');if(button){button.hidden=!auth()?.isAdmin();if(button.hidden)button.style.setProperty('display','none','important');else button.style.removeProperty('display')}}
window.addEventListener('skadmin-permissions',permissions);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',permissions);else permissions();
})();
