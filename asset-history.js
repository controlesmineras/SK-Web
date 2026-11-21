// Read-only projection: source movements remain the audit record; consultation never writes copies.
function createAssetHistory(){
 'use strict';
 const text=value=>String(value??'').trim();
 const norm=value=>text(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
 const millis=value=>Date.parse(value)||0;
 const reversed=row=>!!(row.reversed||row.reversado||row.reversedAt);
 const retired=asset=>/dado\/?a? de baja|retirado|desechado/i.test(`${asset.estado||''} ${asset.ubicacion||''}`);
 const inventoryLocation=area=>text(area)?'Inventario de '+text(area):'Inventario de área por confirmar';
 function assignmentArea(row,receiver){return text(row.destinationArea)||(/^Inventario de (.+)$/i.exec(text(row.destination))?.[1]||'')||receiver?.area||'';}
 function assignmentLocation(row,receiver){
  if(row.destinationArea)return inventoryLocation(row.destinationArea);
  const destination=text(row.destination);
  return !destination||['operacion','bodega de superficie'].includes(norm(destination))?inventoryLocation(assignmentArea(row,receiver)):destination;
 }
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
  const people=data.personal||[],entries=new Map();let order=0;
  for(const source of ['novelties','blendingIncomes','blendingDeliveries'])for(const row of data[source]||[]){
   if(!row||row.deleted||!row.assetId||(assetId&&text(row.assetId)!==text(assetId)))continue;
   const manual=source==='novelties',income=source==='blendingIncomes',back=norm(row.movementType)==='devolucion';
   const kind=manual?'novelty':income?'income':back?'return':norm(row.deliveryType)==='prestamo'?'loan':'assignment';
   const at=back?(row.returnedAt||row.createdAt||''):manual?eventTime(row):row.createdAt||'';
   const responsible=manual?person(people,row.responsableId,row.documentoResponsable,row.responsableNombre||row.nombreResponsable):income?person(people,row.broughtById,row.broughtByDocument,row.broughtByName):back?person(people,row.returnedById,row.returnedByDocument,row.returnedByName):person(people,row.recipientId,row.recipientDocument,row.recipientName,row.recipientArea,row.recipientCargo);
   const title=manual?(row.descripcion||'Novedad'):income?'Ingreso a bodega':back?'Devolución de préstamo':kind==='loan'?'Préstamo':'Asignación';
   const key=source+':'+(row.id||[row.assetId,at,row.recipientId,row.broughtById,row.descripcion].join('|'));
   const entry={key,order:++order,assetId:row.assetId,source,kind,title,at,epoch:millis(at),...localTime(at),responsible,warehouse:warehouse(row,people,manual),location:manual?row.ubicacion||'':income||back?'Bodega de Superficie':row.destination||'Operación',state:manual?row.estado||'':'',reversed:reversed(row),pending:row.syncState==='pending',raw:row};
   const previous=entries.get(key);
   if(!previous||millis(row.updatedAt)>=millis(previous.raw.updatedAt))entries.set(key,entry);
  }
  return [...entries.values()].sort((a,b)=>b.epoch-a.epoch||b.order-a.order);
 }
 function damaged(asset){return /^(?:averiado|averiada|averiado\/a)$/.test(norm(asset?.estado));}
 function operationStatus(asset){return damaged(asset)?'No':'Sí';}
 function latestIncomeNote(asset,data){
  const event=timeline(data,asset.id).find(entry=>entry.kind==='income'&&!entry.reversed&&!entry.raw.reversalOf&&norm(entry.raw.movementType)!=='reversion');
  return text(event?.raw.notes);
 }
 const profileFields=['fechaNovedad','horaNovedad','descripcionNovedad','currentNoveltyId','estado','ubicacion',
  'areaAsignada','areaAsignadaRevision','asignadaId','estadoVisor','nombreResponsable','documentoResponsable',
  'nombreBodeguero','documentoBodeguero','disponibleEntrega'];
 const noveltyFields={estado:'estado',ubicacion:'ubicacion',areaAsignada:'areaAsignada',estadoVisor:'estadoVisor',
  responsableNombre:'nombreResponsable',documentoResponsable:'documentoResponsable',
  bodegueroNombre:'nombreBodeguero',documentoBodeguero:'documentoBodeguero'};
 function snapshot(asset){
  return Object.fromEntries(profileFields.filter(key=>Object.prototype.hasOwnProperty.call(asset,key)).map(key=>[key,asset[key]]));
 }
 function eventPatch(entry){
  const row=entry.raw,patch={fechaNovedad:entry.date,horaNovedad:entry.time,descripcionNovedad:entry.title,currentNoveltyId:row.id};
  if(entry.kind==='novelty'){
   for(const [source,target] of Object.entries(noveltyFields))if(text(row[source]))patch[target]=text(row[source]);
   if(entry.responsible.name)patch.nombreResponsable=entry.responsible.name;
   if(entry.responsible.document)patch.documentoResponsable=entry.responsible.document;
   if(entry.warehouse.name)patch.nombreBodeguero=entry.warehouse.name;
   if(entry.warehouse.document)patch.documentoBodeguero=entry.warehouse.document;
   if(text(row.areaAsignada))patch.areaAsignadaRevision={value:text(row.areaAsignada),at:entry.at};
  }else{
   Object.assign(patch,{ubicacion:entry.kind==='assignment'?assignmentLocation(row,entry.responsible):entry.location,
    nombreResponsable:entry.responsible.name,documentoResponsable:entry.responsible.document,
    nombreBodeguero:entry.warehouse.name,documentoBodeguero:entry.warehouse.document});
   if(entry.kind==='assignment')Object.assign(patch,{asignadaId:entry.responsible.id,areaAsignada:assignmentArea(row,entry.responsible)});
   if(['income','return'].includes(entry.kind))Object.assign(patch,{asignadaId:'',areaAsignada:''});
  }
  return patch;
 }
 // Solo repone los campos afectados que no tienen otro cambio vigente posterior.
 // Los registros antiguos se reconstruyen con los valores documentados del historial.
 function restoreNovelty(asset,row,data={}){
  if(row.historyOnly)return {...asset};
  const complete={...data,novelties:(data.novelties||[]).map(item=>({...item,deleted:false}))};
  const events=timeline(complete,asset.id).map(entry=>({...entry,patch:eventPatch(entry)}));
  const index=events.findIndex(entry=>entry.kind==='novelty'&&entry.raw.id===row.id);
  if(index<0)return {...asset};
  const target=events[index],older=events.slice(index+1),later=events.slice(0,index);
  const deletedIds=new Set((data.novelties||[]).filter(item=>item.deleted).map(item=>item.id));
  const inactive=entry=>entry.reversed||entry.kind==='novelty'&&deletedIds.has(entry.raw.id);
  const applied=entry=>!entry.raw.historyOnly;
  const values=target.patch,before=row.assetBefore;
  const result={...asset};
  const metadata=['fechaNovedad','horaNovedad','descripcionNovedad','currentNoveltyId'];
  const storedTarget=asset.currentNoveltyId===row.id||!asset.currentNoveltyId&&asset.fechaNovedad===target.date&&
   text(asset.horaNovedad).slice(0,5)===target.time&&norm(asset.descripcionNovedad)===norm(target.title);
  for(const key of Object.keys(values)){
   const laterValue=later.some(entry=>applied(entry)&&!inactive(entry)&&Object.prototype.hasOwnProperty.call(entry.patch,key)&&
    JSON.stringify(result[key])===JSON.stringify(entry.patch[key]));
   if(laterValue&&!(storedTarget&&metadata.includes(key)))continue;
   const expected=row.assetAfter&&Object.prototype.hasOwnProperty.call(row.assetAfter,key)?row.assetAfter[key]:values[key];
   // Current metadata may still be the original snapshot in records created by older clients.
   if(JSON.stringify(result[key])!==JSON.stringify(expected))continue;
   let value=before?before[key]:undefined;
   if(!before){
    const known=older.find(entry=>applied(entry)&&!inactive(entry)&&Object.prototype.hasOwnProperty.call(entry.patch,key));
    if(known)value=known.patch[key];
    else if(key==='estadoVisor'&&row.estadoVisorAnterior)value=row.estadoVisorAnterior;
   }else{
    for(const entry of older){
     if(!applied(entry)||!Object.prototype.hasOwnProperty.call(entry.patch,key))continue;
     if(!inactive(entry))break;
     const after=entry.raw.assetAfter||entry.patch;
     if(JSON.stringify(value)!==JSON.stringify(after[key]))break;
     if(entry.raw.assetBefore)value=entry.raw.assetBefore[key];
     else{
      const known=older.slice(older.indexOf(entry)+1).find(previous=>applied(previous)&&!inactive(previous)&&Object.prototype.hasOwnProperty.call(previous.patch,key));
      value=known?known.patch[key]:undefined;
     }
    }
   }
   if(value===undefined)delete result[key];else result[key]=value;
  }
  result.disponibleEntrega=operationStatus(result);
  return result;
 }
 // La fecha de captura/sincronización nunca decide qué novedad ocupa la ficha.
 function applyDatedNovelty(asset,row){
  const day=text(row.fechaNovedad),time=text(row.horaNovedad),priorDay=text(asset.fechaNovedad);
  if(row.historyOnly||!day||day<priorDay||(day===priorDay&&time<=text(asset.horaNovedad||'00:00').slice(0,5)))return null;
  const result={...asset,fechaNovedad:day,horaNovedad:time,descripcionNovedad:row.descripcion,currentNoveltyId:row.id};
  for(const [source,target] of Object.entries(noveltyFields))if(text(row[source]))result[target]=text(row[source]);
  if(text(row.areaAsignada))result.areaAsignadaRevision={value:result.areaAsignada,at:eventTime(row)};
  result.disponibleEntrega=operationStatus(result);
  return result;
 }
 function project(asset,data={}){
  const actions=(data.novelties||[]).filter(row=>row.assetId===asset.id&&row.syncState==='pending'&&row.noveltyAction?.status==='pending')
   .sort((a,b)=>millis(a.noveltyAction.requestedAt)-millis(b.noveltyAction.requestedAt));
  const processed=new Set(asset.pendingNoveltyActions||[]);
  for(const row of actions){
   if(processed.has(row.noveltyAction.id))continue;
   if(!row.noveltyAction.localOnly||asset.currentNoveltyId===row.id)asset=restoreNovelty(asset,row,data);
   processed.add(row.noveltyAction.id);
  }
  if(processed.size)asset={...asset,pendingNoveltyActions:[...processed]};
  const events=timeline(data,asset.id);
  // Las novedades fechadas confirmadas ya se aplicaron a la ficha en el servidor.
  const active=events.filter(e=>!e.reversed&&!e.raw.datedNovelty&&!e.raw.historyOnly);
  let latest=active[0],result={...asset};
  // A previously displayed source event is not an independent manual snapshot.
  // This also lets a reversal fall back to the preceding valid event after an owner saved the form.
  const linkedSnapshot=!asset.currentNoveltyId&&events.some(e=>!e.raw.datedNovelty&&!e.raw.historyOnly&&e.date===asset.fechaNovedad&&e.time===asset.horaNovedad&&norm(e.title)===norm(asset.descripcionNovedad));
  const snapshotTime=!linkedSnapshot&&asset.fechaNovedad?millis(eventTime(asset)):0;
  const coversSnapshot=epoch=>asset.currentNoveltyId?Math.floor(epoch/60000)>Math.floor(snapshotTime/60000):epoch>=snapshotTime;
  if(latest&&latest.epoch&&coversSnapshot(latest.epoch)){
   Object.assign(result,{fechaNovedad:latest.date,horaNovedad:latest.time,descripcionNovedad:latest.title,documentoResponsable:latest.responsible.document,nombreResponsable:latest.responsible.name,documentoBodeguero:latest.warehouse.document,nombreBodeguero:latest.warehouse.name});
   if(!retired(asset)&&latest.location)result.ubicacion=latest.kind==='assignment'?assignmentLocation(latest.raw,latest.responsible):latest.location;

   if(asset.currentNoveltyId)delete result.currentNoveltyId;
   // Keep the stored physical state: an assignment by itself does not certify operability.
  }
  if(!latest&&linkedSnapshot)Object.assign(result,{fechaNovedad:'',horaNovedad:'',descripcionNovedad:'',documentoResponsable:'',nombreResponsable:'',documentoBodeguero:'',nombreBodeguero:''});
  const movement=active.find(e=>e.kind!=='novelty');
  let assigned=null;
  if(movement&&coversSnapshot(movement.epoch)){
   const backInWarehouse=norm(result.ubicacion)==='bodega de superficie';
   if(movement.kind==='assignment'&&!retired(asset)&&!backInWarehouse){assigned={...movement.responsible,area:assignmentArea(movement.raw,movement.responsible)};result.asignadaId=assigned.id;result.areaAsignada=assigned.area||asset.areaAsignada||'';}
   else if(['income','return'].includes(movement.kind)||retired(asset)||backInWarehouse){assigned={id:'',document:'',name:'',area:'',cargo:''};result.asignadaId='';result.areaAsignada='';}
  }
  // La asignación explícita de una novedad prevalece hasta el siguiente movimiento.
  // Se deriva del historial también cuando un auxiliar sincroniza con un servidor anterior.
  const areaEvent=active.find(event=>['assignment','income','return'].includes(event.kind)||(event.kind==='novelty'&&text(event.raw.areaAsignada)));
  if(areaEvent?.kind==='novelty'&&coversSnapshot(areaEvent.epoch)&&!retired(result)){
   result.areaAsignada=text(areaEvent.raw.areaAsignada);
  }
  // Guardar una edición de la ficha no debe recuperar después un área histórica.
  const areaRevision=asset.areaAsignadaRevision;
  if(areaRevision&&millis(areaRevision.at)>0&&millis(areaRevision.at)>=(areaEvent?.epoch||0)&&!retired(result))result.areaAsignada=text(areaRevision.value);
  if(asset.currentNoveltyId&&(!latest||!coversSnapshot(latest.epoch)))
   latest=events.find(event=>event.raw.id===asset.currentNoveltyId);
  const pending=events.filter(e=>e.raw.datedNovelty&&e.pending&&!e.raw.historyOnly&&!e.reversed)
   .sort((a,b)=>millis(a.raw.createdAt)-millis(b.raw.createdAt)||a.epoch-b.epoch||a.order-b.order);
  for(const entry of pending){
   const updated=applyDatedNovelty(result,entry.raw);
   if(updated){result=updated;latest=entry;}
  }
  result.disponibleEntrega=operationStatus(result);
  return {asset:result,events,latest,assigned};
 }
 function available(asset,data){const current=project(asset,data).asset;return !current.deleted&&!retired(current)&&norm(current.ubicacion)==='bodega de superficie';}
 return {timeline,project,applyDatedNovelty,snapshot,restoreNovelty,localTime,available,damaged,operationStatus,latestIncomeNote,inventoryLocation,assignmentArea,assignmentLocation};
}

if(typeof module==='object'&&module.exports)module.exports=createAssetHistory();
else window.SKAssetHistory=createAssetHistory();
