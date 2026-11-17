/* Selector de calendario compartido: conserva los valores y eventos de cada app. */
(()=>{
 'use strict';
 const entries=new Map();
 const calendarIcon='<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><rect x="3" y="5" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 3v4m10-4v4M3 11h18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M7 15h2m3 0h2m3 0h1M7 18h2m3 0h2" stroke="currentColor" stroke-width="2"/></svg>';
 function isoDate(value){
  const text=String(value||'').trim();
  const iso=text.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  const local=text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const parts=iso?iso.slice(1):local?[local[3],local[2],local[1]]:null;
  if(!parts||Number(parts[0])<1)return '';
  const result=parts.join('-'),date=new Date(result+'T00:00:00Z');
  return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===result?result:'';
 }
 function displayDate(value){const date=isoDate(value);return date?date.split('-').reverse().join('/'):'';}
 const isDate=input=>input instanceof HTMLInputElement&&!input.dataset.skCalendarPicker&&(input.type==='date'||input.type==='datetime-local'||/^dd\/mm\/aaaa$/i.test(input.placeholder));
 function pickerValue(input){return input.type==='datetime-local'?input.value:isoDate(input.value);}
 function refresh(entry){
  const {input,picker,wrapper,value}=entry;
  if(picker!==input){
   picker.value=pickerValue(input);
   picker.disabled=input.disabled;picker.readOnly=input.readOnly;picker.required=input.required;
   picker.min=isoDate(input.min);picker.max=isoDate(input.max);
  }
  const formatted=displayDate(input.value),time=input.type==='datetime-local'?input.value.split('T')[1]?.slice(0,5):'';
  value.textContent=formatted?formatted+(time?' · '+time:''):'DD/MM/AAAA';
  wrapper.classList.toggle('isEmpty',!formatted);wrapper.classList.toggle('isLocked',input.disabled||input.readOnly);
 }
 function open(entry){
  if(entry.input.disabled||entry.input.readOnly)return;
  refresh(entry);
  try{entry.picker.showPicker?.();}catch{/* El toque sobre el input nativo abre el selector en dispositivos sin showPicker. */}
 }
 function watchValue(input,entry){
  for(const name of ['value','valueAsDate','valueAsNumber']){
   const descriptor=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,name);
   if(!descriptor?.get||!descriptor?.set||Object.hasOwn(input,name))continue;
   Object.defineProperty(input,name,{configurable:true,get(){return descriptor.get.call(this)},set(value){descriptor.set.call(this,value);refresh(entry)}});
  }
 }
 function enhance(input){
  if(entries.has(input)||!isDate(input))return;
  const native=input.type==='date'||input.type==='datetime-local';
  const wrapper=document.createElement('span');wrapper.className='skCalendarField';
  const value=document.createElement('span');value.className='skCalendarValue';value.setAttribute('aria-hidden','true');
  const icon=document.createElement('span');icon.className='skCalendarIcon';icon.innerHTML=calendarIcon;icon.setAttribute('aria-hidden','true');
  const label=input.getAttribute('aria-label')||Array.from(input.labels||[],label=>label.textContent.trim()).join(' ')||'Seleccionar fecha';
  const picker=native?input:document.createElement('input');
  if(!native){
   picker.type='date';picker.setAttribute('aria-label',label);picker.title='Seleccionar fecha en el calendario';
   input.classList.add('skCalendarSource');input.tabIndex=-1;input.setAttribute('aria-hidden','true');
  }
  picker.dataset.skCalendarPicker='true';picker.classList.add('skCalendarPicker');picker.lang='es-CO';picker.inputMode='none';
  const entry={input,picker,wrapper,value};entries.set(input,entry);
  input.before(wrapper);wrapper.append(input,value,icon);if(!native)wrapper.append(picker);
  watchValue(input,entry);
  picker.addEventListener('click',()=>open(entry));
  picker.addEventListener('keydown',event=>{
   if(['Enter',' ','ArrowDown','F4'].includes(event.key)){event.preventDefault();open(entry)}
   else if(event.key.length===1||['Backspace','Delete'].includes(event.key))event.preventDefault();
  });
  picker.addEventListener('paste',event=>event.preventDefault());
  if(!native){
   for(const type of ['input','change'])picker.addEventListener(type,event=>{
    event.stopPropagation();input.value=displayDate(picker.value);input.setCustomValidity('');input.dispatchEvent(new Event(type,{bubbles:true}));refresh(entry);
   });
   input.addEventListener('invalid',event=>{event.preventDefault();picker.focus();open(entry)});
  }
  input.addEventListener('input',()=>refresh(entry));input.addEventListener('change',()=>refresh(entry));
  refresh(entry);
 }
 function mount(root=document){
  if(root instanceof HTMLInputElement)enhance(root);
  root.querySelectorAll?.('input').forEach(enhance);
 }
 function start(){
  mount();
  new MutationObserver(records=>{
   for(const record of records){
    if(record.type==='attributes'){const entry=entries.get(record.target);if(entry)refresh(entry);else enhance(record.target)}
    else record.addedNodes.forEach(node=>{if(node.nodeType===1)mount(node)});
   }
   for(const [input] of entries)if(!input.isConnected)entries.delete(input);
  }).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['type','placeholder','value','min','max','required','disabled','readonly']});
  document.addEventListener('reset',event=>setTimeout(()=>{for(const entry of entries.values())if(event.target.contains(entry.input))refresh(entry)},0),true);
 }
 window.SKDateCalendar={isoDate,displayDate,mount};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
