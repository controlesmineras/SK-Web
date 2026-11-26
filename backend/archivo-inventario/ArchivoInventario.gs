// Proyecto de Apps Script independiente. Sus únicas entradas son los JSON ya escritos en Drive.
const ARCHIVO_FUENTES = [
  {clave:'central', nombre:'sk-web-central.json', series:['blendingDeliveries','blendingIncomes','warehouseQuantityHistory','novelties','consumptions']},
  {clave:'produccion', nombre:'sk-web-production.json', series:['warehouseMovements','incomes','consumptions','incomeHistory']}
];

function archivoConfirmado_(fuente, serie, r) {
  if (!r || typeof r.id !== 'string' || !r.id.trim() || r.pending || r.syncRejected || r.syncError || r.bridgePending) return false;
  const estados = [r.syncState, r.status].filter(x => x != null && x !== '');
  if (estados.length) return estados.every(x => x === 'synced');
  // Mecánica construye estas filas en el servidor después de validar la operación.
  // Las versiones sin estado de otros módulos no se clasifican por antigüedad.
  if (fuente !== 'produccion') return false;
  if (serie === 'incomeHistory') return !!(r.incomeId && r.before && r.after && ['edit','delete','revert'].includes(r.action) && Number.isFinite(Date.parse(r.at)));
  return ['incomes','consumptions'].includes(serie) && Number.isFinite(Date.parse(r.createdAt)) &&
    Number.isFinite(r.cantidad) && !!r.partId && !!(r.registradoPor || r.sourceWarehouseMovementId || r.sourceDeliveryId);
}

function archivoColumnas_(serie, r) {
  const reversion = !!r.reversalOf || r.movementType === 'REVERSIÓN';
  const autor = r.operatorName || r.recordedByName || r.registradoPorNombre || r.registeredBy || r.registradoPor;
  const tipo = r.movementType || r.kind || r.action || ({
    blendingDeliveries:'Entrega', blendingIncomes:'Ingreso', novelties:'Novedad de activo', consumptions:'Consumo'
  })[serie] || serie;
  return [serie, r.id, tipo, r.itemId || r.partId || r.after?.partId || null, r.assetId || null,
    r.sourceCreatedAt || r.recordedAt || r.at || null, r.fechaISO || r.createdAt || null,
    r.syncedAt || null, r.quantity ?? r.cantidad ?? null,
    r.balanceBefore ?? null, r.balanceAfter ?? null,
    reversion || typeof autor !== 'string' ? null : autor,
    reversion ? null : r.actorRole || r.recordedByRole || null, r.reversalRequestedBy || null,
    r.shiftKeeperName || null, r.reversalOf || r.loanId || r.incomeId || null, JSON.stringify(r)];
}

function archivoCopiar_(SQL, fuente, sourceId, data, bytes) {
  const db = bytes ? new SQL.Database(bytes) : new SQL.Database();
  const resumen = {confirmados:0, omitidos:0, nuevos:0, actualizados:0};
  try {
    if (!bytes) {
      db.run('CREATE TABLE fuente (id TEXT PRIMARY KEY, bodega TEXT NOT NULL)');
      db.run('INSERT INTO fuente VALUES (?, ?)', [sourceId, fuente.clave]);
      db.run('CREATE TABLE registros (serie TEXT NOT NULL, id TEXT NOT NULL, tipo TEXT, elemento_id TEXT, activo_id TEXT, hora_registro TEXT, fecha_movimiento TEXT, sincronizado_en TEXT, cantidad REAL, saldo_anterior REAL, saldo_nuevo REAL, registrado_por TEXT, perfil TEXT, solicitado_por TEXT, bodeguero TEXT, referencia_id TEXT, datos TEXT NOT NULL, PRIMARY KEY (serie,id))');
      db.run('CREATE INDEX registros_elemento ON registros(elemento_id,hora_registro)');
      db.run('CREATE INDEX registros_activo ON registros(activo_id,hora_registro)');
    }
    const origen = db.exec('SELECT id,bodega FROM fuente')[0]?.values;
    if (origen?.length !== 1 || origen[0][0] !== sourceId || origen[0][1] !== fuente.clave) throw Error('El archivo SQLite pertenece a otra fuente.');
    db.run('BEGIN');
    const buscar = db.prepare('SELECT datos FROM registros WHERE serie=? AND id=?');
    const guardar = db.prepare('INSERT OR REPLACE INTO registros VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    try {
      const movimientosBodega = new Map((data.warehouseMovements || []).filter(r=>r?.id).map(r=>[r.id,r]));
      for (const serie of fuente.series) {
        if (data[serie] !== undefined && !Array.isArray(data[serie])) throw Error('Colección central inválida: '+serie);
        const vistos = new Set();
        for (const r of data[serie] || []) {
          const padre = fuente.clave === 'produccion' && serie === 'incomes' &&
            (r?.sourceWarehouseMovementId || (r?.sourceDeliveryId && 'plaza-'+r.sourceDeliveryId));
          if (!archivoConfirmado_(fuente.clave, serie, r) ||
              (padre && !archivoConfirmado_('produccion','warehouseMovements',movimientosBodega.get(padre)))) {
            resumen.omitidos++; continue;
          }
          if (vistos.has(r.id)) throw Error('Identificador repetido dentro de '+serie+'. Revisa la fuente.');
          vistos.add(r.id);
          resumen.confirmados++;
          const fila = archivoColumnas_(serie, r);
          buscar.bind([serie,r.id]);
          const existe = buscar.step(), anterior = existe ? buscar.get()[0] : null;
          buscar.reset();
          if (anterior === fila[fila.length-1]) continue;
          guardar.run(fila);
          buscar.bind([serie,r.id]);
          if (!buscar.step() || buscar.get()[0] !== fila[fila.length-1]) throw Error('La copia difiere del registro confirmado.');
          buscar.reset();
          if (existe) resumen.actualizados++; else resumen.nuevos++;
        }
      }
    } finally {buscar.free(); guardar.free();}
    db.run('COMMIT');
    if (bytes && !resumen.nuevos && !resumen.actualizados) return {resumen};
    if (db.exec('PRAGMA integrity_check')[0]?.values[0][0] !== 'ok') throw Error('Falló la comprobación de integridad SQLite.');
    return {resumen, bytes:db.export()};
  } finally {db.close();}
}

