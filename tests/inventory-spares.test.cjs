const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),{webcrypto}=require('node:crypto');
const {IDBFactory}=require('fake-indexeddb');
async function harness(){
 const status={},button={},elements={},events=[];
 for(const key of ['id','name','secondaryName','tertiaryName','unit','initialQuantity','containerUnit','spareEquipment','spareItemNumber','spareItemName','isYtSpare','isFixedAsset','usesSerial','usesLength','usesModel','usesManufacturer','requiresInternalMark','isEpp','allowAssignment','allowLoan','allowTransfer','allowRemission','fractionable']){
  const label={hidden:false};elements[key]={value:'',checked:false,dataset:{},options:[{value:'Unidad'}],closest:()=>label,focus(){}};
 }
 const form={elements,reportValidity(){},scrollIntoView(){},closest:()=>form,querySelectorAll:()=>[],querySelector:()=>null,reset(){for(const field of Object.values(elements)){field.value='';field.checked=false;}}};
 elements.unit.value='Unidad';elements.initialQuantity.value='0';
 elements.isYtSpare.checked=true;elements.spareEquipment.value='YT 29';elements.spareItemNumber.value='27';elements.spareItemName.value='Pieza de prueba';
 const window={addEventListener(){},dispatchEvent:e=>events.push(e.type)};
 const ctx=vm.createContext({window,indexedDB:new IDBFactory(),crypto:webcrypto,document:{querySelector:s=>s==='#inventoryItemForm'?form:s==='#inventoryItemSave'?button:s==='#inventoryItemStatus'?status:{}},setTimeout(){},Event:class{constructor(type){this.type=type}},console:{error(){}}});
 vm.runInContext(fs.readFileSync('app.js','utf8').split('const PARTS=')[0],ctx);await ctx.openDB();
 const source=fs.readFileSync('inventory-admin.js','utf8').replace('window.SKInventoryAdmin={mount,render,openKind}','window.SKInventoryAdmin={mount,render,openKind,save,edit,syncSpareFields}');
 vm.runInContext(source,ctx);
 const rows=async()=>{const out=[];for(const table of ['inventoryCriteria','inventoryStock','incomes'])for(const row of await ctx.all(table))out.push({table,row});return out};
 return {api:window.SKInventoryAdmin,form,status,button,events,ctx,db:vm.runInContext('db',ctx),rows,save:()=>window.SKInventoryAdmin.save({currentTarget:form,preventDefault(){}})};
}
test('guarda repuesto, saldo e ingreso inicial offline; limpia el formulario al confirmar la transacción',async()=>{
 const h=await harness();h.form.elements.initialQuantity.value='12';await h.save();
 const rows=await h.rows(),item=rows.find(r=>r.table==='inventoryCriteria').row;
 assert.equal(item.name,'Repuesto YT 29 - Ítem 27 - Pieza de prueba');assert.equal(item.spareItemNumber,'27');assert.equal(item.spareItemName,'Pieza de prueba');
 assert.equal(rows.find(r=>r.table==='inventoryStock').row.quantity,12);assert.equal(rows.find(r=>r.table==='incomes').row.itemId,item.id);
 assert.ok(rows.every(r=>r.row.syncState==='pending'));assert.equal(h.form.elements.name.value,'');assert.equal(h.form.elements.spareItemName.value,'');assert.equal(h.button.disabled,false);
 assert.ok(h.events.includes('skweb-local-change'));assert.match(h.status.textContent,/guardado en este dispositivo/);
});
test('el número es opcional y admite Columna 29',async()=>{
 const h=await harness();h.form.elements.spareEquipment.value='Columna 29';h.form.elements.spareItemNumber.value='';await h.save();
 assert.equal((await h.rows())[0].row.name,'Repuesto Columna 29 - Pieza de prueba');
});
test('un elemento común no conserva los campos de repuesto',async()=>{
 const h=await harness();h.form.elements.isYtSpare.checked=false;h.form.elements.name.value='Guantes';await h.save();
 const item=(await h.rows())[0].row;assert.equal(item.name,'Guantes');assert.equal(item.spareItemName,'');assert.equal(item.spareEquipment,'');assert.equal(item.spareItemNumber,'');
 assert.equal(h.form.elements.spareItemName.closest().hidden,true);assert.equal(h.form.elements.spareItemName.disabled,true);
});
test('equipos desconocidos o nombres vacíos no guardan nada',async()=>{
 for(const invalid of ['Otro 29','']){const h=await harness();if(invalid)h.form.elements.spareEquipment.value=invalid;else h.form.elements.spareItemName.value=' ';await h.save();assert.equal((await h.rows()).length,0);assert.equal(h.button.disabled,false);}
});
test('ambos equipos modelo 28 se pueden registrar',async()=>{
 for(const equipment of ['YT 28','Columna 28']){const h=await harness();h.form.elements.spareEquipment.value=equipment;await h.save();assert.equal((await h.rows())[0].row.spareEquipment,equipment);}
});
test('doble toque solo crea un criterio, un saldo y un ingreso',async()=>{
 const h=await harness();h.form.elements.initialQuantity.value='4';await Promise.all([h.save(),h.save()]);assert.equal((await h.rows()).length,3);
});
test('si falla el saldo se revierte todo, conserva el formulario e informa el error; puede reintentar',async()=>{
 const h=await harness(),transaction=h.db.transaction.bind(h.db);h.form.elements.initialQuantity.value='4';
 h.db.transaction=(...args)=>{const tx=transaction(...args);if(args[1]==='readwrite'&&Array.isArray(args[0])){const objectStore=tx.objectStore.bind(tx);tx.objectStore=name=>{const table=objectStore(name);if(name==='inventoryStock'){const put=table.put.bind(table);table.put=row=>{const result=put(row);tx.abort();return result}}return table}}return tx};
 await h.save();h.db.transaction=transaction;
 assert.equal((await h.rows()).length,0);assert.equal(h.form.elements.spareItemName.value,'Pieza de prueba');assert.match(h.status.textContent,/No se pudo guardar/);assert.equal(h.button.disabled,false);assert.ok(!h.events.includes('skweb-local-change'));
 await h.save();assert.equal((await h.rows()).length,3);
});
test('editar actualiza el saldo local y limpia el formulario sin crear otro ingreso inicial',async()=>{
 const h=await harness();await h.save();const item=(await h.rows())[0].row;
 await h.api.edit(item.id);h.form.elements.initialQuantity.value='7';h.form.elements.spareItemName.value='Nombre editado';await h.save();
 const rows=await h.rows();assert.equal(rows.length,2);assert.equal(rows[0].row.id,item.id);assert.equal(rows[0].row.spareItemName,'Nombre editado');assert.equal(rows[1].row.quantity,7);assert.equal(h.form.elements.id.value,'');assert.equal(h.form.elements.name.value,'');
});
test('una cantidad negativa mantiene el formulario sin guardar parcialmente',async()=>{
 const h=await harness();h.form.elements.initialQuantity.value='-1';await h.save();assert.equal((await h.rows()).length,0);assert.equal(h.form.elements.spareItemName.value,'Pieza de prueba');assert.match(h.status.textContent,/cantidad/);
});
