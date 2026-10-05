const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readFileSync}=require('node:fs'),{join}=require('node:path');
const source=readFileSync(join(__dirname,'../backend/apps-script/Code.gs'),'utf8'),clone=x=>JSON.parse(JSON.stringify(x));
const date='2026-10-05T10:00:00Z';
function service(seed={}){
 let cloud={assets:[],inventoryCriteria:[{id:'yt',name:'YT',isFixedAsset:true,usesSerial:true,requiresInternalMark:true},{id:'col',name:'Columna',isFixedAsset:true,usesSerial:true,requiresInternalMark:true},{id:'pul',name:'Pulidora',isFixedAsset:true}],...clone(seed)},writes=0,locked=false;
 const ctx=vm.createContext({LockService:{getScriptLock:()=>({waitLock(){assert.equal(locked,false);locked=true},releaseLock(){locked=false}})}});vm.runInContext(source,ctx);
 ctx.findFile_=()=> 'file';ctx.readFile_=()=>clone(cloud);ctx.writeFile_=(_,data)=>{assert.ok(locked);cloud=clone(data);writes++};ctx.json_=clone;ctx.verifyToken_=()=>({document:'operario',role:'plaza_operator'});
 return{ctx,cloud:()=>clone(cloud),writes:()=>writes,sync:(data={})=>ctx.plazaSync_({token:'test',since:cloud.updatedAt,data:clone(data)})};
}
function batch(id,mine='Providencia',type='REPARACIÓN',extra={}){
 const asset={id,clase:'YT',criteriaId:'yt',numeroYT:id,numeroClase:id,serial:'SERIAL-'+id,fechaIngreso:'2026-10-05',createdAt:date,updatedAt:date,syncState:'pending',incomeMarking:true,tipoIngresoInicial:type,minaOrigen:mine,markingPolicy:'letters-v1',markStatus:'pending',...extra};
 return{assets:[asset],blendingIncomes:[{id:'i-'+id,syncEventId:'event-'+id,itemId:asset.criteriaId,assetId:id,quantity:1,incomeType:type,originMine:mine,createdAt:date,updatedAt:date,syncState:'pending'}]};
}
test('reparación externa recibe prefijo y conserva origen, propiedad, estado y fecha inicial',()=>{
 const s=service(),r=s.sync(batch('1'));assert.equal(r.capabilities.externalIncomeV1,true);assert.equal(r.capabilities.externalMarkSeparator,'-');
 const a=s.cloud().assets[0];assert.equal(a.nuevaMarca,'P-AA');assert.equal(a.markScheme,'mine-prefix-v1');assert.equal(a.mina,'Providencia');assert.equal(a.minaOrigen,'Providencia');assert.equal(a.estado,'En reparación');assert.equal(a.disponibleEntrega,'No');assert.equal(a.ingresoTemporal,true);assert.equal(a.fechaIngreso,'2026-10-05');
 assert.equal(s.cloud().blendingIncomes[0].incomeType,'REPARACIÓN');assert.match(s.cloud().blendingIncomes[0].assetLabel,/P-AA.*Providencia/);
});
test('cada mina avanza de forma independiente, y Sandra K continúa su secuencia',()=>{
 const s=service();for(const [id,mine]of [['1','Providencia'],['2','El Silencio'],['3','Carla'],['4','Alianza'],['5','Providencia']])s.sync(batch(id,mine));
 s.sync(batch('6','Providencia','TRASLADO'));s.sync(batch('7','Sandra K','REPARACIÓN',{clase:'Columna',criteriaId:'col'}));
 assert.deepEqual(s.cloud().assets.map(a=>a.nuevaMarca),['P-AA','S-AA','C-AA','L-AA','P-AB','AAA','AAB']);
 for(const a of s.cloud().assets.slice(-2)){assert.equal(a.mina,'Sandra K');assert.equal(a.activoExterno,false);assert.equal(a.ingresoTemporal,false)}
});
test('reintentos, retornos y traslado definitivo conservan marca y fecha inicial',()=>{
 const s=service(),b=batch('1');s.sync(b);s.sync(b);assert.equal(s.cloud().assetMarkRegistry.length,1);assert.equal(s.cloud().blendingIncomes.length,1);
 const original=s.cloud().assets[0],r=service({...s.cloud(),assets:[{...original,ubicacion:'Providencia'}]});
 const visit=batch('1');visit.assets[0]={...original,marcaInterna:'ZZZ',ubicacion:'Bodega de Superficie',syncState:'pending'};visit.blendingIncomes[0]={...visit.blendingIncomes[0],id:'return',syncEventId:'return',createdAt:'2026-11-05T10:00:00Z'};
 r.sync(visit);let a=r.cloud().assets[0];assert.equal(a.nuevaMarca,'P-AA');assert.equal(a.fechaIngreso,'2026-10-05');assert.equal(r.cloud().assetMarkRegistry.length,1);
 visit.blendingIncomes[0]={...visit.blendingIncomes[0],id:'transfer',syncEventId:'transfer',incomeType:'TRASLADO',createdAt:'2026-12-05T10:00:00Z'};r.sync(visit);a=r.cloud().assets[0];assert.equal(a.mina,'Sandra K');assert.equal(a.minaOrigen,'Providencia');assert.equal(a.nuevaMarca,'P-AA');assert.equal(a.ingresoTemporal,false);
});
test('evita marcas físicas o retiradas sin quitar prefijos a Sandra K',()=>{
 const seed={assets:[{id:'manual',clase:'YT',numeroYT:'old',marcaInterna:'P-AA',deleted:true}],assetMarkRegistry:[{id:'previous',code:'BZZ',sequence:1351,issuedAt:date}]},s=service(seed);
 s.sync(batch('1'));assert.equal(s.cloud().assets.find(a=>a.id==='1').nuevaMarca,'P-AB');
 s.sync(batch('2','Sandra K','TRASLADO'));assert.equal(s.cloud().assets.find(a=>a.id==='2').nuevaMarca,'CAA');
});
test('la secuencia externa no adelanta la secuencia de Sandra K',()=>{
 const s=service({assetMarkRegistry:[{id:'external',code:'P-ZZ',sequence:675,scheme:'mine-prefix-v1',prefix:'P',mine:'Providencia'}]});s.sync(batch('1','Sandra K','TRASLADO'));assert.equal(s.cloud().assets[0].nuevaMarca,'AAA');
});
test('sin origen, tipo inválido, mina sin prefijo y duplicados se rechazan sin escrituras parciales',()=>{
 for(const b of [batch('1',''),batch('1','Providencia','OTRO'),batch('1','Mina nueva')]){const s=service();assert.throws(()=>s.sync(b));assert.equal(s.writes(),0)}
 const s=service(),b=batch('1'),second=batch('2');second.assets[0].serial=b.assets[0].serial;b.assets.push(...second.assets);b.blendingIncomes.push(...second.blendingIncomes);assert.throws(()=>s.sync(b),/ya existe/);assert.equal(s.writes(),0);
});
test('los clientes antiguos y las marcas manuales de YT siguen siendo compatibles',()=>{
 const s=service(),b=batch('1');delete b.assets[0].incomeMarking;delete b.assets[0].tipoIngresoInicial;delete b.assets[0].minaOrigen;b.assets[0].marcaInterna='XXI';delete b.blendingIncomes[0].incomeType;delete b.blendingIncomes[0].originMine;
 s.sync(b);assert.equal(s.cloud().assets[0].marcaInterna,'XXI');assert.equal(s.cloud().assets[0].markingPolicy,undefined);
 const r=s.sync();assert.equal(r.capabilities.externalIncomeV1,true);assert.equal(r.capabilities.externalMarkSeparator,'-');
});
test('agotar las 676 marcas de una mina no permite repetirlas ni bloquea marcas propias',()=>{
 const registry=Array.from({length:676},(_,i)=>({id:'p'+i,code:'P-'+String.fromCharCode(65+Math.floor(i/26),65+i%26),sequence:i,scheme:'mine-prefix-v1',prefix:'P',mine:'Providencia'}));const s=service({assetMarkRegistry:registry});
 assert.throws(()=>s.sync(batch('1')),/agotaron/);assert.equal(s.writes(),0);s.sync(batch('2','Sandra K','TRASLADO'));assert.equal(s.cloud().assets[0].nuevaMarca,'AAA');
});

