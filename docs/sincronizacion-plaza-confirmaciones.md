# Confirmación individual de movimientos de Plaza Blending

La app solicita `plaza-receipts-v1`. El servidor responde con un recibo por ID: `accepted`, `already-applied` o `rejected`, con motivo en los rechazados. Una confirmación de éxito se emite después de guardar la base central. Los reintentos conservan IDs y no vuelven a modificar existencias.

Se eliminó la deduplicación por similitud en 15 segundos y el veto local de entregas similares en 60 segundos. Dos operaciones nuevas pueden tener los mismos datos. El botón bloquea el envío mientras guarda y el formulario se vacía tras el guardado; un nuevo registro recibe IDs nuevos.

Cada lote creado con un mismo `syncEventId` conserva atomicidad, junto con sus activos nuevos. Si falla, no se aplica parcialmente ni consume marcas. Los lotes independientes válidos avanzan. Los clientes anteriores, que no solicitan el protocolo, mantienen el comportamiento de todo o nada para evitar que descarten registros ante una respuesta parcial.

La app exige una respuesta completa y recibos coherentes. Con el servidor anterior solo considera confirmados los IDs presentes en su respuesta completa. Los omitidos se conservan pendientes. Los errores de colaboradores también se conservan y no detienen movimientos independientes. Las consultas muestran el estado pendiente y su motivo; una sincronización parcial no se presenta como completa.

## Despliegue

1. Publicar los archivos de Plaza y su service worker en GitHub Pages.
2. Aplicar `backend/apps-script/Code.gs` al proyecto central de Apps Script, revisar las diferencias con el código desplegado y publicar una nueva versión de la implementación existente, conservando su URL.
3. Comprobar en la respuesta del servicio `movementReceiptsV1: true` e `independentMovementGroupsV1: true` antes de dar por activa la corrección completa.

Actualizar GitHub no actualiza Apps Script. Durante la transición, la app nueva conserva los movimientos que el servidor anterior no confirma; el avance independiente de lotes y la eliminación de la regla central de similitud necesitan la versión nueva del servicio.

## Verificación

`node --test tests/plaza-sync-receipts.test.cjs tests/plaza-return-sync.test.cjs`

Incluye movimientos legítimos iguales, repetición del mismo ID, respuesta perdida después de guardar, fallo de Drive, respuesta incompleta, recibos contradictorios, servidor antiguo, cambios locales durante el envío, colaboradores rechazados, lotes independientes y reversión de un alta de activo fallida. Se ejecuta con datos ficticios y servicios simulados; no representa una tasa de fallos en producción.

La suite general conserva cinco fallos preexistentes en pruebas de activos: tres expectativas antiguas del texto del error de serial repetido y dos fixtures sin serial ni marca anterior. Se reprodujeron también con el código original antes de esta corrección.
