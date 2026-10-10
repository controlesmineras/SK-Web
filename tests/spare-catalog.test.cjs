const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const legacy=[{id:'yt1',clase:'YT',detalle:'29',numero:1,nombre:'Perno YT'},{id:'old28',clase:'YT',detalle:'28',numero:1,nombre:'YT 28'}];
const criteria=[{id:'column1',isYtSpare:true,spareEquipment:'Columna 29',spareItemNumber:'1',spareItemName:'Perno columna'}, {id:'column10',isYtSpare:true,spareEquipment:'Columna 29',spareItemNumber:'10',spareItemName:'Sello'}, {id:'copy',productionPartId:'yt1',isYtSpare:true,spareEquipment:'YT 29',spareItemNumber:'1',spareItemName:'Perno YT editado'}, {id:'common',name:'Guantes'}, {id:'removed',isYtSpare:true,spareEquipment:'Columna 29',deleted:true}];
const window={addEventListener(){}};vm.runInNewContext(fs.readFileSync('spare-catalog.js','utf8'),{window,all:async t=>t==='parts'?legacy:criteria});const api=window.SKSpareCatalog;
test('manual Columna criteria are selectable and never mix with YT or model 28',()=>{
 const rows=api.merge(legacy,criteria);
 assert.deepEqual(Array.from(api.filter(rows,'Columna','Columna29'),p=>p.id),['column1','column10']);
 assert.deepEqual(Array.from(api.filter(rows,'YT','YT29'),p=>p.id),['yt1']);
 assert.equal(api.filter(rows,'YT','YT28')[0].id,'old28');
 assert.equal(rows.find(p=>p.id==='yt1').nombre,'Perno YT editado');
 assert.equal(rows.some(p=>['removed','common','copy'].includes(p.id)),false);
});
test('save resolver accepts manually registered column parts and rejects stale YT selections',async()=>{
 assert.equal((await api.resolve('column1','Columna','Columna29')).nombre,'Perno columna');
 assert.equal(await api.resolve('yt1','Columna','Columna29'),undefined);
 assert.equal(await api.resolve('column1','YT','YT29'),undefined);
});

test('deleting a spare erases its stock and linked history without deleting another equipment catalog',()=>{
 const item=criteria.find(row=>row.id==='copy'),snapshot={inventoryStock:[{id:'stock-copy',itemId:'copy',quantity:9}],consumptions:[{id:'yt-use',partId:'yt1',origen:'YT29',nombreRepuesto:'Perno',cantidad:2},{id:'col-use',partId:'yt1',origen:'Columna29',nombreRepuesto:'Perno columna',cantidad:4}],incomes:[{id:'direct',itemId:'copy',cantidad:9}],blendingDeliveries:[{id:'delivery',itemId:'copy',quantity:1},{id:'other',itemId:'column1',quantity:3}]};
 const changes=api.deletionPlan(item,snapshot,'2026-10-10T21:00:00Z');
 assert.equal(changes.inventoryCriteria[0].deleted,true);
 assert.equal(changes.inventoryCriteria[0].name,undefined);
 assert.equal(changes.inventoryStock[0].quantity,undefined);
 assert.deepEqual(Array.from(changes.consumptions,row=>row.id),['yt-use']);
 assert.equal(changes.consumptions[0].cantidad,undefined);
 assert.equal(changes.consumptions[0].nombreRepuesto,undefined);
 assert.deepEqual(Array.from(changes.blendingDeliveries,row=>row.id),['delivery']);
 assert.equal(changes.incomes[0].cantidad,undefined);
 const merged=api.merge(legacy,changes.inventoryCriteria);
 assert.equal(merged.some(row=>row.id==='yt1'),false);
 assert.equal(merged.some(row=>row.id==='old28'),true);
});
test('incorrect retired Columna copy cannot erase the original YT parts or their history',()=>{
 const item={...criteria.find(row=>row.id==='column1'),productionPartId:'yt1'};
 const changes=api.deletionPlan(item,{consumptions:[{id:'yt-use',partId:'yt1',origen:'YT29',cantidad:2}]},'now');
 assert.equal(changes.consumptions.length,0);
 assert.equal(api.merge(legacy,changes.inventoryCriteria).some(row=>row.id==='yt1'),true);
});
test('already erased movements are not rewritten on subsequent synchronizations',()=>{
 const item=criteria.find(row=>row.id==='column1');
 const first=api.deletionPlan(item,{incomes:[{id:'income',itemId:item.id,cantidad:3}]},'first');
 const again=api.deletionPlan(first.inventoryCriteria[0],first,'second');
 assert.equal(again.incomes.length,0);
});
test('existing server merge replaces history fields with deletion markers',()=>{
 const server=fs.readFileSync('backend/apps-script/Code.gs','utf8'),context={};
 for(const name of ['merge_','choose_','stamp_']){const line=server.split('\n').find(line=>line.startsWith('function '+name+'('));vm.runInNewContext(line,context)}
 const item=criteria.find(row=>row.id==='column1'),cloud={incomes:[{id:'income',itemId:item.id,cantidad:3,nombreRepuesto:'Perno',updatedAt:'2026-01-01'}]};
 const changes=api.deletionPlan(item,cloud,'2026-10-10');
 const merged=context.merge_(cloud,changes);
 assert.equal(merged.incomes[0].deleted,true);assert.equal(merged.incomes[0].cantidad,undefined);assert.equal(merged.incomes[0].nombreRepuesto,undefined);
});
