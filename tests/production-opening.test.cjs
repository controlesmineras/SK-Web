const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {randomUUID}=require('node:crypto');
const source=fs.readFileSync('produccion/app.js','utf8');
const server=fs.readFileSync('backend/apps-script/Code.gs','utf8');
const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Bogota'}).format(new Date());
const part={id:'part10',clase:'YT',detalle:'29',numero:'10',nombre:'O-ring'};
const movement=(id,kind,cantidad,extra={})=>({id,kind,cantidad,partId:part.id,origen:'YT29',fechaISO:date,...extra});
function runtime(){
 let central={consumptions:[],incomes:[movement('initial-0000000001','initial',4),movement('income-00000000001','income',20)]};
 const file={getBlob:()=>({getDataAsString:()=>JSON.stringify(central)}),setContent:value=>{central=JSON.parse(value)}};
 const backend=vm.createContext({LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},verifyProductionToken_:()=>({role:'admin',document:'doc',personId:'person'}),findFile_:()=>1,
  readFile_:()=>({personal:[{id:'person',documento:'doc',nombre:'Administrador'}],assets:[{id:'machine',clase:'YT'}],parts:[part],inventoryCriteria:[]}),
  DriveApp:{getFilesByName:()=>{let done=false;return {hasNext:()=>!done,next:()=>{done=true;return file}}}},PRODUCTION_FILE:'production',Utilities:{formatDate:()=>date},json_:x=>x,productionRole_:x=>x,cargoNorm_:x=>String(x||'').toLowerCase()});
 vm.runInContext(server.slice(server.indexOf('function productionSync_(')),backend);
 let local=structuredClone({...central,stockAdjustment:true,parts:[part],pending:[]});
 const c=vm.createContext({state:structuredClone(local),session:{token:'online',expiresAt:Date.now()+60000,user:{document:'doc',role:'admin'}},saving:false,syncing:false,syncRequested:false,syncFailed:false,syncConnectionFailed:false,countSelection:'',countDirty:false,countSaving:false,
  window:{addEventListener(){}},document:{addEventListener(){},hidden:false},setTimeout:()=>1,clearTimeout(){},setInterval(){},navigator:{onLine:true},crypto:{randomUUID},today:()=>date,readDate:()=>date,displayDate:iso=>iso.split('-').reverse().join('/'),
  status:message=>{c.message=message},stockStatus:(form,message)=>{c.formMessage=message},paintSync(){},paint(){},console:{error(){}},
  changeState:async(document,update)=>{if(update)local=structuredClone(update(structuredClone(local)));return structuredClone(local)},
  api:async(action,payload)=>backend.productionSync_(payload)});
 c.canSync=()=>c.session?.expiresAt>Date.now();
 vm.runInContext(fs.readFileSync('spare-catalog.js','utf8'),c);
 vm.runInContext(fs.readFileSync('produccion/sync-protocol.js','utf8'),c);
 c.catalog=()=>[part];
 vm.runInContext(source.slice(source.indexOf('function canSaveStock('),source.indexOf('const trailingParts=')),c);
 vm.runInContext(source.slice(source.indexOf('const incomeMovements='),source.indexOf('function filterParts(')),c);
 vm.runInContext(source.slice(source.indexOf('async function saveStock('),source.indexOf('for(const view of stockViews){')),c);
 vm.runInContext(source.slice(source.indexOf('let syncRequested=false'),source.indexOf('function showConsumptionView(')),c);
 const picker={hidden:true};
 const form={dataset:{},querySelector:()=>picker,elements:{origen:{value:'YT29'},search:{value:part.nombre},partId:{value:part.id},fechaISO:{value:'10/11/2026'},cantidad:{value:'4'}}};
 return {c,form,save:()=>c.saveStock({preventDefault(){}},{form,kind:'initial'}),read:()=>local,central:()=>central,backend};
}
test('opening correction keeps incomes, updates physical expected balance, syncs and accepts zero',async()=>{
 const r=runtime();r.c.navigator.onLine=false;
 r.form.elements.cantidad.value='7';await r.save();
 assert.equal(r.read().pending[0].kind,'initial');assert.ok(r.read().pending[0].correctionId);
 assert.equal(r.c.stockFor(part,'YT29'),27);
 assert.equal(r.c.countTotals('YT29','',[part]).get(part.id).opening,7);
 r.c.navigator.onLine=true;await r.c.sync();assert.equal(r.read().pending.length,0);
 assert.equal(r.central().incomes.filter(x=>x.kind==='initial').length,1);
 assert.equal(r.c.stockFor(part,'YT29'),27);
 r.form.elements.partId.value=part.id;r.form.elements.cantidad.value='0';await r.save();await r.c.sync();assert.equal(r.c.stockFor(part,'YT29'),20);
 r.backend.productionSync_({pending:[movement('new-income-000001','income',3)]});await r.c.sync();assert.equal(r.c.stockFor(part,'YT29'),23);
});
test('opening preview includes all income and retains historical stock adjustments',()=>{
 const r=runtime();assert.match(r.c.stockSummaryText(part,'YT29','7'),/SALDO ESPERADO CON ESTA APERTURA: 27/);
 assert.equal(r.central().incomes[1].cantidad,20);
});

