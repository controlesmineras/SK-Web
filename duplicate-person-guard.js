// Impide colaboradores duplicados por documento y permite actualizar el existente.
(()=>{
  'use strict';
  const form=document.querySelector('#personalForm');
  if(!form)return;
  const newButton=document.querySelector('#newPersonBtn');if(newButton)newButton.textContent='+ Nuevo colaborador';
  const compose=values=>[values.primerNombre,values.segundoNombre,values.primerApellido,values.segundoApellido].map(value=>String(value||'').trim()).filter(Boolean).join(' ');
  function splitName(person){if(person.primerNombre&&person.primerApellido)return person;const parts=String(person.nombre||'').trim().split(/\s+/).filter(Boolean);return{...person,primerNombre:parts[0]||'',segundoNombre:parts.length>3?parts.slice(1,-2).join(' '):parts.length===3?parts[1]:'',primerApellido:parts.length>3?parts.at(-2):parts.length===2?parts[1]:parts.at(-1)||'',segundoApellido:parts.length>3?parts.at(-1):''}}
  document.querySelector('#personalList')?.addEventListener('click',event=>{const button=event.target.closest('[data-person-edit]');if(!button)return;setTimeout(async()=>{const person=(await all('personal')).find(item=>item.id===button.dataset.personEdit);if(!person)return;const values=splitName(person);for(const name of ['primerNombre','segundoNombre','primerApellido','segundoApellido','telefono'])if(form.elements[name])form.elements[name].value=values[name]||'';form.elements.empresa?.dispatchEvent(new Event('change',{bubbles:true}));if(!window.SKFormOptions||window.SKFormOptions.validPersonalArea(values.empresa,values.area))form.elements.area.value=values.area||''},60)});
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    event.stopImmediatePropagation();
    const values=Object.fromEntries(new FormData(form).entries());
    values.nombre=compose(values);
    const areas=window.SKFormOptions?.allowedPersonalAreas(values.empresa)||['Seguridad física','Desmin - Obras civiles','Producción','Administrativa'];
    if(!areas.includes(values.area))return alert(values.empresa==='DESMIN'?'Producción - Selectivo (Corteros) no está disponible para DESMIN. Selecciona otra área.':'Selecciona un área de la lista');
    const collaborators=await all('personal');
    const documentNumber=String(values.documento||'').trim();
    const duplicate=collaborators.find(person=>!person.deleted&&person.id!==values.id&&String(person.documento||'').trim()===documentNumber);
    if(duplicate){
      if(!confirm('Funcionario ya existe. ¿Deseas actualizar sus datos?'))return;
      await put('personal',{...duplicate,...values,id:duplicate.id,documento:documentNumber,createdAt:duplicate.createdAt||now(),updatedAt:now(),syncState:'pending'});
      alert('Datos del colaborador actualizados.');
    }else if(values.id){
      const current=collaborators.find(person=>person.id===values.id);
      await put('personal',{...current,...values,updatedAt:now(),syncState:'pending'});
      alert('Datos del colaborador actualizados.');
    }else{
      await put('personal',{...mark(),...values,documento:documentNumber});
      alert('Colaborador registrado.');
    }
    form.reset();
    form.elements.id.value='';
    document.querySelector('#personSaveBtn').textContent='Guardar colaborador';
    await refresh();
    window.skSyncApi?.schedule?.(300);
  },true);
})();
