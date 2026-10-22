const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const fs=require('node:fs'),path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const turn=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done});return{promise,resolve}};
function clock(){
 let next=0;const tasks=new Map();
 return{tasks,setTimeout:(fn,ms)=>{tasks.set(++next,{fn,ms});return next},clearTimeout:id=>tasks.delete(id),
  fire(){const [id,task]=[...tasks].sort((a,b)=>a[1].ms-b[1].ms)[0]||[];assert.ok(task,'a request must have a deadline');tasks.delete(id);task.fn();return task.ms}};
}
function syncClient(fetcher){
 const timers=clock(),states=[],requests=[],status={textContent:''},storage=new Map();
 const button={disabled:false,dataset:{},classList:{add(){},remove(){}},setAttribute(){}};
 let rows={assets:[],actas:[{id:'acta-test',syncState:'pending',updatedAt:'2026-10-22T19:00:00Z'}]},writes=0;
 const window={SK_SYNC_CONFIG:{apiUrl:'https://script.google.com/macros/s/test/exec'},SKAdminAuth:{ready:()=>true,token:()=> 'test'},
  SKAdminSyncUI:{setState:value=>states.push(value)},addEventListener(){},dispatchEvent(){},writeSyncedSnapshot:async data=>{writes++;rows=data}};
 const ctx={window,document:{querySelector:q=>q==='#syncStatus'?status:q==='#updateAppBtn'?button:null},navigator:{onLine:true},
  localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
  stores:['assets','actas'],all:async store=>rows[store]||[],refresh:async()=>{},seedParts:async()=>{},AbortController,
  ...timers,CustomEvent:class{},Event:class{},console:{error(){}},alert(){},fetch:async(url,options)=>{requests.push(options);return fetcher(options,requests.length)}};
 vm.runInNewContext(read('sync-api.js'),ctx);
 return{timers,states,status,button,requests,storage,window,get writes(){return writes},get rows(){return rows},sync:()=>window.skSyncApi.sync({silent:true})};
}
const confirmed=()=>({ok:true,json:async()=>({ok:true,updatedAt:'confirmed',data:{assets:[],actas:[{id:'acta-test',syncState:'synced',updatedAt:'2026-10-22T19:00:00Z'}]}})});

for(const stalledPart of ['fetch','body'])test('Admin releases sync when '+stalledPart+' ignores abort and keeps unconfirmed records',async()=>{
 const late=deferred();
 const c=syncClient((_,n)=>n>1?confirmed():stalledPart==='fetch'?late.promise:{ok:true,json:()=>late.promise});
 let completed=false;const attempt=c.sync().then(result=>{completed=true;return result});await turn();
 assert.equal(c.button.disabled,true);assert.equal(c.states.at(-1),'syncing');
 assert.ok(c.timers.fire()<=45000);await turn();
 assert.equal(completed,true,'a stuck transport/body must not hold activePromise');assert.equal(await attempt,false);
 assert.equal(c.requests.length,1,'do not immediately resend an uncertain timed-out write');
 assert.equal(c.requests[0].signal.aborted,true);assert.equal(c.button.disabled,false);assert.equal(c.states.at(-1),'error');
 assert.equal(c.writes,0);assert.equal(c.rows.actas[0].syncState,'pending');assert.match(c.status.textContent,/45 segundos.*pulsa la nube/);
 assert.equal(c.storage.get('skWebServerUpdatedAt'),undefined);
 // A late reply is ignored, even after the user has retried successfully.
 assert.equal(await c.window.skSyncApi.sync({silent:false}),true);assert.equal(c.writes,1);assert.equal(c.rows.actas[0].syncState,'synced');
 late.resolve(stalledPart==='fetch'?confirmed():await confirmed().json());await turn();
 assert.equal(c.writes,1);assert.equal(c.states.at(-1),'synced');assert.equal(c.storage.get('skWebServerUpdatedAt'),'confirmed');
 assert.equal(c.timers.tasks.size,0);
});

test('queued background triggers wait after failure instead of restarting every 300 ms',async()=>{
 const c=syncClient(()=>new Promise(()=>{}));const one=c.sync();await turn();const two=c.sync();
 c.timers.fire();await turn();assert.equal(await one,false);assert.equal(await two,false);
 assert.equal(c.requests.length,1);assert.equal(c.timers.tasks.size,1);
 assert.ok([...c.timers.tasks.values()][0].ms>=59000);
 assert.equal(c.button.disabled,false);assert.equal(c.rows.actas[0].syncState,'pending');
});

test('body abort retains its timeout diagnosis instead of reporting malformed JSON',async()=>{
 const c=syncClient(options=>({ok:true,json:()=>new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError'))))}));
 const attempt=c.sync();await turn();c.timers.fire();await turn();assert.equal(await attempt,false);
 assert.match(c.status.textContent,/45 segundos/);assert.doesNotMatch(c.status.textContent,/incompleta/);assert.equal(c.requests.length,1);
});

function authClient(fetcher){
 const timers=clock(),storage=new Map(),requests=[];
 const window={SK_SYNC_CONFIG:{apiUrl:'https://script.google.com/macros/s/test/exec'},addEventListener(){}};
 vm.runInNewContext(read('admin-auth.js'),{window,document:{querySelector:()=>null,addEventListener(){}},
  sessionStorage:{getItem:key=>storage.get(key),removeItem:key=>storage.delete(key)},localStorage:{getItem:()=>null},
  AbortController,...timers,fetch:async(url,options)=>{requests.push(options);return fetcher(options,requests.length)}});
 return{timers,requests,request:()=>window.SKAdminAuth.request('adminWhoAmI')};
}
for(const stalledPart of ['fetch','body'])test('access renewal bounds '+stalledPart+' and allows a fresh request without revoking access',async()=>{
 const late=deferred(),c=authClient((_,n)=>n>1?{ok:true,text:async()=>JSON.stringify({ok:true,user:{username:'test'}})}:stalledPart==='fetch'?late.promise:{ok:true,text:()=>late.promise});
 let settled=false;const failed=c.request().then(()=>{throw Error('must not report success')},error=>{settled=true;return error});
 await turn();assert.ok(c.timers.fire()<=30000);await turn();assert.equal(settled,true);
 assert.match((await failed).message,/30 segundos.*registros locales se conservan/);assert.equal(c.requests[0].signal.aborted,true);
 assert.equal((await c.request()).ok,true);assert.equal(c.timers.tasks.size,0);
 late.resolve(stalledPart==='fetch'?{ok:true,text:async()=>'{"ok":true}'}:'{"ok":true}');await turn();
});

test('HTTP errors retain their status and release the access request timer',async()=>{
 const c=authClient(()=>({ok:false,status:503,text:async()=>'<html>Unavailable</html>'}));
 await assert.rejects(c.request(),/503/);assert.equal(c.timers.tasks.size,0);
});