test('PAA y P-AA coexisten y las dos secuencias continúan sin colisión',()=>{
 const s=service({assetMarkRegistry:[{id:'previous',code:'OZZ',sequence:10139,issuedAt:date}]});
 s.sync(batch('external'));s.sync(batch('own','Sandra K','TRASLADO'));
 assert.deepEqual(s.cloud().assets.map(a=>a.nuevaMarca),['P-AA','PAA']);
 s.sync(batch('external-2'));s.sync(batch('own-2','Sandra K','TRASLADO'));
 assert.deepEqual(s.cloud().assets.slice(-2).map(a=>a.nuevaMarca),['P-AB','PAB']);
});
test('conserva marcas externas antiguas sin guion y no reutiliza su sufijo',()=>{
 const old={id:'old',clase:'YT',marcaInterna:'PAA',marcaActual:'PAA',nuevaMarca:'PAA',markingPolicy:'letters-v1',markStatus:'assigned',markScheme:'mine-prefix-v1',markPrefix:'P',markMine:'Providencia',markSequence:0,mina:'Providencia',minaOrigen:'Providencia',incomeMarking:true,activoExterno:true};
 const s=service({assets:[old],assetMarkRegistry:[{id:'old',code:'PAA',sequence:0,scheme:'mine-prefix-v1',prefix:'P',mine:'Providencia'},{id:'previous',code:'OZZ',sequence:10139}]});
 s.sync(batch('new'));s.sync(batch('own','Sandra K','TRASLADO'));
 assert.deepEqual(s.cloud().assets.map(a=>a.nuevaMarca),['PAA','P-AB','PAB']);
});
test('recupera una marca confirmada con guion sin registro auxiliar y la conserva',()=>{
 const s=service(),old={...batch('old').assets[0],mina:'Providencia',activoExterno:true,markScheme:'mine-prefix-v1',markPrefix:'P',markMine:'Providencia',markingPolicy:'letters-v1',markStatus:'assigned',markSequence:0,nuevaMarca:'P-AA',marcaActual:'P-AA',marcaInterna:'P-AA'};
 const result=s.ctx.assignAssetMarks_({assets:[old]},[{...old,nuevaMarca:'ZZZ',marcaActual:'ZZZ',marcaInterna:'ZZZ'}]);
 assert.equal(result.assets[0].nuevaMarca,'P-AA');assert.equal(result.registry[0].code,'P-AA');
});