test('an offline opening clears only after commit and a failed save keeps the form ready to retry',async()=>{
 const r=runtime(),fields=r.form.elements;
 r.c.navigator.onLine=false;
 const persist=r.c.changeState;
 let finish;
 r.c.changeState=(...args)=>new Promise((resolve,reject)=>{finish=()=>persist(...args).then(resolve,reject)});
 const write=r.save();
 assert.equal(fields.partId.value,part.id);assert.equal(fields.cantidad.value,'4');
 await r.save();assert.equal(r.read().pending.length,0);
 await finish();await write;
 assert.equal(r.read().pending.length,1);assert.match(r.c.formMessage,/GUARDADO EN ESTE EQUIPO/);
 assert.equal(fields.search.value,'');assert.equal(fields.partId.value,'');assert.equal(fields.cantidad.value,'');
 assert.equal(fields.fechaISO.value,'10/11/2026');assert.equal(fields.origen.value,'YT29');
 fields.search.value=part.nombre;fields.partId.value=part.id;fields.cantidad.value='0';
 r.c.changeState=async()=>{throw Error('Falló el almacenamiento local')};
 await r.save();assert.match(r.c.formMessage,/Falló el almacenamiento/);
 assert.equal(fields.partId.value,part.id);assert.equal(fields.search.value,part.nombre);assert.equal(fields.cantidad.value,'0');
 assert.equal(r.read().pending[0].cantidad,4);
});

test('repeated offline edits replace one opening, synchronize once and never create income or adjustments',async()=>{
 const r=runtime();r.c.navigator.onLine=false;
 // A new inventory starts with no stock movements.
 r.central().incomes.length=0;
 await r.c.changeState('doc',x=>({...x,incomes:[]}));r.c.state=await r.c.changeState('doc');
 let id;
 for(const quantity of [4,9,0,7]){
  r.form.elements.partId.value=part.id;r.form.elements.cantidad.value=String(quantity);await r.save();
  assert.equal(r.read().pending.length,1);id??=r.read().pending[0].id;assert.equal(r.read().pending[0].id,id);
  const totals=r.c.countTotals('YT29','',[part]).get(part.id);
  assert.equal(totals.opening,quantity);assert.equal(totals.incomes,0);assert.equal(totals.consumptions,0);
  assert.equal(r.c.stockFor(part,'YT29'),quantity);
 }
 r.c.navigator.onLine=true;await r.c.sync();
 assert.equal(r.read().pending.length,0);assert.equal(r.central().incomes.length,1);
 assert.equal(r.central().incomes[0].kind,'initial');assert.equal(r.central().incomes[0].cantidad,7);
 const rows=r.backend.productionCountRows_({origin:'YT29',date,values:[{partId:part.id,physical:7}]},[],[part],[],r.central().incomes,[]);
 assert.equal(rows[0].opening,7);assert.equal(rows[0].incomes,0);assert.equal(rows[0].expected,7);
});
test('editing an opening while its previous value is in flight preserves the newest correction',async()=>{
 const r=runtime();r.form.elements.cantidad.value='7';await r.save();
 const api=r.c.api;let release,started;const began=new Promise(resolve=>started=resolve);
 r.c.api=async(...args)=>{const response=await api(...args);started();await new Promise(resolve=>release=resolve);return response};
 const sync=r.c.sync();await began;
 r.form.elements.partId.value=part.id;r.form.elements.cantidad.value='9';await r.save();release();
 r.c.api=api;await sync;await r.c.sync();
 assert.equal(r.read().pending.length,0);assert.equal(r.central().incomes.find(x=>x.kind==='initial').cantidad,9);
 assert.equal(r.c.stockFor(part,'YT29'),29);
});
test('new consumption and income update stock after an opening correction',async()=>{
 const r=runtime();r.form.elements.cantidad.value='7';await r.save();await r.c.sync();
 r.backend.productionSync_({pending:[movement('consume-after-001',undefined,3,{tipoEquipo:'YT',assetId:'machine',responsableId:'person',turno:'D'}),movement('income-after-0001','income',2)]});
 await r.c.sync();assert.equal(r.c.stockFor(part,'YT29'),26);
 const totals=r.c.countTotals('YT29','',[part]).get(part.id);assert.equal(totals.opening,7);assert.equal(totals.incomes,22);assert.equal(totals.consumptions,3);
});
test('opening remains administrator-only and rejects fractional, negative or blank quantities',async()=>{
 const r=runtime();r.c.session.user.role='assistant';await r.save();assert.equal(r.read().pending.length,0);
 r.c.session.user.role='admin';for(const quantity of ['','-1','1.5']){r.form.elements.cantidad.value=quantity;await r.save();assert.equal(r.read().pending.length,0);}
});

