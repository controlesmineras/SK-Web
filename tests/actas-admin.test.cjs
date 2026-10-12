const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'../actas-admin.js'),'utf8');
const clone=value=>JSON.parse(JSON.stringify(value));

function app(seed=[]){
  let records=clone(seed),sequence=0;
  const writes=[],timers=[];
  const elements=Object.fromEntries(['id','consecutivo','modoRegistro','numeroAnterior','fecha','area','motivo','asunto','dirigidoA','enlace'].map(name=>[name,{value:name==='modoRegistro'?'nuevo':'',disabled:false,required:false}]));
  const fields={};
  for(const [selector,name] of Object.entries({'.actaRegistrationMode':'modoRegistro','.actaPreviousNumber':'numeroAnterior','.actaArea':'area','.actaMotivo':'motivo','.oficioAsunto':'asunto','.oficioDestinatario':'dirigidoA'}))fields[selector]={hidden:false,querySelector:()=>elements[name]};
  fields['.documentLinkLabel']={firstChild:{textContent:''}};
  const form={elements,querySelector:selector=>fields[selector],reset(){for(const [name,input]of Object.entries(elements))input.value=name==='modoRegistro'?'nuevo':''},scrollIntoView(){}};
  const nodes={actaForm:form,actaNumber:{},actaSave:{},actaStatus:{},newActa:{},actaList:{}};
  const document={readyState:'loading',addEventListener(){},getElementById:id=>nodes[id],querySelectorAll:()=>[]};
  const window={};
  const context=vm.createContext({document,window,db:{},all:async()=>clone(records),uuid:()=>`new-${++sequence}`,setTimeout:fn=>timers.push(fn),put:async(store,row)=>{
    assert.equal(store,'actas');const saved=clone(row),index=records.findIndex(x=>x.id===saved.id);if(index===-1)records.push(saved);else records[index]=saved;writes.push(saved);
  }});
  vm.runInContext(source.replace('window.SKActasAdmin={render,reset};','window.SKActasAdmin={render,reset,save,edit,selectMode,updateMode,nextNumber};'),context);
  const api=window.SKActasAdmin;
  return{api,elements,fields,nodes,writes,records:()=>clone(records),async previous(number){await api.reset();elements.modoRegistro.value='anterior';elements.numeroAnterior.value=String(number);elements.fecha.value='2025-08-13';elements.area.value='ADMINISTRATIVA';elements.motivo.value='DE COMPROMISO';api.updateMode()},save:()=>api.save({preventDefault(){},currentTarget:form}),async flush(){for(const fn of timers.splice(0))await fn()}};
}

test('registra el número y fecha originales; conserva el siguiente consecutivo y el modo para otra acta',async()=>{
  const s=app();await s.previous(8);await s.api.render();assert.equal(s.elements.numeroAnterior.value,'8');
  assert.equal(s.nodes.actaNumber.hidden,true);assert.equal(s.elements.numeroAnterior.required,true);
  await s.save();const row=s.records()[0];
  assert.equal(row.consecutivo,8);assert.equal(row.fecha,'2025-08-13');assert.equal(row.tipo,'ACTA');assert.equal(row.syncState,'pending');assert.ok(row.id);assert.ok(row.createdAt);assert.ok(row.updatedAt);
  assert.equal(await s.api.nextNumber(),15);
  await s.flush();assert.equal(s.elements.modoRegistro.value,'anterior');assert.equal(s.elements.numeroAnterior.value,'');
});

test('la siguiente acta nueva usa el mayor consecutivo registrado, incluso al cargar una anterior de número superior',async()=>{
  const s=app([{id:'existing',tipo:'ACTA',consecutivo:20}]);await s.previous(10);await s.save();assert.equal(await s.api.nextNumber(),21);await s.flush();
  await s.previous(27);await s.save();await s.flush();assert.equal(await s.api.nextNumber(),28);
  await s.api.reset();assert.equal(s.elements.modoRegistro.value,'nuevo');assert.equal(s.elements.numeroAnterior.disabled,true);assert.equal(s.nodes.actaNumber.hidden,false);
  await s.save();assert.equal(s.records().at(-1).consecutivo,28);
});

test('rechaza números ya registrados, incluyendo actas antiguas sin campo tipo',async()=>{
  const s=app([{id:'old',consecutivo:8},{id:'current',tipo:'ACTA',consecutivo:'12'}]);
  for(const number of [8,12]){await s.previous(number);await s.save();assert.equal(s.writes.length,0);assert.match(s.nodes.actaStatus.textContent,/ya está registrada/);assert.equal(s.nodes.actaSave.disabled,false)}
});

test('rechaza números vacíos, negativos, cero, fraccionarios o fuera del rango entero seguro',async()=>{
  const s=app();
  for(const number of ['',0,-2,1.5,NaN,Infinity,9007199254740992]){await s.previous(number);await s.save();assert.equal(s.writes.length,0);assert.match(s.nodes.actaStatus.textContent,/entero mayor que cero/)}
});

test('editar una acta anterior conserva su identificador y número; permite completar el enlace',async()=>{
  const original={id:'original',tipo:'ACTA',consecutivo:8,fecha:'2025-08-13',area:'ADMINISTRATIVA',motivo:'DE COMPROMISO',createdAt:'2026-01-01T00:00:00Z'};
  const s=app([original]);await s.api.edit('original');
  assert.equal(s.fields['.actaRegistrationMode'].hidden,true);assert.equal(s.elements.numeroAnterior.disabled,true);
  s.elements.enlace.value='https://example.com/acta-8.pdf';await s.save();
  const rows=s.records();assert.equal(rows.length,1);assert.equal(rows[0].id,original.id);assert.equal(rows[0].consecutivo,8);assert.equal(rows[0].createdAt,original.createdAt);assert.equal(rows[0].fecha,original.fecha);assert.equal(rows[0].enlace,'https://example.com/acta-8.pdf');
});

test('los oficios mantienen numeración independiente y el registro anterior se aplica solo a actas',async()=>{
  const s=app([{id:'oficio7',tipo:'OFICIO',consecutivo:7}]);await s.previous(8);await s.save();await s.flush();
  await s.api.selectMode('OFICIO');assert.equal(s.fields['.actaRegistrationMode'].hidden,true);assert.equal(s.elements.numeroAnterior.disabled,true);assert.equal(s.elements.numeroAnterior.required,false);
  s.elements.asunto.value='  Prueba  ';s.elements.dirigidoA.value='  Destinatario  ';await s.save();await s.flush();
  const row=s.records().at(-1);assert.equal(row.tipo,'OFICIO');assert.equal(row.consecutivo,8);assert.equal(row.asunto,'Prueba');assert.equal(row.dirigidoA,'Destinatario');assert.equal(await s.api.nextNumber('OFICIO'),9);
  await s.api.selectMode('ACTA');assert.equal(s.elements.modoRegistro.value,'nuevo');assert.equal(s.fields['.actaRegistrationMode'].hidden,false);assert.equal(await s.api.nextNumber(),15);
});
