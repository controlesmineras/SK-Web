const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const window={addEventListener(){}};
vm.runInNewContext(fs.readFileSync('production-spares.js','utf8'),{window});
const plan=window.SKProductionSpares.plan;
const parts=[{id:'p27',detalle:'29',clase:'YT',numero:27,nombre:'Torres de primavera'},{id:'p0',detalle:'29',clase:'YT',numero:'',nombre:'Lubricador'},{id:'p28',detalle:'28',clase:'YT',numero:1,nombre:'Trinquete'}];
test('copies model 29 for both equipment types with zero balances and Production destination',()=>{
 const result=plan(parts,[],[],'2026-10-10');
 assert.equal(result.items.length,4);assert.equal(result.balances.length,4);
 assert.equal(result.items[0].name,'Repuesto YT 29 - Ítem 27 - Torres de primavera');
 assert.equal(result.items[1].name,'Repuesto Columna 29 - Ítem 27 - Torres de primavera');
 assert.equal(result.items[2].name,'Repuesto YT 29 - Lubricador');
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
