// Referencia de consulta del catálogo compartido por las tres aplicaciones.
(()=>{
 'use strict';
 const title='IMAGEN-FICHA';
 const help='Míralo en una imagen o consulta su ficha técnica, requiere conexión a internet.';
 const catalog='https://controlesmineras.github.io/Catalogo-minero/';
 function catalogLink(parsed){
  const path=parsed.pathname;
  let file;
  switch(parsed.hostname){
   case 'mitalner.com':
   case 'www.mitalner.com':
    if(path==='/wp-content/uploads/2024/04/p15.webp')return catalog+'adaptador-split-set.html';
    break;
   case 'controlesmineras.github.io':
    file=/^\/Catalogo-minero\/([^/]+)$/i.exec(path)?.[1];break;
   case 'github.com':
    file=/^\/controlesmineras\/Catalogo-minero\/(?:blob|raw)\/(?:refs\/heads\/)?main\/([^/]+)$/i.exec(path)?.[1];break;
   case 'raw.githubusercontent.com':
    file=/^\/controlesmineras\/Catalogo-minero\/(?:refs\/heads\/)?main\/([^/]+)$/i.exec(path)?.[1];break;
  }
  if(!file)return parsed.href;
  if(/^[\w.-]+\.(?:jpe?g|png|webp)$/i.test(file))return catalog+'?foto='+encodeURIComponent(file);
  if(/^[\w-]+\.md$/i.test(file))return catalog+file.slice(0,-3)+'.html';
  return parsed.href;
 }
 function url(value){
  if(typeof value!=='string'||!/^https?:\/\//i.test(value.trim()))return '';
  try{
   const parsed=new URL(value.trim());
   return parsed.hostname&&!parsed.username&&!parsed.password?catalogLink(parsed):'';
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
 function referenceLink(value,name){
  const href=url(value);
  if(!href)return null;
  const a=document.createElement('a');
  a.href=href;a.target='_blank';a.rel='noopener noreferrer';a.className='inventoryReferenceLink';
  a.textContent='Ver';a.setAttribute('aria-label','Ver imagen o ficha técnica de '+name+' (abre en otra pestaña)');
  return a;
 }
 function link(value,name){
  return referenceLink(value,name)||document.createTextNode('—');
 }
 function searchResult(button,value,name){
  const reference=referenceLink(value,name);
  if(!reference)return button;
  const row=document.createElement('div');
  row.className='inventoryReferenceResult';
  reference.textContent='VER';
  row.append(reference,button);
  return row;
 }
 window.SKInventoryReference={url,heading,link,searchResult};
})();
