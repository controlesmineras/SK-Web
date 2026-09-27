// Selector de cargo compartido por Personal de System Admin y Plaza Blending.
(()=>{
  'use strict';
  const normalize=value=>String(value||'').trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  function setup(form){
    const select=form?.elements.cargo;
    if(!select||select.dataset.searchReady)return;
    select.dataset.searchReady='1';
    const label=select.closest('label'),input=document.createElement('input'),menu=document.createElement('div');
    label.classList.add('cargoSearchField');
    input.type='search';input.className='cargoSearchInput';input.placeholder='Buscar y seleccionar cargo…';input.autocomplete='off';input.required=select.required;
    input.setAttribute('aria-label','Cargo');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-expanded','false');input.setAttribute('role','combobox');
    menu.className='cargoSearchMenu';menu.hidden=true;menu.id=`${form.id}CargoOptions`;
    input.setAttribute('aria-controls',menu.id);
    select.hidden=true;select.required=false;
    label.insertBefore(input,select);label.append(menu);
    const entries=()=>[...select.options].filter(option=>option.value);
    const close=()=>{menu.hidden=true;input.setAttribute('aria-expanded','false')};
    const sync=()=>{input.value=entries().find(option=>option.value===select.value)?.textContent||'';input.setCustomValidity('');close()};
    const draw=()=>{
      const query=normalize(input.value),rows=entries().filter(option=>!query||normalize(option.textContent).includes(query));
      menu.replaceChildren();
      for(const option of rows){const button=document.createElement('button');button.type='button';button.textContent=option.textContent;button.dataset.value=option.value;menu.append(button)}
      if(!rows.length){const message=document.createElement('p');message.textContent='No hay cargos que coincidan.';menu.append(message)}
      menu.hidden=false;input.setAttribute('aria-expanded','true');
    };
    const choose=value=>{select.value=value;sync();select.dispatchEvent(new Event('change',{bubbles:true}));input.focus()};
    input.addEventListener('focus',()=>{if(select.value&&input.value!==select.selectedOptions[0]?.textContent)sync();draw()});
    input.addEventListener('input',()=>{select.value='';input.setCustomValidity('Selecciona un cargo de la lista.');draw()});
    input.addEventListener('keydown',event=>{if(event.key==='Escape')close();if(event.key==='Enter'&&!menu.hidden){const first=menu.querySelector('button');if(first){event.preventDefault();choose(first.dataset.value)}}});
    menu.addEventListener('click',event=>{const button=event.target.closest('button[data-value]');if(button)choose(button.dataset.value)});
    document.addEventListener('click',event=>{if(!label.contains(event.target))close()});
    form.addEventListener('reset',()=>setTimeout(sync,0));
    window.addEventListener('skweb-options-applied',sync);
    label.refreshCargoSearch=sync;
    sync();
  }
  function mount(){setup(document.querySelector('#personalForm'));setup(document.querySelector('#plazaCollaboratorForm'))}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
  window.SKCargoSearch={mount,refresh:()=>document.querySelectorAll('.cargoSearchField').forEach(label=>label.refreshCargoSearch?.())};
})();
