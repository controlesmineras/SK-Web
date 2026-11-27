const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const code = fs.readFileSync(path.join(__dirname,'../backend/apps-script/Code.gs'),'utf8');
const timestamp = '2026-11-26T16:00:00.000Z';

function query(data,filters) {
  const context = vm.createContext({
    json_: value => value,
    productionDataFile_: () => null,
    productionReadData_: () => data,
    findFile_: () => '',
    Utilities: {formatDate: date => date.toISOString().slice(0,10)}
  });
  const start = code.indexOf('function adminProductionMovements_(');
  const end = code.indexOf('function productionReadData_(',start);
  const dateStart = code.indexOf('function productionDate_(');
  const dateEnd = code.indexOf('function originalStamp_(',dateStart);
  vm.runInContext(code.slice(dateStart,dateEnd)+code.slice(start,end),context);
  return JSON.parse(JSON.stringify(context.adminProductionMovements_(filters)));
}

test('Producción muestra solo movimientos confirmados, enlaza por activo y omite la proyección de una misma entrada', () => {
  const delivery = {id:'delivery',kind:'loan',status:'synced',personName:'Andrea',assetId:'yt-1',createdAt:timestamp};
  const consumption = {id:'part',assetId:'yt-1',partId:'part-1',createdAt:timestamp,cantidad:2,registradoPor:'mecánico'};
  const data = {
    warehouseMovements: [delivery,{...delivery,id:'pending',bridgePending:true},{...delivery,id:'rejected',status:'rejected'}],
    consumptions: [consumption,{...consumption,id:'other',assetId:'yt-2'},{...consumption,id:'ambiguous',registradoPor:''}],
    incomes: [{...consumption,id:'projection',sourceWarehouseMovementId:'delivery'}]
  };
  const result = query(data,{assetId:'yt-1'});
  assert.deepEqual(result.rows.map(r => [r.id,r.type,r.person]),[['delivery','Préstamo','Andrea'],['part','Consumo','']]);
  assert.equal(query(data,{from:'2026-11-25',to:'2026-11-25'}).rows.length,0);
  assert.equal(query(data,{from:'2026-11-26',to:'2026-11-26'}).rows.length,3);
  assert.throws(()=>query(data,{from:'2026-11-30',to:'2026-11-26'}),/rango/);
});
