const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{randomUUID}=require('node:crypto');
const source=fs.readFileSync('backend/apps-script/Code.gs','utf8');
const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Bogota'}).format(new Date());
const cutoff=date+'T00:00:00.000Z';
const item={id:'tool',name:'Llave',unit:'Unidad',allowLoan:true,active:true};
const spare={id:'spare',name:'Repuesto YT29',isYtSpare:true,spareEquipment:'YT 29',productionPartId:'p10',spareItemNumber:'10',spareItemName:'Pieza',unit:'Unidad'};
const part={id:'p10',clase:'YT',detalle:'29',numero:'10',nombre:'Pieza'};
function runtime({enabled=true,allowSpareDelivery=false,production={},central={}}={}){
 const rows=new Map([['central',{personal:[{id:'person',documento:'doc',nombre:'Funcionario'}],assets:[],inventoryCriteria:[item,spare],parts:[part],inventoryStock:[{id:'stock-tool',itemId:'tool',quantity:3}],blendingDeliveries:[],updatedAt:cutoff,...structuredClone(central)}],['production',{consumptions:[],incomes:[],...structuredClone(production)}]]);
 const props=new Map([['SK_PRODUCTION_WAREHOUSE',JSON.stringify({enabled,allowSpareDelivery,transferStartAt:cutoff})]]);
 let held=false,fail='',failAfter=0,counts={central:0,production:0};
 const file=id=>({getId:()=>id,getName:()=>id,getLastUpdated:()=>new Date(),getBlob:()=>({getDataAsString:()=>JSON.stringify(rows.get(id))}),setContent:body=>{if(fail===id&&failAfter--<=0){fail='';throw Error('Drive write failed');}counts[id]++;rows.set(id,JSON.parse(body));}});
 const lock={hasLock:()=>held,waitLock(){assert.equal(held,false,'nested lock');held=true;},releaseLock(){assert.equal(held,true);held=false;}};
 const c=vm.createContext({console,Date,Map,Set,LockService:{getScriptLock:()=>lock},PropertiesService:{getScriptProperties:()=>({getProperty:key=>props.get(key)||null,setProperty:(key,value)=>props.set(key,value),deleteProperty:key=>props.delete(key),getProperties:()=>Object.fromEntries(props)})},DriveApp:{getFileById:file,getFilesByName:name=>{const id=name==='sk-web-central.json'?'central':'production';let used=false;return{hasNext:()=>!used&&rows.has(id),next:()=>{used=true;return file(id)}}},createFile:(name,body)=>{const id=name==='sk-web-central.json'?'central':'production';rows.set(id,JSON.parse(body));return file(id)}},MimeType:{PLAIN_TEXT:'text/plain'},Utilities:{formatDate:()=>date,getUuid:randomUUID},CacheService:{getScriptCache:()=>({get:()=>null,put(){},remove(){}})}});
 vm.runInContext(source,c);
 c.json_=value=>value;c.findFile_=()=> 'central';c.completePendingAssetMarks_=()=>false;
 c.verifyProductionToken_=token=>{if(token==='plaza')throw Error('Sesión no válida');return{document:'doc',personId:'person',role:token||'warehouse',roles:token==='both'?['mechanic','warehouse']:[token||'warehouse']}};
 c.verifyToken_=()=>({document:'doc',role:'plaza_operator'});
 const sync=(pending=[],extra={})=>c.productionWarehouseSync_({token:'warehouse',pending,...extra});
 return {c,sync,rows,props,counts,fail:(id,after=0)=>{fail=id;failAfter=after},get production(){return rows.get('production')},get central(){return rows.get('central')}};
}
const op=(kind,quantity=1,extra={})=>({id:randomUUID(),kind,itemId:'tool',quantity,fechaISO:date,personId:'person',destination:'Nivel 4',createdAt:new Date().toISOString(),...extra});
const transfer=(id='source',extra={})=>({id,itemId:'tool',quantity:10,destination:'Producción',createdAt:cutoff,...extra});
test('EPP is excluded only from Production catalog, balances, imports and new movements',()=>{
 const epp={id:'epp',name:'Guantes de protección',unit:'Par',isEpp:true,allowLoan:true};
 const textEpp={...epp,id:'epp-text',isEpp:'true'};
 const r=runtime({central:{inventoryCriteria:[item,epp,textEpp],inventoryStock:[{id:'epp-stock',itemId:'epp',quantity:20}],blendingDeliveries:[transfer('source-epp',{itemId:'epp'})]}});
 const first=r.sync([],{catalogRevision:cutoff});
 assert.ok(first.catalog,'changing the policy forces a fresh catalog even when central data did not change');
 assert.deepEqual(Array.from(first.catalog.criteria,row=>row.id),['tool']);
 assert.deepEqual(Array.from(first.balances,row=>row.itemId),['tool']);assert.equal(first.rows.length,0);
 for(const kind of ['income','opening','delivery','loan','return','transfer_out']){
  const result=r.sync([op(kind,1,{itemId:'epp'})],{token:'admin'});
  assert.equal(result.receipts[0].status,'rejected');assert.match(result.receipts[0].error,/EPP/);
 }
 const plaza=r.c.plazaSync_({token:'plaza',data:{},syncProtocol:'plaza-receipts-v1'});
 assert.ok(plaza.data.inventoryCriteria.some(row=>row.id==='epp'&&row.isEpp===true));
 assert.equal(plaza.data.inventoryStock.find(row=>row.itemId==='epp').quantity,20);
 assert.equal(r.central.inventoryCriteria.find(row=>row.id==='epp').isEpp,true);
 assert.equal(r.sync([],{catalogRevision:first.catalogRevision}).catalog,undefined);
});
test('warehouse requests are authenticated by Production rather than Web Admin',()=>{
 const r=runtime();r.c.verifyAdminToken_=()=>{throw Error('Must not validate warehouse access as Web Admin');};
 const result=r.c.doPost({postData:{contents:JSON.stringify({action:'productionWarehouseSync',token:'warehouse',pending:[]})}});
 assert.equal(result.ok,true);assert.equal(result.protocol,'production-warehouse-v1');
});
test('warehouse uses its own quantities, imports once and excludes pre-activation and reversed deliveries',()=>{
 const r=runtime({central:{blendingDeliveries:[transfer(),transfer('old',{createdAt:'2020-01-01T00:00:00Z'}),transfer('reversed',{reversed:true}),transfer('other',{destination:'Otra bodega'})]}});
 assert.equal(r.sync().balances.find(row=>row.itemId==='tool').quantity,10);
 assert.equal(r.sync().rows.length,1);assert.equal(r.production.warehouseMovements.length,1);assert.equal(r.central.inventoryStock[0].quantity,3);
});
test('cursor returns only new movements and stable catalog is not retransmitted',()=>{
 const r=runtime(),first=r.sync([op('income',5)]),second=r.sync([],{cursor:first.cursor,catalogRevision:first.catalogRevision});
 assert.equal(second.rows.length,0);assert.equal(second.catalog,undefined);
 const third=r.sync([op('delivery',2)],{cursor:first.cursor,catalogRevision:first.catalogRevision});assert.equal(third.rows.length,1);assert.equal(third.balances[0].quantity,3);
});
test('same ID is idempotent, changed payload is rejected and valid independent work continues',()=>{
 const r=runtime(),income=op('income',5);r.sync([income]);
 const result=r.sync([income,op('delivery',99),op('delivery',2)]);
 assert.deepEqual(Array.from(result.receipts,x=>x.status),['already-applied','rejected','accepted']);assert.equal(result.balances[0].quantity,3);
 assert.equal(r.sync([{...income,quantity:9}]).receipts[0].status,'rejected');
});
test('partial loan returns cannot exceed the outstanding quantity; repeated return is applied once',()=>{
 const r=runtime(),loan=op('loan',6);r.sync([op('income',10),loan]);
 const returned=op('return',2,{loanId:loan.id});r.sync([returned]);r.sync([returned]);
 assert.equal(r.sync([op('return',5,{loanId:loan.id})]).receipts[0].status,'rejected');
 assert.equal(r.sync([op('return',4,{loanId:loan.id})]).balances[0].quantity,10);
});
test('new warehouse is disabled by default and only admin can save opening quantities',()=>{
 const r=runtime({enabled:false});assert.equal(r.sync([op('income')]).receipts[0].status,'rejected');
 const active=runtime();assert.equal(active.sync([op('opening',5)]).receipts[0].status,'rejected');
 assert.equal(active.sync([op('opening',5)],{token:'admin'}).balances[0].quantity,5);
 assert.equal(active.sync([op('opening',4)],{token:'admin'}).receipts[0].status,'rejected');
});
test('Plaza credentials and mechanic-only credentials cannot read warehouse quantities',()=>{
 const r=runtime();assert.throws(()=>r.sync([],{token:'plaza'}),/Sesión/);assert.throws(()=>r.sync([],{token:'mechanic'}),/acceso/);
 assert.equal(r.sync([],{token:'both'}).ok,true);
 r.sync([op('income',12345)]);
 const response=r.c.plazaSync_({token:'plaza',data:{},syncProtocol:'plaza-receipts-v1'});
 assert.equal(response.data.inventoryStock[0].quantity,3);assert.equal(JSON.stringify(response).includes('12345'),false);assert.equal(response.data.warehouseMovements,undefined);
 assert.throws(()=>r.c.productionSync_({token:'warehouse'}),/Bodega/);
});
test('spares have one stock shared with mechanics and outgoing stock is blocked until enabled',()=>{
 const r=runtime({central:{blendingDeliveries:[transfer('spare-source',{itemId:'spare'})]}});
 assert.equal(r.sync().balances.find(row=>row.itemId==='spare').quantity,10);assert.equal(r.production.incomes.length,1);
 assert.equal(r.sync([op('delivery',3,{itemId:'spare'})]).receipts[0].status,'rejected');
 r.props.set('SK_PRODUCTION_WAREHOUSE',JSON.stringify({enabled:true,allowSpareDelivery:true,transferStartAt:cutoff}));
 const out=op('delivery',3,{itemId:'spare'});assert.equal(r.sync([out]).balances.find(row=>row.itemId==='spare').quantity,7);r.sync([out]);assert.equal(r.production.incomes.length,2);
 const result=r.c.productionSync_({token:'mechanic',pending:[],warehouseV1:true});assert.equal(result.incomes.filter(row=>row.kind==='warehouse-out').length,1);assert.equal(result.warehouseMovements,undefined);
 assert.throws(()=>r.c.productionSync_({token:'mechanic',pending:[]}),/Actualiza/);
});
test('sending to Plaza survives a lost central write and recovers once before Plaza reads',()=>{
 const r=runtime();r.sync([op('income',10)]);const out=op('transfer_out',4);
 r.fail('central');assert.throws(()=>r.sync([out]),/Drive/);assert.equal(r.production.warehouseMovements.at(-1).bridgePending,true);
 const central=r.c.readFile_('central');assert.equal(central.inventoryStock[0].quantity,7);assert.equal(central.blendingIncomes.length,1);
 const retry=r.sync([out]);assert.equal(retry.receipts[0].status,'already-applied');assert.equal(retry.balances[0].quantity,6);assert.equal(r.central.inventoryStock[0].quantity,7);
});
test('failure after central commit replays the durable bridge without incrementing Plaza twice',()=>{
 const r=runtime();r.sync([op('income',10)]);const out=op('transfer_out',4);
 r.fail('production',1);assert.throws(()=>r.sync([out]),/Drive/);assert.equal(r.central.inventoryStock[0].quantity,7);
 assert.equal(r.sync([out]).receipts[0].status,'already-applied');assert.equal(r.central.inventoryStock[0].quantity,7);
});
test('fixed asset cannot be lent twice and comes back under the same identity',()=>{
 const fixed={id:'machine-criterion',name:'Taladro',isFixedAsset:true,allowLoan:true};
 const r=runtime({central:{inventoryCriteria:[fixed],assets:[{id:'asset',clase:'Taladro',estado:'Operativo',ubicacion:'Producción'}]}});
 r.sync([op('income',1,{itemId:fixed.id,assetId:'asset'})]);const loan=op('loan',1,{itemId:fixed.id,assetId:'asset'});
 assert.equal(r.sync([loan]).receipts[0].status,'accepted');assert.equal(r.sync([op('loan',1,{itemId:fixed.id,assetId:'asset'})]).receipts[0].status,'rejected');
 assert.equal(r.sync([op('return',1,{itemId:fixed.id,assetId:'asset',loanId:loan.id})]).receipts[0].status,'accepted');assert.equal(r.central.assets[0].ubicacion,'Producción');
});
test('transfer-derived incomes cannot be edited independently and imported source cannot be reversed in Plaza',()=>{
 const r=runtime({central:{blendingDeliveries:[transfer('spare-source',{itemId:'spare'})]}});r.sync();
 const income=r.production.incomes[0];assert.throws(()=>r.c.productionIncomeChange_({id:randomUUID(),action:'delete',incomeId:income.id},new Map([[income.id,income]]),r.production,{role:'admin'},{}),/traslado/);
 assert.throws(()=>r.c.adminReverseMovement_({type:'delivery',movementId:'spare-source',reversalRequestedBy:'Prueba'}),/Producción/);
});
test('new external fixed asset gets one global identity and repeated sync does not register it twice',()=>{
 const fixed={id:'machine-criterion',name:'Taladro',isFixedAsset:true,usesSerial:true,usesModel:true};
 const r=runtime({central:{inventoryCriteria:[fixed]}}),id=randomUUID();
 const incoming=op('income',1,{itemId:fixed.id,newAsset:{id,serial:'SERIAL-NEW',modelo:'Modelo A',marcaComercial:'Marca'},incomeType:'REPARACIÓN'});
 const saved=r.sync([incoming]);assert.equal(saved.receipts[0].status,'accepted',saved.receipts[0].error);
 assert.equal(r.central.assets[0].id,id);assert.equal(r.central.assets[0].estado,'En reparación');assert.match(r.central.assets[0].marcaActual,/^[A-Z]{3}$/);
 r.sync([incoming]);assert.equal(r.central.assets.length,1);assert.equal(r.central.assetMarkRegistry.length,1);
 assert.equal(r.sync([op('income',1,{itemId:fixed.id,newAsset:{id:randomUUID(),serial:'SERIAL-NEW',modelo:'Modelo A'}})]).receipts[0].status,'rejected');
});
test('fixed asset opening allows multiple different assets of the same class',()=>{
 const fixed={id:'machine-criterion',name:'Taladro',isFixedAsset:true};
 const r=runtime({central:{inventoryCriteria:[fixed],assets:['a','b'].map(id=>({id,clase:'Taladro',estado:'Operativo',ubicacion:'Producción'}))}});
 const result=r.sync(['a','b'].map(assetId=>op('opening',1,{itemId:fixed.id,assetId})),{token:'admin'});
 assert.equal(result.receipts.filter(row=>row.status==='accepted').length,2);assert.equal(result.balances[0].quantity,2);
});
test('Plaza loan returned by Production closes the original loan and restores Plaza only once',()=>{
 const original=transfer('loan-source',{deliveryType:'PRÉSTAMO'}),r=runtime({central:{blendingDeliveries:[original]}});r.sync();
 assert.throws(()=>r.c.applyPlazaLoanReturn_({loanId:original.id},null,r.central.blendingDeliveries,r.central,{}),/Producción/);
 const partial=op('transfer_out',4,{sourceLoanId:original.id});assert.equal(r.sync([partial]).receipts[0].status,'rejected');
 const returned=op('transfer_out',10,{sourceLoanId:original.id});r.sync([returned]);r.sync([returned]);
 assert.equal(r.central.inventoryStock[0].quantity,13);assert.equal(r.central.blendingDeliveries.length,2);assert.equal(r.central.blendingDeliveries[1].movementType,'DEVOLUCIÓN');assert.equal(r.central.blendingDeliveries[1].loanId,original.id);assert.equal((r.central.blendingIncomes||[]).length,0);
});
test('spare warehouse movements cannot be backdated before the latest closed count',()=>{
 const closed={id:'closed',origin:'YT29',date,status:'closed',closedAt:cutoff,rows:[{partId:'p10',aliases:['p10','spare'],physical:10}]};
 const r=runtime({allowSpareDelivery:true,production:{inventoryCounts:[closed]}});
 assert.equal(r.sync([op('delivery',3,{itemId:'spare',fechaISO:'2020-01-01'})]).receipts[0].status,'rejected');
 assert.equal(r.sync([op('delivery',3,{itemId:'spare'})]).balances.find(row=>row.itemId==='spare').quantity,7);
});
test('mechanic consumption cannot spend spares already delivered by warehouse',()=>{
 const r=runtime({allowSpareDelivery:true,central:{assets:[{id:'machine',clase:'YT'}]}});r.sync([op('income',5,{itemId:'spare'}),op('delivery',4,{itemId:'spare'})]);
 assert.throws(()=>r.c.productionSync_({token:'mechanic',warehouseV1:true,pending:[{id:randomUUID(),cantidad:2,partId:'p10',origen:'YT29',tipoEquipo:'YT',assetId:'machine',responsableId:'person',fechaISO:date,turno:'D'}]}),/existencias/);
});
test('roles persist together and legacy single-role accounts keep their permissions',()=>{
 const r=runtime();r.c.productionAccessKey_=document=>'SK_PROD_USER_'+document;
 r.c.saveProductionAccess_({id:'person',documento:'doc'},'test-hash',['mechanic','warehouse']);
 const saved=r.c.productionAccess_('doc');assert.deepEqual(Array.from(saved.roles),['mechanic','warehouse']);assert.equal(saved.role,'mechanic');
 assert.equal(r.c.productionCan_(saved,'warehouse'),true);assert.equal(r.c.productionCan_(saved,'mechanic'),true);
 assert.equal(r.c.productionCan_({role:'mechanic'},'warehouse'),false);assert.equal(r.c.productionCan_({role:'assistant'},'mechanic'),true);
 assert.throws(()=>r.c.productionRoles_({roles:['unknown']}),/válido/);
});

