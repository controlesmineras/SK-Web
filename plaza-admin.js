// Administración de accesos de Plaza Blending desde SK Admin.
(()=>{
  'use strict';
  const el=s=>document.querySelector(s);let selected=null;
  const wording=value=>String(value||'').replace(/Documento y PIN/gi,'Documento y contraseña').replace(/PIN incorrecto/gi,'Contraseña incorrecta').replace(/un PIN/gi,'una contraseña');
  const clean=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const people=async()=>(await all('personal')).filter(x=>!x.deleted);
  function accessRole(person){
    const role=String(person.plazaRole||'').trim().toLowerCase().replace(/^plaza_/,'');
    if(['assistant','auxiliar'].includes(role))return 'assistant';
    if(['admin','administrador'].includes(role))return 'admin';
    if(['supervisor','supervisor/a'].includes(role))return 'supervisor';
    return 'operator';
  }
  const roleLabel=person=>({assistant:'Auxiliar',admin:'Administrador',supervisor:'Supervisor/a',operator:'Bodeguero/a'}[accessRole(person)]);
  function roleChanged(){return selected?.plazaEnabled&&el('#plazaAccessForm').elements.plazaRole.value!==accessRole(selected)}
  function updateSubmit(){el('#plazaEnableBtn').textContent=roleChanged()?'GUARDAR ROL':'GENERAR ENLACE DE ACCESO'}
  async function render(){const q=(el('#plazaUserSearch')?.value||'').trim().toLowerCase(),rows=(await people()).filter(x=>!q||[x.nombre,x.documento,x.cargo,x.area].join(' ').toLowerCase().includes(q));el('#plazaUserCount').textContent=`${rows.length} colaboradores`;el('#plazaUserList').innerHTML=rows.sort((a,b)=>(a.nombre||'').localeCompare(b.nombre||'','es')).map(x=>`<button type="button" class="plazaUserRow ${selected?.id===x.id?'active':''}" data-plaza-person="${clean(x.id)}"><span><b>${clean(x.nombre||'Sin nombre')}</b><small>${clean(x.documento||'Sin documento')} · ${clean(x.cargo||'Sin cargo')}</small></span><span class="plazaAccessBadge ${x.plazaEnabled?'enabled':''}">${x.plazaEnabled?roleLabel(x):'Sin acceso'}</span></button>`).join('')||'<p class="hint">No hay colaboradores que coincidan.</p>'}
  function select(person){selected=person;const f=el('#plazaAccessForm');f.elements.id.value=person.id||'';f.elements.nombre.value=person.nombre||'';f.elements.document.value=person.documento||'';const role=f.elements.plazaRole,supervisor=role.querySelector('[value="supervisor"]');
    const existing=person.plazaEnabled && accessRole(person)==='supervisor';
    supervisor.hidden=supervisor.disabled=!existing;
    role.value=person.plazaEnabled?accessRole(person):'assistant';updateSubmit();el('#plazaCopyInvite').hidden=true;el('#plazaAccessState').textContent=person.plazaEnabled?`Acceso activo como ${roleLabel(person)}.`:'Este colaborador no tiene acceso a Plaza Blending.';el('#plazaDisableBtn').disabled=!person.plazaEnabled;render()}
  let invitationUrl='';
  async function changeActiveRole(person,role){
    const result=await window.SKAdminAuth.request('plazaChangeActiveRole',{personId:person.id,previousRole:accessRole(person),role});
    if(result.personId!==person.id||result.plazaRole!==role)throw new Error('La base central no confirmó el rol.');
    const current=(await people()).find(p=>p.id===person.id);
    const updated={...(current||person),plazaRole:role,updatedAt:result.updatedAt};
    await put('personal',updated);
    return updated;
  }
  window.SKPlazaAccess={accessRole,changeActiveRole};
  async function save(enabled){if(!selected)return alert('Selecciona primero un colaborador.');if(!enabled&&!confirm(`¿Quitar el acceso a Plaza Blending de ${selected.nombre}?`))return;const f=el('#plazaAccessForm');f.querySelectorAll('button').forEach(b=>b.disabled=true);el('#plazaAccessState').textContent=enabled?'Generando invitación…':'Desactivando acceso…';try{if(enabled){const requestedRole=f.elements.plazaRole.value;if(roleChanged()){const updated=await changeActiveRole(selected,requestedRole);if(selected?.id===updated.id){select(updated);el('#plazaAccessState').textContent='Rol guardado. Sincroniza Plaza Blending para aplicarlo en la sesión abierta.'}return}const result=await window.SKAdminAuth.request('accessInvitationCreate',{scope:'plaza',personId:selected.id,plazaRole:requestedRole});if(result.plazaRole!==requestedRole)throw new Error('Actualiza Code.gs para generar invitaciones con rol de Plaza Blending.');invitationUrl=new URL('crear-acceso.html?invite='+encodeURIComponent(result.token),location.href).href;el('#plazaCopyInvite').hidden=false;el('#plazaAccessState').textContent='Enlace válido por 24 horas. El colaborador creará su propia contraseña.'}else{const result=await window.SKAdminAuth.request('plazaUserAdmin',{document:selected.documento,enabled:false});const current=(await people()).find(x=>x.id===selected.id);const updated={...current,plazaEnabled:false,plazaRole:'',updatedAt:new Date().toISOString()};await put('personal',updated);selected=updated;invitationUrl='';el('#plazaCopyInvite').hidden=true;el('#plazaAccessState').textContent='Acceso desactivado.';render()}}catch(e){el('#plazaAccessState').textContent='No se pudo guardar: '+wording(e?.message||e)}finally{el('#plazaEnableBtn').disabled=false;el('#plazaDisableBtn').disabled=!selected?.plazaEnabled;el('#plazaCopyInvite').disabled=false;el('#plazaAccessCancelBtn').disabled=false}}
  window.addEventListener('load',()=>{el('#plazaAccessForm').addEventListener('change',updateSubmit);el('#plazaAccessForm').addEventListener('reset',()=>setTimeout(updateSubmit,0));el('.plazaAccessBtn')?.addEventListener('click',()=>{if(!window.SKAdminAuth?.isAdmin?.())return;window.SKAdminNav.go('plazaAccess');render()});document.addEventListener('click',e=>{const home=e.target.closest('#plazaAccess [data-return-home]');if(home){e.preventDefault();selected=null;invitationUrl='';el('#plazaCopyInvite').hidden=true;el('#plazaAccessForm')?.reset();el('#plazaAccessState').textContent='Sin colaborador seleccionado.';window.SKAdminNav.go('home');return}const cancel=e.target.closest('#plazaAccessCancelBtn');if(cancel){e.preventDefault();selected=null;invitationUrl='';el('#plazaCopyInvite').hidden=true;el('#plazaAccessForm')?.reset();el('#plazaAccessState').textContent='Sin colaborador seleccionado.';el('#plazaDisableBtn').disabled=true;render()}});el('#plazaCopyInvite')?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(invitationUrl);el('#plazaAccessState').textContent='Enlace copiado. Envíalo al colaborador.'}catch(_){prompt('Copia el enlace:',invitationUrl)}});el('#plazaUserSearch')?.addEventListener('input',render);el('#plazaUserList')?.addEventListener('click',async e=>{const b=e.target.closest('[data-plaza-person]');if(!b)return;const person=(await people()).find(x=>x.id===b.dataset.plazaPerson);if(person)select(person)});el('#plazaAccessForm')?.addEventListener('submit',e=>{e.preventDefault();save(true)});el('#plazaDisableBtn')?.addEventListener('click',()=>save(false))});
})();

