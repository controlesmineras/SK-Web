'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {randomUUID}=require('node:crypto');
global.indexedDB=require('fake-indexeddb').indexedDB;
const store=require('../frentes/store.js');
const source=fs.readFileSync(require.resolve('../backend/apps-script/Code.gs'),'utf8');
function backend(){
  let cloud={personal:[{id:'p1',nombre:'Ana Mora',documento:'1.234-5',pinHash:'private',empresa:'SK'}]},writes=0;
  let locked=false,failWrite=false;
  const ctx=vm.createContext({Utilities:{getUuid:randomUUID},LockService:{getScriptLock:()=>({
    waitLock(){assert.equal(locked,false);locked=true;},releaseLock(){locked=false;}
  })}});
  vm.runInContext(source,ctx);
  Object.assign(ctx,{findFile_:()=>'central',readFile_:()=>{assert.ok(locked);return structuredClone(cloud);},writeFile_:(_,data)=>{assert.ok(locked);if(failWrite)throw Error('Drive');writes++;cloud=structuredClone(data);},
    verifyToken_:token=>{if(token!=='valid')throw Error('Sesión no válida');return {document:'oper'};},verifyAdminToken_:()=>({username:'admin'}),json_:x=>x});
  return {call:(reports,overrides={})=>ctx.workFrontSync_({token:'valid',access:'plaza',reports,...overrides}),cloud:()=>cloud,writes:()=>writes,fail:(v)=>{failWrite=v;}};
}
const make=(props={})=>({id:'FT-'+randomUUID(),rev:randomUUID(),owner:'plaza:oper',fecha:'2026-11-21',turno:'S',nivel:16,corte:'850 B',personId:'p1',documento:'12345',status:'pending',...props});
const newPerson=(numero='200')=>make({documento:numero,personId:'FP-'+randomUUID(),newPerson:{documento:numero,primerNombre:'Prueba',primerApellido:'Local',empresa:'SK 3.7',area:'Producción',cargo:'Machinero',pinHash:'ignore'}});
test('turnos de Colombia y cambio de día sin depender de la zona del dispositivo',()=>{
  for(const [stamp,want] of [['10:59','S'],['11:00','D'],['18:59','D'],['19:00','T'],['02:59','T'],['03:00','S']])assert.equal(store.shift(new Date('2026-11-21T'+stamp+':00Z')),want);
  assert.equal(store.today(new Date('2026-11-22T04:59Z')),'2026-11-21');
});
test('coincidencias parciales, con tildes, por documento y prioridad de coincidencia exacta',()=>{
  const rows=[{id:'2',nombre:'Ana María',documento:'123456'},{id:'1',nombre:'María Mora',documento:'1.234-5'}];
  assert.equal(store.matches(rows,'mora maria')[0].id,'1');
  assert.deepEqual(store.matches(rows,'12345',true).map(p=>p.id),['1','2']);
});
test('la lectura devuelve solo Personal y el acceso revocado no puede enviar',()=>{
  const b=backend(),result=b.call([]);
  assert.equal(result.personal.length,1);assert.equal(result.personal[0].pinHash,undefined);assert.equal(result.reports,undefined);assert.equal(b.writes(),0);
  assert.throws(()=>b.call([make()],{token:'expired'}),/Sesión/);
});
test('dos dispositivos, un mismo documento, un alta y un reporte por revisar que se puede corregir',()=>{
  const b=backend(),a=newPerson('2.000-1'),c=newPerson('20001');
  assert.equal(b.call([a]).receipts[0].status,'synced');
  const blocked=b.call([c]).receipts[0];assert.equal(blocked.reason,'duplicate');assert.match(blocked.message,/Revisa tu reporte/);
  assert.equal(b.cloud().workFrontReports.length,1);assert.equal(b.cloud().personal.length,2);
  assert.equal(b.cloud().personal[1].pinHash,undefined);
  const saved=b.call([{...c,newPerson:null,personId:blocked.existing.id}]).receipts[0];
  assert.equal(saved.status,'synced');assert.equal(b.cloud().workFrontReports[1].corte,c.corte);assert.equal(b.cloud().personal.length,2);
});
test('un mismo reporte reenviado y dos reportes que referencian un alta sin conexión',()=>{
  const b=backend(),a=newPerson(),c={...a,id:'FT-'+randomUUID(),nivel:8};
  assert.equal(b.call([a,c]).receipts.every(r=>r.status==='synced'),true);b.call([a,c]);
  assert.equal(b.cloud().workFrontReports.length,2);assert.equal(b.cloud().personal.length,2);assert.equal(b.writes(),1);
});
test('los datos inválidos o de otra cuenta no crean fichas; los reportes válidos del lote avanzan',()=>{
  const b=backend();
  const result=b.call([make({owner:'admin:otro'}),{...newPerson(),nivel:17},make({fecha:'2026-02-30'}),make({corte:' '}),make({nivel:1})]);
  assert.deepEqual(Array.from(result.receipts,r=>r.status),['review','review','review','review','synced']);assert.equal(b.cloud().personal.length,1);
});
test('solo se confirma una escritura persistida y el mismo identificador puede reintentarse',()=>{
  const b=backend(),a=newPerson();b.fail(true);assert.throws(()=>b.call([a]),/Drive/);assert.equal(b.cloud().personal.length,1);
  b.fail(false);b.call([a]);assert.equal(b.cloud().personal.length,2);
});
test('IndexedDB conserva las altas, impide dos propuestas locales y protege revisiones entre pestañas',async()=>{
  const key='plaza:'+randomUUID(),a=newPerson(),c=newPerson();
  const result=await Promise.allSettled([a,c].map(row=>store.access(key,state=>store.save(state,row))));
  assert.equal(result.filter(x=>x.status==='fulfilled').length,1);
  const state=await store.access(key),row=state.reports[0];assert.equal(store.people(state).length,1);
  const response={protocol:'work-front-v1',personal:[],receipts:[{id:row.id,status:'review',message:'Revisa tu reporte.'}]};
  await store.access(key,s=>store.apply(s,response,[row]));
  const corrected={...row,rev:randomUUID(),newPerson:null,personId:'central-person',status:'pending'};
  await store.access(key,s=>store.save(s,corrected,row.rev));
  await store.access(key,s=>store.apply(s,response,[row]));
  assert.equal((await store.access(key)).reports[0].status,'pending');assert.equal((await store.access('otra-cuenta')).reports.length,0);
});
test('un acuse ausente nunca da el reporte por sincronizado',async()=>{
  const key='plaza:'+randomUUID(),r=make();
  await store.access(key,s=>store.save(s,r));
  await assert.rejects(store.access(key,s=>store.apply(s,{protocol:'work-front-v1',personal:[],receipts:[]},[r])),/Falta confirmar/);
  assert.equal((await store.access(key)).reports[0].status,'pending');
});
