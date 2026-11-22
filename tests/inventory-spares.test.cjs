const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),{webcrypto}=require('node:crypto');
const {IDBFactory}=require('fake-indexeddb');
async function harness(){
 const status={},button={},elements={},events=[];
 const sourceText=fs.readFileSync('inventory-admin.js','utf8');
 const typeButtons=Array.from(sourceText.matchAll(/data-spare-filter="([^"]+)"/g),m=>({dataset:{spareFilter:m[1]},attributes:{},setAttribute(k,v){this.attributes[k]=v},closest(){return this}}));
 const nodes=new Map();
 const node=s=>{if(!nodes.has(s))nodes.set(s,{dataset:{},handlers:{},value:'',innerHTML:'',textContent:'',querySelectorAll:()=>[],addEventListener(t,fn){this.handlers[t]=fn}});return nodes.get(s)};
 for(const key of ['allowAccessories','id','name','secondaryName','tertiaryName','unit','containerUnit','spareEquipment','spareItemNumber','spareItemName','spareApplication','sparePartCode','isYtSpare','isFixedAsset','usesSerial','usesLength','usesModel','usesManufacturer','requiresInternalMark','isEpp','allowAssignment','allowLoan','allowTransfer','allowRemission','fractionable']){
  const label={hidden:false};elements[key]={value:'',checked:false,dataset:{},options:[{value:'Unidad'}],closest:()=>label,focus(){}};
 }
 const form={elements,dataset:{},addEventListener(){},reportValidity(){},scrollIntoView(){},closest:()=>form,querySelectorAll:()=>[],querySelector:()=>null,reset(){for(const field of Object.values(elements)){field.value='';field.checked=false;}}};
 elements.unit.value='Unidad';
 elements.isYtSpare.checked=true;elements.spareEquipment.value='YT 29';elements.spareItemNumber.value='27';elements.spareItemName.value='Pieza de prueba';
 const window={addEventListener(){},dispatchEvent:e=>events.push(e.type)};
 const ctx=vm.createContext({window,indexedDB:new IDBFactory(),crypto:webcrypto,document:{querySelector:s=>s==='#inventoryItemForm'?form:s==='#inventoryItemSave'?button:s==='#inventoryItemStatus'?status:node(s),querySelectorAll:s=>s==='[data-spare-filter]'?typeButtons:[]},setTimeout(){},Event:class{constructor(type){this.type=type}},console:{error(){}}});
 vm.runInContext(fs.readFileSync('app.js','utf8').split('const PARTS=')[0],ctx);await ctx.openDB();
 vm.runInContext(fs.readFileSync('spare-groups.js','utf8'),ctx);
 const source=fs.readFileSync('inventory-admin.js','utf8').replace('window.SKInventoryAdmin={mount,render,openKind,openQuantities,syncQuantities}', 'window.SKInventoryAdmin={mount,render,openKind,openQuantities,syncQuantities,save,edit,syncSpareFields,bind}');
 vm.runInContext(source,ctx);window.SKInventoryAdmin.bind();
 const rows=async()=>{const out=[];for(const table of ['inventoryCriteria','inventoryStock','incomes'])for(const row of await ctx.all(table))out.push({table,row});return out};
 return {api:window.SKInventoryAdmin,form,status,button,events,ctx,typeButtons,node,selectType:async type=>{const target=typeButtons.find(b=>b.dataset.spareFilter===type);assert.ok(target);node('#spareCatalogFilter').handlers.click({target});await window.SKInventoryAdmin.render()},db:vm.runInContext('db',ctx),rows,save:()=>window.SKInventoryAdmin.save({currentTarget:form,preventDefault(){}})};
}
test('guarda solo el criterio de repuesto offline; limpia el formulario al confirmar la transacción',async()=>{
 const h=await harness();await h.save();
 const rows=await h.rows(),item=rows.find(r=>r.table==='inventoryCriteria').row;
 assert.equal(item.name,'Repuesto de YT29 · Ítem 27 · Pieza de prueba');assert.equal(item.spareItemNumber,'27');assert.equal(item.spareItemName,'Pieza de prueba');
 assert.deepEqual(rows.map(r=>r.table),['inventoryCriteria']);
 assert.ok(rows.every(r=>r.row.syncState==='pending'));assert.equal(h.form.elements.name.value,'');assert.equal(h.form.elements.spareItemName.value,'');assert.equal(h.button.disabled,false);
 assert.ok(h.events.includes('skweb-local-change'));assert.match(h.status.textContent,/guardado en este dispositivo/);
});
test('el número es opcional y admite Columna 29',async()=>{
 const h=await harness();h.form.elements.spareEquipment.value='Columna 29';h.form.elements.spareItemNumber.value='';h.form.elements.sparePartCode.value='009-A';await h.save();
 assert.equal((await h.rows())[0].row.sparePartCode,'009-A');
 assert.equal((await h.rows())[0].row.name,'Repuesto de columna 29 · Pieza de prueba');
});
test('un elemento común no conserva los campos de repuesto',async()=>{
 const h=await harness();h.form.elements.sparePartCode.value='YT25-3.20';h.form.elements.spareApplication.value='Texto solo para repuestos';h.form.elements.isYtSpare.checked=false;h.form.elements.name.value='Guantes';await h.save();
 const item=(await h.rows())[0].row;assert.equal(item.name,'Guantes');assert.equal(item.sparePartCode,'');assert.equal(h.form.elements.sparePartCode.disabled,true);assert.equal(h.form.elements.sparePartCode.closest().hidden,true);assert.equal(item.spareItemName,'');assert.equal(item.spareEquipment,'');assert.equal(item.spareItemNumber,'');
 assert.equal(h.form.elements.spareItemName.closest().hidden,true);assert.equal(h.form.elements.spareItemName.disabled,true);assert.equal(item.spareApplication,'');assert.equal(h.form.elements.spareApplication.closest().hidden,true);assert.equal(h.form.elements.spareApplication.disabled,true);assert.equal(h.form.elements.spareApplication.required,false);
});
test('equipos desconocidos o nombres vacíos no guardan nada',async()=>{
 for(const invalid of ['Otro 29','']){const h=await harness();if(invalid)h.form.elements.spareEquipment.value=invalid;else h.form.elements.spareItemName.value=' ';await h.save();assert.equal((await h.rows()).length,0);assert.equal(h.button.disabled,false);}
});
test('ambos equipos modelo 28 se pueden registrar',async()=>{
 for(const equipment of ['YT 28','Columna 28']){const h=await harness();h.form.elements.spareEquipment.value=equipment;await h.save();assert.equal((await h.rows())[0].row.spareEquipment,equipment);}
});
test('doble toque solo crea un criterio',async()=>{
 const h=await harness();await Promise.all([h.save(),h.save()]);assert.equal((await h.rows()).length,1);
});
test('si falla el guardado del criterio, conserva el formulario e informa el error; puede reintentar',async()=>{
 const h=await harness(),transaction=h.db.transaction.bind(h.db);
 h.db.transaction=(...args)=>{const tx=transaction(...args);if(args[1]==='readwrite'){const objectStore=tx.objectStore.bind(tx);tx.objectStore=name=>{const table=objectStore(name);if(name==='inventoryCriteria'){const put=table.put.bind(table);table.put=row=>{const result=put(row);tx.abort();return result}}return table}}return tx};
 await h.save();h.db.transaction=transaction;
 assert.equal((await h.rows()).length,0);assert.equal(h.form.elements.spareItemName.value,'Pieza de prueba');assert.match(h.status.textContent,/No se pudo guardar/);assert.equal(h.button.disabled,false);assert.ok(!h.events.includes('skweb-local-change'));
 await h.save();assert.equal((await h.rows()).length,1);
});
test('editar solo actualiza el criterio y limpia el formulario',async()=>{
 const h=await harness();await h.save();const item=(await h.rows())[0].row;
 await h.api.edit(item.id);h.form.elements.spareItemName.value='Nombre editado';await h.save();
 const rows=await h.rows();assert.equal(rows.length,1);assert.equal(rows[0].row.id,item.id);assert.equal(rows[0].row.spareItemName,'Nombre editado');assert.equal(h.form.elements.id.value,'');assert.equal(h.form.elements.name.value,'');
});
test('new wording rejects duplicate legacy spares and renamed imported items retain their IDs',async()=>{
 const h=await harness();
 const old={id:'legacy-criterion',name:'Repuesto YT 29 - Ítem 27 - Pieza de prueba',isYtSpare:true,spareEquipment:'YT 29',spareItemNumber:'27',spareItemName:'Pieza de prueba',productionPartId:'legacy-part',unit:'Unidad'};
 await h.ctx.put('inventoryCriteria',old);await h.ctx.put('inventoryStock',{id:'stock-legacy',itemId:old.id,quantity:8});
 await h.save();assert.equal((await h.rows()).length,2);assert.match(h.status.textContent,/ya está utilizado/);
 await h.api.edit(old.id);h.form.elements.spareItemName.value='Resorte del pin del cabezal';await h.save();
 const rows=await h.rows(),item=rows.find(x=>x.table==='inventoryCriteria').row;
 assert.equal(item.id,old.id);assert.equal(item.productionPartId,'legacy-part');assert.equal(rows.find(x=>x.table==='inventoryStock').row.quantity,8);
 assert.equal(item.name,'Repuesto de YT29 · Ítem 27 · Resorte del pin del cabezal');
});


