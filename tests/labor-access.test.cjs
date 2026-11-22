const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
const vm=require('node:vm');

test('la invitación de Labor tiene un solo uso y la revocación conserva los permisos de las otras apps',()=>{
 const values=new Map();
 const props={getProperty:k=>values.get(k),setProperty:(k,v)=>values.set(k,v),
  deleteProperty:k=>values.delete(k),getProperties:()=>Object.fromEntries(values)};
 const cloud={personal:[{id:'p1',documento:'100',nombre:'Prueba',active:true}]};
 const ctx=vm.createContext({
  PropertiesService:{getScriptProperties:()=>props},
  LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
  Utilities:{getUuid:randomUUID,base64EncodeWebSafe:s=>Buffer.from(s).toString('base64url'),
   base64DecodeWebSafe:s=>Buffer.from(s,'base64url'),newBlob:b=>({getDataAsString:()=>b.toString()})}
 });
 const digest=s=>createHash('sha256').update(s).digest('hex');
 vm.runInContext(readFileSync(join(__dirname,'../backend/apps-script/Code.gs'),'utf8'),ctx);
 Object.assign(ctx,{findFile_:()=>'test',readFile_:()=>structuredClone(cloud),writeFile_:()=>assert.fail('Labor no modifica las cuentas de Plaza'),
  json_:x=>x,invitationKey_:s=>'SK_INVITE_'+digest(s),hashPin_:(d,p)=>digest(d+'|'+p),sign_:digest});
 const invite=()=>ctx.accessInvitationCreate_({scope:'labor',personId:'p1'});
 const list=()=>Array.from(ctx.laborAccessAdmin_({action:'laborUsers'}).users);
 const claim=token=>ctx.accessInvitationAccept_({invitation:token,document:'100',expectedScope:'labor',password:'clave-de-prueba'});
 const revoke=()=>ctx.laborAccessAdmin_({action:'laborDisable',document:'100'});
 const login=()=>ctx.laborLogin_({document:'100',password:'clave-de-prueba'});
 const other=ctx.accessInvitationCreate_({scope:'plaza',personId:'p1'});
 const first=invite();
 assert.equal(first.scope,'labor');
 assert.equal(list()[0].pending,true);
 revoke();assert.deepEqual(list(),[]);assert.throws(()=>claim(first.token),/válido/);
 assert.equal(ctx.accessInvitationInfo_({invitation:other.token}).scope,'plaza');
 const second=invite();assert.equal(claim(second.token).scope,'labor');
 assert.throws(()=>claim(second.token),/válido/);
 assert.equal(list()[0].pending,undefined);assert.equal(list()[0].passwordHash,undefined);
 const session=login();assert.equal(session.scope,'labor');assert.equal(session.user.documento,'100');
 assert.equal(ctx.laborAccount_('100').personId,'p1');
 assert.equal(ctx.workFrontSync_({access:'labor',token:session.token,reports:[]}).protocol,'work-front-v1');
 assert.throws(()=>ctx.plazaLogin_({document:'100',pin:'clave-de-prueba'}),/no habilitado/);
 assert.equal(ctx.productionAccess_('100'),null);assert.deepEqual(Array.from(ctx.adminUsers_()),[]);
 const renewal=invite();claim(renewal.token);
 assert.throws(()=>ctx.verifyLaborToken_(session.token,cloud),/no tiene acceso/);
 const renewed=login(),pending=invite();
 revoke();assert.throws(()=>claim(pending.token),/válido/);
 assert.throws(()=>ctx.workFrontSync_({access:'labor',token:renewed.token,reports:[]}),/no tiene acceso/);
 assert.throws(login,/incorrectos/);
 assert.equal(ctx.accessInvitationInfo_({invitation:other.token}).scope,'plaza');
});
