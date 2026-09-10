// Usuarios locales sincronizables, sesión y huella de auditoría.
(()=>{
  const SESSION_KEY='skweb-session';
  const enc=new TextEncoder();
  const b64=bytes=>btoa(String.fromCharCode(...bytes));
  const unb64=text=>Uint8Array.from(atob(text),c=>c.charCodeAt(0));
  const safeUser=u=>({id:u.id,personalId:u.personalId,documento:u.documento,nombre:u.nombre,role:u.role});
  const basePut=put;
  put=async(store,record)=>{
    const actor=currentAudit();
    const value=record?.syncState==='pending'&&actor?{...record,createdBy:record.createdBy||actor,updatedBy:actor}:record;
    return basePut(store,value);
  };

  async function pinHash(pin,salt){
    const key=await crypto.subtle.importKey('raw',enc.encode(pin),'PBKDF2',false,['deriveBits']);
    const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:120000},key,256);
    return b64(new Uint8Array(bits));
  }
  async function makeCredentials(pin){const salt=crypto.getRandomValues(new Uint8Array(16));return{pinSalt:b64(salt),pinHash:await pinHash(pin,salt)}}
  async function validPin(user,pin){return user.pinHash===await pinHash(pin,unb64(user.pinSalt))}
  function session(){try{return JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null')}catch{return null}}
  function setSession(user){sessionStorage.setItem(SESSION_KEY,JSON.stringify(safeUser(user)))}
  function showGate(show){document.body.classList.toggle('authLocked',show);document.querySelector('#authGate').hidden=!show}

  async function pendingCount(){
    let total=0;
    for(const store of stores)for(const row of await all(store))if(row.syncState==='pending')total++;
    return total;
  }
  async function paintPending(){
    if(!db)return;
    const n=await pendingCount(),btn=document.querySelector('#syncBtn'),badge=document.querySelector('#pendingCount');
    if(btn&&!btn.disabled)btn.textContent=n?`☁ Sincronizar datos · ${n} pendiente${n===1?'':'s'}`:'☁ Sincronizar datos';
    if(badge){badge.textContent=String(n);badge.hidden=n===0}
  }
  window.skwebPaintPending=paintPending;

  async function paintUsers(){
    const [users,people]=await Promise.all([all('users'),all('personal')]);
    const select=document.querySelector('#userPerson');
    select.innerHTML='<option value="">Seleccionar funcionario…</option>';
    people.sort((a,b)=>(a.nombre||'').localeCompare(b.nombre||'','es')).forEach(p=>option(select,p.id,`${p.documento} - ${p.nombre}`));
    document.querySelector('#userRows').innerHTML=users.sort((a,b)=>(a.nombre||'').localeCompare(b.nombre||'','es')).map(u=>`<div class="row"><b>${u.nombre}</b><small>${u.documento} · ${u.role==='admin'?'Administrador':'Operador'} · ${u.enabled===false?'Deshabilitado':'Habilitado'}</small></div>`).join('')||'<p class="hint">Aún no hay usuarios.</p>';
  }
  function applySession(user){
    setSession(user);showGate(false);
    document.querySelector('#sessionUser').textContent=`${user.nombre} · ${user.role==='admin'?'Administrador':'Operador'}`;
    document.querySelector('#usersNav').hidden=user.role!=='admin';
    if(user.role==='admin')paintUsers();
    paintPending();
  }
  async function paintLogin(){
    const users=(await all('users')).filter(u=>u.enabled!==false);
    const first=users.length===0;
    document.querySelector('#authTitle').textContent=first?'Crear administrador inicial':'Iniciar sesión';
    document.querySelector('#authHelp').textContent=first?'Selecciona tu registro de Personal y crea un PIN de 4 a 8 dígitos.':'Selecciona tu usuario e ingresa el PIN.';
    const select=document.querySelector('#authUser');select.innerHTML='<option value="">Seleccionar usuario…</option>';
    const source=first?await all('personal'):users;
    source.sort((a,b)=>(a.nombre||'').localeCompare(b.nombre||'','es')).forEach(x=>option(select,x.id,`${x.documento} - ${x.nombre}`));
    document.querySelector('#authSubmit').textContent=first?'Crear administrador':'Entrar';
    document.querySelector('#authLoadUsers').hidden=!first;
    document.querySelector('#authForm').dataset.first=first?'1':'0';showGate(true);
  }
  async function submitLogin(e){
    e.preventDefault();
    const userId=e.currentTarget.userId.value,pin=e.currentTarget.pin.value;
    if(!/^\d{4,8}$/.test(pin))return alert('El PIN debe tener entre 4 y 8 números.');
    if(e.currentTarget.dataset.first==='1'){
      const person=(await all('personal')).find(p=>p.id===userId);if(!person)return alert('Selecciona tu registro de Personal.');
      const record={...mark(),...(await makeCredentials(pin)),personalId:person.id,documento:person.documento,nombre:person.nombre,role:'admin',enabled:true};
      await put('users',record);applySession(record);return;
    }
    const user=(await all('users')).find(u=>u.id===userId&&u.enabled!==false);
    if(!user||!await validPin(user,pin))return alert('Usuario o PIN incorrecto.');
    applySession(user);
  }
  async function saveUser(e){
    e.preventDefault();const actor=session();if(actor?.role!=='admin')return alert('Solo un administrador puede crear usuarios.');
    const x=fd(e.currentTarget),pin=x.pin,person=(await all('personal')).find(p=>p.id===x.personalId);if(!person)return alert('Selecciona un funcionario.');
    if(!/^\d{4,8}$/.test(pin))return alert('El PIN debe tener entre 4 y 8 números.');
    const users=await all('users'),old=users.find(u=>u.personalId===person.id),credentials=await makeCredentials(pin);
    const record=old?auditUpdate({...old,...credentials,documento:person.documento,nombre:person.nombre,role:x.role,enabled:true}):{...mark(),...credentials,personalId:person.id,documento:person.documento,nombre:person.nombre,role:x.role,enabled:true};
    await put('users',record);e.currentTarget.reset();await paintUsers();alert(old?'Usuario actualizado y PIN reemplazado.':'Usuario creado.');
  }
  async function start(){
    while(!db)await new Promise(r=>setTimeout(r,50));
    if(!(await all('personal')).length&&typeof seedPersonal==='function')await seedPersonal();
    const saved=session(),users=await all('users'),current=saved&&users.find(u=>u.id===saved.id&&u.enabled!==false);
    document.querySelector('#authForm').addEventListener('submit',submitLogin);
    document.querySelector('#userForm').addEventListener('submit',saveUser);
    document.querySelector('#logoutBtn').addEventListener('click',()=>{sessionStorage.removeItem(SESSION_KEY);location.reload()});
    document.querySelector('#authLoadUsers').addEventListener('click',()=>document.querySelector('#syncBtn').click());
    window.addEventListener('skweb-data-changed',()=>setTimeout(paintPending,30));
    current?applySession(current):await paintLogin();
  }
  window.addEventListener('load',start);
})();
