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
  function columnLabel(asset) {
    const identity = columnIdentity(asset);
    return [displayValue(asset.clase) || 'Columna',
      identity.number && `${identity.numberLabel}: ${identity.number}`,
      identity.mark && `Marca actual: ${identity.mark}`,
      displayValue(asset.largo) && `${displayValue(asset.largo)} ft`,
      displayValue(asset.minaOrigen) && `Origen: ${displayValue(asset.minaOrigen)}`
    ].filter(Boolean).join(' · ');
  }
  // Renderizar la identidad vigente sin reescribir los movimientos históricos.
  function movementLabel(row, assets = []) {
    const asset = assets.find(asset => asset.id === row.assetId) || row.assetCandidate;
    if (asset && isColumn(asset)) return columnLabel(asset);
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
  function duplicateSerial(rows, asset) {
    const key = serialKey(asset.serial);
    if (asset.deleted || !key) return null;
    return rows.find(row => !row.deleted && (!asset.id || row.id !== asset.id) && serialKey(row.serial) === key) || null;
  }
  const identityMark = asset => serialKey(asset.marcaPrevia || (!asset.markingPolicy ? asset.marcaActual || asset.marcaInterna : ''));
  const hasIdentity = asset => !!(serialKey(asset.serial) || identityMark(asset));
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

  function label(asset) {
    if (isColumn(asset)) return columnLabel(asset);
    return [asset.clase, asset.numeroClase || asset.numeroYT, asset.marcaActual || asset.marcaInterna, asset.serial].filter(Boolean).join(' · ');
  }
  window.SKAssetRules = {serialKey, duplicateSerial, identityMark, hasIdentity, duplicateIdentity, classNumber, automaticNumberEligible, label, isColumn, columnIdentity, columnLabel, movementLabel};
})();
