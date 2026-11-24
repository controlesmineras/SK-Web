const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {randomUUID,createHash}=require('node:crypto'),{readFileSync}=require('node:fs');
function fixture(){
 const values=new Map(),props={getProperty:k=>values.get(k),setProperty:(k,v)=>values.set(k,v),deleteProperty:k=>values.delete(k),getProperties:()=>Object.fromEntries(values)};
 const digest=v=>createHash('sha256').update(v).digest('hex');
 const people=['100','200','300'].map(documento=>({id:'p'+documento,documento,nombre:'Persona '+documento,area:'Seguridad física',active:true}));
 const cloud={personal:people};
 const ctx=vm.createContext({PropertiesService:{getScriptProperties:()=>props},LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
  Utilities:{getUuid:randomUUID,base64EncodeWebSafe:x=>Buffer.from(x).toString('base64url'),base64DecodeWebSafe:x=>Buffer.from(x,'base64url'),newBlob:x=>({getDataAsString:()=>x.toString()})}});
 vm.runInContext(readFileSync('backend/apps-script/Code.gs','utf8'),ctx);
 Object.assign(ctx,{json_:x=>x,findFile_:()=>1,readFile_:()=>cloud,writeFile_:()=>{},sign_:digest,hashPin_:(id,pw)=>digest(id+'|'+pw),invitationKey_:x=>'SK_INVITE_'+digest(x)});
 const owner={id:'owner1',username:'principal',role:'owner',personId:'p100',passwordHash:ctx.hashPin_('principal','anterior1')};
 ctx.saveAdminUsers_([owner]);
 const configure=(newPassword='principal1',auth=owner,currentPassword='anterior1')=>ctx.entryConfigure_({document:'100',newPassword,currentPassword},auth);
 const login=(scope,id,pw)=>({plaza:ctx.plazaLogin_,admin:ctx.adminLogin_,labor:ctx.laborLogin_,production:ctx.productionLogin_})[scope]({document:id,username:id,password:pw,pin:pw});
 const verify=(scope,token)=>({plaza:ctx.verifyToken_,admin:ctx.verifyAdminToken_,labor:ctx.verifyLaborToken_,production:ctx.verifyProductionToken_})[scope](token,cloud);
 const invite=(scope,doc='200',roles={})=>ctx.accessInvitationCreate_({scope,personId:'p'+doc,...roles}).token;
 const activate=(scope,token,document='200',password='personal1')=>ctx.accessInvitationAccept_({invitation:token,expectedScope:scope,document,password});
 return {ctx,cloud,owner,configure,login,verify,invite,activate};
}
test('solo el titular configura admin y su contraseña sirve con el máximo rol en cada aplicación',()=>{
 const f=fixture();
 assert.throws(()=>f.configure('principal1',{role:'admin'}),/principal/);
 assert.throws(()=>f.configure('principal1',f.owner,'incorrecta'),/incorrecta/);
 f.configure();const sessions={};
 for(const [scope,role] of Object.entries({admin:'owner',plaza:'plaza_admin',labor:'admin',production:'admin'})){
  const s=f.login(scope,'admin','principal1');sessions[scope]=s;
  assert.equal(s.user.role,role);assert.equal(s.user.document||s.user.documento,'100');
  const auth=f.verify(scope,s.token);assert.equal(auth.role,role);assert.equal(auth.personId,'p100');
  assert.throws(()=>f.login(scope,'admin',''),/incorrectos/);
 }
 assert.throws(()=>f.verify('plaza',sessions.production.token),/otra aplicación/);
 f.configure('principal2',f.verify('admin',sessions.admin.token),'principal1');
 for(const [scope,s] of Object.entries(sessions)){
  assert.throws(()=>f.verify(scope,s.token),/no tiene acceso/);
  assert.throws(()=>f.login(scope,'admin','principal1'),/incorrectos/);
  assert.ok(f.login(scope,'admin','principal2').token);
 }
});
test('cada funcionario entra con su documento y contraseña y recibe sus roles de esa app',()=>{
 const f=fixture();f.configure();
 for(const scope of ['admin','plaza','production','labor']){
  const opts=scope==='production'?{productionRoles:['mechanic','warehouse']}:{};
  const invitation=f.invite(scope,'200',opts);
  assert.throws(()=>f.ctx.accessInvitationAccept_({invitation,document:'200',activateDevice:true}),/contraseña/);
  f.activate(scope,invitation);
  for(const password of ['', 'incorrecta'])assert.throws(()=>f.login(scope,'200',password));
  assert.throws(()=>f.login(scope,'300','personal1'));
  const result=f.login(scope,'200','personal1');
  assert.equal(result.user.document||result.user.documento,'200');
  assert.equal(result.user.role,{admin:'assistant',plaza:'plaza_operator',production:'mechanic',labor:'reporter'}[scope]);
  if(scope==='production')assert.deepEqual([...result.user.roles],['mechanic','warehouse']);
 }
 const users=f.ctx.adminUsers_(),u=users.find(row=>row.document==='200');
 u.username='auxiliar';u.passwordHash=f.ctx.hashPin_('auxiliar','personal1');f.ctx.saveAdminUsers_(users);
 assert.equal(f.login('admin','200','personal1').user.username,'auxiliar');
});
test('las credenciales y sesiones antiguas de equipos dejan de dar acceso',()=>{
 const f=fixture();f.configure();
 for(const scope of ['admin','plaza','production','labor']){
  f.activate(scope,f.invite(scope));
  const revision=f.ctx.entryPrincipal_().revision;
  for(const kind of ['tablet','personal']){
   const claims={scope,document:'200',binding:revision};
   assert.throws(()=>f.login(scope,'200',f.ctx.entrySeal_({...claims,type:kind})));
   assert.throws(()=>f.verify(scope,f.ctx.entrySeal_({...claims,type:'session',kind,expiresAt:Date.now()+60000})),/sesión venció/);
  }
 }
});
