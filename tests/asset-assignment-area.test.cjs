const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const fs=require('node:fs'),path=require('node:path'),{IDBFactory}=require('fake-indexeddb');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8'),clone=x=>JSON.parse(JSON.stringify(x));
const history=require('../asset-history.js'),window={};vm.runInNewContext(read('asset-record-rules.js'),{window});
const rules=window.SKAssetRules,warehouse='Bodega Plaza Blending';
const asset={id:'tool',clase:'Taladro',serial:'TEST-SERIAL',areaAsignada:'Producción',ubicacion:'Bodega de Superficie',estado:'Operativo/a',createdAt:'2026-10-20T12:00:00Z',updatedAt:'2026-10-20T12:00:00Z',syncState:'synced'};

test('la bodega se añade a las áreas de activos incluso con catálogo personalizado, sin duplicarla',()=>{
 assert.ok(rules.assignmentAreas().includes(warehouse));
 const areas=['Área especial','bodega plaza blending'],before=JSON.stringify(areas);
 assert.deepEqual(clone(rules.assignmentAreas(areas)),['Área especial',warehouse]);assert.equal(JSON.stringify(areas),before);
});
test('los selectores de ficha y alta de Plaza usan las mismas opciones y conservan el valor',()=>{
 const control={value:warehouse,options:[],replaceChildren(...rows){this.options=rows},add(row){this.options.push(row)}};
 const ctx=vm.createContext({window:{SKAssetRules:rules,SKFormOptions:{values:()=>['Área especial']}},document:{querySelector:()=>({elements:{areaAsignada:control}})},Option:class{constructor(label,value){this.textContent=label;this.value=value}}});
 const line=read('asset-admin-ui.js').split('\n').find(x=>x.startsWith('function fillAssignedArea('));vm.runInContext(line+';fillAssignedArea();',ctx);
 assert.equal(control.value,warehouse);assert.ok(control.options.some(o=>o.value===warehouse));assert.ok(control.options.some(o=>o.value==='Área especial'));
 const plazaLine=read('plaza/asset-not-found.js').split('\n').find(x=>x.startsWith('const assetAreas='));vm.runInContext(plazaLine+';window.areas=assetAreas();',ctx);
 assert.deepEqual(clone(ctx.window.areas),['Área especial',warehouse]);
});
for(const role of ['owner','assistant'])test(role+': guardar una novedad persiste y sincroniza la asignación sin cambiar identidad ni duplicar historial',async()=>{
 const form={querySelector:()=>({disabled:false}),reset(){}},status={},localWindow={SKAssetRules:rules,SKAdminAuth:{canView:()=>true},dispatchEvent(){}},alerts=[];
 const ctx=vm.createContext({window:localWindow,indexedDB:new IDBFactory(),document:{querySelector:()=>status},Event:class{},console,alert:m=>alerts.push(m)});
 vm.runInContext(read('app.js').split('const PARTS=')[0],ctx);await ctx.openDB();await ctx.put('assets',clone(asset));
 const values={assetId:asset.id,descripcion:'Revista física',areaAsignada:warehouse,ubicacion:asset.ubicacion,estado:asset.estado,fechaNovedad:'2026-10-22',horaNovedad:'14:00'};
 ctx.FormData=class{entries(){return Object.entries(values)}};
 Object.assign(ctx,{fd:()=>({...values}),mark:()=>({id:'novelty',createdAt:'2026-10-22T19:00:00Z',updatedAt:'2026-10-22T19:00:00Z',syncState:'pending'}),refresh:async()=>{},update:async()=>{},saving:false,selectedAsset:null,noveltyText:x=>x,isRetirement:()=>false,isRetiredState:()=>false,isVisorChange:()=>false});
 const source=read('novelty-form.js'),start=source.indexOf('async function save(event)'),end=source.indexOf('\nfunction installAssetPicker',start);vm.runInContext(source.slice(start,end),ctx);
 await ctx.save({target:form,preventDefault(){}});assert.deepEqual(alerts,[]);
 const incoming={assets:clone(await ctx.all('assets')),novelties:clone(await ctx.all('novelties'))};
 assert.equal(incoming.assets[0].areaAsignada,warehouse);assert.equal(incoming.novelties[0].areaAsignada,warehouse);assert.equal(incoming.assets[0].serial,asset.serial);
 let cloud={assets:[clone(asset)],novelties:[],inventoryCriteria:[{id:'drill',name:'Taladro',isFixedAsset:true,usesSerial:true}]};
 const server=vm.createContext({LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})}});vm.runInContext(read('backend/apps-script/Code.gs'),server);
 Object.assign(server,{findFile_:()=> 'file',readFile_:()=>clone(cloud),writeFile_:(_,data)=>cloud=clone(data),json_:clone});
 for(let n=0;n<2;n++)server.adminSyncAuthorized_(clone(incoming),'',{role,username:'test'});
 assert.equal(cloud.novelties.length,1);assert.equal(cloud.novelties[0].areaAsignada,warehouse);
 assert.equal(history.project(cloud.assets[0],cloud).asset.areaAsignada,warehouse);assert.equal(cloud.assets[0].serial,asset.serial);assert.equal(cloud.assets.length,1);
});
test('la asignación de novedad resiste una inspección y un préstamo, y cede ante un movimiento posterior',()=>{
 const novelty={id:'assignment',assetId:asset.id,areaAsignada:warehouse,descripcion:'Revista física',createdAt:'2026-10-22T19:00:00Z'};
 const data={novelties:[novelty,{id:'inspection',assetId:asset.id,descripcion:'Revista física',createdAt:'2026-10-22T19:05:00Z'}],blendingDeliveries:[{id:'loan',assetId:asset.id,deliveryType:'PRÉSTAMO',destination:'Socavón',createdAt:'2026-10-22T19:10:00Z'}]};
 assert.equal(history.project(asset,data).asset.areaAsignada,warehouse);
 data.blendingDeliveries.push({id:'new-assignment',assetId:asset.id,deliveryType:'ASIGNACIÓN',destinationArea:'Seguridad física',createdAt:'2026-10-22T19:20:00Z'});
 assert.equal(history.project(asset,data).asset.areaAsignada,'Seguridad física');
 data.blendingDeliveries[1].reversed=true;assert.equal(history.project(asset,data).asset.areaAsignada,warehouse);
});
test('editar Asignada a en la ficha prevalece sobre movimientos antiguos y un cambio posterior vuelve a prevalecer',()=>{
 const saved={...asset,areaAsignada:warehouse,areaAsignadaRevision:{value:warehouse,at:'2026-10-22T19:30:00Z'}};
 const data={blendingDeliveries:[{id:'old',assetId:asset.id,deliveryType:'ASIGNACIÓN',destinationArea:'Producción',createdAt:'2026-10-22T19:00:00Z'}]};
 assert.equal(history.project(saved,data).asset.areaAsignada,warehouse);
 data.novelties=[{id:'new',assetId:asset.id,descripcion:'Revista física',areaAsignada:'Seguridad física',createdAt:'2026-10-22T19:40:00Z'}];
 assert.equal(history.project(saved,data).asset.areaAsignada,'Seguridad física');
 data.novelties[0].reversed=true;assert.equal(history.project(saved,data).asset.areaAsignada,warehouse);
});
test('el ingreso que crea el activo conserva su área elegida; un retorno posterior libera la asignación',()=>{
 const saved={...asset,areaAsignada:warehouse,areaAsignadaRevision:{value:warehouse,at:asset.createdAt}},data={blendingIncomes:[{id:'initial',assetId:asset.id,createdAt:asset.createdAt}]};
 assert.equal(history.project(saved,data).asset.areaAsignada,warehouse);
 data.blendingIncomes.push({id:'return',assetId:asset.id,createdAt:'2026-10-22T20:00:00Z'});
 assert.equal(history.project(saved,data).asset.areaAsignada,'');
});
