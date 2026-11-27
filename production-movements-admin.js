(() => {
  'use strict';
  const list = document.querySelector('#productionMovementResults');
  const form = document.querySelector('#productionMovementDates');
  const dayValue = date => [date.getFullYear(), date.getMonth()+1, date.getDate()]
    .map(value => String(value).padStart(2,'0')).join('-');
  const generations = new WeakMap();

  function movementCard(row) {
    const card = document.createElement('div');
    card.className = 'row';
    const body = document.createElement('div');
    const title = document.createElement('b');
    title.textContent = [row.type,row.item].filter(Boolean).join(' · ');
    body.append(title);
    for (const line of [
      [row.date,row.quantity == null?'':String(row.quantity)+' '+row.unit].filter(Boolean).join(' · '),
      row.assetLabel,
      row.destination && 'Destino: '+row.destination,
      row.person && (row.type==='Consumo'?'Mecánico: ':row.type==='Devolución'?'Devuelve: ':'Recibe: ')+row.person,
      row.operator && 'Registrado por: '+row.operator
    ].filter(Boolean)) {
      const detail = document.createElement('small');
      detail.textContent = line;
      body.append(detail);
    }
    card.append(body);
    return card;
  }

  function read(host,filters) {
    const generation = Symbol();
    generations.set(host,generation);
    host.replaceChildren();
    const status = document.createElement('p');
    status.setAttribute('role','status');
    const rows = document.createElement('div');
    const more = document.createElement('button');
    more.type = 'button';
    more.hidden = true;
    more.textContent = 'Ver más movimientos';
    host.append(status,rows,more);
    let offset = 0;

    async function load() {
      more.disabled = true;
      status.textContent = 'Consultando movimientos confirmados…';
      try {
        const result = await window.SKAdminAuth.request('adminProductionMovements',{...filters,offset});
        if (generations.get(host)!==generation || !host.isConnected) return;
        rows.append(...result.rows.map(movementCard));
        offset += result.rows.length;
        status.textContent = offset ? offset+' movimientos confirmados' : 'No hay movimientos confirmados en esta consulta.';
        more.hidden = !result.more;
        more.textContent = 'Ver más movimientos';
      } catch (error) {
        if (generations.get(host)!==generation || !host.isConnected) return;
        status.textContent = error.message==='Solicitud no válida'
          ? 'La consulta requiere actualizar el servicio central.'
          : error.message || 'No se pudo consultar Producción.';
        more.hidden = false;
        more.textContent = 'Reintentar';
      } finally {
        more.disabled = false;
      }
    }
    more.addEventListener('click',load);
    void load();
  }

  function submit() {
    read(list,{from:form.elements.from.value,to:form.elements.to.value});
  }
  form.addEventListener('submit',event=>{event.preventDefault();submit()});
  window.SKProductionMovements = {
    open() {
      if (!form.elements.from.value) {
        const today = new Date(), first = new Date(today);
        first.setDate(today.getDate()-29);
        form.elements.from.value = dayValue(first);
        form.elements.to.value = dayValue(today);
      }
      submit();
    },
    forAsset(host,id) { read(host,{assetId:id}); }
  };
})();
