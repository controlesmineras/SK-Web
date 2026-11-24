'use strict';
const $=id=>document.getElementById(id), report=$('reportForm'),f=report.elements,login=$('accessForm');
const {doc,norm,name:personName,today,shift,people,matches,access}=FrontStore;
const labels={D:'Día',T:'Tarde',S:'Serena'},statuses={pending:'Pendiente',synced:'Sincronizado',review:'Por revisar'};
const personKeys=['documento','primerNombre','segundoNombre','primerApellido','segundoApellido','empresa','area','cargo','telefono'];
const stamp=()=>crypto.randomUUID();
const sessionKey='sk-frentes:session';
const updateDraftKey='sk-frentes:update-draft';
let session=null,state=FrontStore.empty(),editing=null,manualShift=false,running=null,generation=0;
const selected=[];
let activeRequest,savingReport=null;
const owner=s=>'labor:'+s.user.documento;
const message=(id,text)=>{$(id).textContent=text;};
function samePerson(a,b){
  const documentKey=doc(a.documento);
  return a.id===b.id || (documentKey!=='' && documentKey===doc(b.documento));
}
function list(){
  const directory=people(state,editing?.id);
  return directory.concat(selected.filter(p=>p.draftNew&&!directory.some(row=>samePerson(row,p))));
}
const newMode=()=>!$('personFields').disabled;
const options=(key)=>state.options[key]||window.SKFormOptions?.values(key)||[];
function selectOptions(control,placeholder,values){
  const old=control.value;
  control.replaceChildren(new Option(placeholder,''),...values.map(x=>new Option(x,x)));
  if(values.includes(old))control.value=old;
}
function catalogs(){
  selectOptions(f.empresa,'Seleccionar empresa',options('personal.company'));
  selectOptions(f.area,'Seleccionar área',options('personal.area').filter(x=>norm(f.empresa.value)!=='desmin'||norm(x)!=='produccion - selectivo (corteros)'));
  $('cargos').replaceChildren(...options('personal.role').map(x=>new Option(x,x)));
}
for(let n=1;n<=16;n++)f.nivel.add(new Option('Nivel '+n,String(n)));
f.nivel.onchange=()=>{f.corte.disabled=!f.nivel.value;};
f.empresa.onchange=catalogs;
for(const radio of f.turno)radio.onchange=()=>{manualShift=true;};
function updateShift(){if(!manualShift&&!editing)f.turno.value=shift();}
function showRegistration(open){
  $('lookup').hidden=open||Boolean(editing&&selected.length);
  $('personFields').hidden=$('personFields').disabled=!open;
  if(!open)$('details').disabled=true;
}
function clearSearch(){
  showRegistration(false);$('search').value='';$('matches').replaceChildren();$('add').hidden=true;
}
function paintSelected(){
  const cards=$('chosen');
  cards.hidden=!selected.length;
  cards.replaceChildren(...selected.map(p=>{
    const card=document.createElement('li');
    const identity=document.createElement('div');
    const title=document.createElement('strong');
    const meta=document.createElement('span');
    const remove=document.createElement('button');
    card.className='chosen';
    title.textContent=personName(p);
    meta.className='meta';
    meta.textContent=info(p);
    remove.type='button';
    remove.className='small';
    remove.textContent='×';
    remove.setAttribute('aria-label','Quitar a '+personName(p));
    remove.onclick=()=>{
      if(savingReport)return;
      selected.splice(selected.indexOf(p),1);
      paintSelected();
      if(newMode())results(true);
      else{
        showRegistration(false);
        results();
        $('search').focus();
      }
    };
    identity.append(title,meta);
    card.append(identity,remove);
    return card;
  }));
}
function reset(){
  editing=null;manualShift=false;report.reset();selected.length=0;paintSelected();clearSearch();f.fecha.value=today();updateShift();f.corte.disabled=true;
  message('personLegend','Funcionarios');
  $('cancelReview').hidden=true;message('editorTitle','Nuevo reporte');message('save','Guardar reporte');catalogs();
}
function choose(p){
  if(savingReport||p.active===false||selected.some(row=>samePerson(row,p))||(editing&&selected.length))return;
  selected.push(p);clearSearch();paintSelected();message('notice','');
  if(editing)$('save').focus();else $('search').focus();
}
function info(p){return [p.documento,p.empresa,p.cargo,p.active===false?'Inactivo':'',p.draftNew?'Nuevo funcionario':p.local?'Pendiente en este dispositivo':''].filter(Boolean).join(' · ');}
function highlighted(node,value,query){
  const text=String(value||''),key=norm(query),pos=norm(text).indexOf(key);
  if(!key||pos<0){node.textContent=text;return;}
  const mark=document.createElement('mark');mark.textContent=text.slice(pos,pos+key.length);
  node.append(text.slice(0,pos),mark,text.slice(pos+key.length));
}
function results(byDoc=false){
  const value=(byDoc?f.documento:$('search')).value.trim(),box=$(byDoc?'docMatches':'matches');
  const found=matches(list(),value,byDoc);box.replaceChildren();
  const exact=byDoc&&found.find(p=>doc(p.documento)===doc(value));
  if(byDoc){
    $('details').disabled=!/^[A-Z0-9]{1,32}$/.test(doc(value))||Boolean(exact);
    $('includePerson').disabled=$('details').disabled;
  }
  else $('add').hidden=!value||found.length>0;
  if(!value)return;
  for(const p of found.slice(0,12)){
    const added=selected.some(row=>samePerson(row,p));
    const b=document.createElement('button');b.type='button';b.disabled=p.active===false||added;
    const title=document.createElement('strong'),meta=document.createElement('span');meta.className='meta';
    highlighted(title,personName(p),value);highlighted(meta,info(p)+(added?' · Ya agregado':''),value);b.append(title,meta);b.onclick=()=>choose(p);box.append(b);
  }
  let note='';
  if(exact&&selected.some(p=>samePerson(p,exact)))note='Este funcionario ya está agregado al reporte.';
  else if(exact)note=exact.active===false?'Este documento pertenece a un funcionario inactivo. Revisa el documento.':'El documento ya está registrado. Selecciona al funcionario para usarlo en el reporte.';
  else if(!found.length)note=state.lastSync?'Sin coincidencias en este dispositivo.':'Sin coincidencias locales. Aún falta descargar Personal.';
  else if(found.length>12)note='Hay más coincidencias. Escribe otro dato para afinar la búsqueda.';
  if(note){const p=document.createElement('p');p.textContent=note;box.append(p);}
}
$('search').oninput=()=>results();f.documento.oninput=()=>results(true);
$('add').onclick=()=>{
  const query=$('search').value.trim();
  const prior=state.reports.find(row=>row.id===editing?.id)?.newPerson;
  personKeys.forEach(k=>f[k].value='');catalogs();showRegistration(true);
  if(prior){f.empresa.value=prior.empresa;catalogs();for(const k of personKeys)if(k!=='documento')f[k].value=prior[k]||'';}
  if(/^[\d.\s-]+$/.test(query))f.documento.value=query;
  results(true);f.documento.focus();
};
function personFromFields(){
  results(true);
  if($('details').disabled)throw new Error('Revisa el documento y selecciona la coincidencia si ya existe.');
  const p=Object.fromEntries(personKeys.map(k=>[k,f[k].value.trim()]));
  p.documento=doc(p.documento);
  for(const key of personKeys){
    if(!f[key].reportValidity()||(f[key].required&&!p[key]))throw new Error('Completa los datos del funcionario.');
  }
  return {...p,id:'FP-'+stamp(),draftNew:true};
}
$('includePerson').onclick=()=>{
  try{choose(personFromFields());}catch(error){message('notice',error.message);}
};
$('cancelPerson').onclick=()=>{clearSearch();$('search').focus();};
function tab(history){
  $('editor').hidden=history;$('history').hidden=!history;
  $('newTab').removeAttribute('aria-current');$('historyTab').removeAttribute('aria-current');
  $(history?'historyTab':'newTab').setAttribute('aria-current','page');
}
$('newTab').onclick=()=>tab(false);$('historyTab').onclick=()=>{tab(true);render();};
function review(r){
  reset();editing={id:r.id,rev:r.rev};manualShift=true;f.fecha.value=r.fecha;f.turno.value=r.turno;f.nivel.value=String(r.nivel);f.corte.disabled=false;f.corte.value=r.corte;
  $('search').value=r.documento||r.nombre;results();message('personLegend','Funcionario');message('editorTitle','Revisar reporte');message('save','Confirmar reporte');$('cancelReview').hidden=false;
  message('notice',r.message||'Selecciona al funcionario correcto.');tab(false);$('search').focus();
}
$('cancelReview').onclick=()=>{reset();message('notice','');tab(true);};
function render(){
  const count=state.reports.filter(r=>r.status!=='synced').length;
  message('badge',count?String(count):'');message('connection',navigator.onLine?'En línea':'Sin conexión');
  $('rows').replaceChildren();
  for(const r of state.reports.slice().reverse().sort((a,b)=>Number(b.status==='review')-Number(a.status==='review'))){
    const item=document.createElement('article'),top=document.createElement('div');top.className='headline';
    const title=document.createElement('strong'),status=document.createElement('span');title.textContent='Nivel '+r.nivel+' · Corte '+r.corte;
    status.className='state '+r.status;status.textContent=statuses[r.status];top.append(title,status);item.append(top);
    for(const t of [r.fecha.split('-').reverse().join('/')+' · '+labels[r.turno],r.nombre+' · '+r.documento,r.message]){
      if(t){const line=document.createElement('p');line.textContent=t;item.append(line);}
    }
    if(r.status==='review'){const b=document.createElement('button');b.type='button';b.textContent='Revisar reporte';b.onclick=()=>review(r);item.append(b);}
    $('rows').append(item);
  }
  if(!state.reports.length){const p=document.createElement('p');p.textContent='Aún no has guardado reportes en este dispositivo.';$('rows').append(p);}
  if(newMode())results(true);else if(!$('lookup').hidden)results();
}
report.onsubmit=async event=>{
  event.preventDefault();if(!session||savingReport)return;
  const s=session;
  try{
    if(!newMode()&&$('search').value.trim())throw new Error('Selecciona al funcionario que estás buscando o limpia la búsqueda antes de guardar.');
    const roster=newMode()?[...selected,personFromFields()]:selected.slice();
    if(!roster.length)throw new Error('Agrega al menos un funcionario al reporte.');
    if(!f.corte.value.trim())throw new Error('Escribe el corte del frente de trabajo.');
    updateShift();
    const common={
      owner:owner(s),fecha:f.fecha.value,turno:f.turno.value,nivel:Number(f.nivel.value),
      corte:f.corte.value.trim(),status:'pending',message:'',existing:null
    };
    const rows=roster.map(p=>({
      ...common,id:editing?.id||'FT-'+stamp(),rev:stamp(),
      personId:p.id,documento:p.documento||'',nombre:personName(p),
      newPerson:p.local||p.draftNew?Object.fromEntries(personKeys.map(k=>[k,p[k]||''])):null
    }));
    const previous=editing?.rev;$('save').disabled=true;
    savingReport=access(common.owner,local=>{
      for(const row of rows)FrontStore.save(local,row,previous);
    });
    const saved=await savingReport;
    if(session!==s)return;state=saved;reset();render();
    message('notice',rows.length===1?'Reporte guardado en este dispositivo.':'Reporte guardado en este dispositivo para '+rows.length+' funcionarios.');
    void sync();
  }catch(error){if(session===s)message('notice',error.message);}finally{savingReport=null;$('save').disabled=false;}
};