const hammer={id:'rotomartillo',name:'Rotomartillo',isFixedAsset:true,allowLoan:true};
const level4={id:'hammer',clase:hammer.name,estado:'Operativo/a',disponibleEntrega:'Sí',ubicacion:'Bodega de Producción-N. 4'};
const moveHammer=(kind,extra={})=>op(kind,1,{itemId:hammer.id,assetId:level4.id,...extra});

test('a level 4 asset is counted and can leave without an opening, exactly once until returned',()=>{
 const assets=[level4,...[
  {id:'surface',ubicacion:'Bodega de Superficie'},{id:'assigned',ubicacion:'Producción · Nivel 4'},
  {id:'other-level',ubicacion:'Bodega de Producción-N. 14'},{id:'blocked',disponibleEntrega:'No'},
  {id:'repair',estado:'En reparación'},{id:'retired',estado:'Dada de baja'},{id:'deleted',deleted:true}
 ].map(change=>({...level4,...change}))];
 const r=runtime({central:{inventoryCriteria:[hammer],assets}});
 const first=r.sync([],{catalogRevision:'production-no-epp-v1|'+cutoff});
 assert.deepEqual(Array.from(first.catalog.assets.filter(a=>a.inWarehouse&&a.canIssue),a=>a.id),['hammer']);
 assert.equal(first.balances[0].quantity,1);assert.equal(first.rows.length,0);
 const loan=moveHammer('loan');
 const lent=r.sync([loan,moveHammer('delivery')]);
 assert.deepEqual(Array.from(lent.receipts,row=>row.status),['accepted','rejected']);assert.equal(lent.balances[0].quantity,0);
 assert.equal(r.sync([loan]).receipts[0].status,'already-applied');
 const back=r.sync([moveHammer('return',{loanId:loan.id})]);assert.equal(back.balances[0].quantity,1);
 assert.equal(r.sync([moveHammer('delivery')]).balances[0].quantity,0);
 for(const assetId of ['surface','assigned','other-level','blocked','repair','retired','deleted']){
  assert.equal(r.sync([moveHammer('loan',{assetId})]).receipts[0].status,'rejected',assetId);
 }
 assert.equal(r.sync([moveHammer('transfer_out',{assetId:'repair'})]).receipts[0].status,'accepted');
});

