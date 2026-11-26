(() => {
  'use strict';
  const section = document.getElementById('assetOverview');
  const filter = section.querySelector('select');
  const count = section.querySelector('[role="status"]');
  const download = section.querySelector('button');
  const table = section.querySelector('.assetOverviewTable');
  const body = table.querySelector('tbody');
  const headers = Array.from(table.querySelectorAll('th'), th => th.textContent);
  const collator = new Intl.Collator('es', {numeric: true, sensitivity: 'base'});
  const clean = value => {
    const text = String(value ?? '').trim();
    return /^no aplica$/i.test(text) ? '' : text;
  };
  let rows = [], visible = [], revision = 0;

  function describe(asset) {
    const fields = window.SKAssetFields.canonical(asset);
    const clase = clean(asset.clase).replace(/\s+/g, ' ');
    const key = 'clase:' + clase.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const equipment = /^(?:yt|columnas?)(?:\b|\d)/i.test(clase);
    const currentMark = clean(fields.marcaActual), newMark = clean(asset.nuevaMarca);
    const cells = [clase, clean(asset.modelo), clean(fields.numeroClase) || clean(asset.orden),
      clean(asset.serial) || window.SKAssetRules.serialStatusLabel(asset),
      equipment ? currentMark || newMark : newMark || currentMark];
    return {key, cells};
  }

  function draw() {
    visible = filter.value ? rows.filter(row => row.key === filter.value) : rows;
    const fragment = document.createDocumentFragment();
    for (const {cells} of visible) {
      const tr = document.createElement('tr');
      for (const value of cells) tr.insertCell().textContent = value || '—';
      fragment.append(tr);
    }
    body.replaceChildren(fragment);
    table.hidden = !visible.length;
    download.disabled = !visible.length;
    const total = document.createElement('strong');
    total.textContent = visible.length.toLocaleString('es-CO');
    count.replaceChildren(total, visible.length === 1 ? ' activo registrado' : ' activos registrados');
  }

  async function render() {
    if (!window.SKAdminAuth.canView('assetOverview')) return;
    const version = ++revision;
    if (typeof db === 'undefined' || !db) return;
    try {
      const assets = await all('assets');
      if (version !== revision) return;
      rows = assets.filter(asset => !asset.deleted).map(describe).sort((a,b) =>
        collator.compare(a.cells[0], b.cells[0]) || collator.compare(a.cells[2], b.cells[2]) ||
        collator.compare(a.cells[1], b.cells[1]) || collator.compare(a.cells[3], b.cells[3]));
      const selected = filter.value;
      const classes = new Map();
      for (const {key, cells} of rows) {
        if (!classes.has(key)) classes.set(key, {name: cells[0] || 'Sin clase', count: 0});
        classes.get(key).count++;
      }
      filter.replaceChildren(new Option('Todas las clases', ''));
      for (const [key, group] of classes) filter.add(new Option(group.name + ' (' + group.count + ')', key));
      filter.value = classes.has(selected) ? selected : '';
      filter.disabled = !rows.length;
      draw();
    } catch (error) {
      if (version !== revision) return;
      rows = []; visible = [];
      body.replaceChildren();
      table.hidden = true;
      download.disabled = filter.disabled = true;
      count.textContent = 'No se pudieron cargar los activos.';
      console.error('Consulta de activos por clase', error);
    }
  }

  filter.addEventListener('change', () => { table.scrollTop = 0; draw(); });
  download.addEventListener('click', () => {
    if (!visible.length || !window.SKAdminAuth.canView('assetOverview')) return;
    const name = filter.value ? clean(visible[0].cells[0]) || 'Sin clase' : 'Todas las clases';
    const file = 'Activos - ' + name.replace(/[\\/:*?"<>|]/g, '-') + '.xlsx';
    window.SKDownloadTableExcel([headers, ...visible.map(row => row.cells)], file, false, 'Activos', [30,24,18,26,18]);
  });
  for (const event of ['skweb-db-ready','skweb-synced','skweb-local-change','skweb-assets-normalized','skweb-inventory-refresh']) {
    window.addEventListener(event, () => { if (section.classList.contains('active')) void render(); });
  }
  window.SKAssetOverview = {render};
})();
