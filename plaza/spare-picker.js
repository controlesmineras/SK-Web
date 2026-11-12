// Dos pasos para repuestos; el select original contiene únicamente el ID del ítem real.
(()=>{
  function mount(form,api){
    const groups=window.SKSpareGroups,select=form.elements.itemId,label=select.closest('label');
    const child=document.createElement('label'),caption=document.createElement('span'),balance=document.createElement('small');
    child.className='itemSearchField spareItemField';child.hidden=true;child.style.display='none';
    child.append(caption);label.after(child);
    balance.className='itemSearchBalance';balance.setAttribute('aria-live','polite');balance.hidden=true;
    label.classList.add('itemSearchField');select.hidden=true;select.required=false;
    let selectedGroup='',changing=false;
    const available=()=>api.items();
    const selectedItem=()=>available().find(item=>item.id===select.value);
    const disabled=item=>api.isDelivery&&!api.fixed(item)&&api.availability(item)<=0;
    function picker(host,suffix,placeholder,draw,choose){
      const input=document.createElement('input'),menu=document.createElement('div');
      input.type='search';input.autocomplete='off';input.className='itemSearchInput';input.placeholder=placeholder;
      input.id=form.id+suffix;input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-expanded','false');
      menu.id=input.id+'Menu';menu.className='itemSearchMenu';menu.hidden=true;menu.setAttribute('role','listbox');input.setAttribute('aria-controls',menu.id);
      host.append(input,menu);
      let active=-1;
      const close=()=>{menu.hidden=true;host.classList.remove('isOpen');input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');active=-1};
      const open=()=>{if(input.disabled)return;draw(menu,input);active=-1;input.removeAttribute('aria-activedescendant');menu.hidden=false;host.classList.add('isOpen');input.setAttribute('aria-expanded','true')};
      input.addEventListener('focus',open);input.addEventListener('click',open);
      input.addEventListener('keydown',event=>{
        if(event.key==='Escape'||event.key==='Tab'){close();return}
        if(event.key==='Enter'&&!menu.hidden){event.preventDefault();const options=[...menu.querySelectorAll('button:not(:disabled)')];if(active>=0)choose(options[active]);else if(options.length===1)choose(options[0]);return}
        if(!['ArrowDown','ArrowUp'].includes(event.key))return;
        event.preventDefault();const opening=menu.hidden;if(opening)open();const options=[...menu.querySelectorAll('button:not(:disabled)')];if(!options.length)return;
        active=active<0?(event.key==='ArrowDown'?0:options.length-1):(active+(event.key==='ArrowDown'?1:-1)+options.length)%options.length;
        menu.querySelectorAll('button').forEach(button=>button.setAttribute('aria-selected',String(button===options[active])));
        input.setAttribute('aria-activedescendant',options[active].id);options[active].scrollIntoView({block:'nearest'});
      });
      menu.addEventListener('click',event=>{const button=event.target.closest('button');if(button&&!button.disabled){event.stopPropagation();choose(button)}});
      host.addEventListener('focusout',event=>{if(event.relatedTarget&&!host.contains(event.relatedTarget))close()});
      document.addEventListener('click',event=>{if(!host.contains(event.target))close()});
      return {input,menu,open,close};
    }
    function itemButton(item,index,prefix,short=false){
      const button=document.createElement('button'),names=document.createElement('span'),strong=document.createElement('strong'),stock=document.createElement('span');
      button.type='button';button.id=form.id+prefix+index;button.dataset.itemId=item.id;button.setAttribute('role','option');button.setAttribute('aria-selected',String(select.value===item.id));button.disabled=disabled(item);
      names.className='itemSearchNames';strong.textContent=short?groups.partName(item):groups.recordName(item);names.append(strong);
      for(const alias of api.aliases(item).slice(0,2)){const span=document.createElement('span');span.textContent=alias;names.append(span)}
      const quantity=api.availability(item),badge=api.fixed(item)&&quantity<=0?{className:'empty',text:'SIN ACTIVOS REGISTRADOS'}:api.badge(quantity);
      stock.className='itemStock '+badge.className;stock.textContent=badge.text;button.append(names,stock);return button;
    }
    function empty(menu){if(!menu.children.length){const message=document.createElement('p');message.textContent='No hay elementos que coincidan.';menu.append(message)}}
    const main=picker(label,'ItemSearch','Ej.: Repuesto de YT29, guantes…',(menu,input)=>{
      const query=selectedGroup||select.value?'':input.value;
      const entries=groups.entries(available(),query).slice(0,80);
      menu.replaceChildren(...entries.map((entry,index)=>{
        if(entry.item)return itemButton(entry.item,index,'ItemOption');
        const button=document.createElement('button'),names=document.createElement('span'),strong=document.createElement('strong'),detail=document.createElement('span');
        button.type='button';button.id=form.id+'GroupOption'+index;button.dataset.spareGroup=entry.type;button.setAttribute('role','option');button.setAttribute('aria-selected',String(selectedGroup===entry.type));
        names.className='itemSearchNames';strong.textContent=entry.label;detail.textContent=entry.items.length+(entry.items.length===1?' repuesto':' repuestos')+' · Buscar ítem';names.append(strong,detail);button.append(names);return button;
      }));empty(menu);
    },button=>{
      if(button.dataset.spareGroup){
        const type=button.dataset.spareGroup;if(!groups.parts(available(),type).length)return main.open();
        select.value='';selectedGroup=type;main.input.value=groups.groupName(type);detail.input.value='';main.close();notify();refresh();detail.input.focus();
      }else chooseItem(button.dataset.itemId);
    });
    const detail=picker(child,'SpareSearch','Busca por número o nombre del ítem…',(menu,input)=>{
      const rows=groups.parts(available(),selectedGroup,select.value?'':input.value);
      menu.replaceChildren(...rows.map((item,index)=>itemButton(item,index,'SpareOption',true)));empty(menu);
    },button=>chooseItem(button.dataset.itemId));
    main.input.setAttribute('aria-label',api.title);
    function notify(){changing=true;try{select.dispatchEvent(new Event('change',{bubbles:true}))}finally{changing=false}}
    function chooseItem(id){
      const item=available().find(row=>row.id===id);
      if(!item||disabled(item)||groups.key(item)&&groups.key(item)!==selectedGroup){refresh();return}
      // Un refresco del catálogo puede haber reemplazado las opciones del select.
      if(![...select.options].some(option=>option.value===id))select.add(new Option(groups.recordName(item),id));
      select.value=id;selectedGroup=groups.key(item);main.close();detail.close();notify();refresh();
    }
    function refresh(){
      const item=selectedItem();
      if(select.value&&!item)select.value='';
      if(item)selectedGroup=groups.key(item);
      if(selectedGroup&&!groups.parts(available(),selectedGroup).length){selectedGroup='';main.input.value='';detail.input.value=''}
      child.hidden=!selectedGroup;child.style.display=selectedGroup?'flex':'none';detail.input.disabled=!selectedGroup;
      caption.textContent=api.isDelivery?(api.loan()?'BUSCA EL ÍTEM A PRESTAR':'BUSCA EL ÍTEM A ENTREGAR'):'BUSCA EL ÍTEM A INGRESAR';detail.input.setAttribute('aria-label',caption.textContent);
      detail.input.required=Boolean(selectedGroup&&!item);
      detail.input.setCustomValidity(selectedGroup&&!item?'Selecciona un ítem de este grupo.':'');
      if(selectedGroup)main.input.value=groups.groupName(selectedGroup);
      else if(item)main.input.value=groups.recordName(item);
      if(item&&selectedGroup)detail.input.value=groups.partName(item);
      balance.textContent=item?`Existencia disponible: ${api.availability(item)} ${api.fixed(item)?'activos':item.unit||item.CI_UNIDAD_MEDIDA||'unidades'}`:'';balance.hidden=!item;
      (selectedGroup?child:label).append(balance);
      if(!main.menu.hidden)main.open();if(!detail.menu.hidden){if(selectedGroup)detail.open();else detail.close()}
    }
    function clear(){select.value='';selectedGroup='';main.input.value='';detail.input.value='';main.close();detail.close();refresh()}
    main.input.addEventListener('input',()=>{select.value='';selectedGroup='';detail.input.value='';detail.close();notify();refresh();main.open()});
    detail.input.addEventListener('input',()=>{select.value='';notify();refresh();detail.open()});
    select.addEventListener('change',()=>{if(!changing)refresh()});
    label._refreshItemSearch=refresh;label._refreshItemAvailability=refresh;label._clearItemSearch=clear;
    label._validateItemSearch=()=>{
      refresh();
      if(selectedGroup&&!selectedItem()){detail.input.reportValidity();detail.input.focus();return false}
      return true;
    };
    label._hasItemSearchDraft=()=>Boolean(selectedGroup||main.input.value.trim()||detail.input.value.trim());
    refresh();return {main,detail,refresh,clear};
  }
  window.SKSparePicker={mount};
})();
