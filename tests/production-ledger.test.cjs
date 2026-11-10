const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const server=fs.readFileSync('backend/apps-script/Code.gs','utf8');
const client=fs.readFileSync('produccion/app.js','utf8');
const parts=[{id:'part10',clase:'YT',detalle:'29',numero:'10',nombre:'O-ring'}];
const criteria=[{id:'criterion10',productionPartId:'part10',isYtSpare:true,spareEquipment:'YT 29',spareItemNumber:'10',spareItemName:'O-ring'},
 {id:'manual',isYtSpare:true,spareEquipment:'YT 29',spareItemNumber:'99',spareItemName:'Manual'}];
function runtime(initial={},catalogParts=parts,catalogCriteria=criteria){
 let data=structuredClone({consumptions:[],incomes:[],...initial});
 let role='admin';
 const file={getBlob:()=>({getDataAsString:()=>JSON.stringify(data)}),setContent:text=>{data=JSON.parse(text)}};
 const context=vm.createContext({LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},verifyProductionToken_:()=>({role,document:'doc',personId:'person'}),findFile_:()=>1,
  readFile_:()=>({personal:[{id:'person',documento:'doc',nombre:'Administrador'}],assets:[{id:'machine',clase:'YT'}],parts:catalogParts,inventoryCriteria:catalogCriteria}),
  DriveApp:{getFilesByName:()=>{let read=false;return {hasNext:()=>!read,next:()=>{read=true;return file}}}},PRODUCTION_FILE:'production',
  Utilities:{formatDate:()=>new Date().toISOString().slice(0,10)},json_:x=>x,productionRole_:x=>x,cargoNorm_:x=>String(x||'').toLowerCase()});
 vm.runInContext(server.slice(server.indexOf('function productionSync_(')),context);
 return {sync:pending=>context.productionSync_({pending}),count:request=>context.productionSync_({inventoryRequest:request}),role:value=>{role=value},read:()=>data,context};
}
const today=new Date().toISOString().slice(0,10);
const movement=(id,kind,cantidad,extra={})=>({id,kind,cantidad,partId:'part10',origen:'YT29',fechaISO:today,...extra});
function balances(snapshot){
 const window={addEventListener(){}};
 const context=vm.createContext({window,state:snapshot});
 vm.runInContext(fs.readFileSync('spare-catalog.js','utf8'),context);
 context.catalog=()=>window.SKSpareCatalog.merge(snapshot.parts||parts,snapshot.inventoryCriteria||criteria);
 context.today=()=>today;
 vm.runInContext(client.slice(client.indexOf('const incomeMovements='),client.indexOf('function filterParts(')),context);
 return context;
}
test('absolute adjustment 24 to 4, retry, zero and permission agree with displayed stock',()=>{
 const app=runtime({incomes:[movement('initial-0000000001','initial',4),movement('income-00000000001','income',20)]});
 const request=movement('adjustment-0000001','adjustment',4);
 const saved=app.sync([request]);
 assert.equal(saved.incomes.at(-1).cantidad,-20);
 assert.equal(balances(saved).stockFor(parts[0],'YT29'),4);
 assert.equal(app.sync([request]).incomes.length,3);
 const zero=app.sync([movement('adjustment-0000002','adjustment',0)]);
 assert.equal(balances(zero).stockFor(parts[0],'YT29'),0);
 app.role('assistant');assert.throws(()=>app.sync([movement('adjustment-0000003','adjustment',8)]),/rol/);
});
test('unknown and wrong-model part IDs cannot fall through to a manual criterion',()=>{
 const app=runtime();
 assert.throws(()=>app.sync([movement('invalid-000000001','income',5,{partId:'missing'})]),/repuesto|Repuesto/);
 assert.throws(()=>app.sync([{...movement('invalid-000000002',undefined,1),origen:'YT28',tipoEquipo:'YT',assetId:'machine',responsableId:'person'}]),/repuesto|Repuesto/);
});
test('a valid criterion alias resolves to the same part and adjustment balance',()=>{
 const app=runtime({incomes:[movement('initial-0000000001','initial',24)]});
 const saved=app.sync([movement('adjustment-0000001','adjustment',4,{partId:'criterion10'})]);
 assert.equal(saved.incomes.at(-1).before,24);
 assert.equal(balances(saved).stockFor(parts[0],'YT29'),4);
});
test('invalid calendar dates are rejected before writing movements',()=>{
 const app=runtime();
 assert.throws(()=>app.sync([movement('invalid-000000003','income',1,{fechaISO:'2026-02-31'})]),/fecha/);
 assert.equal(app.read().incomes.length,0);
});
test('catalog used for a physical count excludes permanently deleted legacy parts',()=>{
 const deleted={id:'deleted-criterion',productionPartId:'part10',isYtSpare:true,spareEquipment:'YT 29',permanentSpareDeleted:true,deleted:true};
 const app=runtime({},parts,[...criteria.filter(row=>row.id!=='criterion10'),deleted]);
 const result=app.count({action:'submit',id:'inventory-00000001',revision:'revision-000000001',origin:'YT29',date:today,values:[{partId:'manual',physical:0}]});
 assert.equal(result.inventoryResult.error,undefined);
 assert.equal(result.inventoryResult.count.status,'submitted');
});
test('return for correction is idempotent after the first response is lost',()=>{
 const app=runtime({},parts,[]);
 const draft={action:'submit',id:'inventory-00000001',revision:'revision-000000001',origin:'YT29',date:today,values:[{partId:'part10',physical:4}]};
 app.count(draft);
 const request={action:'return',id:draft.id,revision:draft.revision,note:'Volver a contar'};
 assert.equal(app.count(request).inventoryResult.count.status,'returned');
 assert.equal(app.count(request).inventoryResult.error,undefined);
});
test('movements made after a same-day close affect the next balance; older offline ones do not',()=>{
 const closedAt=today+'T10:00:00.000Z';
 const close={id:'closed-000000001',origin:'YT29',date:today,status:'closed',closedAt,rows:[{partId:'part10',aliases:['part10','criterion10'],physical:20}]};
 const snapshot={inventoryLatest:[close],incomes:[movement('new-income-000001','income',5,{createdAt:today+'T12:00:00Z'})],consumptions:[movement('new-consume-00001',undefined,3,{createdAt:today+'T13:00:00Z'}),movement('old-consume-00001',undefined,9,{createdAt:today+'T14:00:00Z',recordedAt:today+'T09:00:00Z'})]};
 assert.equal(balances(snapshot).stockFor(parts[0],'YT29'),22);
});
test('retrying an earlier initial correction cannot restore an obsolete balance',()=>{
 const app=runtime({incomes:[movement('initial-0000000001','initial',24)]});
 app.sync([movement('initial-0000000001','initial',4,{correctionId:'correction-000001'})]);
 app.sync([movement('initial-0000000001','initial',3,{correctionId:'correction-000002'})]);
 app.sync([movement('initial-0000000001','initial',4,{correctionId:'correction-000001'})]);
 assert.equal(app.read().incomes[0].cantidad,3);
});
test('future receipts do not affect an adjustment to the current stock',()=>{
 const future='2099-01-01';
 const app=runtime({incomes:[movement('initial-0000000001','initial',10),movement('future-income-001','income',30,{fechaISO:future})]});
 const saved=app.sync([movement('adjustment-0000001','adjustment',4)]);
 assert.equal(saved.incomes.at(-1).before,10);
 assert.equal(balances(saved).stockFor(parts[0],'YT29'),4);
});
test('draft conflict is rejected, approval is administrator-only, archived rows stay frozen',()=>{
 const app=runtime({},parts,[]);
 const base={id:'inventory-00000001',revision:'revision-000000001',origin:'YT29',date:today,values:[{partId:'part10',physical:0}]};
 app.role('assistant');
 assert.equal(app.count({...base,action:'save'}).inventoryResult.count.status,'draft');
 assert.match(app.count({...base,action:'save',revision:'revision-000000002',baseRevision:'wrong'}).inventoryResult.error,/otro dispositivo/);
 const submitted=app.count({...base,action:'submit',revision:'revision-000000002',baseRevision:base.revision}).inventoryResult.count;
 assert.equal(submitted.status,'submitted');
 assert.match(app.count({id:base.id,action:'approve',revision:submitted.revision}).inventoryResult.error,/administrador/);
 app.role('admin');
 const closed=app.count({id:base.id,action:'approve',revision:submitted.revision}).inventoryResult.count;
 assert.equal(closed.rows[0].physical,0);
 app.sync([movement('adjustment-0000001','adjustment',4)]);
 const history=app.count({action:'history',id:base.id}).inventoryResult;
 assert.equal(history.report.rows[0].physical,0);
 assert.equal(app.read().incomes.at(-1).target,4);
});
