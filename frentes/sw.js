const VERSION='20261124-entrada-admin-documento';
const CACHE='sk-frentes-'+VERSION;
const scope=self.registration.scope;
const indexUrl=new URL('./index.html?v='+VERSION,scope).href;
const shell=[
  '../app-entry.js?v='+VERSION,indexUrl,'./app.js?v='+VERSION,'./store.js?v='+VERSION,'./app.css?v='+VERSION,
  './manifest.webmanifest','../sync-config.js','../date-calendar.js','../date-calendar.css',
  '../form-option-catalog.js','./labor.svg','./labor-180.png','./labor-192.png','./labor-512.png'
];
const urls=new Set(shell.map(path=>new URL(path,scope).href));

self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  await cache.addAll([...urls].map(url=>new Request(url,{cache:'reload'})));
  const installedHtml=await (await cache.match(indexUrl)).text();
  if(!installedHtml.includes('data-labor-version="'+VERSION+'"'))throw new Error('La descarga de Labor contiene otra versión del formulario.');
  await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(key=>key.startsWith('sk-frentes-')&&key!==CACHE).map(key=>caches.delete(key)));
  await self.clients.claim();
})()));

async function openLabor(){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),3500);
  try{
    const response=await fetch(indexUrl,{cache:'no-store',signal:controller.signal});
    if(response.ok && (await response.clone().text()).includes('data-labor-version="'))return response;
  }catch{
    // La copia instalada incluye los archivos que requiere su formulario.
  }finally{clearTimeout(timer);}
  return (await (await caches.open(CACHE)).match(indexUrl))||Response.error();
}
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  if(request.mode==='navigate'){
    const path=new URL(request.url);
    path.search='';path.hash='';
    if(path.href===scope||path.href===new URL('./index.html',scope).href)event.respondWith(openLabor());
  }else if(urls.has(request.url)){
    event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(request))||fetch(request)));
  }
});