test('ubicación o aplicación es opcional, se guarda offline y permite editarla o quitarla sin alterar el saldo',async()=>{
 const h=await harness(),application='Va con el pin de ajuste del cabezal';
 h.form.elements.sparePartCode.value='  007-AB  ';
 h.form.elements.spareApplication.value='  '+application+'  ';h.form.elements.secondaryName.value='Muelle';await h.save();
 let rows=await h.rows(),item=rows.find(x=>x.table==='inventoryCriteria').row;
 assert.equal(item.sparePartCode,'007-AB');assert.equal(item.spareApplication,application);assert.equal(item.secondaryName,'Muelle');assert.equal(item.syncState,'pending');assert.equal(h.form.elements.spareApplication.value,'');
 const stock={id:'stock-test',itemId:item.id,quantity:12},income={id:'ingreso-test',itemId:item.id,cantidad:12};
 await h.ctx.put('inventoryStock',stock);await h.ctx.put('incomes',income);
 await h.api.edit(item.id);
 assert.equal(h.form.elements.sparePartCode.value,'007-AB');assert.equal(h.form.elements.sparePartCode.required,false);
 assert.equal(h.form.elements.spareApplication.value,application);assert.equal(h.form.elements.spareApplication.required,false);assert.equal(h.form.elements.spareApplication.disabled,false);assert.equal(h.form.elements.spareApplication.closest().hidden,false);
 h.form.elements.spareApplication.value='En el cabezal';await h.save();await h.api.edit(item.id);assert.equal(h.form.elements.spareApplication.value,'En el cabezal');
 h.form.elements.spareApplication.value='';await h.save();await h.api.edit(item.id);assert.equal(h.form.elements.spareApplication.value,'');
 rows=await h.rows();item=rows.find(x=>x.table==='inventoryCriteria').row;assert.equal(item.spareApplication,'');assert.equal(item.secondaryName,'Muelle');
 assert.deepEqual(rows.find(x=>x.table==='inventoryStock').row,stock);assert.deepEqual(rows.find(x=>x.table==='incomes').row,income);
 // Un catálogo anterior sin este campo también se puede abrir y guardar.
 delete item.spareApplication;await h.ctx.put('inventoryCriteria',item);await h.api.edit(item.id);assert.equal(h.form.elements.spareApplication.value,'');await h.save();assert.match(h.status.textContent,/Cambios guardados/);
});

