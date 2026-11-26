const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('cada persona de la ficha ocupa un buscador con sus datos dentro del mismo control', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const form = html.match(/<form\b[^>]*\bid="assetForm"[^>]*>([\s\S]*?)<\/form>/)[1];
  for (const role of ['Responsible', 'Warehouse', 'Assigned']) {
    const search = 'asset' + role + 'Search';
    const details = 'asset' + role + 'Details';
    const control = [...form.matchAll(/<div class="assetPersonControl">([\s\S]*?)<\/div>/g)]
      .map(match => match[1]).find(markup => markup.includes('id="' + search + '"'));
    assert.ok(control, search);
    assert.equal([...control.matchAll(/<input\b/g)].length, 1);
    assert.ok(control.includes('aria-describedby="' + details + '"'));
    assert.ok(control.includes('id="' + details + '"'));
  }
  const inputs = [...form.matchAll(/<input\b[^>]*>/g)].map(match => match[0]);
  for (const key of ['nombreResponsable', 'documentoResponsable', 'nombreBodeguero', 'documentoBodeguero', 'asignadaId']) {
    const saved = inputs.filter(input => input.includes('name="' + key + '"'));
    assert.equal(saved.length, 1, key);
    assert.match(saved[0], /type="hidden"/);
  }
  const assignment = form.split('>Asignación<')[1].split('>Información adicional<')[0];
  assert.equal([...assignment.matchAll(/<input\b(?![^>]*type="hidden")[^>]*>/g)].length, 1);
});
