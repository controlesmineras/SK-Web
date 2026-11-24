const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const source=['plaza-admin.js','production-access-admin.js'].map(name=>fs.readFileSync(require('node:path').join(__dirname,'..',name),'utf8')).join('\n');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const seed=[
 {id:'ana',nombre:'Ana María',documento:'123',empresa:'SK',area:'Seguridad física'},
 {id:'jose1',nombre:'José Pérez',documento:'456',empresa:'DESMIN',area:'Producción'},
 {id:'jose2',nombre:'José Pérez',documento:'789',empresa:'SK',area:'Seguridad física'},
 {id:'existing',nombre:'Con acceso',documento:'111',area:'Seguridad física',plazaEnabled:true},
 {id:'deleted',nombre:'Borrado',documento:'222',deleted:true},
 {id:'inactive',nombre:'Inactivo',documento:'333',active:false}
];
function app(scope='plaza',{owner=true,failAccess=false,adminRoles=['assistant','admin'],productionUsers=()=>({users:[]}),createInvite,renewForSync,waitForLoginRenewal}={}){
 let click,dialog;const nodes={},requests=[];
 const document={readyState:'loading',activeElement:null,querySelector:()=>null,getElementById:()=>null,
  addEventListener(type,handler){if(type==='click')click=handler},createElement:make,createTextNode:textContent=>({textContent}),body:{append(node){dialog=node}}};
 function make(tag){
  const node={tag,children:[],value:'',hidden:false,disabled:false,attrs:{},style:{},classList:{
    toggle(name,enabled){if(enabled)this.names.add(name);else this.names.delete(name)},names:new Set()
   },
   append(...children){this.children.push(...children);for(const child of children)child.parent=this},
   replaceChildren(...children){this.children=[];this.textContent='';this.append(...children)},
   setAttribute(name,value){this.attrs[name]=value},contains(other){return this===other||this.children.some(child=>child.contains?.(other))},
   focus(){document.activeElement=this;this.onfocus?.()},scrollIntoView(){},add(option){this.append(option);if(!this.value)this.value=option.value},
   querySelector(selector){return tag==='dialog'?nodes[selector]||null:selector==='button'?this.children.find(child=>child.tag==='button'):null},
   showModal(){this.open=true},close(){this.open=false}
  };
  if(tag==='dialog')Object.defineProperty(node,'innerHTML',{set(){
   for(const selector of ['[data-active]','[data-results]','[data-manage]','#accessPersonSearch','[role=status]','[data-copy]','[data-person-info]','[data-document]','[data-company]','h2','[data-close]','.accessPersonField'])nodes[selector]=make('div');
   nodes['.accessPersonField'].append(nodes['#accessPersonSearch'],nodes['[data-results]']);
   nodes['[data-active]'].closest=()=>({before:section=>{nodes.warehouse=section}});
   for(const key of ['[data-results]','[data-manage]','[data-person-info]'])nodes[key].hidden=true;
  }});
  return node;
 }
 const window={addEventListener(){},SKAdminAuth:{isAdmin:()=>owner,renewForSync,waitForLoginRenewal,async request(action,data){
  requests.push({action,data});
  if(action==='adminUsersList'){if(failAccess)throw Error('Offline');return {users:[],adminRoles}}
  if(action==='productionUsers')return productionUsers();
  if(action==='plazaChangeActiveRole')return {personId:data.personId,plazaRole:data.role,updatedAt:'2026-11-24'};
  if(action==='accessInvitationCreate')return createInvite?createInvite(data):{token:'test-token',plazaRole:data.plazaRole,productionRole:data.productionRole,adminRole:data.adminRole};
  throw Error('Unexpected request: '+action);
 }}};
 vm.runInNewContext(source,{document,window,console,all:async()=>structuredClone(seed),put:async()=>{},URL,location:{href:'https://example.test/SK-Web/'},queueMicrotask,
  Option:class{constructor(text,value){this.textContent=text;this.value=value}},navigator:{clipboard:{writeText:async()=>{}}},confirm:()=>false});
 const trigger={id:scope==='admin'?'adminUsersBtn':scope==='production'?'productionUsersBtn':''};
 const open=async()=>{click({target:{closest:()=>trigger},preventDefault(){},stopImmediatePropagation(){}});await tick()};
 const search=async value=>{const input=nodes['#accessPersonSearch'];input.focus();input.value=value;input.oninput();await tick()};
 const results=()=>nodes['[data-results]'].children;
 return{open,search,results,nodes,requests,document,dialog:()=>dialog,
  role(value){nodes['[data-manage]'].children.flatMap(node=>node.children).find(node=>node.tag==='select').value=value},
  choose(index=0){results()[index].onclick()},
  generate:async()=>{nodes['[data-manage]'].children.find(node=>node.tag==='button').onclick();await tick()}};
}
test('despliega nombres y documentos, filtra sin tildes y conserva los accesos existentes',async()=>{
 const s=app();await s.open();const input=s.nodes['#accessPersonSearch'];input.focus();
 assert.deepEqual(s.results().map(row=>row.children[0].textContent),['Ana María','José Pérez','José Pérez']);
 assert.equal(s.nodes['[data-results]'].hidden,false);
 await s.search('JOSE');assert.deepEqual(s.results().map(row=>row.children[1].textContent),['456','789']);
 await s.search('123');assert.equal(s.results()[0].children[0].textContent,'Ana María');
 await s.search('inexistente');assert.equal(s.results().length,0);assert.match(s.nodes['[data-results]'].textContent,/No hay/);
 assert.equal(s.requests.some(row=>row.action==='accessInvitationCreate'),false);
});
test('ofrece Administrador en Web Admin y exige que el servidor lo soporte antes de generar',async()=>{
 const s=app('admin');await s.open();await s.search('ana');s.choose();s.role('admin');await s.generate();
 assert.equal(s.requests.at(-1).data.adminRole,'admin');assert.ok(s.nodes['[data-copy]'].children.length);
 // An old server omits the capability; explicitly simulate the assistant-only result.
 const legacy=app('admin',{adminRoles:['assistant']});await legacy.open();await legacy.search('ana');legacy.choose();legacy.role('admin');await legacy.generate();
 assert.equal(legacy.requests.some(row=>row.action==='accessInvitationCreate'),false);
 assert.match(legacy.nodes['[role=status]'].textContent,/Actualiza Code.gs/);assert.equal(legacy.nodes['[data-copy]'].children.length,0);
});
test('seleccionar homónimos conserva el ID elegido y cambiar la búsqueda limpia el acceso anterior',async()=>{
 const s=app();await s.open();await s.search('jose');s.choose(1);
 assert.equal(s.nodes['#accessPersonSearch'].value,'José Pérez');
 assert.equal(s.nodes['[data-document]'].value,'789');assert.equal(s.nodes['[data-company]'].value,'SK');
 assert.equal(s.nodes['[data-results]'].hidden,true);assert.equal(s.nodes['#accessPersonSearch'].attrs['aria-expanded'],'false');
 await s.generate();assert.equal(s.requests.at(-1).data.personId,'jose2');assert.equal(s.requests.at(-1).data.plazaRole,'assistant');
 assert.ok(s.nodes['[data-copy]'].children.length);
 await s.search('ana');
 assert.equal(s.nodes['[data-manage]'].hidden,true);assert.equal(s.nodes['[data-manage]'].children.length,0);
 assert.equal(s.nodes['[data-person-info]'].hidden,true);assert.equal(s.nodes['[data-document]'].value,'');
 assert.equal(s.nodes['[data-copy]'].children.length,0);
 s.choose();await s.generate();assert.equal(s.requests.at(-1).data.personId,'ana');
});
test('cierra las coincidencias al tocar fuera o pulsar Escape y permite volver a abrirlas',async()=>{
 const s=app();await s.open();await s.search('ana');
 s.dialog().onpointerdown({target:{}});assert.equal(s.nodes['[data-results]'].hidden,true);
 s.nodes['#accessPersonSearch'].focus();assert.equal(s.nodes['[data-results]'].hidden,false);
 s.dialog().onkeydown({key:'Escape',preventDefault(){},stopPropagation(){}});
 assert.equal(s.nodes['[data-results]'].hidden,true);assert.equal(s.dialog().open,true);
});
test('mantiene restricciones de Admin y roles de Producción',async()=>{
 const admin=app('admin');await admin.open();await admin.search('jose');
 assert.deepEqual(admin.results().map(row=>row.children[1].textContent),['789']);
 admin.choose();await admin.generate();assert.equal(admin.requests.at(-1).data.scope,'admin');
 const production=app('production');await production.open();await production.search('456');production.choose();
 await production.generate();assert.equal(production.requests.at(-1).data.productionRole,'assistant');
 const blocked=app('admin',{owner:false});await blocked.open();assert.equal(blocked.dialog(),undefined);
 const failed=app('admin',{failAccess:true});await failed.open();await failed.search('ana');assert.equal(failed.results().length,0);
});

