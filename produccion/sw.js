
const CACHE='sk-production-shell-v87-date-keyboard';
const files=['../date-calendar.js?v=2','../date-calendar.css?v=2','./warehouse.js?v=5-back-icon','./warehouse-store.js?v=1','./warehouse.css?v=6-back-right','./','./index.html','./app.js?v=53-direct-mechanics','./sync-protocol.js?v=3','./install-ui.js?v=1','./manifest.webmanifest','../styles.css','../sync-config.js','../spare-catalog.js','../consumption-query-v2.js?v=exportar-inventario-1','./produccion-yt-192.png','./produccion-yt-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(files.map(file=>new Request(file,{cache:'reload'})))).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('sk-production-shell-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET'||new URL(request.url).origin!==self.location.origin)return;
 event.respondWith(fetch(request).catch(async()=>await (await caches.open(CACHE)).match(request)||(request.mode==='navigate'?await (await caches.open(CACHE)).match('./index.html'):Response.error())));
});
