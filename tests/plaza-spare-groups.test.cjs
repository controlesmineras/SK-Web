const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=path=>fs.readFileSync(path,'utf8');
const spare=(id,type,number,name='Resorte')=>({id,isYtSpare:true,spareEquipment:type,spareItemNumber:number,spareItemName:name,name:`Repuesto ${type} - Ítem ${number} - ${name}`,unit:'Unidad'});
const fixtures=()=>[spare('yt1','YT 29','1'),spare('yt12','YT 29','12'),spare('yt2','YT 29','2'),spare('yt28','YT 28','1'),spare('col29','Columna 29','1'),spare('col28','Columna 28','1'),spare('unnumbered','YT 29','','Lubricador'),{id:'common',name:'Guantes'}, {...spare('removed','YT 29','3'),deleted:true}];
function model(){const window={};vm.runInNewContext(read('spare-groups.js'),{window});return window.SKSpareGroups}
test('four distinct groups preserve item identities and numeric order without mutating the catalog',()=>{
 const api=model(),items=fixtures(),before=JSON.stringify(items),groups=api.entries(items);
 assert.deepEqual(Array.from(groups,x=>x.type||x.item.id),['YT 29','YT 28','Columna 29','Columna 28','common']);
 assert.deepEqual(Array.from(groups[0].items,x=>x.id),['yt1','yt2','yt12','unnumbered']);
 assert.equal(groups[0].items[0],items[0]);assert.equal(JSON.stringify(items),before);
});
test('exact numbers, accents, aliases and model names can locate a group or a specific spare',()=>{
 const api=model(),items=fixtures();items[0].secondaryName='Muelle';
 assert.deepEqual(Array.from(api.parts(items,'YT 29','1'),x=>x.id),['yt1']);
 assert.deepEqual(Array.from(api.parts(items,'YT 29','ítem 1 resórte'),x=>x.id),['yt1']);
 assert.deepEqual(Array.from(api.parts(items,'YT 29','muelle'),x=>x.id),['yt1']);
 assert.equal(api.entries(items,'YT29')[0].type,'YT 29');
 assert.equal(api.entries(items,'repuestos de columna 28')[0].type,'Columna 28');
 assert.equal(api.entries(items,'guantes')[0].item.id,'common');
 items.push({id:'machine-yt29',name:'YT 29',isFixedAsset:true});
 assert.ok(api.entries(items,'YT 29').some(entry=>entry.item?.id==='machine-yt29'));
 for(const query of ['Repuesto de YT29','REPUESTO DE YT 29','Repuestos de YT29']){
   const found=api.entries(items,query);
   assert.equal(found.length,1);assert.equal(found[0].label,'REPUESTO DE YT29');assert.equal(found[0].type,'YT 29');
 }
 assert.equal(api.entries(items,'Repuesto de YT28')[0].label,'REPUESTO DE YT28');
 assert.equal(api.entries(items,'Repuesto de columna 29')[0].label,'REPUESTO DE COLUMNA 29');
});
test('records describe a spare, including its model and number; common items and unknown metadata remain visible',()=>{
 const api=model(),items=fixtures();
 assert.equal(api.recordName(items[0]),'REPUESTO DE YT29 · ÍTEM 1 · Resorte');
 assert.equal(api.recordName(items[4]),'REPUESTO DE COLUMNA 29 · ÍTEM 1 · Resorte');
 assert.equal(api.recordName(items[6]),'REPUESTO DE YT29 · Lubricador');
 assert.equal(api.recordName(items[7]),'Guantes');
 const unusual={id:'unknown',name:'Pieza especial',isYtSpare:true,spareEquipment:'Otro'};
 assert.equal(api.entries([unusual])[0].item,unusual);
});

