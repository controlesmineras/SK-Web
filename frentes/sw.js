const CACHE='sk-frentes-5-vista-amplia';
const shell=['./','./index.html','./app.js','./store.js','./app.css','./manifest.webmanifest','../sync-config.js','../date-calendar.js','../date-calendar.css','../form-option-catalog.js','./labor.svg','./labor-180.png','./labor-192.png','./labor-512.png'];
const urls=new Set(shell.map(path=>new URL(path,self.registration.scope).href));
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(shell.map(path=>new Request(path,{cache:'reload'})))).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('sk-frentes-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  const navigation=req.mode==='navigate' && req.url.startsWith(self.registration.scope);
  if(!navigation&&!urls.has(req.url))return;
  event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(navigation?'./index.html':req))||fetch(req)));
});