test('an existing level 4 transfer and its asset are counted once, with the Plaza loan still linked',()=>{
 const source=transfer('plaza-loan',{quantity:1,itemId:hammer.id,assetId:level4.id,destination:'Bodega de Producción - N. 4',deliveryType:'PRÉSTAMO'});
 const r=runtime({central:{inventoryCriteria:[hammer],assets:[level4],blendingDeliveries:[source]}});
 const first=r.sync();assert.equal(first.rows.length,1);assert.equal(first.balances[0].quantity,1);
 assert.equal(r.sync().balances[0].quantity,1);
 const out=r.sync([moveHammer('transfer_out')]);assert.equal(out.receipts[0].status,'accepted');assert.equal(out.balances[0].quantity,0);
 assert.equal(r.central.blendingDeliveries.at(-1).loanId,source.id);
});

test('the Production picker and stock use the same asset identities offline across a loan, rejection and return',()=>{
 const r=runtime({central:{inventoryCriteria:[hammer],assets:[level4,{...level4,id:'other',ubicacion:'Socavón'}]}});
 const initial=r.sync(),loan=moveHammer('loan');
 const ui=vm.createContext({snapshot:initial,view:'delivery',criterion:hammer,norm:value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()});
 const client=fs.readFileSync('produccion/warehouse.js','utf8');
 vm.runInContext(client.slice(client.indexOf(' const assetClass='),client.indexOf(' function selectOptions')),ui);
 function check(snapshot,expected){
  ui.snapshot=snapshot;
  for(const kind of ['delivery','loan','stock']){
   ui.view=kind;assert.deepEqual(Array.from(ui.fixedAssets(hammer,kind),row=>row.id),expected);assert.equal(ui.balance(hammer),expected.length);
  }
 }
 check(initial,['hammer']);check({...initial,pending:[loan]},[]);
 check({...initial,pending:[{...loan,syncRejected:true}]},['hammer']);
 const lent=r.sync([loan]);check(lent,[]);
 const back=moveHammer('return',{loanId:loan.id});check({...lent,pending:[back]},['hammer']);
 check(r.sync([back]),['hammer']);
});

