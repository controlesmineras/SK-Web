const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'../actas-admin.js'),'utf8');
const clone=value=>JSON.parse(JSON.stringify(value));

function app(seed=[],motives){
  let records=clone(seed),sequence=0;
  const writes=[],timers=[];
  const elements=Object.fromEntries(['id','consecutivo','modoRegistro','numeroAnterior','fecha','area','motivo','asunto','dirigidoA','enlace','noElaborada','justificacionNoElaborada'].map(name=>[name,{value:name==='modoRegistro'?'nuevo':'',disabled:false,required:false,checked:false,setCustomValidity(message){this.validationMessage=message}}]));
  const fields={};
  for(const [selector,name] of Object.entries({'.actaRegistrationMode':'modoRegistro','.actaPreviousNumber':'numeroAnterior','.actaArea':'area','.actaMotivo':'motivo','.oficioAsunto':'asunto','.oficioDestinatario':'dirigidoA'}))fields[selector]={hidden:false,firstChild:{textContent:''},querySelector:()=>elements[name]};
  fields['.documentLinkLabel']={firstChild:{textContent:''}};
  const form={elements,querySelector:selector=>fields[selector],reset(){for(const [name,input]of Object.entries(elements))input.value=name==='modoRegistro'?'nuevo':''},scrollIntoView(){}};
  const nodes={actaForm:form,actaNumber:{},actaSave:{},actaStatus:{},newActa:{},actaList:{}};
  const document={readyState:'loading',addEventListener(){},getElementById:id=>nodes[id],querySelectorAll:()=>[]};
  const window={dispatchEvent(){},addEventListener(){}};
  class Option{constructor(label,value){this.textContent=label;this.value=value}}
  if(motives){
    window.SKFormOptions={values:key=>key==='acta.motive'?motives:[]};
    const placeholder=new Option('Seleccionar…',''),special=new Option('Acta no elaborada','NO SE REGISTRÓ');
    Object.assign(elements.motivo,{options:[placeholder,special],querySelector:()=>special,replaceChildren(...options){this.options=options}});
  }
  const context=vm.createContext({document,window,Option,Event:class{},db:{},all:async()=>clone(records),uuid:()=>`new-${++sequence}`,setTimeout:fn=>timers.push(fn),put:async(store,row)=>{
    assert.equal(store,'actas');const saved=clone(row),index=records.findIndex(x=>x.id===saved.id);if(index===-1)records.push(saved);else records[index]=saved;writes.push(saved);
  }});
  vm.runInContext(source.replace('window.SKActasAdmin={render,reset,edit};','window.SKActasAdmin={render,reset,save,edit,selectMode,updateMode,nextNumber};'),context);
  const api=window.SKActasAdmin;
  return{api,elements,fields,nodes,writes,records:()=>clone(records),async previous(number){await api.reset();elements.modoRegistro.value='anterior';elements.numeroAnterior.value=String(number);elements.fecha.value='13/08/2025';elements.area.value='ADMINISTRATIVA';elements.motivo.value='DE COMPROMISO';api.updateMode()},save:()=>api.save({preventDefault(){},currentTarget:form}),async flush(){for(const fn of timers.splice(0))await fn()}};
}

test('registra el número y fecha originales; conserva el siguiente consecutivo y el modo para otra acta',async()=>{
  const s=app();await s.previous(8);await s.api.render();assert.equal(s.elements.numeroAnterior.value,'8');
  assert.equal(s.nodes.actaNumber.hidden,true);assert.equal(s.elements.numeroAnterior.required,true);
  await s.save();const row=s.records()[0];
  assert.equal(row.consecutivo,8);assert.equal(row.fecha,'2025-08-13');assert.equal(row.tipo,'ACTA');assert.equal(row.syncState,'pending');assert.ok(row.id);assert.ok(row.createdAt);assert.ok(row.updatedAt);
  assert.equal(await s.api.nextNumber('ACTA',undefined,'2025'),9);
  await s.flush();assert.equal(s.elements.modoRegistro.value,'anterior');assert.equal(s.elements.numeroAnterior.value,'');
});

test('dos toques seguidos guardan una sola acta y limpian el formulario',async()=>{
  const s=app();
  await s.previous(8);
  await Promise.all([s.save(),s.save()]);
  assert.equal(s.writes.length,1);
  assert.equal(s.elements.id.value,'');
  assert.equal(s.elements.numeroAnterior.value,'');
  assert.equal(s.elements.motivo.value,'');
});