test('un fallo de red permite reintentar y solo ofrece activar después de leer el estado',async()=>{
 let online=false;
 const s=app('production',{productionUsers:()=>{
  if(!online)throw Error('Failed to fetch');
  return {users:[],warehouseV1:true,warehouseSettings:{enabled:false}};
 }});
 await s.open();
 const labels=()=>s.nodes.warehouse.children.map(node=>node.textContent||'').join(' ');
 assert.doesNotMatch(labels(),/Code\.gs|ACTIVAR BODEGA/);
 assert.match(s.nodes['[role=status]'].textContent,/Producción.*conectar/);
 online=true;await s.nodes['[data-copy]'].children.find(node=>node.textContent==='Reintentar consulta').onclick();
 assert.match(labels(),/ACTIVAR BODEGA DE PRODUCCIÓN/);
 assert.equal(s.requests.some(row=>row.action==='productionWarehouseConfigure'),false);
});
test('espera la renovación en curso y permite renovar una sesión vencida antes de consultar otra vez',async()=>{
 let fresh=false,resume;
 const delay=new Promise(resolve=>{resume=resolve});
 const s=app('production',{waitForLoginRenewal:()=>delay,renewForSync:async()=>{fresh=true},
  productionUsers:()=>{if(!fresh)throw Error('La sesión de Web Admin venció');return {users:[],warehouseV1:true,warehouseSettings:{enabled:true,transferStartAt:'2026-11-18T00:00:00Z'}}}});
 await s.open();assert.equal(s.requests.length,0);resume();await tick();
 assert.match(s.nodes['[role=status]'].textContent,/sesión de Web Admin venció/);
 await s.nodes['[data-copy]'].children.find(node=>node.textContent==='Renovar sesión de Admin').onclick();await tick();
 assert.ok(s.nodes.warehouse.children.some(node=>/Ingresos automáticos desde/.test(node.textContent)));
 assert.equal(s.requests.some(row=>row.action==='productionWarehouseConfigure'),false);
});
test('distingue una versión sin Bodega de una respuesta incompleta',async()=>{
 const legacy=app('production');await legacy.open();
 assert.ok(legacy.nodes.warehouse.children.some(node=>/Actualiza Code\.gs/.test(node.textContent)));
 for(const result of [{},{users:[],warehouseV1:true}]){
  const incomplete=app('production',{productionUsers:()=>result});await incomplete.open();
  assert.ok(incomplete.nodes.warehouse);
  assert.equal(incomplete.nodes.warehouse.children.some(node=>/Actualiza Code\.gs|ACTIVAR BODEGA/.test(node.textContent)),false);
 }
});

