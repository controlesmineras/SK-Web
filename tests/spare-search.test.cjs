const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
for(const path of ['inventory-admin.js','plaza/plaza.js','searchable-consumption.js']){
 const source=fs.readFileSync(path,'utf8'),start=source.indexOf('function matchesItemSearch('),end=source.indexOf('\n}',start)+2;
 const context={norm:value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()};
 vm.runInNewContext(source.slice(start,end),context);
 test(path+': exact item numbers while typing, accented queries and names',()=>{
  const match=context.matchesItemSearch;
  for(const equipment of ['YT 29','Columna 29'])for(const number of ['1','10','11','12','19','100']){
   const text=`Repuesto ${equipment} - Ítem ${number} - Perno de chapeta`;
   assert.equal(match(text,number,'item 1'),number==='1');
   assert.equal(match(text,number,'Ítem 10'),number==='10');
   assert.equal(match(text,number,'1'),number==='1');
   assert.equal(match(text,number,'item 12'),number==='12');
   assert.equal(match(text,number,'perno'),true);
   assert.equal(match(text,number,''),true);
   assert.equal(match(text,number,'item 1 perno'),number==='1');
  }
  assert.equal(match('Repuesto YT 29 - Ítem 11 - Perno','','item 1'),false);
  assert.equal(match('Repuesto YT 29 - Ítem 1 - Perno','','item 1'),true);
  assert.equal(match('Lubricador','','item 1'),false);
 });
}

test('Production searches current and legacy names without confusing item 1 with item 10',()=>{
 const context=vm.createContext({window:{},norm:v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()});
 vm.runInContext(fs.readFileSync('spare-groups.js','utf8'),context);
 const app=fs.readFileSync('produccion/app.js','utf8');
 vm.runInContext(app.slice(app.indexOf('function filterParts('),app.indexOf('function paintStockView(')),context);
 const parts=[{id:'a',numero:'1',nombre:'Pistón',sparePartCode:'YT25-3.20',spareApplication:'tubo de aire',secondaryName:'Émbolo',CI_NOMBRE_TERCIARIO:'Percutor'},
  {id:'b',numero:'10',nombre:'Resorte',sparePartCode:'00102',aliasSecundario:'Muelle',tertiaryName:'Espiral'},{id:'c',nombre:'Lubricador'}];
 const found=q=>Array.from(context.filterParts(parts,q),p=>p.id);
 for(const q of ['1','yt25-3.20','piston','pistón tubo de aire','tubo de aire','embolo','ÍTEM 1 PERCUTOR'])assert.deepEqual(found(q),['a']);
 for(const q of ['muelle','espiral','00102'])assert.deepEqual(found(q),['b']);
 assert.deepEqual(found('ítem 1 espiral'),[]);assert.deepEqual(found(''),['a','b','c']);
});
