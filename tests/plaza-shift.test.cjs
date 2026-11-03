const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const read=file=>fs.readFileSync(require('node:path').join(__dirname,'..',file),'utf8');

test('Plaza requiere una selección vigente por cuenta y conserva la identidad al cambiar de turno',()=>{
  let now=Date.parse('2026-11-02T18:59:00Z');
  const storage=new Map(),nodes=new Map();
  const node=key=>{
    if(!nodes.has(key))nodes.set(key,{value:'',focus(){},addEventListener(type,fn){this[type]=fn}});
    return nodes.get(key);
  };
  const ctx=vm.createContext({
    document:{querySelector:node}, window:{alert(){}}, Date:class extends Date{static now(){return now}},
    sessionStorage:{getItem:()=>null}, localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)}
  });
  const source=read('plaza/plaza.js').split('  injectItemSearchStyle();setupDeliveryForm();')[0];
  vm.runInContext(source+`
    data={personal:[{id:'keeper',documento:'222',nombre:'Bodeguera de turno',plazaEnabled:false}]};
    window.audit={setUser:documento=>{user={documento}},movementShift};
  })();`,ctx);
  const {setUser,movementShift}=ctx.window.audit;
  const select=()=>node('#plazaShiftResults').click({target:{closest:()=>({dataset:{shiftPerson:'222'}})}});
  setUser('111');
  assert.throws(movementShift,/de turno/);
  select();
  const saved=movementShift();
  assert.equal(saved.shiftKeeperName,'Bodeguera de turno');
  setUser('333');
  assert.throws(movementShift,/de turno/);
  setUser('111');
  now+=60000;
  assert.throws(movementShift,/de turno/);
  assert.equal(saved.shiftKeeperDocument,'222');
});

test('la cuenta revocada pierde acceso central y el movimiento conserva dos identidades verificadas',()=>{
  const ctx=vm.createContext({});
  vm.runInContext(read('backend/apps-script/Code.gs'),ctx);
  const cloud={personal:[
    {id:'assistant',documento:'111',nombre:'Auxiliar',plazaEnabled:true,pinHash:'hash',plazaRole:'assistant'},
    {id:'keeper',documento:'222',nombre:'Bodeguera',plazaEnabled:false}
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
