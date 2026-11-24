(()=>{
 'use strict';
 // Retira las activaciones antiguas sin tocar los movimientos pendientes ni las credenciales con contraseña.
 try{
  for(const key of Object.keys(localStorage)){
   if(key.startsWith('sk:entrada:v1:'))localStorage.removeItem(key);
  }
 }catch{}
 function validLocal(s){
  if(!s?.token?.startsWith('sk2.'))return Boolean(s);
  try{
   const encoded=s.token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
   const claims=JSON.parse(atob(encoded));
   return claims.type==='session'&&claims.kind==='principal'&&claims.expiresAt>Date.now();
  }catch{return false;}
 }
 window.SKEntry={validLocal};
})();
