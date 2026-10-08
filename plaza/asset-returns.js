// Devoluciones vinculadas al préstamo original; comparten la cola de entregas.
(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const norm = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const active = row => row && !row.deleted && !row.reversed && !row.reversado;
  const isReturn = row => row?.movementType === 'DEVOLUCIÓN';
  const returned = (data, loan) => (data.blendingDeliveries || []).find(row => active(row) && isReturn(row) && row.loanId === loan.id);
  function loanState(data, loan) {
    if (returned(data, loan)) return 'DEVUELTO';
    if (!loan.assetId) return 'PENDIENTE';
    const movements = (data.blendingDeliveries || []).filter(row => active(row) && row.assetId === loan.assetId);
    const asset = (data.assets || []).find(row => row.id === loan.assetId && !row.deleted);
    if (movements.at(-1)?.id !== loan.id || !asset || norm(asset.ubicacion) === 'bodega de superficie' || norm(asset.ubicacion) !== norm(loan.destination || 'Operación')) return 'REVISAR';
    return 'PENDIENTE';
  }
  function loans(data) {
    return (data.blendingDeliveries || []).filter(row => active(row) && !isReturn(row) && norm(row.deliveryType) === 'prestamo');
  }
  const localTime = date => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const personLabel = person => [person.documento, person.nombre].filter(Boolean).join(' · ');
  const dateLabel = value => value ? new Date(value).toLocaleString('es-CO') : 'No informada';
  let selectedId = '', saving = false, syncError = '';
  function setSyncError(message) {
    syncError = message || '';
    const node = $('#assetReturnSyncError');
    if (node) { node.textContent = syncError; node.hidden = !syncError; }
  }

  function createReturn(data, loanId, fields, user, now = new Date()) {
    const loan = loans(data).find(row => row.id === loanId);
    if (!loan || loanState(data, loan) !== 'PENDIENTE') throw new Error('Este préstamo ya no está pendiente. Revisa el historial y sincroniza.');
    const person = (data.personal || []).find(row => row.id === fields.returnedById && !row.deleted);
    if (!person) throw new Error('Busca y selecciona quién devuelve los elementos.');
    const quantity = Number(loan.quantity);
    if (!Number.isFinite(quantity) || !(quantity > 0)) throw new Error('El préstamo no tiene una cantidad válida.');
    const date = new Date(fields.returnedAt);
    if (!Number.isFinite(date.getTime()) || date.getTime() > now.getTime() + 300000 || date.getTime() < Math.floor(Date.parse(loan.createdAt) / 60000) * 60000) throw new Error('La fecha de devolución debe estar entre el préstamo y el momento actual.');
    // Dos dispositivos que devuelven el mismo préstamo envían la misma operación.
    const id = `loan-return-${loan.id}`;
    return {id, syncEventId:id, movementType:'DEVOLUCIÓN', loanId:loan.id,
      assetId:loan.assetId || '', assetLabel:loan.assetLabel || '', itemId:loan.itemId, itemName:loan.itemName || '',
      recipientId:loan.recipientId, quantity, unit:loan.unit || 'Unidad', destination:'Bodega de Superficie',
      returnedById:person.id, returnedByName:person.nombre || '', returnedByDocument:person.documento || '',
      returnedAt:date.toISOString(), notes:String(fields.notes || '').trim(),
      operatorId:user?.id || '', operatorDocument:user?.documento || '', operatorName:user?.nombre || '',
      createdAt:now.toISOString(), updatedAt:now.toISOString(), syncState:'pending'};
  }
  function refresh() {
    const host = $('#assetReturnList');
    if (!host || !window.SKPlaza) return;
    const data = window.SKPlaza.getData(), query = norm($('#assetReturnSearch').value), filter = $('#assetReturnFilter').value;
    const people = new Map((data.personal || []).map(person => [person.id, person]));
    const rows = loans(data).map(loan => ({loan, state:loanState(data, loan)})).filter(({loan, state}) => {
      const person = people.get(loan.recipientId), asset = (data.assets || []).find(row => row.id === loan.assetId);
      return (filter === 'TODOS' || state === filter) && (!query || norm([loan.itemName, loan.assetLabel, asset?.serial, asset?.marcaActual, asset?.marcaInterna, asset?.numeroClase, person?.nombre, person?.documento].join(' ')).includes(query));
    }).reverse();
    const count = loans(data).filter(loan => loanState(data, loan) === 'PENDIENTE').length;
    $('#assetReturnCount').textContent = `${count} ${count === 1 ? 'préstamo pendiente' : 'préstamos pendientes'} · Sin límite de fecha`;
    host.innerHTML = rows.map(({loan, state}) => {
      const person = people.get(loan.recipientId), back = returned(data, loan);
      return `<article class="assetReturnCard"><div><b>${esc(loan.assetLabel || loan.itemName || 'Elemento')}</b><span>Prestado a: ${esc(person?.nombre || loan.recipientName || 'No informado')}</span><span>Documento: ${esc(person?.documento || loan.recipientDocument || 'No informado')}</span><span>Préstamo: ${esc(dateLabel(loan.createdAt))}</span><span>Cantidad: ${esc(loan.quantity)} ${esc(loan.unit || 'Unidad')}</span><strong class="loanState">${state}</strong>${back ? `<span>Devolución: ${esc(dateLabel(back.returnedAt || back.createdAt))}</span><span>Devuelve: ${esc(back.returnedByName || back.returnedByDocument)}</span><span>Recibe: ${esc(back.operatorName || back.actorDocument || back.operatorDocument)}</span>${back.notes ? `<span>Observaciones: ${esc(back.notes)}</span>` : ''}<span>${back.syncState === 'pending' ? 'Pendiente de sincronizar' : 'Sincronizado'}</span>` : state === 'REVISAR' ? '<span>El activo tiene otro movimiento o ubicación. Sincroniza y revisa su historial.</span>' : ''}</div>${state === 'PENDIENTE' ? `<button type="button" data-return-loan="${esc(loan.id)}">RETORNAR ELEMENTOS</button>` : ''}</article>`;
    }).join('') || '<p class="permission">No hay préstamos que coincidan con esta búsqueda.</p>';
    if (selectedId) {
      const selected = loans(data).find(row => row.id === selectedId);
      if (!selected || loanState(data, selected) !== 'PENDIENTE') reset();
    }
  }
  function reset() {
    selectedId = '';
    $('#assetReturnForm')?.reset();
    if ($('#assetReturnForm')) $('#assetReturnForm').hidden = true;
  }
  function selectLoan(id) {
    const data = window.SKPlaza.getData(), loan = loans(data).find(row => row.id === id);
    if (!loan || loanState(data, loan) !== 'PENDIENTE') return refresh();
    selectedId = id;
    const form = $('#assetReturnForm'), people = (data.personal || []).filter(row => !row.deleted);
    form.reset(); form.hidden = false;
    $('#assetReturnSelected').textContent = `${loan.assetLabel || loan.itemName} · Cantidad a retornar: ${loan.quantity} ${loan.unit || 'Unidad'} (total del préstamo)`;
    $('#assetReturnPeople').innerHTML = people.map(person => `<option value="${esc(personLabel(person))}"></option>`).join('');
    const borrower = people.find(row => row.id === loan.recipientId);
    form.elements.returnedBy.value = borrower ? personLabel(borrower) : '';
    form.elements.returnedAt.value = localTime(new Date());
    form.scrollIntoView({behavior:'smooth', block:'start'});
  }
  function save(event) {
    event.preventDefault();
    if (saving) return;
    saving = true;
    const form = event.currentTarget, button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const app = window.SKPlaza, data = app.getData();
      const person = (data.personal || []).find(row => !row.deleted && personLabel(row) === form.elements.returnedBy.value.trim());
      const row = createReturn(data, selectedId, {returnedById:person?.id, returnedAt:form.elements.returnedAt.value, notes:form.elements.notes.value}, app.getUser());
      const next = JSON.parse(JSON.stringify(data));
      next.blendingDeliveries.push(row);
      if (row.assetId) {
        const asset = next.assets.find(asset => asset.id === row.assetId);
        asset.ubicacion = 'Bodega de Superficie'; asset.updatedAt = row.updatedAt; asset.syncState = 'pending';
      } else {
        const stocks = next.inventoryStock || (next.inventoryStock = []);
        let stock = stocks.find(entry => entry.itemId === row.itemId);
        if (!stock) { stock = {id:`stock-${row.itemId}`, itemId:row.itemId, quantity:0}; stocks.push(stock); }
        row.balanceBefore = Number(stock.quantity) || 0;
        row.balanceAfter = row.balanceBefore + row.quantity;
        stock.quantity = row.balanceAfter; stock.updatedAt = row.updatedAt;
      }
      app.saveData(next); // Persistir antes de cambiar la pantalla o liberar el activo.
      reset(); refresh(); app.refreshDelivery(); app.updatePendingBadge(); app.renderRecentQueries();
      alert('RETORNO REGISTRADO\n\nLos elementos volvieron a estar disponibles en bodega. El registro queda guardado en este dispositivo y pendiente de sincronización.');
      app.sync(true);
    } catch (error) { alert(error.message || 'No fue posible guardar la devolución.'); }
    finally { saving = false; button.disabled = false; }
  }
  function setup() {
    if (!window.SKPlaza || $('#assetReturns')) return;
    const section = document.createElement('section');
    section.id = 'assetReturns'; section.className = 'view recentMovements';
    section.innerHTML = `<h2>RETORNO DE ELEMENTOS</h2><p>Busca el préstamo y registra el regreso a bodega de la cantidad prestada.</p><div class="assetReturnFilters"><label>BUSCAR ELEMENTO O COLABORADOR<input id="assetReturnSearch" type="search" placeholder="Clase, marca, serial, nombre o documento…"></label><label>ESTADO<select id="assetReturnFilter"><option>PENDIENTE</option><option>DEVUELTO</option><option value="TODOS">TODOS</option></select></label></div><p id="assetReturnCount" class="permission" aria-live="polite"></p><form id="assetReturnForm" hidden><h3>REGISTRAR RETORNO</h3><b id="assetReturnSelected"></b><label>QUIÉN DEVUELVE<input name="returnedBy" type="search" list="assetReturnPeople" autocomplete="off" required placeholder="Buscar nombre o documento…"></label><datalist id="assetReturnPeople"></datalist><label>FECHA Y HORA DE DEVOLUCIÓN<input name="returnedAt" type="datetime-local" required></label><label>OBSERVACIONES<textarea name="notes"></textarea></label><div class="deliveryFormActions"><button type="submit">REGISTRAR RETORNO</button><button type="button" id="cancelAssetReturn">CANCELAR</button></div></form><div id="assetReturnList" class="recentMovementList"></div>`;
    $('#contacts').after(section);
    $('#assetReturnSearch').addEventListener('input', refresh);
    $('#assetReturnFilter').addEventListener('change', refresh);
    $('#assetReturnList').addEventListener('click', event => {
      const button = event.target.closest('[data-return-loan]');
      if (button) selectLoan(button.dataset.returnLoan);
    });
    $('#cancelAssetReturn').addEventListener('click', reset);
    $('#assetReturnForm').addEventListener('submit', save);
    const error = document.createElement('p');
    error.id = 'assetReturnSyncError'; error.setAttribute('role', 'status'); error.hidden = true;
    $('#assetReturnCount').after(error);
    setSyncError(syncError);
    window.addEventListener('skplaza-synced', () => { setSyncError(''); refresh(); });
    refresh();
  }
  window.SKPlazaReturns = {isReturn, returned, loans, loanState, createReturn, refresh, reset, setSyncError, hasUnsaved:() => Boolean(selectedId)};
  window.addEventListener('load', setup);
})();
