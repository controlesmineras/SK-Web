const VERSION='20261112-spare-wording-3';
const CACHE=`plaza-blending-shell-${VERSION}`;
const CORE=['./','./index.html','./plaza.css?v=20261103-first-delivery-1','./plaza-pending.css','./plaza-collaborator.css','./plaza-home.css','./lz-string.js?v=1.4.4','./local-data.js?v=20261106-indexeddb-1','./plaza.js?v=20261112-spare-groups-1','./spare-picker.js?v=20261112-spare-wording-3','../spare-groups.js?v=20261112-spare-wording-3','../asset-history.js?v=20261108-asset-damaged-only-1','../asset-record-rules.js','./asset-returns.js?v=20261106-indexeddb-1','./plaza-collaborator.js?v=20261106-indexeddb-1','./asset-not-found.js?v=20261106-indexeddb-1','./install-ui.js?v=20261106-indexeddb-1','./manifest.webmanifest','../sync-config.js','../asset-marking.js','../form-option-catalog.js','../cargo-search.js','../cargo-search.css','./icon-volqueta-32.png','./icon-volqueta-48.png','./icon-volqueta.svg','./icon-volqueta-192.png','./icon-volqueta-512.png','./icon-volqueta-180.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE.map(url=>new Request(url,{cache:'reload'})))).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('plaza-blending-shell-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('message',event=>{if(event.data?.type==='PLAZA_SKIP_WAITING')self.skipWaiting()});
self.addEventListener('fetch',event=>{const request=event.request,url=new URL(request.url);if(request.method!=='GET'||url.origin!==self.location.origin)return;event.respondWith(fetch(request,{cache:'no-store'}).then(response=>{if(response.ok)caches.open(CACHE).then(cache=>cache.put(request.mode==='navigate'?'./index.html':request,response.clone())).catch(()=>{});return response}).catch(async()=>{if(request.mode==='navigate')return(await caches.match('./index.html'))||Response.error();return(await caches.match(request))||(await caches.match(request,{ignoreSearch:true}))||Response.error()}))});