// DOM mínimo: se ejercitan los manejadores reales del selector sin red ni almacenamiento.
class Node {
 constructor(tag='div'){this.tag=tag;this.children=[];this.events={};this.dataset={};this.attributes={};this.style={};this.value='';this.textContent='';this.classList={add(){},remove(){}};this.disabled=false;this.hidden=false;}
 append(...nodes){for(const node of nodes){if(node.parent)node.parent.children=node.parent.children.filter(x=>x!==node);node.parent=this;this.children.push(node)}}
 after(node){this.parent.append(node)}
 replaceChildren(...nodes){this.children=[];this.append(...nodes)}
 setAttribute(k,v){this.attributes[k]=v}
 removeAttribute(k){delete this.attributes[k]}
 addEventListener(k,fn){(this.events[k]||=[]).push(fn)}
 dispatchEvent(event){event.stopPropagation??=()=>{};event.target??=this;for(const fn of this.events[event.type]||[])fn(event)}
 closest(tag){return this.tag===tag?this:this.parent?.closest(tag)}
 contains(node){return this===node||this.children.some(x=>x.contains(node))}
 querySelectorAll(query){return this.children.flatMap(x=>[...(x.tag==='button'&&(!query.includes(':disabled')||!x.disabled)?[x]:[]),...x.querySelectorAll(query)])}
 focus(){this.dispatchEvent({type:'focus'})}
 scrollIntoView(){}
 setCustomValidity(message){this.validityMessage=message}
 reportValidity(){return !this.validityMessage}
 add(node){this.append(node)}
 get options(){return this.children}
}
function picker(delivery=true){
 const form=new Node('form');form.id=delivery?'deliveryForm':'incomeForm';const label=new Node('label'),select=new Node('select');label.append(select);form.append(label);form.elements={itemId:select};
 const document={createElement:tag=>new Node(tag),addEventListener(){}};
 const window={},ctx={window,document,Event:class{constructor(type){this.type=type}},Option:class extends Node{constructor(text,value){super('option');this.textContent=text;this.value=value}}};
 vm.runInNewContext(read('spare-groups.js'),ctx);vm.runInNewContext(read('plaza/spare-picker.js'),ctx);
 let items=fixtures(),changes=0,quantity=5,loan=false;select.addEventListener('change',()=>changes++);
 const api=window.SKSparePicker.mount(form,{title:'ELEMENTO',isDelivery:delivery,items:()=>items,fixed:()=>false,availability:()=>quantity,aliases:()=>[],loan:()=>loan,badge:n=>({className:'available',text:String(n)})});
 const click=(menu,key,value)=>{const button=menu.children.find(x=>x.dataset[key]===value);assert.ok(button,`${key}: ${value}`);menu.dispatchEvent({type:'click',target:button})};
 const group=type=>{api.main.open();click(api.main.menu,'spareGroup',type)};
 return{...api,select,label,group,window,items,changes:()=>changes,setItems:value=>{items=value},setQuantity:value=>{quantity=value},setLoan:value=>{loan=value},choose:id=>click(api.detail.menu,'itemId',id),type(value,target=api.detail){target.input.value=value;target.input.dispatchEvent({type:'input'})}};
}
test('selecting a group cannot be saved; selecting a child uses the original ID and clears when switching models',()=>{
 const c=picker();c.group('YT 29');assert.equal(c.select.value,'');assert.equal(c.label._validateItemSearch(),false);
 assert.equal(c.detail.input.required,true);assert.deepEqual(c.detail.menu.children.map(x=>x.dataset.itemId),['yt1','yt2','yt12','unnumbered']);
 c.choose('yt1');assert.equal(c.select.value,'yt1');assert.equal(c.label._validateItemSearch(),true);assert.equal(c.detail.input.required,false);
 c.group('YT 28');assert.equal(c.select.value,'');assert.equal(c.label._validateItemSearch(),false);assert.deepEqual(c.detail.menu.children.map(x=>x.dataset.itemId),['yt28']);
 c.choose('yt28');assert.equal(c.select.value,'yt28');assert.ok(c.changes()>=4);
});
test('typing clears a previous child, exact search does not select another item, and form clearing resets both fields',()=>{
 const c=picker();c.group('YT 29');c.choose('yt1');c.type('12');assert.equal(c.select.value,'');assert.deepEqual(c.detail.menu.children.map(x=>x.dataset.itemId),['yt12']);
 c.choose('yt12');c.clear();assert.equal(c.main.input.value,'');assert.equal(c.detail.input.value,'');assert.equal(c.detail.input.disabled,true);assert.equal(c.detail.input.required,false);assert.equal(c.label._hasItemSearchDraft(),false);
 c.group('YT 29');c.choose('yt1');c.type('Guantes',c.main);assert.equal(c.select.value,'');assert.equal(c.detail.input.disabled,true);
 c.main.menu.dispatchEvent({type:'click',target:c.main.menu.children[0]});assert.equal(c.select.value,'common');
});
test('zero stock is unavailable for delivery and selectable for income; refresh validates removed items',()=>{
 const c=picker();c.setQuantity(0);c.group('YT 29');c.choose('yt1');assert.equal(c.select.value,'');assert.equal(c.detail.menu.children[0].disabled,true);
 c.setQuantity(5);c.refresh();c.choose('yt1');c.setItems(c.items.filter(x=>x.id!=='yt1'));c.refresh();assert.equal(c.select.value,'');assert.equal(c.label._validateItemSearch(),false);
 const incoming=picker(false);incoming.setQuantity(0);incoming.group('YT 29');incoming.choose('yt1');assert.equal(incoming.select.value,'yt1');assert.equal(incoming.detail.input.attributes['aria-label'],'BUSCA EL ÍTEM A INGRESAR');
});
test('keyboard selects a concrete item and escape closes the menu; refreshing preserves selections and updates captions',()=>{
 const c=picker();c.group('YT 29');c.type('1');c.detail.input.dispatchEvent({type:'keydown',key:'Enter',preventDefault(){}});assert.equal(c.select.value,'yt1');
 c.refresh();assert.equal(c.select.value,'yt1');assert.equal(c.main.input.value,'REPUESTO DE YT29');
 c.setLoan(true);c.refresh();assert.equal(c.detail.input.attributes['aria-label'],'BUSCA EL ÍTEM A PRESTAR');
 c.detail.open();c.detail.input.dispatchEvent({type:'keydown',key:'Escape'});assert.equal(c.detail.menu.hidden,true);
});

