# Ingresos de activos: registro, origen y marcación

El formulario de Plaza Blending ofrece ACTIVO NUEVO (nuevo o no registrado) y ACTIVO REGISTRADO (buscar por marca, serial o número de clase). Las altas solicitan únicamente los campos habilitados en Criterios de inventario.

Para YT y columnas, TIPO DE INGRESO y MINA DE ORIGEN son obligatorios:

- TRASLADO: el activo queda asignado a Sandra K.
- REPARACIÓN: conserva la mina propietaria. Si pertenece a otra mina, el ingreso es temporal. Su estado pasa a En reparación.

Cada movimiento conserva `incomeType` y `originMine`; la ficha guarda `mina` (propietaria actual), `minaOrigen` (origen inicial), `ultimaMinaOrigen`, `ultimoTipoIngreso` e `ingresoTemporal`. La fecha de ingreso inicial permanece intacta al registrar retornos.

## Marcas permanentes

| Alta | Marcación |
| --- | --- |
| Asignada a Sandra K | Secuencia general de tres letras |
| Reparación de Providencia | P-AA, P-AB… |
| Reparación de El Silencio | S-AA, S-AB… |
| Reparación de Carla | C-AA, C-AB… |
| Reparación de Alianza | L-AA, L-AB… |

Cada prefijo permite 676 combinaciones A–Z sin Ñ. Se saltan códigos existentes, incluso de activos retirados. El guion separa ambas secuencias: PAA puede pertenecer a Sandra K y P-AA a Providencia. Sandra K no necesita saltar prefijos; solo códigos exactos ya utilizados. Todas las marcas ya emitidas se conservan. Si hubiera marcas externas anteriores sin guion, su sufijo permanece reservado para esa mina y el código exacto también permanece ocupado. Las nuevas secuencias por mina no adelantan la secuencia general. La asignación se realiza en el servidor bajo bloqueo; no se emiten códigos definitivos sin conexión.

Los activos registrados mantienen su código y serial en cada regreso. Si luego se trasladan definitivamente a Sandra K, conservan la marca física anterior y se actualiza la mina propietaria. No se remarca el inventario existente.

## Activación del servicio central

1. Reemplazar el contenido de Code.gs del servicio compartido SK Web / Plaza Blending con `backend/apps-script/Code.gs` de esta versión y guardar.
2. En Implementar → Administrar implementaciones, editar la implementación web existente, seleccionar Nueva versión y pulsar Implementar. Mantener la URL y las propiedades del script.
3. Recargar y sincronizar Plaza Blending. La respuesta `plazaSync` anuncia `capabilities.externalIncomeV1` y `externalMarkSeparator: "-"`, y activa la marcación por origen.

Hasta actualizar el servicio, el formulario conserva el tratamiento de marca manual definido por los criterios para YT/columnas; no envía solicitudes de marcación que el servidor anterior no puede asignar. Las altas nuevas y los movimientos incluyen el origen. La actualización central también es necesaria para aplicar tipo, origen y propiedad a las fichas de activos que ya estaban registrados.

## Comprobación

`node --test tests/*.test.cjs` verifica secuencias, prefijos, agotamiento, reintentos, retornos, propiedad, compatibilidad y rechazo sin escrituras parciales. Los flujos del formulario también se comprobaron en Chromium con datos ficticios y sin escrituras al servicio real.
