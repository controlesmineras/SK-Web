const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../sync-api.js'),'utf8');
function client({role='assistant',pending=[],respond,background}={}){
 let token='old',locks=0,waits=0,writes=0;const requests=[],status={textContent:''},states=[],alerts=[];
 const store=new Map(),window={SK_SYNC_CONFIG:{apiUrl:'https://script.google.com/macros/s/test/exec'},
 SKAdminSyncUI:{setState:state=>states.push(state)},
 SKAdminAuth:{ready:()=>Boolean(token),user:()=>({role}),token:()=>token,
 waitForLoginRenewal:async()=>{waits++;if(background)await background(value=>{token=value})},
 sessionRejected:sent=>{if(token===sent){locks++;token=null;}}},
 addEventListener(){},dispatchEvent(){},writeSyncedSnapshot:async()=>{writes++}};
 vm.runInNewContext(source,{window,document:{querySelector:selector=>selector==='#syncStatus'?status:null},navigator:{onLine:true},
 localStorage:{getItem:key=>store.get(key),setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)},
 stores:['personal'],all:async()=>pending,refresh:async()=>{},seedParts:async()=>{},AbortController,setTimeout,clearTimeout,
 CustomEvent:class{},Event:class{},console:{error(){}},alert:message=>alerts.push(message),
 fetch:async(_,options)=>{const payload=JSON.parse(options.body);requests.push(payload);return {ok:true,json:async()=>respond(payload,requests.length)}}});
 return {store,sync:options=>window.skSyncApi.sync(options),requests,status,states,alerts,get locks(){return locks},get waits(){return waits},get writes(){return writes}};
}
for(const role of ['assistant','admin','owner'])test(role+': expired cached token waits for ongoing login and retries with fresh token',async()=>{
 const c=client({role,background:async set=>set('fresh'),respond:(payload,n)=>n===1?{ok:false,error:'La sesión de Web Admin venció'}:{ok:true,notModified:true}});
 assert.equal(await c.sync({silent:true}),true);assert.deepEqual(c.requests.map(x=>x.token),['old','fresh']);assert.equal(c.locks,0);assert.equal(c.waits,1);
});
for(const silent of [true,false])test('expired session blocks further sync until online login, silent='+silent,async()=>{
 const pending=[{id:'p',syncState:'pending'}];
 const c=client({pending,respond:()=>({ok:false,error:'La sesión de Web Admin venció'})});
 assert.equal(await c.sync({silent}),false);assert.equal(c.locks,1);assert.equal(c.writes,0);
 assert.equal(pending[0].syncState,'pending');assert.match(c.status.textContent,/Inicia sesión con internet/);
 assert.equal(await c.sync({silent}),false);assert.equal(c.requests.length,1);
});
test('role restrictions remain enforced and show their actual error',async()=>{
 const pending=[{id:'p',syncState:'pending'}],c=client({pending,respond:()=>({ok:false,error:'Tu rol no permite modificar: inventoryCriteria'})});
 assert.equal(await c.sync({silent:true}),false);assert.equal(c.locks,0);assert.equal(c.requests.length,1);assert.equal(c.writes,0);assert.match(c.status.textContent,/Tu rol no permite modificar: inventoryCriteria/);assert.equal(pending[0].syncState,'pending');
});
test('revoked account is not treated as an expired session or retried',async()=>{
 const c=client({respond:()=>({ok:false,error:'La cuenta ya no tiene acceso a Web Admin'})});
 assert.equal(await c.sync({silent:true}),false);assert.equal(c.locks,1);assert.equal(c.waits,0);assert.equal(c.requests.length,1);assert.match(c.status.textContent,/cuenta ya no tiene acceso/);
});

test('Admin pide una copia completa a servidores que no anuncian revisiones de colaboradores',async()=>{
 const c=client({respond:q=>{assert.equal(q.since,'');return {ok:true,data:{personal:[],assets:[]},updatedAt:'same-old-revision'}}});
 c.store.set('skWebServerUpdatedAt','same-old-revision');assert.equal(await c.sync({silent:true}),true);assert.equal(c.writes,1);
});

test('Admin negocia revisiones fiables, reutiliza la revisión y fuerza la lectura al consultar manualmente',async()=>{
 const c=client({respond:()=>({ok:true,data:{personal:[],assets:[]},updatedAt:'new-revision',capabilities:{collaboratorRevisionsV1:true}})});
 assert.equal(await c.sync({silent:true}),true);assert.equal(await c.sync({silent:true}),true);assert.equal(await c.sync({silent:false}),true);
 assert.deepEqual(c.requests.map(q=>q.since),['','new-revision','']);
});
