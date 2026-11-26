function automaticClassNumberEligible_(clase){return (value=>{const type=String(value??'').trim().toLowerCase();return !!type&&!/^(?:autorrescatador(?:es)?\b|yt(?:\b|\d)|columnas?\b)/i.test(type)})(clase);}

  function automaticClassNumber_(rows, asset) {
    const key=value=>String(value??'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');
    const number=row=>String(row.numeroClase||row.numeroYT||row.orden||'').trim();
    const peers=rows.filter(row=>key(row.clase)===key(asset.clase)),old=peers.find(row=>row.id&&row.id===asset.id);
    if(old&&number(old))return number(old);
    const used=new Set(peers.map(number).filter(value=>/^\d+$/.test(value)).map(Number));
    if(old){const missing=peers.filter(row=>!number(row)).sort((a,b)=>String(a.createdAt||'').localeCompare(String(b.createdAt||''))||String(a.id).localeCompare(String(b.id)));let next=1;for(const row of missing){while(used.has(next))next++;if(row.id===asset.id)return String(next);used.add(next++);}}
    return String(Math.max(peers.length,0,...used)+1);
  }

const CLOUD_FILE='sk-web-central.json';
const PLAZA_READ=['warehouseQuantityHistory','personal','assets','inventoryCriteria','inventoryStock','blendingIncomes','blendingDeliveries'];
const PLAZA_WRITE=['blendingIncomes','blendingDeliveries'];
function doGet(){return json_({ok:true,service:'SK Web Sync',time:new Date().toISOString()})}
function doPost(e){try{const q=JSON.parse(e.postData.contents||'{}');if(q.action==='laborLogin')return laborLogin_(q);if(q.action==='laborRoleDirectory')return laborRoleDirectory_(q);if(q.action==='workFrontSync')return workFrontSync_(q);if(q.action==='productionLogin')return productionLogin_(q);if(q.action==='productionSync')return productionSync_(q);if(q.action==='productionWarehouseSync')return productionWarehouseSync_(q);if(q.action==='plazaLogin')return plazaLogin_(q);if(q.action==='plazaSync')return plazaSync_(q);if(q.action==='plazaCollaborator')return plazaCollaborator_(q);if(q.action==='adminStatus')return adminStatus_();if(q.action==='adminLogin')return adminLogin_(q);if(q.action==='accessInvitationInfo')return accessInvitationInfo_(q);if(q.action==='accessInvitationAccept')return accessInvitationAccept_(q);const expected=PropertiesService.getScriptProperties().getProperty('SK_SYNC_KEY');if(q.action==='adminBootstrap'){if(!expected||q.key!==expected)throw new Error('Acceso no autorizado');return adminBootstrap_(q)}const configured=adminUsers_().length>0,auth=configured?verifyAdminToken_(q.token):{username:'legacy-owner',name:'Administrador principal',role:'owner'};if(!configured&&(!expected||q.key!==expected))throw new Error('Acceso no autorizado');if(q.action==='entryConfigure')return entryConfigure_(q,auth);if(q.action==='adminCargoSearch')return adminCargoSearch_(q,auth);if(q.action==='adminCargoAdd')return adminCargoAdd_(q,auth);if(q.action==='adminWhoAmI')return json_({ok:true,user:{username:auth.username,name:auth.name,role:auth.role,...(auth.document?{document:auth.document}:{})}});if(q.action==='productionWarehouseConfigure'){requireAdmin_(auth);return productionWarehouseConfigure_(q)}if(q.action==='productionUsers'||q.action==='productionDisable'){requireAdmin_(auth);return productionAccessAdmin_(q)}if(q.action==='changeAppActiveRole'){requireAdmin_(auth);return changeAppActiveRole_(q)}if(q.action==='appRolesForPerson'){requireAdmin_(auth);return appRolesForPerson_(q)}if(q.action==='laborChangeActiveRole'){requireAdmin_(auth);return laborChangeActiveRole_(q)}if(q.action==='laborUsers'||q.action==='laborDisable'){requireAdmin_(auth);return laborAccessAdmin_(q)}if(q.action==='adminUsersList'){requireAdmin_(auth);return adminUsersList_()}if(q.action==='accessInvitationCreate'){requireAdmin_(auth);return accessInvitationCreate_(q)}if(q.action==='adminUserSave'){requireAdmin_(auth);return adminUserSave_(q)}if(q.action==='adminUserDisable'){requireAdmin_(auth);return adminUserDisable_(q)}if(q.action==='plazaUserAdmin'){requireAdmin_(auth);return plazaUserAdmin_(q)}if(q.action==='plazaChangeActiveRole'){requireAdmin_(auth);return plazaChangeActiveRole_(q)}if(q.action==='adminWarehouseQuantityV1')return adminWarehouseQuantity_(q,auth);if(q.action==='adminSetInventoryQuantity')return adminSetInventoryQuantity_(q,auth);if(q.action==='adminCorrectAssetMark')return adminCorrectAssetMark_(q,auth);if(q.action==='adminReverseMovement'||q.action==='adminReverseMovementV2'){requireAdmin_(auth);return adminReverseMovement_(q)}if(q.action==='adminDeleteMovement'){requireAdmin_(auth);return adminDeleteMovement_(q)}if(!['sync','syncDatedNovelties','syncNoveltyChanges'].includes(q.action)||!q.data)throw new Error('Solicitud no válida');return adminSyncAuthorized_(q.data,q.since,auth,q.productionBalanceVersions)}catch(e){return json_({ok:false,error:String(e&&e.message||e)})}}

// Frentes de trabajo: la ficha nueva y su reporte se confirman en la misma escritura.
function frontDocument_(value){
  return String(value || '').normalize('NFKC').replace(/[.\s-]/g,'').toUpperCase();
}
function frontPerson_(input, actor, now){
  const person = {};
  for (const key of ['documento','primerNombre','segundoNombre','primerApellido','segundoApellido','empresa','area','cargo','telefono']){
    const value = String(input[key] || '').trim();
    if (value.length > 160) throw new Error('Revisa el campo ' + key + '.');
    person[key] = value;
  }
  person.documento = frontDocument_(person.documento);
  if (!/^[0-9A-Z]{1,32}$/.test(person.documento) || !person.primerNombre || !person.primerApellido || !person.empresa || !person.area || !person.cargo)
    throw new Error('Completa documento, primer nombre, primer apellido, empresa, área y cargo.');
  person.nombre = [person.primerNombre,person.segundoNombre,person.primerApellido,person.segundoApellido].filter(Boolean).join(' ');
  return Object.assign(person,{id:'PERSONAL-FRENTE-'+Utilities.getUuid(),createdAt:now,updatedAt:now,registeredBy:actor,syncState:'synced'});
}
function frontReport_(cloud, input, actor, now){
  if (!input || !/^FT-[a-f0-9-]{36}$/.test(input.id) || input.owner !== actor) throw new Error('El reporte no corresponde a esta cuenta.');
  const reports = cloud.workFrontReports || [];
  const original = reports.find(row=>row.id===input.id);
  if (original){
    if (original.owner!==actor) throw new Error('El identificador ya está en uso.');
    return {id:input.id,status:'synced',personId:original.personId};
  }
  const date = String(input.fecha || ''), day = new Date(date+'T12:00:00Z');
  const corte = String(input.corte || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(day.getTime()) || day.toISOString().slice(0,10)!==date ||
      !['D','T','S'].includes(input.turno) || !Number.isInteger(input.nivel) || input.nivel<1 || input.nivel>16 || !corte || corte.length>120)
    throw new Error('Revisa la fecha, el turno, el nivel y el corte.');
  const people = cloud.personal || [];
  const key = frontDocument_(input.documento);
  let person;
  if (input.newPerson){
    if (!key || key!==frontDocument_(input.newPerson.documento) || !/^FP-[a-f0-9-]{36}$/.test(input.personId))
      throw new Error('Revisa el documento del nuevo funcionario.');
    person = people.find(p=>p && !p.deleted && frontDocument_(p.documento || p.document)===key);
    if (person && (person.frontRequestId!==input.personId || person.registeredBy!==actor || person.active===false))
      return {id:input.id,status:'review',reason:'duplicate',existing:publicPerson_(person),message:'Revisa tu reporte. El funcionario ya está registrado y no se puede volver a registrar.'};
    if (!person){
      person = frontPerson_(input.newPerson,actor,now);
      person.frontRequestId = input.personId;
      people.push(person);
      cloud.personal = people;
    }
  }else{
    person = people.find(p=>p && !p.deleted && p.active!==false && p.id===input.personId && frontDocument_(p.documento || p.document)===key);
    if (!person) throw new Error('El funcionario seleccionado cambió o ya no está disponible. Revisa tu reporte.');
  }
  reports.push({id:input.id,owner:actor,fecha:date,turno:input.turno,nivel:input.nivel,corte,personId:person.id,documento:person.documento||'',nombre:person.nombre||'',createdAt:now});
  cloud.workFrontReports = reports;
  return {id:input.id,status:'synced',personId:person.id,changed:true};
}
function workFrontSync_(q){
  if(q.access!=='labor')throw new Error('Ingresa con tu cuenta de Labor.');
  if (!Array.isArray(q.reports) || q.reports.length>50) throw new Error('Lote de reportes no válido.');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try{
    const id=findFile_(), cloud=id ? readFile_(id,lock) : {};
    const account=verifyLaborToken_(q.token,cloud),actor='labor:'+account.document;
    const now=nextRevision_(cloud.updatedAt);
    let changed=false;
    const receipts=q.reports.map(input=>{
      try{
        const receipt=frontReport_(cloud,input,actor,now);
        if(receipt.changed){changed=true; delete receipt.changed;}
        return receipt;
      }catch(error){return {id:input && input.id,status:'review',message:String(error.message || error)};}
    });
    if(changed){cloud.updatedAt=now;writeFile_(id,cloud);}
    const directory=(cloud.personal||[]).filter(p=>p && !p.deleted).map(p=>Object.assign(publicPerson_(p),{active:p.active!==false}));
    const formOptions=(cloud.inventoryCriteria||[]).find(row=>row.id==='SYSTEM-FORM-OPTIONS-V1');
    const options={};
    for(const key of ['personal.company','personal.area','personal.role'])if(Array.isArray(formOptions?.options?.[key]))options[key]=formOptions.options[key];
    return json_({ok:true,protocol:'work-front-v1',sessionRole:laborRole_(account.role),personal:directory,options,receipts,updatedAt:cloud.updatedAt||''});
  }finally{lock.releaseLock();}
}

function laborAccessKey_(document){return 'SK_LABOR_USER_'+invitationKey_(document).slice('SK_INVITE_'.length)}
function laborAccount_(document){
 const raw=PropertiesService.getScriptProperties().getProperty(laborAccessKey_(document));
 return raw?JSON.parse(raw):null;
}
// La cuenta titular establece la contraseña común desde SK Web Admin.
function entryPrincipal_(){
 const raw=PropertiesService.getScriptProperties().getProperty('SK_ENTRY_PRINCIPAL');
 return raw?JSON.parse(raw):null;
}
function entryConfigure_(q,auth){
 if(auth.role!=='owner')throw new Error('Ingresa con tu cuenta principal de SK Web Admin.');
 const lock=LockService.getScriptLock();lock.waitLock(30000);
 try{
  const old=entryPrincipal_(),users=adminUsers_();
  const owner=users.find(u=>u.role==='owner'&&u.enabled!==false&&(auth.principal?u.id===old?.ownerId:u.username===auth.username));
  if(!owner)throw new Error('La cuenta principal debe estar activa.');
  if(users.some(u=>u.username==='admin'&&u.id!==owner.id&&u.enabled!==false))throw new Error('El usuario admin ya pertenece a otra cuenta de Web Admin.');
  const current=String(q.currentPassword||''),useAlias=auth.principal||(owner.username==='admin'&&old);
  if(!current||!safeEqual_(useAlias?old.passwordHash:owner.passwordHash,hashPin_(useAlias?'principal:admin':owner.username,current)))throw new Error('La contraseña actual es incorrecta.');
  const document=String(q.document||'').trim(),cloud=readFile_(findFile_(),lock);
  const matches=(cloud.personal||[]).filter(p=>!p.deleted&&p.active!==false&&String(p.documento||'').trim()===document);
  if(!document||matches.length!==1)throw new Error('El documento debe identificar a un solo colaborador activo de Personal.');
  if(owner.personId&&owner.personId!==matches[0].id)throw new Error('El documento no corresponde a la cuenta principal.');
  const password=String(q.newPassword||'');
  if(password.length<8)throw new Error('La contraseña nueva debe tener al menos 8 caracteres.');
  const settings={ownerId:owner.id,personId:matches[0].id,document,revision:Utilities.getUuid(),passwordHash:hashPin_('principal:admin',password)};
  PropertiesService.getScriptProperties().setProperty('SK_ENTRY_PRINCIPAL',JSON.stringify(settings));
  return json_({ok:true,username:'admin',name:matches[0].nombre||document});
 }finally{lock.releaseLock()}
}
function entrySeal_(claims){
 const payload=JSON.stringify(claims);
 return 'sk2.'+Utilities.base64EncodeWebSafe(payload)+'.'+sign_('sk2|'+payload);
}
function entryRead_(token,scope){
 const bits=String(token||'').split('.');
 if(bits.length!==3||bits[0]!=='sk2')throw new Error('Acceso no válido.');
 const payload=Utilities.newBlob(Utilities.base64DecodeWebSafe(bits[1])).getDataAsString();
 if(!safeEqual_(bits[2],sign_('sk2|'+payload)))throw new Error('Acceso no válido.');
 const claims=JSON.parse(payload);
 if(claims.scope!==scope)throw new Error('El acceso corresponde a otra aplicación.');
 return claims;
}
function entryPerson_(cloud,document,id){
 return (cloud.personal||[]).find(p=>!p.deleted&&p.active!==false&&String(p.documento||'').trim()===document&&(!id||p.id===id));
}
function entryPrincipalAccount_(config,cloud){
 if(!config||!adminUsers_().some(u=>u.id===config.ownerId&&u.role==='owner'&&u.enabled!==false))throw new Error('La cuenta principal no está habilitada.');
 const p=entryPerson_(cloud,config.document,config.personId);
 if(!p)throw new Error('La cuenta principal no tiene acceso. Revisa el documento en Personal.');
 return {document:config.document,personId:p.id,name:p.nombre||config.document,username:'admin',role:'admin',roles:['admin'],principal:true};
}
function entryVerifySession_(token,scope,cloud){
 const claims=entryRead_(token,scope);
 if(claims.type!=='session'||claims.kind!=='principal'||!Number.isFinite(claims.expiresAt)||claims.expiresAt<=Date.now())throw new Error('La sesión venció.');
 const settings=entryPrincipal_();
 if(!settings||settings.revision!==claims.binding||settings.document!==claims.document)throw new Error('La cuenta ya no tiene acceso.');
 const account=entryPrincipalAccount_(settings,cloud||readFile_(findFile_()));
 return {...account,role:scope==='plaza'?'plaza_admin':scope==='admin'?'owner':'admin'};
}
function entryLogin_(scope,password){
 const settings=entryPrincipal_();
 if(!settings&&scope==='admin')return null;
 if(!settings||!password||!safeEqual_(settings.passwordHash,hashPin_('principal:admin',String(password))))throw new Error('Usuario o contraseña incorrectos.');
 const account=entryPrincipalAccount_(settings,readFile_(findFile_()));
 const expiresAt=Date.now()+12*60*60*1000,document=account.document;
 const token=entrySeal_({type:'session',kind:'principal',scope,document,binding:settings.revision,expiresAt});
 let user;
 if(scope==='admin')user={username:'admin',name:account.name,role:'owner',personId:account.personId,document};
 else if(scope==='production')user={username:'admin',name:account.name,role:'admin',roles:['admin'],personId:account.personId,document};
 else user={username:'admin',nombre:account.name,role:scope==='plaza'?'plaza_admin':'admin',id:account.personId,documento:document};
 return json_({ok:true,scope,user,token,expiresAt,warehouseV1:scope==='production'});
}
function laborRole_(role){return role==='admin'?'admin':'reporter'}
function assignableLaborRole_(role){
 if(!['reporter','admin'].includes(role))throw new Error('Selecciona un rol de Labor válido.');
 return role;
}
function laborChangeActiveRole_(q){
 const lock=LockService.getScriptLock();lock.waitLock(30000);
 try{
  const role=assignableLaborRole_(q.role),document=String(q.document||'').trim();
  const account=laborAccount_(document),cloud=readFile_(findFile_(),lock);
  if(!account||account.personId!==q.personId||!laborPerson_(account,cloud))throw new Error('La cuenta ya no está activa en Labor.');
  const previous=laborRole_(account.role);
  if(previous!==role){
   if(previous!==q.previousRole)throw new Error('El rol de Labor cambió. Vuelve a consultar los accesos.');
   revokeInvitations_('labor',document);
   account.role=role;
   PropertiesService.getScriptProperties().setProperty(laborAccessKey_(document),JSON.stringify(account));
  }
  return json_({ok:true,scope:'labor',personId:account.personId,role});
 }finally{lock.releaseLock()}
}
function laborRoleDirectory_(q){
 const cloud=readFile_(findFile_()),account=verifyLaborToken_(q.token,cloud);
 if(laborRole_(account.role)!=='admin')throw new Error('Se requiere el rol Administrador de Labor.');
 const users=[];
 for(const [key,raw] of Object.entries(PropertiesService.getScriptProperties().getProperties())){
  if(!key.startsWith('SK_LABOR_USER_'))continue;
  const entry=JSON.parse(raw),person=laborPerson_(entry,cloud);
  if(person)users.push({name:person.nombre||entry.document,role:laborRole_(entry.role)});
 }
 return json_({ok:true,scope:'labor',users});
}
function changeAppActiveRole_(q){
 const lock=LockService.getScriptLock();lock.waitLock(30000);
 try{
  const cloud=readFile_(findFile_(),lock),person=(cloud.personal||[]).find(p=>p.id===q.personId&&!p.deleted);
  const document=String(person?.documento||'').trim();
  if(!document)throw new Error('Selecciona un colaborador sincronizado con documento.');
  if(q.scope==='admin'){
   const users=adminUsers_(),user=users.find(u=>u.id===q.userId&&u.enabled!==false);
   if(!user||user.role==='owner'||(user.personId?user.personId!==person.id:user.document!==document))throw new Error('Selecciona una cuenta administrativa vinculada a este colaborador.');
   if(cargoNorm_(person.area)!=='seguridad fisica')throw new Error('Web Admin requiere personal de Seguridad física.');
   const role=assignableAdminRole_(q.role);
   if(user.role!==role){
    if(user.role!==q.previousRole)throw new Error('El rol cambió. Vuelve a consultar los accesos.');
    revokeInvitations_('admin',document);
    user.role=role;user.updatedAt=new Date().toISOString();saveAdminUsers_(users);
   }
   return json_({ok:true,scope:'admin',personId:person.id,role});
  }
  if(q.scope!=='production')throw new Error('Aplicación no válida.');
  const user=productionAccess_(document);
  if(!user||user.personId!==person.id||!user.passwordHash)throw new Error('La cuenta ya no está activa en Producción.');
  const selection=role=>role==='mechanic_warehouse'?['mechanic','warehouse']:productionRoles_({roles:[role]});
  const roles=selection(q.role),previous=productionRoles_(user);
  const match=(a,b)=>a.length===b.length&&a.every(role=>b.includes(role));
  if(!match(previous,roles)){
   if(!match(previous,selection(q.previousRole)))throw new Error('El rol cambió. Vuelve a consultar los accesos.');
   revokeInvitations_('production',document);
   saveProductionAccess_(person,user.passwordHash,roles);
  }
  return json_({ok:true,scope:'production',personId:person.id,role:productionPrimaryRole_(roles),roles});
 }finally{lock.releaseLock()}
}
function appRolesForPerson_(q){
 const cloud=readFile_(findFile_()),person=(cloud.personal||[]).find(p=>p.id===q.personId&&!p.deleted);
 if(!person||!String(person.documento||'').trim())throw new Error('Selecciona un colaborador sincronizado con documento.');
 const document=String(person.documento).trim(),labor=laborAccount_(document),production=productionAccess_(document);
 const web=adminUsers_().find(u=>u.enabled!==false&&(u.personId?u.personId===person.id:u.document===document||u.username===document));
 const plaza=(cloud.personal||[]).find(p=>!p.deleted&&String(p.documento||'').trim()===document&&p.plazaEnabled===true&&p.pinHash);
 return json_({ok:true,personId:person.id,roles:{
  admin:web?[publicAdminUser_(web).role]:[],plaza:plaza?[plazaAccessRole_(plaza.plazaRole)]:[],
  production:production&&production.personId===person.id?productionRoles_(production):[],
  labor:labor&&laborPerson_(labor,cloud)?[laborRole_(labor.role)]:[]
 }});
}
function laborPerson_(account,cloud){
 return (cloud.personal||[]).find(p=>p.id===account.personId&&!p.deleted&&p.active!==false&&String(p.documento||'').trim()===account.document);
}
function laborAccessAdmin_(q){
 const props=PropertiesService.getScriptProperties();
 if(q.action==='laborDisable'){
  const document=String(q.document||'').trim();
  if(!document)throw new Error('Selecciona un funcionario.');
  const lock=LockService.getScriptLock();lock.waitLock(30000);
  try{revokeInvitations_('labor',document);props.deleteProperty(laborAccessKey_(document));return json_({ok:true})}
  finally{lock.releaseLock()}
 }
 const users=new Map(),pending=[];
 for(const [key,raw] of Object.entries(props.getProperties())){
  if(key.startsWith('SK_LABOR_USER_')){
   const {personId,document,role}=JSON.parse(raw);
   users.set(document,{personId,document,role:laborRole_(role)});
  }else if(key.startsWith('SK_INVITE_')){
   const invite=JSON.parse(raw);
   if(invite.scope==='labor'&&invite.expires>Date.now())pending.push(invite);
  }
 }
 for(const {personId,document,laborRole} of pending){
  if(!users.has(document))users.set(document,{personId,document,role:laborRole_(laborRole),pending:true});
 }
 return json_({ok:true,scope:'labor',users:[...users.values()]});
}
function laborLogin_(q){
 if(String(q.document||'').trim().toLowerCase()==='admin')return entryLogin_('labor',q.password);

 const document=String(q.document||'').trim(),account=laborAccount_(document);
 if(!account||!safeEqual_(account.passwordHash,hashPin_(document,String(q.password||''))))throw new Error('Documento o contraseña incorrectos para Labor.');
 const id=findFile_(),person=laborPerson_(account,id?readFile_(id):{});
 if(!person)throw new Error('Usuario no habilitado para Labor.');
 const expiresAt=Date.now()+12*60*60*1000;
 const payload=JSON.stringify(['labor',document,account.revision,expiresAt]);
 return json_({ok:true,scope:'labor',expiresAt,token:Utilities.base64EncodeWebSafe(payload)+'.'+sign_(payload),
  user:{id:person.id,documento:document,nombre:person.nombre||document,role:laborRole_(account.role)}});
}
function verifyLaborToken_(token,cloud){
 if(String(token||'').startsWith('sk2.'))return entryVerifySession_(token,'labor',cloud);

 const bits=String(token||'').split('.');
 if(bits.length!==2)throw new Error('Inicia sesión en Labor.');
 const payload=Utilities.newBlob(Utilities.base64DecodeWebSafe(bits[0])).getDataAsString();
 if(!safeEqual_(bits[1],sign_(payload)))throw new Error('Sesión de Labor no válida.');
 let parts;try{parts=JSON.parse(payload)}catch(_){throw new Error('Inicia sesión en Labor.')}
 if(!Array.isArray(parts)||parts.length!==4||parts[0]!=='labor')throw new Error('Inicia sesión en Labor.');
 const [,document,revision,expiresAt]=parts,account=laborAccount_(document);
 if(!account||account.revision!==revision||!laborPerson_(account,cloud))throw new Error('La cuenta ya no tiene acceso a Labor.');
 if(!Number.isFinite(expiresAt)||expiresAt<=Date.now())throw new Error('La sesión de Labor venció.');
 return account;
}
// Invitaciones de un solo uso: el enlace contiene un secreto aleatorio, nunca una contraseña.
function invitationKey_(token){return 'SK_INVITE_'+hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(token),Utilities.Charset.UTF_8))}
function assignableAdminRole_(role){if(!['assistant','admin'].includes(role))throw new Error('Rol de Web Admin no válido');return role}
function isAdmin_(auth){return Boolean(auth&&['owner','admin'].includes(auth.role))}
function accessInvitationCreate_(q){
 const scope=['plaza','admin','production','labor'].includes(q.scope)?q.scope:'';
 if(!scope)throw new Error('Aplicación no válida');
 const personId=String(q.personId||'').trim(),lock=LockService.getScriptLock();lock.waitLock(30000);
 try{
  const fileId=findFile_(),cloud=fileId?readFile_(fileId,lock):{},person=(cloud.personal||[]).find(x=>x&&x.id===personId&&!x.deleted);
  if(!person||!String(person.documento||'').trim())throw new Error('Selecciona un colaborador sincronizado con documento');
  if(scope==='labor'&&person.active===false)throw new Error('El funcionario está inactivo.');
  if(scope==='admin'){
   const area=String(person.area||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/\s+/g,' ');
   if(area!=='seguridad fisica')throw new Error('Solo se permite acceso a Web Admin a personal de Seguridad física');
   if(adminUsers_().some(x=>x.role==='owner'&&(x.personId===person.id||x.document===String(person.documento).trim()||x.username===String(person.documento).trim())))throw new Error('No se puede reemplazar el acceso principal');
  }
  const currentAdmin=scope==='admin'?adminUsers_().find(x=>x.personId===person.id||x.document===String(person.documento).trim()):null;
  const adminAccess=scope==='admin'?{adminRole:assignableAdminRole_(q.adminRole??currentAdmin?.role??'assistant')}:{};
  const document=String(person.documento).trim(),props=PropertiesService.getScriptProperties(),old=props.getProperties();
  const laborAccess=scope==='labor'?{laborRole:assignableLaborRole_(q.laborRole??laborRole_(laborAccount_(document)?.role))}:{};
  Object.keys(old).filter(k=>k.indexOf('SK_INVITE_')===0).forEach(k=>{try{const v=JSON.parse(old[k]);if(v.expires<Date.now()||(v.scope===scope&&v.document===document))props.deleteProperty(k)}catch(_){props.deleteProperty(k)}});
  const secret=[Utilities.getUuid(),Utilities.getUuid(),Utilities.getUuid()].join('').replace(/-/g,'');
  const expires=Date.now()+24*60*60*1000;
  const plazaRole=q.plazaRole==='supervisor'&&person.plazaEnabled&&plazaAccessRole_(person.plazaRole)==='supervisor'?'supervisor':['assistant','admin'].includes(q.plazaRole)?q.plazaRole:'operator';
  const plazaAccess=scope==='plaza'?{plazaRole}:{};
  const productionRoles=scope==='production'?productionRoles_({roles:q.productionRoles,role:q.productionRole||productionAccess_(document)?.role}):[];
  const productionAccess=scope==='production'?{productionRole:productionPrimaryRole_(productionRoles),productionRoles}:{};
  props.setProperty(invitationKey_(secret),JSON.stringify({scope:scope,personId:person.id,document:document,expires:expires,...plazaAccess,...productionAccess,...adminAccess,...laborAccess}));
  return json_({ok:true,scope,token:secret,document:document,name:person.nombre||'',...plazaAccess,...productionAccess,...adminAccess,...laborAccess,expiresAt:new Date(expires).toISOString()});
 }finally{lock.releaseLock()}
}
function revokeInvitations_(scope,document){const props=PropertiesService.getScriptProperties();Object.keys(props.getProperties()).filter(k=>k.indexOf('SK_INVITE_')===0).forEach(k=>{try{const row=JSON.parse(props.getProperty(k));if(row.scope===scope&&row.document===document)props.deleteProperty(k)}catch(_){props.deleteProperty(k)}})}
function invitationRecord_(q){const token=String(q.invitation||'');if(!/^[a-f0-9]{96}$/.test(token))throw new Error('Enlace de invitación no válido');const key=invitationKey_(token),raw=PropertiesService.getScriptProperties().getProperty(key);if(!raw)throw new Error('El enlace ya se usó o dejó de ser válido');const row=JSON.parse(raw);if(row.expires<Date.now())throw new Error('El enlace venció. Solicita uno nuevo');return{key:key,row:row}}
function accessInvitationInfo_(q){const invite=invitationRecord_(q),row=invite.row;return json_({ok:true,scope:row.scope,document:row.document,expiresAt:new Date(row.expires).toISOString()})}
function accessInvitationAccept_(q){const password=String(q.password||'');if(password.length<8)throw new Error('La contraseña debe tener al menos 8 caracteres');const lock=LockService.getScriptLock();lock.waitLock(30000);
 try{const invite=invitationRecord_(q),row=invite.row,document=String(q.document||'').trim();if(q.expectedScope&&q.expectedScope!==row.scope)throw new Error('El enlace no corresponde a esta aplicación.');if(document!==row.document)throw new Error('El documento no corresponde a la invitación');
  const fileId=findFile_(),cloud=fileId?readFile_(fileId,lock):{},person=(cloud.personal||[]).find(x=>x&&x.id===row.personId&&!x.deleted&&String(x.documento||'').trim()===document);
  if(!person)throw new Error('El colaborador ya no está disponible en Personal');const now=new Date().toISOString();
  if(row.scope==='plaza'){(cloud.personal||[]).filter(x=>x&&!x.deleted&&String(x.documento||'').trim()===document).forEach(x=>{x.pinHash=hashPin_(document,password);x.plazaEnabled=true;x.plazaRole=['assistant','supervisor','admin'].includes(row.plazaRole)?row.plazaRole:'operator';x.updatedAt=now});cloud.updatedAt=nextRevision_(cloud.updatedAt);writeFile_(fileId,cloud)}
  else if(row.scope==='labor'){
   if(person.active===false)throw new Error('El funcionario está inactivo.');
   const account={document,personId:person.id,role:laborRole_(row.laborRole),passwordHash:hashPin_(document,password),revision:Utilities.getUuid()};
   PropertiesService.getScriptProperties().setProperty(laborAccessKey_(document),JSON.stringify(account));
  }
  else if(row.scope==='production'){saveProductionAccess_(person,hashPin_(document,password),row.productionRoles||row.productionRole)}
  else if(row.scope==='admin'){const area=String(person.area||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/\s+/g,' ');if(area!=='seguridad fisica')throw new Error('El colaborador ya no pertenece a Seguridad física');const users=adminUsers_();if(users.some(x=>x.role==='owner'&&(x.personId===person.id||x.document===document||x.username===document)))throw new Error('No se puede reemplazar el acceso principal');const adminRole=assignableAdminRole_(row.adminRole??'assistant');let user=users.find(x=>x.role!=='owner'&&(x.personId===person.id||x.document===document));if(!user){if(users.some(x=>x.username===document))throw new Error('El documento ya está registrado como otro usuario');user={id:'ADMIN-'+Utilities.getUuid(),createdAt:now};users.push(user)}user.personId=person.id;user.document=document;user.username=document;user.name=person.nombre||document;user.role=adminRole;user.enabled=true;user.passwordHash=hashPin_(document,password);user.updatedAt=now;saveAdminUsers_(users)}
  else throw new Error('Aplicación no válida');PropertiesService.getScriptProperties().deleteProperty(invite.key);return json_({ok:true,scope:row.scope});
 }finally{lock.releaseLock()}}
