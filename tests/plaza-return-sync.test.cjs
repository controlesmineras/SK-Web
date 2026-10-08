const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readFileSync}=require('node:fs'),{join}=require('node:path');
const read=file=>readFileSync(join(__dirname,'..',file),'utf8');
const clone=value=>JSON.parse(JSON.stringify(value));
function harness(){
 const storage=new Map(),alerts=[],errors=[],nodes=new Map();
 const node=()=>({value:'',hidden:false,textContent:'',dataset:{},classList:{add(){},remove(){}},addEventListener(){},setAttribute(){},removeAttribute(){}});
 const document={querySelector(selector){if(!nodes.has(selector))nodes.set(selector,node());return nodes.get(selector)}};
 const ctx=vm.createContext({document,alert:message=>alerts.push(message),window:{alert:message=>alerts.push(message),addEventListener(){},dispatchEvent(){},SKPlazaReturns:{setSyncError:message=>errors.push(message)}},sessionStorage:{getItem(){return null}},localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},navigator:{onLine:true},console,crypto:{},setTimeout(){return 1},clearTimeout(){},Event:class Event{}});
 const source=read('plaza/plaza.js').split('  injectItemSearchStyle();setupDeliveryForm();')[0];
 vm.runInContext(source+`\nrender=()=>{};window.testing={sync,get:()=>data,set:value=>{data=value},post:fn=>{post=fn},storage:next=>{localStorage.setItem('skPlazaData',JSON.stringify(next));data=next}};})();`,ctx);
 return {api:ctx.window.testing,storage,alerts,errors,ctx};
}
const pending=()=>({personal:[],assets:[{id:'asset',ubicacion:'Bodega de Superficie',syncState:'pending'}],blendingIncomes:[],blendingDeliveries:[{id:'return',syncEventId:'return',movementType:'DEVOLUCIÓN',loanId:'loan',assetId:'asset',syncState:'pending'}]});

test('servidor anterior: solo consulta capacidades, conserva la devolución y muestra el motivo',async()=>{
 const h=harness(),data=pending(),calls=[];h.api.set(data);
 h.api.post(async q=>{calls.push(clone(q));return{ok:true,data:{},capabilities:{externalIncomeV1:true}}});
 assert.equal(await h.api.sync(false),false);
 assert.equal(calls.length,1);assert.deepEqual(calls[0].data,{});
 assert.equal(h.api.get().blendingDeliveries[0].syncState,'pending');
 assert.match(h.errors[0],/Falta actualizar el servicio central/);assert.match(h.alerts[0],/devolución está guardada/);
});
test('sin internet no envía solicitudes y conserva registros locales',async()=>{
 const h=harness();h.api.set(pending());h.ctx.navigator.onLine=false;let calls=0;h.api.post(async()=>{calls++});
 assert.equal(await h.api.sync(true),false);assert.equal(calls,0);assert.equal(h.api.get().blendingDeliveries[0].syncState,'pending');
});
test('servidor actualizado confirma la devolución sin perder otra guardada durante el envío',async()=>{
 const h=harness(),data=pending();h.api.set(data);let calls=0;
 h.api.post(async q=>{
  calls++;
  if(calls===1)return{ok:true,capabilities:{loanReturnsV1:true}};
  assert.equal(q.data.blendingDeliveries[0].id,'return');
  data.blendingDeliveries.push({id:'return2',syncEventId:'return2',movementType:'DEVOLUCIÓN',loanId:'loan2',syncState:'pending'});
  return{ok:true,capabilities:{loanReturnsV1:true},data:{personal:[],assets:[{id:'asset',ubicacion:'Bodega de Superficie',syncState:'synced'}],blendingIncomes:[],blendingDeliveries:[{...clone(q.data.blendingDeliveries[0]),syncState:'synced'}]}};
 });
 assert.equal(await h.api.sync(true),true);assert.equal(calls,2);
 const rows=h.api.get().blendingDeliveries;assert.equal(rows.length,2);assert.equal(rows[0].syncState,'synced');assert.equal(rows[1].syncState,'pending');
 assert.equal(JSON.parse(h.storage.get('skPlazaData')).blendingDeliveries.length,2);
});
test('el formulario conserva el préstamo si falla el almacenamiento y evita doble devolución',()=>{
 const nodes=new Map(),alerts=[];const button={disabled:false};
 const form={hidden:false,reset(){},querySelector(){return button},elements:{returnedBy:{value:'123 · Persona'},returnedAt:{value:'2026-10-08T10:00:00Z'},notes:{value:'Completo'}}};
 nodes.set('#assetReturnForm',form);nodes.set('#assetReturnFilter',{value:'PENDIENTE'});nodes.set('#assetReturnSearch',{value:''});
 let data={personal:[{id:'person',documento:'123',nombre:'Persona'}],assets:[{id:'asset',ubicacion:'Operación'}],blendingDeliveries:[{id:'loan',assetId:'asset',itemId:'item',deliveryType:'PRÉSTAMO',recipientId:'person',destination:'Operación',createdAt:'2026-10-01T00:00:00Z'}]},fail=true,syncs=0;
 const app={getData:()=>data,getUser:()=>({id:'operator',nombre:'Bodeguera'}),saveData(next){if(fail)throw Error('Sin espacio');data=next},refreshDelivery(){},updatePendingBadge(){},renderRecentQueries(){},sync(){syncs++}};
 const ctx=vm.createContext({window:{SKPlaza:app,addEventListener(){}},document:{querySelector(selector){if(!nodes.has(selector))nodes.set(selector,{});return nodes.get(selector)}},crypto:{randomUUID:()=> 'return'},alert:message=>alerts.push(message)});
 const source=read('plaza/asset-returns.js').replace(/\}\)\(\);\s*$/,'window.testing={save,select:id=>{selectedId=id}};})();');vm.runInContext(source,ctx);
 ctx.window.testing.select('loan');ctx.window.testing.save({preventDefault(){},currentTarget:form});
 assert.equal(data.blendingDeliveries.length,1);assert.equal(data.assets[0].ubicacion,'Operación');assert.equal(form.hidden,false);assert.equal(syncs,0);
 fail=false;ctx.window.testing.save({preventDefault(){},currentTarget:form});ctx.window.testing.save({preventDefault(){},currentTarget:form});
 assert.equal(data.blendingDeliveries.length,2);assert.equal(data.assets[0].ubicacion,'Bodega de Superficie');assert.equal(syncs,1);assert.equal(form.hidden,true);
});
