const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const legacy=[{id:'yt1',clase:'YT',detalle:'29',numero:1,nombre:'Perno YT'},{id:'old28',clase:'YT',detalle:'28',numero:1,nombre:'YT 28'}];
const criteria=[{id:'column1',isYtSpare:true,spareEquipment:'Columna 29',spareItemNumber:'1',spareItemName:'Perno columna'}, {id:'column10',isYtSpare:true,spareEquipment:'Columna 29',spareItemNumber:'10',spareItemName:'Sello'}, {id:'copy',productionPartId:'yt1',isYtSpare:true,spareEquipment:'YT 29',spareItemNumber:'1',spareItemName:'Perno YT editado'}, {id:'common',name:'Guantes'}, {id:'removed',isYtSpare:true,spareEquipment:'Columna 29',deleted:true}];
const window={};vm.runInNewContext(fs.readFileSync('spare-catalog.js','utf8'),{window,all:async t=>t==='parts'?legacy:criteria});const api=window.SKSpareCatalog;
test('manual Columna criteria are selectable and never mix with YT or model 28',()=>{
 const rows=api.merge(legacy,criteria);
 assert.deepEqual(Array.from(api.filter(rows,'Columna','Columna29'),p=>p.id),['column1','column10']);
 assert.deepEqual(Array.from(api.filter(rows,'YT','YT29'),p=>p.id),['yt1']);
 assert.equal(api.filter(rows,'YT','YT28')[0].id,'old28');
 assert.equal(rows.find(p=>p.id==='yt1').nombre,'Perno YT editado');
 assert.equal(rows.some(p=>['removed','common','copy'].includes(p.id)),false);
});
test('save resolver accepts manually registered column parts and rejects stale YT selections',async()=>{
 assert.equal((await api.resolve('column1','Columna','Columna29')).nombre,'Perno columna');
 assert.equal(await api.resolve('yt1','Columna','Columna29'),undefined);
 assert.equal(await api.resolve('column1','YT','YT29'),undefined);
});
