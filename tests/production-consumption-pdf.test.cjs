const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

test('offline consumption PDF repeats headings, preserves rows and has valid byte offsets',async()=>{
 const context={window:{},Blob};
 vm.runInNewContext(fs.readFileSync('produccion/consumption-pdf.js','utf8'),context);
 const values=Array.from({length:65},(_,n)=>[n===20?'Válvula (aceite)':'Repuesto '+n,n]);
 values.push(['Inicio '+('repuesto '.repeat(2400))+'fin largo',65]);
 const blob=context.window.SKConsumptionPdf({title:'Producción',rangeTitle:'Columna29',headers:['REPUESTO','CANTIDAD'],widths:[550,232],values});
 assert.equal(blob.type,'application/pdf');
 const pdf=Buffer.from(await blob.arrayBuffer()).toString('ascii');
 const pages=Number(pdf.match(/\/Count (\d+)/)[1]);
 assert.ok(pages>3);
 assert.equal(pdf.split('(REPUESTO) Tj').length-1,pages);
 assert.equal(pdf.split('(Columna29) Tj').length-1,pages);
 assert.match(pdf,/V\\341lvula \\\(aceite\\\)/);
 assert.ok(pdf.indexOf('(Repuesto 0)')<pdf.indexOf('(Repuesto 64)'));
 assert.ok(pdf.includes('fin largo'));
 const start=Number(pdf.match(/startxref\n(\d+)/)[1]);
 const xref=pdf.slice(start).split('\n');
 assert.equal(xref[0],'xref');
 for(let id=1;id<Number(xref[1].split(' ')[1]);id++){
  const offset=Number(xref[id+2].slice(0,10));
  assert.ok(pdf.startsWith(id+' 0 obj\n',offset),'referencia '+id);
 }
});