function adminUsers_(){const raw=PropertiesService.getScriptProperties().getProperty('SK_ADMIN_USERS');if(!raw)return[];try{const rows=JSON.parse(raw);return Array.isArray(rows)?rows:[]}catch(e){throw new Error('La configuración de usuarios Web Admin está dañada')}}
function saveAdminUsers_(rows){PropertiesService.getScriptProperties().setProperty('SK_ADMIN_USERS',JSON.stringify(rows))}
function publicAdminUser_(x){return{id:x.id,personId:x.personId||'',document:x.document||'',username:x.username,name:x.name||x.username,role:['owner','admin'].includes(x.role)?x.role:'assistant',enabled:x.enabled!==false,createdAt:x.createdAt||'',updatedAt:x.updatedAt||''}}
function adminStatus_(){return json_({ok:true,configured:adminUsers_().length>0})}
function validAdminUsername_(value){const username=String(value||'').trim().toLowerCase();if(!/^[a-z0-9._-]{4,40}$/.test(username))throw new Error('El usuario debe tener entre 4 y 40 caracteres y usar solo letras, números, punto, guion o guion bajo');return username}
function adminBootstrap_(q){const lock=LockService.getScriptLock();lock.waitLock(30000);try{if(adminUsers_().length)throw new Error('El administrador principal ya fue creado');const username=validAdminUsername_(q.username),password=String(q.password||''),name=String(q.name||'').trim();if(password.length<8)throw new Error('La contraseña debe tener al menos 8 caracteres');if(!name)throw new Error('Escribe el nombre del administrador');const now=new Date().toISOString(),user={id:'ADMIN-'+Utilities.getUuid(),username:username,name:name,role:'owner',enabled:true,passwordHash:hashPin_(username,password),createdAt:now,updatedAt:now};saveAdminUsers_([user]);return adminSession_(user)}finally{lock.releaseLock()}}
function adminLogin_(q){
 if(String(q.username||'').trim().toLowerCase()==='admin'){const session=entryLogin_('admin',q.password);if(session)return session;}
 const identity=String(q.username||'').trim().toLowerCase(),password=String(q.password||''),users=adminUsers_();
 const user=users.find(u=>u.username===identity)||users.find(u=>u.role!=='owner'&&identity&&String(u.document||'').trim()===identity);
 if(!user||user.enabled===false||!password||!safeEqual_(String(user.passwordHash||''),hashPin_(user.username,password)))throw new Error('Usuario o contraseña incorrectos.');
 return adminSession_(user);
}
function adminSession_(user){const expires=Date.now()+12*60*60*1000,payload=[user.username,['owner','admin'].includes(user.role)?user.role:'assistant',expires].join('|'),token=Utilities.base64EncodeWebSafe(payload)+'.'+sign_(payload);return json_({ok:true,token:token,user:publicAdminUser_(user),expiresAt:new Date(expires).toISOString()})}
function verifyAdminToken_(token){
 if(String(token||'').startsWith('sk2.'))return entryVerifySession_(token,'admin');
const bits=String(token||'').split('.');if(bits.length!==2)throw new Error('Inicia sesión en Web Admin');const payload=Utilities.newBlob(Utilities.base64DecodeWebSafe(bits[0])).getDataAsString(),parts=payload.split('|');if(parts.length!==3||!safeEqual_(bits[1],sign_(payload))||Number(parts[2])<Date.now())throw new Error('La sesión de Web Admin venció');const user=adminUsers_().find(x=>x.username===parts[0]&&x.enabled!==false);if(!user||!['owner','admin','assistant'].includes(parts[1])||parts[1]!==user.role)throw new Error('La cuenta ya no tiene acceso a Web Admin');return{username:user.username,name:user.name||user.username,role:user.role}}
function canManageAssets_(auth){return Boolean(auth&&['owner','admin','assistant'].includes(auth.role))}
function requireAssetManager_(auth){if(!canManageAssets_(auth))throw new Error('Inicia sesión en Web Admin para administrar activos fijos')}
function requireAdmin_(auth){if(!isAdmin_(auth))throw new Error('Esta operación requiere el rol Administrador')}
function adminUsersList_(){return json_({ok:true,users:adminUsers_().map(publicAdminUser_),adminRoles:['assistant','admin']})}
function adminUserSave_(q){
 const lock=LockService.getScriptLock();lock.waitLock(30000);
 try{
  const rows=adminUsers_(),id=String(q.id||''),now=new Date().toISOString();
  let user=rows.find(x=>x.id===id);
  if(id&&!user)throw new Error('El usuario no existe');
  if(user&&user.role==='owner')throw new Error('No se puede modificar al Desarrollador-administrador desde este formulario');
  const personId=String(q.personId||'').trim();
  if(!personId)throw new Error('Selecciona un colaborador registrado en Personal');
  const fileId=findFile_(),cloud=fileId?readFile_(fileId,lock):{};
  const person=(cloud.personal||[]).find(x=>String(x.id)===personId&&!x.deleted);
  if(!person)throw new Error('El colaborador no existe en la base central. Sincroniza Personal antes de conceder acceso.');
  const area=String(person.area||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/\s+/g,' ');
  if(area!=='seguridad fisica')throw new Error('Solo se permite conceder acceso a colaboradores del área Seguridad física');
  const document=String(person.documento||'').trim(),name=String(person.nombre||'').trim();
  if(!document||!name)throw new Error('Completa el nombre y documento del colaborador en Personal');
  if(user&&user.personId&&user.personId!==personId)throw new Error('No se puede transferir una cuenta a otro colaborador');
  if(rows.some(x=>x.id!==id&&(x.personId===personId||(x.document&&String(x.document).trim()===document))))throw new Error('Este colaborador ya tiene una cuenta Web Admin');
  const adminRole=assignableAdminRole_(q.adminRole??user?.role??'assistant');
  const username=validAdminUsername_(q.username),password=String(q.password||''),previousUsername=user&&user.username;
  if(rows.some(x=>x.username===username&&x.id!==id))throw new Error('Ese nombre de usuario ya está registrado');
  if(!user){if(password.length<8)throw new Error('La contraseña debe tener al menos 8 caracteres');user={id:'ADMIN-'+Utilities.getUuid(),createdAt:now};rows.push(user)}
  else if(password&&password.length<8)throw new Error('La contraseña debe tener al menos 8 caracteres');
  if(previousUsername&&previousUsername!==username&&!password)throw new Error('Al cambiar el usuario también debes asignar una contraseña nueva');
  user.username=username;user.name=name;user.personId=personId;user.document=document;user.role=adminRole;user.enabled=q.enabled!==false;
  if(password)user.passwordHash=hashPin_(username,password);
  user.updatedAt=now;saveAdminUsers_(rows);return json_({ok:true,user:publicAdminUser_(user)});
 }finally{lock.releaseLock()}
}
function adminUserDisable_(q){const lock=LockService.getScriptLock();lock.waitLock(30000);try{const rows=adminUsers_(),user=rows.find(x=>x.id===String(q.id||''));if(!user)throw new Error('El usuario no existe');if(user.role==='owner')throw new Error('No se puede desactivar al Administrador principal');user.enabled=false;user.updatedAt=new Date().toISOString();revokeInvitations_('admin',user.document);saveAdminUsers_(rows);return json_({ok:true,user:publicAdminUser_(user)})}finally{lock.releaseLock()}}
function adminSyncAuthorized_(incoming,since,auth,productionVersions){if(!isAdmin_(auth)){const allowed=['personal','actas','consumptions','novelties','assets'],blocked=Object.keys(incoming||{}).filter(name=>Array.isArray(incoming[name])&&incoming[name].some(x=>x&&x.syncState==='pending')&&!allowed.includes(name));if(blocked.length)throw new Error('Tu rol no permite modificar: '+blocked.join(', '))}return adminSync_(incoming,!isAdmin_(auth)&&['novelties','assets'].some(name=>(incoming[name]||[]).some(row=>row&&row.syncState==='pending'))?'':since,auth,productionVersions)}

// Se ejecuta bajo el mismo bloqueo de sincronización. El registro de marcas nunca
// se borra al dar de baja un activo ni se acepta desde un cliente.
// Ingresos de YT/columnas: origen histórico, propiedad y marcación permanente.
function repairIncomeClass_(value){return /^(yt(?:\b|\d)|columnas?\b)/i.test(String(value||'').trim())}
function sandraKMine_(value){return cargoNorm_(value).replace(/[.\s-]/g,'')==='sandrak'}
function externalMinePrefix_(mine){const prefixes={'providencia':'P','el silencio':'S','carla':'C','alianza':'L'};return prefixes[cargoNorm_(mine)]||''}
function collaboratorSyncCapabilities_(){return{collaboratorRevisionsV1:true}}
function nextRevision_(previous){return new Date(Math.max(Date.now(),(Date.parse(previous)||0)+1)).toISOString()}
function plazaIncomeCapabilities_(){return{collaboratorRevisionsV1:true,movementReceiptsV1:true,independentMovementGroupsV1:true,inventoryLoansV1:true,loanReturnsV1:true,externalIncomeV1:true,mineExitsV1:true,mineReturnOwnerV2:true,mineSegoviaV1:true,mineSegoviaRepairOnly:true,mineRepairDestinationV1:true,externalMarkSeparator:'-',minePrefixes:{'Providencia':'P','El Silencio':'S','Carla':'C','Alianza':'L'}}}
function validatePlazaIncomeContext_(row,asset){
 if(!row.incomeType&&!row.originMine)return false; // Compatibilidad con registros anteriores.
 if(!repairIncomeClass_(asset.clase))throw new Error('El tipo de ingreso especial solo corresponde a YT y columnas');
 if(!['TRASLADO','REPARACIÓN'].includes(row.incomeType)||!String(row.originMine||'').trim())throw new Error('Selecciona tipo de ingreso y mina de origen');
 return true;
}
function applyPlazaIncomeContext_(row,asset){
 if(!validatePlazaIncomeContext_(row,asset))return;
 asset.ultimoTipoIngreso=row.incomeType;asset.ultimaMinaOrigen=String(row.originMine).trim();
 if(!asset.minaOrigen)asset.minaOrigen=asset.ultimaMinaOrigen;
 if(row.incomeType==='TRASLADO')asset.mina='Sandra K';else if(!asset.mina)asset.mina=asset.ultimaMinaOrigen;
 asset.activoExterno=!sandraKMine_(asset.mina);
 asset.ingresoTemporal=row.incomeType==='REPARACIÓN'&&asset.activoExterno;
 if(row.incomeType==='REPARACIÓN'){asset.estado='En reparación';asset.disponibleEntrega='Sí'}
}
function preparePlazaIncomeAsset_(asset){
 if(!repairIncomeClass_(asset.clase)||!asset.tipoIngresoInicial)return;
 const row={incomeType:asset.tipoIngresoInicial,originMine:asset.minaOrigen};
 validatePlazaIncomeContext_(row,asset);
 // Las altas especifican la propiedad; una reparación nunca convierte un activo externo en propio.
 asset.mina=row.incomeType==='TRASLADO'?'Sandra K':String(row.originMine).trim();
 applyPlazaIncomeContext_(row,asset);
 if(asset.incomeMarking===true&&asset.activoExterno&&!externalMinePrefix_(asset.mina))throw new Error('La mina de origen no tiene un prefijo de marcación configurado');
}
function usesAutomaticAssetMark_(asset){
 const type=String(asset&&asset.clase||'').trim().toLowerCase();
 if(!type||/^autorrescatador(?:es)?\b/i.test(type))return false;
 if(repairIncomeClass_(type))return asset.incomeMarking===true&&!!String(asset.minaOrigen||asset.mina||'').trim();
 return true;
}
function automaticAssetMarkCode_(index){
 if(!Number.isInteger(index)||index<0||index>=26*26*26)throw new Error('Se agotaron las marcas de tres letras. Contacta al administrador.');
 return String.fromCharCode(65+Math.floor(index/676),65+Math.floor(index/26)%26,65+index%26);
}
function markFamily_(clase){
  const type=String(clase||'').trim();
  if(/^yt(?:\b|\d)/i.test(type))return 'yt';
  if(/^columnas?(?:\b|\d)/i.test(type))return 'columna';
  return '';
}
function marksCanCollide_(leftClass,rightClass){
  const left=markFamily_(leftClass),right=markFamily_(rightClass);
  return !left||!right||left===right;
}
function markReservationClass_(entry,assets){
 return entry.assetClass||assets.get(entry.reservedForAssetId||entry.id)?.clase;
}
function validateNewAssetMarks_(cloud,rows,registry){
 const code=value=>String(value??'').trim().toUpperCase(),previous=new Map((cloud.assets||[]).filter(Boolean).map(row=>[row.id,row])),final=new Map(previous),owners=new Map();
 function reserve(value,id,clase){
  const mark=code(value);
  if(!id||!/^(?:[A-Z]{3}|[A-Z]-[A-Z]{2})$/.test(mark))return;
  if(!owners.has(mark))owners.set(mark,[]);
  owners.get(mark).push({id,clase});
 }
 for(const row of rows){const old=previous.get(row.id);final.set(row.id,old?.deleted?old:choose_(row,old))}
 // Conservar las reservas históricas, aunque el activo ya no esté en la lista visible.
 for(const row of registry)reserve(row.code,row.id,markReservationClass_(row,previous)||markReservationClass_(row,final));
 for(const row of [...previous.values(),...final.values()])for(const key of ['nuevaMarca','marcaActual','marcaInterna','marcaPrevia','marcaAnterior','numeroMarcaActual'])reserve(row[key],row.id,row.clase);
 for(const input of rows){
  const row=final.get(input.id),old=previous.get(input.id);if(!row||row.deleted)continue;
  for(const field of ['nuevaMarca','marcaActual','marcaInterna']){
   const mark=code(row[field]);if(!/^(?:[A-Z]{3}|[A-Z]-[A-Z]{2})$/.test(mark)||old&&markFamily_(old.clase)===markFamily_(row.clase)&&code(old[field])===mark)continue;
   const owner=(owners.get(mark)||[]).find(other=>other.id!==row.id&&marksCanCollide_(row.clase,other.clase));
   if(!owner)continue;
   const otherId=owner.id;
   const other=previous.get(otherId)||final.get(otherId),label=other?[other.clase,other.numeroClase||other.numeroYT,other.serial&&'Serial: '+other.serial].filter(Boolean).join(' · '):'otro activo del registro histórico';
   throw new Error('La marca '+(field==='nuevaMarca'?'nueva ':'')+mark+' ya pertenece a '+label+'. No se guardaron los cambios. Revisa la marca de la ficha; para obtener una nueva utiliza «Solicitar marca nueva».');
  }
 }
}
function assignAssetMarks_(cloud,rows,requestAuth){
 const registry=(Array.isArray(cloud.assetMarkRegistry)?cloud.assetMarkRegistry:[]).map(row=>Object.assign({},row,{code:String(row.code||'').trim().toUpperCase()}));
 const byId=new Map(registry.map(row=>[row.id,row])),existing=new Map((cloud.assets||[]).filter(Boolean).map(row=>[row.id,row]));
 const used=new Set(registry.map(row=>row.code));
 // Reservar también marcas físicas anteriores, incluso de activos dados de baja.
 (cloud.assets||[]).concat(rows).forEach(asset=>{if(!asset)return;['marcaInterna','marcaActual','nuevaMarca','marcaPrevia','marcaAnterior','numeroMarcaActual'].forEach(key=>{const value=String(asset[key]||'').trim().toUpperCase();if(/^(?:[A-Z]{3}|[A-Z]-[A-Z]{2})$/.test(value))used.add(value)})});
 const sequenceOf=row=>row.scheme==='mine-prefix-v1'?-1:Math.max(Number.isInteger(row.sequence)?row.sequence:-1,/^[A-Z]{3}$/.test(row.code)?[...row.code].reduce((n,c)=>n*26+c.charCodeAt(0)-65,0):-1);
 let next=Math.max(-1,...registry.map(sequenceOf))+1,changed=false;
 const assets=rows.map(input=>{
  const asset=Object.assign({},input),old=existing.get(asset.id);
  // El registro de correcciones solo lo escribe la operación central autorizada.
  if(old&&Array.isArray(old.markCorrections))asset.markCorrections=old.markCorrections;else delete asset.markCorrections;
  let entry=byId.get(asset.id);
  const requested=asset.markingPolicy==='letters-v1',eligible=usesAutomaticAssetMark_(asset);
  const existingRequest=!!(old&&asset.markRequest==='existing-v1'&&canManageAssets_(requestAuth)&&!old.deleted&&!String(old.nuevaMarca||'').trim()&&usesAutomaticAssetMark_(old)&&eligible);
  // Un cliente antiguo o una edición no puede borrar/cambiar una marca ya emitida.
  if(!entry&&old&&old.markingPolicy==='letters-v1'&&old.markStatus==='assigned'&&/^(?:[A-Z]{3}|[A-Z]-[A-Z]{2})$/.test(old.nuevaMarca||'')){
   entry={id:old.id,assetClass:old.clase,code:old.nuevaMarca,sequence:old.markSequence,issuedAt:old.markAssignedAt,...(old.markScheme==='mine-prefix-v1'?{scheme:old.markScheme,prefix:old.markPrefix,mine:old.markMine}:{})};registry.push(entry);byId.set(entry.id,entry);used.add(entry.code);next=Math.max(next,sequenceOf(entry)+1);
  }
  if(!entry&&requested&&eligible&&(!old||old.markingPolicy==='letters-v1'&&old.markStatus==='pending'||existingRequest)){
   const external=asset.incomeMarking===true&&asset.activoExterno===true&&repairIncomeClass_(asset.clase),prefix=external?externalMinePrefix_(asset.mina):'';
   if(external){
    if(!prefix)throw new Error('La mina de origen no tiene un prefijo de marcación configurado');
    const legacySuffixes=new Set(registry.filter(row=>row.scheme==='mine-prefix-v1'&&row.prefix===prefix&&/^[A-Z]{3}$/.test(row.code||'')).map(row=>row.code.slice(1)));
    let sequence=0;const code=index=>prefix+'-'+String.fromCharCode(65+Math.floor(index/26),65+index%26);
    while(sequence<676&&(used.has(code(sequence))||legacySuffixes.has(code(sequence).slice(2))))sequence++;
    if(sequence>=676)throw new Error('Se agotaron las marcas del prefijo '+prefix+' para '+asset.mina+'. Contacta al administrador.');
    entry={id:asset.id,assetClass:asset.clase,code:code(sequence),sequence:sequence,issuedAt:new Date().toISOString(),scheme:'mine-prefix-v1',prefix:prefix,mine:asset.mina};
   }else{
    // PAA (Sandra K) y P-AA (Providencia) son códigos distintos.
    while(next<17576&&used.has(automaticAssetMarkCode_(next)))next++;
    entry={id:asset.id,assetClass:asset.clase,code:automaticAssetMarkCode_(next),sequence:next,issuedAt:new Date().toISOString()};next++;
   }
   registry.push(entry);byId.set(entry.id,entry);used.add(entry.code);changed=true;
  }
  if(entry){
   if(old&&old.markPreviousValues&&!existingRequest){
    for(const key of ['markPreviousValues','markRequestedBy','markRequestedByName','markRequestedAt'])asset[key]=old[key];
    if(asset.markRequest==='existing-v1'&&asset.markStatus==='pending')asset.marcaPrevia=old.marcaPrevia||'';
   }
   if(existingRequest){
    const previous=String(old.marcaActual||old.marcaInterna||'').trim();
    if(previous&&!String(asset.marcaPrevia||'').trim())asset.marcaPrevia=previous;
    asset.markPreviousValues={marcaActual:old.marcaActual||'',marcaInterna:old.marcaInterna||'',marcaPrevia:old.marcaPrevia||''};
    asset.markRequestedBy=requestAuth.username||'';asset.markRequestedByName=requestAuth.name||'';
    asset.updatedAt=nextRevision_(Date.parse(asset.updatedAt||'')>Date.parse(old.updatedAt||'')?asset.updatedAt:old.updatedAt);
   }
   const prior=String(asset.marcaActual||asset.marcaInterna||'').trim();
   if(!old&&prior&&prior!==entry.code&&!asset.marcaAnterior)asset.marcaAnterior=prior;
   Object.assign(asset,{marcaInterna:entry.code,marcaActual:entry.code,nuevaMarca:entry.code,markingPolicy:'letters-v1',markStatus:'assigned',markSequence:entry.sequence,markAssignedAt:entry.issuedAt,...(entry.scheme==='mine-prefix-v1'?{markScheme:entry.scheme,markPrefix:entry.prefix,markMine:entry.mine}:{})});
  }else if(requested){
   if(asset.markRequest==='existing-v1'&&old&&String(old.nuevaMarca||'').trim()){
    for(const key of ['marcaInterna','marcaActual','nuevaMarca','marcaPrevia'])asset[key]=old[key]||'';
   }
   // Solo las altas que pidan la nueva secuencia se marcan; no se remarca el inventario existente.
   for(const key of ['markingPolicy','markStatus','markSequence','markAssignedAt']){if(old&&Object.prototype.hasOwnProperty.call(old,key))asset[key]=old[key];else delete asset[key]}
  }
  return asset;
 });
 validateNewAssetMarks_(cloud,assets,registry);
 // La ficha y los clientes antiguos no pueden emitir ni borrar una marca nueva.
 // Las asignaciones válidas proceden de una entrada central, incluida la corrección.
 for(const asset of assets){
  const old=existing.get(asset.id),effective=old?.deleted?old:choose_(asset,old);
  if(!effective||effective.deleted||byId.has(asset.id))continue;
  if(String(effective.nuevaMarca||'').trim().toUpperCase()!==String(old?.nuevaMarca||'').trim().toUpperCase())throw new Error('La marca nueva solo puede asignarla la base central. Actualiza la app y usa «Solicitar marca nueva» o «Corregir marca duplicada».');
 }
 return{assets:assets,registry:registry,changed:changed};
}

function adminCorrectAssetMark_(q,auth){
 requireAssetManager_(auth);
 const assetId=String(q.assetId||'').trim(),expectedMark=String(q.expectedMark||'').trim().toUpperCase();
 if(!assetId||!/^(?:[A-Z]{3}|[A-Z]-[A-Z]{2})$/.test(expectedMark))throw new Error('Selecciona el activo y la marca duplicada que deseas corregir.');
 const lock=LockService.getScriptLock();lock.waitLock(30000);
 try{
  const fileId=findFile_(),cloud=fileId?readFile_(fileId,lock):{},assets=cloud.assets||[],old=assets.find(row=>row&&row.id===assetId&&!row.deleted);
  if(!old)throw new Error('El activo no está disponible en la base central. Sincroniza y vuelve a abrir su ficha.');
  const history=Array.isArray(old.markCorrections)?old.markCorrections:[],previous=history.find(row=>row.from===expectedMark);
  // La marca anterior nunca se recicla: identifica esta corrección también entre dispositivos.
  if(previous)return json_({ok:true,asset:old,correction:previous,alreadyCorrected:true,updatedAt:cloud.updatedAt});
  const code=value=>String(value||'').trim().toUpperCase(),registry=cloud.assetMarkRegistry||[];
  if(code(old.nuevaMarca)!==expectedMark)throw new Error('La marca del activo cambió. Sincroniza y revisa la ficha antes de corregirla.');
  if(!usesAutomaticAssetMark_(old))throw new Error('Esta clase no usa la secuencia automática de marcas.');
  const assetById=new Map(assets.filter(Boolean).map(row=>[row.id,row]));
  const duplicate=assets.some(row=>row&&row.id!==assetId&&marksCanCollide_(old.clase,row.clase)&&['nuevaMarca','marcaActual','marcaInterna'].some(key=>code(row[key])===expectedMark))||
   registry.some(row=>row&&(row.reservedForAssetId||row.id)!==assetId&&code(row.code)===expectedMark&&marksCanCollide_(old.clase,markReservationClass_(row,assetById)));
  if(!duplicate)throw new Error('La base central no encontró otra asignación de esta marca. Se conserva la marca actual.');
  const timestamp=nextRevision_(old.updatedAt||old.createdAt),archiveId='mark-correction:'+assetId+':'+expectedMark;
  const priorEntries=registry.filter(row=>row.id===assetId),keptRegistry=registry.filter(row=>row.id!==assetId).map(row=>Object.assign({},row));
  const reserved=new Map();for(const entry of priorEntries)reserved.set(code(entry.code),entry);
  for(const key of ['nuevaMarca','marcaActual','marcaInterna']){const value=code(old[key]);if(/^(?:[A-Z]{3}|[A-Z]-[A-Z]{2})$/.test(value)&&!reserved.has(value))reserved.set(value,{code:value,sequence:old.markSequence,issuedAt:old.markAssignedAt,...(old.markScheme==='mine-prefix-v1'?{scheme:old.markScheme,prefix:old.markPrefix,mine:old.markMine}:{})});}
  for(const [value,entry] of reserved)keptRegistry.push(Object.assign({},entry,{id:archiveId+':'+value,code:value,assetClass:entry.assetClass||old.clase,reservedForAssetId:assetId,retiredAt:timestamp,reason:'Corrección de marca duplicada'}));
  // Se reutiliza el mismo asignador y el mismo bloqueo que Admin y Plaza.
  const candidate=Object.assign({},old,{marcaInterna:'',marcaActual:'',nuevaMarca:'',markingPolicy:'letters-v1',markStatus:'pending',updatedAt:timestamp,syncState:'synced'});
  for(const key of ['markSequence','markAssignedAt','markScheme','markPrefix','markMine','markRequest'])delete candidate[key];
  const working=Object.assign({},cloud,{assets:assets.filter(row=>row.id!==assetId),assetMarkRegistry:keptRegistry});
  const marking=assignAssetMarks_(working,[candidate],auth),corrected=marking.assets[0];
  const correction={id:archiveId,from:expectedMark,to:corrected.nuevaMarca,at:timestamp,by:auth.username||'',byName:auth.name||auth.username||'',reason:'Corrección de marca duplicada',previousValues:{marcaInterna:old.marcaInterna||'',marcaActual:old.marcaActual||'',nuevaMarca:old.nuevaMarca||''}};
  corrected.markCorrections=history.concat(correction);
  cloud.assets=assets.map(row=>row.id===assetId?corrected:row);cloud.assetMarkRegistry=marking.registry;cloud.updatedAt=nextRevision_(cloud.updatedAt);
  writeFile_(fileId,cloud);return json_({ok:true,asset:corrected,correction:correction,updatedAt:cloud.updatedAt});
 }finally{lock.releaseLock()}
}