test('the unchanged backend confirms each named spare once and Production receives its original criterion ID',()=>{
 const groups=model(),items=fixtures(),clone=value=>JSON.parse(JSON.stringify(value));
 let cloud={assets:[],parts:[{id:'legacy-yt1',clase:'YT',detalle:'29',numero:'1',nombre:'Resorte'}],personal:[{id:'recipient',documento:'123',nombre:'Prueba'}],inventoryCriteria:items.map(item=>item.id==='yt1'?{...item,productionPartId:'legacy-yt1'}:item),inventoryStock:items.map(item=>({id:'stock-'+item.id,itemId:item.id,quantity:10})),blendingIncomes:[],blendingDeliveries:[]};
 let locked=false;
 const ctx=vm.createContext({Utilities:{getUuid:()=>require('node:crypto').randomUUID()},LockService:{getScriptLock:()=>({waitLock(){assert.equal(locked,false);locked=true},releaseLock(){locked=false}})},DriveApp:{getFilesByName:()=>{let read=false;return{hasNext:()=>!read,next:()=>{read=true;return{getBlob:()=>({getDataAsString:()=>JSON.stringify({consumptions:[],incomes:[]})})}}}}}});
 vm.runInContext(read('backend/apps-script/Code.gs'),ctx);
 ctx.findFile_=()=> 'file';ctx.readFile_=()=>clone(cloud);ctx.writeFile_=(_,value)=>{assert.ok(locked);cloud=clone(value)};ctx.json_=clone;
 ctx.verifyToken_=()=>({document:'operator',role:'plaza_operator'});ctx.verifyProductionToken_=()=>({role:'admin',document:'123',personId:'recipient'});
 const movement=(item,id,quantity)=>({id,syncEventId:id,itemId:item.id,itemName:groups.recordName(item),quantity,destination:'Producción',recipientId:'recipient',createdAt:'2026-11-12T10:00:00.000Z',updatedAt:'2026-11-12T10:00:00.000Z',syncState:'pending'});
 const rows=[movement(items[0],'test-delivery-yt29',2),movement(items[3],'test-delivery-yt28',3)];
 for(let retry=0;retry<2;retry++){
   const reply=ctx.plazaSync_({token:'test',syncProtocol:'plaza-receipts-v1',data:{blendingDeliveries:rows}});
   assert.ok(reply.acknowledgements.blendingDeliveries.every(row=>row.status===(retry?'already-applied':'accepted')));
 }
 assert.equal(cloud.blendingDeliveries.length,2);
 assert.equal(cloud.inventoryStock.find(row=>row.itemId==='yt1').quantity,8);
 assert.equal(cloud.inventoryStock.find(row=>row.itemId==='yt28').quantity,7);
 assert.equal(cloud.inventoryStock.find(row=>row.itemId==='col29').quantity,10);
 assert.equal(cloud.blendingDeliveries[0].itemName,'REPUESTO DE YT29 · ÍTEM 1 · Resorte');
 const production=ctx.productionSync_({token:'test',pending:[]});
 assert.deepEqual(production.deliveries.map(row=>row.itemId),['yt1','yt28']);
 assert.ok(ctx.productionCatalog_(cloud.parts,cloud.inventoryCriteria,'YT29').get('legacy-yt1').aliases.includes('yt1'));
});
