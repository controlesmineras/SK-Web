const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const scope='https://example.test/SK-Web/frentes/';
const html=fs.readFileSync(path.join(root,'frentes/index.html'),'utf8');
const version=html.match(/data-labor-version="([^"]+)"/)[1];
const indexUrl=new URL('index.html?v='+version,scope).href;

function installedWorker(fetch){
  const events={},cached=new Map(),deleted=[];
  const cache={
    async addAll(requests){
      for(const req of requests){
        const file=path.join(root,new URL(req.url).pathname.replace('/SK-Web/',''));
        cached.set(req.url,fs.readFileSync(file));
      }
    },
    async match(request){
      const value=cached.get(request.url||request);
      if(value)return new Response(value);
    }
  };
  const self={registration:{scope},clients:{claim(){}},skipWaiting(){},addEventListener(k,fn){events[k]=fn;}};
  const caches={open:async()=>cache,keys:async()=>['sk-frentes-vieja','sk-web-shell-admin'],delete:async k=>deleted.push(k)};
  vm.runInNewContext(fs.readFileSync(path.join(root,'frentes/sw.js'),'utf8'),{
    self,caches,fetch,URL,Request,Response,AbortController,setTimeout,clearTimeout
  });
  function lifecycle(type){let done;events[type]({waitUntil(p){done=p;}});return done;}
  function load(url,mode='navigate'){
    let response;
    events.fetch({request:{url,method:'GET',mode},respondWith(p){response=p;}});
    return response;
  }
  return {cached,deleted,lifecycle,load};
}
test('Labor consulta la red al abrir aunque la caché ya tenga un formulario',async()=>{
  let calls=0;
  const worker=installedWorker(async(url,options)=>{
    assert.equal(url,indexUrl);assert.equal(options.cache,'no-store');calls++;
    return new Response(html);
  });
  await worker.lifecycle('install');
  for(const url of [scope,scope+'index.html?_appUpdate=1']){
    assert.equal(await (await worker.load(url)).text(),html);
  }
  assert.equal(calls,2);
  assert.equal(worker.load(scope+'otra-pagina.html'),undefined);
  assert.equal(worker.load(new URL('../actualizar-labor.html',scope).href),undefined);
});
test('sin conexión Labor abre el formulario instalado con todos sus recursos de la misma versión',async()=>{
  const worker=installedWorker(async()=>{throw Error('offline');});
  await worker.lifecycle('install');await worker.lifecycle('activate');
  assert.deepEqual(worker.deleted,['sk-frentes-vieja']);
  const response=await worker.load(scope+'?v='+version);
  assert.equal(await response.text(),html);
  const resources=[...html.matchAll(/(?:src|href)="([^"#]+)"/g)].map(m=>new URL(m[1],scope).href);
  for(const url of resources)assert.ok(worker.cached.has(url),url);
  for(const file of ['app.js','store.js','app.css']){
    const url=new URL(file+'?v='+version,scope).href;
    assert.ok(resources.includes(url),file);
    assert.equal((await worker.load(url,'cors')).status,200);
  }
});

test('Labor y Producción tienen identificadores de instalación distintos en el mismo origen',()=>{
  const ids=new Set();
  for(const app of ['frentes','produccion']){
    const manifest=JSON.parse(fs.readFileSync(path.join(root,app,'manifest.webmanifest'),'utf8'));
    const manifestUrl=new URL('../'+app+'/manifest.webmanifest',scope);
    const start=new URL(manifest.start_url,manifestUrl);
    const id=new URL(manifest.id,start.origin);
    assert.equal(id.href,start.href);
    ids.add(id.href);
  }
  assert.equal(ids.size,2);
});
test('al recibir una pantalla de otra app Labor abre su propia copia instalada',async()=>{
  const worker=installedWorker(async()=>new Response('<title>Producción</title>'));
  await worker.lifecycle('install');
  assert.equal(await (await worker.load(scope)).text(),html);
});