// Recupera altas hechas con el cliente nuevo antes de actualizar este servicio.
// Solo completa solicitudes explícitas; nunca remarca el inventario anterior.
function completePendingAssetMarks_(cloud){
 const pending=(cloud.assets||[]).filter(asset=>asset&&!asset.deleted&&asset.markingPolicy==='letters-v1'&&asset.markStatus==='pending'&&usesAutomaticAssetMark_(asset));
 if(!pending.length)return false;
 const marking=assignAssetMarks_(cloud,pending),updatedAt=new Date().toISOString(),byId=new Map(marking.assets.map(asset=>[asset.id,Object.assign({},asset,{updatedAt:updatedAt,syncState:'synced'})]));
 cloud.assets=cloud.assets.map(asset=>byId.get(asset.id)||asset);cloud.assetMarkRegistry=marking.registry;cloud.updatedAt=updatedAt;
 return true;
}

// Las altas del auxiliar se validan en el servidor. La huella permite reintentar
// un alta sin sobrescribir cambios posteriores; las ediciones se aceptan por separado.
function assistantAssetFingerprint_(row,includeAccessories=true,includeSerialStatus=true){
 const fields=['id','clase','numeroYT','numeroClase','modelo','fabricante','serial','estadoVisor','largo','marcada','mina','fechaIngreso','fechaNovedad','horaNovedad','descripcionNovedad','documentoResponsable','nombreResponsable','documentoBodeguero','nombreBodeguero','ubicacion','estado','disponibleEntrega','asignadaId','observaciones','marcaAnterior','numeroMarcaActual','createdAt','deleted'];
 if(row.classNumberPolicy==='auto-v1'){for(const field of ['numeroYT','numeroClase']){const index=fields.indexOf(field);if(index>=0)fields.splice(index,1)}}
 if(includeAccessories&&(Object.prototype.hasOwnProperty.call(row,'hasAccessories')||Object.prototype.hasOwnProperty.call(row,'accessories')))fields.push('hasAccessories','accessories');
 if(includeSerialStatus&&row.serialStatus)fields.push('serialStatus');
 if(row.marcaPrevia)fields.push('marcaPrevia');if(row.areaAsignada)fields.push('areaAsignada');
 if(row.incomeMarking||row.tipoIngresoInicial)fields.push('incomeMarking','tipoIngresoInicial','minaOrigen','activoExterno');
 if(!usesAutomaticAssetMark_(row))fields.push('marcaInterna','marcaActual','nuevaMarca');
 return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(fields.map(key=>[key,key==='accessories'?JSON.stringify(row[key]||[]):key==='hasAccessories'?JSON.stringify(row[key]??null):String(row[key]||'')])),Utilities.Charset.UTF_8));
}
function prepareAssistantAsset_(row,cloud,known,auth){
 if(row.classNumberPolicy==='auto-v1'&&automaticClassNumberEligible_(row.clase)){row.numeroClase=automaticClassNumber_(Array.from(known.values()),row);row.numeroYT=row.numeroClase;}
 const text=value=>String(value||'').trim(),number=text(row.numeroClase||row.numeroYT);
 if(row.deleted||!text(row.clase)||!number||!text(row.ubicacion)||!stamp_(row)||!Date.parse(row.createdAt||''))throw new Error('El activo nuevo requiere clase, número de clase, ubicación y fecha de registro válidos');
 const criterion=(cloud.inventoryCriteria||[]).find(item=>item&&!item.deleted&&item.active!==false&&item.isFixedAsset===true&&cargoNorm_(item.name||item.nombre||item.elemento)===cargoNorm_(row.clase));
 if(!criterion)throw new Error('Selecciona una CLASE activa de Criterios de inventario');
 if(!hasAssetIdentity_(row,criterion))throw new Error('Ingresa el SERIAL real o «No registra». La marca anterior no reemplaza el serial.');const automatic=usesAutomaticAssetMark_(row);
 for(const [flag,field] of [['usesSerial','serial'],['usesLength','largo'],['usesModel','modelo'],['usesManufacturer','fabricante'],['requiresInternalMark','marcaInterna']])if(!['serial','marcaInterna'].includes(field)&&criterion[flag]&&!(automatic&&field==='marcaInterna')&&!text(row[field]))throw new Error('Falta un campo obligatorio del activo: '+field);
 for(const existing of known.values()){
  if(existing.deleted||cargoNorm_(existing.clase)!==cargoNorm_(row.clase))continue;
  const same=(a,b)=>text(a)&&cargoNorm_(a)!=='no aplica'&&cargoNorm_(a)===cargoNorm_(b);
  if(same(number,existing.numeroClase||existing.numeroYT)||same(assetUniqueSerialKey_(row.serial),assetUniqueSerialKey_(existing.serial))||!automatic&&same(row.marcaActual||row.marcaInterna,existing.marcaActual||existing.marcaInterna))throw new Error('Este activo ya existe: revisa número de clase, serial y marca');
 }
 const asset=Object.assign({},row,{numeroClase:number,numeroYT:number,registeredBy:auth.username,registeredByName:auth.name||auth.username,registrationFingerprint:assistantAssetFingerprint_(row)});
 for(const key of ['markingPolicy','markStatus','markSequence','markAssignedAt'])delete asset[key];
 if(automatic)Object.assign(asset,{marcaInterna:'',marcaActual:'',nuevaMarca:'',markingPolicy:'letters-v1',markStatus:'pending'});
 return asset;
}

// El auxiliar administra las fichas de activos. Las restricciones de novedades
// existentes se conservan y sus cambios de estado se aplican sobre la ficha enviada.
function prepareAdminNovelties_(incoming,cloud,auth){
 const pending=name=>(Array.isArray(incoming[name])?incoming[name]:[]).filter(row=>row&&row.id&&row.syncState==='pending');
 const novelties=pending('novelties'),assets=pending('assets'),limited=auth&&!isAdmin_(auth);
 // Los clientes anteriores adjuntaban una copia completa del activo en la misma escritura.
 const dated=novelties.filter(row=>row.datedNovelty||row.fechaNovedad&&row.horaNovedad||row.noveltyAction);
 const datedIds=new Set(dated.map(row=>row.assetId));
 const histories=new Map(),profiles=new Map(),rules=createAssetHistory();
 for(const name of ['novelties','blendingIncomes','blendingDeliveries']){
  for(const row of dated.length&&cloud[name]||[]){
   if(!row||!datedIds.has(row.assetId))continue;
   if(!histories.has(row.assetId))histories.set(row.assetId,{personal:cloud.personal||[]});
   const group=histories.get(row.assetId);(group[name]||(group[name]=[])).push(row);
  }
 }
 function remember(event){
  accepted.push(event);historical.set(event.id,event);
  if(!histories.has(event.assetId))histories.set(event.assetId,{personal:cloud.personal||[]});
  const group=histories.get(event.assetId),rows=group.novelties||(group.novelties=[]),index=rows.findIndex(row=>row.id===event.id);
  if(index<0)rows.push(event);else rows[index]=event;
 }
 const visorChange=value=>cargoNorm_(value)==='cambio de color del visor';
 const assetMap=new Map((cloud.assets||[]).filter(Boolean).map(row=>[row.id,row]));
 const historical=new Map((cloud.novelties||[]).filter(Boolean).map(row=>[row.id,row]));
 const documents=new Map((cloud.actas||[]).filter(row=>row&&!row.deleted).map(row=>[row.id,row]));pending('actas').forEach(row=>{if(!row.deleted)documents.set(row.id,row)});
 const patches=new Map(),accepted=[],assetIds=new Set();
 for(const row of assets){
  const old=assetMap.get(row.id);
  if(row.assetDetailsOnly){if(old)rules.preserveLastNovelty(row,old);delete row.assetDetailsOnly;}
  if(old&&dated.some(event=>!event.datedNovelty&&event.assetId===row.id&&event.updatedAt===row.updatedAt)){
   for(const key of ['estado','ubicacion','areaAsignada','estadoVisor']){
    if(key in old)row[key]=old[key];else delete row[key];
   }
  }
  if(old?.currentNoveltyId&&datedIds.has(row.id)&&row.currentNoveltyId!==old.currentNoveltyId){
   const incomingDate=(row.fechaNovedad||'')+' '+(row.horaNovedad||'00:00');
   const currentDate=(old.fechaNovedad||'')+' '+(old.horaNovedad||'00:00');
   if(incomingDate<=currentDate){
    for(const key of ['currentNoveltyId','fechaNovedad','horaNovedad','descripcionNovedad','estado','ubicacion','areaAsignada','areaAsignadaRevision','estadoVisor','nombreResponsable','documentoResponsable','nombreBodeguero','documentoBodeguero','asignadaId','disponibleEntrega']){
     if(key in old)row[key]=old[key];else delete row[key];
    }
   }
  }
  if(old&&dated.some(event=>event.assetId===row.id&&event.noveltyAction)){
   const current=rules.snapshot(old);
   for(const key of Object.keys(rules.snapshot(row)))if(!(key in current))delete row[key];
   Object.assign(row,current);
  }
  if(!limited)patches.set(row.id,row);
 }
 if(limited)assets.forEach(row=>{
  if(assetIds.has(row.id))throw new Error('El lote contiene un activo repetido');
  assetIds.add(row.id);
  const previous=assetMap.get(row.id);
  if(!previous){const created=prepareAssistantAsset_(row,cloud,assetMap,auth);assetMap.set(row.id,created);patches.set(row.id,created);return;}
  if(row.markRequest!=='existing-v1'&&stamp_(row)<=stamp_(previous)&&previous.registeredBy===auth.username&&previous.registrationFingerprint){
   const sameAccessories=JSON.stringify([previous.hasAccessories??null,previous.accessories||[]])===JSON.stringify([row.hasAccessories??null,row.accessories||[]]);
   const sameSerialStatus=String(previous.serialStatus||'')===String(row.serialStatus||'');
   if(previous.registrationFingerprint===assistantAssetFingerprint_(row)||(sameAccessories&&previous.registrationFingerprint===assistantAssetFingerprint_(row,false))||(sameSerialStatus&&(previous.registrationFingerprint===assistantAssetFingerprint_(row,true,false)||(sameAccessories&&previous.registrationFingerprint===assistantAssetFingerprint_(row,false,false)))))return;
  }
  patches.set(row.id,row);
 });
 novelties.slice().sort((a,b)=>Number(!!b.noveltyAction)-Number(!!a.noveltyAction)||stamp_(a)-stamp_(b)||String(a.occurredAt||'').localeCompare(String(b.occurredAt||''))).forEach(row=>{
  const asset=assetMap.get(row.assetId)||(!limited&&assets.find(item=>item.id===row.assetId));
  row.descripcion=String(row.descripcion||'').replace(/\s*\([^()]*\)\s*$/,'').trim();if(/^dad[oa](?:\/[oa])? de baja$/.test(cargoNorm_(row.estado)))row.ubicacion='Desechado/a';const visor=visorChange(row.descripcion),previous=historical.get(row.id);
  if(row.noveltyAction){
   requireAdmin_(auth);
   const action=row.noveltyAction;
   if(!action.id||!['revert','delete'].includes(action.kind))throw new Error('Selecciona una acción válida para la novedad.');
   if(previous&&previous.assetId!==row.assetId)throw new Error('La novedad pertenece a otro activo.');
   if(previous?.noveltyAction?.id===action.id&&previous.noveltyAction.status==='applied'){remember(Object.assign({},previous,{syncState:'pending'}));return;}
   const original=previous||row,base=patches.get(row.assetId)||asset;
   if(!base)throw new Error('El activo de la novedad no existe. Sincroniza la aplicación.');
   const group=histories.get(row.assetId)||{};
   const alreadyInactive=previous&&(previous.deleted||previous.reversed||previous.reversedAt);
   if(!alreadyInactive&&previous){
    const restored=rules.restoreNovelty(base,original,group);
    if(JSON.stringify(rules.snapshot(restored))!==JSON.stringify(rules.snapshot(base))&&!base.deleted){
     restored.updatedAt=nextRevision_(base.updatedAt||base.createdAt);restored.syncState='pending';
     patches.set(base.id,restored);
    }
   }
   profiles.delete(row.assetId);
   const changedAt=nextRevision_(previous?.updatedAt||row.updatedAt);
   const saved=Object.assign({},original,{syncState:'pending',updatedAt:changedAt,
    noveltyAction:{id:action.id,kind:action.kind,status:'applied',requestedAt:action.requestedAt,
     appliedAt:changedAt,by:auth.username,byName:auth.name||auth.username}});
   if(action.kind==='delete')Object.assign(saved,{deleted:true,deletedAt:changedAt,deletedBy:auth.username});
   else Object.assign(saved,{reversed:true,reversedAt:saved.reversedAt||changedAt,reversedBy:saved.reversedBy||auth.username});
   remember(saved);return;
  }
  // Una copia retrasada nunca reactiva una novedad anulada en otro dispositivo.
  if(previous&&(previous.deleted||previous.reversed||previous.reversedAt)){
   remember(Object.assign({},previous,{syncState:'pending'}));return;
  }
  if(limited&&previous){
   for(const key of ['assetId','descripcion','ubicacion','estado','estadoVisor','actaId'])if((key==='descripcion'?String(previous[key]||'').replace(/\s*\([^()]*\)\s*$/,'').trim():String(previous[key]||''))!==String(row[key]||''))throw new Error('No puedes modificar una novedad ya registrada');
   accepted.push(Object.assign({},previous,{syncState:'pending'}));return;
  }
  if((limited||visor)&&(!asset||asset.deleted))throw new Error('El activo de la novedad no existe en la base central. Sincroniza primero.');
  if(limited&&(row.deleted||!String(row.descripcion||'').trim()))throw new Error('La novedad no es válida');
  if(visor){
   if(cargoNorm_(asset.clase)!=='autorrescatador')throw new Error('El cambio de color del visor solo está disponible para autorrescatadores');
   if(!String(row.estadoVisor||'').trim())throw new Error('Selecciona el color del visor');
  }else if(row.estadoVisor)throw new Error('El color del visor requiere la novedad Cambio de color del visor');
  if(/^dad[oa](?:\/[oa])? de baja mediante acta$/.test(cargoNorm_(row.descripcion))&&!previous){const document=documents.get(row.actaId);if(!document||document.tipo==='OFICIO'||!String(document.consecutivo||'').trim())throw new Error('Selecciona un acta registrada para dar de baja el activo');row.actaNumero=document.consecutivo;row.actaEnlace=/^https?:\/\//i.test(String(document.enlace||''))?document.enlace:'';}else if(!/^dad[oa](?:\/[oa])? de baja mediante acta$/.test(cargoNorm_(row.descripcion))){delete row.actaId;delete row.actaNumero;delete row.actaEnlace;}
  if(rules.isRetirementNotice(row.descripcion))row.estado=cargoNorm_(asset?.clase)==='autorrescatador'?'Dado de baja':'Dado/a de baja';
  if(rules.isRetiredState(row.estado))row.ubicacion='Desechado/a';
  if(row.datedNovelty||row.fechaNovedad&&row.horaNovedad){
   if(previous){accepted.push(Object.assign({},previous,{syncState:'pending'}));return;}
   const day=String(row.fechaNovedad||''),time=String(row.horaNovedad||'');
   const occurred=new Date(day+'T'+time+':00-05:00');
   if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!/^\d{2}:\d{2}$/.test(time)||!Number.isFinite(occurred.getTime()))throw new Error('Fecha u hora de novedad inválida.');
   const local=rules.localTime(occurred.toISOString());
   if(local.date!==day||local.time!==time)throw new Error('Fecha u hora de novedad inválida.');
   if(!asset||asset.deleted||patches.get(asset.id)?.deleted)throw new Error('El activo de la novedad ya no está disponible.');
   const base=choose_(patches.get(asset.id),asset);
   const current=profiles.get(asset.id)||rules.project(base,histories.get(asset.id)||{}).asset;
   const event=Object.assign({},row,{datedNovelty:true,occurredAt:occurred.toISOString()});
   delete event.assetBefore;delete event.assetAfter;
   if(limited)Object.assign(event,{registeredBy:auth.username,registeredByName:auth.name||auth.username});
   const updated=rules.applyDatedNovelty(current,event);
   event.historyOnly=!updated;
   if(updated){event.assetBefore=rules.snapshot(current);event.assetAfter=rules.snapshot(updated);}
   if(visor){delete event.estadoVisorAnterior;if(updated&&current.estadoVisor)event.estadoVisorAnterior=current.estadoVisor;}
   if(updated){
    updated.updatedAt=nextRevision_(base.updatedAt||base.createdAt);updated.syncState='pending';
    patches.set(asset.id,updated);profiles.set(asset.id,updated);
   }
   remember(event);return;
  }
  if(!limited){accepted.push(row);return;}
  const novelty=Object.assign({},row,{registeredBy:auth.username,registeredByName:auth.name||auth.username});
  accepted.push(novelty);
  const current=patches.get(asset.id)||asset;
  if(stamp_(row)>=stamp_(current)){
   const patch=Object.assign({},current,{ubicacion:row.ubicacion,estado:row.estado,updatedAt:row.updatedAt||row.createdAt,syncState:'pending'});
   if(visor)patch.estadoVisor=row.estadoVisor;
   patches.set(asset.id,patch);
  }
 });
 if(!limited&&!dated.length)return incoming;
 return Object.assign({},incoming,{novelties:accepted,assets:Array.from(patches.values())});
}

