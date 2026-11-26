// Un serial identifica un activo, independientemente de su clase.
(() => {
  const displayValue = value => {
    const text = String(value ?? '').trim();
    return /^no aplica$/i.test(text) ? '' : text;
  };
  const isColumn = value => /^columnas?\b/i.test(displayValue(typeof value === 'string' ? value : value?.clase));
  const firstValue = (...values) => values.map(displayValue).find(Boolean) || '';
  function columnIdentity(asset) {
    const markNumber = firstValue(asset.numeroMarcaActual, asset.marcaAnterior);
    const number = markNumber || firstValue(asset.numeroClase, asset.numeroYT, asset.orden);
    const mark = firstValue(asset.marcaActual, asset.marcaInterna, asset.nuevaMarca);
    return {number, mark, numberLabel:markNumber ? 'N.º de marca' : 'N.º de clase'};
  }
  function equipmentHeading(asset) {
    const clase = displayValue(asset.clase);
    const family = clase.match(/^(YT|Columnas?)(?=\b|\d)/i);
    if (!family) return '';
    const model = displayValue(asset.modelo);
    if (!model) return clase;
    const suffix = clase.slice(family[0].length).replace(/^[\s-]+/, '');
    const name = suffix.toLowerCase() === model.toLowerCase() ? family[0] : clase;
    return name + ' - ' + model;
  }
  function columnLabel(asset, heading = displayValue(asset.clase) || 'Columna') {
    const identity = columnIdentity(asset);
    return [heading,
      identity.number && `${identity.numberLabel}: ${identity.number}`,
      identity.mark && `Marca actual: ${identity.mark}`,
      displayValue(asset.largo) && `${displayValue(asset.largo)} ft`,
      displayValue(asset.minaOrigen) && `Origen: ${displayValue(asset.minaOrigen)}`
    ].filter(Boolean).join(' · ');
  }
  // Renderizar la identidad vigente sin reescribir los movimientos históricos.
  function movementLabel(row, assets = [], describeColumn = columnLabel) {
    const asset = assets.find(asset => asset.id === row.assetId) || row.assetCandidate;
    if (asset && isColumn(asset)) return describeColumn(asset);
    const saved = displayValue(row.assetLabel);
    if (isColumn(row.itemName) || isColumn(saved)) {
      return saved.split(' · ').filter(part => !/^\s*serial\b/i.test(part)).join(' · ') || row.itemName || 'Columna';
    }
    return saved;
  }
  const serialKey = value => {
    const key = String(value ?? '').trim().toLowerCase();
    return key === 'no aplica' ? '' : key;
  };
  // Estas descripciones se conservan en la ficha, pero no identifican un equipo.
  const uniqueSerialKey = value => {
    const key = serialKey(value);
    return /^(?:no registra|no trae(?: serial)?|no (?:es )?visible|sin serial|serial ilegible|ilegible|no tiene(?: serial)?)$/.test(key.replace(/\s+/g,' ')) ? '' : key;
  };
  function duplicateSerial(rows, asset) {
    const key = uniqueSerialKey(asset.serial);
    if (asset.deleted || !key) return null;
    return rows.find(row => !row.deleted && (!asset.id || row.id !== asset.id) && uniqueSerialKey(row.serial) === key) || null;
  }
  function markFamily(clase){
    const type=String(clase||'').trim();
    if(/^yt(?:\b|\d)/i.test(type))return 'yt';
    if(/^columnas?(?:\b|\d)/i.test(type))return 'columna';
    return '';
  }
  function marksCanCollide(leftClass,rightClass){
    const left=markFamily(leftClass),right=markFamily(rightClass);
    return !left||!right||left===right;
  }
  // Las YT y las columnas pueden llevar la misma marca física.
  // Una colisión que ya existía no impide guardar novedades ajenas a la marcación.
  function duplicateNewMark(rows, asset) {
    const code=value=>String(value??'').trim().toUpperCase(),mark=code(asset.nuevaMarca);
    if(asset.deleted||!/^(?:[A-Z]{3}|[A-Z]-[A-Z]{2})$/.test(mark))return null;
    const old=rows.find(row=>row.id===asset.id);
    if(old&&markFamily(old.clase)===markFamily(asset.clase)&&code(old.nuevaMarca)===mark)return null;
    return rows.find(row=>row.id!==asset.id&&marksCanCollide(asset.clase,row.clase)&&['nuevaMarca','marcaActual','marcaInterna','marcaPrevia','marcaAnterior','numeroMarcaActual'].some(key=>code(row[key])===mark))||null;
  }
  const identityMark = asset => serialKey(asset.marcaPrevia || (!asset.markingPolicy ? asset.marcaActual || asset.marcaInterna : ''));
  const serialStatusLabel = asset => ({none:'Sin serial',unreadable:'Serial ilegible'})[asset.serialStatus] || '';
  const hasSerialException = asset => asset.serialStatus === 'none' || asset.serialStatus === 'unreadable';
  const requiresSerial = (asset, criterion) => !isColumn(asset) && (!criterion || /^(true|1|si|sí|yes)$/i.test(String(criterion.usesSerial??criterion.CI_USA_SERIAL??'').trim()));
  const serialDescription = value => {
    const key=String(value??'').trim().toLowerCase().replace(/\s+/g,' ');
    return ['no registra','no trae','no visible'].includes(key)?'No registra':'';
  };
  const searchSerial = value => uniqueSerialKey(value) ? displayValue(value) : '';
  const hasIdentity = (asset, criterion) => {
    if(!requiresSerial(asset,criterion))return true;
    const key=String(asset.serial??'').trim().toLowerCase().replace(/\s+/g,' ');
    return !!key&&!/^(?:no aplica|no trae serial|no es visible|sin serial|serial ilegible|ilegible|legible|no (?:es )?legible|no tiene(?: serial)?)$/.test(key);
  };
  function duplicateIdentity(rows, asset) {
    const serial = duplicateSerial(rows, asset);if(serial)return serial;
    const mark=identityMark(asset);if(!mark)return null;
    const type=serialKey(asset.clase),mine=serialKey(asset.minaOrigen||asset.mina||'Sandra K');
    return rows.find(row=>!row.deleted&&row.id!==asset.id&&serialKey(row.clase)===type&&serialKey(row.minaOrigen||row.mina||'Sandra K')===mine&&[row.marcaPrevia,row.marcaActual,row.marcaInterna,row.nuevaMarca].some(value=>serialKey(value)===mark))||null;
  }
  
  const automaticNumberEligible=value=>{const type=String(value??'').trim().toLowerCase();return !!type&&!/^(?:autorrescatador(?:es)?\b|yt(?:\b|\d)|columnas?\b)/i.test(type)};
  function classNumber(rows, asset) {
    const key=value=>String(value??'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');
    const number=row=>String(row.numeroClase||row.numeroYT||row.orden||'').trim();
    const peers=rows.filter(row=>key(row.clase)===key(asset.clase)),old=peers.find(row=>row.id&&row.id===asset.id);
    if(old&&number(old))return number(old);
    const used=new Set(peers.map(number).filter(value=>/^\d+$/.test(value)).map(Number));
    if(old){const missing=peers.filter(row=>!number(row)).sort((a,b)=>String(a.createdAt||'').localeCompare(String(b.createdAt||''))||String(a.id).localeCompare(String(b.id)));let next=1;for(const row of missing){while(used.has(next))next++;if(row.id===asset.id)return String(next);used.add(next++);}}
    return String(Math.max(peers.length,0,...used)+1);
  }

  // Áreas de asignación de activos; la bodega no es un área de personal.
  function assignmentAreas(configured) {
    const areas=Array.isArray(configured)?configured:['Seguridad física','Desmin - Obras civiles','Producción','Producción - Selectivo (Corteros)','Administrativa'];
    const warehouse='Bodega Plaza Blending',seen=new Set();
    return [...areas,warehouse].map(value=>String(value??'').trim()).filter(Boolean).map(value=>value.toLocaleLowerCase('es')===warehouse.toLocaleLowerCase('es')?warehouse:value).filter(value=>{const key=value.toLocaleLowerCase('es');if(seen.has(key))return false;seen.add(key);return true});
  }

  function label(asset) {
    if (isColumn(asset)) return columnLabel(asset);
    return [asset.clase, asset.numeroClase || asset.numeroYT, asset.marcaActual || asset.marcaInterna, searchSerial(asset.serial)].filter(Boolean).join(' · ');
  }
  window.SKAssetRules = {assignmentAreas, marksCanCollide, serialKey, searchSerial, duplicateSerial, duplicateNewMark, identityMark, serialStatusLabel, hasSerialException, requiresSerial, serialDescription, hasIdentity, duplicateIdentity, classNumber, automaticNumberEligible, label, equipmentHeading, isColumn, columnIdentity, columnLabel, movementLabel};
})();
