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
  function label(asset) {
    return [asset.clase, asset.numeroClase || asset.numeroYT, asset.marcaActual || asset.marcaInterna, asset.serial].filter(Boolean).join(' · ');
  }
  window.SKAssetRules = {serialKey, duplicateSerial, identityMark, hasIdentity, duplicateIdentity, label};
})();