// Los auxiliares solo pueden agregar el cargo que acaban de buscar, sin coincidencias.
// La sincronización general sigue bloqueando cualquier escritura en inventoryCriteria.
function cargoNorm_(value){return String(value||'').trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ')}
function cargoCatalog_(cloud){
 const rows=Array.isArray(cloud.inventoryCriteria)?cloud.inventoryCriteria:[],record=rows.find(row=>row&&row.id==='SYSTEM-FORM-OPTIONS-V1')||rows.find(row=>row&&row.recordType==='formOptions'),supplied=record&&record.options&&record.options['personal.role'];
 return{record:record,values:Array.isArray(supplied)?supplied:['Operador minero','Operador de seguridad','Escolta','Machinero','Supervisor','No informado']};
}
function adminCargoSearch_(q,auth){
 const value=String(q.query||'').trim().replace(/\s+/g,' ');if(!value||value.length>120)throw new Error('Escribe un cargo de hasta 120 caracteres');
 const id=findFile_(),catalog=cargoCatalog_(id?readFile_(id):{}),matches=catalog.values.filter(item=>cargoNorm_(item).includes(cargoNorm_(value)));
 let searchToken='';
 if(!matches.length){searchToken=Utilities.getUuid();CacheService.getScriptCache().put('admin-cargo-search-'+searchToken,JSON.stringify({username:auth.username,value:value}),600)}
 return json_({ok:true,value:value,matches:matches,searchToken:searchToken});
}
function adminCargoAdd_(q,auth){
 const token=String(q.searchToken||'');if(!/^[a-f0-9-]{36}$/i.test(token))throw new Error('Primero busca el cargo que quieres agregar');
 const lock=LockService.getScriptLock();lock.waitLock(30000);
 try{
  const cache=CacheService.getScriptCache(),key='admin-cargo-search-'+token,raw=cache.get(key),search=raw?JSON.parse(raw):null;
  if(!search||search.username!==auth.username)throw new Error('La búsqueda venció. Busca nuevamente el cargo');
  const id=findFile_(),cloud=id?readFile_(id,lock):{},catalog=cargoCatalog_(cloud),value=search.value;
  if(catalog.values.some(item=>cargoNorm_(item).includes(cargoNorm_(value)))){cache.remove(key);throw new Error('Ya hay un cargo que coincide. Revisa la búsqueda')}
  const old=catalog.record||{},now=new Date().toISOString(),record=Object.assign({},old,{id:old.id||'SYSTEM-FORM-OPTIONS-V1',recordType:'formOptions',options:Object.assign({},old.options||{}, {'personal.role':catalog.values.concat([value])}),deleted:true,active:false,createdAt:old.createdAt||now,updatedAt:now,syncState:'synced'});
  const rows=Array.isArray(cloud.inventoryCriteria)?cloud.inventoryCriteria:[],index=rows.indexOf(catalog.record);
  if(index<0)rows.push(record);else rows[index]=record;
  cloud.inventoryCriteria=rows;cloud.updatedAt=now;writeFile_(id,cloud);cache.remove(key);
  return json_({ok:true,value:value,record:record});
 }finally{lock.releaseLock()}
}

// Valida el estado final del lote bajo el mismo bloqueo que escribe la base central.
function assetSerialKey_(value){const key=String(value??'').trim().toLowerCase();return key==='no aplica'?'':key;}
function assetUniqueSerialKey_(value){const key=assetSerialKey_(value);return /^(?:no registra|no trae(?: serial)?|no (?:es )?visible|sin serial|serial ilegible|ilegible|no tiene(?: serial)?)$/.test(key.replace(/\s+/g,' '))?'':key;}
function assetIdentityMark_(asset){return assetSerialKey_(asset.marcaPrevia||(!asset.markingPolicy?asset.marcaActual||asset.marcaInterna:''));}
function hasAssetIdentity_(asset,criterion){if(/^columnas?\b/i.test(String(asset.clase||'').trim())||criterion&&!truthy_(criterion.usesSerial??criterion.CI_USA_SERIAL))return true;const key=String(asset.serial??'').trim().toLowerCase().replace(/\s+/g,' ');return !!key&&!/^(?:no aplica|no trae serial|no es visible|sin serial|serial ilegible|ilegible|legible|no (?:es )?legible|no tiene(?: serial)?)$/.test(key);}
function assetCriterion_(criteria,asset){return (criteria||[]).find(item=>item&&!item.deleted&&item.active!==false&&truthy_(item.isFixedAsset??item.esActivoFijo??item.CI_ES_A_FIJO)&&cargoNorm_(item.name||item.nombre||item.elemento||item.CI_ELEMENTO)===cargoNorm_(asset.clase));}
function duplicateAssetIdentity_(rows,asset){
 const serial=assetUniqueSerialKey_(asset.serial),mark=assetIdentityMark_(asset),type=assetSerialKey_(asset.clase),mine=assetSerialKey_(asset.minaOrigen||asset.mina||'Sandra K');
 return rows.find(row=>row&&!row.deleted&&row.id!==asset.id&&((serial&&assetUniqueSerialKey_(row.serial)===serial)||(mark&&assetSerialKey_(row.clase)===type&&assetSerialKey_(row.minaOrigen||row.mina||'Sandra K')===mine&&[row.marcaPrevia,row.marcaActual,row.marcaInterna,row.nuevaMarca].some(value=>assetSerialKey_(value)===mark))))||null;
}
function validateAssetSerials_(cloudAssets,changes,criteria=[]){
 const previous=new Map((cloudAssets||[]).filter(Boolean).map(row=>[row.id,row])),final=new Map(previous);
 for(const row of changes||[])if(row&&row.id){const old=previous.get(row.id);final.set(row.id,old?.deleted?old:choose_(row,old));}
 for(const row of changes||[]){
  if(!row?.id)continue;
  const saved=final.get(row.id),old=previous.get(row.id),serial=assetUniqueSerialKey_(saved?.serial);
  if(saved?.deleted)continue;if(/^dad[oa](?:\/[oa])? de baja$/.test(cargoNorm_(saved.estado))){saved.ubicacion='Desechado/a';row.ubicacion='Desechado/a';saved.disponibleEntrega='No';row.disponibleEntrega='No';}
  if(!hasAssetIdentity_(saved,assetCriterion_(criteria,saved)))throw new Error('Ingresa el SERIAL real o «No registra». La marca anterior no reemplaza el serial.');
  if(!old||assetUniqueSerialKey_(old.serial)!==serial||assetIdentityMark_(old)!==assetIdentityMark_(saved)){
   const identityDuplicate=duplicateAssetIdentity_(Array.from(final.values()),saved);if(identityDuplicate)throw new Error('El activo ya existe: serial o marca anterior repetidos.');
  }
  if(!serial||old&&!old.deleted&&assetUniqueSerialKey_(old.serial)===serial)continue;
  const duplicate=Array.from(final.values()).find(other=>!other.deleted&&other.id!==row.id&&assetUniqueSerialKey_(other.serial)===serial);
  if(duplicate)throw new Error('El serial '+String(saved.serial).trim()+' ya existe en: '+[duplicate.clase,duplicate.numeroClase||duplicate.numeroYT,duplicate.marcaActual||duplicate.marcaInterna].filter(Boolean).join(' · ')+'.');
 }
}
function validateLastActaDeletion_(incoming,cloud,auth){
 const pending=(incoming.actas||[]).filter(row=>row&&row.syncState==='pending');
 const deletions=pending.filter(row=>row.deleted).sort((a,b)=>Number(b.consecutivo)-Number(a.consecutivo));
 if(!deletions.length)return;
 if(!isAdmin_(auth))throw new Error('Solo el administrador puede eliminar la última acta.');
 const finalRows=new Map((cloud.actas||[]).filter(row=>row&&row.id).map(row=>[row.id,row]));
 pending.filter(row=>!row.deleted).forEach(row=>finalRows.set(row.id,row));
 for(const row of deletions){
  const previous=finalRows.get(row.id);
  if(previous&&previous.deleted)continue;
  const active=Array.from(finalRows.values()).filter(x=>!x.deleted&&x.tipo!=='OFICIO');
  const last=active.sort((a,b)=>Number(b.consecutivo)-Number(a.consecutivo))[0];
  if(row.tipo==='OFICIO'||!previous||!last||last.id!==row.id)throw new Error('Solo puedes eliminar la última acta. Sincroniza para conocer el consecutivo más reciente.');
  finalRows.set(row.id,Object.assign({},previous,{deleted:true}));
 }
}

function validateActaStatus_(incoming,cloud,auth){
 const protectedKeys=['documentStatus','notCreatedReason','notCreatedAt'];
 for(const row of incoming.actas||[]){
  if(!row||row.syncState!=='pending'||row.deleted)continue;
  const old=(cloud.actas||[]).find(x=>x&&x.id===row.id);
  const specialMotive=String(row.motivo||'')==='NO SE REGISTRÓ';
  if(specialMotive&&(row.documentStatus!=='not_created'||row.tipo==='OFICIO'))throw new Error('El motivo «No se registró» solo corresponde a un acta no elaborada.');
  if(specialMotive&&String(old&&old.motivo||'')!=='NO SE REGISTRÓ'&&(!isAdmin_(auth)))throw new Error('Solo el administrador puede elegir el motivo «No se registró».');
  const changed=protectedKeys.some(key=>String(row[key]||'')!==String(old&&old[key]||''));
  if(changed&&(!isAdmin_(auth)))throw new Error('Solo el administrador puede cambiar el estado de elaboración del acta.');
  if(row.documentStatus==='not_created'){
   if(!old||row.tipo==='OFICIO'||!String(row.notCreatedReason||'').trim())throw new Error('Selecciona un acta registrada e indica por qué no fue elaborada.');
  }
  if(old&&old.documentStatus==='not_created'&&(row.documentStatus!=='not_created'||row.deleted||Number(row.consecutivo)!==Number(old.consecutivo)))throw new Error('El consecutivo del acta no elaborada se conserva y no puede reutilizarse.');
 }
}

function adminSync_(incoming,since,auth,productionVersions){
 function respond(central,reply){
  if(Array.isArray(productionVersions)&&isAdmin_(auth)){
   // Un problema en el libro de Producción no invalida un guardado confirmado en la base general.
   try{reply.productionBalances=adminProductionBalances_(central,productionVersions);}
   catch(error){reply.productionBalances={error:String(error.message||error)};}
  }
  return json_(reply);
 }
 const lock=LockService.getScriptLock();lock.waitLock(30000);
 try{
  const id=findFile_(),cloud=id?readFile_(id,lock):{},baseUpdatedAt=cloud.updatedAt||'',changes={},recovered=completePendingAssetMarks_(cloud);
  if(incoming && Object.prototype.hasOwnProperty.call(incoming,'workFrontReports'))throw new Error('Los reportes se sincronizan desde Frentes de trabajo.');
  validateLastActaDeletion_(incoming||{},cloud,auth);
  validateActaStatus_(incoming||{},cloud,auth);
  const editedAssets=new Set((incoming.assets||[]).filter(row=>row?.syncState==='pending').map(row=>row.id));
  incoming=prepareAdminNovelties_(incoming,cloud,auth);
  const hasPending=Object.keys(incoming||{}).some(name=>Array.isArray(incoming[name])&&incoming[name].some(x=>x&&x.id&&x.syncState==='pending'));
  if(!hasPending){
   if(recovered)writeFile_(id,cloud);
   if(!recovered&&since&&baseUpdatedAt===since)return respond(cloud,{ok:true,capabilities:collaboratorSyncCapabilities_(),notModified:true,updatedAt:baseUpdatedAt});
   return respond(cloud,{ok:true,capabilities:collaboratorSyncCapabilities_(),data:cloud,updatedAt:cloud.updatedAt||''});
  }
  Object.keys(incoming||{}).forEach(name=>{if(name==='schema'||name==='updatedAt'||!Array.isArray(incoming[name]))return;changes[name]=incoming[name].filter(x=>x&&x.id&&x.syncState==='pending').map(x=>Object.assign({},x,{syncState:'synced'}))});
  // Una solicitud de marca solo cambia la marcación. Un dispositivo atrasado no
  // puede reemplazar ubicación, serial u otros datos más recientes de la ficha.
  if(canManageAssets_(auth)&&changes.assets)changes.assets=changes.assets.map(row=>{
   if(row.markRequest!=='existing-v1'||row.markStatus!=='pending')return row;
   const old=(cloud.assets||[]).find(asset=>asset&&asset.id===row.id);
   if(!old)throw new Error('Sincroniza primero el activo registrado antes de solicitar su marca.');
   return Object.assign({},old,{markRequest:'existing-v1',markRequestedAt:old.markRequestedAt||row.markRequestedAt||new Date().toISOString(),markingPolicy:'letters-v1',markStatus:'pending',updatedAt:nextRevision_(old.updatedAt||old.createdAt),syncState:'synced'});
  });
  const numberingRows=(cloud.assets||[]).slice();for(const row of changes.assets||[]){if(row.classNumberPolicy==='auto-v1'&&automaticClassNumberEligible_(row.clase)&&!row.deleted){row.numeroClase=automaticClassNumber_(numberingRows,row);row.numeroYT=row.numeroClase;const index=numberingRows.findIndex(old=>old.id===row.id);if(index>=0)numberingRows[index]=row;else numberingRows.push(row)}}
  const criterionRows=new Map((cloud.inventoryCriteria||[]).map(row=>[row.id,row]));
  for(const row of changes.inventoryCriteria||[])criterionRows.set(row.id,choose_(row,criterionRows.get(row.id)));
  // Una novedad por sí sola no modifica el serial de una ficha histórica.
  validateAssetSerials_(cloud.assets||[],(changes.assets||[]).filter(row=>editedAssets.has(row.id)),Array.from(criterionRows.values()));
  const marking=assignAssetMarks_(cloud,changes.assets||[],auth);if(changes.assets)changes.assets=marking.assets;delete changes.assetMarkRegistry;delete changes.warehouseQuantityHistory;
  const merged=merge_(cloud,changes);if(marking.registry.length)merged.assetMarkRegistry=marking.registry;writeFile_(id,merged);
  if(!recovered&&since&&baseUpdatedAt===since&&!marking.changed&&!marking.assets.some(asset=>asset.markingPolicy==='letters-v1'))return respond(merged,{ok:true,capabilities:collaboratorSyncCapabilities_(),acknowledged:true,updatedAt:merged.updatedAt});
  return respond(merged,{ok:true,capabilities:collaboratorSyncCapabilities_(),data:merged,updatedAt:merged.updatedAt});
 }finally{lock.releaseLock()}
}

function plazaBalanceStamp_(stock,event){
 const stamp=nextRevision_(stock.plazaBalanceAt);
 stock.plazaBalanceAt=stamp;event.balanceAppliedAt=stamp;
}
function adjustmentRegistration_(q,auth,now){
 if(q.recordedBy&&String(q.recordedBy)!==String(auth.username))throw new Error('Este ajuste debe sincronizarse desde el perfil que lo registró.');
 return plazaRegistrationTime_(q.recordedAt,now);
}
function plazaRegistrationTime_(value,now){
 if(!value)return now;
 const time=Date.parse(value);
 if(!Number.isFinite(time)||time>Date.now()+300000)throw new Error('Hora de registro no válida.');
 return new Date(time).toISOString();
}
function adminSetInventoryQuantity_(q,auth){
 if(!['owner','admin','assistant'].includes(auth.role))throw new Error('Tu rol no permite editar cantidades.');
 const itemId=String(q.itemId||'').trim(),quantity=q.quantity;
 if(!itemId||typeof quantity!=='number'||!Number.isFinite(quantity)||quantity<0)
  throw new Error('Selecciona un elemento e indica una cantidad válida, cero o mayor.');
 const lock=LockService.getScriptLock();lock.waitLock(30000);
 try{
  const id=findFile_(),cloud=id?readFile_(id,lock):{};
  const item=(cloud.inventoryCriteria||[]).find(row=>row?.id===itemId);
  if(!item||item.deleted||item.active===false||item.recordType==='formOptions'||
     item.id==='SYSTEM-FORM-OPTIONS-V1'||truthy_(item.isYtSpare)||
     truthy_(item.isFixedAsset??item.esActivoFijo??item.CI_ES_A_FIJO))
   throw new Error('Este criterio no permite editar la cantidad.');
  const stocks=Array.isArray(cloud.inventoryStock)?cloud.inventoryStock:[];
  const current=stocks.find(row=>row?.itemId===itemId);
  if(current&&(current.deleted||current.active===false))throw new Error('La existencia fue retirada.');
  const revision=current?.updatedAt||current?.createdAt||'';
  if(current&&Number(current.quantity)===quantity)return json_({ok:true,stock:current});
  if(q.stockRevision!==revision)throw new Error('La cantidad cambió en la base central. Sincroniza y vuelve a seleccionar el elemento.');
  const before=Number(current?.quantity||0),updatedAt=nextRevision_(revision);
  const recordedAt=adjustmentRegistration_(q,auth,updatedAt);
  const stock=Object.assign(current||{id:'stock-'+itemId,itemId,active:true,initialQuantity:quantity,
   initialRecordedAt:updatedAt,createdAt:updatedAt},{quantity,updatedAt,syncState:'synced'});
  if(!current)stocks.push(stock);
  const adjustment={id:'adjust-'+itemId+'-'+updatedAt,kind:'quantity_adjustment',itemId,itemName:item.name||item.CI_ELEMENTO,
   quantity:Math.abs(quantity-before),delta:quantity-before,balanceBefore:before,balanceAfter:quantity,
   recordedBy:auth.username,recordedByName:auth.name||auth.username,recordedByRole:auth.role,registrationClock:q.recordedAt?'device':'central',recordedAt,createdAt:recordedAt,syncedAt:updatedAt,status:'synced'};
  plazaBalanceStamp_(stock,adjustment);
  (cloud.warehouseQuantityHistory||(cloud.warehouseQuantityHistory=[])).push(adjustment);
  cloud.inventoryStock=stocks;
  cloud.updatedAt=nextRevision_(cloud.updatedAt);
  writeFile_(id,cloud);
  return json_({ok:true,stock,adjustment});
 }finally{lock.releaseLock()}
}

// Los dos botones de Admin conservan los libros de cada bodega y sus propios recibos.
function adminWarehouseQuantity_(q,auth){
 const production=q.warehouse==='production',write=q.mode==='set';
 if(!['plaza','production'].includes(q.warehouse)||!['get','set'].includes(q.mode))throw new Error('Solicitud de cantidad no válida.');
 if(!isAdmin_(auth)&&(production||auth.role!=='assistant'))throw new Error('Tu rol no permite editar cantidades de esta bodega.');
 if(write&&(!Number.isFinite(q.quantity)||q.quantity<0||typeof q.stockRevision!=='string'||!Number.isFinite(q.observedQuantity)||
   !/^[-.a-zA-Z0-9]{12,110}$/.test(q.operationId||'')))throw new Error('El ajuste de cantidad no es válido.');
 const lock=LockService.getScriptLock();lock.waitLock(30000);
 try{
  const centralId=findFile_(),central=centralId?readFile_(centralId,lock):{};
  const item=(central.inventoryCriteria||[]).find(row=>row.id===q.itemId);
  if(!item||item.deleted||item.active===false||item.recordType==='formOptions'||item.id==='SYSTEM-FORM-OPTIONS-V1'||
    truthy_(item.isFixedAsset??item.esActivoFijo??item.CI_ES_A_FIJO)||(!isAdmin_(auth)&&truthy_(item.isYtSpare))||
    (production&&productionWarehouseEpp_(item)))throw new Error('Este criterio no permite editar la cantidad en esta bodega.');
  if(production&&!productionWarehouseSettings_().enabled)throw new Error('La Bodega de Producción aún no está activada.');
  if(write&&(truthy_(item.isYtSpare)||production&&!truthy_(item.fractionable))&&!Number.isSafeInteger(q.quantity))
   throw new Error('El criterio requiere una cantidad entera.');
  let file,book=central,changed=false;
  if(production){
   file=productionDataFile_();book=productionReadData_(file);
   changed=productionImportPlaza_(book,central);
  }
  const stocks=central.inventoryStock||(central.inventoryStock=[]);
  const plazaStock=production?null:stocks.find(row=>row.itemId===item.id);
  if(plazaStock&&(plazaStock.deleted||plazaStock.active===false))throw new Error('La existencia fue retirada.');
  const ledger=production?(book.warehouseMovements||[]):(central.warehouseQuantityHistory||[]);
  const before=production?productionWarehouseBalance_(book,item,central):Number(plazaStock?.quantity||0);
  const last=production?ledger.filter(row=>row.itemId===item.id).at(-1):null;
  const revision=production?String(last?.revision||0)+'|'+before:(plazaStock?.updatedAt||plazaStock?.createdAt||'');
  let stock=production?{id:item.id,itemId:item.id,quantity:before,updatedAt:revision}:plazaStock||{id:'stock-'+item.id,itemId:item.id,quantity:0,updatedAt:''};
  const now=new Date().toISOString(),signature=JSON.stringify([q.warehouse,item.id,q.quantity,q.stockRevision,q.observedQuantity]);
  let adjustment=write&&ledger.find(row=>row.id===q.operationId);
  const previous=adjustment;
  if(previous&&previous.requestSignature!==signature)throw new Error('El identificador ya corresponde a otro ajuste.');
  if(write&&!previous){
   if(revision!==q.stockRevision||before!==q.observedQuantity)throw new Error('La cantidad cambió en la base central. Revisa el saldo de esta bodega antes de volver a guardar.');
   const delta=q.quantity-before,date=Utilities.formatDate(new Date(),'America/Bogota','yyyy-MM-dd');
   const event={id:q.operationId,kind:'quantity_adjustment',itemId:item.id,itemName:item.name||item.CI_ELEMENTO,unit:item.unit,
    quantity:Math.abs(delta),delta,balanceBefore:before,balanceAfter:q.quantity,recordedBy:auth.username,recordedByName:auth.name||auth.username,
    recordedAt:now,createdAt:now,fechaISO:date,status:'synced',requestSignature:signature};
   if(production){
    const spare=productionSpare_(item,central);
    const saved=productionWarehouseAppend_(book,event);
    if(spare&&delta){
     // Usa los mismos movimientos inmutables de entrada/salida que entienden los clientes de Mecánica instalados.
     (book.incomes||(book.incomes=[])).push({id:'warehouse-'+event.id,...spare,kind:delta>0?'warehouse-return':'warehouse-out',
      cantidad:Math.abs(delta),fechaISO:date,createdAt:now,recordedAt:now,sourceCreatedAt:now,sourceWarehouseMovementId:event.id,
      source:'admin-quantity',registradoPor:auth.username,registradoPorNombre:event.recordedByName});
    }
    const actual=productionWarehouseBalance_(book,item,central);
    if(Math.abs(actual-q.quantity)>1e-9)
     throw new Error('El ajuste no coincide con el saldo vigente de Producción.');
    stock={...stock,quantity:actual,updatedAt:saved.revision+'|'+actual};
   }else{
    stock=Object.assign(plazaStock||{id:stock.id,itemId:item.id,createdAt:now,initialQuantity:q.quantity,initialRecordedAt:now,active:true},
     {quantity:q.quantity,updatedAt:nextRevision_(revision),syncState:'synced'});
    if(!plazaStock)stocks.push(stock);
    const recordedAt=adjustmentRegistration_(q,auth,now);
    Object.assign(event,{recordedByRole:auth.role,registrationClock:q.recordedAt?'device':'central',recordedAt,createdAt:recordedAt,syncedAt:now});
    plazaBalanceStamp_(stock,event);adjustment=event;
    (central.warehouseQuantityHistory||(central.warehouseQuantityHistory=[])).push(event);
    central.updatedAt=nextRevision_(central.updatedAt);
   }
   changed=true;
  }
  if(changed){if(production)productionSaveData_(file,book);else writeFile_(centralId,central);}
  return json_({ok:true,warehouse:q.warehouse,stock:{...stock,sampledAt:now},...(write&&!production?{adjustment}:{}),...(write?{operationId:q.operationId,status:previous?'already-applied':'accepted'}:{})});
 }finally{lock.releaseLock()}
}

function adminReverseMovement_(q){
 const type=q.type==='delivery'?'blendingDeliveries':q.type==='income'?'blendingIncomes':'';
 if(!type)throw new Error('Tipo de movimiento no válido');
 const movementId=String(q.movementId||'').trim(),requestedBy=String(q.reversalRequestedBy||'').trim();
 if(!movementId)throw new Error('Falta identificar el movimiento');
 if(!requestedBy||requestedBy.length>200)throw new Error('Indica quién solicitó la reversión (máximo 200 caracteres)');
 const lock=LockService.getScriptLock();lock.waitLock(30000);
 try{
  const id=findFile_(),cloud=id?readFile_(id,lock):{},rows=Array.isArray(cloud[type])?cloud[type]:[],row=rows.find(x=>x&&x.id===movementId&&!x.deleted);
  if(!row)throw new Error('El movimiento no existe en la base central');
  if(row.movementType==='REVERSIÓN'||row.reversalOf)throw new Error('No se puede revertir un movimiento de reversión');
  const existing=rows.find(x=>x&&x.movementType==='REVERSIÓN'&&x.reversalOf===movementId);
  // Un reintento devuelve el mismo reintegro, incluso si se perdió la respuesta.
  if(existing)return json_({ok:true,alreadyApplied:true,data:cloud,movement:existing});
  if(row.reversed===true||row.reversado===true)throw new Error('Este movimiento ya fue reversado');
  if(row.movementType==='DEVOLUCIÓN'||cargoNorm_(row.deliveryType)==='prestamo')throw new Error('Los préstamos se cierran desde Retorno de elementos; no se revierten como entregas.');
  if(type==='blendingDeliveries'&&productionTransferImported_(row.id))throw new Error('Este traslado ya ingresó a Producción. Registra una devolución desde Bodega de Producción para conservar ambas existencias.');
  if(row.assetId)throw new Error('La reversión de activos fijos requiere restaurar también su ubicación y no está habilitada en esta operación');
  const qty=Number(row.quantity);
  if(!Number.isFinite(qty)||!(qty>0)||!row.itemId)throw new Error('El movimiento no tiene cantidad válida');
  const stockRows=Array.isArray(cloud.inventoryStock)?cloud.inventoryStock:(cloud.inventoryStock=[]),stock=stockRows.find(x=>x&&x.itemId===row.itemId),current=Number(stock?.quantity)||0,delta=type==='blendingDeliveries'?qty:-qty,next=current+delta;
  if(next<0)throw new Error('No se puede revertir el ingreso: las existencias actuales son menores que la cantidad a descontar');
  if(!Number.isFinite(next))throw new Error('Las existencias actuales no tienen un saldo válido');
  const now=new Date().toISOString(),registered=plazaRegistrationTime_(q.recordedAt,now),reversalId='REV-'+q.type+'-'+movementId;
  if(rows.some(x=>x&&x.id===reversalId))throw new Error('El identificador de reversión ya existe. Sincroniza antes de continuar.');
  // Se conserva el detalle y el bodeguero del original; no se registra al ejecutor.
  const reversal=Object.assign({},row,{id:reversalId,syncEventId:reversalId,movementType:'REVERSIÓN',reversalOf:movementId,reversalSource:q.type,originalCreatedAt:row.createdAt||row.updatedAt,reversalRequestedBy:requestedBy,quantity:qty,stockDelta:delta,balanceBefore:current,balanceAfter:next,recordedAt:registered,createdAt:registered,syncedAt:now,updatedAt:now,syncState:'synced'});
  ['reversed','reversado','reversedAt','reversedBy','reversalMovementId','reversalBalanceBefore','reversalBalanceAfter','syncError'].forEach(key=>delete reversal[key]);
  const target=stock||{id:'stock-'+row.itemId,itemId:row.itemId,quantity:0};
  plazaBalanceStamp_(target,reversal);
  target.quantity=next;target.updatedAt=now;if(!stock)stockRows.push(target);
  // Los saldos y la fecha original quedan intactos. No se recorre el historial.
  Object.assign(row,{reversed:true,reversado:true,reversedAt:registered,reversalRequestedBy:requestedBy,reversalMovementId:reversalId,reversalBalanceBefore:current,reversalBalanceAfter:next,updatedAt:now});
  rows.push(reversal);cloud[type]=rows;cloud.updatedAt=nextRevision_(cloud.updatedAt);
  writeFile_(id,cloud);
  return json_({ok:true,data:cloud,movement:reversal});
 }finally{lock.releaseLock()}
}

function adminDeleteMovement_(){throw new Error('Los movimientos se conservan en el historial. Utiliza REVERTIR para corregir las existencias.');}

function plazaAccessRole_(role){
  switch(String(role||'').trim().toLowerCase().replace(/^plaza_/,'')){
    case 'assistant': case 'auxiliar': return 'assistant';
    case 'supervisor': case 'supervisor/a': return 'supervisor';
    case 'admin': case 'administrador': return 'admin';
    default: return 'operator';
  }
}
function plazaSessionRole_(person){return 'plaza_'+plazaAccessRole_(person.plazaRole)}
function plazaChangeActiveRole_(q){
  if(!['operator','assistant','admin'].includes(q.role))throw new Error('Selecciona un rol de Plaza válido.');
  const lock=LockService.getScriptLock();lock.waitLock(30000);
  try{
    const file=findFile_(),cloud=readFile_(file,lock);
    const person=(cloud.personal||[]).find(p=>p.id===q.personId&&!p.deleted);
    if(!person||!person.plazaEnabled||!person.pinHash)throw new Error('La cuenta ya no está activa en Plaza.');
    const role=plazaAccessRole_(person.plazaRole);
    if(role!==q.role){
      if(role!==q.previousRole)throw new Error('El rol cambió. Sincroniza y vuelve a seleccionar al colaborador.');
      const now=nextRevision_(cloud.updatedAt);
      const document=String(person.documento||'').trim();
      if(!document)throw new Error('La cuenta necesita un documento.');
      revokeInvitations_('plaza',document);
      (cloud.personal||[]).filter(p=>!p.deleted&&p.plazaEnabled&&p.pinHash&&String(p.documento||'').trim()===document)
        .forEach(p=>{p.plazaRole=q.role;p.updatedAt=now});
      cloud.updatedAt=now;writeFile_(file,cloud);
    }
    return json_({ok:true,personId:person.id,plazaRole:q.role,updatedAt:person.updatedAt});
  }finally{lock.releaseLock()}
}
function plazaAccount_(cloud,auth){
  const person=(cloud.personal||[]).find(row=>row&&!row.deleted&&String(row.documento||'').trim()===auth.document&&row.plazaEnabled===true&&row.pinHash);
  if(!person)throw new Error('La cuenta ya no tiene acceso a Plaza Blending');
  return {...auth,role:plazaSessionRole_(person)};
}
function plazaLogin_(q){
 if(String(q.document||'').trim().toLowerCase()==='admin')return entryLogin_('plaza',q.pin);
const document=String(q.document||'').trim(),pin=String(q.pin||'');if(!document||!pin)throw new Error('Documento y contraseña son obligatorios');const id=findFile_(),cloud=id?readFile_(id):{},person=(cloud.personal||[]).find(x=>String(x.documento||'').trim()===document&&!x.deleted);if(!person||person.plazaEnabled!==true||!person.pinHash)throw new Error('Usuario no habilitado para Plaza Blending');if(!safeEqual_(String(person.pinHash),hashPin_(document,pin)))throw new Error('Contraseña incorrecta');const role=plazaSessionRole_(person),expires=Date.now()+12*60*60*1000,payload=[document,role,expires].join('|'),token=Utilities.base64EncodeWebSafe(payload)+'.'+sign_(payload);return json_({ok:true,token,user:{id:person.id,documento:document,nombre:person.nombre||'',role:role},expiresAt:new Date(expires).toISOString()})}
function applyPlazaLoanReturn_(row,asset,movements,cloud,auth){
  const valid=entry=>entry&&!entry.deleted&&!entry.reversed&&!entry.reversado;
  const loan=movements.find(entry=>valid(entry)&&entry.id===row.loanId&&entry.movementType!=='DEVOLUCIÓN');
  if(!loan||cargoNorm_(loan.deliveryType)!=='prestamo')throw new Error('No existe un préstamo válido para esta devolución');
  if(productionTransferImported_(loan.id))throw new Error('El préstamo está en Producción. Registra allí ENVIAR A PLAZA para cerrar el traslado sin duplicar existencias.');
  if(String(loan.assetId||'')!==String(row.assetId||'')||loan.itemId!==row.itemId||Number(row.quantity)!==Number(loan.quantity)||!Number.isFinite(Number(loan.quantity))||!(Number(loan.quantity)>0))throw new Error('El retorno debe corresponder al elemento y a la cantidad total del préstamo');
  if(movements.some(entry=>valid(entry)&&entry.movementType==='DEVOLUCIÓN'&&entry.loanId===loan.id))throw new Error('Este préstamo ya fue devuelto. Sincroniza para consultar la devolución registrada.');
  if(loan.assetId){
    if(!asset||Number(row.quantity)!==1)throw new Error('El activo prestado no existe o tiene una cantidad inválida');
    const latest=movements.filter(entry=>valid(entry)&&entry.assetId===asset.id).slice(-1)[0];
    if(latest?.id!==loan.id||cargoNorm_(asset.ubicacion)==='bodega de superficie'||cargoNorm_(asset.ubicacion)!==cargoNorm_(loan.destination||'Operación'))throw new Error('El activo tiene otro movimiento o ubicación. Revisa el préstamo antes de devolverlo.');
  }
  const person=(cloud.personal||[]).find(entry=>entry.id===row.returnedById&&!entry.deleted);
  if(!person)throw new Error('Selecciona quién devuelve los elementos');
  const date=new Date(row.returnedAt),now=new Date();
  if(!Number.isFinite(date.getTime())||date.getTime()>now.getTime()+300000||date.getTime()<Math.floor(Date.parse(loan.createdAt)/60000)*60000)throw new Error('Fecha de devolución no válida');
  const operator=(cloud.personal||[]).find(entry=>String(entry.documento||'')===String(auth.document)&&!entry.deleted);
  Object.assign(row,{recipientId:loan.recipientId,returnedAt:date.toISOString(),returnedByName:person.nombre||'',returnedByDocument:person.documento||'',operatorId:operator?.id||'',operatorName:operator?.nombre||'',operatorDocument:auth.document,destination:'Bodega de Superficie'});
  delete row.deliveryType;
  row.unit=loan.unit||'Unidad';
  if(asset)asset.ubicacion='Bodega de Superficie';
}
// Cada grupo conserva atomicidad; un error no impide confirmar otros grupos.
// El protocolo es optativo para no enviar resultados parciales a clientes antiguos.
function plazaPendingGroups_(incoming){
  const groups=new Map(),assets=(incoming.assets||[]).filter(row=>row&&row.syncState==='pending'),attached=new Set();
  PLAZA_WRITE.forEach(name=>{
    (Array.isArray(incoming[name])?incoming[name]:[]).filter(row=>row&&row.syncState==='pending').forEach(row=>{
      const key=name+':'+(row.syncEventId||row.id||'missing');
      if(!groups.has(key))groups.set(key,{assets:[],blendingIncomes:[],blendingDeliveries:[]});
      const group=groups.get(key);group[name].push(row);
      assets.filter(asset=>asset.id===row.assetId).forEach(asset=>{if(!group.assets.some(entry=>entry.id===asset.id))group.assets.push(asset);attached.add(asset.id)});
    });
  });
  assets.filter(asset=>!attached.has(asset.id)).forEach(asset=>groups.set('asset:'+asset.id,{assets:[asset],blendingIncomes:[],blendingDeliveries:[]}));
  const ordered=Array.from(groups.values());
  if(ordered.some(group=>group.blendingDeliveries.some(row=>row.exitKind==='mine'))){
    const time=group=>{
      const row=group.blendingDeliveries[0]||group.blendingIncomes[0]||group.assets[0];
      return Date.parse(row.recordedAt||row.createdAt)||0;
    };
    ordered.sort((left,right)=>time(left)-time(right));
    // El alta y su primera salida pueden sincronizarse juntas con la ficha local ya trasladada.
    const mineAssets=new Set(ordered.flatMap(group=>group.blendingDeliveries.filter(row=>row.exitKind==='mine').map(row=>row.assetId)));
    for(const group of ordered)group.assets=group.assets.map(asset=>{
      const initial=asset.registeredFrom==='plaza-income'&&mineAssets.has(asset.id)&&group.blendingIncomes.find(row=>row.assetId===asset.id&&row.createdAt===asset.createdAt);
      if(!initial)return asset;
      const owner=initial.incomeType==='REPARACIÓN'?initial.originMine:'Sandra K';
      return {...asset,mina:owner,activoExterno:!sandraKMine_(owner),estado:'Operativo/a',ubicacion:'Bodega de Superficie'};
    });
  }
  return ordered;
}
function validatePlazaExit_(row,name,cloud,asset){
 if(!row.exitKind)return; // Los registros anteriores mantienen su interpretación original.
 if(name!=='blendingDeliveries'||row.movementType||!['delivery','mine','warehouse'].includes(row.exitKind))throw new Error('Tipo de salida no válido.');
 const item=(cloud.inventoryCriteria||[]).find(entry=>entry.id===row.itemId&&!entry.deleted&&entry.active!==false);
 const fixed=truthy_(item?.isFixedAsset??item?.esActivoFijo??item?.fixedAsset??item?.CI_ES_A_FIJO);
 if(row.exitKind==='delivery'){
  if(!item||fixed||row.assetId||row.destinationWarehouseId||row.destination)throw new Error('Entregas solo admite elementos de consumo para un funcionario.');
  return;
 }
 if(row.exitKind==='warehouse'){
  const settings=productionWarehouseSettings_();
  if(!settings.enabled||String(row.createdAt)<settings.transferStartAt)throw new Error('Producción no está habilitada para la fecha del traslado.');
  if(!item||productionWarehouseEpp_(item)||row.destinationWarehouseId!=='production'||row.deliveryType!=='TRASLADO A BODEGAS')throw new Error('Traslado a bodega no válido.');
  if(fixed!==Boolean(row.assetId)||fixed&&(!asset||Number(row.quantity)!==1)||(!truthy_(item.fractionable)||item.isYtSpare)&&!Number.isSafeInteger(Number(row.quantity)))throw new Error('Cantidad o activo no válido para Producción.');
  if(fixed&&(cargoNorm_(asset.clase)!==cargoNorm_(item.name||item.nombre||item.elemento||item.CI_ELEMENTO)||productionWarehouseRetired_(asset)))throw new Error('El activo no está habilitado para este traslado.');
  if(item.isYtSpare)productionSpare_(item,cloud);
  row.destination='Producción';return;
 }
 if(!asset||asset.deleted||Number(row.quantity)!==1||/auto[\s-]*r{1,2}escatador/.test(cargoNorm_(asset.clase))||
    /dad[oa](?:\/a)? de baja|retirad[oa]|desechad[oa]/.test(cargoNorm_([asset.estado,asset.ubicacion].join(' '))))throw new Error('Activo no habilitado para salir de mina.');
 const options=(cloud.inventoryCriteria||[]).find(entry=>entry.id==='SYSTEM-FORM-OPTIONS-V1'||entry.recordType==='formOptions');
 const mines=options?.options?.['asset.owner']||['Sandra K','Providencia','El Silencio','Carla','Alianza'];
 const mine=row.destinationMine,owner=String(asset.mina||asset.minaOrigen||'').trim(),key=value=>cargoNorm_(value).replace(/[.\s-]/g,'');
 if((mine!=='Segovia'&&!mines.includes(mine))||sandraKMine_(mine)||row.destinationWarehouseId||
    !['TRASLADO','PRÉSTAMO','RETORNO','SALIDA A REPARACIÓN'].includes(row.deliveryType))throw new Error('Selecciona un destino y un tipo de operación válido.');
 if(mine==='Segovia'&&row.deliveryType!=='SALIDA A REPARACIÓN')throw new Error('A Segovia solo se puede registrar una salida a reparación.');
 if(row.deliveryType==='SALIDA A REPARACIÓN'&&mine!=='Segovia')throw new Error('La salida a reparación es exclusiva de Segovia.');
 if(row.deliveryType==='RETORNO'&&key(owner)!==key(mine))throw new Error(owner?'Solo puedes retornar este activo a su mina propietaria: '+owner+'.':'Falta registrar la mina propietaria de este activo antes de retornarlo.');
 if(cargoNorm_(asset.ubicacion)!=='bodega de superficie')throw new Error('No se le ha dado ingreso a Plaza Blending.');
 row.destination=mine==='Segovia'?mine:'Mina '+mine;row.ownerMineBefore=owner;
 if(row.deliveryType==='TRASLADO'&&mine!=='Segovia'){asset.mina=mine;asset.activoExterno=true;}
 if(row.deliveryType==='SALIDA A REPARACIÓN')asset.estado='En reparación';
 asset.ingresoTemporal=false;asset.asignadaId='';asset.areaAsignada='';
}
function receivePlazaAsset_(row,asset,cloud){
  const location=String(asset.ubicacion||'').trim();
  delete row.receivedFromProduction;
  if(productionWarehouseLocation_(location)||/^(?:inventario de |bodega de )?produccion ·/.test(cargoNorm_(location))){
    row.receivedFromProduction=location;
  }else if(cargoNorm_(location)==='bodega de superficie'){
    // Un traslado enviado desde Producción ya tiene su propio ingreso o devolución en Plaza.
    const last=createAssetHistory().timeline(cloud,asset.id).find(event=>!event.reversed&&
      (event.kind!=='novelty'||(!event.raw.historyOnly&&event.raw.ubicacion)));
    if(last&&(last.raw.receivedFromProduction||(last.raw.sourceWarehouseId==='production'&&last.raw.sourceMovementId))){
      throw new Error('Ya existe un ingreso de este activo desde Producción. Revisa su historial en Plaza antes de registrar otro.');
    }
  }
  applyPlazaIncomeContext_(row,asset);
  asset.ubicacion='Bodega de Superficie';
}
function applyPlazaChanges_(cloud,incoming,auth){
    const allowed={},stock=new Map((cloud.inventoryStock||[]).filter(x=>x&&x.itemId).map(x=>[x.itemId,Object.assign({},x)])),cloudAssets=Array.isArray(cloud.assets)?cloud.assets:[],pendingAssets=(Array.isArray(incoming.assets)?incoming.assets:[]).filter(x=>x&&x.id&&x.syncState==='pending'),assetIds=new Set(cloudAssets.map(x=>x.id).filter(Boolean)),acceptedAssets=[];
    pendingAssets.forEach(input=>{if(assetIds.has(input.id)){const existing=cloudAssets.find(asset=>asset.id===input.id);if(existing&&existing.markingPolicy==='letters-v1'&&existing.markStatus==='pending'&&usesAutomaticAssetMark_(existing))acceptedAssets.push(Object.assign({},existing));return;}const asset=stampActor_(input,auth);if(asset.classNumberPolicy==='auto-v1'&&automaticClassNumberEligible_(asset.clase)){asset.numeroClase=automaticClassNumber_(cloudAssets.concat(acceptedAssets),asset);asset.numeroYT=asset.numeroClase;}const criterion=(cloud.inventoryCriteria||[]).find(item=>item&&item.id===asset.criteriaId&&!item.deleted&&item.active!==false);if(!criterion||!truthy_(criterion.isFixedAsset??criterion.esActivoFijo??criterion.CI_ES_A_FIJO))throw new Error('La clase seleccionada no está configurada como activo fijo');preparePlazaIncomeAsset_(asset);if(!hasAssetIdentity_(asset,criterion))throw new Error('Ingresa el SERIAL real o «No registra». La marca anterior no reemplaza el serial.');const required=[['usesSerial','serial','serial'],['usesLength','largo','largo'],['usesModel','modelo','modelo'],['usesManufacturer','fabricante','fabricante'],['requiresInternalMark','marcaInterna','marca interna']];if(!String(asset.numeroClase||asset.numeroYT||'').trim())throw new Error('Falta el número de clase del activo');required.forEach(rule=>{if(!['serial','marcaInterna'].includes(rule[1])&&truthy_(criterion[rule[0]])&&!(rule[1]==='marcaInterna'&&asset.markingPolicy==='letters-v1'&&usesAutomaticAssetMark_(asset))&&!String(asset[rule[1]]||'').trim())throw new Error('Falta '+rule[2]+' del activo')});const className=String(asset.clase||'').trim().toLowerCase(),number=String(asset.numeroClase||asset.numeroYT||'').trim().toLowerCase(),serial=assetUniqueSerialKey_(asset.serial),mark=String(asset.marcaInterna||asset.marcaActual||'').trim().toLowerCase(),duplicate=cloudAssets.concat(acceptedAssets).find(row=>row&&!row.deleted&&String(row.clase||'').trim().toLowerCase()===className&&((serial&&assetUniqueSerialKey_(row.serial)===serial)||(number&&String(row.numeroClase||row.numeroYT||'').trim().toLowerCase()===number)||(mark&&String(row.marcaInterna||row.marcaActual||'').trim().toLowerCase()===mark)));if(duplicate)throw new Error('El activo ya existe en la tabla de Activos fijos');asset.ubicacion='Bodega de Superficie';asset.syncState='synced';acceptedAssets.push(asset);assetIds.add(asset.id)});
    validateAssetSerials_(cloud.assets||[],acceptedAssets,cloud.inventoryCriteria||[]);const marking=assignAssetMarks_(cloud,acceptedAssets);
    if(marking.assets.length)allowed.assets=marking.assets;
    const markedIds=new Set(marking.assets.map(asset=>asset.id)),workingAssets=cloudAssets.filter(asset=>!markedIds.has(asset.id)).concat(marking.assets),workingDeliveries=(cloud.blendingDeliveries||[]).slice();
    PLAZA_WRITE.forEach(name=>{
      const existingRows=(cloud[name]||[]).filter(Boolean),existing=new Set(existingRows.map(x=>x.id).filter(Boolean));
      const seenIncomingIds=new Set();
      const pending=(Array.isArray(incoming[name])?incoming[name]:[]).filter(x=>x&&x.syncState==='pending');
      allowed[name]=pending.filter(x=>{
        if(!x.id)throw new Error('Movimiento sin identificador');
        if(existing.has(x.id)||seenIncomingIds.has(x.id))return false;
        seenIncomingIds.add(x.id);
        return true;
      }).map(x=>{
        const row=stampActor_(x,auth),qty=Number(row.quantity);
        validatePlazaMovementTime_(row,auth);
        stampPlazaShift_(row,cloud,auth);
        if(row.movementType==='REVERSIÓN'||row.reversalOf)throw new Error('Las reversiones se registran desde SK Web Admin');
        delete row.syncError;
        if(!Number.isFinite(qty)||!(qty>0)||!row.itemId)throw new Error('Movimiento incompleto');
        validatePlazaExit_(row,name,cloud,row.assetId&&workingAssets.find(asset=>asset.id===row.assetId));
        const isReturn=row.movementType==='DEVOLUCIÓN';
        if(isReturn&&(name!=='blendingDeliveries'||!row.loanId))throw new Error('Retorno de elementos incompleto');
        if(row.bringsReplacement==='first-delivery'){
          const criterion=(cloud.inventoryCriteria||[]).find(item=>item?.id===row.itemId&&!item.deleted&&item.active!==false);
          const fixed=truthy_(criterion?.isFixedAsset??criterion?.esActivoFijo??criterion?.fixedAsset??criterion?.CI_ES_A_FIJO);
          if(name!=='blendingDeliveries'||isReturn||row.assetId||fixed||criterion?.isEpp!==true||
             cargoNorm_(row.deliveryType)==='prestamo')delete row.bringsReplacement;
        }
        if(name==='blendingDeliveries'&&!isReturn&&row.exitKind!=='mine'&&cargoNorm_(row.deliveryType)==='prestamo'){
          const criterion=(cloud.inventoryCriteria||[]).find(item=>item&&item.id===row.itemId&&!item.deleted&&item.active!==false);
          if(!criterion||!truthy_(criterion.allowLoan))throw new Error('El elemento no permite préstamos en Criterios de inventario');
          const fixed=truthy_(criterion.isFixedAsset??criterion.esActivoFijo??criterion.CI_ES_A_FIJO);
          if(fixed!==Boolean(row.assetId)||fixed&&qty!==1)throw new Error('Selecciona el activo específico que se va a prestar');
          if(!fixed&&!truthy_(criterion.fractionable)&&!Number.isInteger(qty))throw new Error('Este elemento se presta en cantidades enteras');
          if(fixed){const asset=workingAssets.find(entry=>entry&&entry.id===row.assetId);if(asset&&cargoNorm_(asset.clase)!==cargoNorm_(criterion.name||criterion.nombre||criterion.elemento||criterion.CI_ELEMENTO))throw new Error('El activo no corresponde al criterio autorizado para préstamo');}
          row.unit=criterion.unit||criterion.CI_UNIDAD_MEDIDA||'Unidad';
        }
        if(isReturn)applyPlazaLoanReturn_(row,workingAssets.find(asset=>asset&&asset.id===row.assetId&&!asset.deleted),workingDeliveries,cloud,auth);
        if(name==='blendingDeliveries'&&!isReturn&&row.exitKind!=='mine'){
          if(!row.recipientId)throw new Error('La entrega no tiene receptor confirmado');
          const recipient=(cloud.personal||[]).find(person=>person&&person.id===row.recipientId&&!person.deleted);
          if(!recipient)throw new Error('El colaborador receptor aún no está confirmado en la base central. Sincroniza primero Personal y vuelve a intentar la entrega.');
        }
        if(row.assetId){
          const asset=workingAssets.find(x=>x&&x.id===row.assetId&&!x.deleted);
          if(!asset)throw new Error('El activo seleccionado no existe');
          row.assetLabel=[asset.clase,(asset.numeroClase||asset.numeroYT)&&'N.º '+(asset.numeroClase||asset.numeroYT),asset.marcaActual||asset.marcaInterna,asset.serial&&'Serial '+asset.serial,asset.minaOrigen&&'Origen: '+asset.minaOrigen].filter(Boolean).join(' · ');
          if(isReturn)asset.ubicacion='Bodega de Superficie';
          else if(name==='blendingDeliveries'){
            if(String(asset.ubicacion||'').toLowerCase()!=='bodega de superficie')throw new Error('El activo ya no está disponible en Bodega de Superficie');
            asset.ubicacion=row.destination||'Operación';
          }else receivePlazaAsset_(row,asset,cloud);
          asset.updatedAt=new Date().toISOString();
        }else{
          const current=stock.get(row.itemId)||{id:'stock-'+row.itemId,itemId:row.itemId,quantity:0},balanceBefore=Number(current.quantity)||0,next=balanceBefore+(name==='blendingIncomes'||isReturn?qty:-qty);row.balanceBefore=balanceBefore;row.balanceAfter=next;
          if(next<0)throw new Error('La cantidad ingresada supera la disponibilidad');
          plazaBalanceStamp_(current,row);current.quantity=next;current.updatedAt=new Date().toISOString();stock.set(row.itemId,current);
        }
        row.syncState='synced';if(name==='blendingDeliveries')workingDeliveries.push(row);return row;
      }).filter(Boolean);
    });
    allowed.inventoryStock=Array.from(stock.values());
    const merged=merge_(cloud,allowed);if(marking.registry.length)merged.assetMarkRegistry=marking.registry;return merged;
}
function plazaSync_(q){
  const incoming=q.data||{},lock=LockService.getScriptLock();
  lock.waitLock(30000);
  try{
    const id=findFile_(),cloud=id?readFile_(id,lock):{},auth=verifyToken_(q.token,cloud),recovered=completePendingAssetMarks_(cloud);
    const names=['assets'].concat(PLAZA_WRITE),hasPending=names.some(name=>Array.isArray(incoming[name])&&incoming[name].some(row=>row&&row.syncState==='pending'));
    const protocol=q.syncProtocol==='plaza-receipts-v1',acknowledgements={assets:[],blendingIncomes:[],blendingDeliveries:[]};
    let merged=cloud,changed=recovered;
    if(hasPending){
      if(!protocol){merged=applyPlazaChanges_(JSON.parse(JSON.stringify(cloud)),incoming,auth);changed=true}
      else{
        const errors={assets:new Map(),blendingIncomes:new Map(),blendingDeliveries:new Map()};
        plazaPendingGroups_(incoming).forEach(group=>{
          try{merged=applyPlazaChanges_(JSON.parse(JSON.stringify(merged)),group,auth);changed=true}
          catch(error){names.forEach(name=>(group[name]||[]).forEach(row=>errors[name].set(row.id,String(error.message||error))))}
        });
        names.forEach(name=>{
          const before=new Set((cloud[name]||[]).map(row=>row.id)),after=new Set((merged[name]||[]).map(row=>row.id));
          (Array.isArray(incoming[name])?incoming[name]:[]).filter(row=>row&&row.syncState==='pending').forEach(row=>{
            acknowledgements[name].push(after.has(row.id)?{id:row.id,status:before.has(row.id)?'already-applied':'accepted'}:{id:row.id,status:'rejected',error:errors[name].get(row.id)||'No se confirmó este registro'});
          });
        });
      }
    }
    // No se emite ningún recibo de éxito antes de confirmar la escritura central.
    if(changed)writeFile_(id,merged);
    const receipt=protocol?{syncProtocol:'plaza-receipts-v1',acknowledgements:acknowledgements}:{};
    if(!hasPending&&!changed&&!q.includeQuantityHistory&&q.since&&merged.updatedAt===q.since)return json_(Object.assign({ok:true,notModified:true,updatedAt:merged.updatedAt,sessionRole:auth.role,capabilities:plazaIncomeCapabilities_()},receipt));
    const view={schema:merged.schema,updatedAt:merged.updatedAt};
    PLAZA_READ.forEach(name=>view[name]=Array.isArray(merged[name])?merged[name]:[]);view.personal=view.personal.map(row=>publicPerson_(row));
    return json_(Object.assign({ok:true,data:view,updatedAt:merged.updatedAt,sessionRole:auth.role,capabilities:plazaIncomeCapabilities_()},receipt));
  }finally{lock.releaseLock()}
}

function validatePlazaMovementTime_(row,auth){
  // Las colas anteriores a la fecha editable solo tienen createdAt.
  if(row.recordedAt===undefined)return;
  const recorded=Date.parse(row.recordedAt), occurred=Date.parse(row.createdAt);
  if(!Number.isFinite(recorded)||!Number.isFinite(occurred)||occurred>recorded||recorded>Date.now()+300000)
    throw new Error('Fecha y hora del movimiento no válidas.');
  if(occurred!==recorded&&!['plaza_assistant','plaza_supervisor','plaza_admin'].includes(auth.role))
    throw new Error('Solo los roles Auxiliar, Supervisor y Administrador de Plaza Blending pueden cambiar la fecha y la hora del movimiento.');
  if(row.movementType==='DEVOLUCIÓN'&&Date.parse(row.returnedAt)!==occurred)
    throw new Error('La fecha y la hora de devolución deben coincidir con las del movimiento.');
}
function stampPlazaShift_(row,cloud,auth){
  const keeperDocument=String(row.shiftKeeperDocument||'').trim();
  if(!keeperDocument&&auth.role!=='plaza_assistant'&&!row.shiftKeeperId&&!row.shiftKeeperName)return;
  if(!keeperDocument)throw new Error('Selecciona al bodeguero o bodeguera de turno');
  if(String(row.operatorDocument||'').trim()!==auth.document)throw new Error('Este movimiento debe sincronizarse con la cuenta que lo registró');
  const people=cloud.personal||[];
  const keeper=people.find(person=>person&&String(person.documento||'').trim()===keeperDocument&&!person.deleted)
    ||people.find(person=>person&&String(person.documento||'').trim()===keeperDocument);
  if(!keeper)throw new Error('El bodeguero de turno no figura en Personal');
  const operator=people.find(person=>person&&!person.deleted&&String(person.documento||'').trim()===auth.document);
  row.shiftKeeperId=keeper.id;
  row.shiftKeeperDocument=keeperDocument;
  row.shiftKeeperName=keeper.nombre||keeperDocument;
  row.operatorId=operator?.id||'';
  row.operatorDocument=auth.document;
  row.operatorName=operator?.nombre||auth.document;
}
function stampActor_(x,auth){if(!x||!x.id)throw new Error('Movimiento sin identificador');const out=Object.assign({},x);out.actorDocument=auth.document;out.actorRole=auth.role;delete out.pinHash;delete out.plazaEnabled;delete out.plazaRole;return out}
function truthy_(value){return value===true||['true','si','sí','1','yes'].indexOf(String(value||'').trim().toLowerCase())>=0}
function hashPin_(document,pin){const salt=PropertiesService.getScriptProperties().getProperty('SK_AUTH_SALT');if(!salt)throw new Error('Falta configurar SK_AUTH_SALT');return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,document+'|'+pin+'|'+salt,Utilities.Charset.UTF_8))}
function sign_(payload){const secret=PropertiesService.getScriptProperties().getProperty('SK_AUTH_SECRET');if(!secret)throw new Error('Falta configurar SK_AUTH_SECRET');return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(payload,secret))}
function verifyToken_(token,cloud){
 if(String(token||'').startsWith('sk2.'))return entryVerifySession_(token,'plaza',cloud);
const bits=String(token||'').split('.');if(bits.length!==2)throw new Error('Sesión no válida');const payload=Utilities.newBlob(Utilities.base64DecodeWebSafe(bits[0])).getDataAsString(),parts=payload.split('|');if(parts.length!==3||!safeEqual_(bits[1],sign_(payload))||Number(parts[2])<Date.now())throw new Error('La sesión venció');if(!['plaza_operator','plaza_supervisor','plaza_assistant','plaza_admin'].includes(parts[1]))throw new Error('Permiso no válido');return plazaAccount_(cloud,{document:parts[0],role:parts[1]})}
function safeEqual_(a,b){a=String(a);b=String(b);if(a.length!==b.length)return false;let n=0;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0}
function hex_(bytes){return bytes.map(x=>(x<0?x+256:x).toString(16).padStart(2,'0')).join('')}
function enablePlazaUser(document,pin,role){document=String(document||'').trim();pin=String(pin||'');if(!document||!pin)throw new Error('Documento y contraseña son obligatorios');const lock=LockService.getScriptLock();lock.waitLock(30000);try{const id=findFile_(),cloud=id?readFile_(id,lock):{},matches=(cloud.personal||[]).filter(x=>String(x.documento||'').trim()===document&&!x.deleted),person=matches[0];if(!person)throw new Error('El documento no existe en Personal');const now=nextRevision_(cloud.updatedAt),pinHash=hashPin_(document,pin),plazaRole=plazaAccessRole_(role??person.plazaRole);matches.forEach(x=>{x.plazaEnabled=true;x.plazaRole=plazaRole;x.pinHash=pinHash;x.updatedAt=now});cloud.personal=dedupePersonal_(cloud.personal||[]);cloud.updatedAt=now;writeFile_(id,cloud);return 'Usuario de Plaza Blending habilitado: '+document}finally{lock.releaseLock()}}
function plazaUserAdmin_(q){const document=String(q.document||'').trim(),enabled=q.enabled===true,pin=String(q.pin||'');if(!document)throw new Error('Selecciona un colaborador');const lock=LockService.getScriptLock();lock.waitLock(30000);try{const id=findFile_(),cloud=id?readFile_(id,lock):{},matches=(cloud.personal||[]).filter(x=>String(x.documento||'').trim()===document&&!x.deleted),person=matches[0];if(!person)throw new Error('El colaborador no existe en la base central');const now=nextRevision_(cloud.updatedAt),role=plazaAccessRole_(q.role??person.plazaRole),existingHash=matches.map(x=>x.pinHash).find(Boolean),pinHash=pin?hashPin_(document,pin):existingHash;if(enabled&&!pinHash)throw new Error('Escribe una contraseña para habilitar el acceso');matches.forEach(x=>{if(enabled){x.pinHash=pinHash;x.plazaEnabled=true;x.plazaRole=role}else{x.plazaEnabled=false;delete x.pinHash;delete x.plazaRole}x.updatedAt=now});if(!enabled)revokeInvitations_('plaza',document);cloud.personal=dedupePersonal_(cloud.personal||[]);const saved=(cloud.personal||[]).find(x=>String(x.documento||'').trim()===document&&!x.deleted)||person;cloud.updatedAt=now;writeFile_(id,cloud);return json_({ok:true,user:{id:saved.id,documento:document,nombre:saved.nombre||'',plazaEnabled:saved.plazaEnabled===true,plazaRole:saved.plazaRole||''}})}finally{lock.releaseLock()}}
function plazaCollaborator_(q){const input=q.collaborator||{},document=String(input.documento||'').trim(),primerNombre=String(input.primerNombre||'').trim(),segundoNombre=String(input.segundoNombre||'').trim(),primerApellido=String(input.primerApellido||'').trim(),segundoApellido=String(input.segundoApellido||'').trim(),nombre=[primerNombre,segundoNombre,primerApellido,segundoApellido].filter(Boolean).join(' '),empresa=String(input.empresa||'').trim(),area=String(input.area||'').trim(),cargo=String(input.cargo||'No informado').trim()||'No informado',telefono=String(input.telefono||'').trim();if(!document||!primerNombre||!primerApellido||!empresa||!area)throw new Error('Documento, primer nombre, primer apellido, empresa y área son obligatorios');const lock=LockService.getScriptLock();lock.waitLock(30000);try{const id=findFile_(),cloud=id?readFile_(id,lock):{},auth=verifyToken_(q.token,cloud),rows=Array.isArray(cloud.personal)?cloud.personal:(cloud.personal=[]),existing=rows.find(x=>String(x.documento||'').trim()===document&&!x.deleted);if(existing&&!q.update)return json_({ok:true,exists:true,user:publicPerson_(existing)});const now=nextRevision_(cloud.updatedAt),person=existing||{id:'PERSONAL-PLAZA-'+Utilities.getUuid(),createdAt:now};Object.assign(person,{documento:document,primerNombre:primerNombre,segundoNombre:segundoNombre,primerApellido:primerApellido,segundoApellido:segundoApellido,nombre:nombre,empresa:empresa,area:area,cargo:cargo,telefono:telefono,deleted:false,updatedAt:now,syncState:'synced',registeredBy:auth.document});if(!existing)rows.push(person);cloud.personal=dedupePersonal_(rows);cloud.updatedAt=now;writeFile_(id,cloud);return json_({ok:true,exists:false,user:publicPerson_(person)})}finally{lock.releaseLock()}}
function publicPerson_(x){return{id:x.id,createdAt:x.createdAt||'',updatedAt:x.updatedAt||'',documento:x.documento||'',primerNombre:x.primerNombre||'',segundoNombre:x.segundoNombre||'',primerApellido:x.primerApellido||'',segundoApellido:x.segundoApellido||'',nombre:x.nombre||'',empresa:x.empresa||'',area:x.area||'',cargo:x.cargo||'No informado',telefono:x.telefono||'',deleted:!!x.deleted}}
function withFirstSync_(name,chosen,central){
 if(chosen===central||!['consumptions','incomes','assets','novelties','actas','blendingDeliveries','blendingIncomes'].includes(name))return chosen;
 const saved=Object.assign({},chosen);
 if(!central)saved.syncedAt=new Date().toISOString();
 else if(central.syncedAt)saved.syncedAt=central.syncedAt;
 else delete saved.syncedAt;
 if(central?.createdAt)saved.createdAt=central.createdAt;
 return saved;
}
function merge_(cloud,local){const out={schema:6,updatedAt:nextRevision_(cloud.updatedAt)},names=new Set(Object.keys(cloud||{}).concat(Object.keys(local||{})));names.delete('schema');names.delete('updatedAt');names.forEach(name=>{const map=new Map(),remote=Array.isArray(cloud[name])?cloud[name]:[],device=Array.isArray(local[name])?local[name]:[];remote.forEach(x=>{if(x&&x.id)map.set(x.id,x)});device.forEach(x=>{if(!x||!x.id)return;const central=map.get(x.id),chosen=(name==='assets'&&central?.deleted||name==='novelties'&&central&&(central.deleted||(central.reversed||central.reversedAt)&&x.noveltyAction?.status!=='applied')||['blendingIncomes','blendingDeliveries'].includes(name)&&central&&(central.reversed===true||central.reversado===true||central.movementType==='REVERSIÓN'))?central:choose_(x,central);if(name==='personal'&&central){const merged=Object.assign({},central,chosen);for(const field of ['pinHash','plazaEnabled','plazaRole']){if(Object.prototype.hasOwnProperty.call(central,field))merged[field]=central[field];else delete merged[field]}map.set(x.id,merged)}else map.set(x.id,withFirstSync_(name,chosen,central))});out[name]=Array.from(map.values())});if(Array.isArray(out.personal)){out.personal=dedupePersonal_(out.personal);const centralByDocument=new Map();(Array.isArray(cloud.personal)?cloud.personal:[]).filter(x=>x&&!x.deleted&&String(x.documento||'').trim()).forEach(x=>{const key=String(x.documento).trim(),old=centralByDocument.get(key);centralByDocument.set(key,choose_(x,old))});out.personal.forEach(x=>{const central=centralByDocument.get(String(x.documento||'').trim());if(central&&central.plazaEnabled===true&&central.pinHash){x.plazaEnabled=true;x.pinHash=central.pinHash;x.plazaRole=central.plazaRole||'operator'}else{delete x.pinHash;delete x.plazaEnabled;delete x.plazaRole}})}return out}
function dedupePersonal_(rows){const map=new Map();rows.forEach(x=>{if(!x||!x.id)return;const document=String(x.documento||'').trim(),key=document?'doc:'+document:'id:'+x.id,old=map.get(key);if(!old){map.set(key,x);return}const chosen=choose_(x,old);map.set(key,Object.assign({},old,chosen,{id:old.id||chosen.id}))});return Array.from(map.values())}
function choose_(local,remote){if(!remote)return local;if(!local)return remote;const ls=local.syncState==='seed',rs=remote.syncState==='seed';if(ls!==rs)return ls?remote:local;return stamp_(local)>=stamp_(remote)?local:remote}
function stamp_(x){const n=Date.parse(x.updatedAt||x.createdAt||'');return isNaN(n)?0:n}
function findFile_(){const cache=CacheService.getScriptCache(),cached=cache.get('sk-web-central-file-id');if(cached){try{DriveApp.getFileById(cached).getName();return cached}catch(_){cache.remove('sk-web-central-file-id')}}const files=DriveApp.getFilesByName(CLOUD_FILE),candidates=[];while(files.hasNext())candidates.push(files.next());candidates.sort((a,b)=>b.getLastUpdated().getTime()-a.getLastUpdated().getTime());for(const file of candidates){try{const data=JSON.parse(file.getBlob().getDataAsString('UTF-8'));if(data&&typeof data==='object'&&!Array.isArray(data)){cache.put('sk-web-central-file-id',file.getId(),60);return file.getId()}}catch(error){console.error('Base central descartada por contenido inválido',file.getId(),String(error&&error.message||error))}}if(candidates.length)throw new Error('La base central está dañada. Se bloqueó la operación para proteger los datos.');return''}
function readFile_(id,heldLock){const data=JSON.parse(DriveApp.getFileById(id).getBlob().getDataAsString('UTF-8'));return productionRecoverBridge_(id,data,heldLock)}
function writeFile_(id,data){const body=JSON.stringify(data);if(id){DriveApp.getFileById(id).setContent(body);return id}return DriveApp.createFile(CLOUD_FILE,body,MimeType.PLAIN_TEXT).getId()}
function json_(x){return ContentService.createTextOutput(JSON.stringify(x)).setMimeType(ContentService.MimeType.JSON)}


