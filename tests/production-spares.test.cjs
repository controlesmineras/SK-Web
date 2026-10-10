const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const window={addEventListener(){}};
vm.runInNewContext(fs.readFileSync('production-spares.js','utf8'),{window});
const plan=window.SKProductionSpares.plan;
const parts=[{id:'p27',detalle:'29',clase:'YT',numero:27,nombre:'Torres de primavera'},{id:'p0',detalle:'29',clase:'YT',numero:'',nombre:'Lubricador'},{id:'p28',detalle:'28',clase:'YT',numero:1,nombre:'Trinquete'}];
test('copies model 29 only for its explicit equipment class with zero balances and Production destination',()=>{
 const result=plan(parts,[],[],'2026-10-10');
 assert.equal(result.items.length,2);assert.equal(result.balances.length,2);
 assert.equal(result.items[0].name,'Repuesto YT 29 - Ítem 27 - Torres de primavera');
 assert.equal(result.items[1].name,'Repuesto YT 29 - Lubricador');
 for(const row of result.balances)assert.equal(row.quantity,0);
 for(const row of result.items){assert.equal(row.deliveryWarehouse,'Producción');assert.equal(row.allowLoan,false)}
});
test('reruns do not duplicate criteria or overwrite stock, including deleted criteria',()=>{
 const initial=plan(parts,[],[],'first');initial.items[0].deleted=true;initial.balances[0].quantity=15;
 const again=plan(parts,initial.items,initial.balances,'second');
 assert.equal(again.items.length,0);assert.equal(again.balances.length,0);assert.equal(initial.balances[0].quantity,15);
});
test('destination remains Production even if a different value is submitted',()=>{
 const source=fs.readFileSync('plaza/plaza.js','utf8'),start=source.indexOf('function deliveryDestination('),end=source.indexOf('function updateDeliveryFields',start);
 const context={findItem:()=>({isYtSpare:true})};vm.runInNewContext(source.slice(start,end),context);
 assert.equal(context.deliveryDestination({elements:{itemId:{value:'p'},destination:{value:'Socavón'},destinationLevel:{value:'4'}}}),'Producción');
});

test('unknown classes are skipped and explicit Columna remains Columna',()=>{
 const result=plan([{...parts[0],clase:'Columna'},{...parts[1],clase:''}],[],[],'now');
 assert.equal(result.items.length,1);
 assert.equal(result.items[0].spareEquipment,'Columna 29');
});
test('retires erroneous generated copies without losing balances or changing manual criteria',()=>{
 const source={id:'YT29-69-Perno de chapeta',detalle:'29',clase:'YT',numero:69,nombre:'Perno de chapeta'};
 const id='plaza-production-spare-v1-'+encodeURIComponent('Columna 29|69|perno de chapeta');
 const wrong={id,name:'Repuesto Columna 29 - Ítem 69 - Perno de chapeta',isYtSpare:true,spareEquipment:'Columna 29',spareItemNumber:'69',spareItemName:'Perno de chapeta',productionPartId:source.id,catalogMigration:'production-spares-v1',active:true};
 const manual={...wrong,id:'manual',catalogMigration:undefined};
 const stock={id:'stock-'+id,itemId:id,quantity:8,initialQuantity:0};
 const result=plan([source],[wrong,manual],[stock],'now');
 const retired=result.items.find(row=>row.id===id);
 assert.equal(retired.deleted,true);assert.equal(retired.active,false);
 assert.equal(result.balances.find(row=>row.itemId===id).quantity,8);
 assert.equal(result.items.some(row=>row.id==='manual'),false);
 assert.equal(wrong.active,true);assert.equal(stock.quantity,8);
 const rerun=plan([source],[...result.items,manual],result.balances,'later');
 assert.equal(rerun.items.length,0);assert.equal(rerun.balances.length,0);
});