test('Reintegros lists open internal loans by original borrower, including offline and partial returns',()=>{
 const c=vm.createContext({assetLabel:row=>row.serial});
 const client=fs.readFileSync('produccion/warehouse.js','utf8');
 vm.runInContext(client.slice(client.indexOf(' function warehouseLoans('),client.indexOf(' let loanSnapshot')),c);
 const loan=(id,quantity,extra={})=>({id,kind:'loan',itemId:'tool',personId:'a',quantity,...extra});
 const back=(id,loanId,quantity)=>({id,kind:'return',loanId,quantity,personId:'b'});
 const closed=loan('closed',0.8),partial=loan('partial',3,{personName:'Nombre del préstamo'});
 const savedReturn=back('r1','partial',1);
 const catalog={criteria:[item],personal:[{id:'a',nombre:'Quien retiró',documento:'123'}],assets:[{id:'fixed',serial:'S-42'}]};
 const records=[closed,partial,savedReturn,back('r2','closed',0.1),{id:'plaza',kind:'transfer_in',sourceLoan:true}];
 const pending=[back('r3','closed',0.7),savedReturn,partial,loan('local',1,{assetId:'fixed'}),
  {...back('r4','partial',2),syncRejected:true},loan('invalid',1,{syncRejected:true})];
 const loans=()=>Array.from(c.warehouseLoans({catalog,records,pending}));
 const open=()=>loans().filter(row=>row.left>0);
 const completed=()=>loans().filter(row=>row.left===0).map(row=>row.id).sort();
 assert.deepEqual(completed(),['closed']);
 assert.deepEqual(open().map(row=>[row.id,row.left,row.borrower,row.document,row.label]),[
  ['local',1,'Quien retiró','123','Llave · S-42'],['partial',2,'Nombre del préstamo','123','Llave']]);
 pending.push(back('r5','local',1),back('r6','partial',2));
 assert.deepEqual(open(),[]);assert.deepEqual(completed(),['closed','local','partial']);
});

