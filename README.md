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

Al guardar un criterio, Admin confirma en una sola transacción local el criterio, su saldo y, si corresponde, el ingreso inicial. Después limpia el formulario tanto al crear como al editar. El doble toque no genera dos altas. Si falla la escritura, conserva el formulario, revierte la operación completa y muestra el error.

El contador se actualiza después de confirmar el guardado, incluye nuevos registros y modificaciones y conserva el número visible sin conexión, durante el envío o ante un error de sincronización. Cuenta registros pendientes: un elemento con cantidad inicial puede producir tres pendientes (criterio, saldo e ingreso inicial).

Los datos locales incluyen lo recibido en la última sincronización y lo registrado en ese dispositivo. Los cambios de otros dispositivos se reciben al sincronizar. Las altas y ediciones realizadas durante un envío se conservan pendientes; una respuesta anterior no las sobrescribe ni las da por enviadas. La reconexión inicia el envío automático con la sesión autorizada habitual. Esta corrección es del cliente y no requiere actualizar Code.gs.

## Activos cuyo criterio no usa serial

En Admin, si el criterio de la clase tiene «Usa serial» desactivado, el alta y la edición permiten dejar vacíos serial y marca anterior. Se mantienen el ID del registro, el número de clase y la identificación interna correspondiente. Si se proporciona un serial, sigue comprobándose que no esté duplicado.

La misma condición se aplica al validar las altas del administrador y del auxiliar en el servidor. Para aceptar estos registros al sincronizar es necesario copiar la versión actual de `backend/apps-script/Code.gs` a Apps Script y actualizar su implementación web; la publicación de GitHub Pages por sí sola no despliega ese servidor. Las pruebas cubren criterios con/sin serial, el cambio de criterio y alta en un mismo envío, duplicados y rechazo de un criterio ajeno a la clase.

## Accesorios opcionales de activos fijos

En Criterios de inventario, «Permite registrar accesorios» aparece solo al activar «Es activo fijo». Se deja desactivado inicialmente. Para una clase habilitada, la ficha de cada activo muestra «¿Trae accesorios?» con Sin especificar / Sí / No. Responder y describir accesorios es opcional. Sí permite añadir descripciones independientes con «+ Agregar accesorio» y quitarlas. Las filas vacías se omiten. Cada descripción conserva un ID propio dentro del activo; no crea activos ni saldos adicionales.

Funciona al crear y al editar activos existentes y se guarda en la misma operación local del activo. Consultar activos fijos muestra los accesorios registrados. Desactivar la opción del criterio oculta la captura sin borrar accesorios existentes; siguen disponibles en la consulta. Se mantienen los permisos actuales de edición de activos.

Code.gs incluye los accesorios en la comprobación de reintentos de altas de auxiliares y admite huellas anteriores solo cuando las descripciones no cambiaron. Debe actualizarse la implementación web de Apps Script para activar esta comprobación; la publicación de Admin no despliega ese servidor.

## Serial como texto libre

La ficha de Admin vuelve a tener únicamente el campo Serial, sin el selector «Situación del serial». Permite escribir el serial real o una descripción como «No trae» o «No visible». Estas descripciones se guardan tal como se escriben y no exigen marca anterior. Si el criterio no usa serial, ambos campos siguen siendo opcionales.

Las descripciones de ausencia o ilegibilidad («No trae», «No trae serial», «No visible», «No es visible», «Sin serial», «Serial ilegible», «Ilegible», «No tiene» y «No tiene serial») pueden repetirse entre equipos sin tratarse como seriales únicos. Los seriales reales y las marcas anteriores conservan sus controles de duplicados.

Los registros y pendientes creados con el selector anterior se conservan compatibles. Al abrir uno de esos activos, su motivo aparece como texto editable; al guardar se conserva en Serial y se limpia la antigua excepción. No se cambia la información almacenada hasta guardar la ficha.

El retiro del selector queda disponible con la actualización de Admin. Para que el servidor admita estas descripciones repetidas al sincronizar, hay que copiar `backend/apps-script/Code.gs` a Apps Script y actualizar la implementación web; publicar GitHub Pages no despliega ese servidor.
