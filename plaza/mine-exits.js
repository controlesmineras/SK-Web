// Salidas de activos a otra mina. La ficha y su movimiento se guardan juntos.
(() => {
  const normalize = value => String(value || '').trim().normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const owner = asset => String(asset.mina || asset.minaOrigen || '').trim();
  const mineKey = value => normalize(value).replace(/[.\s-]/g, '');
  const eligible = asset => asset && !asset.deleted && !/auto[\s-]*r{1,2}escatador/.test(normalize(asset.clase)) &&
    !/dad[oa](?:\/a)? de baja|retirad[oa]|desechad[oa]/.test(normalize([asset.estado, asset.ubicacion].join(' ')));
  function mines(data) {
    const config = (data.inventoryCriteria || []).find(row => row.id === 'SYSTEM-FORM-OPTIONS-V1' || row.recordType === 'formOptions');
    const options = config?.options?.['asset.owner'] || ['Sandra K', 'Providencia', 'El Silencio', 'Carla', 'Alianza'];
    return options.filter(value => value && mineKey(value) !== 'sandrak');
  }
  function mount(api) {
    const form = document.querySelector('#mineExitForm'), fields = form.elements;
    const results = document.querySelector('#mineAssetResults'), status = document.querySelector('#mineAssetStatus');
    const dialog = document.querySelector('#mineMismatch'), details = document.querySelector('#mineExitFields');
    let selectedId = '', confirmation = '', saving = false;
    const assetById = id => (api.getData().assets || []).find(row => row.id === id);
    const signature = (asset, mine) => JSON.stringify([asset.id, owner(asset), mine]);
    const available = asset => eligible(asset) && api.assetAvailableForDelivery(asset);
    function draw() {
      const query = window.SKAssetSearch.query(fields.assetSearch.value), data = api.getData();
      const hits = query.rows((data.assets || []).filter(eligible), asset => [api.assetLabel(asset), api.assetSelectionLabel(asset)]);
      results.innerHTML = hits.map(({asset, lines, detail}) => {
        const ok = available(asset);
        const message = ok ? (window.SKAssetHistory.damaged(asset) ? 'Disponible para salida · ' + asset.estado : 'Disponible para entrega') : 'No se le ha dado ingreso a Plaza Blending.';
        return '<button type="button" data-asset="' + api.esc(asset.id) + '"' + (ok ? '' : ' disabled') + '><strong>' +
          query.html(lines[0]) + '</strong><span>' + query.html(lines[1]) + '</span>' + (detail ? '<small>' + query.html(detail) + '</small>' : '') +
          '<small>' + api.esc(message) + '</small></button>';
      }).join('') || '<p>Sin coincidencias.</p>';
      results.hidden = false;
    }
    function clearAsset() {
      selectedId = ''; confirmation = ''; fields.assetSearch.value = ''; status.textContent = ''; results.hidden = true;
    }
    function confirmOwner() {
      const asset = assetById(selectedId), mine = fields.destinationMine.value;
      if (!asset || !mine) return false;
      if (mineKey(owner(asset)) === mineKey(mine) || confirmation === signature(asset, mine)) return true;
      document.querySelector('#mineMismatchText').textContent = 'Mina propietaria: ' + (owner(asset) || 'Sin registrar') + '. Mina de destino: ' + mine + '.';
      dialog.returnValue = ''; dialog.showModal(); return false;
    }
    dialog.addEventListener('close', () => {
      const asset = assetById(selectedId);
      if (dialog.returnValue === 'yes' && asset && dialog.dataset.pending === signature(asset, fields.destinationMine.value)) confirmation = dialog.dataset.pending;
      else clearAsset();
    });
    function checkOwner() {
      const asset = assetById(selectedId);
      if (asset) dialog.dataset.pending = signature(asset, fields.destinationMine.value);
      return confirmOwner();
    }
    function reset() {
      form.reset(); clearAsset(); details.hidden = true;
      fields.destinationMine.replaceChildren(new Option('Seleccionar…', ''), ...mines(api.getData()).map(mine => new Option(mine, mine)));
      form.querySelectorAll('[data-exit-help]').forEach(button => {
        button.setAttribute('aria-expanded','false'); document.getElementById(button.dataset.exitHelp).hidden = true;
      });
    }
    fields.destinationMine.addEventListener('change', () => {
      confirmation = ''; details.hidden = !fields.destinationMine.value;
      if (details.hidden) {clearAsset(); return;}
      checkOwner();
    });
    fields.assetSearch.addEventListener('focus', () => { if (!selectedId) draw(); });
    fields.assetSearch.addEventListener('input', () => {selectedId = ''; confirmation = ''; status.textContent = ''; draw();});
    fields.assetSearch.addEventListener('keydown', event => {
      if (event.key === 'Escape') results.hidden = true;
      if (event.key === 'Enter' && !results.hidden) {event.preventDefault(); results.querySelector('button:not(:disabled)')?.focus();}
    });
    results.addEventListener('click', event => {
      const button = event.target.closest('[data-asset]'), asset = assetById(button?.dataset.asset);
      if (!available(asset)) return;
      selectedId = asset.id; confirmation = ''; fields.assetSearch.value = api.assetLabel(asset);
      status.textContent = 'Mina propietaria: ' + (owner(asset) || 'Sin registrar') + ' · ' + (asset.estado || 'En bodega');
      results.hidden = true; checkOwner();
    });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (saving) return;
      const data = api.getData(), asset = assetById(selectedId), mine = fields.destinationMine.value, operation = fields.operation.value;
      if (!available(asset)) {clearAsset(); status.textContent = 'Busca y selecciona un activo disponible en Plaza Blending.'; return;}
      if (!mines(data).includes(mine) || !operation || !checkOwner()) return;
      const submit = form.querySelector('[type=submit]'); saving = true; submit.disabled = true;
      try {
        const shift = api.movementShift(), next = structuredClone(data), target = next.assets.find(row => row.id === selectedId);
        const criterion = (data.inventoryCriteria || []).find(row => !row.deleted && api.isFixedItem(row) && normalize(api.itemName(row)) === normalize(asset.clase));
        const id = api.uuid(), time = new Date().toISOString(), user = api.getUser(), destination = 'Mina ' + mine;
        const row = {id, syncEventId:id, exitKind:'mine', destinationMine:mine, deliveryType:operation, destination,
          ownerMineBefore:owner(asset), ownerMismatchConfirmed:confirmation === signature(asset, mine),
          itemId:asset.criteriaId || criterion?.id || asset.id, itemName:asset.clase, assetId:asset.id, assetLabel:api.assetLabel(asset),
          quantity:1, unit:'Unidad', notes:fields.notes.value.trim(), ...shift, operatorId:user.id,
          operatorName:user.nombre, operatorDocument:user.documento, createdAt:time, updatedAt:time, syncState:'pending'};
        if (operation === 'TRASLADO') {target.mina = mine; target.activoExterno = true;}
        if (operation === 'SALIDA A REPARACIÓN') target.estado = 'En reparación';
        target.ingresoTemporal = false; target.ubicacion = destination; target.asignadaId = ''; target.areaAsignada = '';
        target.updatedAt = time; target.syncState = 'pending';
        (next.blendingDeliveries ||= []).push(row);
        await api.saveData(next); reset(); api.updatePendingBadge(); api.renderRecentQueries(); window.SKPlazaReturns?.refresh();
        alert(operation + ' · ' + mine + '\n\nSalida registrada en este dispositivo y pendiente de sincronización.');
        void api.sync(true);
      } catch (error) {alert(error.message || 'No fue posible registrar la salida.');}
      finally {saving = false; submit.disabled = false;}
    });
    return {reset, dirty:() => Boolean(fields.destinationMine.value), saving:() => saving};
  }
  window.SKPlazaMineExits = {mount};
})();
