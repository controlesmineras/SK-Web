(()=>{
 'use strict';
 const hour=3600000, offlineLimit=36*hour;
 const loginMessage='Sesión vencida. Conéctate a internet e inicia sesión con tu usuario y contraseña para registrar. Tus pendientes siguen guardados.';
 try{
  for(const key of Object.keys(localStorage)){
   if(key.startsWith('sk:entrada:v1:'))localStorage.removeItem(key);
  }
 }catch{}

 function tokenExpiry(token,scope){
  try{
   const bits=token.split('.'),principal=bits.length===3&&bits[0]==='sk2';
   if((!principal&&bits.length!==2)||!bits.at(-1))return 0;
   const payload=atob(bits[principal?1:0].replace(/-/g,'+').replace(/_/g,'/'));
   if(principal){
    const claims=JSON.parse(payload);
    return claims.type==='session'&&claims.kind==='principal'&&claims.scope===scope?Number(claims.expiresAt):0;
   }
   if(scope==='labor'||scope==='production'){
    const parts=JSON.parse(payload);
    return parts.length===4&&parts[0]===scope?Number(parts[3]):0;
   }
   const parts=payload.split('|');
   const roles=scope==='admin'?['owner','admin','assistant']:['plaza_operator','plaza_assistant','plaza_supervisor','plaza_admin'];
   return parts.length===3&&roles.includes(parts[1])?Number(parts[2]):0;
  }catch{return 0;}
 }

 function sessionPolicy(scope,current,onExpired){
  const prefix='sk:offline-session:v1:'+scope+':',notice=prefix+'notice';
  const key=token=>prefix+token.split('.').at(-1);
  let timer,scheduled=0;
  function end(token){return tokenExpiry(token,scope);}
  function deadline(token){
   if(!token)return 0;
   const until=end(token),now=Date.now();
   if(!Number.isFinite(until)||until<=0)return 0;
   const raw=localStorage.getItem(key(token));
   // Las sesiones anteriores a esta versión fueron emitidas por el servidor por 12 horas.
   const last=raw===null?until-12*hour:Number(raw);
   if(!(last>0)||last>now||now>=until||now-last>offlineLimit){
    if(raw!=='0')localStorage.setItem(key(token),'0');
    return 0;
   }
   return Math.min(until,last+offlineLimit+1);
  }
  function allows(token){return Boolean(deadline(token));}
  function check(){
   const token=current();
   const next=deadline(token);
   if(next!==scheduled){
    clearTimeout(timer);scheduled=next;
    if(next)timer=setTimeout(()=>{scheduled=0;check();},Math.max(1,next-Date.now()));
   }
   if(token&&!next){
    sessionStorage.setItem(notice,'1');
    onExpired(loginMessage);
   }
   return Boolean(next);
  }
  function requireActive(token){
   if(!token||token!==current()||!check())throw new Error(loginMessage);
  }
  function signedIn(token){
   if(!(end(token)>Date.now()))throw new Error(loginMessage);
   localStorage.setItem(key(token),String(Date.now()));
   sessionStorage.removeItem(notice);
   // Retirar comprobantes antiguos al recibir credenciales nuevas.
   for(const entry of Object.keys(localStorage)){
    if(entry.startsWith(prefix)&&entry!==key(token)){
     const stamp=Number(localStorage.getItem(entry));
     if(stamp>0&&Date.now()-stamp>7*24*hour)localStorage.removeItem(entry);
    }
   }
  }
  function synced(token){
   if(token&&token===current()&&check()){
    localStorage.setItem(key(token),String(Date.now()));check();
   }
  }
  function reject(token){
   if(token&&token===current()){localStorage.setItem(key(token),'0');check();}
  }
  function guardEvent(event){
   if(current()&&!check()){event.preventDefault();event.stopImmediatePropagation();}
  }
  for(const name of ['focus','pageshow','online','storage'])window.addEventListener(name,check);
  document.addEventListener('visibilitychange',check);
  for(const name of ['submit','click'])window.addEventListener(name,guardEvent,true);
  return {allows,check,signedIn,synced,reject,requireActive,loginMessage,notice:()=>sessionStorage.getItem(notice)?loginMessage:''};
 }
 const rejected=message=>/sesi[oó]n.*(?:venci[oó]|vencida|no v[aá]lida|revocada)|inicia sesi[oó]n|(?:cuenta|equipo).*no tiene acceso/i.test(String(message||''));
 window.SKEntry={sessionPolicy,rejected};
})();
