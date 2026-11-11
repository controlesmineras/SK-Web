# PROTOCOLO DE PRODUCCIÓN

Se adapta el flujo existente de Plaza Blending y SK Web Admin a la base independiente de Producción. No se cambia la sincronización de las otras dos apps.

| GARANTÍA | REFERENCIA EXISTENTE | APLICACIÓN EN PRODUCCIÓN |
| --- | --- | --- |
| Guardado local antes de confirmar | `plaza/plaza.js`, `persistLocalChange`; `inventory-admin.js`, `queueQuantity` | Una transacción de IndexedDB conserva el registro y su ID. Ingresos, consumos, borradores y correcciones se pueden guardar sin internet tras una primera descarga. |
| Confirmación individual | `docs/sincronizacion-plaza-confirmaciones.md` | `production-receipts-v1` responde `accepted`, `already-applied` o `rejected` por ID, después de guardar en Drive. Un rechazo no detiene movimientos independientes. |
| Conciliación segura | `plaza/plaza.js`, `reconcilePlazaSnapshot` | Se exige una respuesta completa, un recibo coherente y la misma versión local que fue enviada. Los cambios nuevos y los rechazados permanecen pendientes. |
| Corrección sobre un saldo observado | `inventory-admin.js`, `queueQuantity`; `adminSetInventoryQuantity_` | El ajuste lleva `baseQuantity`. El servidor compara ese saldo con el calculado bajo bloqueo antes de aplicar el objetivo. Si difiere, requiere revisión; el historial se conserva. |
| Reintentos y tiempos límite | `sync-api.js` | Una solicitud a la vez; reintento a partir de 60 segundos tras un fallo; reanudación al recuperar conexión o volver a la app; consulta periódica cada cinco minutos. El intercambio completo termina a los 45 segundos aunque fetch ignore abort. |
| Estado comprensible | Contador de pendientes en Plaza y Admin | “GUARDADO EN ESTE EQUIPO” es distinto de “CONFIRMADO EN LA BASE CENTRAL”. Los saldos locales afectados muestran PENDIENTE. Un rechazo conserva su motivo. |

## SALDOS LOCALES Y CONFLICTOS

Los movimientos pendientes se proyectan sobre el saldo descargado en su orden de registro. La apertura define la base del saldo local; se suman los ingresos y se restan los consumos. Los ajustes absolutos antiguos solo se conservan como historial. Un ajuste rechazado no altera la proyección del saldo confirmado y permanece disponible para revisar.

El servidor procesa hasta 1000 movimientos por solicitud. Valida cada operación antes de modificar los mapas en memoria y escribe la base una vez por solicitud; no clona ni escribe la base por cada registro. El cliente continúa con el siguiente lote sin reenviar los registros rechazados en cada intento.

Una corrección pendiente no se reemplaza silenciosamente. Si el servidor la rechaza, el administrador puede retirarla del equipo con RETIRAR AJUSTE RECHAZADO, revisar el saldo actualizado y guardar otra solicitud con un nuevo ID. No se elimina el historial central.

## DESPLIEGUE

1. Publicar `produccion/index.html`, `app.js`, `sync-protocol.js` y `sw.js`.
2. Reemplazar `backend/apps-script/Code.gs` en el proyecto central y publicar **una nueva versión de la implementación existente**, conservando su URL. Guardar el editor o publicar GitHub no actualiza la versión ejecutada en `/exec`.
3. Sincronizar Producción. El servicio debe devolver `stockAdjustmentLocalV1: true` y `syncProtocol: production-receipts-v1`.

Mientras el servidor siga en la versión anterior, las nuevas correcciones se guardan localmente y esperan la actualización; no se envían a un servidor que ignore la comprobación del saldo. Los clientes antiguos conservan la respuesta de todo o nada del servicio. Los ajustes antiguos que ya llegaron al servidor se confirman por su ID; si nunca llegaron y no tienen saldo observado, se conservan como rechazados para que el administrador los revise.

## VERIFICACIÓN

`node --test tests/production*.test.cjs`

