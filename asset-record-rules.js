// Un serial identifica un activo, independientemente de su clase.
(() => {
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
    return [asset.clase, asset.numeroClase || asset.numeroYT, asset.marcaActual || asset.marcaInterna, asset.serial].filter(Boolean).join(' · ');
  }
  window.SKAssetRules = {serialKey, duplicateSerial, identityMark, hasIdentity, duplicateIdentity, classNumber, automaticNumberEligible, label};
})();
