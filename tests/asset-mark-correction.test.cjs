const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const fs=require('node:fs'),path=require('node:path'),read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8'),clone=value=>JSON.parse(JSON.stringify(value));
const date='2026-10-22T12:00:00.000Z',owner={role:'owner',username:'admin-test',name:'Administrador'};
const target=()=>({id:'makita-120800',clase:'Rotomartillo',fabricante:'MAKITA',serial:'120800',numeroClase:'5',marcaActual:'AAS',marcaInterna:'AAS',nuevaMarca:'AAS',marcaPrevia:'SK 3.7',markingPolicy:'letters-v1',markStatus:'assigned',markSequence:18,markAssignedAt:date,createdAt:date,updatedAt:date,ubicacion:'Corte 570',estado:'Operativo/a',asignadaId:'responsible',accessories:[{description:'Maleta'}],syncState:'synced'});
const other=()=>({...target(),id:'original',serial:'OTHER',clase:'Taladro'});
const mark=(id,code,sequence)=>({id,code,sequence,issuedAt:date});
function backend(seed={}){
 let cloud={assets:[other(),target()],assetMarkRegistry:[mark('original','AAS',18),mark('makita-120800','AAS',18),mark('third','AAT',19)],novelties:[{id:'n1',assetId:'makita-120800',descripcion:'Revista física'}],blendingDeliveries:[{id:'d1',assetId:'makita-120800',assetLabel:'Rotomartillo AAS'}],consumptions:[{id:'c1',assetId:'makita-120800'}],...clone(seed)},writes=0,locked=false;
 const ctx=vm.createContext({LockService:{getScriptLock:()=>({waitLock(){assert.equal(locked,false);locked=true},releaseLock(){locked=false}})}});vm.runInContext(read('backend/apps-script/Code.gs'),ctx);
 ctx.findFile_=()=> 'test';ctx.readFile_=()=>clone(cloud);ctx.writeFile_=(_,data)=>{assert.equal(locked,true);writes++;cloud=clone(data)};ctx.json_=clone;
 return {ctx,cloud:()=>clone(cloud),get writes(){return writes},correct:(q={},auth=owner)=>ctx.adminCorrectAssetMark_({assetId:'makita-120800',expectedMark:'AAS',...q},auth),sync:rows=>ctx.adminSyncAuthorized_({assets:clone(rows)},'',owner)};
}
test('corrige únicamente el MAKITA 120800 a AAU y conserva ficha, movimientos e identificación',()=>{
 const s=backend(),before=s.cloud(),result=s.correct(),saved=result.asset;
 assert.equal(saved.nuevaMarca,'AAU');assert.equal(saved.marcaActual,'AAU');assert.equal(saved.marcaInterna,'AAU');
 for(const field of ['id','serial','clase','fabricante','numeroClase','marcaPrevia','createdAt','ubicacion','estado','asignadaId','accessories'])assert.deepEqual(saved[field],target()[field],field);
 assert.deepEqual(s.cloud().assets[0],before.assets[0]);
 for(const name of ['novelties','blendingDeliveries','consumptions'])assert.deepEqual(s.cloud()[name],before[name]);
 assert.equal(saved.markCorrections.length,1);assert.equal(saved.markCorrections[0].from,'AAS');assert.equal(saved.markCorrections[0].to,'AAU');assert.equal(saved.markCorrections[0].by,owner.username);assert.equal(saved.markCorrections[0].previousValues.nuevaMarca,'AAS');
 assert.ok(s.cloud().assetMarkRegistry.some(row=>row.code==='AAS'&&row.reservedForAssetId===saved.id));assert.equal(s.cloud().assetMarkRegistry.filter(row=>row.id===saved.id).length,1);
});
test('salta AAU cuando está reservada; nunca fija la sugerencia del cliente',()=>{
 const s=backend({assetMarkRegistry:[mark('original','AAS',18),mark('third','AAT',19),mark('reserved','AAU',20)]});
 assert.equal(s.correct({newMark:'AAU'}).asset.nuevaMarca,'AAV');
});
test('reintentos y otro dispositivo reciben la misma corrección sin gastar otra marca',()=>{
 const s=backend(),first=s.correct(),before=s.cloud();
 const repeated=s.correct();assert.equal(repeated.alreadyCorrected,true);assert.equal(repeated.asset.nuevaMarca,first.asset.nuevaMarca);assert.equal(s.writes,1);assert.deepEqual(s.cloud(),before);
});
test('una copia antigua no restaura AAS ni elimina o falsifica el registro de corrección',()=>{
 const s=backend(),stale=target();s.correct();const correction=s.cloud().assets[1].markCorrections;
 s.sync([{...stale,updatedAt:'2099-01-01T00:00:00.000Z',syncState:'pending',markCorrections:[{from:'XXX',to:'YYY'}]}]);
 assert.equal(s.cloud().assets[1].nuevaMarca,'AAU');assert.deepEqual(s.cloud().assets[1].markCorrections,correction);
});
test('auxiliares y peticiones con marca desactualizada se rechazan sin escribir',()=>{
 for(const [q,auth] of [[{}, {role:'assistant'}],[{expectedMark:'AAT'},owner],[{expectedMark:''},owner],[{assetId:'missing'},owner]]){
  const s=backend(),before=s.cloud();assert.throws(()=>s.correct(q,auth));assert.equal(s.writes,0);assert.deepEqual(s.cloud(),before);
 }
});
test('la ruta publicada verifica el rol antes de ejecutar la corrección central',()=>{
 const s=backend();s.ctx.PropertiesService={getScriptProperties:()=>({getProperty:()=> 'configured'})};s.ctx.adminUsers_=()=>[owner];s.ctx.verifyAdminToken_=()=>({role:'assistant'});
 const event={postData:{contents:JSON.stringify({action:'adminCorrectAssetMark',assetId:'makita-120800',expectedMark:'AAS',token:'test'})}};
 assert.equal(s.ctx.doPost(event).ok,false);assert.equal(s.writes,0);
 s.ctx.verifyAdminToken_=()=>owner;assert.equal(s.ctx.doPost(event).asset.nuevaMarca,'AAU');assert.equal(s.writes,1);
});
test('no remarca un activo único, eliminado o de una clase excluida',()=>{
 for(const seed of [{assets:[target()],assetMarkRegistry:[mark('makita-120800','AAS',18)]},{assets:[other(),{...target(),deleted:true}]},{assets:[other(),{...target(),clase:'Autorrescatador'}]}]){
  const s=backend(seed),before=s.cloud();assert.throws(()=>s.correct());assert.equal(s.writes,0);assert.deepEqual(s.cloud(),before);
 }
});
test('corrige también una marca copiada sin registro automático y respeta reservas históricas',()=>{
 const old=target();delete old.markingPolicy;delete old.markSequence;
 const s=backend({assets:[{...other(),deleted:true},old],assetMarkRegistry:[mark('third','AAT',19)]});
 assert.equal(s.correct().asset.nuevaMarca,'AAU');
});
test('la central puede detectar una reserva conflictiva aunque el otro activo ya no exista',()=>{
 const s=backend({assets:[target()]});assert.equal(s.correct().asset.nuevaMarca,'AAU');
});
test('agotar las marcas conserva la marca anterior, el registro y todos los movimientos',()=>{
 const s=backend({assetMarkRegistry:[mark('original','AAS',18),mark('last','ZZZ',17575)]}),before=s.cloud();
 assert.throws(()=>s.correct(),/agotaron/);assert.equal(s.writes,0);assert.deepEqual(s.cloud(),before);
});
test('las marcas externas conservan su prefijo y no reutilizan el código retirado',()=>{
 const a={...target(),clase:'YT',incomeMarking:true,activoExterno:true,mina:'Providencia',minaOrigen:'Providencia',nuevaMarca:'P-AA',marcaActual:'P-AA',marcaInterna:'P-AA',markScheme:'mine-prefix-v1',markPrefix:'P',markMine:'Providencia',markSequence:0};
 const s=backend({assets:[{...a,id:'original',serial:'OTHER'},a],assetMarkRegistry:[{...mark('original','P-AA',0),scheme:'mine-prefix-v1',prefix:'P'}]});
 assert.equal(s.correct({expectedMark:'P-AA'}).asset.nuevaMarca,'P-AB');
});

