const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const {DatabaseSync} = require('node:sqlite');
const {programa} = require('./empaquetar.cjs');
const {parse} = require('acorn');
const {execFileSync} = require('node:child_process');

test('el código para copiar y el ZIP contienen el mismo script de sintaxis ES2019 con ambas funciones públicas', () => {
  const codigo = programa();
  const arbol = parse(codigo, {ecmaVersion: 2019, sourceType: 'script'});
  for (const nombre of ['activarHistorialInventario', 'copiarHistorialConfirmado']) {
    assert.ok(arbol.body.some(n => n.type === 'FunctionDeclaration' && n.id.name === nombre));
  }
  assert.equal(fs.readFileSync(path.join(__dirname, 'codigo-apps-script.txt'), 'utf8'), codigo);
  const comprimido = execFileSync('python3', ['-c',
    "import sys, zipfile; sys.stdout.buffer.write(zipfile.ZipFile(sys.argv[1]).read('Codigo.gs'))",
    path.join(__dirname, 'Historial-SQLite.zip')], {maxBuffer: 8 * 1024 * 1024});
  assert.equal(comprimido.toString('utf8'), codigo);
});

function blob(bytes) {
  const b = Buffer.from(bytes);
  return {getBytes:()=>Array.from(new Int8Array(b)),getDataAsString:()=>b.toString('utf8')};
}
function entorno() {
  const propiedades=new Map(), fuentes=new Map(), copias=new Map(), activadores=[];
  let numero=0, corrupta=false, bloqueado=false;
  function file(nombre,contenido,esEntrada) {
    let retirado=false;
    const id='archivo-'+(++numero);
    return {getId:()=>id,getName:()=>nombre,isTrashed:()=>retirado,
      getBlob:()=>esEntrada?blob(JSON.stringify(contenido)):contenido,
      setTrashed:b=>{assert.equal(esEntrada,false,'El JSON operativo es solo de lectura');retirado=b;}};
  }
  function entrada(nombre,datos){const f=file(nombre,datos,true);fuentes.set(nombre,f);return f;}
  const carpeta={getId:()=>'privada',isTrashed:()=>false,getSharingAccess:()=>'privado',getEditors:()=>[],getViewers:()=>[],
    createFile:b=>{const f=file(b.nombre,corrupta?blob('lectura incompleta'):b,false);copias.set(f.getId(),f);return f;}};
  const ctx=vm.createContext({console:{log(){},warn(){},error:console.error},
    Utilities:{getUuid:crypto.randomUUID,newBlob:(b,t,n)=>({...blob(b),nombre:n}),formatDate:()=>String(numero),
      DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(alg,bytes)=>crypto.createHash(alg).update(Buffer.from(bytes)).digest(),
      base64EncodeWebSafe:bytes=>Buffer.from(bytes).toString('base64url')},
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>propiedades.get(k)||null,setProperty:(k,v)=>propiedades.set(k,v)})},
    LockService:{getScriptLock:()=>({tryLock:()=>{if(bloqueado)return false;bloqueado=true;return true;},waitLock:()=>{assert.equal(bloqueado,false);bloqueado=true;},releaseLock:()=>{bloqueado=false;}})},
    DriveApp:{Access:{PRIVATE:'privado'},createFolder:()=>carpeta,getFolderById:()=>carpeta,
      getFilesByName:n=>{let f=fuentes.get(n);return {hasNext:()=>!!f,next:()=>{const r=f;f=null;return r;}};},
      getFileById:id=>copias.get(id)||[...fuentes.values()].find(f=>f.getId()===id)},
    ScriptApp:{getProjectTriggers:()=>activadores,newTrigger:name=>({timeBased:()=>({everyHours:n=>({create:()=>{assert.equal(n,1);activadores.push({getHandlerFunction:()=>name});}})})})}
  });
  vm.runInContext(programa(),ctx);
  function leer(clave,consulta){
    const {id}=JSON.parse(propiedades.get('SQLITE_COPIA_'+clave));
    const temp=fs.mkdtempSync(path.join(os.tmpdir(),'sk-sqlite-test-')),destino=path.join(temp,'historico.sqlite');
    let db;
    try {fs.writeFileSync(destino,Buffer.from(copias.get(id).getBlob().getBytes()));db=new DatabaseSync(destino,{readOnly:true});return db.prepare(consulta).all().map(r=>({...r}));}
    finally{db?.close();fs.rmSync(temp,{recursive:true,force:true});}
  }
  return {ctx,entrada,leer,propiedades,copias,activadores,carpeta,corromper:b=>{corrupta=b;}};
}
const hora='2026-11-25T20:35:40.000Z';
test('de la confirmación central a un SQLite portátil; conserva identidades, saldos y referencias',async()=>{
  const h=entorno();
  const movimiento={id:'d1',itemId:'pref',itemName:'Prefiltro FESI 7030',quantity:1,recordedAt:hora,
    createdAt:'2026-11-20T14:10:12Z',syncedAt:'2026-11-25T21:00:03Z',balanceBefore:5,balanceAfter:4,
    shiftKeeperName:'María',operatorName:'Nelson',syncState:'synced',actorRole:'admin'};
  const central={personal:[{id:'persona',pinHash:'solo-en-el-operativo'}],assets:[{id:'af',estado:'Operativo'}],inventoryStock:[{id:'pref',quantity:4}],
    blendingDeliveries:[movimiento,{...movimiento,id:'d2'},{...movimiento,id:'d3',syncState:'pending'},
      {...movimiento,id:'d4',status:'rejected'},{...movimiento,id:'d5',syncState:undefined},
      {...movimiento,id:'loan',assetId:'af',deliveryType:'PRÉSTAMO'}],
    warehouseQuantityHistory:[{id:'d1',status:'synced',kind:'quantity_adjustment',balanceBefore:2,balanceAfter:5,recordedByName:'Nelson',recordedByRole:'owner'}]};
  const produccion={consumptions:[{id:'op1',cantidad:1,partId:'YT',registradoPor:'doc',createdAt:hora}],
    warehouseMovements:[{id:'afpend',status:'synced',bridgePending:true}],incomes:[{id:'inválido',createdAt:hora},{id:'proyección',partId:'YT',cantidad:1,createdAt:hora,sourceWarehouseMovementId:'afpend'}]};
  h.entrada('sk-web-central.json',central);h.entrada('sk-web-production.json',produccion);
  const original=JSON.stringify(central);
  const first=await h.ctx.copiarHistorialConfirmado();
  assert.equal(first[0].nuevos,4);assert.equal(first[0].omitidos,3);assert.equal(first[1].nuevos,1);assert.equal(first[1].omitidos,3);
  assert.equal(JSON.stringify(central),original);
  assert.deepEqual(h.leer('central',"SELECT id,saldo_anterior,saldo_nuevo,hora_registro,bodeguero FROM registros WHERE serie='blendingDeliveries' AND id='d1'"),
    [{id:'d1',saldo_anterior:5,saldo_nuevo:4,hora_registro:hora,bodeguero:'María'}]);
  assert.deepEqual(h.leer('central',"SELECT id FROM registros WHERE datos LIKE '%solo-en-el-operativo%'"),[]);
  const archivos=h.copias.size;
  await h.ctx.activarHistorialInventario();await h.ctx.activarHistorialInventario();
  assert.equal(h.activadores.length,1);assert.equal(h.copias.size,archivos);
  central.blendingDeliveries[0].reversed=true;
  central.blendingDeliveries.push({...movimiento,id:'REV-d1',movementType:'REVERSIÓN',reversalOf:'d1',reversalRequestedBy:'Solicitante',balanceBefore:4,balanceAfter:5});
  central.blendingDeliveries=central.blendingDeliveries.filter(r=>r.id!=='d2');
  const second=await h.ctx.copiarHistorialConfirmado();
  assert.equal(second[0].actualizados,1);assert.equal(second[0].nuevos,1);
  assert.deepEqual(h.leer('central',"SELECT registrado_por,solicitado_por,referencia_id,saldo_nuevo FROM registros WHERE id='REV-d1'"),
    [{registrado_por:null,solicitado_por:'Solicitante',referencia_id:'d1',saldo_nuevo:5}]);
  assert.deepEqual(h.leer('central',"SELECT id FROM registros WHERE id='d2'"),[{id:'d2'}]);
});
test('una escritura incompleta o IDs ambiguos no cambian el archivo vigente ni la entrada operativa',async()=>{
  const h=entorno(),central={blendingIncomes:[]};
  h.entrada('sk-web-central.json',central);h.entrada('sk-web-production.json',{incomes:[]});
  await h.ctx.copiarHistorialConfirmado();
  const clave='SQLITE_COPIA_central',vigente=h.propiedades.get(clave);
  central.blendingIncomes.push({id:'i',syncState:'synced',quantity:1});
  h.corromper(true);await assert.rejects(h.ctx.copiarHistorialConfirmado(),/idéntica/);assert.equal(h.propiedades.get(clave),vigente);
  h.corromper(false);central.blendingIncomes.push({...central.blendingIncomes[0]});
  await assert.rejects(h.ctx.copiarHistorialConfirmado(),/repetido/);assert.equal(h.propiedades.get(clave),vigente);
  central.blendingIncomes.pop();await h.ctx.copiarHistorialConfirmado();assert.equal(h.leer('central','SELECT * FROM registros').length,1);
});
