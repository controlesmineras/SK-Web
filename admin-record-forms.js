// Los valores automáticos de fecha, turno o cantidad no constituyen un registro.
(() => {
  const hasEntry = {
    personalForm: f => f.documento.value.trim(),
    assetForm: f => f.clase.value.trim(),
    noveltyForm: f => f.assetId.value,
    consumptionForm: f => f.partId.value || document.querySelector('#consumptionDraft li'),
    incomeForm: f => f.partId.value,
    inventoryItemForm: f => f.isYtSpare.checked ? f.spareItemName.value.trim() : f.name.value.trim(),
    actaForm: f => f.id.value || f.noElaborada.checked || f.asunto.value.trim() || f.motivo.value,
    adminUserForm: f => f.personId.value,
    plazaAccessForm: f => f.id.value
  };
  function update(form) {
    const button = form.querySelector('button[type="submit"],button:not([type])');
    if (!button) return;
    const empty = !hasEntry[form.getAttribute('id')](form.elements);
    if (button.inert !== empty) button.inert = empty;
    if (empty) button.setAttribute('aria-disabled','true');
    else button.removeAttribute('aria-disabled');
  }
  const observed = new WeakSet();
  function bind() {
    for (const id of Object.keys(hasEntry)) {
      const form = document.getElementById(id);
      if (!form) continue;
      if (observed.has(form)) {
        update(form);
        continue;
      }
      observed.add(form);
      const refresh = () => update(form);
      form.addEventListener('input',refresh);
      form.addEventListener('change',refresh);
      form.addEventListener('reset',() => queueMicrotask(refresh));
      new MutationObserver(refresh).observe(form,{
        childList:true, subtree:true, attributes:true, attributeFilter:['value','selected','checked']
      });
      refresh();
    }
  }
  document.addEventListener('DOMContentLoaded',bind);
  document.addEventListener('focusin',bind);
  document.addEventListener('click',() => requestAnimationFrame(bind));
  document.addEventListener('submit',event => {
    const form = event.target;
    const entry = hasEntry[form.getAttribute('id')];
    if (entry && (form.inert || !entry(form.elements))) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  },true);
})();