test('offline transfer keeps device registration and first server receipt across apps and retries',()=>{
 const r=runtime(),original='2026-01-01T13:00:00.000Z';
 r.sync([op('income',4)]);
 const out=op('transfer_out',2,{createdAt:original});
 assert.equal(r.sync([out]).receipts[0].status,'accepted');
 const row=r.production.warehouseMovements.find(entry=>entry.id===out.id);
 assert.equal(row.recordedAt,original);
 assert.notEqual(row.createdAt,original);
 const mirrored=r.central.blendingIncomes[0];
 assert.equal(mirrored.createdAt,original);
 assert.equal(mirrored.syncedAt,row.createdAt);
 assert.equal(r.sync([out]).receipts[0].status,'already-applied');
 assert.deepEqual(r.central.blendingIncomes,[mirrored]);
});

test('historical transfer timestamps are recovered without replaying stock or overwriting unknown times',()=>{
 const original='2025-12-28T18:00:00.000Z',receipt='2025-12-29T16:00:00.000Z';
 const movement={id:'sample',kind:'transfer_out',createdAt:receipt,revision:1,requestSignature:JSON.stringify({id:'sample',createdAt:original})};
 const transfer={id:'production-sample',sourceWarehouseId:'production',sourceMovementId:'sample',createdAt:receipt};
 const r=runtime({central:{blendingIncomes:[transfer]},production:{warehouseMovements:[movement],warehouseRevision:1}});
 r.sync();
 assert.equal(r.central.blendingIncomes[0].createdAt,original);
 assert.equal(r.central.blendingIncomes[0].syncedAt,receipt);
 assert.equal(r.central.inventoryStock[0].quantity,3);
 const writes=r.counts.central;r.sync();assert.equal(r.counts.central,writes);
});

