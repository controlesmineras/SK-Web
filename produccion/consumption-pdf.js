// Informe descargable sin conexión. La tabla usa Courier para medir sus columnas en puntos.
(()=>{
 'use strict';
 const pageWidth=842,pageHeight=595,left=30,bottom=36,tableTop=508;
 const fontSize=9,lineHeight=12,padding=5;
 function literal(value){
  return String(value).normalize('NFC').replace(/[–—−]/g,'-')
   .replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)')
   .replace(/[^\x20-\x7e\xa0-\xff]/gu,'?')
   .replace(/[\xa0-\xff]/g,char=>'\\'+char.charCodeAt(0).toString(8).padStart(3,'0'));
 }
 function wrap(value,width){
  const limit=Math.max(1,Math.floor((width-2*padding)/(fontSize*.6)));
  const lines=[];
  for(const paragraph of String(value??'').normalize('NFC').split(/\r?\n/)){
   let line='';
   for(let word of paragraph.split(/\s+/).filter(Boolean)){
    if(line&&line.length+1+word.length>limit){lines.push(line);line=''}
    while(word.length>limit){lines.push(word.slice(0,limit));word=word.slice(limit)}
    line=line?line+' '+word:word;
   }
   lines.push(line);
  }
  return lines;
 }
 const text=(value,x,y,size=fontSize,font='F1')=>
  `BT /${font} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${literal(value)}) Tj ET`;
 function consumptionPdf({title,rangeTitle,headers,widths,values}){
  const pages=[],header=headers.map((value,i)=>wrap(value,widths[i]));
  const headerLines=Math.max(...header.map(lines=>lines.length));
  const bodyTop=tableTop-headerLines*lineHeight-2*padding;
  let commands,y;
  const capacity=()=>Math.floor((y-bottom-2*padding)/lineHeight);
  function draw(cells,start,count,isHeader){
   const height=count*lineHeight+2*padding;
   let x=left;
   for(let i=0;i<cells.length;i++){
    const rect=`${x} ${y-height} ${widths[i]} ${height} re`;
    if(isHeader)commands.push('0.89 0.93 0.96 rg '+rect+' f 0 g');
    commands.push('0.76 G 0.5 w '+rect+' S');
    cells[i].slice(start,start+count).forEach((line,j)=>{
     commands.push(text(line,x+padding,y-padding-fontSize-lineHeight*j,fontSize,isHeader?'F2':'F1'));
    });
    x+=widths[i];
   }
   y-=height;
  }
  function startPage(){
   commands=[text(title,left,559,15,'F3'),text(rangeTitle,left,539,10,'F3')];
   pages.push(commands);y=tableTop;
   draw(header,0,headerLines,true);
  }
  startPage();
  for(const row of values){
   const cells=row.map((value,i)=>wrap(value,widths[i]));
   const lineCount=Math.max(...cells.map(lines=>lines.length));
   if(lineCount>capacity()&&y<bodyTop)startPage();
   for(let start=0;start<lineCount;){
    if(capacity()<1)startPage();
    const count=Math.min(lineCount-start,capacity());
    draw(cells,start,count,false);start+=count;
   }
  }
  const streams=pages.map((page,i)=>[...page,text(`Página ${i+1} de ${pages.length}`,left,18,9,'F3')].join('\n'));
  // Misma estructura de páginas y tabla de referencias que los PDF de Plaza Blending.
  const fonts=3+streams.length*2,objects=[null,'<< /Type /Catalog /Pages 2 0 R >>'];
  const kids=[];
  streams.forEach((stream,i)=>{
   const id=3+i*2;
   kids.push(id+' 0 R');
   objects[id]=`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fonts} 0 R /F2 ${fonts+1} 0 R /F3 ${fonts+2} 0 R >> >> /Contents ${id+1} 0 R >>`;
   objects[id+1]=`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });
  objects[2]=`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`;
  for(const face of ['Courier','Courier-Bold','Helvetica-Bold']){
   objects.push(`<< /Type /Font /Subtype /Type1 /BaseFont /${face} /Encoding /WinAnsiEncoding >>`);
  }
  let pdf='%PDF-1.4\n';
  const offsets=['0000000000 65535 f '];
  for(let i=1;i<objects.length;i++){
   offsets.push(String(pdf.length).padStart(10,'0')+' 00000 n ');
   pdf+=`${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref=pdf.length;
  pdf+=`xref\n0 ${objects.length}\n${offsets.join('\n')}\ntrailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([pdf],{type:'application/pdf'});
 }
 window.SKConsumptionPdf=consumptionPdf;
})();
