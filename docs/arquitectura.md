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
