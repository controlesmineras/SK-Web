const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const fs=require('node:fs'),path=require('node:path');
const window={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../asset-record-rules.js'),'utf8'),{window});
const {duplicateSerial}=window.SKAssetRules;
test('el serial se compara entre clases sin distinguir mayúsculas ni espacios exteriores',()=>{
 const existing={id:'1',clase:'Pulidora',serial:'ABC-123'};
 assert.equal(duplicateSerial([existing],{id:'2',clase:'Taladro',serial:' abc-123 '}),existing);
 assert.equal(duplicateSerial([existing],{...existing,serial:' abc-123 '}),null);
 assert.equal(duplicateSerial([existing],{id:'2',serial:'ABC123'}),null);
});
test('detecta filas importadas que todavía no tienen identificador',()=>{
 const first={clase:'Pulidora',serial:'SN-1'};
 assert.equal(duplicateSerial([first],{clase:'Columna',serial:' sn-1 '}),first);
});
test('bajas conservan su serial; eliminados, vacíos y No aplica no bloquean otro registro',()=>{
 const row={id:'1',serial:'SN-1',estado:'Dado de baja'};
 assert.equal(duplicateSerial([row],{id:'2',serial:'SN-1'}),row);
 assert.equal(duplicateSerial([{...row,deleted:true}],{id:'2',serial:'SN-1'}),null);
 for(const serial of ['',undefined,'No aplica',' no aplica '])assert.equal(duplicateSerial([{id:'1',serial}],{id:'2',serial}),null);
});
function deletionUI({owner=true,confirmed=true,fail=false}={}){
 const fields={id:{value:'asset-1'}},form={elements:fields,dataset:{autoMarkPolicy:'letters-v1'},reset(){fields.id.value=''}},remove={},save={};
 let rows=[{id:'asset-1',clase:'Pulidora',serial:'SN-1',updatedAt:'2026-10-01T00:00:00Z'}],prompts=0,writes=0,scheduled=0,refreshed=0;const alerts=[];
 const document={querySelector:selector=>({'#assetForm':form,'#assetDeleteBtn':remove,'#assetSaveBtn':save}[selector])||null};
 // Read-only mode iterates the actual form controls.
 fields[Symbol.iterator]=function*(){yield fields.id};fields.id.dataset={};
 const ctx={document,console,window:{addEventListener(){},SKAdminAuth:{isOwner:()=>owner,user:()=>({username:'admin',name:'Administrador'})},skSyncApi:{schedule(){scheduled++}}},all:async()=>rows,put:async(_,row)=>{writes++;if(fail)throw new Error('Storage failed');rows=[row]},refresh:async()=>{refreshed++},confirm:()=>{prompts++;return confirmed},alert:message=>alerts.push(message)};
 let source=fs.readFileSync(path.join(__dirname,'../asset-admin-ui.js'),'utf8');
 source=source.replace('window.addEventListener(\'load\',',"window.__test={deleteAsset,setAssetMode};window.addEventListener('load',");
 source=source.replace('saved=true;form.reset();form.elements.id.value=\'\';delete form.dataset.autoMarkPolicy;updateAssetFields();',"saved=true;form.reset();form.elements.id.value='';delete form.dataset.autoMarkPolicy;");
 vm.runInNewContext(source,ctx);
 return{run:ctx.window.__test.deleteAsset,mode:ctx.window.__test.setAssetMode,remove,form,rows:()=>rows,stats:()=>({prompts,writes,scheduled,refreshed,alerts})};
}
test('eliminar requiere dueño y confirmación; cancelar no cambia datos',async()=>{
 for(const options of [{owner:false},{confirmed:false}]){const ui=deletionUI(options);await ui.run();assert.equal(ui.stats().writes,0);assert.equal(ui.rows()[0].deleted,undefined);}
 const assistant=deletionUI({owner:false});assistant.mode(true);assert.equal(assistant.remove.hidden,true);
 const owner=deletionUI();owner.mode(false);assert.equal(owner.remove.hidden,true);owner.mode(true);assert.equal(owner.remove.hidden,false);
});
test('eliminar guarda la señal sincronizable y el autor, limpia la ficha y agenda envío',async()=>{
 const ui=deletionUI();await ui.run();const row=ui.rows()[0];assert.equal(row.deleted,true);assert.equal(row.syncState,'pending');assert.equal(row.deletedBy,'admin');assert.equal(row.serial,'SN-1');assert.equal(ui.form.elements.id.value,'');assert.equal(ui.stats().scheduled,1);assert.equal(ui.stats().refreshed,1);assert.equal(ui.remove.hidden,true);
});
test('si falla la escritura, no anuncia éxito ni limpia la ficha',async()=>{
 const ui=deletionUI({fail:true});await ui.run();assert.equal(ui.rows()[0].deleted,undefined);assert.equal(ui.form.elements.id.value,'asset-1');assert.equal(ui.stats().scheduled,0);assert.match(ui.stats().alerts[0],/No se pudo eliminar/);
});