function archivoHuella_(bytes) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,bytes));
}

function archivoFuente_(fuente, props) {
  const clave = 'ARCHIVO_'+fuente.clave.toUpperCase()+'_ID';
  const id = props.getProperty(clave);
  if (id) {
    const file = DriveApp.getFileById(id);
    if (file.isTrashed() || file.getName() !== fuente.nombre) throw Error('Revisa la propiedad '+clave+' y el archivo '+fuente.nombre);
    return file;
  }
  const archivos = DriveApp.getFilesByName(fuente.nombre);
  if (!archivos.hasNext()) throw Error('No se encontró '+fuente.nombre);
  const file = archivos.next();
  if (archivos.hasNext()) throw Error('Hay dos archivos llamados '+fuente.nombre+'. Indica el ID correcto en '+clave+'.');
  props.setProperty(clave,file.getId());
  return file;
}

function archivoGuardarCopia_(SQL, fuente, props, carpeta) {
  const entrada = archivoFuente_(fuente,props);
  const data = JSON.parse(entrada.getBlob().getDataAsString('UTF-8'));
  if (!data || !fuente.series.some(serie => Array.isArray(data[serie]))) throw Error('No se reconoció el esquema de '+fuente.nombre);
  const clave = 'SQLITE_COPIA_'+fuente.clave;
  const version = JSON.parse(props.getProperty(clave) || 'null');
  let original;
  if (version) {
    const archivo = DriveApp.getFileById(version.id);
    if (archivo.isTrashed()) throw Error('Restaura la copia SQLite antes de continuar.');
    const bytes = archivo.getBlob().getBytes();
    if (archivoHuella_(bytes) !== version.huella) throw Error('La copia SQLite cambió fuera del archivador. Se conserva la fuente.');
    original = new Uint8Array(bytes);
  }
  const copia = archivoCopiar_(SQL, fuente, entrada.getId(), data, original);
  if (!copia.bytes) return {fuente:fuente.nombre, archivo:version.id, ...copia.resumen};
  const bytes = Array.from(new Int8Array(copia.bytes.buffer,copia.bytes.byteOffset,copia.bytes.byteLength));
  const huella = archivoHuella_(bytes);
  const fecha = Utilities.formatDate(new Date(),'America/Bogota','yyyy-MM-dd_HHmmss');
  const nuevo = carpeta.createFile(Utilities.newBlob(bytes,'application/vnd.sqlite3','inventario-'+fuente.clave+'-'+fecha+'.sqlite'));
  // La referencia vigente cambia solo después de releer desde Drive los mismos bytes que comprobó SQLite.
  if (archivoHuella_(nuevo.getBlob().getBytes()) !== huella) throw Error('Drive no devolvió una copia idéntica. Sigue vigente la versión anterior.');
  props.setProperty(clave,JSON.stringify({id:nuevo.getId(),huella,anterior:version?.id || null}));
  // Mantener la versión vigente y su antecesora. Solo se retiran copias generadas por este proyecto.
  if (version?.anterior) {
    try {DriveApp.getFileById(version.anterior).setTrashed(true);}
    catch (e) {console.warn('Se conservó una copia anterior de '+fuente.clave+'.');}
  }
  return {fuente:fuente.nombre, archivo:nuevo.getId(), ...copia.resumen};
}

async function copiarHistorialConfirmado() {
  const SQL = await motorArchivoInventario_();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    const props = PropertiesService.getScriptProperties();
    const carpetaId = props.getProperty('SQLITE_CARPETA');
    const carpeta = carpetaId ? DriveApp.getFolderById(carpetaId) : DriveApp.createFolder('SK - Histórico de inventario SQLite');
    if (!carpetaId) props.setProperty('SQLITE_CARPETA',carpeta.getId());
    if (carpeta.isTrashed() || carpeta.getSharingAccess() !== DriveApp.Access.PRIVATE || carpeta.getEditors().length || carpeta.getViewers().length)
      throw Error('El histórico requiere una carpeta privada de Drive.');
    const resumen = [], fallos = [];
    for (const fuente of ARCHIVO_FUENTES) {
      try {resumen.push(archivoGuardarCopia_(SQL,fuente,props,carpeta));}
      catch (error) {fallos.push(fuente.nombre+' · '+error.message);}
    }
    console.log(JSON.stringify(resumen));
    if (fallos.length) throw Error(fallos.join(' / '));
    return resumen;
  } finally {lock.releaseLock();}
}

async function activarHistorialInventario() {
  if (!await copiarHistorialConfirmado()) throw Error('Hay otra copia en curso. Vuelve a ejecutar la activación cuando termine.');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (!ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'copiarHistorialConfirmado')) {
      ScriptApp.newTrigger('copiarHistorialConfirmado').timeBased().everyHours(1).create();
    }
  } finally {lock.releaseLock();}
}