test('el protocolo existente sincroniza la aplicación y su borrado con otro Admin, Plaza y Producción',async()=>{
 const h=await harness();h.form.elements.spareApplication.value='Va con el pin de ajuste del cabezal';await h.save();
 const item=(await h.rows()).find(x=>x.table==='inventoryCriteria').row,clone=x=>JSON.parse(JSON.stringify(x));
 let cloud={assets:[],parts:[],personal:[{id:'person-test',documento:'test',nombre:'Prueba'}],inventoryCriteria:[],inventoryStock:[],blendingIncomes:[],blendingDeliveries:[]};
 const server=vm.createContext({LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},DriveApp:{getFilesByName:()=>({hasNext:()=>false})}});
 vm.runInContext(fs.readFileSync('backend/apps-script/Code.gs','utf8'),server);
 server.findFile_=()=> 'test';server.readFile_=()=>clone(cloud);server.writeFile_=(_,data)=>{cloud=clone(data)};server.json_=clone;
 server.verifyToken_=()=>({role:'plaza_operator',document:'test'});server.verifyProductionToken_=()=>({role:'admin',document:'test',personId:'person-test'});
 const owner={role:'owner',username:'test'};
 for(const value of [item.spareApplication,'']){
  const pending={...item,spareApplication:value,updatedAt:new Date(Date.parse(cloud.updatedAt||item.updatedAt)+1).toISOString(),syncState:'pending'};
  server.adminSyncAuthorized_({inventoryCriteria:[pending]},'',owner);
  const admin=server.adminSyncAuthorized_({},'',owner).data.inventoryCriteria.find(x=>x.id===item.id);
  const plaza=server.plazaSync_({token:'test',data:{}}).data.inventoryCriteria.find(x=>x.id===item.id);
  const production=server.productionSync_({token:'test',pending:[]}).inventoryCriteria.find(x=>x.id===item.id);
  for(const row of [admin,plaza,production]){assert.equal(row.spareApplication,value);assert.equal(row.syncState,'synced');assert.equal(row.spareItemName,item.spareItemName);}
 }
});


