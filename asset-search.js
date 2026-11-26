// Un resultado debe poder mostrar por qué coincide con todas las palabras escritas.
(()=>{
  const fold=value=>String(value??'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';');
  const identifiers=[
    ['Clase','clase'],['N.º de clase','numeroClase'],['N.º de clase','numeroYT'],['N.º de clase','orden'],
    ['Marca','marcaActual'],['Marca','marcaInterna'],['Nueva marca','nuevaMarca'],
    ['Marca anterior','marcaPrevia'],['Marca anterior','marcaAnterior'],['N.º de marca','numeroMarcaActual'],
    ['Serial','serial'],['Modelo','modelo'],['Marca comercial','fabricante'],['Marca comercial','marcaComercial'],
    ['Mina','mina'],['Origen','minaOrigen']
  ];
  function eachIdentifier(asset,visit){
    for(const [caption,key] of identifiers){
      if(key==='orden'&&(asset.numeroClase||asset.numeroYT))continue;
      if(key==='serial'&&/^columnas?\b/.test(fold(asset.clase)))continue;
      const value=String(asset[key]??'').trim();
      if(!value||key==='serial'&&window.SKAssetRules&&!window.SKAssetRules.searchSerial(value))continue;
      const normalized=fold(value);
      if(normalized!=='no aplica')visit(caption,value,normalized);
    }
  }
  function indexText(asset,visible){
    const parts=[fold(visible)];
    eachIdentifier(asset,(_caption,_value,normalized)=>parts.push(normalized));
    return parts.join(' ');
  }
  function query(input){
    const terms=[...new Set(fold(input).trim().split(/\s+/).filter(Boolean))];
    function matchesIndex(index){return terms.every(term=>index.includes(term))}
    function matches(value){return matchesIndex(fold(value))}
    function matchCount(value){
      const text=fold(value);
      return terms.filter(term=>text.includes(term)).length;
    }
    // Si un identificador buscado no está en el rótulo habitual, hacerlo visible en la tarjeta.
    function extra(asset,visible){
      const text=fold(visible),missing=terms.filter(term=>!text.includes(term));
      if(!missing.length)return '';
      const found=new Set(),details=new Set();
      eachIdentifier(asset,(caption,value,normalized)=>{
        for(const term of missing)if(normalized.includes(term)){
          found.add(term);
          details.add(caption+': '+value);
        }
      });
      return found.size===missing.length?[...details].join(' · '):null;
    }
    function html(value){
      const text=String(value??'').normalize('NFC');
      if(!terms.length)return escape(text);
      const folded=fold(text),ranges=[];
      for(const term of terms){
        let at=folded.indexOf(term);
        while(at!==-1){ranges.push([at,at+term.length]);at=folded.indexOf(term,at+1)}
      }
      if(!ranges.length)return escape(text);
      ranges.sort((a,b)=>a[0]-b[0]);
      const merged=[];
      for(const range of ranges){
        const last=merged[merged.length-1];
        if(last&&range[0]<=last[1])last[1]=Math.max(last[1],range[1]);
        else merged.push(range);
      }
      // Conservar los caracteres originales, incluso si una letra ocupa varias unidades al normalizar.
      const offsets=[0];let original=0;
      for(const character of text){
        original+=character.length;
        const length=fold(character).length;
        if(!length)offsets[offsets.length-1]=original;
        for(let i=0;i<length;i++)offsets.push(original);
      }
      let output='',end=0;
      for(const [start,stop] of merged){
        output+=escape(text.slice(end,offsets[start]))+'<mark>'+escape(text.slice(offsets[start],offsets[stop]))+'</mark>';
        end=offsets[stop];
      }
      return output+escape(text.slice(end));
    }
    function rows(assets,describe){
      const results=[];
      for(const asset of assets){
        const lines=describe(asset),detail=extra(asset,lines.join(' '));
        if(detail!==null)results.push({asset,lines,detail});
      }
      return results;
    }
    return {matches,matchesIndex,matchCount,extra,rows,html};
  }
  window.SKAssetSearch={query,indexText,escape};
})();