test('central acceptance preserves initial capture and receipt when an admin record is retried',()=>{
 const r=runtime(),date='2026-02-10T16:25:00.000Z',record={id:'rec',createdAt:date,updatedAt:date};
 const first=r.c.merge_({}, {consumptions:[record]}).consumptions[0];
 assert.equal(first.createdAt,date);
 assert.ok(Date.parse(first.syncedAt)>Date.parse(date));
 const retry={...record,updatedAt:'2026-02-12T19:00:00.000Z',createdAt:'2026-02-12T18:00:00.000Z',syncedAt:'2099-01-01'};
 const last=r.c.merge_({consumptions:[first]},{consumptions:[retry]}).consumptions[0];
 assert.equal(last.createdAt,date);
 assert.equal(last.syncedAt,first.syncedAt);
});

test('Bodega separa la sesión, el turno y el receptor, y valida el turno de cada rol',()=>{
 const actor={id:'person',documento:'doc',nombre:'Auxiliar de captura'};
 const keeper={id:'turno',documento:'222',nombre:'Bodeguera de turno'};
 const recipient={id:'receptor',documento:'333',nombre:'Colaborador receptor'};
 const r=runtime({central:{personal:[actor,keeper,recipient,{id:'inactivo',active:false}]}});
 const submit=(token,row)=>r.sync([],{token,shiftMovements:[row]});
 const entry=op('income',2,{recordedBy:'doc',shiftKeeperId:'turno',personId:'receptor',recordedByName:'Nombre del navegador',shiftKeeperName:'Nombre del navegador'});
 for(const role of ['assistant','admin']){
  const row={...entry,id:randomUUID()};
  const response=submit(role,row);
  assert.equal(response.shiftKeeperV1,true);assert.equal(response.receipts[0].status,'accepted');
  const saved=response.rows.find(x=>x.id===row.id);
  assert.deepEqual([saved.recordedBy,saved.recordedByName,saved.shiftKeeperId,saved.shiftKeeperDocument,saved.shiftKeeperName,saved.personName],
   ['doc',actor.nombre,'turno','222',keeper.nombre,recipient.nombre]);
  assert.equal(submit(role,row).receipts[0].status,'already-applied');
  for(const override of [{recordedBy:'333'},{shiftKeeperId:''},{shiftKeeperId:'inactivo'}]){
   assert.equal(submit(role,{...row,...override,id:randomUUID()}).receipts[0].status,'rejected');
  }
 }
 for(const role of ['warehouse','both']){
  assert.equal(submit(role,{...entry,id:randomUUID()}).receipts[0].status,'rejected');
  const row={...entry,id:randomUUID(),shiftKeeperId:actor.id},response=submit(role,row);
  assert.equal(response.receipts[0].status,'accepted');
  assert.equal(response.rows.find(x=>x.id===row.id).shiftKeeperName,actor.nombre);
 }
 assert.equal(r.sync([op('income')],{token:'assistant'}).receipts[0].status,'rejected');
 const old=r.sync([op('income')],{token:'admin'});assert.equal(old.receipts[0].status,'accepted');assert.equal(old.rows.at(-1).shiftKeeperName,'');
 assert.equal(submit('assistant',{...entry,id:randomUUID(),kind:'opening'}).receipts[0].status,'rejected');
});

test('Admin ajusta cada bodega por separado y confirma un reenvío aun después de otro movimiento',()=>{
 const r=runtime(),admin={role:'admin',username:'prueba'};
 const query=(warehouse,itemId='tool')=>({warehouse,itemId,mode:'get'});
 const apply=q=>r.c.adminWarehouseQuantity_(q,admin);
 const request=(q,quantity)=>{const stock=apply(q).stock;return {...q,mode:'set',quantity,observedQuantity:stock.quantity,stockRevision:stock.updatedAt||'',operationId:randomUUID()};};
 const plaza=request(query('plaza'),0),prod=request(query('production'),6);
 assert.equal(apply(plaza).stock.quantity,0);
 assert.equal(apply(prod).stock.quantity,6);
 r.sync([op('delivery',2)]);
 assert.equal(apply(prod).status,'already-applied');assert.equal(apply(prod).stock.quantity,4);
 assert.equal(r.production.warehouseMovements.filter(row=>row.kind==='quantity_adjustment').length,1);
 assert.equal(r.central.warehouseQuantityHistory.length,1);
 assert.equal(apply(query('plaza')).stock.quantity,0);
 const delayed=request(query('production'),3);
 r.sync([op('income',2)]);
 assert.throws(()=>apply(delayed),/cantidad cambió/);
 assert.throws(()=>apply({...plaza,quantity:80}),/identificador/);
 assert.equal(apply(query('production')).stock.quantity,6);
 assert.equal(r.central.inventoryCriteria[0].name,'Llave');
});
test('los repuestos ajustados comparten el saldo de Mecánica y el recibo solo se confirma tras escribir',()=>{
 const r=runtime(),admin={role:'owner',username:'prueba'};
 const call=(q,auth=admin)=>r.c.adminWarehouseQuantity_(q,auth);
 const query={warehouse:'production',mode:'get',itemId:'spare'};
 const request=quantity=>{const stock=call(query).stock;return {...query,mode:'set',operationId:randomUUID(),quantity,observedQuantity:stock.quantity,stockRevision:stock.updatedAt};};
 const first=request(8);
 r.fail('production');assert.throws(()=>call(first),/Drive/);
 assert.equal(call(query).stock.quantity,0);assert.equal(call(first).stock.quantity,8);
 const second=request(2);assert.equal(call(second).stock.quantity,2);assert.equal(call(second).status,'already-applied');
 assert.deepEqual(r.production.incomes.map(row=>[row.kind,row.cantidad]),[['warehouse-return',8],['warehouse-out',6]]);
 assert.equal(r.sync().balances.find(row=>row.itemId==='spare').quantity,2);
 assert.equal(r.c.productionSync_({token:'admin',pending:[],warehouseV1:true}).incomes.length,2);
 assert.throws(()=>call(request(1.5)),/entera/);
 assert.throws(()=>call(query,{role:'assistant'}),/rol/);
 assert.throws(()=>call({...query,warehouse:'otra'}),/no válida/);
 for(const criterion of [{id:'fixed',isFixedAsset:true},{id:'epp',isEpp:true}]){
  r.central.inventoryCriteria.push(criterion);
  assert.throws(()=>call({...query,itemId:criterion.id}),/criterio no permite/);
 }
});

