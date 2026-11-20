// Selección de personal en la ficha de activos, desde el directorio local de Admin.
(()=>{
  'use strict';
  const form = document.querySelector('#assetForm');
  const fields = form.elements;
  const normalize = value => String(value ?? '').trim().toLocaleLowerCase('es')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
  const fullName = person => person?.nombre ||
    [person?.primerNombre, person?.segundoNombre, person?.primerApellido, person?.segundoApellido].filter(Boolean).join(' ');
  const documentOf = person => String(person?.documento || person?.document || '');

  let people = [], readVersion = 0, openPicker = null;
  async function refreshPeople() {
    if (typeof db === 'undefined' || !db) return;
    const version = ++readVersion;
    try {
      const rows = await all('personal');
      if (version !== readVersion) return;
      people = rows.filter(row => !row.deleted && row.active !== false).map(row => ({
        id: row.id, nombre: fullName(row), documento: documentOf(row), area: row.area, cargo: row.cargo
      })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', {sensitivity:'base'}));
      openPicker?.draw(true);
    } catch (error) {
      if (version === readVersion && !people.length) openPicker?.message('No se pudo leer el personal de este dispositivo.');
      console.error(error);
    }
  }

  function picker(inputId, savedFields, eligible = () => true) {
    const input = document.getElementById(inputId);
    const host = input.closest('.assetPersonField');
    const clear = host.querySelector('.assetPersonClear');
    const list = host.querySelector('[role="listbox"]');
    list.id = inputId + 'Results';
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-controls', list.id);
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    let matches = [], active = -1;

    function close() {
      if (openPicker === api) openPicker = null;
      list.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      active = -1;
    }
    function set(person) {
      for (const [key, field] of Object.entries(savedFields)) field.value = person?.[key] ?? '';
      input.value = person ? (person.nombre || person.documento || 'Colaborador histórico') : '';
      input.readOnly = Boolean(person);
      clear.hidden = !person;
      input.setCustomValidity('');
      close();
    }
    function choose(person) {
      if (input.disabled || form.dataset.assetLoading) return;
      set(person);
      input.dispatchEvent(new Event('change', {bubbles:true}));
    }
    function message(text) {
      const note = document.createElement('div');
      note.className = 'noSuggestion';
      note.textContent = text;
      list.replaceChildren(note);
    }
    function highlight(index) {
      list.children[active]?.removeAttribute('aria-selected');
      active = index;
      const option = list.children[active];
      if (option) {
        option.setAttribute('aria-selected', 'true');
        input.setAttribute('aria-activedescendant', option.id);
      } else {
        input.removeAttribute('aria-activedescendant');
      }
    }
    function draw(keepHighlight = false) {
      const previous = keepHighlight ? matches[active] : null;
      const query = normalize(input.value);
      matches = people.filter(person => eligible(person) && normalize(person.nombre + ' ' + person.documento).includes(query)).slice(0, 60);
      list.replaceChildren();
      if (!matches.length) message('Sin coincidencias');
      matches.forEach((person, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.tabIndex = -1;
        button.id = list.id + '-' + index;
        button.setAttribute('role', 'option');
        const name = document.createElement('b'), doc = document.createElement('span');
        name.textContent = person.nombre || 'Sin nombre';
        doc.textContent = person.documento;
        button.append(name, doc);
        button.addEventListener('click', () => choose(person));
        list.append(button);
      });
      highlight(previous ? matches.findIndex(person => person.id === previous.id && person.documento === previous.documento) : -1);
    }
    function open() {
      if (input.readOnly || input.disabled || openPicker === api) return;
      openPicker?.close();
      openPicker = api;
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      draw();
      refreshPeople();
    }
    const api = {close, draw, message, set};
    input.addEventListener('focus', open);
    input.addEventListener('click', open);
    input.addEventListener('input', () => {
      input.setCustomValidity(input.value ? 'Selecciona una persona de la lista o borra la búsqueda.' : '');
      open();
      draw();
    });
    input.addEventListener('keydown', event => {
      if (input.readOnly || input.disabled) return;
      if (event.key === 'Escape') { close(); return; }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        open();
        if (!matches.length) return;
        const next = event.key === 'ArrowDown' ? Math.min(active + 1, matches.length - 1) : Math.max(0, active - 1);
        highlight(next);
        list.children[next].scrollIntoView({block:'nearest'});
      } else if (event.key === 'Enter' && !list.hidden) {
        event.preventDefault();
        const person = matches[active] || (input.value && matches.length === 1 && matches[0]);
        if (person) choose(person);
      }
    });
    input.addEventListener('blur', close);
    list.addEventListener('pointerdown', event => event.preventDefault());
    document.addEventListener('pointerdown', event => { if (!host.contains(event.target)) close(); });
    clear.addEventListener('click', () => {
      choose(null);
      input.focus();
    });
    form.addEventListener('reset', () => set(null));
    return api;
  }

  const responsible = picker('assetResponsibleSearch', {nombre: fields.nombreResponsable, documento: fields.documentoResponsable});
  const warehouse = picker('assetWarehouseSearch', {nombre: fields.nombreBodeguero, documento: fields.documentoBodeguero});
  const assigned = picker('assetAssignedSearch', {
    id: fields.asignadaId, documento: fields.assetAssignedDoc, area: fields.assetAssignedArea, cargo: fields.assetAssignedCargo
  }, person => !!person.id);

  function snapshot(nombre, documento) {
    return nombre || documento ? {nombre, documento} : null;
  }
  function restore(asset, historical, personal) {
    responsible.set(snapshot(asset.nombreResponsable, asset.documentoResponsable));
    warehouse.set(snapshot(asset.nombreBodeguero, asset.documentoBodeguero));
    const person = personal.find(row => row.id === asset.asignadaId);
    assigned.set(asset.asignadaId || historical?.name || historical?.document ? {
      id: asset.asignadaId, nombre: historical?.name || fullName(person),
      documento: historical?.document ?? documentOf(person), area: historical?.area ?? person?.area,
      cargo: historical?.cargo ?? person?.cargo
    } : null);
  }
  window.SKAssetPeople = {restore};
  window.addEventListener('skweb-db-ready', refreshPeople);
  window.addEventListener('skweb-synced', refreshPeople);
  refreshPeople();
})();
