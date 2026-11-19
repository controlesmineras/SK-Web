
const CACHE='sk-production-shell-v121-tarjetas-orden';
const files=['../spare-groups.js?v=20261112-spare-wording-3','../plaza/spare-picker.js?v=20261118-catalogo-completo','../date-calendar.js?v=3','../date-calendar.css?v=3','./warehouse.js?v=12-ubicacion-cabecera','./warehouse-store.js?v=2','./warehouse.css?v=11-inicio-fijo','./','./index.html','./app.js?v=61-dashboard','./consumption-reports.js?v=5-numero-item','./consumption-reports.css?v=3','./sync-protocol.js?v=4','./install-ui.js?v=1','./manifest.webmanifest','../styles.css?v=20261119-tarjetas-orden','../sync-config.js','../spare-catalog.js','./consumption-pdf.js?v=1','../consumption-query-v2.js?v=20261119-tarjetas-orden','./produccion-yt-192.png','./produccion-yt-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(files.map(file=>new Request(file,{cache:'reload'})))).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('sk-production-shell-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET'||new URL(request.url).origin!==self.location.origin)return;
 event.respondWith(fetch(request).catch(async()=>await (await caches.open(CACHE)).match(request)||(request.mode==='navigate'?await (await caches.open(CACHE)).match('./index.html'):Response.error())));
});
