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
  function label(asset) {
    return [asset.clase, asset.numeroClase || asset.numeroYT, asset.marcaActual || asset.marcaInterna, asset.serial].filter(Boolean).join(' · ');
  }
  window.SKAssetRules = {serialKey, duplicateSerial, label};
})();
