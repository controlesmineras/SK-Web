/* Fecha por teclado o calendario, conservando los valores y eventos de cada app. */
(()=>{
 'use strict';
 const entries=new Map();let sequence=0;
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
 function currentYear(){return new Intl.DateTimeFormat('en',{year:'numeric',timeZone:'America/Bogota'}).format(new Date());}
 function parseTypedDate(value,year=currentYear()){
  let text=String(value||'').trim();
  if(/^\d{4}$/.test(text))text=text.slice(0,2)+'/'+text.slice(2)+'/'+year;
  else if(/^\d{8}$/.test(text))text=text.slice(0,2)+'/'+text.slice(2,4)+'/'+text.slice(4);
  else{
   const match=text.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
   if(match)text=match[1].padStart(2,'0')+'/'+match[2].padStart(2,'0')+'/'+(match[3]||year);
  }
  return /^(?:\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})$/.test(text)?isoDate(text):'';
 }
 const isDate=input=>input instanceof HTMLInputElement&&!input.dataset.skCalendarControl&&(input.type==='date'||input.type==='datetime-local'||/^dd\/mm\/aaaa$/i.test(input.placeholder));
 function clearError(entry){
  if(entry.message&&(!entry.input.willValidate||entry.input.validationMessage===entry.message))entry.input.setCustomValidity('');
  entry.message='';entry.editor.setCustomValidity('');entry.editor.removeAttribute('aria-invalid');entry.error.hidden=true;entry.error.textContent='';
 }
 function setError(entry,message,show=true){
  entry.message=message;entry.input.setCustomValidity(message);entry.editor.setCustomValidity(message);
  entry.error.textContent=show?message:'';entry.error.hidden=!show;entry.editor.setAttribute('aria-invalid',String(show));
 }
 function refresh(entry,force=false){
  const {input,picker,editor,time,wrapper}=entry;
  if(force){entry.dirty=false;clearError(entry);}
  for(const control of [editor,picker,time].filter(Boolean)){control.disabled=input.disabled;control.readOnly=input.readOnly;control.required=input.required;}
  picker.min=input.min;picker.max=input.max;if(input.step)picker.step=input.step;
  if(!entry.dirty){
   editor.value=displayDate(input.value);
   picker.value=input.type==='datetime-local'?input.value:isoDate(input.value);
   if(time)time.value=input.value.split('T')[1]||'';
  }
  wrapper.classList.toggle('isLocked',input.disabled||input.readOnly);
 }
 function writeValue(entry,value){entry.writing=true;try{entry.input.value=value;}finally{entry.writing=false;}}
 function emit(entry,type){entry.input.dispatchEvent(new Event(type,{bubbles:true}));}
 function commit(entry,report=false){
  if(!entry.dirty||entry.input.disabled||entry.input.readOnly)return !entry.message;
  const raw=entry.editor.value.trim(),date=parseTypedDate(raw),{input,time}=entry;
  let message=raw&&!date?'Fecha no válida. Usa DDMM o DD/MM/AAAA.':!raw&&input.required?'Selecciona o escribe una fecha.':'';
  if(date&&time&&!time.value)message='Selecciona o escribe la hora.';
  const next=!date?'':input.type==='datetime-local'?date+'T'+time.value:input.type==='date'?date:displayDate(date);
  if(!message&&date){
   const comparable=input.type==='datetime-local'?next:date;
   if(input.min&&comparable<input.min)message='La fecha debe ser igual o posterior a '+displayDate(input.min)+'.';
   else if(input.max&&comparable>input.max)message='La fecha debe ser igual o anterior a '+displayDate(input.max)+'.';
  }
  if(message){
   writeValue(entry,input.type==='text'?raw:'');setError(entry,message);
   if(report)entry.editor.reportValidity();return false;
  }
  const previous=input.value;writeValue(entry,next);entry.dirty=false;clearError(entry);refresh(entry);
  if(previous!==input.value){emit(entry,'input');emit(entry,'change');}
  return true;
 }
 function open(entry){
  if(entry.input.disabled||entry.input.readOnly)return;
  try{entry.picker.showPicker?.();}catch{/* El indicador nativo cubre el icono en navegadores sin showPicker. */}
 }
 function watchValue(input,entry){
  for(const name of ['value','valueAsDate','valueAsNumber']){
   const descriptor=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,name);
   if(!descriptor?.get||!descriptor?.set||Object.hasOwn(input,name))continue;
   Object.defineProperty(input,name,{configurable:true,get(){return descriptor.get.call(this)},set(value){descriptor.set.call(this,value);if(!entry.writing)refresh(entry,true);}});
  }
 }
 function enhance(input){
  if(entries.has(input)||!isDate(input))return;
  const wrapper=document.createElement('span');wrapper.className='skCalendarField';
  const controls=document.createElement('span');controls.className='skCalendarControls';
  const editor=document.createElement('input');editor.type='text';editor.className='skCalendarEditor';editor.placeholder='DD/MM/AAAA';editor.inputMode='numeric';editor.enterKeyHint='done';editor.autocomplete='off';editor.dataset.skCalendarControl='true';
  const label=input.getAttribute('aria-label')||Array.from(input.labels||[],label=>label.textContent.trim()).join(' ')||'Fecha';
  editor.setAttribute('aria-label',label);editor.title='DDMM (año actual) o DDMM junto con el año';
  const icon=document.createElement('span');icon.className='skCalendarIcon';icon.innerHTML=calendarIcon;
  const picker=document.createElement('input');picker.type=input.type==='datetime-local'?'datetime-local':'date';picker.dataset.skCalendarControl='true';picker.className='skCalendarPicker';picker.lang='es-CO';picker.inputMode='none';picker.setAttribute('aria-label','Abrir calendario: '+label);picker.title='Elegir en el calendario';
  const error=document.createElement('span');error.className='skCalendarError';error.id='skCalendarError'+(++sequence);error.hidden=true;error.setAttribute('aria-live','polite');
  editor.setAttribute('aria-describedby',[input.getAttribute('aria-describedby'),error.id].filter(Boolean).join(' '));
  const time=input.type==='datetime-local'?document.createElement('input'):null;
  if(time){time.type='time';time.className='skCalendarTime';time.dataset.skCalendarControl='true';time.setAttribute('aria-label','Hora: '+label);if(input.step)time.step=input.step;}
  input.dataset.skCalendarControl='true';input.classList.add('skCalendarSource');input.tabIndex=-1;input.setAttribute('aria-hidden','true');
  const entry={input,picker,editor,time,wrapper,error,dirty:false,message:'',writing:false};entries.set(input,entry);
  input.before(wrapper);wrapper.append(input,controls,error);controls.append(editor);if(time)controls.append(time);controls.append(icon);icon.append(picker);
  watchValue(input,entry);
  editor.addEventListener('focus',()=>editor.select());
  editor.addEventListener('input',event=>{event.stopPropagation();entry.dirty=true;setError(entry,'Confirma la fecha con Enter o al salir del campo.',false);});
  editor.addEventListener('change',event=>event.stopPropagation());
  editor.addEventListener('blur',()=>commit(entry));
  editor.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();event.stopPropagation();commit(entry,true);}else if(event.key==='ArrowDown'&&event.altKey){event.preventDefault();commit(entry);open(entry);}});
  if(time){time.addEventListener('input',event=>{event.stopPropagation();entry.dirty=true;});time.addEventListener('change',event=>{event.stopPropagation();commit(entry);});}
  picker.addEventListener('click',()=>open(entry));
  picker.addEventListener('keydown',event=>{if(['Enter',' ','ArrowDown','F4'].includes(event.key)){event.preventDefault();open(entry);}});
  for(const type of ['input','change'])picker.addEventListener(type,event=>{
   event.stopPropagation();writeValue(entry,input.type==='text'?displayDate(picker.value):picker.value);entry.dirty=false;clearError(entry);refresh(entry);emit(entry,type);
  });
  input.addEventListener('focus',()=>editor.focus());
  input.addEventListener('invalid',event=>{event.preventDefault();setError(entry,entry.message||input.validationMessage||'Revisa la fecha.');editor.focus();});
  input.addEventListener('input',()=>refresh(entry,true));input.addEventListener('change',()=>refresh(entry,true));
  refresh(entry);
 }
 function mount(root=document){if(root instanceof HTMLInputElement)enhance(root);root.querySelectorAll?.('input').forEach(enhance);}
 function start(){
  mount();
  new MutationObserver(records=>{
   for(const record of records){
    if(record.type==='attributes'){const entry=entries.get(record.target);if(entry)refresh(entry);else enhance(record.target);}
    else record.addedNodes.forEach(node=>{if(node.nodeType===1)mount(node);});
   }
   for(const [input] of entries)if(!input.isConnected)entries.delete(input);
  }).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['type','placeholder','value','min','max','step','required','disabled','readonly']});
  document.addEventListener('reset',event=>setTimeout(()=>{for(const entry of entries.values())if(event.target.contains(entry.input))refresh(entry,true);},0),true);
 }
 window.SKDateCalendar={isoDate,displayDate,parseTypedDate,mount};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
