
const CACHE='sk-production-shell-20261124-entrada-admin-documento';
const files=['../app-entry.js?v=20261124-entrada-admin-documento','../inventory-reference.js?v=20261123-imagen-ficha','../inventory-reference.css?v=20261124-otros-nombres','../asset-search.js?v=20261124-otros-nombres','../spare-groups.js?v=20261124-otros-nombres','../plaza/spare-picker.js?v=20261124-otros-nombres','../date-calendar.js?v=3','../date-calendar.css?v=3','./warehouse.js?v=20261124-otros-nombres','./warehouse-store.js?v=2','./warehouse.css?v=20261122-consultas-movimientos','./','./index.html','./app.js?v=20261124-entrada-admin-documento','./purchase-workbook.js?v=20261120-codigo-elemento','./consumption-reports.js?v=20261120-compras-1','./consumption-reports.css?v=4-cabecera','./sync-protocol.js?v=4','./install-ui.js?v=1','./manifest.webmanifest','../styles.css?v=20261119-tarjetas-orden','../sync-config.js','../spare-catalog.js','./consumption-pdf.js?v=1','../movement-time.js?v=1','../consumption-query-v2.js?v=20261121-orden-en-linea','./produccion-perforadora-192.png','./produccion-perforadora-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(files.map(file=>new Request(file,{cache:'reload'})))).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('sk-production-shell-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET'||new URL(request.url).origin!==self.location.origin)return;
 event.respondWith(fetch(request).catch(async()=>await (await caches.open(CACHE)).match(request)||(request.mode==='navigate'?await (await caches.open(CACHE)).match('./index.html'):Response.error())));
});
