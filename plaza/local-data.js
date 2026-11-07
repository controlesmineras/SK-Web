/* Lossless storage for the complete Plaza snapshot, including pending records. */
(()=>{
  'use strict';
  const key='skPlazaData',format='sk-plaza-lz-v1';
  let readFailed=false;
  function read(){
    const saved=localStorage.getItem(key);
    if(!saved)return {};
    try{
      let parsed=JSON.parse(saved);
      if(parsed?.storageFormat===format){
        const raw=LZString.decompressFromUTF16(parsed.payload);
        if(typeof raw!=='string'||!raw)throw new Error('Copia comprimida incompleta');
        parsed=JSON.parse(raw);
      }
      if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('Formato de copia inválido');
      readFailed=false;
      return parsed;
    }catch(error){
      readFailed=true;
      throw new Error('No se pudo leer la copia local. Se conservó intacta para recuperar los registros pendientes.');
    }
  }
  function write(data){
    if(readFailed)throw new Error('La copia local está protegida porque no pudo leerse. No se sobrescribieron los registros.');
    const raw=JSON.stringify(data),payload=LZString.compressToUTF16(raw);
    if(LZString.decompressFromUTF16(payload)!==raw)throw new Error('No se pudo verificar la copia local. Se conservó la copia anterior.');
    const packed=JSON.stringify({storageFormat:format,payload});
    // setItem replaces this single key atomically, without deleting the old copy first.
    try{localStorage.setItem(key,packed.length<raw.length?packed:raw)}
    catch(error){
      if(error?.name==='QuotaExceededError'||error?.code===22||error?.code===1014)throw new Error('El almacenamiento local sigue lleno. No se pudo guardar la nueva copia; la copia anterior y sus registros pendientes se conservaron.');
      throw error;
    }
  }
  window.SKPlazaLocal={read,write};
})();