test('Plaza permite asignar al bodeguero aunque la consulta de Producción siga pendiente',async()=>{
 let finish;
 const production=new Promise(resolve=>{finish=resolve});
 const s=app('plaza',{productionUsers:()=>production});
 await s.open();
 assert.equal(s.nodes['#accessPersonSearch'].disabled,false);
 await s.search('123');s.choose();s.role('operator');await s.generate();
 const invite=s.requests.find(row=>row.action==='accessInvitationCreate');
 assert.equal(invite.data.personId,'ana');assert.equal(invite.data.plazaRole,'operator');
 finish({users:[]});await tick();
 assert.ok(s.nodes['[data-copy]'].children.some(node=>node.textContent==='Copiar enlace'));
});
test('un toque que quita el foco al buscador conserva la coincidencia hasta seleccionarla',async()=>{
 const s=app();await s.open();await s.search('123');
 const field=s.nodes['.accessPersonField'];
 s.document.activeElement=s.document.body;
 field.onfocusout({relatedTarget:null});
 await tick();assert.equal(s.nodes['[data-results]'].hidden,false);
 s.choose();assert.equal(s.nodes['[data-document]'].value,'123');
});
test('elegir un homónimo fija su documento aunque el buscador reciba foco u otro evento con el mismo texto',async()=>{
 const s=app();await s.open();await s.search('jose');
 const list=s.nodes['[data-results]'],input=s.nodes['#accessPersonSearch'];
 const option=s.results()[1];
 let focusPreserved=false;
 list.onpointerdown({button:0,target:{closest:()=>option},preventDefault(){focusPreserved=true}});
 assert.equal(focusPreserved,true);
 assert.equal(s.nodes['[data-manage]'].hidden,true);
 option.onclick();
 input.focus();input.oninput();
 assert.equal(list.hidden,true);assert.equal(input.value,'José Pérez');
 assert.equal(s.nodes['[data-document]'].value,'789');assert.equal(s.nodes['[data-manage]'].hidden,false);
 s.role('operator');await s.generate();
 assert.equal(s.requests.at(-1).data.personId,'jose2');assert.equal(s.requests.at(-1).data.plazaRole,'operator');
 await s.search('Ana');
 assert.equal(s.nodes['[data-manage]'].hidden,true);assert.equal(s.nodes['[data-document]'].value,'');
});
test('si vence la sesión al generar, permite renovarla y reintentar con el mismo funcionario y rol',async()=>{
 let fresh=false;
 const s=app('plaza',{createInvite:data=>{
  if(!fresh)throw Error('La sesión de Web Admin venció');
  return {token:'test',plazaRole:data.plazaRole};
 },renewForSync:async()=>{fresh=true;return true}});
 await s.open();await s.search('456');s.choose();s.role('operator');await s.generate();
 assert.match(s.nodes['[role=status]'].textContent,/venció/);
 await s.nodes['[data-copy]'].children.find(node=>node.textContent==='Renovar sesión de Admin').onclick();
 assert.equal(s.dialog().open,true);assert.equal(s.nodes['[data-document]'].value,'456');
 assert.equal(s.requests.filter(row=>row.action==='accessInvitationCreate').length,1);
 await s.generate();
 assert.equal(s.requests.at(-1).data.personId,'jose1');assert.equal(s.requests.at(-1).data.plazaRole,'operator');
 assert.ok(s.nodes['[data-copy]'].children.some(node=>node.textContent==='Copiar enlace'));
});

test('un administrador puede corregir el rol de una cuenta de Plaza activa sin generar una invitación',async()=>{
 const s=app();await s.open();
 s.nodes['[data-active]'].children[0].children.find(n=>n.textContent==='Gestionar accesos').onclick();
 const controls=s.nodes['[data-manage]'].children,select=controls.flatMap(node=>node.children).find(n=>n.tag==='select');
 const save=controls.find(n=>n.textContent==='Guardar rol');
 assert.equal(save.hidden,true);
 select.value='assistant';select.onchange();
 assert.equal(save.hidden,false);await save.onclick();await tick();
 assert.equal(s.requests.at(-1).action,'plazaChangeActiveRole');
 assert.equal(s.requests.at(-1).data.previousRole,'operator');
 assert.equal(s.requests.at(-1).data.role,'assistant');
 assert.equal(s.requests.some(r=>r.action==='accessInvitationCreate'),false);
 assert.match(s.nodes['[role=status]'].textContent,/Rol guardado/);
});
