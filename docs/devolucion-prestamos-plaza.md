# Préstamos y retorno de elementos en Plaza Blending

En **HACER REGISTROS** se conservan **REGISTRAR INGRESOS** y
**REGISTRAR ENTREGAS**. Debajo aparece el título **PRÉSTAMOS**, con los botones
**PRESTAR ELEMENTOS** y **RETORNO DE ELEMENTOS**, agrupados en una sección.

Prestar muestra únicamente criterios activos con el permiso existente
`allowLoan` (Préstamos). Incluye activos fijos y elementos controlados por
cantidad. Los activos se seleccionan individualmente; las cantidades enteras
o fraccionadas dependen del criterio. Entregas conserva su flujo, con asignación
automática para activos y sin el selector ASIGNACIÓN / PRÉSTAMO.

En Retorno, buscar por elemento, marca, serial, nombre o documento. Seleccionar
el préstamo y confirmar quién devuelve, fecha/hora y observaciones. El bodeguero
que recibe se toma de la sesión. Se retorna la cantidad total del registro de
préstamo seleccionado, mostrada antes de confirmar.

La consulta **HACER CONSULTAS → PRÉSTAMOS Y DEVOLUCIONES** incluye préstamos
antiguos sin el límite de siete días de Entregas recientes. Los estados son
PENDIENTE, DEVUELTO y, en TODOS, REVISAR cuando hay un movimiento o ubicación
posterior incompatible. Las asignaciones y entregas sin tipo no se convierten
automáticamente en préstamos.

El registro se guarda primero en el dispositivo. Devuelve el activo a Bodega
de Superficie o repone la cantidad prestada en existencias, permitiendo otra
entrega. La base central valida el permiso del criterio al prestar y el préstamo
original, cantidad, persona y ubicación al retornar, bajo su bloqueo habitual.
Desactivar préstamos en el criterio no impide cerrar los préstamos pendientes.
Reintentar el mismo `id`/`syncEventId` no modifica otra vez el inventario.

La devolución es un evento en `blendingDeliveries` con
`movementType: 'DEVOLUCIÓN'` y `loanId`, sin borrar ni reemplazar el préstamo.
No crea otro activo; para elementos por cantidad suma únicamente lo prestado.
Se ve en movimientos de Admin; en Plaza, el historial y los informes indican el retorno
del préstamo original sin contar una segunda entrega.

## Publicación

1. Actualizar `backend/apps-script/Code.gs` en el proyecto existente de Apps
   Script y publicar **una nueva versión de la misma implementación**. Conservar
   la URL, propiedades y credenciales existentes.
2. Comprobar que una sincronización de Plaza devuelve
   `capabilities.inventoryLoansV1: true`.
3. Incorporar el cambio web a `main` y esperar GitHub Pages. En la app pulsar
   SINCRONIZAR para actualizar su caché.

Antes de enviar préstamos o retornos, la app consulta esa capacidad. Si el servicio
todavía es anterior, conserva toda la cola local y muestra el motivo; no envía
una devolución que el servicio antiguo pudiera interpretar como entrega.

## Validación

`node --test tests/*.test.cjs`

Pruebas del menú agrupado, permiso de criterio, fraccionamiento, existencias,
autoría, reintentos, préstamo/retorno/nuevo préstamo
en un lote offline, competencia entre dispositivos, fecha y referencias
inválidas, ausencia de escrituras parciales, guardado local fallido, protección
del servicio anterior y conservación de registros creados durante una
sincronización. Sin datos ni escrituras en la base real.

La comprobación visual en Chromium no se pudo ejecutar en este entorno: el
arranque requiere permisos de sockets que la política de ejecución rechaza.