async function post(body,signal){
  const ctrl=new AbortController(),abort=()=>ctrl.abort();
  signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(abort,45000);
  try{
    if(signal?.aborted)ctrl.abort();
    const response=await fetch(window.SK_SYNC_CONFIG.apiUrl,{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify(body),redirect:'follow',credentials:'omit',cache:'no-store',signal:ctrl.signal});
    if(!response.ok)throw new Error('El servicio central respondió '+response.status+'.');
    const data=await response.json();
    if(!data?.ok){const error=new Error(data?.error||'Solicitud rechazada.');error.central=true;throw error;}
    return data;
  }catch(error){if(error.central)throw error;throw new Error('No se pudo conectar con la base central. Los pendientes se conservan.');}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
const offlineKey=id=>'sk-frentes:acceso:labor:'+id.trim().toLowerCase();
async function verifier(password,salt){
  const bytes=new TextEncoder(),key=await crypto.subtle.importKey('raw',bytes.encode(password),'PBKDF2',false,['deriveBits']);
  const hash=await crypto.subtle.deriveBits({name:'PBKDF2',salt:bytes.encode(salt),iterations:150000,hash:'SHA-256'},key,256);
  return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
}
function offlineStatus(){
  const stamp=state.lastSync?new Date(state.lastSync).toLocaleString('es-CO',{timeZone:'America/Bogota'}):'sin descarga previa';
  return 'Sin conexión · Personal en este dispositivo: '+stamp+'.';
}
function showAccount(s){
  const admin=s.user.role==='admin';
  const name=s.user.nombre||s.user.name||s.user.username||s.user.documento;
  message('account',name+' · '+(admin?'Administrador':'Registro de reportes'));
  $('laborRoles').hidden=!admin;
  if(!admin){$('laborRoles').open=false;$('laborRoleList').replaceChildren();}
}
$('laborRoles').ontoggle=async()=>{
  const s=session,panel=$('laborRoles'),list=$('laborRoleList');
  if(!panel.open||s?.user.role!=='admin')return;
  list.textContent='Consultando accesos…';
  try{
    const result=await post({action:'laborRoleDirectory',token:s.token});
    if(session!==s||s.user.role!=='admin'||!panel.open)return;
    if(result.scope!=='labor'||!Array.isArray(result.users))throw new Error('El servicio central no confirmó los accesos de Labor.');
    list.replaceChildren(...result.users.sort((a,b)=>a.name.localeCompare(b.name,'es')).map(row=>{
      const li=document.createElement('li');li.textContent=row.name+' · '+(row.role==='admin'?'Administrador':'Registro de reportes');return li;
    }));
  }catch(error){if(session===s&&panel.open)list.textContent=error.message;}
};
async function enter(s){
  const data=await access(owner(s));session=s;generation++;state=data;sessionStorage.setItem(sessionKey,JSON.stringify(s));
  $('login').hidden=true;$('workspace').hidden=false;$('sessionActions').hidden=false;showAccount(s);
  $('sync').disabled=false;message('loginMessage','');message('syncMessage',navigator.onLine?'':offlineStatus());message('notice','');reset();tab(false);restoreUpdateDraft(s);render();void sync();
}
window.SKEntry.setup(login,'labor','identity','password');
login.onsubmit=async event=>{
  event.preventDefault();const b=login.querySelector('button');if(b.disabled)return;b.disabled=true;
  const id=login.elements.identity.value.trim(),key=offlineKey(id);
  message('loginMessage','Verificando acceso…');
  try{
    const pw=window.SKEntry.secret('labor',id,login.elements.password.value);
    let s;
    if(navigator.onLine){
      try{
        const result=await post({action:'laborLogin',document:id,password:pw});
        if(!result.user?.documento||!result.token||result.scope!=='labor')throw new Error('Respuesta de acceso incompleta.');
        s={access:'labor',user:result.user,token:result.token,expiresAt:result.expiresAt,loginId:id};
        const salt=stamp();localStorage.setItem(key,JSON.stringify({salt,hash:await verifier(pw,salt),session:s}));
      }catch(error){if(error.central){if(/incorrect|no habilitad|no tiene acceso|desactiv|revocad/i.test(error.message))localStorage.removeItem(key);throw error;}}
    }
    if(!s){
      const cached=JSON.parse(localStorage.getItem(key)||'null');
      if(!cached||!window.SKEntry.validLocal(cached.session)||cached.session.access!=='labor'||await verifier(pw,cached.salt)!==cached.hash)throw new Error('No se pudo validar el acceso local. El primer ingreso en este dispositivo requiere conexión y una cuenta habilitada.');
      s=cached.session;
    }
    login.elements.password.value='';await enter(s);
  }catch(error){message('loginMessage',error.message);}finally{b.disabled=false;}
};
function logout(){
  activeRequest?.abort();generation++;session=null;running=null;sessionStorage.removeItem(sessionKey);sessionStorage.removeItem(updateDraftKey);
  state=FrontStore.empty();reset();$('rows').replaceChildren();message('account','');$('laborRoles').open=false;$('laborRoles').hidden=true;$('laborRoleList').replaceChildren();
  $('sessionActions').hidden=$('workspace').hidden=true;$('login').hidden=false;login.elements.password.value='';message('loginMessage','');
}
$('logout').onclick=logout;

async function synchronize(s,signal){
  const account=owner(s);
  let current=await access(account);
  while(session===s&&!signal.aborted){
    const sent=current.reports.filter(r=>r.status==='pending').slice(0,50);
    const result=await post({action:'workFrontSync',access:'labor',token:s.token,reports:sent},signal);
    current=await access(account,local=>FrontStore.apply(local,result,sent));
    if(session!==s)return;
    const role=result.sessionRole??'reporter';
    if(['admin','reporter'].includes(role)&&s.user.role!==role){
      s.user.role=role;sessionStorage.setItem(sessionKey,JSON.stringify(s));showAccount(s);
      const key=offlineKey(s.loginId),cached=JSON.parse(localStorage.getItem(key)||'null');
      if(cached?.session?.token===s.token)localStorage.setItem(key,JSON.stringify({...cached,session:s}));
    }
    state=current;catalogs();render();
    if(!current.reports.some(r=>r.status==='pending'))break;
  }
  if(session===s){
    const count=state.reports.filter(r=>r.status==='review').length;
    message('syncMessage',count?'Revisa tus reportes. Hay '+count+' por revisar en Mis reportes.':'Sincronizado · '+new Date(state.lastSync).toLocaleString('es-CO',{timeZone:'America/Bogota'}));
  }
}
function sync(){
  if(!session)return;
  if(!navigator.onLine){message('syncMessage',offlineStatus());render();return;}
  if(running)return running;
  const s=session,gen=generation,ctrl=new AbortController();activeRequest=ctrl;
  $('sync').disabled=true;message('syncMessage','Consultando la base central…');
  const task=navigator.locks?navigator.locks.request('sk-frentes-sync:'+owner(s),{signal:ctrl.signal},()=>synchronize(s,ctrl.signal)):synchronize(s,ctrl.signal);
  running=task.catch(error=>{
    if(session!==s)return;
    if(/no tiene acceso|usuario no habilitado/i.test(error.message)){
      localStorage.removeItem(offlineKey(s.loginId));logout();message('loginMessage','Esta cuenta ya no tiene acceso.');return;
    }
    message('syncMessage',/sesión.*(venció|válida)|inicia sesión/i.test(error.message)?'Vuelve a ingresar para renovar la sesión. Los pendientes se conservan.':error.message);
  }).finally(()=>{if(gen===generation){running=null;activeRequest=null;$('sync').disabled=false;}});
  return running;
}
$('sync').onclick=sync;
window.addEventListener('online',sync);window.addEventListener('offline',()=>{if(session){message('syncMessage',offlineStatus());render();}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&session){updateShift();void sync();}});
setInterval(()=>{if(session&&!document.hidden)updateShift();},30000);
setInterval(()=>{if(session&&!document.hidden)void sync();},300000);
function registerWorker(){
  return navigator.serviceWorker?.register('./sw.js?v='+document.documentElement.dataset.laborVersion,{updateViaCache:'none'});
}
registerWorker()?.catch(()=>{if(session)message('notice','No se pudo preparar la apertura sin conexión. Vuelve a abrir la app con internet.');});