test('a backdated opening syncs once, counts movements from its day, and leaves approved counts frozen',async()=>{
 const r=runtime(),openingDate='2025-11-03',before='2025-11-02',after='2025-11-04';
 const consume=(id,day,cantidad)=>movement(id,undefined,cantidad,{fechaISO:day,tipoEquipo:'YT',assetId:'machine',responsableId:'person'});
 r.backend.productionSync_({pending:[consume('old-consume-00001',before,7),consume('same-consume-0001',openingDate,2),consume('later-consume-001',after,1)]});
 await r.c.sync();
 r.c.readDate=input=>input.value.split('/').reverse().join('-');
 r.form.elements.fechaISO.value='03/11/2025';r.form.elements.cantidad.value='10';await r.save();
 const totals=day=>r.c.countTotals('YT29',day,[part]).get(part.id);
 assert.equal(totals(openingDate).opening,10);assert.equal(totals(openingDate).consumptions,2);
 assert.equal(totals(before).opening,0);assert.equal(totals(after).consumptions,3);
 assert.equal(r.c.stockPeriodSummary(part,'YT29').consumptions,3);
 await r.c.sync();assert.equal(r.read().pending.length,0);
 assert.equal(r.central().incomes.filter(row=>row.kind==='initial').length,1);
 assert.equal(r.central().incomes[0].fechaISO,openingDate);
 const count={action:'submit',id:'november-count-01',revision:'november-revision-1',origin:'YT29',date:after,values:[{partId:part.id,physical:6}]};
 const inventoryRequest=q=>r.backend.productionSync_({inventoryRequest:q}).inventoryResult;
 assert.equal(inventoryRequest(count).count.status,'submitted');
 const closed=inventoryRequest({...count,action:'approve'}).count;
 assert.equal(closed.rows[0].expected,7);assert.equal(closed.rows[0].physical,6);
 await r.c.sync();
 r.form.elements.partId.value=part.id;r.form.elements.cantidad.value='10';r.form.elements.fechaISO.value='01/11/2025';await r.save();await r.c.sync();
 assert.equal(r.central().incomes[0].fechaISO,'2025-11-01');assert.equal(r.read().pending.length,0);
 assert.deepEqual(r.central().inventoryCounts.find(row=>row.id===closed.id).rows,JSON.parse(JSON.stringify(closed.rows)));
 assert.equal(totals('2025-11-05').opening,6);assert.equal(totals('2025-11-05').consumptions,0);
});

test('a date correction waits for a compatible server and cannot be confirmed with the wrong date',async()=>{
 const r=runtime(),api=r.c.api;
 r.c.readDate=()=> '2025-11-03';
 await r.save();
 const intended=structuredClone(r.read().pending[0]);
 r.c.api=async(action,payload)=>{
  assert.equal((payload.pending||[]).length,0);assert.equal(payload.datedOpeningBatch,undefined);
  const result=await api(action,payload);delete result.openingDateV1;return result;
 };
 await r.c.sync();
 assert.equal(r.central().incomes[0].fechaISO,date);assert.equal(r.read().pending.length,1);
 assert.match(r.read().pending[0].syncError,/Code.gs/);
 r.c.api=api;await r.c.sync();
 assert.equal(r.central().incomes[0].fechaISO,'2025-11-03');assert.equal(r.read().pending.length,0);
 const response=await api('productionSync',{syncProtocol:'production-receipts-v1',datedOpeningBatch:[intended]});
 response.incomes[0].fechaISO='2025-11-02';
 assert.throws(()=>r.c.window.SKProductionSync.reconcile(response,[intended],{pending:[intended]}),/confirmación/);
});

test('the stock form shows the saved date, preserves edits on refresh, and allows a date before choosing a new spare',()=>{
 const r=runtime(),nodes=new Map(),node=key=>{
  if(!nodes.has(key))nodes.set(key,{hidden:true,replaceChildren(){}});
  return nodes.get(key);
 };
 const other={...part,id:'part11',numero:'11'};
 r.form.dataset={};r.form.elements.search={value:''};r.form.querySelector=node;
 Object.assign(r.c,{catalog:()=>[part,other],byId:node,paintBalances(){},paintStockBalance(){},displayDate:value=>value.split('-').reverse().join('/')});
 r.c.state.incomes[0].fechaISO='2025-11-03';
 vm.runInContext(source.slice(source.indexOf('function paintStockView('),source.indexOf('function paintBalances(')),r.c);
 const refresh=()=>r.c.paintStockView({form:r.form,panel:{querySelector:node},kind:'initial'});
 refresh();assert.equal(r.form.elements.fechaISO.value,'03/11/2025');assert.equal(r.form.elements.fechaISO.disabled,false);
 r.form.elements.fechaISO.value='02/11/2025';r.form.dataset.openingDirty='true';refresh();assert.equal(r.form.elements.fechaISO.value,'02/11/2025');
 r.form.elements.partId.value='';refresh();
 r.form.elements.fechaISO.value='01/11/2025';r.form.elements.partId.value=other.id;refresh();
 assert.equal(r.form.elements.fechaISO.value,'01/11/2025');assert.equal(r.form.elements.cantidad.value,0);
 r.form.elements.partId.value=part.id;refresh();assert.equal(r.form.elements.fechaISO.value,'03/11/2025');
});
