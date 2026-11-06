// Documento único: bloquear nuevas coincidencias y permitir editar solo el mismo registro.
(()=>{
  'use strict';
  const form=document.querySelector('#personalForm');
  if(!form)return;
  const newButton=document.querySelector('#newPersonBtn');if(newButton)newButton.textContent='+ Nuevo colaborador';
  const documentKey=value=>String(value||'').normalize('NFKC').replace(/[.\s-]/g,'').toUpperCase();
  const compose=values=>[values.primerNombre,values.segundoNombre,values.primerApellido,values.segundoApellido].map(value=>String(value||'').trim()).filter(Boolean).join(' ');
  function splitName(person){if(person.primerNombre&&person.primerApellido)return person;const parts=String(person.nombre||'').trim().split(/\s+/).filter(Boolean);return{...person,primerNombre:parts[0]||'',segundoNombre:parts.length>3?parts.slice(1,-2).join(' '):parts.length===3?parts[1]:'',primerApellido:parts.length>3?parts.at(-2):parts.length===2?parts[1]:parts.at(-1)||'',segundoApellido:parts.length>3?parts.at(-1):''}}
  document.querySelector('#personalList')?.addEventListener('click',event=>{const button=event.target.closest('[data-person-edit]');if(!button)return;setTimeout(async()=>{const person=(await all('personal')).find(item=>item.id===button.dataset.personEdit);if(!person)return;const values=splitName(person);for(const name of ['primerNombre','segundoNombre','primerApellido','segundoApellido','telefono'])if(form.elements[name])form.elements[name].value=values[name]||'';form.elements.empresa?.dispatchEvent(new Event('change',{bubbles:true}));if(!window.SKFormOptions||window.SKFormOptions.validPersonalArea(values.empresa,values.area))form.elements.area.value=values.area||''},60)});
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    event.stopImmediatePropagation();
    if(form.dataset.saving==='1')return;
    form.dataset.saving='1';
    try{
    const values=Object.fromEntries(new FormData(form).entries());
    values.nombre=compose(values);
    const areas=window.SKFormOptions?.allowedPersonalAreas(values.empresa)||['Seguridad física','Desmin - Obras civiles','Producción','Administrativa'];
    if(!areas.includes(values.area))return alert(values.empresa==='DESMIN'?'Producción - Selectivo (Corteros) no está disponible para DESMIN. Selecciona otra área.':'Selecciona un área de la lista');
    const collaborators=await all('personal');
    const documentNumber=String(values.documento||'').trim();
    const duplicate=collaborators.find(person=>!person.deleted&&person.id!==values.id&&documentKey(person.documento||person.document)===documentKey(documentNumber));
    if(duplicate){
      alert('Ya hay un colaborador con ese documento.\n\nNombre: '+(duplicate.nombre||compose(duplicate)||'Sin nombre')+'\nDocumento: '+(duplicate.documento||duplicate.document||'')+'\nEmpresa: '+(duplicate.empresa||'Sin empresa')+'\n\nNo se guardó el registro. Busca al colaborador existente para editarlo.');
      form.elements.documento.focus();
      return;
    }else if(values.id){
      const current=collaborators.find(person=>person.id===values.id);
      await put('personal',{...current,...values,updatedAt:now(),syncState:'pending'});
      alert('Datos del colaborador actualizados.');
    }else{
      await put('personal',{...values,...mark(),documento:documentNumber});
      alert('Colaborador guardado en este dispositivo. Pendiente de sincronizar con la base central.');
    }
    form.reset();
    form.elements.id.value='';
    document.querySelector('#personSaveBtn').textContent='Guardar colaborador';
    await refresh();
    window.skSyncApi?.schedule?.(300);
    }catch(error){alert(error?.message||'No fue posible guardar el colaborador.')}finally{delete form.dataset.saving;}
  },true);
})();