const PRODUCTION_FILE='sk-web-production.json';
function productionAccessKey_(document){return 'SK_PROD_USER_'+invitationKey_(document).slice('SK_INVITE_'.length)}
function productionAccess_(document){const raw=PropertiesService.getScriptProperties().getProperty(productionAccessKey_(document));return raw?JSON.parse(raw):null}
function productionRole_(role){return ['admin','mechanic','assistant','warehouse'].includes(role)?role:'assistant'}
function saveProductionAccess_(person,passwordHash,role){
 const document=String(person.documento).trim();
 PropertiesService.getScriptProperties().setProperty(productionAccessKey_(document),JSON.stringify({document:document,personId:person.id,role:productionPrimaryRole_(productionRoles_({roles:Array.isArray(role)?role:undefined,role})),roles:productionRoles_({roles:Array.isArray(role)?role:undefined,role}),passwordHash:passwordHash,revision:Utilities.getUuid()}));
}
function productionAccessAdmin_(q){
 const props=PropertiesService.getScriptProperties();
 if(q.action==='productionDisable'){
  const lock=LockService.getScriptLock();lock.waitLock(30000);
  try{const document=String(q.document||'').trim();if(!document)throw new Error('Selecciona un colaborador');props.deleteProperty(productionAccessKey_(document));revokeInvitations_('production',document);return json_({ok:true})}
  finally{lock.releaseLock()}
 }
 const values=props.getProperties();
 return json_({ok:true,warehouseV1:true,warehouseSettings:productionWarehouseSettings_(),users:Object.keys(values).filter(key=>key.startsWith('SK_PROD_USER_')).map(key=>{const row=JSON.parse(values[key]);return {document:row.document,personId:row.personId,role:productionRole_(row.role),roles:productionRoles_(row)}})});
}
function productionLogin_(q){
 if(String(q.document||'').trim().toLowerCase()==='admin')return entryLogin_('production',q.password);

 const document=String(q.document||'').trim(),user=productionAccess_(document);
 if(!user||!safeEqual_(user.passwordHash,hashPin_(document,String(q.password||''))))throw new Error('Documento o contraseña incorrectos');
 const id=findFile_(),cloud=id?readFile_(id):{},person=(cloud.personal||[]).find(row=>row.id===user.personId&&!row.deleted&&String(row.documento).trim()===document);
 if(!person)throw new Error('Colaborador no disponible');
 const expires=Date.now()+12*60*60*1000,payload=JSON.stringify(['production',document,user.revision,expires]);
 return json_({ok:true,token:Utilities.base64EncodeWebSafe(payload)+'.'+sign_(payload),expiresAt:expires,user:{document:document,name:person.nombre||document,personId:person.id,role:productionRole_(user.role),roles:productionRoles_(user)},warehouseV1:true});
}
function verifyProductionToken_(token,cloud){
 if(String(token||'').startsWith('sk2.'))return entryVerifySession_(token,'production',cloud);

 const bits=String(token||'').split('.');
 if(bits.length!==2)throw new Error('Inicia sesión en Producción');
 const payload=Utilities.newBlob(Utilities.base64DecodeWebSafe(bits[0])).getDataAsString();
 if(!safeEqual_(bits[1],sign_(payload)))throw new Error('Sesión no válida');
 const [scope,document,revision,expires]=JSON.parse(payload);
 const user=scope==='production'&&productionAccess_(document);
 if(!user||revision!==user.revision||expires<Date.now())throw new Error('La sesión de Producción venció o fue revocada');
 return user;
}
function productionSync_(q){
 const lock=LockService.getScriptLock();lock.waitLock(30000);
 try{
  const id=findFile_(),central=id?readFile_(id,lock):{},user=verifyProductionToken_(q.token,central);
  if(!productionCan_(user,'mechanic'))throw new Error('Tu acceso permite Bodega de Producción.');
  const personal=(central.personal||[]).filter(row=>!row.deleted);
  const recorder=personal.find(row=>row.id===user.personId&&String(row.documento).trim()===user.document);
  if(!recorder)throw new Error('Colaborador no disponible');
  const files=DriveApp.getFilesByName(PRODUCTION_FILE);let file=files.hasNext()?files.next():null;
  if(files.hasNext())throw new Error('Hay más de una base de Producción. Revisa los archivos de Drive.');
  const data=file?JSON.parse(file.getBlob().getDataAsString('UTF-8')):{consumptions:[]};
  if(!Array.isArray(data.consumptions))throw new Error('La base de Producción no es válida');
  const imported=productionImportPlaza_(data,central);
  if(imported)file=productionSaveData_(file,data);
  if(productionWarehouseSettings_().allowSpareDelivery&&q.warehouseV1!==true)throw new Error('Actualiza la app de Producción para consultar las salidas de Bodega.');
  const known=new Map(data.consumptions.map(row=>[row.id,row]));
  const incomes=new Map((data.incomes||[]).map(row=>[row.id,row]));
  const assets=(central.assets||[]).filter(row=>!row.deleted&&/^(yt|columna)/i.test(String(row.clase||'')));
  const parts=central.parts||[],criteria=central.inventoryCriteria||[];
  const partAliases=new Map();
  for(const origin of ['YT28','YT29','Columna28','Columna29'])
   for(const part of productionCatalog_(parts,criteria,origin).values())
    for(const alias of part.aliases)partAliases.set(origin+'|'+alias,part);
  const protocol=q.syncProtocol==='production-receipts-v1';
  const batch=protocol?(q.datedOpeningBatch||q.checkedPending||q.pending):q.pending;
  const pending=Array.isArray(batch)?batch:[];
  if(pending.length>1000)throw new Error('Envía un máximo de 1000 consumos por sincronización');
  const rejected=new Map(),priorIds=new Set([...known.keys(),...incomes.keys()]);
  if(protocol&&new Set(pending.map(row=>row?.id)).size!==pending.length)throw new Error('El lote contiene identificadores repetidos. Los pendientes se conservan.');
  let changed=false;
  for(const row of pending){
   try{
   if(!row||!/^[-a-zA-Z0-9]{16,100}$/.test(String(row.id||'')))throw new Error('Identificador de consumo no válido');
   const existingIncome=incomes.get(row.id);
   const samePart=saved=>saved.partId===row.partId||partAliases.get(row.origen+'|'+row.partId)?.aliases.includes(saved.partId);
   if(row.editOpeningDate&&(row.kind!=='initial'||!productionDate_(row.fechaISO)||row.fechaISO>Utilities.formatDate(new Date(),'America/Bogota','yyyy-MM-dd')))throw new Error('Fecha de apertura no válida.');
   if(known.has(row.id)){
    const saved=known.get(row.id);
    if(row.kind||saved.cantidad!==row.cantidad||saved.origen!==row.origen||!samePart(saved))throw new Error('El identificador ya corresponde a otro consumo confirmado.');
    continue;
   }
   if(existingIncome&&(!row.correctionId||existingIncome.correctionId===row.correctionId||(existingIncome.appliedCorrections||[]).includes(row.correctionId))){
    const superseded=row.correctionId&&existingIncome.correctionId!==row.correctionId&&(existingIncome.appliedCorrections||[]).includes(row.correctionId);
    if(row.editOpeningDate&&!superseded&&(existingIncome.fechaISO!==row.fechaISO||!existingIncome.openingFromDate))throw new Error('La fecha no coincide con la apertura confirmada.');
    if(existingIncome.kind!==row.kind||existingIncome.origen!==row.origen||!samePart(existingIncome)||!superseded&&(row.kind==='adjustment'?existingIncome.target:existingIncome.cantidad)!==row.cantidad)throw new Error('El identificador ya corresponde a otra cantidad confirmada.');
    continue;
   }
   if(existingIncome){
    if(user.role!=='admin'||existingIncome.kind!=='initial'||row.kind!=='initial'||!/^[-a-zA-Z0-9]{16,100}$/.test(String(row.correctionId))||!Number.isSafeInteger(row.cantidad)||row.cantidad<0)throw new Error('Corrección de saldo inicial no válida.');
    if(existingIncome.origen!==row.origen||!samePart(existingIncome))throw new Error('La apertura corresponde a otro repuesto o inventario.');
    const dateChange=row.editOpeningDate?{fechaISO:row.fechaISO,openingFromDate:true}:{};
    incomes.set(row.id,Object.assign({},existingIncome,dateChange,{cantidad:row.cantidad,correctionId:row.correctionId,appliedCorrections:[...(existingIncome.appliedCorrections||[]),existingIncome.correctionId,row.correctionId].filter(Boolean),updatedAt:new Date().toISOString()}));
    changed=true;
    continue;
   }
   if(['initial','income','adjustment'].includes(row.kind)){
    if(user.role!=='admin'&&(row.kind!=='income'||user.role!=='assistant'))throw new Error('Tu rol no permite este ingreso.');
    const part=partAliases.get(row.origen+'|'+row.partId);
    if(!part)throw new Error('Repuesto de ingreso no disponible para este inventario.');
    if(!Number.isSafeInteger(row.cantidad)||row.cantidad<(row.kind==='income'?1:0)||!productionDate_(row.fechaISO))throw new Error('Cantidad o fecha de ingreso no válida.');
    const partId=part.partId;
    if(row.kind==='adjustment'){
     const date=Utilities.formatDate(new Date(),'America/Bogota','yyyy-MM-dd');
     const latest=(data.inventoryCounts||[]).filter(x=>x.status==='closed'&&x.origin===row.origen).sort((a,b)=>b.date.localeCompare(a.date))[0];
     const aliases=new Set(part.aliases);
     const opening=latest?.rows.find(x=>(x.aliases||[x.partId]).some(id=>aliases.has(id)));
     const matches=x=>!x.deleted&&x.fechaISO<=date&&x.origen===row.origen&&aliases.has(x.partId);
     const initial=Array.from(incomes.values()).reverse().find(x=>matches(x)&&x.kind==='initial');
     const includes=x=>matches(x)&&(opening?productionAfterClose_(x,latest.date,latest.closedAt):!initial?.openingFromDate||x.fechaISO>=initial.fechaISO);
     let before=opening?.physical??initial?.cantidad??0;
     for(const x of incomes.values())if(includes(x)&&['income','adjustment'].includes(x.kind))before+=x.cantidad;
     for(const x of known.values())if(includes(x))before-=x.cantidad;
     if(protocol&&!Number.isSafeInteger(row.baseQuantity))throw new Error('Este ajuste de una versión anterior necesita revisión. Saldo actual: '+before+'. Retira el ajuste rechazado y vuelve a guardar la cantidad.');
     if(protocol&&row.baseQuantity!==before)throw new Error('La existencia cambió en la base central. Saldo actual: '+before+'. Revisa la cantidad antes de volver a guardar.');
     incomes.set(row.id,{id:row.id,kind:row.kind,partId,origen:row.origen,cantidad:row.cantidad-before,target:row.cantidad,before,fechaISO:date,sourceCreatedAt:originalStamp_(row.createdAt),createdAt:new Date().toISOString(),registradoPor:user.document,registradoPorNombre:recorder.nombre||user.document});
     changed=true;
     continue;
    }
    if(row.kind==='initial'&&Array.from(incomes.values()).some(x=>!x.deleted&&x.kind==='initial'&&part.aliases.includes(x.partId)&&x.origen===row.origen))throw new Error('El repuesto ya tiene un saldo inicial.');
    incomes.set(row.id,{id:row.id,kind:row.kind,partId,origen:row.origen,cantidad:row.cantidad,fechaISO:row.fechaISO,recordedAt:productionRecordedAt_(row.createdAt),sourceCreatedAt:originalStamp_(row.createdAt),createdAt:new Date().toISOString(),registradoPor:user.document,registradoPorNombre:recorder.nombre||user.document,...(row.editOpeningDate?{openingFromDate:true}:{}),...(row.kind==='initial'&&row.correctionId?{correctionId:row.correctionId}:{})});
    changed=true;
    continue;
   }
   if(row.kind||!Number.isSafeInteger(row.cantidad)||row.cantidad<1||!productionDate_(row.fechaISO))throw new Error('Cantidad o fecha no válida');
   if(!/^(?:YT|Columna)(?:28|29)$/.test(row.origen)||!['YT','Columna'].includes(row.tipoEquipo)||!row.origen.startsWith(row.tipoEquipo))throw new Error('Inventario de origen no válido');
   if(!assets.some(x=>x.id===row.assetId)||!personal.some(x=>x.id===row.responsableId)||!partAliases.has(row.origen+'|'+row.partId))throw new Error('Máquina, responsable o repuesto no disponible. Revisa los consumos pendientes.');
   if(productionRoles_(user).includes('mechanic')&&!productionRoles_(user).some(role=>['admin','assistant'].includes(role))&&row.responsableId!==user.personId)throw new Error('El mecánico solo puede registrar consumos a su nombre.');
   if(row.turno!=null&&!/^[DTS]$/.test(row.turno))throw new Error('Turno no válido');
   const responsible=personal.find(person=>person.id===row.responsableId);
   if(productionWarehouseSettings_().enabled&&row.cantidad>productionSpareBalance_({...data,incomes:Array.from(incomes.values()),consumptions:Array.from(known.values())},{partId:row.partId,origen:row.origen},central))throw new Error('La cantidad supera las existencias actuales de Producción. Revisa los pendientes.');
   const saved={id:row.id,assetId:row.assetId,responsableId:row.responsableId,responsableNombre:responsible.nombre||responsible.documento,partId:row.partId,itemId:String(row.itemId||''),noItem:String(row.noItem||''),nombreRepuesto:String(row.nombreRepuesto||'').slice(0,200),tipoEquipo:row.tipoEquipo,origen:row.origen,cantidad:row.cantidad,fechaISO:row.fechaISO,recordedAt:productionRecordedAt_(row.createdAt),sourceCreatedAt:originalStamp_(row.createdAt),createdAt:new Date().toISOString(),registradoPor:user.document,registradoPorNombre:recorder.nombre||user.document,registradoPorId:recorder.id};
   if(row.turno)saved.turno=row.turno;
   known.set(saved.id,saved);changed=true;
   }catch(error){
    if(!protocol)throw error;
    rejected.set(row?.id||'',String(error.message||error));
   }
  }
  const incomeChangeReceipts=[];
  const incomeChanges=protocol&&Array.isArray(q.incomeChanges)?q.incomeChanges:[];
  if(incomeChanges.length>1000)throw new Error('Envía un máximo de 1000 cambios de ingresos.');
  for(const operation of incomeChanges){
   try{
    const result=productionIncomeChange_(operation,incomes,data,user,recorder);
    changed=changed||result.changed;
    incomeChangeReceipts.push({id:operation.id,status:result.changed?'accepted':'already-applied'});
   }catch(error){incomeChangeReceipts.push({id:operation?.id||'',status:'rejected',error:String(error.message||error)});}
  }
  const consumptions=Array.from(known.values());
  let inventoryResult;
  if(q.inventoryRequest){
   try{inventoryResult=productionCount_(q.inventoryRequest,data,user,recorder,parts,criteria,Array.from(incomes.values()),consumptions);}
   catch(error){inventoryResult={error:error.message};}
  }
  if(q.inventoryRequest?.action==='history'&&!pending.length)return json_({ok:true,inventoryResult});
  const counts=data.inventoryCounts||[],latest=new Map();
  for(const count of counts)if(count.status==='closed'&&(!latest.has(count.origin)||count.date>latest.get(count.origin).date))latest.set(count.origin,count);
  if(changed||inventoryResult?.changed){
   const body=JSON.stringify({...data,schema:3,consumptions,incomes:Array.from(incomes.values())});
   if(file)file.setContent(body);else DriveApp.createFile(PRODUCTION_FILE,body,MimeType.PLAIN_TEXT);
  }
  const warehouseById=new Map((data.warehouseMovements||[]).map(row=>[row.id,row]));
  const visibleIncomes=Array.from(incomes.values(),income=>{
   if(income.sourceCreatedAt!==undefined||(!income.sourceWarehouseMovementId&&!income.sourceDeliveryId))return income;
   const source=warehouseById.get(income.sourceWarehouseMovementId||income.id);
   return source?Object.assign({},income,{sourceCreatedAt:warehouseOriginalStamp_(source)}):income;
  });
  const spareIds=new Set(criteria.filter(x=>x.isYtSpare).map(x=>x.id));
  const deliveries=(central.blendingDeliveries||[]).filter(row=>!row.deleted&&cargoNorm_(row.destination)==='produccion'&&spareIds.has(row.itemId)).map(row=>({id:row.id,itemId:row.itemId,itemName:row.itemName,quantity:row.quantity,createdAt:row.createdAt,reversed:row.reversed===true||row.reversado===true}));
  // Igual que Plaza: los recibos se emiten solo después de guardar en Drive.
  const acknowledgements=protocol?pending.map(row=>({id:row?.id||'',status:rejected.has(row?.id||'')?'rejected':priorIds.has(row.id)?'already-applied':'accepted',...(rejected.has(row?.id||'')?{error:rejected.get(row?.id||'')}:{})})):undefined;
  return json_({ok:true,incomeChangesV1:true,incomeChangeReceipts,incomeHistory:(data.incomeHistory||[]).filter(row=>Date.now()-Date.parse(row.at)<=30*86400000||incomeChanges.some(op=>op.id===row.id)),...(protocol?{syncProtocol:'production-receipts-v1',acknowledgements}:{}),productionRole:productionRole_(user.role),productionRoles:productionRoles_(user),warehouseV1:true,personal:personal.map(row=>({id:row.id,nombre:row.nombre,documento:row.documento})),assets:assets.map(row=>({id:row.id,clase:row.clase,modelo:row.modelo,marcaActual:row.marcaActual,marcaInterna:row.marcaInterna,numeroMarcaActual:row.numeroMarcaActual,marcaAnterior:row.marcaAnterior,marcaNumero:row.marcaNumero,mina:row.mina,serial:row.serial,estado:row.estado,ubicacion:row.ubicacion})),parts:parts,inventoryCriteria:criteria.filter(row=>row.isYtSpare),deliveries:deliveries,inventoryResult,stockAdjustment:true,stockAdjustmentLocalV1:true,
   openingDateV1:true,inventoryCounts:counts.filter(row=>row.status!=='closed'&&(row.owner===user.document||user.role==='admin'&&row.status==='submitted')),
   inventoryClosures:counts.filter(row=>row.status==='closed').map(({id,origin,date,closedAt})=>({id,origin,date,closedAt})),
   inventoryLatest:Array.from(latest.values()),incomes:visibleIncomes,consumptions:consumptions,ack:pending.filter(row=>!rejected.has(row?.id||'')).map(row=>row.id),superseded:pending.filter(row=>row.correctionId&&incomes.get(row.id)?.correctionId!==row.correctionId&&(incomes.get(row.id)?.appliedCorrections||[]).includes(row.correctionId)).map(row=>({id:row.id,correctionId:row.correctionId}))});
 }finally{lock.releaseLock()}
}

