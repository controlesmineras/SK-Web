# Arquitectura SK Web

## Principio
SK Web es **local-first**. La tablet trabaja contra IndexedDB y no necesita Internet para consultar o registrar información ya disponible localmente.

Flujo: `Interfaz -> IndexedDB local -> sincronización automática -> servicio SK Web -> Google Drive appDataFolder`.

La sincronización remota se implementará como capa separada para poder comparar posteriormente appDataFolder con Google Sheets sin reescribir los módulos.

## Módulos primera etapa
- Personal.
- Registro de activos fijos.
- Novedades administrativas de activos.
- Consumo de repuestos YT/Columnas.

## Reglas críticas
- Una YT/Columna creada offline queda disponible inmediatamente para consumo de repuestos.
- INVENTARIO ORIGEN (YT28/YT29), no MODELO, determina el catálogo de repuestos y el inventario que se descuenta.
- MODELO es informativo y propone el inventario origen inicial.
- Bodeguero y Bodeguera son equivalentes funcionalmente para seleccionar responsables.
- Responsable predeterminado: Juan Fernando Echevarría Castrillón, documento 1046903159, cuando exista en Personal y tenga cargo Bodeguero/Bodeguera.
- Todo activo nuevo entra inicialmente a Bodega de Superficie.
- MARCA INTERNA nueva: tres letras, generada automáticamente; MARCA ANTERIOR conserva la marcación histórica.
- Las novedades especiales de activos recibidos para reparación se muestran únicamente para YT/Columnas.
- Estados: Operativo/a, Averiado/a, En reparación, No apareció, Por dar de baja, Dado/a de baja, Extraviado/a.

## Sincronización
Cada registro local tiene ID único, createdAt, updatedAt y syncState. El servicio concilia cada ID, conserva el `updatedAt` más reciente y usa un bloqueo para impedir escrituras simultáneas. La app sincroniza al abrir, al recuperar Internet, después de registrar y periódicamente. Si falla la red, conserva la operación en IndexedDB para el siguiente intento.

## Marcación automática de activos nuevos

Los registros nuevos de SK Admin y Plaza solicitan una marca global de tres letras: AAA, AAB, …, AAZ, ABA, …, ZZZ. El alfabeto es A–Z, sin Ñ. Autorrescatadores, YT y columnas están excluidos. Los activos que ya existían conservan su marcación.

En Ingresos de Plaza, la clase seleccionada limita la búsqueda por serial, marca o número de clase. Si no hay coincidencias aparece **REGISTRAR ACTIVO**, que lleva el serial buscado al formulario nuevo. La búsqueda incluye activos que ya están en bodega o dados de baja para identificarlos y evitar registrar duplicados; los disponibles para regresar se pueden seleccionar directamente.

Apps Script asigna la marca durante la sincronización, bajo el mismo bloqueo que guarda los datos. `assetMarkRegistry` conserva cada marca emitida por ID de activo aunque el activo se elimine; el cliente no puede sobrescribir este registro. También se reservan las marcas de tres letras que ya figuren en el inventario. Los reintentos no consumen otra marca. Si se agotan las combinaciones, el servicio rechaza la operación sin guardar parcialmente el lote.

El activo nuevo lleva `markingPolicy: letters-v1` y `markStatus: pending` hasta recibir confirmación central. La marca asignada se guarda en `marcaInterna`, `marcaActual` y `nuevaMarca`; el número de clase sigue siendo independiente. Sin conexión se permite registrar, pero no se muestra una marca provisional para pintar. Al sincronizar aparece un diálogo persistente con el nombre, la marca, el número de clase y el serial del activo. Las notificaciones pendientes sobreviven a la recarga del dispositivo que hizo el registro.

**Despliegue:** además de publicar los archivos web, se debe actualizar `backend/apps-script/Code.gs` en la implementación activa de Apps Script. Una vez actualizado, el servicio completa las solicitudes de marca que se hubieran guardado con la versión anterior al siguiente sincronizar. La publicación en GitHub Pages por sí sola no actualiza Apps Script.
