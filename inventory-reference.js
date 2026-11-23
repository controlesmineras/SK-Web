// Referencia de consulta del catálogo compartido por las tres aplicaciones.
(()=>{
 'use strict';
 const title='IMAGEN-FICHA';
 const help='Míralo en una imagen o consulta su ficha técnica, requiere conexión a internet.';
 function url(value){
  if(typeof value!=='string'||!/^https?:\/\//i.test(value.trim()))return '';
  try{
   const parsed=new URL(value.trim());
   return parsed.hostname&&!parsed.username&&!parsed.password?parsed.href:'';
  }catch{return ''}
 }
 function showHelp(){
  let dialog=document.getElementById('inventoryReferenceHelp');
  if(!dialog){
   dialog=document.createElement('dialog');
   dialog.id='inventoryReferenceHelp';
   dialog.setAttribute('aria-labelledby','inventoryReferenceTitle');
   dialog.setAttribute('aria-describedby','inventoryReferenceText');
   dialog.innerHTML='<h3 id="inventoryReferenceTitle">IMAGEN-FICHA</h3><p id="inventoryReferenceText"></p><form method="dialog"><button type="submit">Cerrar</button></form>';
   dialog.querySelector('p').textContent=help;
   document.body.append(dialog);
  }
  dialog.showModal();
 }
 function heading(){
  const group=document.createElement('span'),info=document.createElement('button');
  group.className='inventoryReferenceHeading';
  info.type='button';info.className='inventoryReferenceInfo';info.textContent='i';
  info.title=help;info.setAttribute('aria-label','Información sobre imagen o ficha técnica');
  info.setAttribute('aria-haspopup','dialog');info.addEventListener('click',showHelp);
  group.append(title,info);return group;
 }
 function link(value,name){
  const href=url(value);
  if(!href)return document.createTextNode('—');
  const a=document.createElement('a');
  a.href=href;a.target='_blank';a.rel='noopener noreferrer';a.className='inventoryReferenceLink';
  a.textContent='Ver';a.setAttribute('aria-label','Ver imagen o ficha técnica de '+name+' (abre en otra pestaña)');
  return a;
 }
 window.SKInventoryReference={url,heading,link};
})();
