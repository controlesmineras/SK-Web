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
  window:{addEventListener(){}},document:{addEventListener(){},hidden:false},setTimeout:()=>1,clearTimeout(){},setInterval(){},navigator:{onLine:true},crypto:{randomUUID},today:()=>date,readDate:()=>date,
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
 const form={elements:{origen:{value:'YT29'},partId:{value:part.id},fechaISO:{value:'10/11/2026'},cantidad:{value:'4'}}};
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
 r.form.elements.cantidad.value='0';await r.save();await r.c.sync();assert.equal(r.c.stockFor(part,'YT29'),20);
 r.backend.productionSync_({pending:[movement('new-income-000001','income',3)]});await r.c.sync();assert.equal(r.c.stockFor(part,'YT29'),23);
});
test('opening preview includes all income and retains historical stock adjustments',()=>{
 const r=runtime();assert.match(r.c.stockSummaryText(part,'YT29','7'),/SALDO ESPERADO CON ESTA APERTURA: 27/);
 assert.equal(r.central().incomes[1].cantidad,20);
});

test('repeated offline edits replace one opening, synchronize once and never create income or adjustments',async()=>{
 const r=runtime();r.c.navigator.onLine=false;
 // A new inventory starts with no stock movements.
 r.central().incomes.length=0;
 await r.c.changeState('doc',x=>({...x,incomes:[]}));r.c.state=await r.c.changeState('doc');
 let id;
 for(const quantity of [4,9,0,7]){
  r.form.elements.cantidad.value=String(quantity);await r.save();
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
 r.form.elements.cantidad.value='9';await r.save();release();
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
