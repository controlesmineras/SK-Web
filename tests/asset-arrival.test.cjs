const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
function frontend(file,exports){const context=vm.createContext({Intl,Date,console,window:{addEventListener(){}},document:{querySelector(){return null}}});let source=read(file);source=source.replace(/\}\)\(\);\s*$/,`window.testing={${exports}};})();`);vm.runInContext(source,context);return context.window.testing}
const plaza=frontend('plaza/asset-not-found.js','initialArrivalDetails'),admin=frontend('asset-admin-ui.js','arrivalDetails,restoreAssetValue');
const plain=value=>JSON.parse(JSON.stringify(value));
test('la llegada inicial toma fecha/hora de Colombia y las personas del ingreso',()=>{
 const result=plain(plaza.initialArrivalDetails('2026-10-06T02:15:00Z',{documento:'123',nombre:'Quien trae'},{documento:'456',nombre:'Bodeguera'}));
 assert.deepEqual(result,{fechaNovedad:'2026-10-05',horaNovedad:'21:15',descripcionNovedad:'Llegada a mina',documentoResponsable:'123',nombreResponsable:'Quien trae',documentoBodeguero:'456',nombreBodeguero:'Bodeguera'});
});
test('la consulta reconstruye la llegada desde el ingreso y no reemplaza una novedad posterior',()=>{
 const income={createdAt:'2026-10-06T02:15:00Z',broughtByName:'Quien trae',broughtByDocument:'123',operatorDocument:'456',operatorName:'Bodeguera'};
 assert.equal(admin.arrivalDetails({},income).mina,'Sandra K');
 assert.equal(admin.arrivalDetails({},income).documentoResponsable,'123');
 assert.deepEqual(plain(admin.arrivalDetails({descripcionNovedad:'Reparación',fechaNovedad:'2026-10-06'},income)),{});
 assert.equal(admin.arrivalDetails({mina:'Providencia'},income).mina,'Providencia');
 assert.equal(admin.arrivalDetails({}, {...income,incomeType:'REPARACIÓN',originMine:'Providencia'}).mina,'Providencia');
 assert.deepEqual(plain(admin.arrivalDetails({},null)),{});
});
test('restaura valores históricos aunque el selector no incluya la marca y el usuario esté en consulta',()=>{
 const control={tagName:'SELECT',disabled:true,options:[],_classCatalog:[],append(option){this.options.push(option)}};
 const context=vm.createContext({window:{addEventListener(){}},document:{querySelector(){return null},createElement(){return {}}},Intl,Date});
 vm.runInContext(read('asset-admin-ui.js').replace(/\}\)\(\);\s*$/,'window.testing={restoreAssetValue};})();'),context);
 context.window.testing.restoreAssetValue(control,'DeWalt');
 assert.equal(control.value,'DeWalt');assert.equal(control.options[0].value,'DeWalt');assert.equal(control._classCatalog[0].value,'DeWalt');
});
test('la sincronización central conserva modelo, fabricante, propiedad y llegada completa del activo nuevo',()=>{
 let cloud={assets:[],inventoryCriteria:[{id:'pul',name:'Pulidora 7"',isFixedAsset:true,usesModel:true,usesManufacturer:true,usesSerial:true}]};
 const ctx=vm.createContext({LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})}});vm.runInContext(read('backend/apps-script/Code.gs'),ctx);
 ctx.findFile_=()=> 'file';ctx.readFile_=()=>plain(cloud);ctx.writeFile_=(_,data)=>{cloud=plain(data)};ctx.json_=plain;ctx.verifyToken_=()=>({document:'456',role:'plaza_operator'});
 const timestamp='2026-10-06T02:15:00Z',details=plain(plaza.initialArrivalDetails(timestamp,{documento:'123',nombre:'Quien trae'},{documento:'456',nombre:'Bodeguera'}));
 const asset={id:'pul-1',criteriaId:'pul',clase:'Pulidora 7"',numeroClase:'1',numeroYT:'1',serial:'10647',modelo:'DWE491-B3 / 7"',fabricante:'DeWalt',mina:'Sandra K',fechaIngreso:'2026-10-05',...details,createdAt:timestamp,updatedAt:timestamp,syncState:'pending'};
 ctx.plazaSync_({token:'test',data:{assets:[asset],blendingIncomes:[{id:'ingreso',syncEventId:'ingreso',assetId:asset.id,itemId:'pul',quantity:1,broughtById:'123',broughtByDocument:'123',broughtByName:'Quien trae',createdAt:timestamp,updatedAt:timestamp,syncState:'pending'}]}});
 for(const key of ['modelo','fabricante','mina','fechaIngreso',...Object.keys(details)])assert.equal(cloud.assets[0][key],asset[key],key);
});