test('la siguiente acta nueva usa el mayor consecutivo registrado, incluso al cargar una anterior de número superior',async()=>{
  const s=app([{id:'existing',tipo:'ACTA',consecutivo:20,fecha:'2025-01-01'}]);await s.previous(10);await s.save();assert.equal(await s.api.nextNumber('ACTA',undefined,'2025'),21);await s.flush();
  await s.previous(27);await s.save();await s.flush();assert.equal(await s.api.nextNumber('ACTA',undefined,'2025'),28);
  await s.api.reset();assert.equal(s.elements.modoRegistro.value,'nuevo');assert.equal(s.elements.numeroAnterior.disabled,true);assert.equal(s.nodes.actaNumber.hidden,false);
  s.elements.fecha.value='31/12/2025';await s.save();assert.equal(s.records().at(-1).consecutivo,28);
  await s.flush();await s.previous(10);s.elements.fecha.value='01/01/2026';await s.save();
  assert.equal(s.records().filter(row=>row.consecutivo===10).length,2);
});

test('rechaza números ya registrados, incluyendo actas antiguas sin campo tipo',async()=>{
  const s=app([{id:'old',consecutivo:8,fecha:'13/08/2025'},{id:'current',tipo:'ACTA',consecutivo:'12',fecha:'2025-08-14'}]);
  for(const number of [8,12]){await s.previous(number);await s.save();assert.equal(s.writes.length,0);assert.match(s.nodes.actaStatus.textContent,/ya está registrada/);assert.equal(s.nodes.actaSave.disabled,false)}
});

test('rechaza números vacíos, negativos, cero, fraccionarios o fuera del rango entero seguro',async()=>{
  const s=app();
  for(const number of ['',0,-2,1.5,NaN,Infinity,9007199254740992]){await s.previous(number);await s.save();assert.equal(s.writes.length,0);assert.match(s.nodes.actaStatus.textContent,/entero mayor que cero/)}
});

test('editar una acta anterior conserva su identificador y número; permite completar el enlace',async()=>{
  const original={id:'original',tipo:'ACTA',consecutivo:8,fecha:'2025-08-13',area:'ADMINISTRATIVA',motivo:'DE COMPROMISO',createdAt:'2026-01-01T00:00:00Z'};
  const s=app([original]);await s.api.edit('original');
  assert.equal(s.fields['.actaRegistrationMode'].hidden,true);assert.equal(s.elements.numeroAnterior.disabled,false);
  s.elements.enlace.value='https://example.com/acta-8.pdf';await s.save();
  const rows=s.records();assert.equal(rows.length,1);assert.equal(rows[0].id,original.id);assert.equal(rows[0].consecutivo,8);assert.equal(rows[0].createdAt,original.createdAt);assert.equal(rows[0].fecha,original.fecha);assert.equal(rows[0].enlace,'https://example.com/acta-8.pdf');
});

test('los oficios mantienen numeración independiente y el registro anterior se aplica solo a actas',async()=>{
  const s=app([{id:'oficio7',tipo:'OFICIO',consecutivo:7}]);await s.previous(8);await s.save();await s.flush();
  await s.api.selectMode('OFICIO');assert.equal(s.fields['.actaRegistrationMode'].hidden,true);assert.equal(s.elements.numeroAnterior.disabled,true);assert.equal(s.elements.numeroAnterior.required,false);
  s.elements.asunto.value='  Prueba  ';s.elements.dirigidoA.value='  Destinatario  ';await s.save();await s.flush();
  const row=s.records().at(-1);assert.equal(row.tipo,'OFICIO');assert.equal(row.consecutivo,8);assert.equal(row.asunto,'Prueba');assert.equal(row.dirigidoA,'Destinatario');assert.equal(await s.api.nextNumber('OFICIO'),9);
  await s.api.selectMode('ACTA');assert.equal(s.elements.modoRegistro.value,'nuevo');assert.equal(s.fields['.actaRegistrationMode'].hidden,false);assert.equal(await s.api.nextNumber('ACTA',undefined,'2025'),9);
});

test('quitar y reemplazar enlace conserva acta e identidad',async()=>{const s=app([{id:'a',tipo:'ACTA',consecutivo:9,fecha:'2026-11-16',enlace:'https://example.com/old.pdf'}]);await s.api.edit('a');s.elements.enlace.value='';await s.save();assert.equal(s.records()[0].enlace,'');assert.equal(s.elements.id.value,'');await s.api.edit('a');s.elements.enlace.value='https://example.com/new.pdf';await s.save();assert.equal(s.records().length,1);assert.equal(s.records()[0].enlace,'https://example.com/new.pdf');assert.equal(s.records()[0].consecutivo,9)});


