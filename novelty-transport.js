(()=>{
'use strict';
const $=s=>document.querySelector(s);
const text=value=>String(value??'').trim();
const norm=value=>text(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const personLabel=person=>[person.documento,person.nombre].filter(Boolean).join(' - ');
let people=[],generation=0,loaded=false,loadError=false,input,list,responsible,warehouse;

function snapshotPerson(select,prefix){
  const form=$('#noveltyForm'),person=people.find(row=>text(row.id)===select.value);
  for(const [name,value] of [[`${prefix}Nombre`,person?.nombre],[prefix==='responsable'?'documentoResponsable':'documentoBodeguero',person?.documento]]){
    let hidden=form.querySelector(`input[name="${name}"]`);
    if(!hidden){hidden=document.createElement('input');hidden.type='hidden';hidden.name=name;form.append(hidden)}
    hidden.value=text(value);
  }
}
function validate(){input.setCustomValidity(text(input.value)&&!responsible.value?'Selecciona un funcionario de la lista.':'')}
function close(){list.hidden=true;input.setAttribute('aria-expanded','false')}
function matches(){
  const terms=norm(input.value).split(/\s+/).filter(Boolean);
  return people.filter(person=>{const haystack=norm([person.documento,person.nombre,person.empresa,person.area,person.cargo].join(' '));return terms.every(term=>haystack.includes(term))});
}
function choose(person){
  responsible.value=text(person.id);input.value=personLabel(person);validate();close();
  responsible.dispatchEvent(new Event('change',{bubbles:true}));
}
function render(){
  const hits=responsible.value?people:matches();list.replaceChildren();
  for(const person of hits.slice(0,50)){
    const button=document.createElement('button');button.type='button';button.textContent=personLabel(person);
    button.addEventListener('click',()=>choose(person));list.append(button);
  }
  if(!hits.length){
    const status=document.createElement('div');status.className='noSuggestion';status.setAttribute('role','status');
    status.textContent=loadError?'No se pudo cargar el personal. Vuelve a tocar el buscador.':!loaded?'Cargando funcionarios…':!people.length?'No hay funcionarios cargados. Sincroniza la aplicación.':'Sin coincidencias por nombre o documento.';
    list.append(status);
  }
  list.hidden=false;input.setAttribute('aria-expanded','true');
}
async function loadPeople(){
  if(typeof all!=='function'||typeof db==='undefined'||!db)return;
  const ticket=++generation;
  try{
    const rows=await all('personal');if(ticket!==generation)return;
    people=rows.filter(person=>person&&!person.deleted&&text(person.id)).sort((a,b)=>text(a.nombre).localeCompare(text(b.nombre),'es'));
    loaded=true;loadError=false;
    // Read the selection after the await: the user may have changed it during loading.
    const oldR=responsible.value,oldW=warehouse.value;
    responsible.replaceChildren(new Option('Seleccionar responsable…',''),...people.map(person=>new Option(personLabel(person),text(person.id))));
    warehouse.replaceChildren(new Option('Seleccionar bodeguero/a…',''),...people.filter(person=>/bodeguer[oa]/i.test(text(person.cargo))).map(person=>new Option(personLabel(person),text(person.id))));
    responsible.value=oldR;warehouse.value=oldW;
    const chosen=people.find(person=>text(person.id)===responsible.value);
    if(chosen)input.value=personLabel(chosen);
    snapshotPerson(responsible,'responsable');snapshotPerson(warehouse,'bodeguero');validate();
  }catch(error){if(ticket!==generation)return;loadError=true;console.error('No se pudo cargar el personal de novedades:',error)}
  if(!list.hidden)render();
}
function init(){
  const form=$('#noveltyForm');responsible=$('#novResponsible');warehouse=$('#novWarehouse');
  if(!form||!responsible||!warehouse||$('#novResponsibleSearch'))return;
  input=document.createElement('input');input.id='novResponsibleSearch';input.type='search';input.autocomplete='off';input.placeholder='Buscar por nombre o documento…';
  input.setAttribute('aria-controls','novResponsibleLive');input.setAttribute('aria-expanded','false');responsible.before(input);responsible.hidden=true;
  list=document.createElement('div');list.id='novResponsibleLive';list.hidden=true;input.parentElement.append(list);
  // Own results container: other modules close every shared .liveSuggestions on click.
  const style=document.createElement('style');style.textContent='#novResponsibleLive{display:grid;gap:4px;max-height:280px;overflow:auto;margin-top:4px;border:1px solid #ccd8e0;border-radius:8px}#novResponsibleLive[hidden]{display:none}#novResponsibleLive button{width:100%;text-align:left;white-space:normal;background:#f2f6f9;color:#173d59;padding:10px;font-weight:500}#novResponsibleLive button:focus-visible{outline:3px solid #e7b45a;outline-offset:-3px}';document.head.append(style);
  input.addEventListener('input',()=>{responsible.value='';snapshotPerson(responsible,'responsable');validate();render()});
  input.addEventListener('focus',()=>{render();void loadPeople()});
  input.addEventListener('click',render);
  input.addEventListener('keydown',event=>{
    if(event.key==='Escape')close();
    if(event.key==='ArrowDown'){event.preventDefault();render();list.querySelector('button')?.focus()}
    if(event.key==='Enter'&&!responsible.value){event.preventDefault();const hits=matches();if(hits.length===1)choose(hits[0]);else render()}
  });
  list.addEventListener('keydown',event=>{if(event.key==='Escape'){input.focus();close()}});
  document.addEventListener('pointerdown',event=>{if(!input.parentElement.contains(event.target))close()});
  responsible.addEventListener('change',()=>{const person=people.find(row=>text(row.id)===responsible.value);input.value=person?personLabel(person):'';snapshotPerson(responsible,'responsable');validate()});
  warehouse.addEventListener('change',()=>snapshotPerson(warehouse,'bodeguero'));
  form.addEventListener('reset',()=>setTimeout(()=>{input.value='';responsible.value='';warehouse.value='';snapshotPerson(responsible,'responsable');snapshotPerson(warehouse,'bodeguero');validate();close()},0));
  for(const event of ['skweb-db-ready','skweb-synced'])window.addEventListener(event,()=>void loadPeople());
  void loadPeople();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
