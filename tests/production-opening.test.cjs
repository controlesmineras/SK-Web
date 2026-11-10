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