// Ingresos: borrado recuperable, control de versión y reversión durante 30 días.
function productionIncomeChange_(op,incomes,data,user,recorder){
 if(user.role!=='admin')throw new Error('Solo el administrador puede editar, eliminar o revertir ingresos.');
 if(!op||!/^[-a-zA-Z0-9]{16,100}$/.test(String(op.id||''))||!['edit','delete','revert'].includes(op.action))throw new Error('Cambio de ingreso no válido.');
 const history=data.incomeHistory||[];
 const prior=history.find(row=>row.id===op.id);
 if(prior){
  if(JSON.stringify(prior.operation)!==JSON.stringify(op))throw new Error('El identificador corresponde a otro cambio.');
  return {changed:false};
 }
 const before=incomes.get(op.incomeId);
 if(before?.sourceDeliveryId||before?.sourceWarehouseMovementId)throw new Error('El ingreso está vinculado a un traslado. Registra su devolución desde Bodega.');
 if(!before||before.kind!=='income')throw new Error('Selecciona un ingreso registrado; los saldos de apertura se corrigen en Existencias.');
 if(op.baseRevision!==(before.revision||'original'))throw new Error('Este ingreso cambió en otro dispositivo. Sincroniza y revisa el registro.');
 const latest=(data.inventoryCounts||[]).filter(row=>row.origin===before.origen&&row.status==='closed').sort((a,b)=>b.date.localeCompare(a.date))[0];
 if(latest&&!productionAfterClose_(before,latest.date,latest.closedAt))throw new Error('Este ingreso pertenece a un inventario cerrado y no se puede modificar.');
 let values,original;
 if(op.action==='revert'){
  original=history.find(row=>row.id===op.historyId&&row.incomeId===before.id&&row.action!=='revert');
  if(!original||original.revertedBy||before.revision!==original.id)throw new Error('Solo se puede revertir el cambio vigente de este ingreso.');
  if(Date.now()-Date.parse(original.at)>30*86400000)throw new Error('El plazo de 30 días para revertir este cambio terminó.');
  values={cantidad:original.before.cantidad,fechaISO:original.before.fechaISO,deleted:Boolean(original.before.deleted)};
 }else{
  if(before.deleted)throw new Error('El ingreso está eliminado. Usa Revertir para recuperarlo.');
  values=op.action==='delete'?{cantidad:before.cantidad,fechaISO:before.fechaISO,deleted:true}:{cantidad:op.cantidad,fechaISO:op.fechaISO,deleted:false};
  if(!Number.isSafeInteger(values.cantidad)||values.cantidad<1||!productionDate_(values.fechaISO)||values.fechaISO>Utilities.formatDate(new Date(),'America/Bogota','yyyy-MM-dd'))throw new Error('Escribe una cantidad entera mayor que cero y una fecha válida hasta hoy.');
 }
 const after=Object.assign({},before,values,{revision:op.id,updatedAt:new Date().toISOString()});
 if(latest&&!productionAfterClose_(after,latest.date,latest.closedAt))throw new Error('La fecha corresponde a un inventario cerrado.');
 const entry={id:op.id,incomeId:before.id,action:op.action,at:after.updatedAt,before:Object.assign({},before),after:Object.assign({},after),operation:op};
 if(original)original.revertedBy=op.id;
 data.incomeHistory=[...history,entry];incomes.set(before.id,after);
 return {changed:true};
}

function productionCount_(request,data,user,recorder,parts,criteria,incomes,consumptions){
 const counts=data.inventoryCounts||(data.inventoryCounts=[]);
 const role=productionRole_(user.role),admin=role==='admin';
 if(!admin&&role!=='assistant')throw new Error('Tu rol no permite gestionar el inventario físico.');
 if(request.action==='history'){
  return {history:counts.filter(row=>row.status==='closed').map(({id,origin,date})=>({id,origin,date})),
   report:counts.find(row=>row.status==='closed'&&row.id===request.id)||null};
 }
 const {id,action}=request;
 if(!/^[-a-zA-Z0-9]{16,100}$/.test(String(id||'')))throw new Error('Identificador de inventario no válido.');
 const index=counts.findIndex(row=>row.id===id),current=counts[index];
 const stamp=new Date().toISOString();
 if(action==='save'||action==='submit'){
  if(current?.owner&&current.owner!==user.document)throw new Error('Este borrador pertenece a otro usuario.');
  if(current?.revision===request.revision)return {count:current};
  if(current&&!['draft','returned'].includes(current.status))throw new Error('El inventario ya se envió para revisión.');
  if(current&&(request.baseRevision||'')!==current.revision)throw new Error('El borrador cambió en otro dispositivo. Revisa la versión sincronizada.');
  const {origin,date,values,revision}=request;
  if(!/^(YT|Columna)(28|29)$/.test(origin)||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||date>Utilities.formatDate(new Date(),'America/Bogota','yyyy-MM-dd'))throw new Error('Fecha o inventario no válido.');
  if(!/^[-a-zA-Z0-9]{16,100}$/.test(String(revision||''))||!Array.isArray(values)||values.length>3000)throw new Error('Conteo no válido.');
  if(values.some(row=>!row||typeof row.partId!=='string'||!Number.isSafeInteger(row.physical)||row.physical<0)||new Set(values.map(row=>row.partId)).size!==values.length)throw new Error('Cada conteo debe ser un número entero de cero en adelante.');
  const count={id,origin,date,values,revision,owner:user.document,countedBy:recorder.nombre||user.document,status:action==='submit'?'submitted':'draft',updatedAt:stamp};
  if(action==='submit')productionCountRows_(count,counts,parts,criteria,incomes,consumptions);
  if(index<0)counts.push(count);else counts[index]=count;
  return {count,changed:true};
 }
 if(!admin)throw new Error('Solo un administrador puede aprobar o devolver el inventario.');
 if(action==='approve'&&current?.status==='closed')return {count:current};
 if(action==='return'&&current?.status==='returned'&&current.revision===request.revision&&current.note===String(request.note||'').trim())return {count:current};
 if(!current||current.status!=='submitted'||current.revision!==request.revision)throw new Error('La solicitud ya cambió. Sincroniza y revísala nuevamente.');
 if(action==='return'){
  const note=String(request.note||'').trim();
  if(!note||note.length>500)throw new Error('Indica una observación de hasta 500 caracteres.');
  counts[index]={...current,status:'returned',note,updatedAt:stamp};
 }else if(action==='approve'){
  const rows=productionCountRows_(current,counts,parts,criteria,incomes,consumptions);
  counts[index]={...current,status:'closed',rows,approvedBy:recorder.nombre||user.document,closedAt:stamp};
  delete counts[index].values;
 }else throw new Error('Operación de inventario no válida.');
 return {count:counts[index],changed:true};
}

function productionCountRows_(count,counts,parts,criteria,incomes,consumptions){
 const {origin,date}=count,key=origin.toLowerCase();
 const previous=counts.filter(row=>row.origin===origin&&row.status==='closed').sort((a,b)=>b.date.localeCompare(a.date))[0];
 if(previous&&previous.date.slice(0,7)>=date.slice(0,7))throw new Error('Ya existe un cierre para este mes o un mes posterior.');
 const catalog=productionCatalog_(parts,criteria,origin);
 const counted=new Map(count.values.map(row=>[row.partId,row.physical]));
 if(!catalog.size||catalog.size!==counted.size||[...catalog.keys()].some(id=>!counted.has(id)))throw new Error('Completa el conteo de todos los repuestos del inventario vigente.');
 const byAlias=new Map();
 const lastRows=new Map();
 for(const row of previous?.rows||[])for(const id of row.aliases||[row.partId])lastRows.set(id,row);
 for(const row of catalog.values()){
  const last=row.aliases.map(id=>lastRows.get(id)).find(Boolean);
  row.opening=last?.physical||0;row.incomes=0;row.consumptions=0;row.adjustments=0;row.outgoings=0;row.cutoff=last?previous.date:'';row.closedAt=last?previous.closedAt:'';
  for(const id of row.aliases)byAlias.set(id,row);
 }
 const get=row=>row.origen===origin&&!row.deleted&&row.fechaISO<=date&&byAlias.get(row.partId);
 for(const movement of incomes){
  const row=get(movement);
  if(row&&!row.cutoff&&movement.kind==='initial'){row.opening=movement.cantidad;row.initialDate=movement.openingFromDate?movement.fechaISO:'';}
 }
 const include=(row,movement)=>row&&(row.cutoff?productionAfterClose_(movement,row.cutoff,row.closedAt):!row.initialDate||movement.fechaISO>=row.initialDate);
 for(const movement of incomes){const row=get(movement);if(include(row,movement)){if(['income','warehouse-return'].includes(movement.kind))row.incomes+=movement.cantidad;else if(movement.kind==='warehouse-out')row.outgoings+=movement.cantidad;else if(movement.kind==='adjustment')row.adjustments+=movement.cantidad;}}
 for(const movement of consumptions){const row=get(movement);if(include(row,movement))row.consumptions+=movement.cantidad;}
 return Array.from(catalog.values(),({partId,name,aliases,opening,incomes,consumptions,adjustments,outgoings})=>{
  const expected=opening+incomes-consumptions-outgoings,physical=counted.get(partId);
  return {partId,name,aliases,opening,incomes,consumptions,adjustments,outgoings,expected,physical,difference:physical-expected};
 });
}

