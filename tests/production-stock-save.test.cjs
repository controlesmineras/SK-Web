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
  readFile_:()=>({personal:[{id:'person',documento:'doc',nombre:'Administrador'}],assets:[],parts:[part],inventoryCriteria:[]}),
  DriveApp:{getFilesByName:()=>{let done=false;return {hasNext:()=>!done,next:()=>{done=true;return file}}}},PRODUCTION_FILE:'production',Utilities:{formatDate:()=>date},json_:x=>x,productionRole_:x=>x,cargoNorm_:x=>String(x||'').toLowerCase()});
 vm.runInContext(server.slice(server.indexOf('function productionSync_(')),backend);
 let local=structuredClone({...central,stockAdjustment:true,parts:[part],pending:[]});
 const c=vm.createContext({state:structuredClone(local),session:{token:'online',expiresAt:Date.now()+60000,user:{document:'doc',role:'admin'}},saving:false,syncing:false,syncRequested:false,syncFailed:false,syncConnectionFailed:false,countSelection:'',countDirty:false,countSaving:false,
  window:{addEventListener(){}},navigator:{onLine:true},crypto:{randomUUID},today:()=>date,readDate:()=>date,
  status:message=>{c.message=message},stockStatus:(form,message)=>{c.formMessage=message},paintSync(){},paint(){},console:{error(){}},
  changeState:async(document,update)=>{if(update)local=structuredClone(update(structuredClone(local)));return structuredClone(local)},
  api:async(action,payload)=>backend.productionSync_(payload)});
 c.canSync=()=>c.session?.expiresAt>Date.now();
 vm.runInContext(fs.readFileSync('spare-catalog.js','utf8'),c);
 c.catalog=()=>[part];
 vm.runInContext(source.slice(source.indexOf('function canSaveStock('),source.indexOf('const trailingParts=')),c);
 vm.runInContext(source.slice(source.indexOf('const incomeMovements='),source.indexOf('function filterParts(')),c);
 vm.runInContext(source.slice(source.indexOf('async function saveStock('),source.indexOf('for(const view of stockViews){')),c);
 vm.runInContext(source.slice(source.indexOf('async function sync(){'),source.indexOf('function showConsumptionView(')),c);
 const form={elements:{origen:{value:'YT29'},partId:{value:part.id},fechaISO:{value:'10/11/2026'},cantidad:{value:'4'}}};
 return {c,form,save:()=>c.saveStock({preventDefault(){}},{form,kind:'adjustment'}),read:()=>local,central:()=>central};
}
test('saving the actual form changes 24 to 4 and then zero, confirmed by the server ledger',async()=>{
 const r=runtime();assert.equal(r.c.stockFor(part,'YT29'),24);
 await r.save();
 assert.equal(r.c.stockFor(part,'YT29'),4);assert.equal(r.read().pending.length,0);
 assert.equal(r.form.elements.cantidad.value,'');assert.match(r.c.formMessage,/CONFIRMADA: 4/);
 r.form.elements.cantidad.value='0';await r.save();
 assert.equal(r.c.stockFor(part,'YT29'),0);assert.match(r.c.formMessage,/CONFIRMADA: 0/);
});
test('failed sync keeps the typed quantity and retry confirms the same adjustment without duplicates',async()=>{
 const r=runtime(),api=r.c.api;
 r.c.api=async()=>{throw new Error('No se pudo conectar con el servidor')};
 await r.save();
 assert.equal(r.form.elements.cantidad.value,'4');assert.equal(r.read().pending.length,1);
 assert.equal(r.c.stockFor(part,'YT29'),24);assert.match(r.c.formMessage,/No se pudo conectar/);
 const id=r.read().pending[0].id;r.c.api=api;await r.save();
 assert.equal(r.c.stockFor(part,'YT29'),4);assert.equal(r.central().incomes.filter(row=>row.id===id).length,1);
 assert.equal(r.read().pending.length,0);
});
test('an earlier adjustment with a lost response is confirmed before saving a different new quantity',async()=>{
 const r=runtime(),api=r.c.api;
 r.c.api=async(action,payload)=>{await api(action,payload);throw new Error('Respuesta perdida')};
 await r.save();assert.equal(r.central().incomes.at(-1).target,4);
 r.form.elements.cantidad.value='7';r.c.api=api;await r.save();
 assert.equal(r.c.stockFor(part,'YT29'),7);assert.equal(r.read().pending.length,0);
 assert.deepEqual(r.central().incomes.filter(row=>row.kind==='adjustment').map(row=>row.target),[4,7]);
});
test('save waits for an existing sync and a double tap queues only one adjustment',async()=>{
 const r=runtime(),api=r.c.api;let release,entered;
 const started=new Promise(resolve=>{entered=resolve}),gate=new Promise(resolve=>{release=resolve});
 let calls=0;r.c.api=async(action,payload)=>{if(++calls===1){entered();await gate}return api(action,payload)};
 const earlier=r.c.sync();await started;
 const save=r.save();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(r.c.saving,true);assert.equal(r.form.elements.cantidad.value,'4');
 await r.save();release();await Promise.all([earlier,save]);
 assert.equal(r.c.stockFor(part,'YT29'),4);assert.equal(r.central().incomes.filter(row=>row.kind==='adjustment').length,1);
});
test('an unconfirmed unrelated row does not hide a confirmed stock adjustment or discard the pending row',async()=>{
 const r=runtime(),api=r.c.api;
 const pending=movement('unconfirmed-00001','income',3,{partId:'another-part'});
 await r.c.changeState('doc',current=>({...current,pending:[pending]}));r.c.state=await r.c.changeState('doc');
 r.c.api=async(action,payload)=>{const data=await api(action,{...payload,pending:payload.pending.filter(row=>row.id!==pending.id)});return data;};
 await r.save();
 assert.equal(r.read().pending.length,1);assert.equal(r.read().pending[0].id,pending.id);
 assert.equal(r.central().incomes.at(-1).target,4);assert.match(r.c.formMessage,/CONFIRMADA: 4/);
 assert.equal(r.c.stockFor(part,'YT29'),4);
 assert.equal(r.c.syncFailed,true);
});
test('a mismatched target cannot report success or mask the confirmed server balance',async()=>{
 const r=runtime(),api=r.c.api;
 r.c.api=async(action,payload)=>api(action,{...payload,pending:payload.pending.map(row=>row.kind==='adjustment'?{...row,cantidad:6}:row)});
 await r.save();
 assert.equal(r.form.elements.cantidad.value,'4');assert.equal(r.read().pending.length,1);
 assert.equal(r.c.stockFor(part,'YT29'),6);assert.doesNotMatch(r.c.formMessage,/GUARDADA Y CONFIRMADA/);
});
test('expired online access and missing server capability give an explicit message without losing the quantity',async()=>{
 const r=runtime();r.c.session.expiresAt=1;await r.save();
 assert.match(r.c.formMessage,/renovar el acceso/);assert.equal(r.form.elements.cantidad.value,'4');assert.equal(r.read().pending.length,0);
 r.c.session.expiresAt=Date.now()+60000;r.c.state.stockAdjustment=false;await r.save();
 assert.match(r.c.formMessage,/implementación de Apps Script/);assert.equal(r.read().pending.length,0);
});
test('offline income still saves locally and increases the available stock',async()=>{
 const r=runtime();r.c.navigator.onLine=false;
 r.c.api=async()=>{throw new Error('Offline must not call the API')};
 await r.c.saveStock({preventDefault(){}},{form:r.form,kind:'income'});
 assert.equal(r.read().pending.length,1);assert.equal(r.read().pending[0].kind,'income');
 assert.equal(r.c.stockFor(part,'YT29'),28);assert.equal(r.form.elements.cantidad.value,'');
 assert.match(r.c.formMessage,/pendiente de sincronizar/);
});
test('a storage failure keeps the quantity and shows the error next to save',async()=>{
 const r=runtime();r.c.changeState=async()=>{throw new Error('No se pudo guardar en este dispositivo')};
 await r.save();
 assert.equal(r.form.elements.cantidad.value,'4');assert.equal(r.c.saving,false);
 assert.match(r.c.formMessage,/No se pudo guardar/);assert.equal(r.central().incomes.length,2);
});
