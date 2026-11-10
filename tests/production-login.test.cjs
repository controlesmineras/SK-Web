const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const app=fs.readFileSync('produccion/app.js','utf8');
function context(){
 const storage=new Map();
 const ctx=vm.createContext({crypto:webcrypto,TextEncoder,localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},navigator:{onLine:false}});
 vm.runInContext(app.slice(app.indexOf('function createDeviceAccess('),app.indexOf('const deviceAccess=')),ctx);
 ctx.deviceAccess=ctx.createDeviceAccess('test-production');
 return ctx;
}
const savedSession={token:'previous-online-token',expiresAt:1,user:{document:'123',name:'Prueba',role:'admin'}};
function loginContext(){
 const c=context();
 let handler;
 Object.assign(c,{session:null,sessionKey:'session',submitAccess:(id,callback)=>{handler=callback},byId:()=>({reset(){}}),openWorkspace:async options=>{c.opened=options},api:async()=>{throw new Error('Sin conexión')}});
 vm.runInContext(app.slice(app.indexOf("submitAccess('login',"),app.indexOf("byId('login').querySelector('button').disabled=false")),c);
 c.login=handler;return c;
}
test('offline login requires a previous successful login on the same device',async()=>{
 const c=loginContext();
 await assert.rejects(c.login({document:'123',password:'correcta'}),/Acceso local no disponible/);
 assert.equal(c.session,null);assert.equal(c.opened,undefined);
});
test('the remembered password permits offline login after the online token expires',async()=>{
 const c=loginContext();
 await c.deviceAccess.remember('123','correcta',savedSession);
 await c.login({document:'123',password:'correcta'});
 assert.equal(c.session.token,savedSession.token);assert.equal(c.opened.offlineAccess,true);
});
test('a wrong password or another account cannot open local records',async()=>{
 const c=loginContext();
 await c.deviceAccess.remember('123','correcta',savedSession);
 await assert.rejects(c.login({document:'123',password:'incorrecta'}),/Acceso local no disponible/);
 await assert.rejects(c.login({document:'456',password:'correcta'}),/Acceso local no disponible/);
 assert.equal(c.opened,undefined);
});
test('online login saves local access and skips the offline entry screen',async()=>{
 const c=loginContext();c.navigator.onLine=true;
 c.api=async()=>savedSession;
 await c.login({document:'123',password:'correcta'});
 assert.equal(c.opened.offlineAccess,false);
 assert.equal((await c.deviceAccess.verify('123','correcta')).token,savedSession.token);
});
test('a network failure uses the offline notice even when the browser reports online',async()=>{
 const c=loginContext();c.navigator.onLine=true;
 await c.deviceAccess.remember('123','correcta',savedSession);
 await c.login({document:'123',password:'correcta'});
 assert.equal(c.opened.offlineAccess,true);
});
test('an explicit server rejection is not bypassed using cached credentials',async()=>{
 const c=loginContext();c.navigator.onLine=true;
 await c.deviceAccess.remember('123','correcta',savedSession);
 c.api=async()=>{throw Object.assign(new Error('Documento o contraseña incorrectos'),{centralResponse:true})};
 await assert.rejects(c.login({document:'123',password:'correcta'}),/incorrectos/);
 assert.equal(c.opened,undefined);assert.equal(await c.deviceAccess.verify('123','correcta'),null);
});
test('sync age handles minutes, hours, days, missing dates and incorrect device clocks',()=>{
 const c=context();
 vm.runInContext(app.slice(app.indexOf('function syncAge('),app.indexOf('function paintOfflineEntry(')),c);
 const now=Date.parse('2026-11-10T20:00:00Z'),ago=minutes=>new Date(now-minutes*60000).toISOString();
 for(const [minutes,expected] of [[0,'Hace menos de un minuto'],[1,'Hace 1 minuto'],[59,'Hace 59 minutos'],[60,'Hace 1 hora'],[180,'Hace 3 horas'],[1440,'Hace 1 día'],[3060,'Hace 2 días y 3 horas']])assert.equal(c.syncAge(ago(minutes),now),expected);
 for(const value of [null,undefined,'','invalid'])assert.equal(c.syncAge(value,now),'SIN SINCRONIZACIONES GUARDADAS');
 assert.equal(c.syncAge(ago(-120),now),'REVISA LA FECHA Y HORA DEL DISPOSITIVO');
});
function noticeContext(){
 const nodes=new Map();
 const byId=id=>{
  if(!nodes.has(id))nodes.set(id,{hidden:true,textContent:'',focus(){this.focused=true},click(){return this.onclick?.({currentTarget:this})}});
  return nodes.get(id);
 };
 const c=vm.createContext({byId,session:savedSession,state:{lastSyncAt:'2026-11-10T19:52:00Z'},navigator:{onLine:false},syncing:false,syncFailed:false,canSync:()=>true,paint(){},window:{addEventListener(){}},setInterval(){}});
 vm.runInContext(app.slice(app.indexOf('function syncAge('),app.indexOf('if(invitation){')),c);
 return c;
}
test('offline screen uses Spanish local dates and opens saved records without a network call',()=>{
 const c=noticeContext();c.showOfflineEntry();
 assert.equal(c.byId('offlineEntry').hidden,false);assert.equal(c.byId('workspace').hidden,true);
 assert.match(c.byId('offlineLastSync').textContent,/10\/11\/2026/);
 assert.equal(c.byId('offlineEntryTitle').focused,true);
 c.byId('continueOffline').click();
 assert.equal(c.byId('offlineEntry').hidden,true);assert.equal(c.byId('workspace').hidden,false);
});
test('missing sync date is never displayed as January 1970',()=>{
 const c=noticeContext();c.state.lastSyncAt=null;c.showOfflineEntry();
 assert.equal(c.byId('offlineLastSync').textContent,'AÚN NO SE HA SINCRONIZADO');
 assert.match(c.byId('offlineSyncAdvice').textContent,/completar la primera sincronización/);
});
test('refresh while offline keeps the notice and saved records available',async()=>{
 const c=noticeContext();c.showOfflineEntry();
 await c.byId('refreshOfflineData').click();
 assert.match(c.byId('offlineEntryStatus').textContent,/Todavía no hay conexión/);
 assert.equal(c.byId('offlineEntry').hidden,false);
});
test('successful refresh opens the workspace; failed refresh leaves the notice',async()=>{
 const c=noticeContext();c.navigator.onLine=true;c.showOfflineEntry();
 c.sync=async()=>{c.syncFailed=true};
 await c.byId('refreshOfflineData').click();
 assert.equal(c.byId('offlineEntry').hidden,false);assert.match(c.byId('offlineEntryStatus').textContent,/No se pudo actualizar/);
 c.sync=async()=>{c.syncFailed=false};
 await c.byId('refreshOfflineData').click();
 assert.equal(c.byId('offlineEntry').hidden,true);assert.equal(c.byId('workspace').hidden,false);
 assert.equal(c.byId('refreshOfflineData').disabled,false);
});
