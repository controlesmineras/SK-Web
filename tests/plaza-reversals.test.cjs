const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const fs=require('node:fs'),path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8'),clone=value=>JSON.parse(JSON.stringify(value));
const date='2026-10-23T12:00:00.000Z';
const original={id:'delivery-1',itemId:'gloves',itemName:'Guantes',quantity:4,balanceBefore:20,balanceAfter:16,recipientId:'person',recipientName:'Persona receptora',recipientCompany:'SK',operatorId:'warehouse',operatorDocument:'100',operatorName:'Bodeguera original',actorDocument:'100',createdAt:date,updatedAt:date,syncState:'synced'};
const later={...original,id:'delivery-2',quantity:3,balanceBefore:16,balanceAfter:13,createdAt:'2026-10-23T13:00:00.000Z',updatedAt:'2026-10-23T13:00:00.000Z'};
function backend(seed={}){
 let cloud={updatedAt:date,personal:[{id:'person',nombre:'Persona receptora',documento:'200'},{id:'warehouse',nombre:'Bodeguera original',documento:'100'}],assets:[],inventoryCriteria:[{id:'gloves',name:'Guantes'}],inventoryStock:[{id:'stock',itemId:'gloves',quantity:13}],blendingDeliveries:[clone(original),clone(later)],blendingIncomes:[],...clone(seed)},writes=0,locked=false;
 const ctx=vm.createContext({PropertiesService:{getScriptProperties:()=>({getProperty:()=>''})},LockService:{getScriptLock:()=>({waitLock(){assert.equal(locked,false);locked=true},releaseLock(){locked=false}})}});
 vm.runInContext(read('backend/apps-script/Code.gs'),ctx);
 Object.assign(ctx,{findFile_:()=> 'file',readFile_:()=>clone(cloud),writeFile_:(_,data)=>{assert.ok(locked);cloud=clone(data);writes++},json_:clone,adminUsers_:()=>[{}],verifyAdminToken_:()=>({role:'owner',username:'EXECUTOR-MUST-NOT-APPEAR',name:'EXECUTOR-MUST-NOT-APPEAR'}),verifyToken_:()=>({document:'100',role:'plaza_operator'})});
 const request=(extra={})=>ctx.doPost({postData:{contents:JSON.stringify({action:'adminReverseMovementV2',type:'delivery',movementId:original.id,reversalRequestedBy:'Solicitante de prueba',...extra})}});
 return{ctx,request,cloud:()=>clone(cloud),writes:()=>writes,locked:()=>locked};
}
test('la reversión suma al saldo actual, crea otro movimiento y conserva los saldos históricos',()=>{
 const b=backend(),before=Date.now(),result=b.request(),cloud=b.cloud(),source=cloud.blendingDeliveries[0],reversal=cloud.blendingDeliveries[2];
 assert.equal(result.ok,true);assert.equal(cloud.inventoryStock[0].quantity,17);assert.equal(cloud.blendingDeliveries.length,3);
 for(const key of Object.keys(original))if(key!=='updatedAt')assert.deepEqual(source[key],original[key]);
 assert.deepEqual(cloud.blendingDeliveries[1],later);assert.equal(source.reversed,true);assert.equal(source.reversalMovementId,reversal.id);
 assert.equal(reversal.reversalOf,original.id);assert.equal(reversal.movementType,'REVERSIÓN');assert.equal(reversal.balanceBefore,13);assert.equal(reversal.quantity,4);assert.equal(reversal.stockDelta,4);assert.equal(reversal.balanceAfter,17);
 assert.ok(Date.parse(reversal.createdAt)>=before);assert.equal(reversal.originalCreatedAt,date);assert.notEqual(cloud.updatedAt,date);assert.equal(b.writes(),1);assert.equal(b.locked(),false);
});
test('solo guarda solicitante y bodeguero original; no añade la identidad del ejecutor',()=>{
 const b=backend();b.request();const rows=b.cloud().blendingDeliveries;
 assert.equal(rows[2].reversalRequestedBy,'Solicitante de prueba');assert.equal(rows[2].operatorName,'Bodeguera original');assert.equal(rows[2].operatorDocument,'100');
 assert.doesNotMatch(JSON.stringify(rows),/EXECUTOR-MUST-NOT-APPEAR|reversedBy|executedBy/);
});
test('doble solicitud o respuesta perdida no vuelve a sumar ni crea un segundo reintegro',()=>{
 const b=backend(),first=b.request(),second=b.request({reversalRequestedBy:'Otro nombre'});
 assert.equal(second.ok,true);assert.equal(second.alreadyApplied,true);assert.deepEqual(first.movement,second.movement);assert.equal(b.writes(),1);assert.equal(b.cloud().inventoryStock[0].quantity,17);
});
test('una reversión llega a Plaza aunque consulte con la marca de última sincronización anterior',()=>{
 const b=backend();b.request();const view=b.ctx.plazaSync_({token:'test',data:{},since:date});
 assert.equal(view.notModified,undefined);assert.equal(view.data.blendingDeliveries.length,3);assert.equal(view.data.blendingDeliveries[0].reversed,true);assert.equal(view.data.inventoryStock[0].quantity,17);
});
test('un ingreso se revierte con su ajuste negativo y no permite saldo insuficiente',()=>{
 const b=backend({blendingIncomes:[clone(original)]});assert.equal(b.request({type:'income'}).movement.stockDelta,-4);assert.equal(b.cloud().inventoryStock[0].quantity,9);
 const low=backend({blendingIncomes:[clone(original)],inventoryStock:[{itemId:'gloves',quantity:3}]});assert.match(low.request({type:'income'}).error,/menores/);assert.equal(low.writes(),0);
});
test('se mantienen las restricciones para activos, préstamos y devoluciones',()=>{
 for(const extra of [{assetId:'asset'},{deliveryType:'PRÉSTAMO'},{movementType:'DEVOLUCIÓN'}]){const b=backend({blendingDeliveries:[{...original,...extra}]});assert.equal(b.request().ok,false);assert.equal(b.writes(),0);}
});
test('no permite revertir una reversión ni repetir reversiones antiguas',()=>{
 const b=backend(),result=b.request();assert.match(b.request({movementId:result.movement.id}).error,/movimiento de reversión/);assert.equal(b.writes(),1);
 const legacy=backend({blendingDeliveries:[{...original,reversed:true}]});assert.match(legacy.request().error,/ya fue reversado/);assert.equal(legacy.writes(),0);
});
test('solicitante obligatorio, permisos y eliminación bloqueada, incluso desde una app anterior',()=>{
 const b=backend();assert.match(b.request({reversalRequestedBy:'  '}).error,/quién solicitó/);assert.match(b.request({reversalRequestedBy:'a'.repeat(201)}).error,/200/);
 assert.match(b.request({action:'adminReverseMovement',reversalRequestedBy:''}).error,/quién solicitó/);assert.match(b.request({action:'adminDeleteMovement'}).error,/conservan/);
 b.ctx.verifyAdminToken_=()=>({role:'assistant'});assert.match(b.request().error,/Administrador principal/);assert.equal(b.writes(),0);
});
test('fallo de escritura no confirma la operación y el reintento la aplica una sola vez',()=>{
 const b=backend(),write=b.ctx.writeFile_;b.ctx.writeFile_=()=>{throw Error('Fallo de escritura')};assert.equal(b.request().ok,false);assert.equal(b.cloud().inventoryStock[0].quantity,13);assert.equal(b.locked(),false);
 b.ctx.writeFile_=write;assert.equal(b.request().ok,true);assert.equal(b.cloud().inventoryStock[0].quantity,17);assert.equal(b.writes(),1);
});
test('una sincronización atrasada no quita la marca ni cambia los saldos de una reversión',()=>{
 const b=backend();b.request();const cloud=b.cloud(),originalSaved=cloud.blendingDeliveries[0],reversal=cloud.blendingDeliveries[2];
 const merged=b.ctx.merge_(clone(cloud),{blendingDeliveries:[{...original,updatedAt:'2099-01-01'}, {...reversal,quantity:900,deleted:true,updatedAt:'2099-01-01'}]});
 assert.deepEqual(clone(merged.blendingDeliveries[0]),originalSaved);assert.deepEqual(clone(merged.blendingDeliveries[2]),reversal);
});
test('reenviar el original desde Plaza no descuenta otra vez; no acepta reversiones creadas en Plaza',()=>{
 const b=backend();b.request();b.ctx.plazaSync_({token:'test',data:{blendingDeliveries:[{...original,syncState:'pending'}]}});assert.equal(b.cloud().inventoryStock[0].quantity,17);
 assert.throws(()=>b.ctx.plazaSync_({token:'test',data:{blendingDeliveries:[{...original,id:'fake',movementType:'REVERSIÓN',syncState:'pending'}]}}),/desde SK Web Admin/);
});
function admin(data,options={}){
 const nodes=new Map(),alerts=[],calls=[];let saved=data;
 const node=()=>({innerHTML:'',textContent:'',classList:{contains:()=>true,toggle(){}},setAttribute(){},addEventListener(){}});
 const ctx=vm.createContext({document:{querySelector:key=>{if(!nodes.has(key))nodes.set(key,node());return nodes.get(key)},querySelectorAll:()=>[]},window:{addEventListener(){},SKAdminAuth:{isOwner:()=>options.owner!==false,request:async(action,payload)=>{calls.push({action,...payload});if(options.error)throw Error(options.error);return options.backend.request(payload)}},SKAssetRules:{movementLabel:()=>''},writeSyncedSnapshot:async value=>{saved=value}},all:async name=>clone(saved[name]||[]),alert:value=>alerts.push(value),prompt:()=>options.requester===undefined?'Solicitante de prueba':options.requester,confirm:()=>true,refresh:async()=>{}});
 vm.runInContext(read('plaza-movements-admin.js').replace(/\}\)\(\);\s*$/, 'window.audit={render,reverse,setTab:value=>{tab=value}};})();'),ctx);
 return{api:ctx.window.audit,nodes,alerts,calls};
}
test('Admin muestra original y reintegro con solicitante encima del bodeguero y sin botón eliminar',async()=>{
 const b=backend();b.request({reversalRequestedBy:'<script>solicitante</script>'});const h=admin(b.cloud());await h.api.render();const html=h.nodes.get('#plazaMovementList').innerHTML;
 assert.match(html,/REVERSADO/);assert.match(html,/REVERSIÓN/);assert.match(html,/\+ Cantidad reintegrada/);assert.match(html,/&lt;script&gt;solicitante&lt;\/script&gt;/);assert.doesNotMatch(html,/ELIMINAR REGISTRO|data-delete|EXECUTOR-MUST-NOT-APPEAR/);
 assert.ok(html.indexOf('Reversión solicitada por:')<html.indexOf('Bodeguero del movimiento original:'));assert.equal((html.match(/data-reverse=/g)||[]).length,1);
});
test('Admin envía el solicitante explícito por la nueva acción y conserva el modo consulta',async()=>{
 const b=backend(),h=admin(b.cloud(),{backend:b});await h.api.reverse(original.id);assert.deepEqual(h.calls,[{action:'adminReverseMovementV2',type:'delivery',movementId:original.id,reversalRequestedBy:'Solicitante de prueba'}]);
 const readonly=admin(b.cloud(),{owner:false});await readonly.api.render();assert.doesNotMatch(readonly.nodes.get('#plazaMovementList').innerHTML,/data-reverse=/);await readonly.api.reverse(later.id);assert.equal(readonly.calls.length,0);
});
test('cancelar o dejar solicitante vacío no envía; un Code.gs anterior muestra instrucción de actualización',async()=>{
 const b=backend();for(const requester of [null,'  ']){const h=admin(b.cloud(),{requester});await h.api.reverse(original.id);assert.equal(h.calls.length,0);}
 const old=admin(b.cloud(),{error:'Solicitud no válida'});await old.api.reverse(original.id);assert.match(old.alerts[0],/Actualiza Code.gs/);assert.equal(b.writes(),0);
});
function plaza(data){
 const nodes=new Map(),node=()=>({value:'',textContent:'',innerHTML:'',elements:{itemId:{value:'gloves'}},addEventListener(){}});
 const ctx=vm.createContext({document:{querySelectorAll:()=>[],querySelector:key=>{if(key==='#deliveryCategoryFilter input:checked')return {value:'all'};if(!nodes.has(key))nodes.set(key,node());return nodes.get(key)}},window:{alert(){},addEventListener(){}},localStorage:{getItem:()=>null},sessionStorage:{getItem:()=>null},navigator:{onLine:true},setTimeout(){},clearTimeout(){},crypto:{},console});
 vm.runInContext(read('asset-history.js'),ctx);vm.runInContext(read('asset-record-rules.js'),ctx);
 const source=read('plaza/plaza.js').split('  injectItemSearchStyle();setupDeliveryForm();')[0];
 vm.runInContext(source+'\nwindow.audit={set:value=>{data=value},renderRecentQueries,deliveryReportRow,inventoryQueryRows,queryMovementCard};})();',ctx);ctx.window.audit.set(clone(data));return{api:ctx.window.audit,nodes};
}
test('Plaza presenta los dos registros con saldos originales y reintegro positivo; exporta su estado',()=>{
 const b=backend();b.request();const cloud=b.cloud(),h=plaza(cloud);h.api.renderRecentQueries();const html=h.nodes.get('#recentDeliveriesList').innerHTML;
 assert.match(html,/REVERSADO/);assert.match(html,/REVERSIÓN/);assert.match(html,/\+ Cantidad reintegrada/);assert.match(html,/− Cantidad entregada/);assert.match(html,/> 20 ·/);assert.match(html,/> 17<\/span>/);assert.match(html,/Reversión solicitada por:/);
 assert.match(h.api.deliveryReportRow(cloud.blendingDeliveries[0]).observaciones,/REVERSADO/);assert.match(h.api.deliveryReportRow(cloud.blendingDeliveries[2]).observaciones,/\+ Cantidad reintegrada: 4 · Nuevo saldo: 17/);
 const rows=h.api.inventoryQueryRows('stock');assert.equal(rows.length,3);assert.ok(rows.some(row=>row.id===original.id));assert.match(h.api.queryMovementCard(rows.find(row=>row.movementType==='REVERSIÓN')),/Reversión solicitada por:/);
});