test('Admin recibe en su sincronización los saldos administrados, incluso agotados, y solo los cambios posteriores',()=>{
 const surface={id:'serum',name:'Suero oral'},bag={id:'bolsa',name:'Bolsa de muestreo'},epp={id:'epp',name:'Guantes',isEpp:true};
 const r=runtime({central:{inventoryCriteria:[item,spare,surface,bag,epp,hammer],blendingDeliveries:[transfer('from-plaza')]}});
 const admin={role:'admin',username:'test'},pull=(versions=[],since=r.central.updatedAt,auth=admin)=>r.c.adminSyncAuthorized_({},since,auth,versions);
 const first=pull();assert.ok(first.notModified);
 assert.deepEqual(Array.from(first.productionBalances.rows,row=>[row.itemId,row.quantity]),[['tool',10],['spare',0]]);
 const known=first.productionBalances.rows.map(row=>[row.itemId,row.updatedAt]);
 assert.equal(pull(known).productionBalances.rows.length,0);
 assert.equal(pull(known,undefined,{role:'assistant'}).productionBalances,undefined);
 const consumed=op('delivery',10);r.sync([consumed]);
 assert.deepEqual(Array.from(pull(known).productionBalances.rows,row=>[row.itemId,row.quantity]),[['tool',0]]);
 r.central.inventoryCriteria.find(row=>row.id==='tool').isEpp=true;
 assert.deepEqual(Array.from(pull(known).productionBalances.removed),['tool']);
 assert.equal(r.production.warehouseMovements.filter(row=>row.id==='plaza-from-plaza').length,1);
});
test('copiar saldos respeta cierres, apertura, alias y consumos de Mecánica sin movimientos nuevos de Bodega',()=>{
 const closed={id:'count',status:'closed',origin:'YT29',date:'2020-02-01',closedAt:'2020-02-01T11:00:00Z',rows:[{partId:'p10',aliases:['p10','spare'],physical:5}]};
 const r=runtime({production:{inventoryCounts:[closed],incomes:[{id:'opening',kind:'initial',origen:'YT29',partId:'p10',fechaISO:'2019-01-01',cantidad:80},
  {id:'after',kind:'income',origen:'YT29',partId:'spare',fechaISO:'2020-02-01',recordedAt:'2020-02-01T12:00:00Z',cantidad:2}]}});
 const pull=(v=[])=>r.c.adminProductionBalances_(r.central,v),first=pull(),row=first.rows.find(x=>x.itemId==='spare');
 assert.equal(row.quantity,7);
 r.production.consumptions.push({id:'consume',origen:'YT29',partId:'p10',fechaISO:date,cantidad:7});
 const next=pull([['spare',row.updatedAt]]).rows[0];assert.equal(next.quantity,0);assert.notEqual(next.updatedAt,row.updatedAt);
 const single=r.c.adminWarehouseQuantity_({warehouse:'production',itemId:'spare',mode:'get'},{role:'admin'}).stock;
 assert.equal(next.updatedAt,single.updatedAt);
 assert.equal(runtime({enabled:false}).c.adminProductionBalances_({},[['spare',next.updatedAt]]).enabled,false);
});

