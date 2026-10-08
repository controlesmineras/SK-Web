# Devolución de activos prestados en Plaza Blending

Desde **HACER REGISTROS → DEVOLVER ACTIVO**, buscar por clase, marca, serial,
nombre o documento. Seleccionar el préstamo y confirmar quién devuelve,
fecha/hora y observaciones. El bodeguero que recibe se toma de la sesión.

La consulta **HACER CONSULTAS → PRÉSTAMOS Y DEVOLUCIONES** incluye préstamos
antiguos sin el límite de siete días de Entregas recientes. Los estados son
PENDIENTE, DEVUELTO y, en TODOS, REVISAR cuando hay un movimiento o ubicación
posterior incompatible. Las asignaciones y entregas sin tipo no se convierten
automáticamente en préstamos.

El registro se guarda primero en el dispositivo. Devuelve la ubicación a
Bodega de Superficie y permite otra entrega. La base central valida el préstamo
original, activo, cantidad, persona y ubicación bajo su bloqueo habitual.
Reintentar el mismo `id`/`syncEventId` no modifica otra vez el inventario.

La devolución es un evento en `blendingDeliveries` con
`movementType: 'DEVOLUCIÓN'` y `loanId`, sin borrar ni reemplazar el préstamo.
No aumenta existencias de consumibles ni crea otro activo. Se ve en movimientos
de Admin; en Plaza, el historial y los informes de entrega indican la devolución
del préstamo original sin contar una segunda entrega.

## Publicación

1. Actualizar `backend/apps-script/Code.gs` en el proyecto existente de Apps
   Script y publicar **una nueva versión de la misma implementación**. Conservar
   la URL, propiedades y credenciales existentes.
2. Comprobar que una sincronización de Plaza devuelve
   `capabilities.loanReturnsV1: true`.
3. Incorporar el cambio web a `main` y esperar GitHub Pages. En la app pulsar
   SINCRONIZAR para actualizar su caché.

Antes de enviar devoluciones, la app consulta esa capacidad. Si el servicio
todavía es anterior, conserva toda la cola local y muestra el motivo; no envía
una devolución que el servicio antiguo pudiera interpretar como entrega.

## Validación

`node --test tests/*.test.cjs`

Pruebas de devolución, autoría, reintentos, préstamo/devolución/nuevo préstamo
en un lote offline, competencia entre dispositivos, fecha y referencias
inválidas, ausencia de escrituras parciales, guardado local fallido, protección
del servicio anterior y conservación de registros creados durante una
sincronización. Sin datos ni escrituras en la base real.

La comprobación visual en Chromium no se pudo ejecutar en este entorno: el
arranque requiere permisos de sockets que la política de ejecución rechaza.
