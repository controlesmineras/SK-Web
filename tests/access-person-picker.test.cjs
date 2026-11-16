const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../production-access-admin.js'),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const seed=[
 {id:'ana',nombre:'Ana María',documento:'123',empresa:'SK',area:'Seguridad física'},
 {id:'jose1',nombre:'José Pérez',documento:'456',empresa:'DESMIN',area:'Producción'},
 {id:'jose2',nombre:'José Pérez',documento:'789',empresa:'SK',area:'Seguridad física'},
 {id:'existing',nombre:'Con acceso',documento:'111',area:'Seguridad física',plazaEnabled:true},
 {id:'deleted',nombre:'Borrado',documento:'222',deleted:true},
 {id:'inactive',nombre:'Inactivo',documento:'333',active:false}
];
function app(scope='plaza',{owner=true,failAccess=false,adminRoles=['assistant','admin']}={}){
 let click,dialog;const nodes={},requests=[];
 const document={readyState:'loading',activeElement:null,querySelector:()=>null,getElementById:()=>null,
  addEventListener(type,handler){if(type==='click')click=handler},createElement:make,body:{append(node){dialog=node}}};
 function make(tag){
  const node={tag,children:[],value:'',hidden:false,disabled:false,attrs:{},style:{},
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
   for(const key of ['[data-results]','[data-manage]','[data-person-info]'])nodes[key].hidden=true;
  }});
  return node;
 }
 const window={addEventListener(){},SKAdminAuth:{isAdmin:()=>owner,async request(action,data){
  requests.push({action,data});
  if(action==='adminUsersList'){if(failAccess)throw Error('Offline');return {users:[],adminRoles}}
  if(action==='productionUsers')return {users:[]};
  if(action==='accessInvitationCreate')return {token:'test-token',plazaRole:data.plazaRole,productionRole:data.productionRole,adminRole:data.adminRole};
  throw Error('Unexpected request: '+action);
 }}};
 vm.runInNewContext(source,{document,window,console,all:async()=>structuredClone(seed),URL,location:{href:'https://example.test/SK-Web/'},queueMicrotask,
  Option:class{constructor(text,value){this.textContent=text;this.value=value}},navigator:{clipboard:{writeText:async()=>{}}},confirm:()=>false});
 const trigger={id:scope==='admin'?'adminUsersBtn':scope==='production'?'productionUsersBtn':''};
 const open=async()=>{click({target:{closest:()=>trigger},preventDefault(){},stopImmediatePropagation(){}});await tick()};
 const search=async value=>{const input=nodes['#accessPersonSearch'];input.focus();input.value=value;input.oninput();await tick()};
 const results=()=>nodes['[data-results]'].children;
 return{open,search,results,nodes,requests,dialog:()=>dialog,
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
