(()=>{
const $=s=>document.querySelector(s);
const text=x=>String(x??'').trim();
async function loadPeople(){
  if(typeof all!=='function'||typeof db==='undefined'||!db)return;
  const people=await all('personal');
  const responsible=$('#novResponsible'),warehouse=$('#novWarehouse');
  if(!responsible||!warehouse)return;
  const oldR=responsible.value,oldW=warehouse.value;
  responsible.innerHTML='<option value="">Seleccionar responsable…</option>';
  warehouse.innerHTML='<option value="">Seleccionar bodeguero/a…</option>';
  people.slice().sort((a,b)=>text(a.nombre).localeCompare(text(b.nombre),'es')).forEach(p=>{
    const label=[p.documento,p.nombre].filter(Boolean).join(' - ');
    const o=document.createElement('option');o.value=p.id;o.textContent=label;responsible.append(o);
    if(/bodeguer[oa]/i.test(text(p.cargo))){const w=o.cloneNode(true);warehouse.append(w)}
  });
  responsible.value=oldR;warehouse.value=oldW;
}
function snapshotPerson(selectId,prefix){
  const s=$(selectId),f=$('#noveltyForm');if(!s||!f)return;
  const o=s.selectedOptions?.[0];
  let hidden=f.querySelector(`input[name="${prefix}Nombre"]`);
  if(!hidden){hidden=document.createElement('input');hidden.type='hidden';hidden.name=`${prefix}Nombre`;f.append(hidden)}
  hidden.value=o&&o.value?o.textContent:'';
}
function init(){
  let tries=0;const t=setInterval(async()=>{tries++;if(typeof db!=='undefined'&&db){clearInterval(t);await loadPeople()}else if(tries>40)clearInterval(t)},250);
  $('#novResponsible')?.addEventListener('change',()=>snapshotPerson('#novResponsible','responsable'));
  $('#novWarehouse')?.addEventListener('change',()=>snapshotPerson('#novWarehouse','bodeguero'));
  document.querySelector('button[data-view="novelties"]')?.addEventListener('click',loadPeople);
}
window.addEventListener('load',init);
})();