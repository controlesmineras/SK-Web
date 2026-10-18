// Read-only projection: source movements remain the audit record; consultation never writes copies.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SKAssetHistory=api})(typeof window==='object'?window:globalThis,()=>{
 'use strict';
 const text=value=>String(value??'').trim();
 const norm=value=>text(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
 const millis=value=>Date.parse(value)||0;
 const reversed=row=>!!(row.reversed||row.reversado||row.reversedAt);
 function localTime(value){
  if(!millis(value))return {date:'',time:''};
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)).map(p=>[p.type,p.value]));
  return {date:`${parts.year}-${parts.month}-${parts.day}`,time:`${parts.hour}:${parts.minute}`};
 }
 function eventTime(row){
  if(millis(row.occurredAt))return row.occurredAt;
  if(/^\d{4}-\d{2}-\d{2}$/.test(text(row.fechaNovedad))){const value=row.fechaNovedad+'T'+(row.horaNovedad||'00:00')+'-05:00';if(millis(value))return value;}
  return row.createdAt||''; // updatedAt is a synchronization/edit time, not the event time.
 }
 function person(people,id,document,name,area='',cargo=''){
  document=text(document);name=text(name);
  // Older manual novelties snapshot the option label as "document - name".
  const match=name.match(/^([\d. -]+?)\s+-\s+(.+)$/);
  if(match){document=document||match[1].trim();name=match[2].trim();}
  const found=(document&&people.find(p=>text(p.documento)===document))||people.find(p=>id&&text(p.id)===text(id)&&(!document||text(p.documento)===document));
  return {id:text(id||found?.id),document:document||text(found?.documento),name:name||text(found?.nombre),area:text(area||found?.area),cargo:text(cargo||found?.cargo)};
 }
 function warehouse(row,people,manual=false){
  if(manual)return person(people,row.bodegueroId,row.documentoBodeguero,row.bodegueroNombre||row.nombreBodeguero);
  const doc=text(row.actorDocument||row.operatorDocument),mismatch=row.actorDocument&&row.operatorDocument&&text(row.actorDocument)!==text(row.operatorDocument);
  return person(people,mismatch?'':row.operatorId,doc,mismatch?'':row.operatorName);
 }
 function timeline(data={},assetId){
  const people=data.personal||[],entries=new Map();
  for(const source of ['novelties','blendingIncomes','blendingDeliveries'])for(const row of data[source]||[]){
   if(!row||row.deleted||!row.assetId||(assetId&&text(row.assetId)!==text(assetId)))continue;
   const manual=source==='novelties',income=source==='blendingIncomes',back=norm(row.movementType)==='devolucion';
   const kind=manual?'novelty':income?'income':back?'return':norm(row.deliveryType)==='prestamo'?'loan':'assignment';
   const at=back?(row.returnedAt||row.createdAt||''):manual?eventTime(row):row.createdAt||'';
   const responsible=manual?person(people,row.responsableId,row.documentoResponsable,row.responsableNombre||row.nombreResponsable):income?person(people,row.broughtById,row.broughtByDocument,row.broughtByName):back?person(people,row.returnedById,row.returnedByDocument,row.returnedByName):person(people,row.recipientId,row.recipientDocument,row.recipientName,row.recipientArea,row.recipientCargo);
   const title=manual?(row.descripcion||'Novedad'):income?'Ingreso a bodega':back?'Devolución de préstamo':kind==='loan'?'Préstamo':'Asignación';
   const key=source+':'+(row.id||[row.assetId,at,row.recipientId,row.broughtById,row.descripcion].join('|'));
   const entry={key,assetId:row.assetId,source,kind,title,at,epoch:millis(at),...localTime(at),responsible,warehouse:warehouse(row,people,manual),location:manual?row.ubicacion||'':income||back?'Bodega de Superficie':row.destination||'Operación',state:manual?row.estado||'':'',reversed:reversed(row),pending:row.syncState==='pending',raw:row};
   const previous=entries.get(key);
   if(!previous||millis(row.updatedAt)>=millis(previous.raw.updatedAt))entries.set(key,entry);
  }
  return [...entries.values()].sort((a,b)=>b.epoch-a.epoch||b.key.localeCompare(a.key));
 }
 function project(asset,data){
  const events=timeline(data,asset.id),active=events.filter(e=>!e.reversed),latest=active[0],result={...asset};
  // A previously displayed source event is not an independent manual snapshot.
  // This also lets a reversal fall back to the preceding valid event after an owner saved the form.
  const linkedSnapshot=events.some(e=>e.date===asset.fechaNovedad&&e.time===asset.horaNovedad&&norm(e.title)===norm(asset.descripcionNovedad));
  const snapshotTime=!linkedSnapshot&&asset.fechaNovedad?millis(eventTime(asset)):0;
  if(latest&&latest.epoch&&latest.epoch>=snapshotTime){
   Object.assign(result,{fechaNovedad:latest.date,horaNovedad:latest.time,descripcionNovedad:latest.title,documentoResponsable:latest.responsible.document,nombreResponsable:latest.responsible.name,documentoBodeguero:latest.warehouse.document,nombreBodeguero:latest.warehouse.name});
   // Keep the stored physical state: an assignment by itself does not certify operability.
  }
  if(!latest&&linkedSnapshot)Object.assign(result,{fechaNovedad:'',horaNovedad:'',descripcionNovedad:'',documentoResponsable:'',nombreResponsable:'',documentoBodeguero:'',nombreBodeguero:''});
  const movement=active.find(e=>e.kind!=='novelty');
  let assigned=null;
  if(movement&&movement.epoch>=snapshotTime){
   const retired=/^dad[oa](?:\/[oa])? de baja$/.test(norm(asset.estado));
   const backInWarehouse=/bodega/.test(norm(latest?.location||asset.ubicacion));
   if(movement.kind==='assignment'&&!retired&&!backInWarehouse){assigned=movement.responsible;result.asignadaId=assigned.id;result.areaAsignada=assigned.area||asset.areaAsignada||'';}
   else if(['income','return'].includes(movement.kind)||retired||backInWarehouse){assigned={id:'',document:'',name:'',area:'',cargo:''};result.asignadaId='';result.areaAsignada='';}
  }
  return {asset:result,events,latest,assigned};
 }
 return {timeline,project,localTime};
});
