const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('plaza/plaza.js','utf8');
function functionSource(name){let start=source.indexOf('  function '+name+'(');if(start<0)start=source.indexOf('  async function '+name+'(');assert(start>=0);const end=source.indexOf('\n  function ',start+1);return source.slice(start,end<0?undefined:end)}
const now=new Date().toISOString(),old='2025-01-01T12:00:00Z';
const data={personal:[{id:'p1',documento:'1'},{id:'p2',documento:'2'}],inventoryCriteria:[{id:'i1',name:'Guantes'},{id:'i2',name:'Pulidora',isFixedAsset:true}],inventoryStock:[{itemId:'i1',quantity:20}],assets:[{id:'a1',clase:'Pulidora',ubicacion:'Socavón',asignadaId:'p1'},{id:'a2',clase:'Pulidora',ubicacion:'Bodega de Superficie'},{id:'a3',clase:'Pulidora',ubicacion:'Socavón'}],blendingDeliveries:[{id:'d1',itemId:'i1',recipientId:'p1',quantity:2,createdAt:now},{id:'d2',itemId:'i1',recipientId:'p2',quantity:3,createdAt:now},{id:'d3',itemId:'i2',assetId:'a3',recipientId:'p1',deliveryType:'ASIGNACIÓN',createdAt:now},{id:'old',itemId:'i1',recipientId:'p1',quantity:100,createdAt:old},{id:'reversed',itemId:'i1',recipientId:'p1',quantity:100,createdAt:now,reversed:true}],blendingIncomes:[{id:'in1',itemId:'i1',broughtById:'p2',quantity:10,createdAt:now}]};
const fields={'#personQueryForm':{elements:{itemId:{value:''}}},'#personFrom':{value:'2026-01-01'},'#personTo':{value:'2026-12-31'}};
const ctx={window:{SKAssetHistory:require('../asset-history.js')},data,historyPersonId:'p1',$:key=>fields[key],norm:v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''),itemName:item=>item?.name||'',findItem:id=>data.inventoryCriteria.find(i=>i.id===id),isFixedItem:item=>item.isFixedAsset===true,isRetired:asset=>asset.estado==='Dado/a de baja',itemAvailability:item=>data.inventoryStock.find(s=>s.itemId===item.id)?.quantity||0};
vm.createContext(ctx);vm.runInContext("const validQueryRow=row=>!row.deleted&&!row.reversed&&!row.reversado;"+['assetAvailableForDelivery','movementDate','queryMatchesPerson','queryMatchesItem','personHistoryRows','queryStock','queryAssignedAssets','stockEntries'].map(functionSource).join('\n'),ctx);
vm.runInContext(fs.readFileSync('spare-groups.js','utf8'),ctx);
ctx.recentCollator=new Intl.Collator('es',{numeric:true,sensitivity:'base'});
const run=code=>vm.runInContext(code,ctx);
const parts=[
 {id:'yt',isYtSpare:true,spareEquipment:'YT 29',spareItemNumber:'2',spareItemName:'Pin',sparePartCode:'YC77'},
 {id:'col',isYtSpare:true,spareEquipment:'Columna 29',spareItemNumber:'7',spareItemName:'Pin'},
 {id:'yt28',isYtSpare:true,spareEquipment:'YT 28',spareItemNumber:'1',spareItemName:'Otro pin'},
 {id:'removed',name:'Viejo',active:false},{id:'config',recordType:'formOptions'}
];
ctx.catalog=[...data.inventoryCriteria,...parts];
const ids=(group,query)=>Array.from(ctx.stockEntries(ctx.catalog,group,query),entry=>entry.type||entry.item.id);
assert.deepEqual(ids('',''),['YT 29','YT 28','Columna 29','i1','i2']);
assert.deepEqual(ids('','pin'),[]);
assert.deepEqual(ids('','YT 29'),['YT 29']);
assert.deepEqual(ids('','Columna29'),['Columna 29']);
assert.deepEqual(ids('YT 29','pin'),['yt']);
assert.deepEqual(ids('YT 29','YC77'),['yt']);
assert.deepEqual(ids('YT 29','Guantes'),[]);
assert.deepEqual(ids('Columna 29','YC77'),[]);
assert.equal(run("personHistoryRows().length"),2);fields['#personQueryForm'].elements.itemId.value='i1';assert.equal(run("personHistoryRows().length"),1);fields['#personFrom'].value='2025-01-01';assert.equal(run("personHistoryRows().length"),2);fields['#personFrom'].value='2030-01-01';assert.equal(run("personHistoryRows().length"),0);assert.equal(run("queryStock(findItem('i1'))"),20);assert.equal(run("queryStock(findItem('i2'))"),1);assert.equal(run('queryAssignedAssets().length'),2);
// Saving must reject a missing company even when called directly, before stock changes.
let alertMessage='',saved=false;
Object.assign(ctx,{setTimeout:()=>{},movementShift:()=>({}),deliverySaving:false,deliveryDraft:[],deliveryMode:'assignment',user:{id:'operator'},alert:m=>{alertMessage=m},findItem:ctx.findItem,replacementApplies:()=>false,persistLocalChange:async next=>{Object.assign(data,next);saved=true},stockForItem:(item,next)=>next.inventoryStock.find(row=>row.itemId===item.id),isFixedItem:ctx.isFixedItem,validateDeliveryRecipient:()=>true,uuid:()=>Math.random().toString(),localStorage:{setItem:()=>{saved=true}},discardDeliveryForm:()=>{},renderRecentQueries:()=>{},updatePendingBadge:()=>{},sync:()=>{},pendingDeliveryAfterCollaborator:false});
vm.runInContext(functionSource('allowsDeliveryItem')+'\n'+functionSource('recipientSnapshot')+'\n'+functionSource('movementTimes')+'\n'+functionSource('saveDeliveryBatch'),ctx);
const submit={disabled:false},form={elements:{recipientCompany:{value:''},itemId:{value:''},recipientId:{value:'p1'}},querySelector:()=>submit};ctx.form=form;
(async()=>{assert.equal(await run('saveDeliveryBatch(form)'),false);assert.match(alertMessage,/EMPRESA RECEPTORA/);assert.equal(saved,false);assert.equal(submit.disabled,false);ctx.deliveryDraft=[{itemId:'i1',quantity:2}];form.elements.recipientCompany.value='DESMIN';await run('saveDeliveryBatch(form)');assert.equal(saved,true);assert.equal(data.blendingDeliveries.at(-1).recipientCompany,'DESMIN');assert.equal(data.inventoryStock[0].quantity,18);const html=fs.readFileSync('plaza/index.html','utf8');assert.match(html,/name="recipientCompany" value="SK" required/);assert.match(html,/name="recipientCompany" value="DESMIN" required/);assert.doesNotMatch(html,/name="recipientCompany"[^>]*checked/);console.log('PASS: company validation/persistence, stock and person/date/item filters, reversed exclusion, current assignments.');})().catch(error=>{console.error(error);process.exitCode=1});
