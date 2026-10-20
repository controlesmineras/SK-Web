const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const fs=require('node:fs'),path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8'),clone=value=>JSON.parse(JSON.stringify(value));
const date='2026-10-20T15:40:00.000Z';
const fields={id:'',documento:'TEST-100',primerNombre:'Persona',segundoNombre:'',primerApellido:'Prueba',segundoApellido:'',empresa:'SK 3.7',area:'Producción',cargo:'Operador minero',telefono:''};
function formClient(initial=[]){
 let serial=0,handler,scheduled=0;const rows=new Map(initial.map(row=>[row.id,clone(row)])),alerts=[];
 const form={elements:Object.fromEntries(Object.entries(fields).map(([key,value])=>[key,{value}])),dataset:{},addEventListener(type,fn){if(type==='submit')handler=fn},reset(){for(const [key,value] of Object.entries(fields))this.elements[key].value=value}};
 const button={textContent:'Guardar colaborador',disabled:false};
 const ctx={window:{skSyncApi:{schedule(){scheduled++}}},document:{querySelector:selector=>selector==='#personalForm'?form:selector==='#personSaveBtn'?button:null},
 FormData:class{constructor(f){this.form=f}entries(){return Object.entries(this.form.elements).map(([key,node])=>[key,node.value])[Symbol.iterator]()}},
 all:async()=>clone([...rows.values()]),put:async(_,row)=>{rows.set(row.id,clone(row));return row},mark:()=>({id:'person-'+(++serial),createdAt:date,updatedAt:date,syncState:'pending'}),now:()=>date,
 alert:message=>alerts.push(message),confirm:()=>true,refresh:async()=>{},console};
 vm.runInNewContext(read('duplicate-person-guard.js'),ctx);
 return{rows:()=>clone([...rows.values()]),alerts,get scheduled(){return scheduled},submit:async changes=>{for(const [key,value] of Object.entries(changes||{}))form.elements[key].value=value;await handler({preventDefault(){},stopImmediatePropagation(){}})}};
}
function backend(initial={}){
 let cloud={updatedAt:date,personal:[],assets:[],inventoryCriteria:[],inventoryStock:[],blendingIncomes:[],blendingDeliveries:[],...clone(initial)};
 const ctx=vm.createContext({LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})}});
 vm.runInContext(read('backend/apps-script/Code.gs'),ctx);
 ctx.findFile_=()=> 'test';ctx.readFile_=()=>clone(cloud);ctx.writeFile_=(_,value)=>{cloud=clone(value)};ctx.json_=clone;ctx.verifyToken_=()=>({document:'TEST-OPERATOR',role:'plaza_operator'});
 return{sync:rows=>ctx.adminSyncAuthorized_({personal:clone(rows)},'',{role:'assistant',username:'test'}),plaza:()=>ctx.plazaSync_({token:'test',data:{}})};
}
test('el alta conserva un identificador aunque el campo oculto del formulario esté vacío',async()=>{
 const c=formClient();await c.submit();assert.ok(c.rows()[0].id);assert.equal(c.rows()[0].documento,'TEST-100');assert.equal(c.rows()[0].syncState,'pending');
});
test('dos colaboradores nuevos no se sobreescriben en el mismo dispositivo',async()=>{
 const c=formClient();await c.submit();await c.submit({documento:'TEST-200'});assert.equal(c.rows().length,2);assert.equal(new Set(c.rows().map(row=>row.id)).size,2);
});
test('un alta de Admin llega a la vista de Plaza sin habilitarle acceso como usuario',async()=>{
 const c=formClient(),b=backend();await c.submit();b.sync(c.rows());const visible=b.plaza().data.personal.find(row=>row.documento==='TEST-100');assert.ok(visible);assert.ok(visible.id);assert.equal(visible.nombre,'Persona Prueba');
});
test('editar o confirmar un documento existente conserva su identidad',async()=>{
 const c=formClient([{...fields,id:'existing',nombre:'Persona Prueba',createdAt:date,syncState:'synced'}]);await c.submit({telefono:'555'});assert.equal(c.rows().length,1);assert.equal(c.rows()[0].id,'existing');assert.equal(c.rows()[0].telefono,'555');
 await c.submit({id:'existing',telefono:'777'});assert.equal(c.rows().length,1);assert.equal(c.rows()[0].telefono,'777');
});
