const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../plaza-admin.js'),'utf8');

function app(owner=true){
  const handlers={},nodes={},visits=[];
  let documentClick,load,resets=0;
  const node=selector=>nodes[selector]??={addEventListener(type,fn){handlers[selector+':'+type]=fn},reset(){resets++}};
  const document={querySelector:node,addEventListener(type,fn){if(type==='click')documentClick=fn}};
  const window={addEventListener(type,fn){if(type==='load')load=fn},SKAdminAuth:{isOwner:()=>owner},SKAdminNav:{go:id=>visits.push(id)}};
  vm.runInNewContext(source,{document,window,all:async()=>[{id:'p1',nombre:'Ana',documento:'123',cargo:'Bodeguera',plazaEnabled:true},{id:'p2',nombre:'Borrado',deleted:true}],showView(){throw new Error('Legacy navigation failed')}});
  load();
  return{nodes,visits,open:()=>handlers['.plazaAccessBtn:click'](),back:()=>documentClick({target:{closest:selector=>selector==='#plazaAccess [data-return-home]'?{}:null},preventDefault(){}}),resets:()=>resets};
}

test('abre accesos con la navegación actual y lista colaboradores activos',async()=>{
  const s=app();s.open();await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(s.visits,['plazaAccess']);
  assert.equal(s.nodes['#plazaUserCount'].textContent,'1 colaboradores');
  assert.match(s.nodes['#plazaUserList'].innerHTML,/Ana/);
  assert.doesNotMatch(s.nodes['#plazaUserList'].innerHTML,/Borrado/);
  s.back();assert.deepEqual(s.visits,['plazaAccess','home']);
  assert.equal(s.nodes['#plazaCopyInvite'].hidden,true);
  assert.equal(s.nodes['#plazaAccessState'].textContent,'Sin colaborador seleccionado.');
  assert.equal(s.resets(),1);
});

test('el auxiliar no puede abrir la administración de accesos',()=>{
  const s=app(false);s.open();assert.deepEqual(s.visits,[]);
});
