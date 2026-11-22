# SK Web

## Abrir las aplicaciones

| Aplicación | Acceso directo |
| --- | --- |
| SK Admin | [Abrir SK Admin](https://controlesmineras.github.io/SK-Web/) |
| Plaza Blending | [Abrir Plaza Blending](https://controlesmineras.github.io/SK-Web/plaza/) |

Sistema web de inventario y control de activos SK 3.7.

Primera etapa: aplicación local-first para tablet con Personal, registro de activos fijos, novedades administrativas y consumo de repuestos YT/Columnas. La operación se almacena en IndexedDB para funcionar sin conexión; un servicio privado sincroniza automáticamente con Google Drive `appDataFolder` sin solicitar una cuenta de Google al operario.

## Estado
- Interfaz inicial: implementada.
- Almacenamiento local IndexedDB: implementado.
- Operación offline entre módulos: implementada.
- Sincronización automática mediante puente Apps Script: implementada; pendiente desplegar el servicio y pegar su URL en `sync-config.js`.
- Prueba alternativa con Google Sheets: prevista posteriormente.

Proyecto estudiado, diseñado y desarrollado por **Nelson Castellanos C.-Huy Sano**.

## Plaza Blending

La aplicación operativa independiente vive en `/plaza/` y comparte `sk-web-central.json` con SK Web. El servidor limita Plaza a lectura operativa y escritura exclusiva de ingresos y entregas.


## Consulta de documentos en Admin

Hacer consultas → Consultar documentos · Actas y oficios muestra los registros existentes en una pantalla de solo lectura. Incluye un selector ACTAS/OFICIOS, con ACTAS seleccionado inicialmente, búsqueda por número (exacto), área, motivo, asunto o destinatario, y fechas desde/hasta opcionales e inclusivas. Las actas se ordenan por consecutivo de mayor a menor; los oficios, por fecha de origen del más antiguo al más reciente (los que no tienen fecha aparecen al final). Se usa la fecha del documento, no la de carga o sincronización. Limpiar filtros conserva el tipo seleccionado. Las actas anteriores sin campo tipo siguen apareciendo como actas.

Cada resultado muestra número, fecha y los datos propios del tipo, además de Abrir acta/oficio cuando tiene un enlace HTTP(S) válido. Sin enlace o con enlace inválido se informa claramente. La consulta no permite editar ni crear documentos; el registro existente permanece en Hacer registros. Está disponible para el administrador principal y los auxiliares, con la sesión habitual. Lee la misma base local y se actualiza tras sincronizar; consultar registros funciona sin conexión, pero abrir enlaces externos puede requerir internet. No cambia la numeración, el almacenamiento ni Code.gs.


## Corrección de Consultar personal

La consulta crea su pantalla al cargar el módulo por primera vez, incluso si el evento de carga de la página ya ocurrió. Usa la conexión local declarada por app.js, conserva búsqueda por nombre/documento y los demás datos del colaborador, excluye registros eliminados y sigue siendo de solo lectura. Muestra el estado de carga o un error con posibilidad de reintento; se actualiza al quedar lista la base o terminar la sincronización. Un fallo de descarga del módulo permite reintentar desde el menú. No requiere cambios en Code.gs ni modifica fichas.


## Sincronización de colaboradores entre dispositivos

Plaza envía automáticamente los colaboradores después de guardarlos localmente. Conserva las ediciones pendientes ante fallas de red y las sincroniza antes de enviar entregas o ingresos. Las consultas de personal y la pantalla de inicio comprueban cambios cada minuto mientras la aplicación está visible, al volver a ella y al abrir la consulta (con un mínimo de 30 segundos entre intentos). La actualización periódica no interrumpe formularios de entrega, ingreso o edición de colaboradores. Admin también vuelve a consultar al regresar a la pestaña.

Los clientes solicitan una copia completa mientras el servicio no anuncie `collaboratorRevisionsV1`. Esto evita el antiguo «sin cambios» cuando una edición desde Plaza actualizaba una ficha sin cambiar la fecha global. La sincronización manual siempre solicita una copia completa. Por ello, la corrección del cliente funciona con el servicio Apps Script anterior.

`backend/apps-script/Code.gs` incluye una mejora adicional: cada modificación de un colaborador o de su acceso incrementa la revisión compartida y devuelve su fecha de modificación. Admin y Plaza pueden entonces reutilizar revisiones de forma segura. Publicar GitHub Pages **no despliega Apps Script**: para activar esta optimización del servidor hay que actualizar Code.gs y su implementación web por separado. No se necesita ese despliegue para que los clientes corregidos vuelvan a recibir las fichas.

Validación: pruebas automatizadas con bases sintéticas, ediciones desde dos Plazas, recepción en otra Plaza/Admin, compatibilidad con revisiones antiguas, revisión monotónica, conexión fallida, reintentos sin duplicar movimientos y edición local durante un envío. No se modificaron registros de producción para estas pruebas.

## Guardado offline de criterios de inventario

El formulario general guarda en IndexedDB únicamente la ficha del elemento. Los botones **PLAZA B.** y **PRODUCCIÓN**, debajo de la cabecera de criterios, abren el editor de cantidad de la bodega elegida. Si hay un criterio seleccionado, el editor lo conserva. Al seleccionar un activo fijo, la bodega muestra el total disponible calculado a partir de las fichas del dispositivo. Cada activo operativo disponible en esa bodega cuenta una vez. El total es de solo lectura. Los EPP se manejan en Plaza. El acceso anterior del auxiliar a las cantidades de Plaza se conserva.

Los ajustes pendientes guardan su bodega, el saldo observado y un identificador de operación. El servidor valida la revisión y conserva el movimiento y su recibo en el mismo archivo de la bodega. Una respuesta perdida se puede reintentar sin repetir el ajuste. La sincronización general de Admin incluye los saldos de Producción en la misma respuesta. Cada dispositivo conserva en IndexedDB los saldos de las dos bodegas. Después de la primera descarga, el servidor devuelve solo saldos modificados y retiros. El selector de Cantidades de Producción lista los elementos comunes que admiten cantidades desde que se crean y los repuestos del catálogo, incluso antes del primer movimiento. La opción «Ingresar saldo inicial» identifica los elementos que admiten apertura. Si la búsqueda que se trae del catálogo tiene una sola coincidencia, el editor abre esa ficha. Después de guardar un criterio, el botón PRODUCCIÓN lo abre directamente. El primer saldo queda pendiente hasta que la base central confirme el criterio y acepte el ajuste. Un registro rechazado queda disponible en los pendientes de Inicio. Los repuestos de Producción comparten el saldo de Mecánica.

Para activar la sincronización de estos botones, actualizar `backend/apps-script/Code.gs` y publicar una nueva versión de la implementación existente de Apps Script, conservando su URL. Luego usar **Actualizar app** en Admin.

## Activos cuyo criterio no usa serial

En Admin, si el criterio de la clase tiene «Usa serial» desactivado, el alta y la edición permiten dejar vacíos serial y marca anterior. Se mantienen el ID del registro, el número de clase y la identificación interna correspondiente. Si se proporciona un serial, sigue comprobándose que no esté duplicado.

La misma condición se aplica al validar las altas del administrador y del auxiliar en el servidor. Para aceptar estos registros al sincronizar es necesario copiar la versión actual de `backend/apps-script/Code.gs` a Apps Script y actualizar su implementación web; la publicación de GitHub Pages por sí sola no despliega ese servidor. Las pruebas cubren criterios con/sin serial, el cambio de criterio y alta en un mismo envío, duplicados y rechazo de un criterio ajeno a la clase.

## Accesorios opcionales de activos fijos

En Criterios de inventario, «Permite registrar accesorios» aparece solo al activar «Es activo fijo». Se deja desactivado inicialmente. Para una clase habilitada, la ficha de cada activo muestra «¿Trae accesorios?» con Sin especificar / Sí / No. Responder y describir accesorios es opcional. Sí permite añadir descripciones independientes con «+ Agregar accesorio» y quitarlas. Las filas vacías se omiten. Cada descripción conserva un ID propio dentro del activo; no crea activos ni saldos adicionales.

Funciona al crear y al editar activos existentes y se guarda en la misma operación local del activo. Consultar activos fijos muestra los accesorios registrados. Desactivar la opción del criterio oculta la captura sin borrar accesorios existentes; siguen disponibles en la consulta. Se mantienen los permisos actuales de edición de activos.

Code.gs incluye los accesorios en la comprobación de reintentos de altas de auxiliares y admite huellas anteriores solo cuando las descripciones no cambiaron. Debe actualizarse la implementación web de Apps Script para activar esta comprobación; la publicación de Admin no despliega ese servidor.

## Serial obligatorio y ayuda en la ficha

Cuando el criterio usa serial, Admin exige completar Serial aunque se ingrese marca anterior. Admite el serial real o, como únicas descripciones de ausencia o ilegibilidad, «No trae» y «No visible». No acepta dejarlo vacío, espacios, «No aplica» ni las descripciones anteriores como «Sin serial» o «Serial ilegible». Los seriales reales conservan su formato libre y el control de duplicados; los dos textos permitidos pueden repetirse entre equipos. Mayúsculas y espacios de esos dos textos se normalizan al guardar desde Admin.

La “i” junto al campo despliega la explicación. «No trae» indica ausencia de serial; «No visible» incluye que no se vea o no se pueda leer. La marca anterior es opcional y no sustituye el serial. Las columnas y las clases cuyo criterio no usa serial pueden dejar ambos campos vacíos.

No se modifican los registros almacenados automáticamente. Al editar una ficha con la antigua excepción serialStatus, el formulario presenta «No trae» o «No visible» para guardarlo como texto. Los registros históricos permanecen consultables; las altas y ediciones deben cumplir la regla vigente.

Code.gs aplica la misma validación para administrador, auxiliar e ingresos de Plaza. Para activarla en el servidor hay que copiar `backend/apps-script/Code.gs` a Apps Script y actualizar la implementación web existente; publicar GitHub Pages no despliega ese servidor.

## Confirmación de marca anterior

La ficha incluye «¿Tiene marca anterior?», desmarcada al crear un activo. Al marcarla muestra MARCA ANTERIOR y exige un valor no vacío; al desmarcarla oculta el campo y permite guardar sin marca anterior. Desmarcar y volver a marcar conserva el texto en curso; guardar desmarcado elimina ese valor de la ficha. Al editar, una marca anterior existente activa la casilla automáticamente. Los auxiliares conservan la consulta sin edición.

Se utiliza el campo existente `marcaPrevia`; el estado de la casilla se deduce de su contenido y no agrega campos al servidor. No altera el número de marca actual de YT/columnas ni la regla del serial. Esta casilla no requiere otro cambio en Code.gs; sigue pendiente aplicar la versión del servidor indicada en el ajuste anterior de serial.

## Permisos de auxiliares en Activos fijos

Administrador y auxiliares pueden crear, editar y eliminar fichas, corregir la fecha de ingreso, gestionar accesorios, solicitar marca nueva y corregir marcas duplicadas. Las validaciones de seriales, marcas, duplicados y conservación de historial se mantienen. Los permisos de otros módulos y la administración de usuarios siguen siendo los existentes.

Para activar los permisos centrales, reemplazar `backend/apps-script/Code.gs` y publicar una nueva versión de la implementación existente de Apps Script, conservando la URL. Publicar GitHub Pages solo actualiza el cliente. Después, usar **Actualizar app** en los dispositivos.
## Rol Administrador en SK Web Admin

En **Usuarios Web Admin → Nuevo acceso**, selecciona el funcionario y el rol
**Auxiliar administrativo** o **Administrador** antes de generar el enlace.
En **Gestionar accesos** también puedes cambiar el rol; se aplica cuando el
funcionario usa el nuevo enlace. La cuenta conserva su identidad y los tokens
del rol anterior dejan de ser válidos en el servidor.

Administrador tiene los permisos administrativos de módulos y usuarios.
La cuenta principal sigue siendo independiente y no puede ser reemplazada,
modificada ni desactivada desde la administración de accesos. Se conserva el
requisito de pertenecer a Seguridad física para conceder acceso a Web Admin.

Para activar este cambio, reemplaza `backend/apps-script/Code.gs` en el servicio
central y publica una **nueva versión de la implementación existente**,
conservando la misma URL. Después pulsa **Actualizar app** en SK Web Admin.
GitHub Pages no despliega Apps Script. Si el servidor todavía no anuncia soporte
del nuevo rol, la interfaz muestra la instrucción de actualizar y no genera un
enlace de administrador.
