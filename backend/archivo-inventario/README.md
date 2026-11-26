# Histórico de inventario en SQLite

La copia lee los archivos de Drive ya guardados por el servicio central. Respalda movimientos de Plaza, novedades de activos, ajustes e historial de movimientos de Producción. Los saldos, el personal, los criterios de inventario, las fichas y los préstamos abiertos siguen a cargo de las apps. El archivo SQLite conserva las cantidades, horas, responsables y referencias presentes en el movimiento original. La columna datos conserva el registro completo, incluso los campos antiguos o específicos de una bodega.

## Activación en Google Drive

1. Abre la [página del histórico de inventario](https://controlesmineras.github.io/SK-Web/produccion/copiar-historial.html) y pulsa **Copiar código**. Si usas Historial-SQLite.zip, puedes descomprimirlo y copiar el contenido de Codigo.gs con un editor de texto.
2. Con la cuenta que administra el Drive de inventario, crea un **proyecto nuevo** en Google Apps Script. Llámalo «Histórico de inventario». Pega el contenido de Codigo.gs en el editor y guarda el proyecto. El motor SQLite viene incluido.
3. En el selector de funciones ejecuta **activarHistorialInventario** y concede los permisos de Drive y de creación de un activador. Esta función hace la primera copia y programa una actualización cada hora. Si ya existe el activador, lo reutiliza. Para hacer solo una copia de prueba, ejecuta **copiarHistorialConfirmado**.
4. En Drive abre **SK - Histórico de inventario SQLite**. Encontrarás archivos separados para la base central y para Producción. El registro de ejecución muestra el ID de la copia vigente y cuántas filas leyó, incorporó, actualizó u omitió.

Por defecto se busca exactamente un sk-web-central.json y un sk-web-production.json. Si hay varios con el mismo nombre, configura en las propiedades del proyecto ARCHIVO_CENTRAL_ID y ARCHIVO_PRODUCCION_ID con los ID de los dos archivos oficiales. El proyecto recuerda los ID al identificarlos por primera vez. El acceso de la carpeta de salida debe ser privado.

## Verificación

Cada fila se identifica por la bodega, la serie y el ID original. Dos entregas confirmadas con IDs distintos quedan por separado, aunque coincidan persona, cantidad y hora. La reversión se conserva con su referencia al original y los saldos que aplicó la app. Un reintento de copia con el mismo contenido conserva una sola fila. En Producción, Mecánica guarda algunos registros confirmados sin etiqueta de sincronización. Solo se admiten las formas que genera el servidor. Las filas con confirmación ambigua se omiten y entran en el contador «omitidos».

Antes de cambiar la copia vigente, el proceso comprueba la integridad SQLite y relee en Drive la huella SHA-256 de la nueva versión. Mantiene también la versión anterior. Una interrupción puede dejar un archivo adicional en la carpeta. El ID registrado en la propiedad SQLITE_COPIA_central o SQLITE_COPIA_produccion identifica la copia verificada. Los registros que ya estén en el archivo se conservan incluso si desaparecen del JSON de entrada.

Esta primera etapa es de copia. El recorte de dos meses está pendiente de comprobar contra los datos reales qué préstamos, novedades y movimientos necesitan las apps para sus consultas, fichas y existencias. El JSON operativo mantiene su historial completo durante esa verificación.

## Código y pruebas

Con Node.js 22.13 o posterior, ejecuta npm ci, npm test y npm run build en esta carpeta. El empaquetado usa Python 3. La versión de sql.js está fijada en package-lock.json. El proyecto de Apps Script funciona sin servicios externos de base de datos.
