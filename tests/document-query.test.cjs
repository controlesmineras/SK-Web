const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../document-query.js'),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));

function app(seed=[]){
 const nodes={},events={};let records=structuredClone(seed),allowed=true,readError=false,reader=null,reads=0;
 const make=()=>({value:'',innerHTML:'',textContent:'',attrs:{},handlers:{},classList:{contains:()=>true},addEventListener(type,fn){this.handlers[type]=fn},setAttribute(key,value){this.attrs[key]=value},focus(){},querySelector(selector){return selector[0]==='#'?nodes[selector.slice(1)]:nodes.back}});
 const main={append(section){nodes[section.id]=section;for(const match of section.innerHTML.matchAll(/id="([^"]+)"/g))nodes[match[1]]=make();nodes.documentQueryType.value='Todos';nodes.back=make()}};
 const document={getElementById:id=>nodes[id],querySelector:selector=>selector==='main'?main:null,createElement:make,head:{append(){}}};
 const window={SKAdminAuth:{canView:view=>{assert.equal(view,'documentQuery');return allowed}},SKAdminNav:{openQueryMenu(){}},addEventListener:(type,fn)=>events[type]=fn};
 const context={window,document,db:{},URL,console:{error(){}},all:async store=>{assert.equal(store,'actas');reads++;if(readError)throw Error('Read failed');return reader?reader():structuredClone(records)},put(){assert.fail('Consultas must never write records')},uuid(){assert.fail('Consultas must never create records')}};
 vm.runInNewContext(source,context);
 return{nodes,events,render:window.SKDocumentQuery.render,html:()=>nodes.documentQueryList.innerHTML,count:()=>nodes.documentQueryCount.textContent,filter(id,value){nodes[id].value=value;(nodes[id].handlers.input||nodes[id].handlers.change)()},rows:value=>records=structuredClone(value),deny:()=>allowed=false,fail:()=>readError=true,reader:fn=>reader=fn,reads:()=>reads,records:()=>records};
}
const seed=[
 {id:'legacy',consecutivo:8,fecha:'2025-08-13',area:'PRODUCCIÓN',motivo:'Entrega de elementos',enlace:'https://example.com/acta-8.pdf'},
 {id:'acta12',tipo:'ACTA',consecutivo:12,fecha:'2026-10-12',area:'SEGURIDAD FÍSICA',motivo:'Inventario general'},
 {id:'oficio12',tipo:'OFICIO',consecutivo:12,fecha:'2026-10-13',asunto:'Solicitud de dotación',dirigidoA:'Gerencia',enlace:'https://example.com/oficio-12.pdf',syncState:'pending'},
 {id:'other',tipo:'OFICIO',consecutivo:20,fecha:'2026-10-12',asunto:'Consulta',dirigidoA:'Otra área'},
 {id:'deleted',tipo:'ACTA',consecutivo:99,fecha:'2026-10-20',deleted:true}
];
test('consulta actas anteriores y oficios juntos sin modificar datos; conserva numeraciones independientes',async()=>{
 const s=app(seed);await s.render();assert.match(s.count(),/^4 documentos/);assert.match(s.html(),/Acta N.º 8/);assert.match(s.html(),/13\/08\/2025/);assert.doesNotMatch(s.html(),/N.º 99/);
 assert.ok(s.html().indexOf('Oficio N.º 12')<s.html().indexOf('Acta N.º 12'));assert.match(s.html(),/Pendiente de sincronizar/);
 assert.doesNotMatch(s.html(),/<form|<input|<select|<button|data-acta-id|Editar|Eliminar|Guardar/);
 s.filter('documentQuerySearch','12');assert.match(s.count(),/^2 documentos/);assert.doesNotMatch(s.html(),/Oficio N.º 20/);
 s.filter('documentQueryType','ACTA');assert.match(s.count(),/^1 documento/);assert.match(s.html(),/Acta N.º 12/);assert.doesNotMatch(s.html(),/Oficio/);assert.deepEqual(s.records(),seed);
});
test('búsqueda sin tildes, filtros por tipo/fecha inclusiva, validación y limpieza',async()=>{
 const s=app(seed);await s.render();s.filter('documentQuerySearch','produccion entrega');assert.match(s.count(),/^1 documento/);assert.match(s.html(),/Acta N.º 8/);
 s.filter('documentQuerySearch','dotacion gerencia');assert.match(s.count(),/^1 documento/);assert.match(s.html(),/Oficio N.º 12/);
 s.filter('documentQuerySearch','');s.filter('documentQueryFrom','2026-10-12');s.filter('documentQueryTo','2026-10-12');assert.match(s.count(),/^2 documentos/);
 s.filter('documentQueryType','OFICIO');assert.match(s.count(),/^1 documento/);assert.match(s.html(),/Oficio N.º 20/);
 s.filter('documentQueryFrom','2026-10-13');assert.match(s.count(),/fecha inicial/);assert.equal(s.html(),'');
 s.nodes.documentQueryClear.onclick();assert.equal(s.nodes.documentQueryType.value,'Todos');assert.equal(s.nodes.documentQueryFrom.value,'');assert.match(s.count(),/^4 documentos/);
});
test('enlaces HTTP(S) seguros, texto escapado y aviso cuando falta el archivo',async()=>{
 const s=app([{id:'a',consecutivo:1,area:'<img src=x onerror=alert(1)>',enlace:'javascript:alert(1)'},{id:'b',tipo:'OFICIO',consecutivo:2,enlace:'https://example.com/?q="x"&a=1'},{id:'c',consecutivo:3}]);await s.render();
 assert.match(s.html(),/Enlace no válido/);assert.match(s.html(),/Sin enlace digitalizado/);assert.doesNotMatch(s.html(),/<img|href="javascript:/);assert.match(s.html(),/&#60;img/);assert.match(s.html(),/target="_blank" rel="noopener noreferrer"/);assert.match(s.html(),/href="https:\/\/example.com\//);
});
test('sincronización refresca la consulta y respeta filtros; falla de lectura permite reintentar',async()=>{
 const s=app(seed);await s.render();s.filter('documentQueryType','OFICIO');s.rows([...seed,{id:'new',tipo:'OFICIO',consecutivo:21,fecha:'2026-10-20'}]);s.events['skweb-synced']();await tick();assert.match(s.count(),/^3 documentos/);assert.match(s.html(),/Oficio N.º 21/);assert.doesNotMatch(s.html(),/Acta N.º/);
 s.fail();await s.render();assert.equal(s.html(),'');assert.match(s.count(),/Vuelve a abrir/);assert.equal(s.nodes.documentQueryList.attrs['aria-busy'],'false');
});
test('sin acceso no lee documentos y una lectura tardía no reaparece después de cerrar sesión',async()=>{
 const denied=app(seed);denied.deny();await denied.render();assert.equal(denied.reads(),0);assert.equal(denied.html(),'');assert.match(denied.count(),/Inicia sesión/);
 const s=app(seed);await s.render();let resolve;s.reader(()=>new Promise(done=>resolve=done));const pending=s.render();s.deny();s.events['skadmin-permissions']();resolve(seed);await pending;assert.equal(s.html(),'');assert.match(s.count(),/Inicia sesión/);
});
