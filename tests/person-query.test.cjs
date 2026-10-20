const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),personSource=fs.readFileSync(path.join(root,'person-query.js'),'utf8'),navSource=fs.readFileSync(path.join(root,'admin-home-navigation.js'),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function app(seed=[],{ready=true,allowed=true,failLoad=false}={}){
 let rows=structuredClone(seed),reads=0,readError=false,reader=null,loads=0,context;
 const nodes={},events={},alerts=[],scripts=[];
 function make(){const classes=new Set();return{value:'',innerHTML:'',textContent:'',dataset:{},attrs:{},handlers:{},className:'',classList:{contains:name=>classes.has(name),toggle(name,on){on?classes.add(name):classes.delete(name)}},setAttribute(key,value){this.attrs[key]=value},addEventListener(type,fn){this.handlers[type]=fn},querySelector(selector){return selector[0]==='#'?nodes[selector.slice(1)]:nodes.back},remove(){const index=scripts.indexOf(this);if(index>=0)scripts.splice(index,1)},focus(){}}}
 nodes.home=make();nodes.home.id='home';nodes.home.className='view';nodes.home.classList.toggle('active',true);
 const main={appendChild(section){nodes[section.id]=section;for(const match of section.innerHTML.matchAll(/id="([^"]+)"/g))nodes[match[1]]=make();nodes.back=make()}};
 const document={readyState:'loading',getElementById:id=>nodes[id],createElement:make,addEventListener(){},querySelector(selector){if(selector==='main')return main;if(selector.startsWith('script[data-admin-module='))return scripts.find(s=>s.dataset.adminModule==='personQuery')||null;return null},querySelectorAll(selector){return selector==='.view'?Object.values(nodes).filter(n=>n.className==='view'):[]},body:{appendChild(script){scripts.push(script);loads++;queueMicrotask(()=>{if(failLoad){failLoad=false;script.onerror(new Error('Offline'));return}vm.runInContext(personSource,context);script.onload()})}}};
 const window={SKAdminAuth:{canView:id=>allowed||id==='home'},addEventListener:(type,fn)=>(events[type]??=[]).push(fn),dispatchEvent(){},scrollTo(){}};
 context=vm.createContext({window,document,console:{error(){},warn(){}},alert:message=>alerts.push(message),setTimeout,clearTimeout,all:async store=>{assert.equal(store,'personal');reads++;if(readError)throw Error('Read failed');return reader?reader():structuredClone(rows)},put(){assert.fail('Consultas must never write records')},Event:class{},queueMicrotask});
 // app.js declares let db; it is a global lexical binding, not window.db.
 vm.runInContext(`let db=${ready?'{}':'null'};`,context);vm.runInContext(navSource,context);document.readyState='complete';
 return{nodes,window,alerts,open:()=>window.SKAdminNav.go('personQuery'),render:()=>window.SKPersonQuery.render(),reads:()=>reads,loads:()=>loads,html:()=>nodes.personQueryList?.innerHTML||'',count:()=>nodes.personQueryCount?.textContent||'',search:async value=>{nodes.personQuerySearch.value=value;await nodes.personQuerySearch.handlers.input()},emit:async type=>{for(const fn of events[type]||[])fn();await tick()},databaseReady(){vm.runInContext('db={};',context)},rows:value=>rows=structuredClone(value),fail:value=>readError=value,reader:fn=>reader=fn,deny:()=>allowed=false};
}
const seed=[{id:'b',nombre:'Zoé',documento:'20',empresa:'SK 3.7',area:'Producción',cargo:'Operador minero'},{id:'a',nombre:'Ana María',documento:'10',empresa:'DESMIN',area:'Desmin - Obras civiles',cargo:'No informado',telefono:'300123'},{id:'d',nombre:'Eliminado',deleted:true}];
test('abrir después del evento load monta la vista y lee la base local declarada con let',async()=>{
 const s=app(seed);assert.equal(s.window.db,undefined);await s.open();
 assert.ok(s.nodes.personQuery,'the first click must create the view');assert.equal(s.nodes.personQuery.classList.contains('active'),true);assert.equal(s.reads(),1);assert.match(s.count(),/2 colaboradores/);assert.match(s.html(),/Ana María/);assert.doesNotMatch(s.html(),/Eliminado/);assert.ok(s.html().indexOf('Ana María')<s.html().indexOf('Zoé'));
 await s.open();assert.equal(s.loads(),1);assert.equal(s.reads(),2);assert.deepEqual(s.alerts,[]);
});
test('la consulta usa la base léxica aunque window.db no exista; busca y permanece en solo lectura',async()=>{
 const s=app(seed);await s.open();await s.render();assert.match(s.html(),/Información incompleta/);assert.doesNotMatch(s.html(),/<form|<input|<button|Editar|Guardar/);
 await s.search('ana maria');assert.match(s.count(),/1 colaborador/);assert.match(s.html(),/Ana María/);assert.doesNotMatch(s.html(),/Zoé/);
 await s.search('20');assert.match(s.html(),/Zoé/);await s.search('ninguno');assert.match(s.html(),/No hay colaboradores/);
});
test('espera la base local y actualiza el listado después de sincronizar',async()=>{
 const s=app(seed,{ready:false});await s.open();assert.match(s.count(),/Iniciando almacenamiento/);assert.equal(s.reads(),0);
 s.databaseReady();await s.emit('skweb-db-ready');assert.match(s.count(),/2 colaboradores/);
 s.rows([...seed,{id:'c',nombre:'Nuevo colaborador',documento:'30'}]);await s.emit('skweb-synced');assert.match(s.count(),/3 colaboradores/);assert.match(s.html(),/Nuevo colaborador/);
});
test('un error al cargar el módulo permite reintentar al volver a pulsar',async()=>{
 const s=app(seed,{failLoad:true});await s.open();assert.equal(s.alerts.length,1);await s.open();assert.equal(s.loads(),2);assert.equal(s.nodes.personQuery.classList.contains('active'),true);assert.match(s.count(),/2 colaboradores/);
});
test('errores de lectura son visibles y permiten reintentar sin modificar los registros',async()=>{
 const s=app(seed);s.fail(true);await s.open();assert.match(s.count(),/No fue posible/);assert.equal(s.html(),'');assert.equal(s.nodes.personQueryList.attrs['aria-busy'],'false');
 s.fail(false);await s.open();assert.match(s.count(),/2 colaboradores/);
});
test('no lee sin permiso y descarta respuestas tardías al retirar el acceso',async()=>{
 const blocked=app(seed,{allowed:false});await blocked.open();assert.equal(blocked.reads(),0);assert.equal(blocked.loads(),0);
 const s=app(seed);await s.open();let resolve;s.reader(()=>new Promise(done=>resolve=done));const pending=s.render();s.deny();await s.emit('skadmin-permissions');resolve(seed);await pending;assert.equal(s.html(),'');assert.match(s.count(),/Inicia sesión/);
});
