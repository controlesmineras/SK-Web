const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const app=fs.readFileSync('produccion/app.js','utf8');
const first={id:'nov',origin:'YT29',date:'2026-11-03',closedAt:'2026-11-03T19:00:00Z'};
const second={id:'dec',origin:'YT29',date:'2026-12-05',closedAt:'2026-12-05T15:00:00Z'};
const parts=[['pin','2','Pin'],['spring','10','Resorte'],['valve','3','Válvula']].map(([id,numero,nombre])=>({id,numero,nombre,clase:'YT',detalle:'29'}));
const item={id:'criterion',productionPartId:'pin',isYtSpare:true,spareEquipment:'YT 29',spareItemNumber:'2',spareItemName:'Pin'};
function movement(id,fechaISO,cantidad,extra={}){return {id,origen:'YT29',partId:'pin',fechaISO,cantidad,...extra}}
function runtime(extra={}){
 const state={parts,inventoryCriteria:[item],inventoryClosures:[second,first],incomes:[],pending:[],consumptions:[],...extra};
 const c=vm.createContext({window:{addEventListener(){}},state,norm:s=>s.toLowerCase()});
 vm.runInContext(fs.readFileSync('spare-catalog.js','utf8'),c);
 vm.runInContext(app.slice(app.indexOf('const trailingParts='),app.indexOf('const partMatches=')),c);
 vm.runInContext(fs.readFileSync('produccion/consumption-reports.js','utf8'),c);
 const context=vm.runInContext('({state,catalog,compareParts,incomeMovements})',c),report=c.window.SKConsumptionReports;
 return {context,report,rows:range=>report.aggregate(context,'YT29',range)};
}
test('monthly sheet uses calendar dates, catalogue order and effective incomes with valid pending movements once',()=>{
 const confirmed=movement('old','2026-11-02',5,{partId:'criterion'});
 const {rows}=runtime({consumptions:[confirmed,movement('other','2026-11-02',40,{origen:'Columna29'}),movement('deleted','2026-11-02',10,{deleted:true})],
  pending:[confirmed,movement('pending','2026-11-02',2),movement('rejected','2026-11-02',8,{syncRejected:true})],
  incomes:[movement('i','2026-11-02',4,{kind:'income'}),movement('opening','2026-11-02',100,{kind:'initial'}),movement('ret','2026-11-02',3,{kind:'warehouse-return'}),movement('out','2026-11-02',2,{kind:'warehouse-out'})],
  incomeChanges:[{id:'edit',incomeId:'i',baseRevision:'original',after:{cantidad:6}}]});
 const data=rows({from:'2026-11-01',to:'2026-11-30'});
 assert.deepEqual(Array.from(data,r=>r.part.numero),['2','3','10']);
 assert.equal(data[0].income,9);assert.equal(data[0].days.get('2026-11-02'),7);
 assert.equal(data[0].consumed,7);assert.equal(data[1].consumed,0);
});
test('consecutive cuts use effective date and original recording time, including equality only in the ending period',()=>{
 const records=[movement('before',first.date,40,{recordedAt:first.closedAt}),movement('start',first.date,1,{createdAt:'2026-11-04T09:00:00Z',recordedAt:'2026-11-03T19:00:01Z'}),
  movement('mid','2026-12-02',2),movement('end',second.date,4,{recordedAt:second.closedAt}),
  movement('open',second.date,8,{createdAt:'2026-12-05T15:00:01Z'}),movement('old','2026-11-02',32)];
 const {context,report,rows}=runtime({consumptions:records,inventoryLatest:[{...second,status:'closed'},{...second,id:'other',origin:'YT28',status:'closed'}],
  incomes:[movement('prior',first.date,50,{kind:'income',recordedAt:first.closedAt}),movement('end-income',second.date,12,{kind:'income',recordedAt:second.closedAt})]});
 const [open,closed]=report.periods(context.state,'YT29','2026-12-12');
 assert.equal(rows(closed)[0].consumed,7);assert.equal(rows(closed)[0].income,12);
 assert.equal(rows(open)[0].consumed,8);assert.equal(rows(open)[0].income,0);
});
test('rolling three-month ranking retains zero-stock consumed parts and omits unconsumed items',()=>{
 const {report,rows}=runtime({consumptions:[movement('outside','2026-08-17',100),movement('first','2026-08-18',30),
  movement('last','2026-11-17',6,{partId:'spring'}),movement('future','2026-11-18',99)]});
 const range=report.rollingRange('2026-11-17');
 assert.equal(range.from,'2026-08-18');assert.equal(range.to,'2026-11-17');
 assert.equal(report.rollingRange('2024-05-31').from,'2024-03-01');
 assert.equal(report.rollingRange('2026-01-05').from,'2025-10-06');
 const result=report.rank(rows(range),p=>p.id==='pin'?5:0,'YT29');
 assert.deepEqual(Array.from(result,r=>[r.part.id,r.consumed,r.average,r.stock,r.coverage]),[['pin',30,10,5,0.5],['spring',6,2,0,0]]);
});

