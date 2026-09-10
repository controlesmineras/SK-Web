// Compatibilidad de campos de activos v2.
// Separa internamente NÚMERO DE CLASE de la marcación física y admite series como P1, P2...
(()=>{
const clean=v=>(v??'').toString().trim();
const isNum=v=>/^\d+$/.test(clean(v));
const isClassNo=v=>/^[A-Z]+\d+$/i.test(clean(v));
function romanToInt(s){s=clean(s).toUpperCase();if(!/^[IVXLCDM]+$/.test(s))return null;const v={I:1,V:5,X:10,L:50,C:100,D:500,M:1000};let n=0;for(let i=0;i<s.length;i++)n+=(v[s[i]]<(v[s[i+1]]||0))?-v[s[i]]:v[s[i]];return n||null}
function canonical(a){
  const yt=/^yt$/i.test(clean(a.clase));
  let numero=clean(a.numeroClase||a.numeroYT);
  let marca=clean(a.marcaActual||a.marcaInterna);
  const equivalencia=clean(a.numeroMarcaActual||a.marcaAnterior);
  const orden=clean(a.orden);
  if(yt){
    // NÚMERO DE CLASE puede ser la serie normal 45, 60... o una serie independiente P1, P2...
    // Una marcación romana (XLV, LX...) nunca debe ocupar este campo.
    if(romanToInt(numero)) numero=isNum(orden)?orden:(isNum(equivalencia)?equivalencia:'');
    else if(numero && !isNum(numero) && !isClassNo(numero)) numero=isNum(orden)?orden:(isNum(equivalencia)?equivalencia:numero);
    if(!numero) numero=isNum(orden)?orden:(isNum(equivalencia)?equivalencia:'');
    if(!marca && a.numeroYT && romanToInt(a.numeroYT)) marca=clean(a.numeroYT);
  }
  return {numeroClase:numero,marcaActual:marca,numeroMarcaActual:equivalencia};
}
window.SKAssetFields={canonical,numero:a=>canonical(a).numeroClase,marca:a=>canonical(a).marcaActual};
async function migrate(){
  if(typeof all!=='function'||typeof put!=='function')return;
  const rows=await all('assets');let changed=false;
  for(const a of rows){
    const c=canonical(a),patch={};
    if(c.numeroClase&&a.numeroClase!==c.numeroClase)patch.numeroClase=c.numeroClase;
    if(c.marcaActual&&a.marcaActual!==c.marcaActual)patch.marcaActual=c.marcaActual;
    if(c.numeroMarcaActual&&a.numeroMarcaActual!==c.numeroMarcaActual)patch.numeroMarcaActual=c.numeroMarcaActual;
    if(c.numeroClase&&a.numeroYT!==c.numeroClase)patch.numeroYT=c.numeroClase;
    if(c.marcaActual&&a.marcaInterna!==c.marcaActual)patch.marcaInterna=c.marcaActual;
    if(c.numeroMarcaActual&&a.marcaAnterior!==c.numeroMarcaActual)patch.marcaAnterior=c.numeroMarcaActual;
    if(Object.keys(patch).length){await put('assets',{...a,...patch,updatedAt:now(),syncState:'pending'});changed=true}
  }
  if(changed){await refresh();if(window.refreshConsumptionMachines)await window.refreshConsumptionMachines();window.dispatchEvent(new CustomEvent('skweb-assets-normalized'))}
}
window.addEventListener('load',()=>setTimeout(migrate,1450));
})();