const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const context={window:{}};
vm.runInNewContext(fs.readFileSync('movement-time.js','utf8'),context);
const time=context.window.SKMovementTime;
const original='2026-11-19T03:35:00Z',receipt='2026-11-19T18:40:00Z';

test('a movement keeps its original Colombian hour after an offline overnight sync',()=>{
 const pending={createdAt:original,syncState:'pending'};
 const synced={createdAt:receipt,recordedAt:original,syncState:'synced'};
 assert.equal(time.recordHour(pending),'22:35:00');
 assert.equal(time.recordHour(synced),time.recordHour(pending));
 assert.equal(time.day(time.registered(synced)),'2026-11-18');
 assert.equal(time.recordHour({createdAt:original,syncedAt:receipt},true),'22:35:00');
 assert.equal(time.recordHour({createdAt:receipt}),'');
 assert.equal(time.recordHour({horaLocal:'10:35 p. m.',createdAt:receipt}),'10:35 p. m.');
});

test('linked entries use the source operation and historical warehouse signatures verify their ID',()=>{
 const synced={id:'m1',createdAt:receipt,recordedAt:receipt,sourceDeliveryId:'source'};
 assert.equal(time.recordHour(synced),'');
 assert.equal(time.recordHour({...synced,sourceCreatedAt:original}),'22:35:00');
 const old={id:'m1',revision:3,createdAt:receipt,requestSignature:JSON.stringify({id:'m1',createdAt:original})};
 assert.equal(time.warehouse(old),original);
 assert.equal(time.warehouse({...old,id:'other'}),'');
 assert.equal(time.warehouse({...old,requestSignature:'[]'}),'');
 assert.equal(time.warehouse({...old,requestSignature:'{'}),'');
});
