const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const window={};
vm.runInNewContext(fs.readFileSync('plaza-movement-ledger.js','utf8'),{window});
const {entries,ordered}=window.SKPlazaLedger;
const time='2025-11-10T13:14:15Z',late='2025-11-15T13:14:45Z';
test('el historial distingue el registro en la terminal de las marcas de sincronización',()=>{
 const rows=entries({blendingDeliveries:[
  {id:'ext',createdAt:time,recordedAt:late,syncedAt:'2025-11-16T00:00:00Z'},
  {id:'antigua',createdAt:time,syncedAt:late},
  {id:'solo-sync',createdAt:late,syncedAt:late},
  {id:'rev',reversalOf:'ext',createdAt:late,recordedAt:late,syncedAt:'2025-11-16T00:00:00Z'},
  {id:'heredada',reversalOf:'antigua',createdAt:late,recordedAt:time,syncedAt:late}
 ],warehouseQuantityHistory:[
  {id:'local',kind:'quantity_adjustment',registrationClock:'device',recordedAt:time,syncedAt:late},
  {id:'central',kind:'quantity_adjustment',registrationClock:'central',recordedAt:late},
  {id:'ajuste-antiguo',kind:'quantity_adjustment',requestSignature:'[]',recordedAt:late,createdAt:late}
 ]});
 assert.deepEqual(Array.from(rows,r=>r.register),[Date.parse(late),Date.parse(time),null,Date.parse(late),null,Date.parse(time),null,null]);
});
test('un movimiento extemporáneo conserva su registro y una reversión antigua usa la fecha del reintegro',()=>{
 const original={id:'orig',itemId:'i',createdAt:time,recordedAt:late,reversedAt:late,reversed:true};
 const back={id:'rev',itemId:'i',createdAt:late,recordedAt:time,reversalOf:'orig',originalCreatedAt:time};
 const rows=entries({blendingDeliveries:[original,back,{...original,id:'legacy'},{id:'unknown',updatedAt:late},{...original,id:'deleted',deleted:true}]});
 assert.deepEqual(Array.from(rows,r=>r.type),['delivery','reversal','delivery','reversal','delivery']);
 assert.equal(rows[0].register,Date.parse(late));assert.equal(rows[1].register,Date.parse(late));
 assert.equal(rows[3].legacy,true);assert.equal(rows[3].row.balanceBefore,undefined);
 assert.equal(rows[4].register,null);
});
test('el orden del saldo y el orden de registro pueden diferir sin cambiar la hora mostrada',()=>{
 const data={blendingIncomes:[{id:'in',itemId:'i',recordedAt:time,balanceAppliedAt:late}],warehouseQuantityHistory:[{id:'adj',kind:'quantity_adjustment',itemId:'i',recordedAt:late,balanceAppliedAt:time}]};
 const rows=entries(data);
 assert.deepEqual(Array.from(ordered(rows,'registration'),e=>e.row.id),['adj','in']);
 const byBalance=ordered(rows,'balance');assert.equal(byBalance[0].row.id,'in');assert.equal(byBalance[0].register,Date.parse(time));
});
test('renglones históricos de un solo guardado respetan la secuencia de los saldos aun con identificadores desordenados',()=>{
 const rows=entries({blendingDeliveries:[79,81,80].map(n=>({id:'id'+n,itemId:'i',recordedAt:time,syncEventId:'batch',balanceAfter:n}))});
 assert.deepEqual(Array.from(ordered(rows,'registration'),e=>e.row.balanceAfter),[79,80,81]);
});
