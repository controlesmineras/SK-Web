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

Los movimientos pendientes se proyectan sobre el saldo descargado en su orden de registro. Un ajuste fija el saldo local solicitado; los consumos posteriores se descuentan de él. Un ajuste rechazado no altera la proyección del saldo confirmado y permanece disponible para revisar.

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
