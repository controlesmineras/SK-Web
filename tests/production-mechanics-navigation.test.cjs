const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('produccion/index.html','utf8');
const app=fs.readFileSync('produccion/app.js','utf8');
const warehouse=fs.readFileSync('produccion/warehouse.js','utf8');

function navigation(role){
 const nodes=new Map();
 const byId=id=>{
  if(!nodes.has(id))nodes.set(id,{id,hidden:false,attributes:{},getAttribute(name){return this.attributes[name]},setAttribute(name,value){this.attributes[name]=value},focus(){this.focused=true}});
  return nodes.get(id);
 };
 const buttons=[...html.matchAll(/<button type="button" id="(show\w+)" aria-controls="([^"]+)"[^>]*>(.*?)<\/button>/g)].map(([,id,panel,label])=>{
  const button=byId(id);
  button.setAttribute('aria-controls',panel);
  button.textContent=label.replace(/<[^>]*>/g,'').trim();
  byId(panel).hidden=true;
  return button;
 });
 const menu=byId('mechanicMenu');
 menu.querySelector=()=>buttons.find(button=>button.getAttribute('aria-pressed')==='true');
 byId('showStockEdit').hidden=role!=='admin';
 byId('showPhysicalCount').hidden=role==='mechanic';
 const c=vm.createContext({byId,mechanicMenu:menu,mechanicButtons:buttons,mechanicTitle:byId('mechanicTitle'),module:'mechanic',
  session:{user:{role}},permits:(user,scope)=>user.role==='admin'||scope==='mechanic',change:byId('back'),breadcrumb:byId('crumb'),countSaving:false,countDirty:false,
  stockViews:['showIncome','showStockEdit'].map(id=>({button:byId(id)})),paintStockView(){},paintCount(){},showQueryType(){},window:{},
  leaveCurrent:()=>true,choose:()=>{throw Error('Unexpected module change')}});
 vm.runInContext(app.slice(app.indexOf('function showConsumptionView('),app.indexOf('function incomeEditable(')),c);
 vm.runInContext(app.slice(app.indexOf('for(const button of mechanicButtons)button.onclick'),app.indexOf("byId('queryIncome').onclick")),c);
 vm.runInContext(warehouse.slice(warehouse.indexOf('function paintNavigation('),warehouse.indexOf('function leaveCurrent(')),c);
 vm.runInContext(warehouse.slice(warehouse.indexOf('function goBack('),warehouse.indexOf('function choose(')),c);
 c.window.SKProductionWarehouse={paintNavigation:c.paintNavigation};
 return {c,buttons,byId,menu,visiblePanels:()=>buttons.map(b=>byId(b.getAttribute('aria-controls'))).filter(panel=>!panel.hidden).map(panel=>panel.id)};
}

test('each mechanics action opens one panel and Back returns to the buttons, including from Consumos',()=>{
 const {c,buttons,byId,menu,visiblePanels}=navigation('admin');
 c.showConsumptionView();
 assert.deepEqual(visiblePanels(),[]);assert.equal(menu.hidden,false);assert.equal(c.mechanicTitle.textContent,'MECÁNICA');
 const titles=['INGRESOS','CONSUMOS','CONSULTAS','EXISTENCIAS','INVENTARIO FÍSICO'];
 assert.equal(buttons.length,titles.length);
 for(const [index,button] of buttons.entries()){
  button.onclick();c.paintNavigation();
  assert.equal(menu.hidden,true);assert.deepEqual(visiblePanels(),[button.getAttribute('aria-controls')]);
  assert.equal(c.mechanicTitle.textContent,titles[index]);assert.equal(c.mechanicTitle.hidden,false);assert.equal(c.change.hidden,false);
  c.goBack();assert.equal(menu.hidden,false);assert.deepEqual(visiblePanels(),[]);assert.equal(button.focused,true);
 }
 byId('showPhysicalCount').onclick();c.leaveCurrent=()=>false;c.goBack();
 assert.deepEqual(visiblePanels(),['physicalCount']);assert.equal(menu.hidden,true);
});

test('a mechanic with only one module enters the menu and can return from a permitted task',()=>{
 const {c,byId,menu,visiblePanels}=navigation('mechanic');
 c.showConsumptionView();assert.equal(c.change.hidden,true);
 byId('showStockEdit').onclick();byId('showPhysicalCount').onclick();
 assert.equal(menu.hidden,false);assert.deepEqual(visiblePanels(),[]);
 byId('showRecord').onclick();assert.equal(c.change.hidden,false);assert.equal(byId('productionHome').disabled,false);
 c.goBack();assert.equal(c.change.hidden,true);assert.deepEqual(visiblePanels(),[]);
});