test('los cuatro botones son el único tipo del formulario y el filtro, y guardar conserva la selección',async()=>{
 const h=await harness();h.api.openKind('spare');
 assert.equal(h.typeButtons.length,4);assert.equal(h.form.elements.spareEquipment.value,'YT 29');
 for(const type of ['YT 29','YT 28','Columna 29','Columna 28']){
  await h.selectType(type);
  assert.equal(h.form.elements.spareEquipment.value,type);
  assert.deepEqual(h.typeButtons.filter(b=>b.attributes['aria-pressed']==='true').map(b=>b.dataset.spareFilter),[type]);
  h.form.elements.spareItemNumber.value='1';h.form.elements.spareItemName.value='Resorte';h.form.elements.spareApplication.value='Va con el pin';
  await h.save();
  const criteria=await h.ctx.all('inventoryCriteria'),item=criteria.find(x=>x.spareEquipment===type);
  assert.ok(item);assert.equal(item.spareItemName,'Resorte');assert.equal(item.spareApplication,'Va con el pin');
  assert.equal(h.form.elements.spareEquipment.value,type);assert.equal(h.form.elements.spareItemName.value,'');assert.equal(h.form.elements.id.value,'');
  const listed=Array.from(h.node('#inventoryItemList').innerHTML.matchAll(/data-inv-id="([^"]+)"/g),m=>m[1]);assert.deepEqual(listed,[item.id]);
  await h.selectType(type);assert.equal(h.form.elements.spareEquipment.value,type);assert.equal(h.typeButtons.filter(b=>b.attributes['aria-pressed']==='true').length,1);
 }
 assert.equal((await h.ctx.all('inventoryCriteria')).length,4);
 const source=fs.readFileSync('inventory-admin.js','utf8');assert.doesNotMatch(source,/<select[^>]*name="spareEquipment"/);assert.match(source,/<input type="hidden" name="spareEquipment"/);
});

