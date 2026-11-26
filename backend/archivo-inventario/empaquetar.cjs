const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {transformSync} = require('esbuild');

function programa() {
  const raiz = path.resolve(path.dirname(require.resolve('sql.js')),'..');
  // El editor de Apps Script rechaza las asignaciones lógicas y los campos de clase del motor.
  const opciones = {target: 'es2019', charset: 'utf8'};
  const motor = transformSync(fs.readFileSync(path.join(raiz, 'dist/sql-asm-memory-growth.js'), 'utf8'), {
    ...opciones, minifyWhitespace: true, lineLimit: 1024
  }).code;
  const archivador = transformSync(fs.readFileSync(path.join(__dirname, 'ArchivoInventario.gs'), 'utf8'), opciones).code;
  const licencia = fs.readFileSync(path.join(raiz, 'LICENSE'), 'utf8');
  // Adaptadores locales para V8 de Apps Script. La distribución de SQLite va completa, sin descargas ni eval.
  return archivador + `
/* sql.js ${JSON.parse(fs.readFileSync(path.join(raiz,'package.json'),'utf8')).version}
${licencia} */
function motorArchivoInventario_() {
  const performance = {now: () => Date.now()};
  const TextDecoder = globalThis.TextDecoder || class {
    decode(bytes) {
      const signed = new Int8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      return Utilities.newBlob(Array.from(signed)).getDataAsString('UTF-8');
    }
  };
  const crypto = globalThis.crypto || {getRandomValues(bytes) {
    for (let i=0; i<bytes.length;) {
      const digits=Utilities.getUuid().replace(/-/g,'');
      for (let j=0; j<digits.length && i<bytes.length; j+=2) bytes[i++]=parseInt(digits.slice(j,j+2),16);
    }
    return bytes;
  }};
${motor}
  return initSqlJs();
}
`;
}

module.exports = {programa};
if (require.main === module) {
  const directorio = fs.mkdtempSync(path.join(os.tmpdir(),'sk-sqlite-'));
  try {
    fs.writeFileSync(path.join(directorio,'Codigo.gs'), programa());
    fs.copyFileSync(path.join(directorio,'Codigo.gs'),path.join(__dirname,'codigo-apps-script.txt'));
    fs.copyFileSync(path.join(__dirname,'README.md'),path.join(directorio,'Instrucciones.txt'));
    const salida=path.join(__dirname,'Historial-SQLite.zip');
    execFileSync('python3',['-c',`import sys, zipfile, pathlib
with zipfile.ZipFile(sys.argv[1], 'w') as arc:
 for name in ('Codigo.gs','Instrucciones.txt'):
  entry=zipfile.ZipInfo(name)
  entry.compress_type=zipfile.ZIP_DEFLATED
  arc.writestr(entry, pathlib.Path(sys.argv[2],name).read_bytes())
`,salida,directorio]);
  } finally {fs.rmSync(directorio,{recursive:true,force:true});}
}