function productionAfterClose_(row,date,closedAt){
 return row.fechaISO>date||row.fechaISO===date&&(row.recordedAt||row.createdAt)>closedAt;
}

function productionDate_(value){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||'')))return false;
 const date=new Date(value+'T00:00:00Z');
 return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}
function originalStamp_(value){
 const stamp=Date.parse(value);
 return Number.isFinite(stamp)?new Date(stamp).toISOString():'';
}
function warehouseOriginalStamp_(row){
 if(row.sourceCreatedAt||row.recordedAt)return originalStamp_(row.sourceCreatedAt||row.recordedAt);
 if(!row.requestSignature)return '';
 try{
  const request=JSON.parse(row.requestSignature);
  return request&&request.id===row.id?originalStamp_(request.createdAt):'';
 }catch(error){return '';}
}
function productionRecordedAt_(value){
 const stamp=Date.parse(value),now=Date.now();
 return Number.isFinite(stamp)&&stamp<=now?new Date(stamp).toISOString():new Date(now).toISOString();
}
function productionCatalog_(parts,criteria,origin){
 const normalize=value=>String(value??'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,'');
 const key=normalize(origin),removed=criteria.filter(row=>row.deleted&&row.permanentSpareDeleted&&normalize(row.spareEquipment)===key);
 const catalog=new Map(parts.filter(row=>!row.deleted&&row.active!==false&&normalize(row.clase)+String(row.detalle??'').trim()===key&&!removed.some(item=>item.productionPartId===row.id))
  .map(row=>[row.id,{partId:row.id,name:row.nombre,aliases:[row.id]}]));
 for(const item of criteria.filter(row=>row.isYtSpare&&!row.deleted&&row.active!==false&&normalize(row.spareEquipment)===key)){
  const source=catalog.get(item.productionPartId),id=source?.partId||item.id;
  catalog.set(id,{partId:id,name:item.spareItemName||item.name,aliases:Array.from(new Set([...(source?.aliases||[id]),item.id]))});
 }
 for(const item of criteria){
  const source=catalog.get(item.productionPartId);
  if(source&&normalize(item.spareEquipment)===key&&!source.aliases.includes(item.id))source.aliases.push(item.id);
 }
 return catalog;
}

// Bodega de Producción: su libro y cantidades viven exclusivamente en PRODUCTION_FILE.
function productionRoles_(user){
 const valid=['admin','assistant','mechanic','warehouse'];
 const roles=Array.isArray(user?.roles)?user.roles:[user?.role||'assistant'];
 if(!roles.length||roles.some(role=>!valid.includes(role)))throw new Error('Selecciona un rol válido de Producción.');
 return [...new Set(roles)];
}
function productionPrimaryRole_(roles){return ['admin','assistant','mechanic','warehouse'].find(role=>roles.includes(role))}
function productionCan_(user,module){const roles=productionRoles_(user);return roles.includes('admin')||roles.includes('assistant')||roles.includes(module==='mechanic'?'mechanic':'warehouse')}
function productionWarehouseSettings_(){
 const raw=typeof PropertiesService!=='undefined'?PropertiesService.getScriptProperties().getProperty('SK_PRODUCTION_WAREHOUSE'):null;
 return raw?JSON.parse(raw):{enabled:false,allowSpareDelivery:false,transferStartAt:''};
}
function productionWarehouseConfigure_(q){
 const lock=LockService.getScriptLock();lock.waitLock(30000);
 try{
  const settings=productionWarehouseSettings_();
  if(typeof q.enabled==='boolean'){
   if(settings.enabled&&!q.enabled)throw new Error('La bodega ya está activa. Su historial debe conservarse.');
   if(q.enabled&&!settings.enabled){settings.enabled=true;settings.transferStartAt=new Date().toISOString();}
  }
  if(typeof q.allowSpareDelivery==='boolean')settings.allowSpareDelivery=q.allowSpareDelivery;
  PropertiesService.getScriptProperties().setProperty('SK_PRODUCTION_WAREHOUSE',JSON.stringify(settings));
  return json_({ok:true,warehouseV1:true,warehouseSettings:settings});
 }finally{lock.releaseLock()}
}
function productionDataFile_(){
 const files=DriveApp.getFilesByName(PRODUCTION_FILE),file=files.hasNext()?files.next():null;
 if(files.hasNext())throw new Error('Hay más de una base de Producción. Revisa Drive.');
 return file;
}
function productionReadData_(file){
 const data=file?JSON.parse(file.getBlob().getDataAsString('UTF-8')):{consumptions:[],incomes:[]};
 if(!Array.isArray(data.consumptions)||data.incomes&&!Array.isArray(data.incomes))throw new Error('La base de Producción no es válida.');
 return data;
}
function productionSaveData_(file,data){
 const body=JSON.stringify(data);
 return file?(file.setContent(body),file):DriveApp.createFile(PRODUCTION_FILE,body,MimeType.PLAIN_TEXT);
}
function productionWarehouseAppend_(data,row){
 data.warehouseRevision=(Number(data.warehouseRevision)||0)+1;
 const saved={...row,revision:data.warehouseRevision};
 (data.warehouseMovements||(data.warehouseMovements=[])).push(saved);return saved;
}
function productionWarehouseEpp_(item){return truthy_(item?.isEpp)}
function productionWarehouseLocation_(location){
 const value=cargoNorm_(location);
 return ['produccion','inventario de produccion','bodega de produccion'].includes(value)||/^bodega de produccion\s*[-–—]?\s*(?:n\.?|nivel)\s*4$/.test(value);
}
function productionWarehouseDestination_(row){return row.destinationWarehouseId==='production'||productionWarehouseLocation_(row.destination)}
function productionSpare_(item,central){
 if(!item?.isYtSpare)return null;
 for(const origin of ['YT28','YT29','Columna28','Columna29']){
  for(const part of productionCatalog_(central.parts||[],central.inventoryCriteria||[],origin).values())
   if(part.aliases.includes(item.id)||part.aliases.includes(item.productionPartId))return {partId:part.partId,origen:origin};
 }
 throw new Error('El repuesto no tiene inventario de origen configurado.');
}
function productionImportPlaza_(data,central){
 const settings=productionWarehouseSettings_();if(!settings.enabled)return false;
 const existing=new Set((data.warehouseMovements||[]).map(row=>row.id));
 const criteria=new Map((central.inventoryCriteria||[]).map(row=>[row.id,row]));let changed=false;
 for(const source of central.blendingDeliveries||[]){
  // La activación no vuelve a ingresar entregas históricas incluidas en aperturas.
  if(source.deleted||source.reversed||source.reversado||source.reversalOf||source.movementType==='DEVOLUCIÓN'||source.movementType==='REVERSIÓN'||!productionWarehouseDestination_(source)||String(source.createdAt||'')<settings.transferStartAt)continue;
  const id='plaza-'+source.id;if(existing.has(id))continue;
  const item=criteria.get(source.itemId);if(!item||productionWarehouseEpp_(item)||!Number.isFinite(Number(source.quantity))||Number(source.quantity)<=0)continue;
  const spare=productionSpare_(item,central),now=new Date().toISOString();
  const event=productionWarehouseAppend_(data,{id,kind:'transfer_in',itemId:item.id,itemName:item.name,quantity:Number(source.quantity),delta:Number(source.quantity),assetId:source.assetId||'',sourceDeliveryId:source.id,sourceLoan:cargoNorm_(source.deliveryType)==='prestamo',source:'plaza',target:spare?'mechanics':'warehouse',createdAt:now,fechaISO:Utilities.formatDate(new Date(),'America/Bogota','yyyy-MM-dd'),sourceCreatedAt:source.createdAt,personName:source.recipientName||'',status:'synced'});
  if(spare)(data.incomes||(data.incomes=[])).push({id,kind:'income',...spare,cantidad:event.quantity,fechaISO:Utilities.formatDate(new Date(),'America/Bogota','yyyy-MM-dd'),createdAt:now,recordedAt:now,sourceCreatedAt:source.createdAt,sourceDeliveryId:source.id,registradoPorNombre:'Traslado desde Plaza Blending'});
  existing.add(id);changed=true;
 }
 return changed;
}
function productionTransferImported_(sourceId){
 if(!productionWarehouseSettings_().enabled)return false;
 const file=productionDataFile_();if(!file)return false;
 return (productionReadData_(file).warehouseMovements||[]).some(row=>row.sourceDeliveryId===sourceId&&row.status!=='rejected');
}
function productionSpareBalance_(data,spare,central){
 const today=Utilities.formatDate(new Date(),'America/Bogota','yyyy-MM-dd'),catalog=productionCatalog_(central.parts||[],central.inventoryCriteria||[],spare.origen);
 const part=[...catalog.values()].find(row=>row.aliases.includes(spare.partId));if(!part)return 0;
 const ids=new Set(part.aliases),closed=(data.inventoryCounts||[]).filter(row=>row.status==='closed'&&row.origin===spare.origen&&row.date<=today).sort((a,b)=>b.date.localeCompare(a.date)||String(b.closedAt||'').localeCompare(String(a.closedAt||'')))[0];
 const opening=closed?.rows.find(row=>(row.aliases||[row.partId]).some(id=>ids.has(id)));
 const matches=row=>!row.deleted&&row.origen===spare.origen&&ids.has(row.partId)&&row.fechaISO<=today;
 return productionPartBalance_(opening,closed,(data.incomes||[]).filter(matches),(data.consumptions||[]).filter(matches));
}
function productionPartBalance_(opening,closed,incomes,consumptions){
 const initial=incomes.filter(row=>row.kind==='initial').at(-1);
 let total=opening?.physical??initial?.cantidad??0;
 const includes=row=>opening?productionAfterClose_(row,closed.date,closed.closedAt):!initial?.openingFromDate||row.fechaISO>=initial.fechaISO;
 for(const row of incomes)if(includes(row)){if(['income','warehouse-return'].includes(row.kind))total+=row.cantidad;else if(row.kind==='warehouse-out')total-=row.cantidad;}
 for(const row of consumptions)if(includes(row))total-=row.cantidad;
 return total;
}

// Agrupa el libro una vez por sincronización, incluso cuando varios criterios identifican la misma pieza.
function productionPartBalancesByCriterion_(data,central){
 const today=Utilities.formatDate(new Date(),'America/Bogota','yyyy-MM-dd');
 const byOrigin=new Map(),byCriterion=new Map(),criteria=central.inventoryCriteria||[];
 let catalogOrder=0;
 for(const origin of ['YT28','YT29','Columna28','Columna29']){
  const catalog=productionCatalog_(central.parts||[],criteria,origin),byAlias=new Map();
  const closed=(data.inventoryCounts||[]).filter(row=>row.status==='closed'&&row.origin===origin&&row.date<=today)
   .sort((a,b)=>b.date.localeCompare(a.date)||String(b.closedAt||'').localeCompare(String(a.closedAt||'')))[0];
  for(const part of catalog.values()){
   const group={closed,incomes:[],consumptions:[],order:catalogOrder++};
   for(const id of part.aliases){
    if(!byAlias.has(id))byAlias.set(id,group);
    if(!byCriterion.has(id))byCriterion.set(id,group);
   }
  }
  for(const row of closed?.rows||[]){
   for(const id of row.aliases||[row.partId]){
    const group=byAlias.get(id);if(group&&!group.opening)group.opening=row;
   }
  }
  byOrigin.set(origin,byAlias);
 }
 for(const table of ['incomes','consumptions']){
  for(const row of data[table]||[]){
   if(row.deleted||!(row.fechaISO<=today))continue;
   byOrigin.get(row.origen)?.get(row.partId)?.[table].push(row);
  }
 }
 for(const group of new Set(byCriterion.values()))group.quantity=productionPartBalance_(group.opening,group.closed,group.incomes,group.consumptions);
 return byCriterion;
}
function adminProductionBalances_(central,versions){
 const known=new Map(versions),enabled=productionWarehouseSettings_().enabled===true;
 const sampledAt=new Date().toISOString(),rows=[];let count=0;
 if(enabled){
  const file=productionDataFile_(),book=productionReadData_(file);
  if(productionImportPlaza_(book,central))productionSaveData_(file,book);
  const warehouse=new Map(),parts=productionPartBalancesByCriterion_(book,central);
  for(const movement of book.warehouseMovements||[]){
   if(movement.status==='rejected')continue;
   const previous=warehouse.get(movement.itemId);
   warehouse.set(movement.itemId,{quantity:(previous?.quantity||0)+Number(movement.delta||0),revision:movement.revision||0});
  }
  for(const item of central.inventoryCriteria||[]){
   if(!item.id||item.deleted||item.active===false||item.recordType==='formOptions'||item.id==='SYSTEM-FORM-OPTIONS-V1'||
      productionWarehouseEpp_(item)||truthy_(item.isFixedAsset??item.esActivoFijo??item.CI_ES_A_FIJO))continue;
   const movement=warehouse.get(item.id);
   let quantity;
   if(item.isYtSpare){
    // productionSpare_ acepta ambos identificadores y elige la primera coincidencia del catálogo.
    const own=parts.get(item.id),legacy=parts.get(item.productionPartId);
    const part=own&&legacy?(own.order<legacy.order?own:legacy):(own||legacy);
    if(!part)continue;
    quantity=part.quantity;
   }else{
    if(!movement)continue;
    quantity=movement.quantity;
   }
   count++;
   const revision=String(movement?.revision||0)+'|'+quantity;
   if(known.get(item.id)!==revision)rows.push({itemId:item.id,quantity,updatedAt:revision});
   known.delete(item.id);
  }
 }
 return {protocol:'production-balances-v1',enabled,sampledAt,count,rows,removed:Array.from(known.keys())};
}

function productionWarehouseBalance_(data,item,central){
 const spare=productionSpare_(item,central);if(spare)return productionSpareBalance_(data,spare,central);
 return (data.warehouseMovements||[]).filter(row=>row.itemId===item.id&&row.status!=='rejected').reduce((n,row)=>n+Number(row.delta||0),0);
}
function productionWarehouseRetired_(asset){return /^dad[oa](?:\/[oa])? de baja$/.test(cargoNorm_(asset.estado))}
function productionWarehouseHoldsAsset_(asset,last){
 if(asset.deleted||productionWarehouseRetired_(asset))return false;
 if(last?.bridgePending)return last.delta>0;
 if(last?.kind==='loan')return false;
 return productionWarehouseLocation_(asset.ubicacion);
}
function productionWarehouseCanIssue_(asset,state){
 const status=cargoNorm_(state);
 return !['no','false','0'].includes(cargoNorm_(String(asset.disponibleEntrega??'')))&&
  (!status||/^operativ[oa](?:\/[oa])?$/.test(status)||status==='apto segun inspeccion');
}
function productionWarehouseApply_(data,central,request,user,actor,withShift){
 if(!/^[-a-zA-Z0-9]{16,100}$/.test(String(request.id||'')))throw new Error('Identificador no válido.');
 const original=(data.warehouseMovements||[]).find(row=>row.id===request.id);
 if(original){
  if(original.requestSignature!==JSON.stringify(request))throw new Error('El identificador ya corresponde a otro movimiento.');
  return {row:original,duplicate:true};
 }
 const settings=productionWarehouseSettings_();if(!settings.enabled)throw new Error('La bodega aún no está activada desde SK Web Admin.');
 const allowed=['income','opening','delivery','loan','return','transfer_out'];if(!allowed.includes(request.kind))throw new Error('Movimiento no válido.');
 if(request.kind==='opening'&&!productionRoles_(user).includes('admin'))throw new Error('Solo el administrador registra saldos de apertura.');
 const roles=productionRoles_(user),automatic=roles.includes('warehouse');
 if(withShift&&String(request.recordedBy||'')!==String(user.document))throw new Error('El movimiento pertenece a otra sesión.');
 const keeper=automatic?actor:(central.personal||[]).find(p=>p.id===request.shiftKeeperId&&!p.deleted&&p.active!==false);
 // Los administradores podían tener movimientos sin turno en la cola anterior.
 const legacyAdmin=!withShift&&roles.includes('admin');
 if(!legacyAdmin&&!keeper||withShift&&keeper?.id!==request.shiftKeeperId)throw new Error('Selecciona un bodeguero de turno válido.');
 const item=(central.inventoryCriteria||[]).find(row=>row.id===request.itemId&&!row.deleted&&row.active!==false);
 if(!item)throw new Error('Elemento no disponible en Criterios de inventario.');
 if(productionWarehouseEpp_(item))throw new Error('Los elementos EPP se administran en Plaza Blending y no están habilitados en Producción.');
 const spare=productionSpare_(item,central),fixed=item.isFixedAsset===true,quantity=Number(request.quantity),outgoing=['delivery','loan','transfer_out'].includes(request.kind);
 if(!Number.isFinite(quantity)||(!item.fractionable&&!fixed&&!spare&&!Number.isInteger(quantity))||quantity<(request.kind==='opening'?0:0.000001)||quantity>1000000000||fixed&&quantity!==1||spare&&!Number.isSafeInteger(quantity))throw new Error('Cantidad no válida.');
 if(spare&&request.kind==='opening')throw new Error('La apertura de repuestos se administra en Mecánica.');
 if(spare&&outgoing&&!settings.allowSpareDelivery)throw new Error('El administrador no ha habilitado la entrega de repuestos desde Bodega.');
 if(request.kind==='loan'&&!item.allowLoan)throw new Error('El criterio no permite préstamos.');
 const person=(central.personal||[]).find(row=>row.id===request.personId&&!row.deleted&&row.active!==false);
 if(request.kind!=='opening'&&!person)throw new Error('Selecciona el funcionario que entrega o recibe.');
 const date=String(request.fechaISO||'');
 if(!productionDate_(date)||date>Utilities.formatDate(new Date(),'America/Bogota','yyyy-MM-dd'))throw new Error('Fecha no válida.');
 if(spare){const closed=(data.inventoryCounts||[]).filter(row=>row.status==='closed'&&row.origin===spare.origen).sort((a,b)=>b.date.localeCompare(a.date))[0];if(closed&&date<closed.date)throw new Error('La fecha corresponde a un inventario de repuestos cerrado.');}
 let newAsset=null;
 if(request.newAsset){
  if(!fixed||request.kind!=='income')throw new Error('Solo se registran activos nuevos desde Ingresos.');
  const input=request.newAsset;
  if(!/^[-a-zA-Z0-9]{16,100}$/.test(String(input.id||'')))throw new Error('Identificador del activo no válido.');
  if((central.assets||[]).some(row=>row.id===input.id))throw new Error('El activo ya existe. Selecciónalo como registrado.');
  newAsset={id:input.id,clase:item.name,serial:String(input.serial||'').trim().slice(0,160),modelo:String(input.modelo||'').trim().slice(0,100),marcaComercial:String(input.marcaComercial||'').trim().slice(0,100),marcaAnterior:String(input.marcaAnterior||'').trim().slice(0,100),numeroClase:String(input.numeroClase||'').trim().slice(0,30),minaOrigen:String(input.minaOrigen||'Sandra K').trim().slice(0,100),longitud:String(input.longitud||'').trim().slice(0,40),estado:request.incomeType==='REPARACIÓN'?'En reparación':'Operativo/a',ubicacion:'Producción',createdAt:originalStamp_(request.createdAt),syncedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),syncState:'synced'};
  newAsset.mina=newAsset.minaOrigen;newAsset.criteriaId=item.id;newAsset.largo=newAsset.longitud;newAsset.fabricante=newAsset.marcaComercial;
  for(const [flag,field,label] of [['usesLength','largo','largo'],['usesModel','modelo','modelo'],['usesManufacturer','fabricante','fabricante']])if(truthy_(item[flag])&&!newAsset[field])throw new Error('Falta '+label+' del activo.');
  if(repairIncomeClass_(newAsset.clase)){newAsset.tipoIngresoInicial=request.incomeType==='REPARACIÓN'?'REPARACIÓN':'TRASLADO';newAsset.incomeMarking=true;preparePlazaIncomeAsset_(newAsset);}
  if(usesAutomaticAssetMark_(newAsset)){newAsset.markingPolicy='letters-v1';newAsset.markStatus='pending';}
  const peers=[...(central.assets||[]),...(data.warehouseMovements||[]).filter(row=>row.newAsset).map(row=>row.newAsset)];
  if(automaticClassNumberEligible_(newAsset.clase)){newAsset.classNumberPolicy='auto-v1';newAsset.numeroClase=automaticClassNumber_(peers,newAsset);}
  if(!newAsset.numeroClase)throw new Error('Falta el número de clase del activo.');
  if(peers.some(row=>!row.deleted&&cargoNorm_(row.clase)===cargoNorm_(newAsset.clase)&&cargoNorm_(row.minaOrigen||row.mina||'Sandra K')===cargoNorm_(newAsset.minaOrigen)&&String(row.numeroClase||row.numeroYT||'')===newAsset.numeroClase))throw new Error('El número de clase ya pertenece a otro activo.');
  newAsset.numeroYT=newAsset.numeroClase;validateAssetSerials_(peers,[newAsset],central.inventoryCriteria||[]);
 }
 const asset=fixed?(newAsset||(central.assets||[]).find(row=>row.id===request.assetId&&!row.deleted)||(data.warehouseMovements||[]).find(row=>row.bridgePending&&row.newAsset&&row.assetId===request.assetId)?.newAsset):null;
 if(fixed&&(!asset||cargoNorm_(asset.clase)!==cargoNorm_(item.name)))throw new Error('Selecciona un activo registrado de esta clase.');
 if(asset&&productionWarehouseRetired_(asset))throw new Error('El activo está dado de baja.');
 const last=asset&&(data.warehouseMovements||[]).filter(row=>row.assetId===asset.id&&row.status!=='rejected').at(-1);
 const available=asset&&productionWarehouseHoldsAsset_(asset,last);
 const assetState=last?.bridgePending?last.assetStatus:asset?.estado;
 if(outgoing&&fixed&&!available)throw new Error('El activo no está disponible en Bodega de Producción.');
 if(asset&&['delivery','loan'].includes(request.kind)&&!productionWarehouseCanIssue_(asset,assetState))throw new Error('El activo no está habilitado para entrega o préstamo.');
 if(['income','opening'].includes(request.kind)&&asset&&cargoNorm_(asset.ubicacion)==='bodega de superficie')throw new Error('El activo está en Plaza Blending. Registra allí su salida hacia Producción.');
 if(['income','opening'].includes(request.kind)&&asset&&available&&(data.warehouseMovements||[]).some(row=>row.assetId===asset.id))throw new Error('El activo ya se encuentra en Producción.');
 if(request.kind==='opening'&&(data.warehouseMovements||[]).some(row=>row.itemId===item.id&&row.kind==='opening'&&(!fixed||row.assetId===asset.id)))throw new Error('El elemento ya tiene saldo de apertura.');
 if(['income','opening'].includes(request.kind)&&asset&&(data.warehouseMovements||[]).some(row=>row.kind==='loan'&&row.assetId===asset.id&&!((data.warehouseMovements||[]).some(back=>back.kind==='return'&&back.loanId===row.id))))throw new Error('El activo tiene un préstamo pendiente. Registra su reintegro.');
 let loan=null;
 if(request.kind==='return'){
  loan=(data.warehouseMovements||[]).find(row=>row.id===request.loanId&&row.kind==='loan'&&row.status!=='rejected');
  if(!loan||loan.itemId!==item.id||fixed&&loan.assetId!==asset.id)throw new Error('Préstamo no válido.');
  const returned=(data.warehouseMovements||[]).filter(row=>row.loanId===loan.id&&row.kind==='return'&&row.status!=='rejected').reduce((n,row)=>n+row.quantity,0);
  if(quantity>loan.quantity-returned)throw new Error('La cantidad supera lo pendiente de devolver.');
 }
 if(outgoing&&!fixed&&quantity>productionWarehouseBalance_(data,item,central))throw new Error('La cantidad supera las existencias confirmadas de Producción.');
 let sourceLoan=null;
 if(request.kind==='transfer_out'){
  const imports=(data.warehouseMovements||[]).filter(row=>row.kind==='transfer_in'&&row.sourceLoan&&row.itemId===item.id&&(!fixed||row.assetId===asset.id));
  sourceLoan=imports.find(row=>row.sourceDeliveryId===request.sourceLoanId)||(!request.sourceLoanId&&fixed?imports.filter(row=>!(data.warehouseMovements||[]).some(out=>out.sourceLoanId===row.sourceDeliveryId)).at(-1):null);
  if(request.sourceLoanId&&!sourceLoan)throw new Error('No existe ese préstamo de Plaza para este elemento.');
  if(sourceLoan){
   if(quantity!==sourceLoan.quantity)throw new Error('El préstamo de Plaza debe devolverse completo.');
   if((data.warehouseMovements||[]).some(row=>row.sourceLoanId===sourceLoan.sourceDeliveryId)||(central.blendingDeliveries||[]).some(row=>!row.deleted&&row.movementType==='DEVOLUCIÓN'&&row.loanId===sourceLoan.sourceDeliveryId))throw new Error('El préstamo de Plaza ya fue devuelto.');
  }
 }
 const destination=String(request.destination||'').trim().slice(0,160);
 if(['delivery','loan'].includes(request.kind)&&!destination)throw new Error('Indica dónde estará el elemento.');
 const now=new Date().toISOString(),row=productionWarehouseAppend_(data,{id:request.id,kind:request.kind,itemId:item.id,itemName:item.name,unit:item.unit||'Unidad',quantity,delta:outgoing?-quantity:quantity,assetId:asset?.id||'',assetLabel:asset?[asset.marcaActual||asset.marcaInterna||asset.marcaAnterior,asset.serial].filter(Boolean).join(' · '):'',personId:person?.id||'',personName:person?.nombre||'',destination:request.kind==='transfer_out'?'Plaza Blending':destination,loanId:loan?.id||'',sourceLoanId:sourceLoan?.sourceDeliveryId||'',notes:String(request.notes||'').slice(0,1000),fechaISO:date,recordedAt:originalStamp_(request.createdAt),createdAt:now,recordedBy:user.document,recordedByName:actor.nombre||user.document,shiftKeeperId:keeper?.id||'',shiftKeeperName:keeper?.nombre||'',shiftKeeperDocument:keeper?.documento||'',target:spare?'mechanics':'warehouse',status:'synced',requestSignature:JSON.stringify(request)});
 if(spare){
  const kind=outgoing?'warehouse-out':request.kind==='return'?'warehouse-return':'income';
  (data.incomes||(data.incomes=[])).push({id:'warehouse-'+row.id,kind,...spare,cantidad:quantity,fechaISO:date,createdAt:now,recordedAt:now,sourceCreatedAt:row.recordedAt,sourceWarehouseMovementId:row.id,registradoPor:user.document,registradoPorNombre:row.recordedByName});
 }
 if(asset||request.kind==='transfer_out'){
  row.bridgePending=true;
  if(newAsset)row.newAsset=newAsset;
  row.assetLocation=request.kind==='transfer_out'?'Bodega de Superficie':outgoing?'Producción · '+destination:'Producción';
  row.assetBaseVersion=asset?.updatedAt||'';
  if(asset)row.assetStatus=request.kind==='income'&&request.incomeType==='REPARACIÓN'?'En reparación':assetState;
 }
 return {row,duplicate:false};
}
// Diario durable: se guarda en Producción antes de proyectar cambios compartidos.
// Una respuesta perdida o una escritura fallida se recupera por ID sin repetir cantidades.
function productionRecoverBridge_(centralId,central,heldLock){
 if(typeof PropertiesService==='undefined'||PropertiesService.getScriptProperties().getProperty('SK_PRODUCTION_BRIDGE')!=='pending')return central;
 const owned=Boolean(heldLock),lock=heldLock||LockService.getScriptLock();
 if(!owned)lock.waitLock(30000);
 try{
  if(!owned)central=JSON.parse(DriveApp.getFileById(centralId).getBlob().getDataAsString('UTF-8'));
  const file=productionDataFile_();if(!file){PropertiesService.getScriptProperties().deleteProperty('SK_PRODUCTION_BRIDGE');return central;}
  const data=productionReadData_(file),pending=(data.warehouseMovements||[]).filter(row=>row.bridgePending);
  if(!pending.length){PropertiesService.getScriptProperties().deleteProperty('SK_PRODUCTION_BRIDGE');return central;}
  let changed=false;
  for(const row of pending){
   if(row.assetId){
    let asset=(central.assets||[]).find(asset=>asset.id===row.assetId);
    if(!asset&&row.newAsset){
     const marking=assignAssetMarks_(central,[row.newAsset],{document:row.recordedBy,role:'production_warehouse'});asset=marking.assets[0];
     (central.assets||(central.assets=[])).push(asset);if(marking.registry.length)central.assetMarkRegistry=marking.registry;changed=true;
     row.assetLabel=[asset.marcaActual||asset.marcaInterna||asset.marcaAnterior,asset.serial].filter(Boolean).join(' · ');
    }
    if(!asset)throw new Error('No se encontró el activo para completar el traslado.');
    if(Number(asset.productionMovementRevision||0)<row.revision){
     asset.ubicacion=row.assetLocation;asset.estado=row.assetStatus||asset.estado;
     asset.productionMovementRevision=row.revision;asset.updatedAt=row.createdAt;changed=true;
    }
   }
   if(row.kind==='transfer_out'){
    const id='production-'+row.id,incomes=row.sourceLoanId?(central.blendingDeliveries||(central.blendingDeliveries=[])):(central.blendingIncomes||(central.blendingIncomes=[]));
    if(!incomes.some(income=>income.id===id)){
     const recordedAt=warehouseOriginalStamp_(row);
     const income={id,syncEventId:id,itemId:row.itemId,itemName:row.itemName,quantity:row.quantity,
      assetId:row.assetId,assetLabel:row.assetLabel,broughtById:row.personId,broughtByName:row.personName,
      sourceWarehouseId:'production',sourceMovementId:row.id,operatorName:row.recordedByName,operatorDocument:row.recordedBy,
      shiftKeeperId:row.shiftKeeperId,shiftKeeperName:row.shiftKeeperName,shiftKeeperDocument:row.shiftKeeperDocument,
      ...(row.sourceLoanId?{movementType:'DEVOLUCIÓN',loanId:row.sourceLoanId,returnedAt:recordedAt,returnedById:row.personId,returnedByName:row.personName,destination:'Bodega de Superficie'}:{}),
      notes:row.notes,recordedAt,createdAt:recordedAt,syncedAt:row.createdAt,updatedAt:row.createdAt,syncState:'synced'};
     if(!row.assetId){
      const stocks=central.inventoryStock||(central.inventoryStock=[]);
      let stock=stocks.find(x=>x.itemId===row.itemId);
      if(!stock){stock={id:'stock-'+row.itemId,itemId:row.itemId,quantity:0};stocks.push(stock)}
      income.balanceBefore=Number(stock.quantity)||0;income.balanceAfter=income.balanceBefore+row.quantity;
      stock.quantity=income.balanceAfter;stock.updatedAt=row.createdAt;plazaBalanceStamp_(stock,income);
     }
     incomes.push(income);
     changed=true;
    }
   }
   row.bridgePending=false;
  }
  if(changed){central.updatedAt=nextRevision_(central.updatedAt);writeFile_(centralId,central);}
  productionSaveData_(file,data);
  PropertiesService.getScriptProperties().deleteProperty('SK_PRODUCTION_BRIDGE');
  return central;
 }finally{if(!owned)lock.releaseLock()}
}
// Recupera la hora original de traslados antiguos a partir de la solicitud guardada.
function restorePlazaTransferTimes_(central,data){
 const transfers=[...(central.blendingIncomes||[]),...(central.blendingDeliveries||[])].filter(row=>
  row.sourceWarehouseId==='production'&&row.sourceMovementId&&!row.syncedAt&&row.movementType!=='REVERSIÓN');
 if(!transfers.length)return false;
 const sources=new Map((data.warehouseMovements||[]).map(row=>[row.id,row]));
 let changed=false;
 for(const transfer of transfers){
  const source=sources.get(transfer.sourceMovementId);
  const original=source&&warehouseOriginalStamp_(source);
  if(!original||!source.createdAt)continue;
  if(transfer.returnedAt===transfer.createdAt)transfer.returnedAt=original;
  transfer.syncedAt=source.createdAt;
  transfer.createdAt=original;
  changed=true;
 }
 return changed;
}
function productionWarehouseSync_(q){
 const lock=LockService.getScriptLock();lock.waitLock(30000);
 try{
  const id=findFile_(),central=id?readFile_(id,lock):{},user=verifyProductionToken_(q.token,central);
  if(!productionCan_(user,'warehouse'))throw new Error('No tienes acceso a Bodega de Producción.');
  const person=(central.personal||[]).find(row=>row.id===user.personId&&!row.deleted);
  if(!person)throw new Error('Colaborador no disponible.');
  let file=productionDataFile_(),data=productionReadData_(file),changed=productionImportPlaza_(data,central);
  if(id&&restorePlazaTransferTimes_(central,data)){
   central.updatedAt=nextRevision_(central.updatedAt);
   writeFile_(id,central);
  }
  const withShift=Array.isArray(q.shiftMovements),pending=withShift?q.shiftMovements:Array.isArray(q.pending)?q.pending:[];
  if(pending.length>1000||new Set(pending.map(row=>row.id)).size!==pending.length)throw new Error('Envía un máximo de 1000 movimientos con identificadores únicos.');
  const receipts=[];
  for(const request of pending){
   try{const applied=productionWarehouseApply_(data,central,request,user,person,withShift||request.recordedBy!==undefined);changed=changed||!applied.duplicate;receipts.push({id:request.id,status:applied.duplicate?'already-applied':'accepted'});}
   catch(error){receipts.push({id:request.id,status:'rejected',error:String(error.message||error)});}
  }
  if(changed){
   if((data.warehouseMovements||[]).some(row=>row.bridgePending))PropertiesService.getScriptProperties().setProperty('SK_PRODUCTION_BRIDGE','pending');
   file=productionSaveData_(file,data);
  }
  productionRecoverBridge_(id,central,lock);
  if(file)data=productionReadData_(file);
  const revision=Number(data.warehouseRevision)||0,cursor=Number(q.cursor)||0,reset=cursor>revision;
  const rows=(data.warehouseMovements||[]).filter(row=>reset||row.revision>cursor);
  const criteria=(central.inventoryCriteria||[]).filter(row=>!row.deleted&&row.active!==false&&!productionWarehouseEpp_(row));
  const lastByAsset=new Map();
  for(const row of data.warehouseMovements||[])if(row.assetId&&row.status!=='rejected')lastByAsset.set(row.assetId,row);
  const fixedCounts=new Map(),assets=[];
  for(const row of central.assets||[]){
   if(row.deleted)continue;
   const inWarehouse=productionWarehouseHoldsAsset_(row,lastByAsset.get(row.id)),canIssue=productionWarehouseCanIssue_(row,row.estado);
   const key=cargoNorm_(row.clase);
   if(inWarehouse&&canIssue)fixedCounts.set(key,(fixedCounts.get(key)||0)+1);
   assets.push({id:row.id,clase:row.clase,marcaActual:row.marcaActual||row.nuevaMarca,marcaInterna:row.marcaInterna,marcaAnterior:row.marcaAnterior,numeroClase:row.numeroClase||row.numeroYT,serial:row.serial,estado:row.estado,ubicacion:row.ubicacion,updatedAt:row.updatedAt,inWarehouse,canIssue});
  }
  const balances=criteria.map(item=>({itemId:item.id,quantity:item.isFixedAsset===true?(fixedCounts.get(cargoNorm_(item.name))||0):productionWarehouseBalance_(data,item,central)}));
  const assetRevision=(data.warehouseMovements||[]).filter(row=>row.assetId).at(-1)?.revision||0;
  const catalogRevision='warehouse-assets-v2|turno1|'+(central.updatedAt||'')+'|'+assetRevision;
  const catalogChanged=q.catalogRevision!==catalogRevision;
  return json_({ok:true,protocol:'production-warehouse-v1',shiftKeeperV1:true,reset,cursor:revision,rows,receipts,balances,settings:productionWarehouseSettings_(),roles:productionRoles_(user),catalogRevision,...(catalogChanged?{catalog:{criteria,personal:(central.personal||[]).filter(row=>!row.deleted&&row.active!==false).map(row=>({id:row.id,nombre:row.nombre,documento:row.documento,empresa:row.empresa})),assets}}:{}),syncedAt:new Date().toISOString()});
 }finally{lock.releaseLock()}
}