test('editar marca el tipo del registro y cambiarlo en los botones se guarda con el mismo identificador',async()=>{
 const h=await harness();h.api.openKind('spare');await h.selectType('Columna 28');
 h.form.elements.spareItemNumber.value='8';h.form.elements.spareItemName.value='Tuerca';h.form.elements.secondaryName.value='Tuerca para el tubo de aire';await h.save();
 const item=(await h.ctx.all('inventoryCriteria'))[0],stock=(await h.ctx.all('inventoryStock'))[0];
 await h.selectType('YT 29');await h.api.edit(item.id);
 assert.equal(h.form.elements.spareEquipment.value,'Columna 28');assert.deepEqual(h.typeButtons.filter(b=>b.attributes['aria-pressed']==='true').map(b=>b.dataset.spareFilter),['Columna 28']);
 await h.selectType('YT 28');
 assert.equal(h.form.elements.id.value,item.id);assert.equal(h.form.elements.spareItemName.value,'Tuerca');assert.equal(h.form.elements.secondaryName.value,'Tuerca para el tubo de aire');
 assert.equal((await h.ctx.all('inventoryCriteria'))[0].spareEquipment,'Columna 28','la selección no escribe hasta guardar');
 await h.save();const updated=(await h.ctx.all('inventoryCriteria'))[0];assert.equal(updated.id,item.id);assert.equal(updated.spareEquipment,'YT 28');assert.equal(updated.name,'Repuesto de YT28 · Ítem 8 · Tuerca');assert.deepEqual((await h.ctx.all('inventoryStock'))[0],stock);
 h.api.openKind('common');assert.equal(h.node('#inventoryFormTitle').textContent,'Datos del elemento');assert.equal(h.node('#spareCatalogFilter').hidden,true);assert.equal(h.form.elements.spareEquipment.disabled,true);
 h.api.openKind('spare');assert.equal(h.node('#spareCatalogFilter').hidden,false);assert.equal(h.form.elements.spareEquipment.value,'YT 28');
});

test('cancelar limpia la edición sin modificar el criterio, sus existencias ni la categoría',async()=>{
 const h=await harness();await h.save();
 const before=await h.rows(),item=before.find(entry=>entry.table==='inventoryCriteria').row;
 h.api.openKind('spare');await h.api.edit(item.id);
 h.form.elements.spareItemName.value='Cambio sin guardar';

 const changes=h.events.filter(type=>type==='skweb-local-change').length;
 h.node('#inventoryItemCancel').handlers.click();
 assert.equal(h.form.elements.id.value,'');
 assert.equal(h.form.elements.spareItemName.value,'');
 assert.equal(h.form.elements.isYtSpare.checked,true);
 assert.equal(h.form.elements.spareEquipment.value,item.spareEquipment);
 assert.equal(h.node('#inventoryItemDeactivate').hidden,true);
 assert.deepEqual(await h.rows(),before);
 assert.equal(h.events.filter(type=>type==='skweb-local-change').length,changes);
 const pending=h.api.edit(item.id);
 h.node('#inventoryItemCancel').handlers.click();await pending;
 assert.equal(h.form.elements.id.value,'');
 await h.api.edit(item.id);assert.equal(h.form.elements.spareItemName.value,item.spareItemName);
});

