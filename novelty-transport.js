(()=>{
const $=s=>document.querySelector(s);
const text=x=>String(x??'').trim();
const norm=v=>text(v).normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase();
let people=[];
async function loadPeople(){
  if(typeof all!=='function'||typeof db==='undefined'||!db)return;
  const rows=await all('personal');
  people=rows.slice();
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
  setupResponsibleSearch();
}

function setupResponsibleSearch(){
  const sel=$('#novResponsible');if(!sel)return;
  let input=$('#novResponsibleSearch');
  if(!input){input=document.createElement('input');input.id='novResponsibleSearch';input.type='search';input.autocomplete='off';input.placeholder='Buscar por nombre o documento…';sel.before(input);sel.hidden=true}
  let list=$('#novResponsibleLive');if(!list){list=document.createElement('div');list.id='novResponsibleLive';list.className='liveSuggestions';input.parentElement.append(list)}
  const render=()=>{const q=norm(input.value);const hits=people.filter(p=>!q||norm([p.documento,p.nombre,p.empresa,p.area,p.cargo].join(' ')).includes(q)).slice(0,50);list.innerHTML=hits.map((p,i)=>'<button type="button" data-i="'+i+'">'+[p.documento,p.nombre].filter(Boolean).join(' - ')+'</button>').join('')||(q?'<div class="noSuggestion">Sin coincidencias</div>':'');list.classList.toggle('open',!!hits.length||!!q);list.onclick=e=>{const b=e.target.closest('[data-i]');if(!b)return;const p=hits[Number(b.dataset.i)];input.value=[p.documento,p.nombre].filter(Boolean).join(' - ');sel.value=p.id;list.classList.remove('open');snapshotPerson('#novResponsible','responsable')}};
  if(!input.dataset.bound){input.dataset.bound='1';input.addEventListener('input',()=>{sel.value='';render()});input.addEventListener('focus',render)}
  const chosen=people.find(p=>p.id===sel.value);if(chosen&&!input.value)input.value=[chosen.documento,chosen.nombre].filter(Boolean).join(' - ');
}

function snapshotPerson(selectId,prefix){
  const s=$(selectId),f=$('#noveltyForm');if(!s||!f)return;
  const o=s.selectedOptions?.[0];
  let hidden=f.querySelector(`input[name="${prefix}Nombre"]`);
  if(!hidden){hidden=document.createElement('input');hidden.type='hidden';hidden.name=`${prefix}Nombre`;f.append(hidden)}
  hidden.value=o&&o.value?o.textContent:'';
}
function init(){
  setupResponsibleSearch();
  let tries=0;const t=setInterval(async()=>{tries++;if(typeof db!=='undefined'&&db){clearInterval(t);await loadPeople()}else if(tries>40)clearInterval(t)},250);
  $('#novResponsible')?.addEventListener('change',()=>snapshotPerson('#novResponsible','responsable'));
  $('#novWarehouse')?.addEventListener('change',()=>snapshotPerson('#novWarehouse','bodeguero'));
  document.querySelector('button[data-view="novelties"]')?.addEventListener('click',loadPeople);
}
window.addEventListener('load',init);
})();