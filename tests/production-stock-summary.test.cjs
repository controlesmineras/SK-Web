const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('produccion/app.js','utf8');
const part={id:'part10',clase:'YT',detalle:'29',numero:'10',nombre:'O-ring'};
const criterion={id:'criterion10',productionPartId:'part10',isYtSpare:true,spareEquipment:'YT 29',spareItemNumber:'10',spareItemName:'O-ring'};
const date='2026-11-10';
const movement=(id,kind,cantidad,extra={})=>({id,kind,cantidad,partId:part.id,origen:'YT29',fechaISO:date,...extra});
const close=(extra={})=>({id:'close',origin:'YT29',date:'2026-10-31',status:'closed',closedAt:'2026-10-31T20:00:00.000Z',rows:[{partId:part.id,aliases:[part.id,criterion.id],physical:4}],...extra});
function runtime(snapshot={}){
 const c=vm.createContext({window:{addEventListener(){}},state:{parts:[part],inventoryCriteria:[criterion],incomes:[],consumptions:[],pending:[],...snapshot},today:()=>date,displayDate:iso=>iso.split('-').reverse().join('/')});
 vm.runInContext(fs.readFileSync('spare-catalog.js','utf8'),c);
 c.catalog=()=>c.window.SKSpareCatalog.merge(c.state.parts,c.state.inventoryCriteria);
 vm.runInContext(source.slice(source.indexOf('const incomeMovements='),source.indexOf('function filterParts(')),c);
 return c;
}
test('without a closed inventory all historical incomes and consumptions are shown separately from initial stock and adjustments',()=>{
 const c=runtime({incomes:[movement('initial','initial',4),movement('old-income','income',20,{fechaISO:'2026-09-01'}),movement('income','income',5),movement('adjust','adjustment',-2,{target:7})],
  consumptions:[movement('old-consume',undefined,3,{fechaISO:'2026-09-02'}),movement('consume',undefined,2)],
  inventoryLatest:[close({status:'draft'}),close({status:'submitted'})]});
 const summary=c.stockPeriodSummary(part,'YT29');
 assert.equal(summary.closed,undefined);assert.equal(summary.incomes,25);assert.equal(summary.consumptions,5);assert.equal(summary.adjustments,-2);
 const text=c.stockSummaryText(part,'YT29','');
 assert.match(text,/TODOS LOS MOVIMIENTOS · SIN INVENTARIO CERRADO/);
 assert.match(text,/INGRESOS: 25 · CONSUMOS: 5 · AJUSTES CONFIRMADOS: -2/);
});
test('the last closed inventory cuts history at the real registration time, including movements on the closing day',()=>{
 const latest=close();
 const c=runtime({inventoryLatest:[close({date:'2026-09-30'}),close({origin:'YT28',date:'2026-11-01'}),latest,close({date:'2026-12-31'})],
  incomes:[movement('old','income',100,{fechaISO:'2026-10-01'}),movement('before','income',100,{fechaISO:latest.date,createdAt:'2026-10-31T19:00:00Z'}),
   movement('after','income',7,{fechaISO:latest.date,createdAt:'2026-10-31T20:01:00Z'}),movement('new','income',3),
   movement('adjust','adjustment',-2,{target:10}),movement('future','income',100,{fechaISO:'2026-11-11'})],
  consumptions:[movement('old-offline',undefined,100,{fechaISO:latest.date,createdAt:'2026-11-01T12:00:00Z',recordedAt:'2026-10-31T19:00:00Z'}),
   movement('equal',undefined,100,{fechaISO:latest.date,recordedAt:latest.closedAt}),movement('new-offline',undefined,2,{fechaISO:latest.date,recordedAt:'2026-10-31T20:02:00Z'}),movement('new-consume',undefined,1)]});
 const summary=c.stockPeriodSummary(part,'YT29');
 assert.equal(summary.closed,latest);assert.equal(summary.opening,4);assert.equal(summary.incomes,10);assert.equal(summary.consumptions,3);assert.equal(summary.adjustments,-2);
 assert.match(c.stockSummaryText(part,'YT29',''),/DESDE EL INVENTARIO DEL 31\/10\/2026/);
});
test('part aliases are combined while other origins, parts, deleted movements and duplicate acknowledgements are excluded',()=>{
 const income=movement('received','income',6,{partId:criterion.id});
 const c=runtime({incomes:[income,movement('wrong-origin','income',99,{origen:'YT28'}),movement('wrong-part','income',99,{partId:'other'}),movement('deleted','income',99,{deleted:true})],
  consumptions:[movement('consumed',undefined,2)],pending:[income,movement('pending-income','income',3,{partId:criterion.id}),movement('pending-consume',undefined,1),movement('rejected','income',99,{syncRejected:true})]});
 const summary=c.stockPeriodSummary(part,'YT29');
 assert.equal(summary.incomes,9);assert.equal(summary.consumptions,3);assert.equal(summary.pending,2);
 assert.match(c.stockSummaryText(part,'YT29',''),/PENDIENTES DE SINCRONIZAR: 2/);
});
test('historical aliases saved in the closed inventory still identify the selected part',()=>{
 const c=runtime({inventoryLatest:[close({rows:[{partId:part.id,aliases:[part.id,'retired-criterion'],physical:4}]})],
  incomes:[movement('old-alias','income',3,{partId:'retired-criterion'})]});
 assert.equal(c.stockPeriodSummary(part,'YT29').incomes,3);
});
test('preview shows the absolute entered quantity and signed difference, accepts zero and never changes stored records',()=>{
 const c=runtime({incomes:[movement('initial','initial',4),movement('income','income',20),movement('adjust','adjustment',-20,{target:4})]});
 const before=JSON.stringify(c.state);
 assert.match(c.stockSummaryText(part,'YT29','7'),/SALDO DESPUÉS DEL CAMBIO: 7 · AJUSTE A REALIZAR: \+3 \(VISTA PREVIA\)/);
 assert.match(c.stockSummaryText(part,'YT29','0'),/SALDO DESPUÉS DEL CAMBIO: 0 · AJUSTE A REALIZAR: -4/);
 assert.match(c.stockSummaryText(part,'YT29','4'),/SALDO DESPUÉS DEL CAMBIO: 4 · AJUSTE A REALIZAR: 0/);
 assert.match(c.stockSummaryText(part,'YT29',''),/ESCRIBE LA CANTIDAD/);
 for(const value of ['-1','1.5','invalid','9007199254740992'])assert.match(c.stockSummaryText(part,'YT29',value),/INGRESA UNA CANTIDAD ENTERA DESDE CERO/);
 assert.equal(JSON.stringify(c.state),before);
});
test('an unconfirmed or rejected target is never reported as a confirmed adjustment or real consumption',()=>{
 const base=movement('initial','initial',24),pending=movement('pending','adjustment',4,{baseQuantity:24});
 const c=runtime({incomes:[base],pending:[pending]});
 assert.match(c.stockSummaryText(part,'YT29','4'),/EXISTENCIA ACTUAL: 4/);
 assert.match(c.stockSummaryText(part,'YT29','4'),/SALDO SOLICITADO: 4 · PENDIENTE DE CONFIRMACIÓN/);
 assert.equal(c.stockPeriodSummary(part,'YT29').consumptions,0);assert.equal(c.stockPeriodSummary(part,'YT29').adjustments,0);
 c.state={...c.state,pending:[{...pending,syncRejected:true}]};
 assert.match(c.stockSummaryText(part,'YT29','4'),/EXISTENCIA ACTUAL: 24/);
 assert.match(c.stockSummaryText(part,'YT29','4'),/CANTIDAD RECHAZADA: 4 · REQUIERE REVISIÓN/);
 assert.equal(c.stockPeriodSummary(part,'YT29').pending,0);
});
test('typing reuses period totals but a new snapshot or day refreshes totals and the preview',()=>{
 const c=runtime({incomes:[movement('initial','initial',4),movement('tomorrow','income',2,{fechaISO:'2026-11-11'})]});
 const first=c.stockPeriodSummary(part,'YT29');
 c.stockSummaryText(part,'YT29','8');c.stockSummaryText(part,'YT29','9');
 assert.equal(c.stockPeriodSummary(part,'YT29'),first);
 c.state={...c.state,incomes:[...c.state.incomes,movement('new','income',1)]};
 const next=c.stockPeriodSummary(part,'YT29');assert.notEqual(next,first);assert.equal(next.incomes,1);
 assert.match(c.stockSummaryText(part,'YT29','9'),/AJUSTE A REALIZAR: \+4/);
 c.today=()=> '2026-11-11';
 assert.equal(c.stockPeriodSummary(part,'YT29').incomes,3);
 assert.match(c.stockSummaryText(part,'YT29','9'),/AJUSTE A REALIZAR: \+2/);
});
test('the input listener updates only the summary without saving, syncing or rebuilding the stock tables',()=>{
 const c=runtime({incomes:[movement('initial','initial',4)]});
 const handlers={},summary={textContent:''};
 const form={elements:{search:{},partId:{value:part.id},origen:{value:'YT29'},cantidad:{value:'7',addEventListener:(name,handler)=>{handlers[name]=handler}}},querySelector:()=>({}),addEventListener(){}};
 const view={kind:'adjustment',form,panel:{querySelector:()=>summary}};
 Object.assign(c,{stockViews:[view],document:{addEventListener(){}},setupPicker(){},saveStock(){throw Error('unexpected save')},paintStockView(){throw Error('unexpected table redraw')}});
 vm.runInContext(source.slice(source.indexOf('for(const view of stockViews){'),source.indexOf("byId('reviewStockAdjustment').onclick")),c);
 handlers.input();assert.match(summary.textContent,/SALDO DESPUÉS DEL CAMBIO: 7/);
 form.elements.cantidad.value='0';handlers.input();assert.match(summary.textContent,/SALDO DESPUÉS DEL CAMBIO: 0/);
});
