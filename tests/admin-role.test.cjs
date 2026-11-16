const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const source=fs.readFileSync(require('node:path').join(__dirname,'../backend/apps-script/Code.gs'),'utf8');
const clone=value=>JSON.parse(JSON.stringify(value));
function service(){
 const values={SK_AUTH_SECRET:'test-secret',SK_AUTH_SALT:'test-salt',SK_SYNC_KEY:'test-key'};
 let cloud={personal:[
  {id:'root',nombre:'Principal',documento:'1000',area:'Seguridad física'},
  {id:'assistant',nombre:'Auxiliar',documento:'2000',area:'Seguridad física'},
  {id:'new',nombre:'Nueva administradora',documento:'3000',area:'Seguridad física'},
  {id:'outside',nombre:'Otra área',documento:'4000',area:'Producción'}
 ],assets:[],actas:[],inventoryCriteria:[]},locked=false;
 const props={getProperty:key=>values[key]??null,getProperties:()=>({...values}),setProperty:(key,value)=>values[key]=value,deleteProperty:key=>delete values[key]};
 const ctx=vm.createContext({console,PropertiesService:{getScriptProperties:()=>props},LockService:{getScriptLock:()=>({waitLock(){assert.equal(locked,false);locked=true},releaseLock(){locked=false}})},Utilities:{
  getUuid:crypto.randomUUID,DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},
  computeDigest:(algorithm,value)=>Array.from(crypto.createHash(algorithm).update(value).digest()),
  computeHmacSha256Signature:(value,key)=>crypto.createHmac('sha256',key).update(value).digest(),
  base64EncodeWebSafe:value=>Buffer.from(value).toString('base64url'),base64DecodeWebSafe:value=>Buffer.from(value,'base64url'),newBlob:value=>({getDataAsString:()=>Buffer.from(value).toString()})
 }});
 vm.runInContext(source,ctx);ctx.json_=clone;ctx.findFile_=()=> 'test';ctx.readFile_=()=>clone(cloud);ctx.writeFile_=(_,value)=>{assert.equal(locked,true);cloud=clone(value)};
 ctx.saveAdminUsers_([
  {id:'root-account',personId:'root',document:'1000',username:'1000',role:'owner',enabled:true,passwordHash:ctx.hashPin_('1000','password1')},
  {id:'assistant-account',personId:'assistant',document:'2000',username:'2000',role:'assistant',enabled:true,passwordHash:ctx.hashPin_('2000','password1')}
 ]);
 const session=username=>ctx.adminLogin_({username,password:'password1'});
 const post=(data,token=session('1000').token)=>ctx.doPost({postData:{contents:JSON.stringify({...data,token})}});
 const invite=(personId='new',adminRole='admin',token)=>post({action:'accessInvitationCreate',scope:'admin',personId,adminRole},token);
 const accept=(invitation,document='3000',extra={})=>post({action:'accessInvitationAccept',invitation,document,password:'password1',...extra});
 return{ctx,values,post,invite,accept,session,cloud:()=>clone(cloud)};
}
test('el enlace guarda el rol, crea un administrador y permite iniciar sesión y administrar',()=>{
 const s=service(),invite=s.invite();assert.equal(invite.ok,true);assert.equal(invite.adminRole,'admin');
 assert.equal(s.accept(invite.token).ok,true);
 const session=s.session('3000');assert.equal(session.user.role,'admin');
 const who=s.post({action:'adminWhoAmI'},session.token);assert.equal(who.user.role,'admin');
 const users=s.post({action:'adminUsersList'},session.token);assert.deepEqual(users.adminRoles,['assistant','admin']);assert.equal(users.users.find(row=>row.document==='3000').role,'admin');
 const sync=s.post({action:'sync',data:{inventoryCriteria:[{id:'criterion',name:'Herramienta',syncState:'pending',updatedAt:new Date().toISOString()}]}},session.token);
 assert.equal(sync.ok,true,sync.error);assert.equal(s.cloud().inventoryCriteria[0].name,'Herramienta');
 assert.equal(s.invite('assistant','admin',session.token).ok,true);
 assert.equal(s.accept(invite.token).ok,false,'single use');
});
test('un auxiliar no concede roles ni accede a operaciones de administración',()=>{
 const s=service(),token=s.session('2000').token;
 for(const action of ['adminUsersList','accessInvitationCreate','adminUserSave','adminUserDisable','plazaUserAdmin','productionUsers','productionDisable','adminReverseMovement','adminDeleteMovement']){
  const result=s.post({action,scope:'admin',personId:'new',adminRole:'admin'},token);assert.equal(result.ok,false,action);assert.match(result.error,/requiere el rol Administrador/);
 }
 assert.equal(s.post({action:'sync',data:{inventoryCriteria:[{id:'bad',syncState:'pending'}]}},token).ok,false);
 assert.equal(s.ctx.adminUsers_().length,2);
});
test('protege al principal y rechaza roles inventados antes de revocar una invitación válida',()=>{
 const s=service(),original=s.invite();
 for(const role of ['owner','superadmin','']){
  const result=s.invite('new',role);assert.equal(result.ok,false);assert.match(result.error,/Rol.*no válido/);
 }
 assert.equal(s.accept(original.token,'9999').ok,false);
 assert.equal(s.accept(original.token).ok,true);
 const token=s.session('3000').token;
 assert.equal(s.invite('root','admin',token).ok,false);
 assert.equal(s.post({action:'adminUserDisable',id:'root-account'},token).ok,false);
 assert.equal(s.post({action:'adminUserSave',id:'root-account'},token).ok,false);
 assert.equal(s.ctx.adminUsers_().find(row=>row.role==='owner').enabled,true);
});
test('aceptar no permite alterar el rol guardado en el enlace; enlaces antiguos conservan auxiliar',()=>{
 const s=service(),invite=s.invite('new','assistant');
 assert.equal(s.accept(invite.token,'3000',{adminRole:'admin',role:'owner'}).ok,true);
 assert.equal(s.session('3000').user.role,'assistant');
 const old=s.invite('new','assistant'),key=s.ctx.invitationKey_(old.token),record=JSON.parse(s.values[key]);delete record.adminRole;s.values[key]=JSON.stringify(record);
 assert.equal(s.accept(old.token).ok,true);assert.equal(s.session('3000').user.role,'assistant');
});
test('promover y degradar conserva la cuenta y revoca tokens con el rol anterior',()=>{
 const s=service(),old=s.session('2000'),id=old.user.id;
 assert.equal(s.accept(s.invite('assistant','admin').token,'2000').ok,true);
 const admin=s.session('2000');assert.equal(admin.user.id,id);assert.equal(admin.user.role,'admin');
 assert.equal(s.post({action:'adminUsersList'},old.token).ok,false);
 const reset=s.post({action:'accessInvitationCreate',scope:'admin',personId:'assistant'});assert.equal(reset.adminRole,'admin');
 assert.equal(s.accept(s.invite('assistant','assistant').token,'2000').ok,true);
 assert.equal(s.post({action:'adminUsersList'},admin.token).ok,false);assert.equal(s.session('2000').user.role,'assistant');
});
test('verifica firma, vencimiento, cuenta activa y área de Personal',()=>{
 const s=service();assert.equal(s.invite('outside').ok,false);
 const invite=s.invite(),key=s.ctx.invitationKey_(invite.token),record=JSON.parse(s.values[key]);record.expires=0;s.values[key]=JSON.stringify(record);
 assert.equal(s.accept(invite.token).ok,false);
 const valid=s.invite();assert.equal(s.accept(valid.token).ok,true);const session=s.session('3000');
 const parts=session.token.split('.'),payload=Buffer.from(parts[0],'base64url').toString().replace('|admin|','|owner|');
 assert.equal(s.post({action:'adminUsersList'},Buffer.from(payload).toString('base64url')+'.'+parts[1]).ok,false);
 const expired='3000|admin|1';assert.equal(s.post({action:'adminUsersList'},Buffer.from(expired).toString('base64url')+'.'+s.ctx.sign_(expired)).ok,false);
 assert.equal(s.post({action:'adminUserDisable',id:session.user.id}).ok,true);
 assert.equal(s.post({action:'adminUsersList'},session.token).ok,false);
});
test('guardar un acceso respeta el rol elegido y conserva un administrador al omitir el rol',()=>{
 const s=service(),body={action:'adminUserSave',personId:'new',username:'3000',password:'password1',adminRole:'admin'};
 const created=s.post(body);assert.equal(created.ok,true);assert.equal(created.user.role,'admin');
 const edited=s.post({...body,id:created.user.id,password:'',adminRole:undefined});assert.equal(edited.ok,true);assert.equal(edited.user.role,'admin');
 const rejected=s.post({...body,id:created.user.id,adminRole:'owner'});assert.equal(rejected.ok,false);assert.equal(s.session('3000').user.role,'admin');
});
