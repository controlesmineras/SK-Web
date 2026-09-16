// Flujo de contraseña autogestionada para Plaza Blending.
// El administrador genera un token de un solo uso; nunca conoce la contraseña.
function plazaCreateInvite_(q){
  const document=String(q.document||'').trim(),role=q.role==='supervisor'?'supervisor':'operator',setupUrl=String(q.setupUrl||'').trim();
  if(!document||!setupUrl)throw new Error('Faltan datos para generar el enlace');
  const lock=LockService.getScriptLock();lock.waitLock(30000);
  try{
    const id=findFile_(),cloud=id?readFile_(id):{},matches=(cloud.personal||[]).filter(x=>String(x.documento||'').trim()===document&&!x.deleted),person=matches[0];
    if(!person)throw new Error('El colaborador no existe en la base central');
    const token=Utilities.getUuid().replace(/-/g,'')+Utilities.getUuid().replace(/-/g,''),tokenHash=hashInviteToken_(token),expires=Date.now()+24*60*60*1000,now=new Date().toISOString();
    matches.forEach(x=>{x.plazaInviteHash=tokenHash;x.plazaInviteExpires=expires;x.plazaInviteUsed=false;x.plazaRole=role;x.plazaAccessState='pending';x.updatedAt=now});
    cloud.personal=dedupePersonal_(cloud.personal||[]);writeFile_(id,cloud);
    return json_({ok:true,inviteUrl:setupUrl+(setupUrl.includes('?')?'&':'?')+'token='+encodeURIComponent(token),expiresAt:new Date(expires).toISOString(),user:{id:person.id,documento:document,plazaEnabled:person.plazaEnabled===true,plazaAccessState:'pending'}});
  }finally{lock.releaseLock()}
}
function plazaInviteInfo_(q){
  const token=String(q.token||'').trim();if(!token)throw new Error('Este enlace no es válido.');
  const id=findFile_(),cloud=id?readFile_(id):{},hash=hashInviteToken_(token),person=(cloud.personal||[]).find(x=>!x.deleted&&x.plazaInviteHash&&safeEqual_(String(x.plazaInviteHash),hash));
  validateInvite_(person);return json_({ok:true,document:String(person.documento||'')});
}
function plazaSetPassword_(q){
  const token=String(q.token||'').trim(),password=String(q.password||'');if(!token)throw new Error('Este enlace no es válido.');if(password.length<6)throw new Error('La contraseña debe tener al menos 6 caracteres.');
  const lock=LockService.getScriptLock();lock.waitLock(30000);
  try{
    const id=findFile_(),cloud=id?readFile_(id):{},hash=hashInviteToken_(token),matches=(cloud.personal||[]).filter(x=>!x.deleted&&x.plazaInviteHash&&safeEqual_(String(x.plazaInviteHash),hash)),person=matches[0];validateInvite_(person);
    const document=String(person.documento||'').trim(),now=new Date().toISOString(),pinHash=hashPin_(document,password);
    (cloud.personal||[]).filter(x=>String(x.documento||'').trim()===document&&!x.deleted).forEach(x=>{x.pinHash=pinHash;x.plazaEnabled=true;x.plazaRole=person.plazaRole||'operator';x.plazaAccessState='active';x.plazaInviteUsed=true;delete x.plazaInviteHash;delete x.plazaInviteExpires;x.updatedAt=now});
    cloud.personal=dedupePersonal_(cloud.personal||[]);writeFile_(id,cloud);return json_({ok:true});
  }finally{lock.releaseLock()}
}
function validateInvite_(person){if(!person||person.plazaInviteUsed===true||!person.plazaInviteExpires||Number(person.plazaInviteExpires)<Date.now())throw new Error('Este enlace ya fue utilizado o ha expirado.');}
function hashInviteToken_(token){const salt=PropertiesService.getScriptProperties().getProperty('SK_AUTH_SALT');if(!salt)throw new Error('Falta configurar SK_AUTH_SALT');return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(token)+'|invite|'+salt,Utilities.Charset.UTF_8))}
