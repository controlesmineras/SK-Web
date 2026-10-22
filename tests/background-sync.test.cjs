const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8'),turn=()=>new Promise(resolve=>setImmediate(resolve));
function timers(){let id=0;const timeouts=new Map(),intervals=[];return{timeouts,intervals,setTimeout:(fn,ms)=>{timeouts.set(++id,{fn,ms});return id},clearTimeout:id=>timeouts.delete(id),setInterval:(fn,ms)=>intervals.push({fn,ms}),fire(){const [id,item]=[...timeouts].sort((a,b)=>a[1].ms-b[1].ms)[0]||[];assert.ok(item);timeouts.delete(id);item.fn();return item.ms}}}
function admin({intervalMs,ready=false,fetcher}={}){
 const clock=timers(),events={},docEvents={},requests=[],status={},storage=new Map();let token='test',allowed=ready;
 const window={SK_SYNC_CONFIG:{apiUrl:'https://script.google.com/macros/s/test/exec',intervalMs},SKAdminAuth:{ready:()=>allowed,token:()=>token},addEventListener:(name,fn)=>(events[name]||=[]).push(fn),dispatchEvent(){}};
 const ctx=vm.createContext({window,document:{hidden:false,querySelector:()=>status,addEventListener:(name,fn)=>(docEvents[name]||=[]).push(fn)},navigator:{onLine:true},stores:['assets'],all:async()=>[],localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},...clock,AbortController,Event:class{},CustomEvent:class{},console:{error(){}},alert(){},fetch:async(...args)=>{requests.push(args);return fetcher?fetcher(...args):{ok:true,json:async()=>({ok:true,notModified:true})}}});
 ctx.document.querySelector=selector=>selector==='#syncStatus'?status:null;
 vm.runInContext(read('sync-api.js'),ctx);
 return{clock,ctx,requests,emit:name=>(events[name]||docEvents[name]||[]).forEach(fn=>fn()),login:()=>{allowed=true},logout:()=>{allowed=false},changeToken:()=>{token='renewed'}};
}
test('Admin sincroniza al terminar el acceso, aunque el usuario haya entrado después de cargar la app',async()=>{
 const c=admin();c.emit('load');assert.equal(c.clock.timeouts.size,0);assert.equal(c.clock.intervals[0].ms,300000);
 c.login();c.emit('skadmin-permissions');assert.equal(c.clock.fire(),300);await turn();assert.equal(c.requests.length,1);
 c.emit('skadmin-permissions');assert.equal(c.clock.timeouts.size,0,'refreshing the same access must not trigger an endless sync loop');
 c.changeToken();c.emit('skadmin-permissions');c.clock.fire();await turn();assert.equal(c.requests.length,2);
});
test('Admin consulta como máximo cada cinco minutos y reúne los eventos de reanudación',async()=>{
 const c=admin({ready:true,intervalMs:1800000});c.emit('load');c.clock.fire();await turn();assert.equal(c.clock.intervals[0].ms,300000);
 for(const name of ['pageshow','focus','visibilitychange'])c.emit(name);
 assert.equal(c.clock.timeouts.size,1);c.clock.fire();await turn();assert.equal(c.requests.length,2);
 c.clock.intervals[0].fn();assert.equal(c.clock.fire(),0);await turn();assert.equal(c.requests.length,3);
 c.ctx.navigator.onLine=false;c.clock.intervals[0].fn();c.clock.fire();await turn();assert.equal(c.requests.length,3);
 c.ctx.navigator.onLine=true;c.emit('online');c.clock.fire();await turn();assert.equal(c.requests.length,4);
});
test('Admin no inicia otro envío si el anterior sigue en curso al reabrir o vencer el intervalo',async()=>{
 let finish;const c=admin({ready:true,fetcher:()=>new Promise(resolve=>finish=resolve)});c.emit('load');c.clock.fire();await turn();
 c.emit('pageshow');c.emit('focus');c.clock.intervals[0].fn();assert.equal(c.requests.length,1);assert.equal(c.clock.timeouts.size,1,'only request deadline remains');
 finish({ok:true,json:async()=>({ok:true,notModified:true})});await turn();assert.equal(c.clock.timeouts.size,0);
});
for(const stage of ['fetch','body'])test('Plaza libera una solicitud trabada en '+stage+' y permite el siguiente ciclo',async()=>{
 const clock=timers();let finish,calls=0;
 const ctx=vm.createContext({api:()=> 'https://example.test',...clock,AbortController,fetch:async()=>{calls++;return calls>1?{ok:true,text:async()=>'{"ok":true}'}:stage==='fetch'?new Promise(resolve=>finish=resolve):{ok:true,text:()=>new Promise(resolve=>finish=resolve)}}});
 const s=read('plaza/plaza.js'),start=s.indexOf('  async function post(body)'),end=s.indexOf('\n  ',s.indexOf('\n  }',start)+4);vm.runInContext(s.slice(start,end),ctx);
 const first=ctx.post({action:'test'}).then(()=>null,error=>error);await turn();assert.equal(clock.fire(),45000);assert.match((await first).message,/pendientes se conservan/);
 assert.equal((await ctx.post({action:'test'})).ok,true);finish(stage==='fetch'?{ok:true,text:async()=>'{"ok":true}'}:'{"ok":true}');await turn();assert.equal(clock.timeouts.size,0);
});