test('separates identical part numbers by inventory, including legacy and offline Column 29 records',()=>{
 const day='2026-11-14',range={from:day,to:day};
 const column={id:'seal',numero:'2',nombre:'Pin',clase:'Columna',detalle:'29'};
 const confirmed=movement('confirmed',day,3,{origen:'Columna29',partId:'seal'});
 const old=movement('legacy',day,2,{origen:'29',partId:'seal',assetId:'column'});
 const {context,report}=runtime({parts:[parts[0],column],inventoryCriteria:[],
  assets:[{id:'column',clase:'Columna',modelo:'FT160'}],
  consumptions:[confirmed,old,movement('yt',day,11),movement('other-model',day,42,{origen:'Columna28'})],
  pending:[confirmed,movement('pending',day,4,{origen:'Columna 29',partId:'seal'}),movement('rejected',day,99,{origen:'Columna29',partId:'seal',syncRejected:true})],
  incomes:[movement('income',day,7,{kind:'income',partId:'seal',origen:'Columna29'})]});
 const selected=origin=>Array.from(report.aggregate(context,origin,range),r=>[r.part.id,r.income,r.consumed,r.days.get(day)]);
 assert.deepEqual(selected('Columna29'),[['seal',7,9,9]]);
 assert.deepEqual(selected('YT29'),[['pin',0,11,11]]);
});

test('totals by part combine dates, machines and catalog aliases and keep distinct part IDs separate',()=>{
 const query=fs.readFileSync('consumption-query-v2.js','utf8');
 const c=vm.createContext({});
 vm.runInContext(query.slice(query.indexOf('const norm='),query.indexOf('const localISO='))+query.slice(query.indexOf('function totalsByPart('),query.indexOf('async function render(')),c);
 const catalog=[{id:'pin',criterionId:'criterion',numero:'2',nombre:'Pin de ajuste'},{id:'other',numero:'3',nombre:'Pin de ajuste'}];
 const sample={date:'2026-11-01',machine:'A',item:'2',name:'Pin de ajuste',qty:2};
 const rows=[{...sample,partId:'pin',name:'Nombre anterior'},{...sample,partId:'criterion',date:'2026-11-11',machine:'B',qty:3},
  {...sample,qty:1},{...sample,partId:'other',item:'3',qty:8}];
 const balances=new Map([['pin',0],['other',12]]);
 rows.push({...sample,partId:'retired',name:'Repuesto retirado',qty:1});
 const result=c.totalsByPart(rows,catalog,true,part=>balances.get(part.id));
 assert.deepEqual(Array.from(result,r=>[r.item,r.name,r.qty,r.stock]),[
  ['2','Pin de ajuste',6,0],['3','Pin de ajuste',8,12],['2','Repuesto retirado',1,null]
 ]);
});