test('la cola offline conserva ajustes simultáneos por bodega y cada recibo actualiza solo su propio saldo',async()=>{
 const h=await harness();h.ctx.window.SKAdminAuth={isAdmin:()=>true};
 const item={id:'comun',name:'Palas'},plaza={id:'stock-comun',itemId:item.id,quantity:8,updatedAt:'plaza1'};
 const production={id:item.id,itemId:item.id,quantity:3,updatedAt:'1|3',sampledAt:'2026-11-21T15:00:00Z'};
 await h.ctx.put('inventoryCriteria',item);await h.ctx.put('inventoryStock',plaza);
 await h.ctx.put('productionQuantityCache',production);
 const source=fs.readFileSync('inventory-admin.js','utf8').replace('window.SKInventoryAdmin={mount','window.SKInventoryAdmin={queueQuantity,mount');
 vm.runInContext(source,h.ctx);
 const api=h.ctx.window.SKInventoryAdmin;
 await Promise.all([api.queueQuantity('plaza',item.id,6,plaza),api.queueQuantity('production',item.id,0,production)]);
 await assert.rejects(api.queueQuantity('production',item.id,5,production),/pendiente/);
 const pending=await h.ctx.all('inventoryQuantityAdjustments');
 assert.equal(pending.length,2);assert.equal(new Set(pending.map(row=>row.operationId)).size,2);
 let attempts=0;
 h.ctx.window.SKAdminAuth.request=async(action,req)=>{
  attempts++;assert.equal(action,'adminWarehouseQuantityV1');
  if(req.warehouse==='production')throw Error('La cantidad cambió en la base central.');
  return {warehouse:req.warehouse,operationId:req.operationId,status:'accepted',stock:{...plaza,quantity:6,updatedAt:'plaza2'}};
 };
 await api.syncQuantities();
 assert.equal(attempts,2);assert.equal((await h.ctx.all('inventoryStock'))[0].quantity,6);
 assert.equal((await h.ctx.all('productionQuantityCache'))[0].quantity,3);
 const remaining=await h.ctx.all('inventoryQuantityAdjustments');assert.equal(remaining.length,1);assert.match(remaining[0].syncError,/cambió/);
});

