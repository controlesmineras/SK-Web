const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
function harness(){
 const rows=[],status={},elements={};
 for(const key of ['id','name','secondaryName','tertiaryName','unit','initialQuantity','containerUnit','spareEquipment','spareItemNumber','spareItemName','isYtSpare','isFixedAsset','usesSerial','usesLength','usesModel','usesManufacturer','requiresInternalMark','isEpp','allowAssignment','allowLoan','allowTransfer','allowRemission','fractionable']){
  const label={hidden:false};elements[key]={value:'',checked:false,dataset:{},closest:()=>label,focus(){}};
 }
 elements.unit.value='Unidad';elements.initialQuantity.value='0';
 elements.isYtSpare.checked=true;elements.spareEquipment.value='YT 29';elements.spareItemNumber.value='27';elements.spareItemName.value='Pieza de prueba';
 const window={addEventListener(){},dispatchEvent(){}};
 const context={window,document:{querySelector:()=>status},all:async table=>rows.filter(r=>r.table===table).map(r=>r.row),put:async(table,row)=>rows.push({table,row}),uuid:()=>String(rows.length),setTimeout(){},Event:class{}};
 let source=fs.readFileSync('inventory-admin.js','utf8').replace('window.SKInventoryAdmin={mount,render,openKind}','window.SKInventoryAdmin={mount,render,openKind,save,syncSpareFields}');
 vm.runInNewContext(source,context);
 return {api:window.SKInventoryAdmin,form:{elements,reportValidity(){}},rows};
}
test('saves separate spare fields and the visible name, with an inventory balance',async()=>{
 const h=harness();await h.api.save({currentTarget:h.form,preventDefault(){}});
 const item=h.rows.find(r=>r.table==='inventoryCriteria').row;
 assert.equal(item.name,'Repuesto YT 29 - Ítem 27 - Pieza de prueba');
 assert.equal(item.spareItemNumber,'27');assert.equal(item.spareItemName,'Pieza de prueba');
 assert.equal(h.rows.find(r=>r.table==='inventoryStock').row.itemId,item.id);
});
test('item number is optional and Columna 29 is supported',async()=>{
 const h=harness();h.form.elements.spareEquipment.value='Columna 29';h.form.elements.spareItemNumber.value='';
 await h.api.save({currentTarget:h.form,preventDefault(){}});
 assert.equal(h.rows[0].row.name,'Repuesto Columna 29 - Pieza de prueba');
});
test('No hides fields, drops their saved values and keeps the ordinary name',async()=>{
 const h=harness();h.form.elements.isYtSpare.checked=false;h.form.elements.name.value='Guantes';
 await h.api.save({currentTarget:h.form,preventDefault(){}});
 const item=h.rows[0].row;assert.equal(item.name,'Guantes');assert.equal(item.spareItemName,'');assert.equal(item.spareEquipment,'');assert.equal(item.spareItemNumber,'');
 assert.equal(h.form.elements.spareItemName.closest().hidden,true);assert.equal(h.form.elements.spareItemName.disabled,true);
});
test('unknown equipment and blank spare names cannot be saved',async()=>{
 for(const invalid of ['Otro 29','']){
  const h=harness();if(invalid)h.form.elements.spareEquipment.value=invalid;else h.form.elements.spareItemName.value=' ';
  await h.api.save({currentTarget:h.form,preventDefault(){}});
  assert.equal(h.rows.length,0);
 }
});

test('both model 28 equipment types can be registered manually',async()=>{
 for(const equipment of ['YT 28','Columna 28']){const h=harness();h.form.elements.spareEquipment.value=equipment;await h.api.save({currentTarget:h.form,preventDefault(){}});assert.equal(h.rows[0].row.spareEquipment,equipment)}
});
