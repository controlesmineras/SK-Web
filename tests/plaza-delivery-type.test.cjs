const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readFileSync}=require('node:fs'),{join}=require('node:path');
const source=readFileSync(join(__dirname,'../backend/apps-script/Code.gs'),'utf8');
const clone=value=>JSON.parse(JSON.stringify(value));

test('sincroniza asignación y préstamo por activo, conserva históricos y reintentos sin duplicar',()=>{
 const date=new Date().toISOString();
 let cloud={inventoryCriteria:[{id:'pulidora',name:'Pulidora',isFixedAsset:true,allowLoan:true}],personal:[{id:'person',nombre:'Receptor',documento:'123'}],assets:['assigned','loaned','legacy'].map(id=>({id,clase:'Pulidora',numeroClase:id,ubicacion:'Bodega de Superficie'})),inventoryStock:[{id:'stock',itemId:'gloves',quantity:10}]};
 const ctx=vm.createContext({LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})}});
 vm.runInContext(source,ctx);
 ctx.findFile_=()=> 'file';ctx.readFile_=()=>clone(cloud);ctx.writeFile_=(_,data)=>{cloud=clone(data)};ctx.json_=clone;ctx.verifyToken_=()=>({document:'operator',role:'plaza_operator'});
 const deliveries=[['assigned','ASIGNACIÓN'],['loaned','PRÉSTAMO'],['legacy',null]].map(([assetId,deliveryType])=>({id:assetId,syncEventId:'batch',itemId:'pulidora',assetId,...(deliveryType?{deliveryType}:{}),recipientId:'person',quantity:1,destination:'Operación',createdAt:date,updatedAt:date,syncState:'pending'}));
 deliveries.push({id:'consumable',syncEventId:'batch',itemId:'gloves',recipientId:'person',quantity:2,createdAt:date,updatedAt:date,syncState:'pending'});
 const input={token:'test',data:{blendingDeliveries:deliveries}};
 const first=ctx.plazaSync_(clone(input));
 assert.deepEqual(first.data.blendingDeliveries.map(row=>row.deliveryType),['ASIGNACIÓN','PRÉSTAMO',undefined,undefined]);
 assert.ok(first.data.blendingDeliveries.every(row=>row.syncState==='synced'));
 assert.ok(first.data.assets.every(row=>row.ubicacion==='Operación'));
 assert.equal(first.data.inventoryStock[0].quantity,8);
 ctx.plazaSync_(clone(input));
 assert.equal(cloud.blendingDeliveries.length,4);assert.equal(cloud.inventoryStock[0].quantity,8);
 const refreshed=ctx.plazaSync_({token:'test',data:{}});
 assert.deepEqual(refreshed.data.blendingDeliveries.map(row=>row.deliveryType),['ASIGNACIÓN','PRÉSTAMO',undefined,undefined]);
});