test('un criterio nuevo se abre desde PRODUCCIÓN y se encuentra por su alias antes del primer movimiento',async()=>{
 const h=await harness(),w=h.ctx.window,doc=h.ctx.document;
 const productionButton=h.node('[data-quantity-warehouse=production]');
 productionButton.dataset.quantityWarehouse='production';
 const queryAll=doc.querySelectorAll;
 doc.querySelectorAll=selector=>selector==='[data-quantity-warehouse]'?[productionButton]:queryAll(selector);
 w.SKAdminAuth={isAdmin:()=>true,canView:()=>true};
 let opened;
 w.SKAdminNav={go:(view,opts)=>{opened={view,...opts}}};
 h.api.bind();
 h.form.elements.isYtSpare.checked=false;
 h.form.elements.name.value='Calibrador Vernier';
 h.form.elements.secondaryName.value='Pie de rey';
 await h.save();
 const [item]=await h.ctx.all('inventoryCriteria');
 productionButton.handlers.click();
 assert.equal(opened.view,'inventoryQuantities');
 assert.equal(opened.itemId,item.id);
 assert.equal(h.form.elements.id.value,'','la ficha queda lista para el siguiente elemento');

 const section=h.node('#inventoryQuantities'),form=h.node('form'),menu=h.node('#quantityItems');
 section.querySelector=form.querySelector=h.node;
 section.classList={contains:()=>true};form.reset=()=>{};form.reportValidity=()=>true;
 const field={value:'',focus(){},get valueAsNumber(){return Number(this.value)}};
 form.elements={quantity:field};
 menu.replaceChildren=(...rows)=>{menu.rows=rows};
 doc.createElement=()=>({dataset:{},append(detail){this.detail=detail.textContent}});
 const search=h.node('#quantityItemSearch'),type=query=>{search.value=query;search.oninput();return menu.rows};
 const selected=()=>new Promise((resolve,reject)=>{
  let tries=0;function check(){if(!field.disabled)return resolve();if(++tries>1000)return reject(Error('Cantidad deshabilitada'));setImmediate(check)}check();
 });
 await h.api.openQuantities(opened);await selected();
 assert.equal(search.value,item.name);
 // El usuario vuelve al catálogo, busca por nombre y abre la bodega sin tocar la ficha.
 const catalogSearch=h.node('#inventoryItemSearch');
 catalogSearch.value='Cali';await catalogSearch.handlers.input();
 productionButton.handlers.click();
 assert.equal(opened.itemId,'');assert.equal(opened.query,'Cali');
 const fixed={id:'cal-fijo',name:'Calibrador de precisión',CI_ES_A_FIJO:'Sí'};
 const epp={id:'cal-epp',name:'Calibrador de prueba EPP',isEpp:true};
 for(const record of [fixed,epp,{id:'cal-retirado',name:'Calibrador retirado',active:false}])await h.ctx.put('inventoryCriteria',record);
 await h.api.openQuantities(opened);
 assert.equal(search.value,'Cali');assert.equal(menu.hidden,false);
 assert.deepEqual(Array.from(menu.rows,row=>row.dataset.itemId),[item.id,fixed.id,epp.id]);
 assert.equal(menu.rows[0].textContent,'Calibrador Vernier');assert.match(menu.rows[0].detail,/Ingresar saldo inicial/);
 assert.ok(menu.rows[1].disabled);assert.match(menu.rows[1].detail,/por fichas/);
 assert.ok(menu.rows[2].disabled);assert.match(menu.rows[2].detail,/Plaza Blending/);
 assert.equal(type('no existe').length,0);
 await h.api.openQuantities({warehouse:'production'});
 const unfiltered=type('');
 assert.deepEqual(Array.from(unfiltered,row=>row.dataset.itemId),[item.id],'la primera apertura está disponible al desplegar el campo vacío');
 assert.match(unfiltered[0].detail,/Ingresar saldo inicial/);
 await h.api.openQuantities({warehouse:'production',query:'Cali Ver'});
 assert.equal(search.value,'Calibrador Vernier');assert.equal(field.disabled,false);assert.equal(field.value,'');
 const [choice]=type('pie de rey');
 assert.equal(choice.dataset.itemId,item.id);
 assert.match(choice.detail,/Ingresar saldo inicial/);
 menu.onclick({target:{closest:()=>choice}});await selected();
 assert.equal(field.value,'','un saldo sin leer jamás se presenta como cero');
 field.value='0';
 await form.onsubmit({preventDefault(){}});
 const [pending]=await h.ctx.all('inventoryQuantityAdjustments');
 assert.equal(pending.itemId,item.id);assert.equal(pending.stockRevision,'0|0');assert.equal(pending.quantity,0);
 assert.equal((await h.ctx.all('inventoryStock')).length,0);
 let sends=0;
 w.SKAdminAuth.request=async(_,q)=>{
  sends++;assert.equal(q.operationId,pending.operationId);
  return {warehouse:'production',operationId:q.operationId,status:'accepted',stock:{id:item.id,itemId:item.id,quantity:0,updatedAt:'1|0',sampledAt:'2026-11-22T10:00:00Z'}};
 };
 await h.api.syncQuantities();assert.equal(sends,0,'el ajuste espera la confirmación del criterio');
 await h.ctx.put('inventoryCriteria',{...item,syncState:'synced'});
 await h.api.syncQuantities();assert.equal(sends,1);
 await h.api.openQuantities({warehouse:'production'});
 assert.deepEqual(Array.from(type(''),row=>row.dataset.itemId),[item.id]);
 assert.equal((await h.ctx.all('productionQuantityCache'))[0].quantity,0);
 assert.equal((await h.ctx.all('inventoryQuantityAdjustments')).length,0);
 // Nombres y alias que también reconoce el selector de ingresos y salidas de Producción.
 const legacy={id:'antiguo',itemName:'Calibrador de profundidad',secondaryName:'Sonda',CI_ALIAS_SECUNDARIO:'Medidor de hondo'};
 await h.ctx.put('inventoryCriteria',legacy);
 await h.api.openQuantities({warehouse:'production'});
 for(const query of ['Cali prof','medidor hondo']){
  assert.equal(w.SKSpareGroups.matches(legacy,query),true);
  assert.deepEqual(Array.from(type(query),row=>[row.dataset.itemId,row.textContent]),[[legacy.id,legacy.itemName]]);
 }
});
