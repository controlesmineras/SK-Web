// Libro de compras para los informes de Mecánica. Todos los datos proceden del dispositivo.
(()=>{
 'use strict';
 const spreadsheet='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
 const rel='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
 const pkg='http://schemas.openxmlformats.org/package/2006';
 const drawing='http://schemas.openxmlformats.org/drawingml/2006';
 const report='Consumos y existencias', dashboard='Dashboard de consumos';
 const firstData=6;
 const localStamp=new Intl.DateTimeFormat('es-CO',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true,timeZone:'America/Bogota'});
 function stamp(value){
  const date=new Date(value);
  return value&&Number.isFinite(date.getTime())?localStamp.format(date):'Sin registro';
 }
 function relationships(entries){
  return '<Relationships xmlns="'+pkg+'/relationships">'+entries.map(([id,type,target])=>
   '<Relationship Id="rId'+id+'" Type="'+rel+'/'+type+'" Target="'+target+'"/>').join('')+'</Relationships>';
 }
 const styles=`<styleSheet xmlns="${spreadsheet}">
  <fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FF143B50"/><sz val="16"/><name val="Calibri"/></font></fonts>
  <fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF173D59"/><bgColor indexed="64"/></patternFill></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="4">${[0,1,2,3].map(i=>`<xf numFmtId="0" fontId="${i}" fillId="${i===2?2:0}" borderId="0" xfId="0" applyFont="1"${i===2?' applyFill="1"':''}/>`).join('')}</cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
 function worksheet(title,metadata,headers,rows,widths,hasChart,helpers){
  const {xml,col}=helpers, lastCol=col(headers.length);
  function row(values,index){
   const cells=values.map((value,i)=>{
    const style=index===1?3:index===5?2:index>=firstData&&i<2?1:0;
    const attrs=' r="'+col(i+1)+index+'" s="'+style+'"';
    if(value==null)return '<c'+attrs+'/>';
    if(typeof value==='number'&&Number.isFinite(value))return '<c'+attrs+'><v>'+value+'</v></c>';
    return '<c'+attrs+' t="inlineStr"><is><t xml:space="preserve">'+xml(value)+'</t></is></c>';
   }).join('');
   return '<row r="'+index+'"'+(index===1?' ht="26" customHeight="1"':index===5?' ht="22" customHeight="1"':'')+'>'+cells+'</row>';
  }
  const data=[[title],...metadata.map(line=>[line]),headers,...rows];
  return `<worksheet xmlns="${spreadsheet}" xmlns:r="${rel}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="5" topLeftCell="A6" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <cols>${widths.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('')}</cols>
  <sheetData>${data.map((values,i)=>row(values,i+1)).join('')}</sheetData><autoFilter ref="A5:${lastCol}${data.length}"/>
  <mergeCells count="4">${[1,2,3,4].map(i=>`<mergeCell ref="A${i}:${lastCol}${i}"/>`).join('')}</mergeCells>${hasChart?'<drawing r:id="rId1"/>':''}</worksheet>`;
 }
 function chartFiles(ranking,xml){
  // La tabla incluye todos los repuestos del período. El gráfico muestra los diez primeros.
  const top=ranking.slice(0,10),end=firstData+top.length-1;
  function reference(col,nums,values){
   const type=nums?'num':'str';
   return `<c:${type}Ref><c:f>'${dashboard}'!$${col}$${firstData}:$${col}$${end}</c:f><c:${type}Cache>${nums?'<c:formatCode>General</c:formatCode>':''}<c:ptCount val="${values.length}"/>${values.map((v,i)=>`<c:pt idx="${i}"><c:v>${xml(v)}</c:v></c:pt>`).join('')}</c:${type}Cache></c:${type}Ref>`;
  }
  const cat=reference('B',false,top.map(row=>row[1])),val=reference('D',true,top.map(row=>row[3]));
  const chart=`<c:chartSpace xmlns:c="${drawing}/chart" xmlns:a="${drawing}/main"><c:lang val="es-CO"/><c:chart>
   <c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Mayor consumo del período</a:t></a:r></a:p></c:rich></c:tx></c:title>
   <c:plotArea><c:layout/><c:barChart><c:barDir val="bar"/><c:grouping val="clustered"/><c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:v>Consumo</c:v></c:tx><c:spPr><a:solidFill><a:srgbClr val="217488"/></a:solidFill></c:spPr><c:cat>${cat}</c:cat><c:val>${val}</c:val></c:ser><c:axId val="1"/><c:axId val="2"/></c:barChart>
   <c:catAx><c:axId val="1"/><c:scaling><c:orientation val="maxMin"/></c:scaling><c:axPos val="l"/><c:tickLblPos val="low"/><c:crossAx val="2"/><c:crosses val="autoZero"/></c:catAx>
   <c:valAx><c:axId val="2"/><c:scaling><c:orientation val="minMax"/><c:min val="0"/></c:scaling><c:axPos val="b"/><c:majorGridlines/><c:crossAx val="1"/><c:crosses val="max"/><c:crossBetween val="between"/></c:valAx></c:plotArea><c:plotVisOnly val="1"/></c:chart></c:chartSpace>`;
  const anchor=(tag,col,row)=>`<xdr:${tag}><xdr:col>${col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:${tag}>`;
  const graphic=`<xdr:wsDr xmlns:xdr="${drawing}/spreadsheetDrawing" xmlns:a="${drawing}/main"><xdr:twoCellAnchor>${anchor('from',6,4)}${anchor('to',18,Math.max(18,6+top.length*2))}
  <xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="2" name="Consumo por repuesto"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="${drawing}/chart"><c:chart xmlns:c="${drawing}/chart" xmlns:r="${rel}" r:id="rId1"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>`;
  return [['xl/worksheets/_rels/sheet2.xml.rels',relationships([[1,'drawing','../drawings/drawing1.xml']])],
   ['xl/drawings/drawing1.xml',graphic],['xl/drawings/_rels/drawing1.xml.rels',relationships([[1,'chart','../charts/chart1.xml']])],['xl/charts/chart1.xml',chart]];
 }
 function build({rows,origin,period,downloadedAt,lastSyncAt,offline},helpers){
  const {zipStore}=helpers;
  const xml=value=>helpers.xml(String(value??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,''));
  const cells={xml,col:helpers.col};
  const metadata=[origin+' · '+period,'Descarga (Colombia) · '+stamp(downloadedAt),
   (offline?'Sin conexión · ':'')+'Última sincronización completa · '+stamp(lastSyncAt)];
  // Conserva como texto los identificadores con ceros iniciales o letras.
  function item(value){
   const number=Number(value);
   return /^(0|[1-9]\d*)$/.test(String(value))&&Number.isSafeInteger(number)?number:value;
  }
  const detail=rows.map(r=>[item(r.item),r.name,r.application,r.partCode,r.qty,r.stock]);
  const ordered=rows.filter(r=>r.qty>0).sort((a,b)=>b.qty-a.qty||String(a.item).localeCompare(String(b.item),'es',{numeric:true}));
  const ranking=ordered.map(r=>[item(r.item),r.name,r.application,r.qty,r.stock]);
  const hasChart=ranking.length>0;
  const contents=[['workbook','sheet.main'],['styles','styles'],['worksheets/sheet1','worksheet'],['worksheets/sheet2','worksheet']].map(([path,type])=>
   `<Override PartName="/xl/${path}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.${type}+xml"/>`).join('');
  const files=[['[Content_Types].xml',`<Types xmlns="${pkg}/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${contents}${hasChart?'<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/><Override PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>':''}</Types>`],
   ['_rels/.rels',relationships([[1,'officeDocument','xl/workbook.xml']])],
   ['xl/workbook.xml',`<workbook xmlns="${spreadsheet}" xmlns:r="${rel}"><bookViews><workbookView/></bookViews><sheets><sheet name="${report}" sheetId="1" r:id="rId1"/><sheet name="${dashboard}" sheetId="2" r:id="rId2"/></sheets></workbook>`],
   ['xl/_rels/workbook.xml.rels',relationships([[1,'worksheet','worksheets/sheet1.xml'],[2,'worksheet','worksheets/sheet2.xml'],[3,'styles','styles.xml']])],['xl/styles.xml',styles],
   ['xl/worksheets/sheet1.xml',worksheet(report,metadata,['N.º de ítem','Repuesto','Aplicación / Ubicación','Código de parte','Consumo del período','Existencia al descargar'],detail,[15,42,50,24,24,27],false,cells)],
   ['xl/worksheets/sheet2.xml',worksheet(hasChart?dashboard:'Dashboard de consumos · Sin consumo en el período',metadata,['N.º de ítem','Repuesto','Aplicación / Ubicación','Consumo del período','Existencia al descargar'],ranking,[15,42,58,24,27],hasChart,cells)]];
  if(hasChart)files.push(...chartFiles(ranking,xml));
  return zipStore(files);
 }
 window.SKPurchaseWorkbook={build};
})();
