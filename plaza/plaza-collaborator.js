(()=>{
  'use strict';
  const $=s=>document.querySelector(s),dialog=$('#collaboratorDialog'),form=$('#plazaCollaboratorForm'),search=$('#recipientSearch'),recipientId=$('#recipientId');
  const people=()=>window.SKPlaza?.getData()?.personal||[];
  const label=p=>`${p.documento||''} - ${p.nombre||''}`;
  function renderRecipients(){const rows=people().filter(p=>!p.deleted);$('#recipientOptions').innerHTML=rows.map(p=>`<option value="${label(p).replace(/"/g,'&quot;')}"></option>`).join('');const selected=rows.find(p=>p.id===recipientId.value);if(selected)search.value=label(selected)}
  function resolveRecipient(){const value=search.value.trim().toLowerCase(),person=people().find(p=>!p.deleted&&label(p).toLowerCase()===value);recipientId.value=person?.id||'';return person}
  function close(){dialog.hidden=true;form.reset()}
  search.addEventListener('input',resolveRecipient);
  search.addEventListener('change',resolveRecipient);
  $('#newRecipientBtn').addEventListener('click',()=>{const typed=search.value.trim();form.reset();if(/^\d+$/.test(typed))form.elements.documento.value=typed;dialog.hidden=false;form.elements.documento.focus()});
  $('#closeCollaboratorBtn').addEventListener('click',close);
  dialog.addEventListener('click',e=>{if(e.target===dialog)close()});
  form.addEventListener('submit',async e=>{e.preventDefault();const collaborator=Object.fromEntries(new FormData(form)),button=form.querySelector('button[type="submit"],button:not([type])');let updated=false;try{button.disabled=true;button.textContent='GUARDANDO…';let result=await window.SKPlaza.post({action:'plazaCollaborator',token:sessionStorage.getItem('skPlazaToken'),collaborator});if(result.exists){if(!confirm('Funcionario ya existe. ¿Deseas actualizar sus datos?'))return;updated=true;result=await window.SKPlaza.post({action:'plazaCollaborator',token:sessionStorage.getItem('skPlazaToken'),collaborator,update:true})}const data=window.SKPlaza.getData(),rows=data.personal||(data.personal=[]),index=rows.findIndex(p=>p.id===result.user.id||String(p.documento||'').trim()===result.user.documento);if(index>=0)rows[index]={...rows[index],...result.user};else rows.push(result.user);window.SKPlaza.saveData(data);renderRecipients();recipientId.value=result.user.id;search.value=label(result.user);close();alert(updated?'Datos del colaborador actualizados.':'Colaborador registrado.')}catch(error){alert(error.message)}finally{button.disabled=false;button.textContent='GUARDAR COLABORADOR'}});
  window.SKPlaza.renderRecipients=renderRecipients;
  renderRecipients();
})();
