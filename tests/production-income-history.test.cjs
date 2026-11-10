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
 const nodes=new Map();c.byId=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',close(){},showModal(){}});return nodes.get(id)};c.confirm=()=>true;c.displayDate=x=>x;
 vm.runInContext(source.slice(source.indexOf('function canSaveStock('),source.indexOf('const trailingParts=')),c);
 vm.runInContext(source.slice(source.indexOf('const incomeMovements='),source.indexOf('function filterParts(')),c);
 vm.runInContext(source.slice(source.indexOf('async function saveStock('),source.indexOf('for(const view of stockViews){')),c);
 vm.runInContext(source.slice(source.indexOf('let syncRequested=false'),source.indexOf('function showConsumptionView(')),c);
 vm.runInContext(source.slice(source.indexOf('function incomeEditable('),source.indexOf('function showQueryType(')),c);
 const form={elements:{origen:{value:'YT29'},partId:{value:part.id},fechaISO:{value:'10/11/2026'},cantidad:{value:'4'}}};
 return {c,form,save:()=>c.saveStock({preventDefault(){}},{form,kind:'initial'}),read:()=>local,central:()=>central,backend};
}

const income=r=>r.c.state.incomes.find(x=>x.kind==='income');
const edit=async(r,quantity)=>r.c.queueIncomeChange(income(r),'edit',{cantidad:quantity,fechaISO:date,deleted:false});
test('edit is saved offline, replaces income and recalculates inventory without changing opening or consumption',async()=>{
 const r=runtime();r.c.navigator.onLine=false;await edit(r,5);
 assert.equal(r.c.stockFor(part,'YT29'),9);assert.equal(r.read().incomeChanges.length,1);
 assert.equal(r.read().incomes.find(x=>x.kind==='income').cantidad,20);
 r.c.navigator.onLine=true;await r.c.sync();
 assert.equal(r.read().incomeChanges.length,0);assert.equal(income(r).cantidad,5);
 assert.equal(r.central().incomeHistory[0].before.cantidad,20);assert.equal(r.central().incomeHistory[0].after.cantidad,5);
 assert.equal(r.central().incomes.find(x=>x.kind==='initial').cantidad,4);
 assert.equal(r.c.countTotals('YT29','',[part]).get(part.id).incomes,5);
});
test('delete is recoverable, retry is idempotent and revert restores the income and expected balance',async()=>{
 const r=runtime();await r.c.sync();await r.c.deleteIncome(income(r));assert.equal(r.c.stockFor(part,'YT29'),4);
 const api=r.c.api;let once=true;r.c.api=async(...args)=>{const data=await api(...args);if(once){once=false;throw Error('lost response')}return data};
 await r.c.sync();assert.equal(r.read().incomeChanges.length,1);assert.equal(r.central().incomeHistory.length,1);
 await r.c.sync();assert.equal(r.read().incomeChanges.length,0);assert.equal(income(r).deleted,true);assert.equal(r.central().incomeHistory.length,1);
 const entry=r.c.state.incomeHistory[0];await r.c.revertIncome(entry);assert.equal(r.c.stockFor(part,'YT29'),24);await r.c.sync();
 assert.equal(income(r).deleted,false);assert.equal(income(r).cantidad,20);assert.equal(r.central().incomeHistory.length,2);assert.ok(r.central().incomeHistory[0].revertedBy);
});
test('revert edit restores previous quantity and date; a later edit blocks stale undo',async()=>{
 const r=runtime();await r.c.sync();await edit(r,5);await r.c.sync();const first=r.c.state.incomeHistory[0];
 await r.c.revertIncome(first);await r.c.sync();assert.equal(income(r).cantidad,20);
 await edit(r,7);await r.c.sync();const latest=r.c.state.incomeHistory.at(-1);
 await edit(r,8);await r.c.sync();
 const result=r.backend.productionSync_({syncProtocol:'production-receipts-v1',incomeChanges:[{id:randomUUID(),action:'revert',incomeId:income(r).id,baseRevision:income(r).revision,historyId:latest.id}]});
 assert.equal(result.incomeChangeReceipts[0].status,'rejected');assert.equal(income(r).cantidad,8);
});
test('server rejects non-admin, opening edits, invalid amounts and dates, stale versions and duplicate IDs with changed content',async()=>{
 const r=runtime();await r.c.sync();await edit(r,5);const op=r.read().incomeChanges[0];
 const call=operation=>r.backend.productionSync_({syncProtocol:'production-receipts-v1',incomeChanges:[operation]});
 r.backend.verifyProductionToken_=()=>({role:'assistant',document:'doc',personId:'person'});assert.equal(call(op).incomeChangeReceipts[0].status,'rejected');
 r.backend.verifyProductionToken_=()=>({role:'admin',document:'doc',personId:'person'});
 for(const change of [{incomeId:r.central().incomes[0].id},{cantidad:0},{cantidad:-1},{cantidad:1.5},{fechaISO:'2026-02-31'},{fechaISO:'2999-01-01'},{baseRevision:'stale'}])assert.equal(call({...op,...change}).incomeChangeReceipts[0].status,'rejected');
 assert.equal(call(op).incomeChangeReceipts[0].status,'accepted');assert.equal(call(op).incomeChangeReceipts[0].status,'already-applied');
 assert.equal(call({...op,cantidad:8}).incomeChangeReceipts[0].status,'rejected');assert.equal(r.central().incomeHistory.length,1);
});
test('a closed inventory blocks edits and undo; expired undo is rejected',async()=>{
 const r=runtime();await r.c.sync();await edit(r,5);await r.c.sync();const entry=r.central().incomeHistory[0];
 const undo={id:randomUUID(),action:'revert',incomeId:entry.incomeId,baseRevision:entry.id,historyId:entry.id};
 entry.at='2020-01-01T00:00:00.000Z';
 const call=op=>r.backend.productionSync_({syncProtocol:'production-receipts-v1',incomeChanges:[op]});
 assert.match(call(undo).incomeChangeReceipts[0].error,/30 días/);
 r.central().inventoryCounts=[{id:'closed',origin:'YT29',status:'closed',date,closedAt:new Date(Date.now()+1000).toISOString(),rows:[]}];
 assert.match(call({...undo,id:randomUUID(),action:'edit',cantidad:8,fechaISO:date}).incomeChangeReceipts[0].error,/cerrado/);
 assert.match(call({...undo,id:randomUUID()}).incomeChangeReceipts[0].error,/cerrado/);
});
test('canceling either confirmation writes nothing; warning names the affected inventory balance',async()=>{
 const r=runtime();let message='';r.c.confirm=text=>{message=text;return false};
 await r.c.deleteIncome(income(r));assert.match(message,/Borrar este registro afectará el Saldo esperado en el módulo Inventario/);assert.equal((r.read().incomeChanges||[]).length,0);
 r.c.byId('incomeEditDialog').incomeRow=income(r);
 await r.c.byId('incomeEditForm').onsubmit({preventDefault(){},currentTarget:{elements:{cantidad:{value:'5'},fechaISO:{value:date}}}});
 assert.match(message,/Editar este registro afectará la cantidad en el módulo Inventario, en la columna Saldo esperado/);assert.equal((r.read().incomeChanges||[]).length,0);
});
test('old server leaves changes pending; invalid receipt cannot discard them',async()=>{
 const r=runtime(),api=r.c.api;let sent=0;
 r.c.api=async(action,payload)=>{sent+=(payload.incomeChanges||[]).length;const data=await api(action,{...payload,incomeChanges:[]});delete data.incomeChangesV1;return data};
 await edit(r,5);await r.c.sync();assert.equal(sent,0);assert.equal(r.read().incomeChanges.length,1);assert.match(r.read().incomeChanges[0].syncError,/Code.gs/);
 r.c.api=api;await r.c.sync();assert.equal(r.read().incomeChanges.length,0);
 await edit(r,7);r.c.api=async(...args)=>{const data=await api(...args);data.incomeChangeReceipts=[];return data};
 await r.c.sync();assert.equal(r.read().incomeChanges.length,1);
 r.c.api=api;await r.c.sync();assert.equal(r.read().incomeChanges.length,0);assert.equal(income(r).cantidad,7);
});
test('concurrent device change rejects stale edit and restores the central projection',async()=>{
 const r=runtime();await r.c.sync();await edit(r,5);const op=r.read().incomeChanges[0];
 r.backend.productionSync_({syncProtocol:'production-receipts-v1',incomeChanges:[{...op,id:randomUUID(),cantidad:12,after:{...op.after,cantidad:12}}]});
 await r.c.sync();assert.equal(r.read().incomeChanges[0].syncRejected,true);assert.equal(r.c.stockFor(part,'YT29'),16);
});
test('a new correction does not disappear while an older sync request finishes',async()=>{
 const r=runtime();await r.c.sync();const api=r.c.api;let release,started;const began=new Promise(resolve=>started=resolve);
 r.c.api=async(...args)=>{const data=await api(...args);started();await new Promise(resolve=>release=resolve);return data};
 const syncing=r.c.sync();await began;await edit(r,5);release();r.c.api=api;await syncing;await r.c.sync();
 assert.equal(r.read().incomeChanges.length,0);assert.equal(income(r).cantidad,5);
});

test('a failed central write issues no success receipt and keeps the correction available for retry',async()=>{
 const r=runtime();await r.c.sync();await edit(r,5);
 r.backend.DriveApp.getFilesByName=()=>{let used=false;return {hasNext:()=>!used,next:()=>{used=true;return {getBlob:()=>({getDataAsString:()=>JSON.stringify(r.central())}),setContent(){throw Error('Drive unavailable')}}}}};
 await r.c.sync();assert.equal(r.read().incomeChanges.length,1);assert.equal(r.central().incomes.find(x=>x.kind==='income').cantidad,20);assert.equal((r.central().incomeHistory||[]).length,0);
});