test('Bodega distingue las aperturas nativas y de Admin de los ingresos y los ajustes posteriores',()=>{
 const app=fs.readFileSync('produccion/warehouse.js','utf8');
 const items=new Map([['tool',item],['spare',spare]]);
 const ui=vm.createContext({criteriaById:()=>items,view:'home'});
 vm.runInContext(app.slice(app.indexOf(' const historySections='),app.indexOf(' const historyNav=')),ui);
 vm.runInContext(app.slice(app.indexOf(' function movementKind('),app.indexOf(' function renderTable(')),ui);
 const adminRow=(id,revision,part='tool')=>({id,kind:'quantity_adjustment',itemId:part,balanceBefore:0,balanceAfter:2,
  requestSignature:JSON.stringify(['production',part,2,revision,0])});
 const rows=[{id:'native',kind:'opening'},{id:'local',kind:'opening',pending:true},adminRow('previous','0|0'),
  adminRow('opening-new','0|0','spare'),adminRow('correction','3|0'),adminRow('mechanics','0|0','spare'),
  {id:'receipt',kind:'income'},{id:'from-plaza',kind:'transfer_in'},{id:'out',kind:'delivery'}];
 const ids=view=>{ui.view=view;return rows.filter(row=>ui.movementInView(ui.movementKind(row))).map(row=>row.id)};
 assert.deepEqual(ids('income'),['receipt','from-plaza']);
 assert.deepEqual(ids('openingHistory'),['native','local','previous','opening-new']);
 assert.deepEqual(ids('opening'),ids('openingHistory'));
 assert.deepEqual(ids('delivery'),['out']);assert.deepEqual(ids('history'),[]);
 assert.deepEqual(ids('ownIncomeHistory'),['receipt']);assert.deepEqual(ids('plazaIncomeHistory'),['from-plaza']);
 assert.deepEqual(ids('deliveryHistory'),['out']);
 assert.deepEqual(ids('pendingLoanHistory'),[]);assert.deepEqual(ids('completedLoanHistory'),[]);
});

test('Plaza recibe directamente un activo de Producción y puede enviarlo después a reparación',()=>{
 for(const ubicacion of ['Inventario de Producción','Bodega de Producción-N. 4','Producción · Nivel 4']){
  const asset={...level4,mina:'Sandra K',marcaActual:'TST',serial:'QA-123',ubicacion};
  const r=runtime({central:{assets:[asset],inventoryCriteria:[hammer]}});
  r.c.verifyToken_=()=>({document:'doc',role:'plaza_assistant'});
  const stamp=new Date().toISOString();
  const income={id:'ingreso-local',syncEventId:'ingreso-local',assetId:asset.id,itemId:hammer.id,quantity:1,
   operatorDocument:'doc',shiftKeeperDocument:'doc',broughtById:'person',createdAt:stamp,recordedAt:stamp,updatedAt:stamp,
   syncState:'pending',syncError:'Registra el traslado de este activo desde Bodega de Producción'};
  const localAsset={...asset,ubicacion:'Bodega de Superficie',syncState:'pending'};
  const send=data=>r.c.plazaSync_({token:'plaza',syncProtocol:'plaza-receipts-v1',data}).acknowledgements;
  const packet={assets:[localAsset],blendingIncomes:[income]};
  const first=send(packet);
  assert.equal(first.blendingIncomes[0].status,'accepted',first.blendingIncomes[0].error);
  assert.equal(first.assets[0].status,'already-applied');
  assert.equal(r.central.blendingIncomes.length,1);
  const saved=r.central.blendingIncomes[0];
  assert.equal(saved.receivedFromProduction,ubicacion);assert.equal(saved.createdAt,stamp);
  assert.equal(saved.broughtById,'person');assert.equal(saved.syncError,undefined);
  assert.equal(r.central.assets[0].ubicacion,'Bodega de Superficie');
  const production=r.sync();assert.equal(production.balances[0].quantity,0);
  assert.equal(production.catalog.assets[0].inWarehouse,false);
  assert.equal(r.sync([moveHammer('transfer_out')]).receipts[0].status,'rejected');
  assert.equal(send(packet).blendingIncomes[0].status,'already-applied');
  const exit={...income,id:'reparacion',syncEventId:'reparacion',exitKind:'mine',deliveryType:'SALIDA A REPARACIÓN',
   destinationMine:'Segovia',recipientId:'person'};
  const sent=send({blendingDeliveries:[exit]});assert.equal(sent.blendingDeliveries[0].status,'accepted',sent.blendingDeliveries[0].error);
  assert.equal(r.central.assets[0].ubicacion,'Segovia');assert.equal(r.central.assets[0].estado,'En reparación');
  assert.equal(r.central.assets[0].mina,'Sandra K');assert.equal(r.central.assets[0].serial,'QA-123');
  assert.equal(send(packet).blendingIncomes[0].status,'already-applied');assert.equal(r.central.assets[0].ubicacion,'Segovia');
  assert.equal(r.central.blendingIncomes.length,1);
 }
});

test('un traslado enviado desde Producción antes del ingreso manual conserva una sola recepción en Plaza',()=>{
 const r=runtime({central:{assets:[level4],inventoryCriteria:[hammer]}});
 assert.equal(r.sync([moveHammer('transfer_out')]).receipts[0].status,'accepted');
 const row={id:'otro-ingreso',assetId:level4.id,itemId:hammer.id,quantity:1,createdAt:new Date().toISOString(),syncState:'pending'};
 const result=r.c.plazaSync_({token:'plaza',data:{blendingIncomes:[row]},syncProtocol:'plaza-receipts-v1'});
 assert.equal(result.acknowledgements.blendingIncomes[0].status,'rejected');
 assert.match(result.acknowledgements.blendingIncomes[0].error,/Ya existe un ingreso/);
 assert.equal(r.central.blendingIncomes.length,1);
});