function keepUpdateDraft(s,updateId){
  const draft={
    account:owner(s),updateId,editing,selected,manualShift,history:!$('history').hidden,
    fecha:f.fecha.value,turno:f.turno.value,nivel:f.nivel.value,corte:f.corte.value,
    search:$('search').value,person:newMode()?Object.fromEntries(personKeys.map(key=>[key,f[key].value])):null
  };
  sessionStorage.setItem(updateDraftKey,JSON.stringify(draft));
}
function restoreUpdateDraft(s){
  const saved=sessionStorage.getItem(updateDraftKey);
  if(!saved)return;
  sessionStorage.removeItem(updateDraftKey);
  let draft;
  try{draft=JSON.parse(saved);}catch{return;}
  if(draft?.account!==owner(s)||draft.updateId!==new URL(location.href).searchParams.get('_appUpdate'))return;
  if(draft.editing){
    const row=state.reports.find(r=>r.id===draft.editing.id&&r.rev===draft.editing.rev&&r.status==='review');
    if(!row){tab(true);message('notice','El reporte cambió. Revísalo en Mis reportes.');return;}
    review(row);
  }
  f.fecha.value=draft.fecha;
  manualShift=draft.manualShift;
  if(manualShift)f.turno.value=draft.turno;
  f.nivel.value=draft.nivel;
  f.corte.disabled=!draft.nivel;
  f.corte.value=draft.corte;
  selected.push(...draft.selected);
  paintSelected();
  $('search').value=draft.search;
  showRegistration(Boolean(draft.person));
  if(draft.person){
    f.empresa.value=draft.person.empresa;
    catalogs();
    for(const key of personKeys)f[key].value=draft.person[key];
  }
  tab(draft.history);
}
async function waitForReportOperations(s){
  while(session===s&&(savingReport||running)){
    message('notice',savingReport?'Esperando a que termine el guardado…':'Esperando a que termine la sincronización…');
    await Promise.allSettled([savingReport,running]);
  }
}
function waitForActivation(worker){
  return new Promise((resolve,reject)=>{
    const finish=error=>{
      clearTimeout(timer);
      worker.removeEventListener('statechange',check);
      if(error)reject(error);else resolve();
    };
    const check=()=>{
      if(worker.state==='activated')finish();
      else if(worker.state==='redundant')finish(new Error('No se instaló la actualización.'));
    };
    const timer=setTimeout(()=>finish(new Error('La instalación está tardando más de lo esperado. Vuelve a intentarlo.')),30000);
    worker.addEventListener('statechange',check);
    check();
  });
}
$('updateLabor').onclick=async event=>{
  const button=event.currentTarget,s=session;
  if(!s||button.disabled)return;
  if(!navigator.onLine)return message('notice','Conéctate a internet para actualizar Labor.');
  button.disabled=true;button.setAttribute('aria-busy','true');
  try{
    await waitForReportOperations(s);
    if(session!==s)return;
    message('notice','Buscando la versión más reciente de Labor…');
    const url=new URL(location.href);
    url.searchParams.set('_appUpdate',Date.now());
    const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout?.(20000)});
    if(!response.ok)throw new Error('No se pudo abrir Labor.');
    const registration=await registerWorker();
    if(registration){
      if(!registration.installing&&!registration.waiting)await registration.update();
      const worker=registration.installing||registration.waiting||registration.active;
      if(!worker)throw new Error('No se pudo preparar la actualización.');
      await waitForActivation(worker);
    }
    await waitForReportOperations(s);
    if(session!==s)return;
    if(!navigator.onLine)return message('notice','Conéctate a internet para actualizar Labor.');
    if(f.fecha.validity.customError)return message('notice','Revisa la fecha del reporte antes de actualizar Labor.');
    try{keepUpdateDraft(s,url.searchParams.get('_appUpdate'));}
    catch{return message('notice','No se pudo conservar el formulario. Labor sigue abierta con tus datos.');}
    location.replace(url.href);
  }catch{
    if(session===s)message('notice','No se pudo actualizar Labor. Revisa la conexión y vuelve a intentarlo.');
  }finally{
    button.disabled=false;button.removeAttribute('aria-busy');
  }
};
try{const s=JSON.parse(sessionStorage.getItem(sessionKey)||'null');if(s?.access==='labor'&&s.user?.documento&&s.token&&window.SKEntry.validLocal(s))enter(s).catch(error=>message('loginMessage',error.message));else sessionStorage.removeItem(sessionKey);}catch{sessionStorage.removeItem(sessionKey);}
