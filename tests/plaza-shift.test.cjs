const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const read=file=>fs.readFileSync(require('node:path').join(__dirname,'..',file),'utf8');

test('Plaza requiere una selección vigente por cuenta y conserva la identidad al cambiar de turno',()=>{
  let now=Date.parse('2026-11-02T18:59:00Z');
  const storage=new Map(),nodes=new Map();
  const node=key=>{
    if(!nodes.has(key))nodes.set(key,{value:'',focus(){},setAttribute(key,value){this[key]=value},addEventListener(type,fn){this[type]=fn}});
    return nodes.get(key);
  };
  const ctx=vm.createContext({
    document:{querySelector:node}, window:{alert(){}}, Date:class extends Date{static now(){return now}},
    sessionStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},localStorage:{getItem:()=>null}
  });
  const source=read('plaza/plaza.js').split('  injectItemSearchStyle();setupDeliveryForm();')[0];
  vm.runInContext(source+`
    data={personal:[{id:'keeper',documento:'222',nombre:'Bodeguera de turno',cargo:'Mecánico',plazaEnabled:false},{id:'inactivo',documento:'444',nombre:'Inactivo',active:false}]};
    window.audit={setUser:(documento,role='plaza_assistant')=>{user={id:'user-'+documento,documento,role,nombre:'Usuario '+documento}},view:id=>{currentView=id;renderShiftStatus()},movementShift,renderShiftStatus};
  })();`,ctx);
  const {setUser,view,movementShift,renderShiftStatus}=ctx.window.audit;
  const select=()=>node('#plazaShiftResults').click({target:{closest:()=>({dataset:{shiftPerson:'222'}})}});
  setUser('111');
  assert.throws(movementShift,/de turno/);
  select();
  const saved=movementShift();
  assert.equal(saved.shiftKeeperName,'Bodeguera de turno');
  assert.equal(node('#plazaShiftSearch').value,'Bodeguera de turno');
  assert.equal(node('#plazaShiftSearch').readOnly,true);
  assert.equal(node('#plazaShiftClear').hidden,false);
  assert.equal(node('#plazaShiftStatus').hidden,true);
  assert.equal(node('#plazaShiftStatus').textContent,'');
  node('#plazaShiftSearch').value='';node('#plazaShiftSearch').readOnly=false;
  renderShiftStatus();
  assert.equal(node('#plazaShiftSearch').value,'Bodeguera de turno','restaura la selección guardada');
  node('#plazaShiftClear').click();
  assert.equal(node('#plazaShiftSearch').value,'');
  assert.equal(node('#plazaShiftSearch').readOnly,false);
  assert.equal(node('#plazaShiftClear').hidden,true);
  assert.throws(movementShift,/de turno/);
  assert.equal(saved.shiftKeeperDocument,'222','quitar la selección no cambia movimientos anteriores');
  select();
  setUser('333');
  assert.throws(movementShift,/de turno/);
  setUser('111');
  now+=60000;
  assert.throws(movementShift,/de turno/);
  assert.equal(node('#plazaShiftSearch').value,'');
  assert.equal(node('#plazaShiftClear').hidden,true);
  assert.equal(saved.shiftKeeperDocument,'222');
  view('home');
  assert.equal(node('#plazaShift').hidden,false);
  node('#plazaShiftSearch').input();
  assert.match(node('#plazaShiftResults').innerHTML,/222/);
  assert.doesNotMatch(node('#plazaShiftResults').innerHTML,/444/);
  select();
  for(const route of ['delivery','income','assetReturns','contacts','stockQuery','personal']){
    view(route);
    assert.equal(node('#plazaShift').hidden,true);
    assert.equal(node('#plazaShiftSummary').hidden,false);
    assert.equal(node('#plazaShiftName').textContent,'Bodeguera de turno');
    node('#plazaShiftClear').click();
    assert.equal(movementShift().shiftKeeperDocument,'222');
  }
  node('#plazaShiftHelp').hidden=true;
  node('#plazaShiftInfo').click();
  assert.equal(node('#plazaShiftHelp').hidden,false);
  assert.equal(node('#plazaShiftInfo')['aria-expanded'],'true');
  setUser('777','plaza_operator');view('home');
  assert.equal(node('#plazaShift').hidden,false);
  assert.equal(node('#plazaShiftSummary').hidden,true);
  assert.equal(node('#plazaShiftSearch').value,'','la cuenta de bodeguero también selecciona al responsable');
  assert.throws(movementShift,/en Inicio/);
  select();
  assert.equal(movementShift().shiftKeeperDocument,'222');
  now+=8*3600000;
  assert.throws(movementShift,/en Inicio/,'el relevo no pasa al siguiente turno');
  setUser('999','admin');view('home');assert.throws(movementShift,/en Inicio/);
  select();assert.equal(movementShift().shiftKeeperDocument,'222');
});

