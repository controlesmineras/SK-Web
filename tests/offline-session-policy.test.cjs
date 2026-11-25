const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('app-entry.js','utf8'),hour=3600000;
function storage(){
 const rows=new Map();
 return {getItem:key=>rows.get(key)??null,setItem:(key,value)=>rows.set(key,String(value)),removeItem:key=>rows.delete(key)};
}
function fixture(scope='plaza'){
 let now=Date.UTC(2026,10,25),token,deadline,locks=0;
 const listeners={},tab=storage(),device=storage();
 const window={addEventListener:(name,fn)=>{listeners[name]=fn;}};
 vm.runInNewContext(source,{window,document:{addEventListener:window.addEventListener},Date:{now:()=>now},localStorage:device,sessionStorage:tab,atob,setTimeout:(fn,ms)=>{deadline={fn,ms};return 1;},clearTimeout(){}});
 const policy=window.SKEntry.sessionPolicy(scope,()=>token,()=>{locks++;token=null;});
 function session(duration,principal=false){
  const end=now+duration*hour;
  const value=principal?{type:'session',kind:'principal',scope,expiresAt:end}:
   scope==='admin'?'123|assistant|'+end:scope==='plaza'?'123|plaza_operator|'+end:[scope,'123','rev',end];
  return (principal?'sk2.':'')+Buffer.from(typeof value==='string'?value:JSON.stringify(value)).toString('base64url')+'.sig'+end;
 }
 return {policy,device,session,listeners,active:t=>{token=t;},login(t){policy.signedIn(t);token=t;policy.check();},advance:h=>{now+=h*hour;},tick:ms=>{now+=ms;},timer:()=>deadline,get locks(){return locks;}};
}
for(const scope of ['admin','plaza','production','labor']){
 test(scope+' acepta sesiones anteriores vigentes y respeta su vencimiento aunque sincronice antes',()=>{
  for(const principal of [false,true]){
   const c=fixture(scope),t=c.session(12,principal);
   c.active(t);assert.equal(c.policy.check(),true);c.advance(11);c.policy.synced(t);
   assert.equal(c.timer().ms,hour*12); // El temporizador original mantiene su vencimiento.
   c.advance(1);c.timer().fn();assert.equal(c.locks,1);assert.equal(c.policy.allows(t),false);
   assert.throws(()=>c.policy.requireActive(t),/Sesión vencida/);
  }
 });
}
test('la última sincronización confirmada mueve la ventana de 36 horas sin exceder la vigencia',()=>{
 const c=fixture(),t=c.session(100);c.login(t);
 c.advance(24);c.policy.synced(t);
 c.advance(36);assert.equal(c.policy.check(),true);
 c.tick(1);c.listeners.pageshow();assert.equal(c.locks,1);assert.equal(c.policy.allows(t),false);
 c.policy.synced(t);assert.equal(c.policy.allows(t),false);
 const fresh=c.session(12);c.login(fresh);assert.equal(c.policy.check(),true);
});
test('reabrir, recuperar conexión o usar otra sesión no renuevan el plazo',()=>{
 const c=fixture(),t=c.session(100);c.login(t);
 c.advance(35);c.listeners.online();c.listeners.visibilitychange();c.policy.synced('otro');
 c.advance(2);let prevented=false,stopped=false;
 c.listeners.submit({preventDefault(){prevented=true;},stopImmediatePropagation(){stopped=true;}});
 assert.ok(prevented&&stopped);assert.equal(c.locks,1);
 c.advance(-4);assert.equal(c.policy.allows(t),false);
});
test('el rechazo central y una fecha del dispositivo anterior a la confirmación exigen credenciales',()=>{
 const c=fixture(),t=c.session(12);c.login(t);c.policy.reject('otra');assert.equal(c.locks,0);
 c.advance(-1);c.listeners.focus();assert.equal(c.locks,1);c.advance(1);
 assert.equal(c.policy.allows(t),false);
 const newer=c.session(11);c.login(newer);c.policy.reject(newer);assert.equal(c.locks,2);
});
test('credenciales sin vencimiento comprobable se rechazan',()=>{
 const c=fixture();for(const t of ['', 'inválido','a.b'])assert.equal(c.policy.allows(t),false);
});
