const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
function app(){
 const nodes={'#assetSearch':{value:''},'#assetAdminList':{}};
 const ctx=vm.createContext({window:{addEventListener(){}},document:{querySelector:key=>nodes[key]}});
 for(const file of ['asset-search.js','asset-record-rules.js','asset-list-order.js'])vm.runInContext(read(file),ctx);
 return {query:ctx.window.SKAssetSearch.query,ownership:ctx.window.SKAssetOwnership,nodes};
}
test('resalta cada fragmento literal y conserva tildes, puntuación y texto seguro',()=>{
 const {query}=app(),q=query('  guIa  a.2 ');
 assert.equal(q.html('Guía A.2 <gui\u0301a>'),'<mark>Guía</mark> <mark>A.2</mark> &#60;<mark>guía</mark>&#62;');
 assert.equal(q.matches('A-2 Guía'),false);
 assert.equal(query('ana').html('Banana'), 'B<mark>anana</mark>');
 assert.equal(query('[').html('YT [52]'), 'YT <mark>[</mark>52]');
});
test('registro y consulta filtran todas las palabras y explican coincidencias con marcas históricas',()=>{
 const {nodes,ownership}=app();
 const rows=[
  {id:'a',clase:'Taladro',modelo:'M2',marcaPrevia:'Guía-52',mina:'Providencia'},
  {id:'Guía-52',clase:'Taladro',modelo:'M2',mina:'Providencia',updatedAt:'2052'},
  {id:'c',clase:'Taladro',marcaPrevia:'Guía-52',mina:'Sandra K'},
  {id:'gone',deleted:true,clase:'Taladro',marcaPrevia:'Guía-52',mina:'Providencia'}
 ];
 nodes['#assetSearch'].value='GUIA-52  provi';
 ownership.render(rows);
 const html=nodes['#assetAdminList'].innerHTML;
 assert.equal((html.match(/<button/g)||[]).length,1);
 assert.match(html,/data-id="a"/);
 assert.match(html,/Marca anterior: <mark>Guía-52<\/mark>/);
 assert.match(html,/<mark>Provi<\/mark>dencia/);
 assert.equal(ownership.results(rows,'2052').length,0);
 assert.equal(ownership.results(rows,'').length,3);
 nodes['#assetSearch'].value='desconocido';ownership.render(rows);
 assert.doesNotMatch(nodes['#assetAdminList'].innerHTML,/<button/);
});
test('documentos técnicos y serial oculto de columna no aparecen como coincidencias',()=>{
 const asset={id:'a123',clase:'Columna',numeroClase:'52',serial:'oculto',syncState:'pending'};
 const describe=()=>['Columna'];
 const {query}=app();
 for(const term of ['oculto','pending','a123'])assert.equal(query(term).rows([asset],describe).length,0);
 const [row]=query('52 columna').rows([asset],describe);
 assert.equal(row.detail,'N.º de clase: 52');
});