test('la cuenta revocada pierde acceso central y el movimiento conserva dos identidades verificadas',()=>{
  const ctx=vm.createContext({});
  vm.runInContext(read('backend/apps-script/Code.gs'),ctx);
  const cloud={personal:[
    {id:'assistant',documento:'111',nombre:'Auxiliar',plazaEnabled:true,pinHash:'hash',plazaRole:'assistant'},
    {id:'keeper',documento:'222',nombre:'Bodeguera',cargo:'Mecánico',plazaEnabled:false}
  ]};
  const auth=ctx.plazaAccount_(cloud,{document:'111',role:'plaza_operator'});
  assert.equal(auth.role,'plaza_assistant');
  const movement={id:'delivery',operatorDocument:'111',operatorName:'Otro nombre',shiftKeeperDocument:'222'};
  const stamped=ctx.stampActor_(movement,auth);
  ctx.stampPlazaShift_(stamped,cloud,auth);
  assert.equal(stamped.actorDocument,'111');
  assert.equal(stamped.operatorName,'Auxiliar');
  assert.equal(stamped.shiftKeeperName,'Bodeguera');
  assert.throws(()=>ctx.stampPlazaShift_({},cloud,auth),/de turno/);
  assert.throws(()=>ctx.stampPlazaShift_({...movement,operatorDocument:'333'},cloud,auth),/cuenta que lo registró/);
  assert.doesNotThrow(()=>ctx.stampPlazaShift_({},cloud,{document:'111',role:'plaza_operator'}));
  cloud.personal[0].plazaEnabled=false;
  assert.throws(()=>ctx.plazaAccount_(cloud,auth),/ya no tiene acceso/);
});

test('la invitación aplica el rol auxiliar y la invitación anterior conserva su rol predeterminado',()=>{
  const invites=new Map();
  let counter=0,cloud={personal:[{id:'assistant',documento:'111',nombre:'Auxiliar'}]};
  const props={getProperties:()=>Object.fromEntries(invites),setProperty:(key,value)=>invites.set(key,value),getProperty:key=>invites.get(key),deleteProperty:key=>invites.delete(key)};
  const ctx=vm.createContext({
    PropertiesService:{getScriptProperties:()=>props},
    LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
    Utilities:{getUuid:()=>String(++counter).padStart(32,'0')}
  });
  vm.runInContext(read('backend/apps-script/Code.gs'),ctx);
  Object.assign(ctx,{invitationKey_:token=>`SK_INVITE_${token}`,findFile_:()=> 'file',readFile_:()=>cloud,writeFile_:(_,value)=>{cloud=value},json_:value=>value,hashPin_:()=> 'hash'});
  for(const role of ['assistant',undefined]){
    const invite=ctx.accessInvitationCreate_({scope:'plaza',personId:'assistant',plazaRole:role});
    if(!role){
      const key=ctx.invitationKey_(invite.token),legacy=JSON.parse(invites.get(key));
      delete legacy.plazaRole;
      invites.set(key,JSON.stringify(legacy));
    }
    assert.equal(ctx.accessInvitationAccept_({invitation:invite.token,document:'111',password:'password'}).ok,true);
    assert.equal(cloud.personal[0].plazaRole,role||'operator');
    assert.throws(()=>ctx.accessInvitationAccept_({invitation:invite.token,document:'111',password:'password'}),/ya se usó/);
  }
});

test('un inicio de sesión explícito pide elegir incluso al repetir cuenta y la renovación conserva esa elección',async()=>{
  const values=new Map(),ctx=vm.createContext({
    sessionStorage:{getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)},
    openApp:async()=>{}
  });
  const source=read('plaza/plaza.js');
  const shift=source.slice(source.indexOf('  const plazaShiftId='),source.indexOf('  function renderShiftStatus()'));
  const login=source.slice(source.indexOf('  async function acceptLogin('),source.indexOf('  async function renewLogin('));
  vm.runInContext(`let user,token;const data={personal:[{documento:'222',nombre:'Relevo',cargo:'Mecánico'}]};`+shift+login,ctx);
  for(const role of ['admin','plaza_operator','plaza_assistant']){
    const session={user:{id:'operador',documento:'111',nombre:'Operador',role},token:'sesión'};
    await ctx.acceptLogin(session,true);
    assert.equal(ctx.selectedShiftPerson(),null);
    vm.runInContext("sessionStorage.setItem(shiftStorageKey(),JSON.stringify({shift:plazaShiftId(),document:'222'}))",ctx);
    await ctx.acceptLogin({...session,token:'renovada'});
    assert.equal(ctx.selectedShiftPerson().documento,'222');
    await ctx.acceptLogin(session,true);
    assert.equal(ctx.selectedShiftPerson(),null);
  }
});