test('editar número conserva ID, rechaza repetidos y ajusta max + 1',async()=>{const s=app([{id:'a',tipo:'ACTA',consecutivo:20,fecha:'2026-11-16'},{id:'b',tipo:'ACTA',consecutivo:30,fecha:'2026-11-17'}]);await s.api.edit('a');s.elements.numeroAnterior.value='30';await s.save();assert.equal(s.writes.length,0);assert.match(s.nodes.actaStatus.textContent,/ya está registrada/);s.elements.numeroAnterior.value='45';await s.save();assert.equal(s.records().find(x=>x.id==='a').consecutivo,45);assert.equal(await s.api.nextNumber(),46);await s.api.edit('a');s.elements.numeroAnterior.value='12';await s.save();assert.equal(await s.api.nextNumber(),31);assert.equal(s.records().length,2)});
test('sin registros usa 1 y excluye actas eliminadas',async()=>{const s=app([{id:'a',tipo:'ACTA',consecutivo:99,deleted:true}]);assert.equal(await s.api.nextNumber(),1)});

test('actas y oficios muestran día/mes/año y guardan la fecha ISO sin intercambiar día y mes',async()=>{
  for(const type of ['ACTA','OFICIO']){
    const s=app();await s.api.reset();await s.api.selectMode(type);
    assert.match(s.elements.fecha.value,/^\d{2}\/\d{2}\/\d{4}$/);
    s.elements.fecha.value='04/05/2026';await s.save();
    assert.equal(s.records()[0].fecha,'2026-05-04');
    assert.match(s.nodes.actaList.innerHTML,/04\/05\/2026/);
    await s.api.edit(s.records()[0].id);
    assert.equal(s.elements.fecha.value,'04/05/2026');
    await s.save();assert.equal(s.records()[0].fecha,'2026-05-04');
  }
});

test('acepta ocho dígitos y fecha bisiesta, normalizando el campo a DD/MM/AAAA',async()=>{
  const s=app();await s.api.reset();s.elements.fecha.value='29022024';await s.save();
  assert.equal(s.records()[0].fecha,'2024-02-29');
  await s.api.edit(s.records()[0].id);assert.equal(s.elements.fecha.value,'29/02/2024');
});

test('rechaza fechas imposibles, incompletas o en formato norteamericano sin modificar el registro',async()=>{
  for(const type of ['ACTA','OFICIO']){
    const original={id:'original',tipo:type,consecutivo:8,fecha:'2026-11-16'};
    const s=app([original]);await s.api.edit(original.id);
    for(const value of ['','31/04/2026','29/02/2025','11/16/2026','1/2/2026','16/11/26','16/11/0000']){
      s.elements.fecha.value=value;await s.save();
      assert.equal(s.writes.length,0);assert.deepEqual(s.records(),[original]);
      assert.match(s.nodes.actaStatus.textContent,/DD\/MM\/AAAA/);
      assert.ok(s.elements.fecha.validationMessage);
    }
    s.elements.fecha.value='17/11/2026';await s.save();
    assert.equal(s.records()[0].fecha,'2026-11-17');assert.equal(s.elements.fecha.validationMessage,'');
  }
});


test('el catálogo de motivos conserva el valor retirado al editar y ofrece solo motivos activos en actas nuevas',async()=>{
  const motives=['Inspección'],s=app([{id:'a1',tipo:'ACTA',consecutivo:1,fecha:'2026-11-21',area:'ADMINISTRATIVA',motivo:'Visita'}],motives);
  const select=s.elements.motivo,options=()=>select.options.map(option=>option.value);
  await s.api.edit('a1');
  assert.equal(select.value,'Visita');
  assert.deepEqual(options(),['','NO SE REGISTRÓ','Inspección','Visita']);
  await s.save();assert.equal(s.records()[0].motivo,'Visita');
  await s.api.reset();
  assert.deepEqual(options(),['','NO SE REGISTRÓ','Inspección']);
  motives.length=0;await s.api.reset();
  assert.deepEqual(options(),['','NO SE REGISTRÓ']);
});

test('la sincronización permite el mismo número en años distintos y rechaza repetidos del mismo año',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../backend/apps-script/Code.gs'),'utf8');
 const begin=source.indexOf('function actaYear_('),end=source.indexOf('function validateLastActaDeletion_(',begin);
 const context=vm.createContext({});
 vm.runInContext(source.slice(begin,end),context);
 const cloud={actas:[{id:'old',consecutivo:1,fecha:'31/12/2025'}]};
 const row={id:'new',tipo:'ACTA',consecutivo:1,fecha:'2026-01-01',syncState:'pending'};
 assert.doesNotThrow(()=>context.validateActaNumbers_({actas:[row]},cloud));
 assert.throws(()=>context.validateActaNumbers_({actas:[{...row,fecha:'2025-11-28'}]},cloud),/N.º 1 de 2025 ya está registrada/);
});
