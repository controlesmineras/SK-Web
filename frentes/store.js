'use strict';
const FrontStore=(()=>{
  const doc=value=>String(value||'').normalize('NFKC').replace(/[.\s-]/g,'').toUpperCase();
  const norm=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const today=(time=new Date())=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(time);
  const clock=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Bogota',hour:'2-digit',hourCycle:'h23'});
  function shift(time=new Date()){const h=Number(clock.format(time));return h<6||h>=22?'S':h<14?'D':'T';}
  function name(p){return p.nombre||[p.primerNombre,p.segundoNombre,p.primerApellido,p.segundoApellido].filter(Boolean).join(' ');}
  function people(state,excludeReport){
    const rows=state.people.slice(),seen=new Set(rows.map(p=>doc(p.documento)).filter(Boolean));
    for(const r of state.reports){
      if(r.id===excludeReport||!r.newPerson||r.status!=='pending'||seen.has(doc(r.documento)))continue;
      rows.push({...r.newPerson,id:r.personId,nombre:r.nombre,local:true});
      seen.add(doc(r.documento));
    }
    return rows;
  }
  function matches(rows,value,documentsOnly=false){
    const query=norm(value);
    if(!query)return [];
    const key=doc(value),words=query.split(/\s+/);
    return rows.filter(p=>(key&&doc(p.documento).includes(key))||(!documentsOnly&&words.every(w=>norm(name(p)).includes(w))))
      .sort((a,b)=>Number(doc(b.documento)===key)-Number(doc(a.documento)===key)||name(a).localeCompare(name(b),'es'));
  }
  const empty=()=>({people:[],reports:[],options:{},lastSync:''});
  let opened;
  function open(){
    if(!opened)opened=new Promise((resolve,reject)=>{
      const req=indexedDB.open('sk-frentes-v1',1);
      req.onupgradeneeded=()=>req.result.createObjectStore('accounts');
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>{opened=null;reject(req.error);};
    });
    return opened;
  }
  async function access(owner,change){
    const db=await open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('accounts',change?'readwrite':'readonly'),table=tx.objectStore('accounts'),read=table.get(owner);
      let next,failure;
      read.onsuccess=()=>{
        next=read.result||empty();
        if(change)try{change(next);table.put(next,owner);}catch(error){failure=error;tx.abort();}
      };
      tx.oncomplete=()=>resolve(next);tx.onabort=tx.onerror=()=>reject(failure||tx.error||new Error('No se pudo guardar en este dispositivo.'));
    });
  }
  function save(state,report,previousRevision){
    const previous=state.reports.find(r=>r.id===report.id);
    if(previous && (previous.status!=='review'||previous.rev!==previousRevision))throw new Error('El reporte cambió. Vuelve a abrirlo desde Mis reportes.');
    if(report.newPerson){
      const existing=people(state,report.id).find(p=>doc(p.documento)===doc(report.documento));
      if(existing && existing.id!==report.personId)throw new Error('El documento ya está registrado. Selecciona al funcionario existente.');
    }
    if(previous)Object.assign(previous,report);else state.reports.push(report);
  }
  function apply(state,result,sent){
    if(result.protocol!=='work-front-v1'||!Array.isArray(result.personal)||!Array.isArray(result.receipts))throw new Error('Falta la confirmación del servidor.');
    for(const row of sent){
      const receipt=result.receipts.find(x=>x.id===row.id);
      if(!receipt||!['synced','review'].includes(receipt.status))throw new Error('Falta confirmar un reporte. Sigue pendiente.');
      const current=state.reports.find(r=>r.id===row.id);
      if(!current||current.rev!==row.rev||current.status!=='pending')continue;
      current.status=receipt.status; current.message=receipt.message||''; current.existing=receipt.existing||null;
      if(receipt.status==='synced'){current.personId=receipt.personId;current.newPerson=null;}
    }
    state.people=result.personal;state.options=result.options||{};state.lastSync=new Date().toISOString();
  }
  return {doc,norm,name,today,shift,people,matches,empty,access,save,apply};
})();
if(typeof module!=='undefined')module.exports=FrontStore;