Pruebas con datos ficticios y el código real de las funciones: 24→4→0, guardado offline, pérdida de respuesta, fallo de Drive, conflicto entre dispositivos, cambio local durante el envío, confirmaciones incompletas, rechazo independiente y cola de más de 1000 movimientos. Las pruebas no sustituyen verificar la versión de Apps Script desplegada en la cuenta.

## SALDO DE APERTURA

El formulario EXISTENCIAS → EDITAR SALDO DE APERTURA guarda `kind: initial`, exclusivo del administrador. La cantidad reemplaza la apertura del mismo repuesto e inventario; no genera un ingreso ni un ajuste absoluto. Admite cero y correcciones sucesivas, también sin conexión. Las correcciones pendientes reemplazan la versión local del mismo ID con un nuevo `correctionId`; una respuesta anterior no descarta una edición posterior.

Antes del primer cierre, saldo esperado = apertura + ingresos − consumos, incluyendo los movimientos ya registrados. Los ajustes absolutos de versiones anteriores conservan su historial, pero quedan excluidos de las existencias actuales y de los nuevos cierres. Un cierre aprobado sigue siendo la apertura del período siguiente; corregir la apertura inicial no modifica cierres aprobados. El conteo físico y el informe central usan la misma regla. Actualizar Code.gs es necesario para incluir en el cierre movimientos anteriores a la fecha de la apertura inicial.

## EDICIÓN Y ELIMINACIÓN DE INGRESOS

CONSULTAS → INGRESOS permite al administrador editar cantidad/fecha, eliminar de forma recuperable y revertir el cambio vigente durante 30 días. Cada operación requiere confirmación explícita y avisa del efecto en SALDO ESPERADO. La apertura se mantiene independiente. Los ingresos incluidos en cierres aprobados no admiten estos cambios.

Las operaciones se guardan en `incomeChanges` dentro de la misma cuenta de IndexedDB y se proyectan sobre el saldo local. Se envían únicamente cuando el servidor anuncia `incomeChangesV1`. Los recibos se validan contra el historial confirmado, después de escribir Drive. Cada operación tiene ID y versión de ingreso observada: los reintentos no duplican cambios y un conflicto de versión se conserva rechazado para revisión. No se ejecuta ninguna limpieza automática de ingresos existentes.

`incomeHistory` conserva antes/después y la operación; la interfaz muestra los últimos 30 días. Un borrado marca `deleted`, conservando el registro recuperable. Revertir recupera la cantidad y fecha previas; no puede sobrescribir un cambio posterior ni modificar un cierre aprobado. El registro central de auditoría no se purga automáticamente. Es necesario reemplazar Code.gs y publicar una nueva versión de la implementación existente para habilitar la confirmación central de estas operaciones.

Los rechazos se distinguen de los registros por enviar. El botón REVISAR CAMBIOS RECHAZADOS abre el registro temporal y muestra la versión central junto al cambio solicitado. El administrador puede retirar uno o todos los rechazos revisados, con confirmación; únicamente se quitan operaciones locales que siguen rechazadas y coinciden con la versión revisada. Los ingresos, consumos, conteos, historial y operaciones nuevas se conservan. Después se programa otra sincronización. La cabecera muestra la fecha de los datos descargados con la etiqueta Datos mientras queden operaciones pendientes; `lastSyncAt` sigue reservada para una sincronización completa. Esta mejora de revisión solo requiere actualizar la app.

## MOVIMIENTOS REALES Y AJUSTES

La fórmula vigente es SALDO ESPERADO = SALDO DE APERTURA + INGRESOS − CONSUMOS. Los registros `adjustment`, positivos, negativos o pendientes, no participan en ese saldo ni en las existencias de los selectores. Se conservan como historial. La columna AJUSTES permanece oculta en la tabla y las exportaciones.

La misma fórmula se aplica al conteo local, a la vista previa de apertura y a los nuevos cierres centrales. Una apertura de 4 con cero ingresos y consumos resulta en 4 aunque exista un ajuste antiguo de −10. Los cierres ya aprobados conservan sus cifras y su saldo físico de cierre sigue siendo la apertura del siguiente período.

Actualizar la app corrige el saldo local; publicar el Code.gs actualizado en la implementación existente aplica la fórmula a los próximos cierres.
