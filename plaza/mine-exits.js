// Salidas de activos a otra mina. La ficha y su movimiento se guardan juntos.
(() => {
  const normalize = value => String(value || '').trim().normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  function owner(asset) {
    const mine = String(asset?.mina || '').trim();
    return ['sin registrar', 'sin asignar'].includes(normalize(mine)) ? '' : mine;
  }
  const mineKey = value => normalize(value).replace(/[.\s-]/g, '');
  const eligible = asset => asset && !asset.deleted && !/auto[\s-]*r{1,2}escatador/.test(normalize(asset.clase)) &&
    !/dad[oa](?:\/a)? de baja|retirad[oa]|desechad[oa]/.test(normalize([asset.estado, asset.ubicacion].join(' ')));
  function destinations(data) {
    const config = (data.inventoryCriteria || []).find(row => row.id === 'SYSTEM-FORM-OPTIONS-V1' || row.recordType === 'formOptions');
    const options = config?.options?.['asset.owner'] || ['Sandra K', 'Providencia', 'El Silencio', 'Carla', 'Alianza'];
    return [...new Set(options.filter(value => value && !['sandrak', 'segovia', 'asegovia'].includes(mineKey(value)))), 'Segovia'];
  }
  function mount(api) {
    const form = document.querySelector('#mineExitForm'), fields = form.elements;
    const results = document.querySelector('#mineAssetResults'), status = document.querySelector('#mineAssetStatus');
    const choices = document.querySelector('#mineDestinationChoices');
    const dialog = document.querySelector('#mineMismatch'), details = document.querySelector('#mineExitFields');
    const submit = form.querySelector('[type=submit]');
    let selectedId = '', saving = false;
    const selectedDestination = () => choices.querySelector('input:checked')?.value || '';
    const assetById = id => (api.getData().assets || []).find(row => row.id === id);
    const carrier = () => (api.getData().personal || []).find(person =>
      person.id && person.id === fields.carrierId.value && !person.deleted && person.active !== false);
    const available = asset => eligible(asset) && Boolean(owner(asset)) && api.assetAvailableForDelivery(asset);
    function showNotice(title, message) {
      dialog.querySelector('h3').textContent = title;
      document.querySelector('#mineMismatchText').textContent = message;
      if (!dialog.open) dialog.showModal();
    }
    function explainBlocked(asset) {
      selectedId = ''; submit.disabled = true;
      const reasons = [];
      if (eligible(asset)) {
        if (!api.assetAvailableForDelivery(asset)) {
          const {asset: current, events} = window.SKAssetHistory.project(asset, api.getData());
          const hadEntry = events.some(e => (e.kind === 'income' || e.kind === 'return') &&
            !e.reversed && !e.raw.reversalOf && normalize(e.raw.movementType) !== 'reversion');
          if (!eligible(current)) reasons.push('Este activo ya no está habilitado para salidas fuera de mina.');
          else if (!hadEntry) reasons.push('No puedes darle salida porque no tiene un ingreso. Debes darle ingreso primero a Plaza Blending.');
          else reasons.push('El activo está fuera de Plaza Blending.' +
            (current.ubicacion ? ' Ubicación registrada: ' + current.ubicacion + '.' : '') +
            ' Debes darle ingreso primero a Plaza Blending.');
        }
        if (!owner(asset)) reasons.push('El activo no tiene mina propietaria. Comunícate con el administrador.');
      } else reasons.push('Este activo ya no está disponible para registrar una salida.');
      const message = reasons.join('\n\n');
      status.textContent = message;
      showNotice('Salida no disponible', message);
    }
    function draw() {
      const query = window.SKAssetSearch.query(fields.assetSearch.value), data = api.getData();
      const hits = query.rows((data.assets || []).filter(eligible), asset => [api.assetLabel(asset), api.assetSelectionLabel(asset)]);
      results.innerHTML = hits.map(({asset, lines, detail}) => {
        const ok = available(asset);
        const message = ok ? (window.SKAssetHistory.damaged(asset) ? 'Disponible para salida · ' + asset.estado : 'Disponible para entrega') : 'Salida bloqueada · Ver motivo';
        return '<button type="button" data-asset="' + api.esc(asset.id) + '"' + (ok ? '' : ' aria-haspopup="dialog"') + '><strong>' +
          query.html(lines[0]) + '</strong><span>' + query.html(lines[1]) + '</span>' + (detail ? '<small>' + query.html(detail) + '</small>' : '') +
          '<small>' + api.esc(message) + '</small></button>';
      }).join('') || '<p>Sin coincidencias.</p>';
      results.hidden = false;
    }
    function clearAsset() {
      selectedId = ''; fields.assetSearch.value = ''; status.textContent = ''; results.hidden = true;
      submit.disabled = true;
    }
    function validateReturn(showAlert = true) {
      const asset = assetById(selectedId), mine = selectedDestination();
      if (asset && !available(asset)) {explainBlocked(asset); return false;}
      const mismatch = fields.operation.value === 'RETORNO' && asset && mine && mineKey(owner(asset)) !== mineKey(mine);
      submit.disabled = saving || !asset || !carrier() || !fields.operation.value || Boolean(mismatch);
      if (!asset) return true;
      if (mismatch) {
        const message = 'El activo pertenece a ' + owner(asset) + '. No se puede registrar su retorno a ' + mine + '.';
        status.textContent = message;
        if (showAlert) showNotice('Retorno a la mina propietaria', message);
        return false;
      }
      status.textContent = 'Mina propietaria: ' + (owner(asset) || 'Sin registrar') + ' · ' + (asset.estado || 'En bodega');
      return true;
    }
    const operationGroup = form.querySelector('.mineOperationGroup');
    const repairOperation = 'SALIDA A REPARACIÓN';
    function operationAllowed(mine, operation) {
      return mine === 'Segovia' ? operation === repairOperation : operation !== repairOperation;
    }
    function updateOperations() {
      const mine = selectedDestination(), repairOnly = mine === 'Segovia';
      operationGroup.classList.toggle('repairOnly', repairOnly);
      for (const radio of fields.operation) {
        radio.disabled = !operationAllowed(mine, radio.value);
        if (radio.disabled) radio.checked = false;
        else if (repairOnly) radio.checked = true;
      }
    }
    function reset() {
      form.reset(); api.resetMovementTime(form); clearAsset(); details.hidden = true;
      choices.replaceChildren(...destinations(api.getData()).map(destination => {
        const label = document.createElement('label'), radio = document.createElement('input'), caption = document.createElement('span');
        radio.type = 'radio'; radio.name = 'destinationMine'; radio.value = destination; radio.required = true;
        caption.textContent = destination === 'Segovia' ? 'A SEGOVIA' : destination.toLocaleUpperCase('es');
        label.append(radio, caption);
        return label;
      }));
      updateOperations();
      form.querySelectorAll('[data-exit-help]').forEach(button => {
        button.setAttribute('aria-expanded','false'); document.getElementById(button.dataset.exitHelp).hidden = true;
      });
    }
    choices.addEventListener('change', () => {
      updateOperations();
      details.hidden = !selectedDestination();
      if (details.hidden) {clearAsset(); return;}
      validateReturn();
    });
    for (const radio of fields.operation) radio.addEventListener('change', () => validateReturn());
    fields.carrierId.addEventListener('change', () => validateReturn(false));
    fields.assetSearch.addEventListener('focus', () => { if (!selectedId) draw(); });
    fields.assetSearch.addEventListener('input', () => {selectedId = ''; status.textContent = ''; submit.disabled = true; draw();});
    fields.assetSearch.addEventListener('keydown', event => {
      if (event.key === 'Escape') results.hidden = true;
      if (event.key === 'Enter' && !results.hidden) {event.preventDefault(); results.querySelector('button:not(:disabled)')?.focus();}
    });
    results.addEventListener('click', event => {
      const button = event.target.closest('[data-asset]');
      if (!button || saving) return;
      const asset = assetById(button.dataset.asset);
      if (!available(asset)) {explainBlocked(asset); return;}
      selectedId = asset.id; fields.assetSearch.value = api.assetLabel(asset);
      results.hidden = true; validateReturn();
    });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (saving) return;
      const data = api.getData(), asset = assetById(selectedId), mine = selectedDestination(), operation = fields.operation.value;
      if (selectedId && !available(asset)) {explainBlocked(asset); return;}
      if (!asset) {submit.disabled = true; status.textContent = 'Busca y selecciona un activo disponible en Plaza Blending.'; return;}
      if (!destinations(data).includes(mine) || !operation) return;
      if (!operationAllowed(mine, operation)) {
        updateOperations();
        status.textContent = 'La salida a reparación es exclusiva de Segovia.';
        return;
      }
      if (!validateReturn()) return;
      const responsible = carrier();
      if (!responsible) {
        fields.carrierId.value = ''; status.textContent = 'Busca y selecciona en Personal a quien transporta el activo.';
        fields.carrierSearch.focus(); return;
      }
      saving = true; submit.disabled = true;
      try {
        const shift = api.movementShift(), next = structuredClone(data), target = next.assets.find(row => row.id === selectedId);
        const criterion = (data.inventoryCriteria || []).find(row => !row.deleted && api.isFixedItem(row) && normalize(api.itemName(row)) === normalize(asset.clase));
        const id = api.uuid(), times = api.movementTimes(form), user = api.getUser(), destination = mine === 'Segovia' ? mine : 'Mina ' + mine;
        const row = {id, syncEventId:id, exitKind:'mine', destinationMine:mine, deliveryType:operation, destination,
          ownerMineBefore:owner(asset), recipientId:responsible.id, ...api.recipientSnapshot(responsible.id), recipientCompany:responsible.empresa || '',
          itemId:asset.criteriaId || criterion?.id || asset.id, itemName:asset.clase, assetId:asset.id, assetLabel:api.assetLabel(asset),
          quantity:1, unit:'Unidad', notes:fields.notes.value.trim(), ...shift, operatorId:user.id,
          operatorName:user.nombre, operatorDocument:user.documento, ...times, syncState:'pending'};
        if (operation === 'TRASLADO' && mine !== 'Segovia') {target.mina = mine; target.activoExterno = true;}
        if (operation === 'SALIDA A REPARACIÓN') target.estado = 'En reparación';
        target.ingresoTemporal = false; target.ubicacion = destination; target.asignadaId = ''; target.areaAsignada = '';
        target.updatedAt = times.recordedAt; target.syncState = 'pending';
        (next.blendingDeliveries ||= []).push(row);
        await api.saveData(next); reset(); api.updatePendingBadge(); api.renderRecentQueries(); window.SKPlazaReturns?.refresh();
        alert(operation + ' · ' + mine + '\n\nSalida registrada en este dispositivo y pendiente de sincronización.');
        void api.sync(true);
      } catch (error) {alert(error.message || 'No fue posible registrar la salida.');}
      finally {saving = false; validateReturn(false);}
    });
    return {reset, dirty:() => Boolean(selectedDestination()), saving:() => saving};
  }
  window.SKPlazaMineExits = {mount};
})();