function client({ownerAccess=true,online=true,dirty=false,duplicate=true,confirmed=true,oldBackend=false,lostResponse=false,failRefresh=false}={}){
 let rows=[...(duplicate?[other()]:[]),target()],calls=[],syncs=0;const nodes=new Map(),alerts=[],confirmations=[];
 const element=()=>({hidden:false,disabled:false,style:{},dataset:{},classList:{remove(){}},setAttribute(){},addEventListener(){},append(...children){for(const child of children)if(child?.id)nodes.set('#'+child.id,child)},replaceChildren(){},focus(){},showModal(){this.open=true},close(){this.open=false}});
 const label=element(),form={elements:{id:{value:'makita-120800'},nuevaMarca:{closest:()=>label},marcaInterna:{}},dataset:dirty?{historyEditRevision:'1'}:{}};
 nodes.set('#assetForm',form);
 const document={head:element(),body:element(),querySelector:key=>nodes.get(key)||null,createElement(tag){const node=element();if(tag==='dialog'){const parts=new Map(['h2','#assetMarkMessage','#assetMarkCards','button'].map(key=>[key,element()]));node.querySelector=key=>parts.get(key)}return node}};
 const window={SKAdminAuth:{isOwner:()=>ownerAccess,request:async(action,q)=>{calls.push({action,q});if(oldBackend)throw Error('Solicitud no válida');if(lostResponse)throw Error('Tiempo de espera');const correction={from:'AAS',to:'AAU',at:date,by:'test'};const asset={...rows[1],id:'makita-120800',nuevaMarca:'AAU',marcaActual:'AAU',marcaInterna:'AAU',markCorrections:[correction]};rows=rows.map(row=>row.id===asset.id?asset:row);return {ok:true,asset,correction}}},skSyncApi:{configured:()=>true,sync:async()=>{syncs++;return !(failRefresh&&syncs===2)},schedule(){}},addEventListener(){}};
 const ctx={window,document,location:{pathname:'/SK-Web/'},navigator:{onLine:online},localStorage:{getItem:()=>null,setItem(){}},all:async()=>clone(rows),put:async()=>{throw Error('La corrección no debe escribir copias locales parciales')},alert:message=>alerts.push(message),confirm:message=>{confirmations.push(message);return confirmed},console:{error(){}}};
 vm.runInNewContext(read('asset-marking.js'),ctx);
 return{api:window.SKAssetMarking,button:()=>nodes.get('#assetRequestMarkBtn'),note:()=>nodes.get('#assetMarkCorrectionNote'),calls,alerts,confirmations,get syncs(){return syncs}};
}
test('el dueño ve Corregir marca duplicada con el campo protegido y la corrección muestra el comprobante',async()=>{
 const c=client();await c.api.refreshRequestButton();assert.equal(c.button().hidden,false);assert.equal(c.button().textContent,'Corregir marca duplicada');
 assert.equal(await c.api.correctDuplicate('makita-120800'),true);await c.api.refreshRequestButton();
 assert.deepEqual(clone(c.calls),[{action:'adminCorrectAssetMark',q:{assetId:'makita-120800',expectedMark:'AAS'}}]);assert.match(c.confirmations[0],/MAKITA.*120800/);assert.equal(c.syncs,2);assert.equal(c.button().hidden,true);assert.match(c.note().textContent,/AAS → AAU/);
});
test('no ofrece la corrección sin duplicado ni a auxiliares',async()=>{
 for(const options of [{duplicate:false},{ownerAccess:false}]){const c=client(options);await c.api.refreshRequestButton();assert.equal(c.button().hidden,true);assert.equal(await c.api.correctDuplicate('makita-120800'),false);assert.equal(c.calls.length,0)}
});
test('sin conexión, cambios sin guardar o cancelación no modifican el registro central',async()=>{
 for(const options of [{online:false},{dirty:true},{confirmed:false}]){const c=client(options);assert.equal(await c.api.correctDuplicate('makita-120800'),false);assert.equal(c.calls.length,0)}
});
test('un servicio antiguo explica cómo habilitar la corrección y un timeout permite reintentar',async()=>{
 const old=client({oldBackend:true});assert.equal(await old.api.correctDuplicate('makita-120800'),false);assert.match(old.alerts.at(-1),/Actualiza Code.gs/);
 const lost=client({lostResponse:true});assert.equal(await lost.api.correctDuplicate('makita-120800'),false);assert.match(lost.alerts.at(-1),/no se asignará otra marca/);
});
test('si falla la descarga posterior informa la marca confirmada sin reemplazar datos locales',async()=>{
 const c=client({failRefresh:true});assert.equal(await c.api.correctDuplicate('makita-120800'),true);assert.match(c.alerts.at(-1),/confirmó la marca AAU/);
});
