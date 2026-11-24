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
 const activate=(scope,token,document='200')=>ctx.accessInvitationAccept_({invitation:token,expectedScope:scope,document,activateDevice:true}).deviceKey;
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
test('los celulares y la tablet respetan los roles de cada documento y aplicación',()=>{
 const f=fixture();f.configure();
 const tablet=f.ctx.entryAuthorizeTablet_({scope:'plaza',password:'principal1'}).deviceKeys;
 for(const scope of ['plaza','labor','production','admin']){
  const opts=scope==='production'?{productionRoles:['mechanic','warehouse']}:{};
  const ticket=f.invite(scope,'200',opts);assert.equal(f.ctx.accessInvitationInfo_({invitation:ticket}).documentAccess,true);
  const first=f.activate(scope,ticket),second=f.activate(scope,f.invite(scope,'200',opts));
  for(const personal of [first,second]){
   const session=f.login(scope,'200',personal),account=f.verify(scope,session.token);
   assert.equal(account.document,'200');
   if(scope==='production')assert.deepEqual([...account.roles],['mechanic','warehouse']);
   assert.throws(()=>f.login(scope,'300',personal),/no está activado/);
  }
  const shared=tablet[scope];
  assert.throws(()=>f.login(scope,'300',shared),/acceso operativo/);
  f.activate(scope,f.invite(scope,'300'),'300');
  for(const document of ['200','300'])assert.equal(f.verify(scope,f.login(scope,document,shared).token).document,document);
  assert.throws(()=>f.login(scope,'admin',shared),/incorrectos/);
  assert.throws(()=>f.login(scope,'200',f.login(scope,'200',shared).token),/no está activado/);
  assert.throws(()=>f.login(scope,'200',''),/obligatorios|incorrect|usuario debe tener/);
 }
 const key=f.ctx.entryAuthorizeTablet_({scope:'plaza',password:'principal1'}).deviceKey;
 const session=f.login('plaza','200',key);
 f.cloud.personal[1].plazaRole='admin';
 assert.throws(()=>f.verify('plaza',session.token),/acceso operativo/);
 assert.throws(()=>f.login('plaza','200',key),/acceso operativo/);
 assert.throws(()=>f.activate('plaza',f.invite('plaza','200',{plazaRole:'admin'})),/requiere una contraseña/);
 f.configure('principal2');assert.throws(()=>f.login('plaza','300',key),/no tiene acceso/);
});
