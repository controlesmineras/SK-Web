(()=>{
  const button=document.querySelector('#productionAccessBtn');
  const dialog=document.createElement('dialog');
  dialog.innerHTML='<h2>Usuarios Producción</h2><label>Buscar colaborador<input type="search"></label><select aria-label="Colaborador"></select><p role="status"></p><button type="button" data-invite>Generar enlace</button> <button type="button" data-disable>Quitar acceso</button> <button type="button" data-close>Cerrar</button><p><input aria-label="Enlace de invitación" readonly hidden></p>';
  document.body.append(dialog);
  const search=dialog.querySelector('input[type=search]'),select=dialog.querySelector('select'),status=dialog.querySelector('[role=status]');
  const invite=dialog.querySelector('[data-invite]'),disable=dialog.querySelector('[data-disable]'),link=dialog.querySelector('input[readonly]');
  let people=[],active=[],busy=false;
  function render(){
    const query=search.value.trim().toLowerCase(),previous=select.value;
    const rows=people.filter(person=>[person.nombre,person.documento].join(' ').toLowerCase().includes(query));
    select.replaceChildren(new Option('Selecciona un colaborador',''),...rows.map(person=>new Option(
      person.nombre+' · '+person.documento+(active.includes(person.id)?' · Activo':''),person.id)));
    select.value=rows.some(person=>person.id===previous)?previous:'';
  }
  async function run(operation){
    if(busy||!window.SKAdminAuth.isOwner())return;
    busy=true;invite.disabled=disable.disabled=true;status.textContent='Consultando…';link.hidden=true;link.value='';
    try{await operation()}
    catch(error){status.textContent=error.message}
    finally{busy=false;invite.disabled=disable.disabled=false}
  }
  button.onclick=()=>{
    if(!window.SKAdminAuth.isOwner())return;
    dialog.showModal();
    void run(async()=>{
      people=(await all('personal')).filter(person=>!person.deleted&&person.documento).sort((a,b)=>String(a.nombre).localeCompare(String(b.nombre),'es'));
      const result=await window.SKAdminAuth.request('productionAccess');
      active=result.active;render();status.textContent='';
    });
  };
  search.oninput=render;
  select.onchange=()=>{link.hidden=true;link.value=''};
  dialog.querySelector('[data-close]').onclick=()=>dialog.close();
  invite.onclick=()=>run(async()=>{
    if(!select.value)throw new Error('Selecciona un colaborador.');
    const result=await window.SKAdminAuth.request('accessInvitationCreate',{scope:'production',personId:select.value});
    link.value=new URL('produccion/?invite='+encodeURIComponent(result.token),location.href).href;
    link.hidden=false;link.select();
    status.textContent='Copia el enlace. Es de un solo uso y vence en 24 horas.';
  });
  disable.onclick=()=>{
    if(!select.value||!confirm('¿Quitar el acceso a Producción y cancelar la invitación pendiente?'))return;
    void run(async()=>{
      const result=await window.SKAdminAuth.request('productionAccess',{personId:select.value,disable:true});
      active=result.active;render();status.textContent='Acceso desactivado.';
    });
  };
  const updateVisibility=()=>{button.hidden=document.body.dataset.adminRole!=='owner'};
  new MutationObserver(updateVisibility).observe(document.body,{attributes:true,attributeFilter:['data-admin-role']});
  updateVisibility();
})();
