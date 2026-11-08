const cacheName='sk-production-shell-v3';
const shell=['./','./index.html','./production.js','./manifest.webmanifest','./production.css','./produccion-192.png','./produccion-512.png','../styles.css','../sync-config.js','../asset-field-compat.js',
  '../spare-catalog.js','../searchable-consumption.js?v=production-1','../consumption-manual-date.js?v=production-1'];
self.addEventListener('install',event=>event.waitUntil(caches.open(cacheName).then(cache=>cache.addAll(shell)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('sk-production-shell-')&&key!==cacheName).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET'||new URL(request.url).origin!==location.origin)return;
  event.respondWith(fetch(request).catch(async()=>await caches.match(request,{cacheName})||
    (request.mode==='navigate'?await caches.match('./index.html',{cacheName}):null)||Response.error()));
});
