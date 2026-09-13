// Impide colaboradores duplicados por documento y permite actualizar el existente.
(()=>{
  'use strict';
  const form=document.querySelector('#personalForm');
  if(!form)return;
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    event.stopImmediatePropagation();
    const values=Object.fromEntries(new FormData(form).entries());
    const areas=['Seguridad física','Desmin - Obras civiles','Producción','Administrativa'];
    if(!areas.includes(values.area))return alert('Selecciona un área de la lista');
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
