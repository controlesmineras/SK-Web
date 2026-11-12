// Clasificación de presentación. Los identificadores y saldos siguen siendo de cada repuesto.
(()=>{
  const clean=value=>String(value??'').trim();
  const normalize=value=>clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ');
  const rawName=item=>clean(item?.name||item?.nombre||item?.element||item?.elemento||item?.CI_ELEMENTO||item?.ciElemento||item?.itemName);
  const types=['YT 29','YT 28','Columna 29','Columna 28'];
  function key(item){
    if(item?.isYtSpare!==true)return '';
    return types.find(type=>normalize(type).replace(/ /g,'')===normalize(item.spareEquipment).replace(/ /g,''))||'';
  }
  const typeName=type=>type.startsWith('YT ')?type.replace('YT ','YT'):type.toLowerCase();
  const typeLabel=type=>'Repuesto de '+typeName(type);
  const groupName=type=>'Repuestos de '+typeName(type);
  const partName=item=>[clean(item?.spareItemNumber),clean(item?.spareItemName)||rawName(item)].filter(Boolean).join(' · ');
  function recordName(item){
    const type=key(item);
    if(!type||!clean(item.spareItemName))return rawName(item);
    return[typeLabel(type),clean(item.spareItemNumber)?'Ítem '+clean(item.spareItemNumber):'',clean(item.spareItemName)].filter(Boolean).join(' · ');
  }
  function matches(item,query){
    let q=normalize(query);if(!q)return true;
    const text=normalize([rawName(item),recordName(item),item.secondaryName,item.tertiaryName,item.CI_ALIAS_SECUNDARIO,item.CI_ALIAS_TERCIARIO].filter(Boolean).join(' '));
    const requested=q.match(/\bitem\s*(\d+)\b/)||q.match(/^(\d+)$/);
    if(requested&&key(item)){
      if(clean(item.spareItemNumber)!==requested[1])return false;
      q=q.replace(requested[0],' ').trim();
    }
    return q.split(/\s+/).filter(Boolean).every(word=>text.includes(word));
  }
  function parts(items,type,query=''){
    return items.filter(item=>!item.deleted&&item.active!==false&&key(item)===type&&matches(item,query)).sort((a,b)=>{
      const an=clean(a.spareItemNumber),bn=clean(b.spareItemNumber);
      return Number(!an)-Number(!bn)||an.localeCompare(bn,'es',{numeric:true})||partName(a).localeCompare(partName(b),'es',{numeric:true});
    });
  }
  function entries(items,query=''){
    const active=items.filter(item=>!item.deleted&&item.active!==false),q=normalize(query).replace(/\brepuestos\b/g,'repuesto').replace(/\byt\s+(?=\d)/g,'yt');
    const groups=types.map(type=>({type,label:groupName(type),items:parts(active,type)})).filter(group=>group.items.length&&(!q||normalize(typeLabel(group.type)).includes(q)||group.items.some(item=>matches(item,q))));
    return [...groups,...active.filter(item=>!key(item)&&matches(item,query)).map(item=>({item}))];
  }
  window.SKSpareGroups={types,key,typeLabel,groupName,partName,recordName,matches,parts,entries};
})();
