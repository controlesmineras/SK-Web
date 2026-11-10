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
 return {c,form,save:()=>c.saveStock({preventDefault(){}},{form,kind:'adjustment'}),read:()=>local,central:()=>central,backend};
}
test('offline save changes the local display from 24 to 4, persists the request and later confirms it',async()=>{
 const r=runtime();r.c.navigator.onLine=false;let calls=0;const api=r.c.api;r.c.api=async(...args)=>{calls++;return api(...args)};
 await r.save();assert.equal(calls,0);assert.equal(r.read().pending.length,1);
 assert.equal(r.c.stockFor(part,'YT29'),4);assert.equal(r.read().pending[0].baseQuantity,24);
 assert.match(r.c.formMessage,/GUARDADO EN ESTE EQUIPO/);assert.match(r.c.formMessage,/PENDIENTE/);
 r.c.navigator.onLine=true;await r.c.sync();assert.equal(r.read().pending.length,0);assert.equal(r.central().incomes.at(-1).target,4);
 r.form.elements.cantidad.value='0';await r.save();await r.c.sync();assert.equal(r.c.stockFor(part,'YT29'),0);
});
test('an expired online token does not prevent saving locally',async()=>{
 const r=runtime();r.c.session.expiresAt=1;await r.save();
 assert.equal(r.read().pending.length,1);assert.equal(r.c.stockFor(part,'YT29'),4);
 const result=await r.c.sync();assert.equal(result.ok,false);assert.match(result.error,/renovar/);
});
test('a lost response retries the same ID without applying an adjustment twice',async()=>{
 const r=runtime();await r.c.sync();const api=r.c.api;
 await r.save();r.c.api=async(...args)=>{await api(...args);throw new Error('Respuesta perdida')};
 await r.c.sync();assert.equal(r.read().pending.length,1);assert.equal(r.central().incomes.at(-1).target,4);
 r.c.api=api;await r.c.sync();assert.equal(r.read().pending.length,0);
 assert.equal(r.central().incomes.filter(row=>row.kind==='adjustment').length,1);assert.equal(r.c.stockFor(part,'YT29'),4);
});
test('a rejected consumption no longer blocks an independent stock adjustment',async()=>{
 const r=runtime();await r.c.sync();
 const bad=movement('bad-consume-00001',undefined,1,{partId:'another-part',tipoEquipo:'YT',assetId:'missing',responsableId:'missing'});
 await r.c.changeState('doc',current=>({...current,pending:[bad]}));r.c.state=await r.c.changeState('doc');
 await r.save();const result=await r.c.sync();
 assert.equal(result.ok,false);assert.equal(r.read().pending.length,1);assert.equal(r.read().pending[0].id,bad.id);assert.equal(r.read().pending[0].syncRejected,true);
 assert.equal(r.central().incomes.at(-1).target,4);assert.equal(r.c.stockFor(part,'YT29'),4);
});
test('a stock change from another device rejects the stale correction and shows the central balance',async()=>{
 const r=runtime();await r.c.sync();await r.save();
 r.backend.productionSync_({pending:[movement('other-device-0001','income',2)]});
 const result=await r.c.sync();assert.equal(result.ok,false);
 assert.equal(r.central().incomes.filter(row=>row.kind==='adjustment').length,0);
 assert.equal(r.read().pending[0].cantidad,4);assert.equal(r.read().pending[0].syncRejected,true);
 assert.match(r.read().pending[0].syncError,/Saldo actual: 26/);assert.equal(r.c.stockFor(part,'YT29'),26);
});
test('a previous server cannot silently apply a local adjustment without checking the observed balance',async()=>{
 const r=runtime(),api=r.c.api;let sentAdjustments=0;
 r.c.api=async(action,payload)=>{sentAdjustments+=payload.pending.filter(row=>row.kind==='adjustment').length;const data=await api(action,{...payload,syncProtocol:undefined});delete data.stockAdjustmentLocalV1;return data;};
 await r.save();await r.c.sync();assert.equal(sentAdjustments,0);assert.equal(r.read().pending.length,1);assert.match(r.read().pending[0].syncError,/Code.gs/);
 r.c.api=api;await r.c.sync();assert.equal(r.read().pending.length,0);assert.equal(r.c.stockFor(part,'YT29'),4);
});
test('an income before an offline adjustment and a consumption afterwards preserve operation order',async()=>{
 const r=runtime();r.c.navigator.onLine=false;
 r.form.elements.cantidad.value='6';await r.c.saveStock({preventDefault(){}},{form:r.form,kind:'income'});
 r.form.elements.cantidad.value='4';await r.save();assert.equal(r.read().pending[1].baseQuantity,30);
 await r.c.changeState('doc',current=>({...current,pending:[...current.pending,movement('consume-after-001',undefined,1,{tipoEquipo:'YT',assetId:'machine',responsableId:'person',turno:'D'})]}));r.c.state=await r.c.changeState('doc');
 assert.equal(r.c.stockFor(part,'YT29'),3);
 r.c.navigator.onLine=true;await r.c.sync();assert.equal(r.read().pending.length,0);assert.equal(r.c.stockFor(part,'YT29'),3);
});
test('a double tap and a second target cannot duplicate or replace the pending operation',async()=>{
 const r=runtime();await Promise.all([r.save(),r.save()]);assert.equal(r.read().pending.length,1);
 r.form.elements.cantidad.value='7';await r.save();assert.equal(r.read().pending[0].cantidad,4);assert.match(r.c.formMessage,/ya tiene un ajuste pendiente/);
});
test('a storage failure does not show local success or change the entered quantity',async()=>{
 const r=runtime();r.c.changeState=async()=>{throw new Error('No se pudo guardar en este dispositivo')};await r.save();
 assert.equal(r.form.elements.cantidad.value,'4');assert.equal(r.c.saving,false);assert.match(r.c.formMessage,/No se pudo guardar/);
});
test('server receipts are never returned when the central write fails',()=>{
 const r=runtime();r.backend.DriveApp.getFilesByName=()=>{let used=false;return {hasNext:()=>!used,next:()=>{used=true;return {getBlob:()=>({getDataAsString:()=>JSON.stringify(r.central())}),setContent(){throw new Error('Drive unavailable')}}}}};
 assert.throws(()=>r.backend.productionSync_({syncProtocol:'production-receipts-v1',pending:[movement('adjustment-000001','adjustment',4,{baseQuantity:24})]}),/Drive unavailable/);
 assert.equal(r.central().incomes.length,2);
});
test('legacy clients keep all-or-nothing behavior instead of losing rejected rows',()=>{
 const r=runtime();assert.throws(()=>r.backend.productionSync_({pending:[movement('good-income-0001','income',2),movement('bad-income-00001','income',-1)]}),/Cantidad/);
 assert.equal(r.central().incomes.length,2);
});
test('a rejected first row does not starve the next batch of a thousand pending records',async()=>{
 const r=runtime();await r.c.sync();
 const bad=movement('bad-income-00001','income',-1,{partId:'unknown'});
 const good=Array.from({length:1000},(_,i)=>movement('income-batch-'+String(i).padStart(5,'0'),'income',1));
 await r.c.changeState('doc',current=>({...current,pending:[bad,...good]}));r.c.state=await r.c.changeState('doc');
 let calls=0,maxBatch=0;const api=r.c.api;r.c.api=async(action,payload)=>{calls++;maxBatch=Math.max(maxBatch,payload.pending.length);return api(action,payload)};
 await r.c.sync();assert.equal(maxBatch,1000);assert.equal(calls,2);
 assert.equal(r.read().pending.length,1);assert.equal(r.read().pending[0].id,bad.id);assert.equal(r.c.stockFor(part,'YT29'),1024);
});
test('cached capabilities cannot make an old server apply an unchecked stock correction',async()=>{
 const r=runtime();await r.c.sync();await r.save();
 const api=r.c.api;r.c.api=async(action,payload)=>{const data=await api(action,{...payload,syncProtocol:undefined});delete data.stockAdjustmentLocalV1;return data};
 await r.c.sync();assert.equal(r.central().incomes.filter(row=>row.kind==='adjustment').length,0);assert.equal(r.read().pending.length,1);
});
test('stock form distinguishes locally saved, centrally confirmed and rejected quantities',async()=>{
 const r=runtime(),nodes=new Map(),node=key=>{if(!nodes.has(key))nodes.set(key,{hidden:true,textContent:'',replaceChildren(){},append(){}});return nodes.get(key)};
 r.form.dataset={};r.form.elements.search={value:'O-ring'};r.form.querySelector=node;
 r.c.byId=node;r.c.document.createElement=()=>({append(){}});r.c.displayDate=value=>value;r.c.partLabel=row=>row.nombre;
 r.c.paintBalances=()=>{};
 vm.runInContext(source.slice(source.indexOf('function paintStockView('),source.indexOf('function paintBalances(')),r.c);
 const view={form:r.form,panel:{querySelector:node},kind:'adjustment'};
 await r.save();r.c.paintStockView(view);
 assert.equal(r.form.elements.cantidad.disabled,true);assert.match(r.c.formMessage,/PENDIENTE/);assert.equal(node('reviewStockAdjustment').hidden,true);
 await r.c.sync();r.c.paintStockView(view);
 assert.equal(r.form.elements.cantidad.disabled,false);assert.match(r.c.formMessage,/CONFIRMADA EN LA BASE CENTRAL: 4/);
 r.form.elements.cantidad.value='6';await r.save();r.backend.productionSync_({pending:[movement('other-income-0001','income',2)]});
 await r.c.sync();r.c.paintStockView(view);assert.equal(node('reviewStockAdjustment').hidden,false);assert.match(r.c.formMessage,/existencia cambió/);
});