// Copia para Apps Script de asset-history.js. La prueba de paridad comprueba el módulo completo.
function createAssetHistory(){
 'use strict';
 const text=value=>String(value??'').trim();
 const norm=value=>text(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
 const millis=value=>Date.parse(value)||0;
 let colombiaClock;
 const reversed=row=>!!(row.reversed||row.reversado||row.reversedAt);
 const isRetiredState=value=>/^dad[oa](?:\/[oa])? de baja$/.test(norm(value));
 const isRetirementNotice=value=>/^dad[oa](?:\/[oa])? de baja(?: mediante acta)?$/.test(norm(value));
 const retired=asset=>isRetiredState(asset?.estado)||/retirad[oa]|desechad[oa]/i.test(`${asset?.estado||''} ${asset?.ubicacion||''}`);
 const inventoryLocation=area=>text(area)?'Inventario de '+text(area):'Inventario de área por confirmar';
 function assignmentArea(row,receiver){return text(row.destinationArea)||(/^Inventario de (.+)$/i.exec(text(row.destination))?.[1]||'')||receiver?.area||'';}
 function assignmentLocation(row,receiver){
  if(row.destinationArea)return inventoryLocation(row.destinationArea);
  const destination=text(row.destination);
  return !destination||['operacion','bodega de superficie'].includes(norm(destination))?inventoryLocation(assignmentArea(row,receiver)):destination;
 }
 function localTime(value){
  if(!millis(value))return {date:'',time:''};
  if(!colombiaClock)colombiaClock=new Intl.DateTimeFormat('en-US',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const parts=Object.fromEntries(colombiaClock.formatToParts(new Date(value)).map(p=>[p.type,p.value]));
  return {date:`${parts.year}-${parts.month}-${parts.day}`,time:`${parts.hour}:${parts.minute}`};
 }
 function eventTime(row){
  if(millis(row.occurredAt))return row.occurredAt;
  if(/^\d{4}-\d{2}-\d{2}$/.test(text(row.fechaNovedad))){const value=row.fechaNovedad+'T'+(row.horaNovedad||'00:00')+'-05:00';if(millis(value))return value;}
  return row.createdAt||''; // updatedAt is a synchronization/edit time, not the event time.
 }
 function person(lookup,id,document,name,area='',cargo=''){
  document=text(document);name=text(name);
  // Older manual novelties snapshot the option label as "document - name".
  const match=name.match(/^([\d. -]+?)\s+-\s+(.+)$/);
  if(match){document=document||match[1].trim();name=match[2].trim();}
  const found=lookup(id,document);
  return {id:text(id||found?.id),document:document||text(found?.documento),name:name||text(found?.nombre),area:text(area||found?.area),cargo:text(cargo||found?.cargo)};
 }
 function warehouse(row,lookupPerson,manual){
  if(!manual&&(row.shiftKeeperId||row.shiftKeeperDocument||row.shiftKeeperName))
   return person(lookupPerson,row.shiftKeeperId,row.shiftKeeperDocument,row.shiftKeeperName);
  return person(lookupPerson,row.bodegueroId,row.documentoBodeguero,row.bodegueroNombre||row.nombreBodeguero);
 }
 function registeredBy(row,lookupPerson){
  const doc=text(row.actorDocument||row.operatorDocument),mismatch=row.actorDocument&&row.operatorDocument&&text(row.actorDocument)!==text(row.operatorDocument);
  return person(lookupPerson,mismatch?'':row.operatorId,doc,mismatch?'':row.operatorName);
 }
 function timeline(data={},assetId){
  const rows=data.personal||[],entries=new Map();let order=0;
  const lookupPerson=data.lookupPerson||((id,doc)=>doc?rows.find(p=>text(p.documento)===doc):id&&rows.find(p=>text(p.id)===text(id)));
  for(const source of ['novelties','blendingIncomes','blendingDeliveries'])for(const row of data[source]||[]){
   if(!row||row.deleted||!row.assetId||(assetId&&text(row.assetId)!==text(assetId)))continue;
   const manual=source==='novelties',income=source==='blendingIncomes',back=norm(row.movementType)==='devolucion';
   const kind=manual?'novelty':income?'income':back?'return':row.exitKind==='mine'?'mineExit':row.exitKind==='warehouse'?'transfer':norm(row.deliveryType)==='prestamo'?'loan':'assignment';
   const at=back?(row.returnedAt||row.createdAt||''):manual?eventTime(row):row.createdAt||'';
   const responsible=manual?person(lookupPerson,row.responsableId,row.documentoResponsable,row.responsableNombre||row.nombreResponsable):income?person(lookupPerson,row.broughtById,row.broughtByDocument,row.broughtByName):back?person(lookupPerson,row.returnedById,row.returnedByDocument,row.returnedByName):person(lookupPerson,row.recipientId,row.recipientDocument,row.recipientName,row.recipientArea,row.recipientCargo);
   const title=manual?(row.descripcion||'Novedad'):income?'Ingreso a bodega':back?'Devolución de préstamo':kind==='mineExit'?row.deliveryType+' · '+row.destinationMine:kind==='transfer'?'Traslado a bodega':kind==='loan'?'Préstamo':'Asignación';
   const key=source+':'+(row.id||[row.assetId,at,row.recipientId,row.broughtById,row.descripcion].join('|'));
   const entry={key,order:++order,assetId:row.assetId,source,kind,title,at,epoch:millis(at),...localTime(at),responsible,warehouse:warehouse(row,lookupPerson,manual),registeredBy:manual?null:registeredBy(row,lookupPerson),location:manual?row.ubicacion||'':income||back?'Bodega de Superficie':row.destination||'Operación',state:manual?row.estado||'':'',reversed:reversed(row),pending:row.syncState==='pending',raw:row};
   const previous=entries.get(key);
   if(!previous||millis(row.updatedAt)>=millis(previous.raw.updatedAt))entries.set(key,entry);
  }
  return [...entries.values()].sort((a,b)=>b.epoch-a.epoch||b.order-a.order);
 }
 function damaged(asset){return /^(?:averiado|averiada|averiado\/a)$/.test(norm(asset?.estado));}
 function operationStatus(asset){return damaged(asset)||retired(asset)?'No':'Sí';}
 function preserveLastNovelty(edit,stored){
  for(const key of ['fechaNovedad','horaNovedad','descripcionNovedad','currentNoveltyId','estado','estadoVisor','ubicacion','disponibleEntrega','nombreResponsable','documentoResponsable','nombreBodeguero','documentoBodeguero','pendingNoveltyActions']){
   if(Object.prototype.hasOwnProperty.call(stored,key))edit[key]=stored[key];else delete edit[key];
  }
 }
 function latestIncomeNote(asset,data){
  const event=timeline(data,asset.id).find(entry=>entry.kind==='income'&&!entry.reversed&&!entry.raw.reversalOf&&norm(entry.raw.movementType)!=='reversion');
  return text(event?.raw.notes);
 }
 const profileFields=['fechaNovedad','horaNovedad','descripcionNovedad','currentNoveltyId','estado','ubicacion',
  'areaAsignada','areaAsignadaRevision','asignadaId','estadoVisor','nombreResponsable','documentoResponsable',
  'nombreBodeguero','documentoBodeguero','disponibleEntrega'];
 const noveltyFields={estado:'estado',ubicacion:'ubicacion',areaAsignada:'areaAsignada',estadoVisor:'estadoVisor',
  responsableNombre:'nombreResponsable',documentoResponsable:'documentoResponsable',
  bodegueroNombre:'nombreBodeguero',documentoBodeguero:'documentoBodeguero'};
 function snapshot(asset){
  return Object.fromEntries(profileFields.filter(key=>Object.prototype.hasOwnProperty.call(asset,key)).map(key=>[key,asset[key]]));
 }
 function eventPatch(entry){
  const row=entry.raw,patch={fechaNovedad:entry.date,horaNovedad:entry.time,descripcionNovedad:entry.title,currentNoveltyId:row.id};
  if(entry.kind==='novelty'){
   for(const [source,target] of Object.entries(noveltyFields))if(text(row[source]))patch[target]=text(row[source]);
   if(entry.responsible.name)patch.nombreResponsable=entry.responsible.name;
   if(entry.responsible.document)patch.documentoResponsable=entry.responsible.document;
   if(entry.warehouse.name)patch.nombreBodeguero=entry.warehouse.name;
   if(entry.warehouse.document)patch.documentoBodeguero=entry.warehouse.document;
   if(text(row.areaAsignada))patch.areaAsignadaRevision={value:text(row.areaAsignada),at:entry.at};
  }else{
   Object.assign(patch,{ubicacion:entry.kind==='assignment'?assignmentLocation(row,entry.responsible):entry.location,
    nombreResponsable:entry.responsible.name,documentoResponsable:entry.responsible.document,
    nombreBodeguero:entry.warehouse.name,documentoBodeguero:entry.warehouse.document});
   if(entry.kind==='assignment')Object.assign(patch,{asignadaId:entry.responsible.id,areaAsignada:assignmentArea(row,entry.responsible)});
   if(['income','return','mineExit','transfer'].includes(entry.kind))Object.assign(patch,{asignadaId:'',areaAsignada:''});
  }
  return patch;
 }
 // Solo repone los campos afectados que no tienen otro cambio vigente posterior.
 // Los registros antiguos se reconstruyen con los valores documentados del historial.
 function restoreNovelty(asset,row,data={}){
  if(row.historyOnly)return {...asset};
  const complete={...data,novelties:(data.novelties||[]).map(item=>({...item,deleted:false}))};
  const events=timeline(complete,asset.id).map(entry=>({...entry,patch:eventPatch(entry)}));
  const index=events.findIndex(entry=>entry.kind==='novelty'&&entry.raw.id===row.id);
  if(index<0)return {...asset};
  const target=events[index],older=events.slice(index+1),later=events.slice(0,index);
  const deletedIds=new Set((data.novelties||[]).filter(item=>item.deleted).map(item=>item.id));
  const inactive=entry=>entry.reversed||entry.kind==='novelty'&&deletedIds.has(entry.raw.id);
  const applied=entry=>!entry.raw.historyOnly;
  const values=target.patch,before=row.assetBefore;
  const result={...asset};
  const metadata=['fechaNovedad','horaNovedad','descripcionNovedad','currentNoveltyId'];
  const storedTarget=asset.currentNoveltyId===row.id||!asset.currentNoveltyId&&asset.fechaNovedad===target.date&&
   text(asset.horaNovedad).slice(0,5)===target.time&&norm(asset.descripcionNovedad)===norm(target.title);
  for(const key of Object.keys(values)){
   const laterValue=later.some(entry=>applied(entry)&&!inactive(entry)&&Object.prototype.hasOwnProperty.call(entry.patch,key)&&
    JSON.stringify(result[key])===JSON.stringify(entry.patch[key]));
   if(laterValue&&!(storedTarget&&metadata.includes(key)))continue;
   const expected=row.assetAfter&&Object.prototype.hasOwnProperty.call(row.assetAfter,key)?row.assetAfter[key]:values[key];
   // Current metadata may still be the original snapshot in records created by older clients.
   if(JSON.stringify(result[key])!==JSON.stringify(expected))continue;
   let value=before?before[key]:undefined;
   if(!before){
    const known=older.find(entry=>applied(entry)&&!inactive(entry)&&Object.prototype.hasOwnProperty.call(entry.patch,key));
    if(known)value=known.patch[key];
    else if(key==='estadoVisor'&&row.estadoVisorAnterior)value=row.estadoVisorAnterior;
   }else{
    for(const entry of older){
     if(!applied(entry)||!Object.prototype.hasOwnProperty.call(entry.patch,key))continue;
     if(!inactive(entry))break;
     const after=entry.raw.assetAfter||entry.patch;
     if(JSON.stringify(value)!==JSON.stringify(after[key]))break;
     if(entry.raw.assetBefore)value=entry.raw.assetBefore[key];
     else{
      const known=older.slice(older.indexOf(entry)+1).find(previous=>applied(previous)&&!inactive(previous)&&Object.prototype.hasOwnProperty.call(previous.patch,key));
      value=known?known.patch[key]:undefined;
     }
    }
   }
   if(value===undefined)delete result[key];else result[key]=value;
  }
  if(isRetiredState(result.estado))result.ubicacion='Desechado/a';
  result.disponibleEntrega=operationStatus(result);
  return result;
 }
 // La fecha de captura/sincronización nunca decide qué novedad ocupa la ficha.
 function applyDatedNovelty(asset,row){
  const day=text(row.fechaNovedad),time=text(row.horaNovedad),priorDay=text(asset.fechaNovedad);
  if(row.historyOnly||!day||day<priorDay||(day===priorDay&&time<=text(asset.horaNovedad||'00:00').slice(0,5)))return null;
  const result={...asset,fechaNovedad:day,horaNovedad:time,descripcionNovedad:row.descripcion,currentNoveltyId:row.id};
  for(const [source,target] of Object.entries(noveltyFields))if(text(row[source]))result[target]=text(row[source]);
  if(text(row.areaAsignada))result.areaAsignadaRevision={value:result.areaAsignada,at:eventTime(row)};
  if(isRetiredState(result.estado))result.ubicacion='Desechado/a';
  result.disponibleEntrega=operationStatus(result);
  return result;
 }
 function project(asset,data={}){
  const actions=(data.novelties||[]).filter(row=>row.assetId===asset.id&&row.syncState==='pending'&&row.noveltyAction?.status==='pending')
   .sort((a,b)=>millis(a.noveltyAction.requestedAt)-millis(b.noveltyAction.requestedAt));
  const processed=new Set(asset.pendingNoveltyActions||[]);
  for(const row of actions){
   if(processed.has(row.noveltyAction.id))continue;
   if(!row.noveltyAction.localOnly||asset.currentNoveltyId===row.id)asset=restoreNovelty(asset,row,data);
   processed.add(row.noveltyAction.id);
  }
  if(processed.size)asset={...asset,pendingNoveltyActions:[...processed]};
  const events=timeline(data,asset.id);
  // Las novedades fechadas confirmadas ya se aplicaron a la ficha en el servidor.
  const active=events.filter(e=>!e.reversed&&!e.raw.datedNovelty&&!e.raw.historyOnly);
  let latest=active[0],result={...asset};
  // A previously displayed source event is not an independent manual snapshot.
  // This also lets a reversal fall back to the preceding valid event after an owner saved the form.
  const linkedSnapshot=!asset.currentNoveltyId&&events.some(e=>!e.raw.datedNovelty&&!e.raw.historyOnly&&e.date===asset.fechaNovedad&&e.time===asset.horaNovedad&&norm(e.title)===norm(asset.descripcionNovedad));
  const snapshotTime=!linkedSnapshot&&asset.fechaNovedad?millis(eventTime(asset)):0;
  const coversSnapshot=epoch=>asset.currentNoveltyId?Math.floor(epoch/60000)>Math.floor(snapshotTime/60000):epoch>=snapshotTime;
  if(latest&&latest.epoch&&coversSnapshot(latest.epoch)){
   Object.assign(result,{fechaNovedad:latest.date,horaNovedad:latest.time,descripcionNovedad:latest.title,documentoResponsable:latest.responsible.document,nombreResponsable:latest.responsible.name,documentoBodeguero:latest.warehouse.document,nombreBodeguero:latest.warehouse.name});
   if(!retired(asset)&&latest.location)result.ubicacion=latest.kind==='assignment'?assignmentLocation(latest.raw,latest.responsible):latest.location;

   if(asset.currentNoveltyId)delete result.currentNoveltyId;
   // Keep the stored physical state: an assignment by itself does not certify operability.
  }
  if(!latest&&linkedSnapshot)Object.assign(result,{fechaNovedad:'',horaNovedad:'',descripcionNovedad:'',documentoResponsable:'',nombreResponsable:'',documentoBodeguero:'',nombreBodeguero:''});
  const movement=active.find(e=>e.kind!=='novelty');
  let assigned=null;
  if(movement&&coversSnapshot(movement.epoch)){
   const backInWarehouse=norm(result.ubicacion)==='bodega de superficie';
   if(movement.kind==='assignment'&&!retired(asset)&&!backInWarehouse){assigned={...movement.responsible,area:assignmentArea(movement.raw,movement.responsible)};result.asignadaId=assigned.id;result.areaAsignada=assigned.area||asset.areaAsignada||'';}
   else if(['income','return','mineExit','transfer'].includes(movement.kind)||retired(asset)||backInWarehouse){assigned={id:'',document:'',name:'',area:'',cargo:''};result.asignadaId='';result.areaAsignada='';}
  }
  // La asignación explícita de una novedad prevalece hasta el siguiente movimiento.
  // Se deriva del historial también cuando un auxiliar sincroniza con un servidor anterior.
  const areaEvent=active.find(event=>['assignment','income','return','mineExit','transfer'].includes(event.kind)||(event.kind==='novelty'&&text(event.raw.areaAsignada)));
  if(areaEvent?.kind==='novelty'&&coversSnapshot(areaEvent.epoch)&&!retired(result)){
   result.areaAsignada=text(areaEvent.raw.areaAsignada);
  }
  // Guardar una edición de la ficha no debe recuperar después un área histórica.
  const areaRevision=asset.areaAsignadaRevision;
  if(areaRevision&&millis(areaRevision.at)>0&&millis(areaRevision.at)>=(areaEvent?.epoch||0)&&!retired(result))result.areaAsignada=text(areaRevision.value);
  if(asset.currentNoveltyId&&(!latest||!coversSnapshot(latest.epoch)))
   latest=events.find(event=>event.raw.id===asset.currentNoveltyId);
  const pending=events.filter(e=>e.raw.datedNovelty&&e.pending&&!e.raw.historyOnly&&!e.reversed)
   .sort((a,b)=>millis(a.raw.createdAt)-millis(b.raw.createdAt)||a.epoch-b.epoch||a.order-b.order);
  for(const entry of pending){
   const updated=applyDatedNovelty(result,entry.raw);
   if(updated){result=updated;latest=entry;}
  }
  if(isRetiredState(result.estado))result.ubicacion='Desechado/a';
  result.disponibleEntrega=operationStatus(result);
  return {asset:result,events,latest,assigned};
 }
 function available(asset,data){const current=project(asset,data).asset;return !current.deleted&&!retired(current)&&norm(current.ubicacion)==='bodega de superficie';}
 // Prepara una consulta de varios activos sobre una misma lectura, incluidas novedades pendientes o eliminadas.
 function batchProjector(data={}){
  const byId=new Map(),byDocument=new Map();
  for(const person of data.personal||[]){
   const id=text(person.id),doc=text(person.documento);
   if(id&&!byId.has(id))byId.set(id,person);
   if(doc&&!byDocument.has(doc))byDocument.set(doc,person);
  }
  const lookupPerson=(id,doc)=>doc?byDocument.get(doc):id&&byId.get(text(id));
  const byAsset=new Map();
  for(const source of ['novelties','blendingIncomes','blendingDeliveries']){
   for(const row of data[source]||[]){
    if(!row?.assetId)continue;
    const id=text(row.assetId);
    if(!byAsset.has(id))byAsset.set(id,{lookupPerson,novelties:[],blendingIncomes:[],blendingDeliveries:[]});
    byAsset.get(id)[source].push(row);
   }
  }
  const empty={lookupPerson};
  return asset=>project(asset,asset.id?(byAsset.get(text(asset.id))||empty):data);
 }
 return {isRetiredState,isRetirementNotice,preserveLastNovelty,timeline,project,batchProjector,applyDatedNovelty,snapshot,restoreNovelty,localTime,available,damaged,operationStatus,latestIncomeNote,inventoryLocation,assignmentArea,assignmentLocation};
}
