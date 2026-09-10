# Arquitectura SK Web

## Principio
SK Web es **local-first**. La tablet trabaja contra IndexedDB y no necesita Internet para consultar o registrar información ya disponible localmente.

Flujo: `Interfaz -> IndexedDB local -> botón Sincronizar -> Google Drive appDataFolder`.

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
Cada registro local tiene ID único, createdAt, updatedAt y syncState. La primera versión operará con una tablet por bodega, por lo que no se implementará todavía resolución avanzada de conflictos multidispositivo.

La sincronización es bidireccional: descarga la base central, concilia cada registro por ID y fecha de actualización, protege los registros locales, sube la versión unificada y solo entonces marca los pendientes como sincronizados. La interfaz muestra por separado registros enviados y cambios recibidos.

## Usuarios y auditoría
- Los usuarios se vinculan con registros existentes de Personal.
- El PIN se almacena mediante PBKDF2-SHA-256 con una sal aleatoria; nunca se guarda el PIN legible.
- Los roles iniciales son Administrador y Operador.
- Cada creación conserva `createdBy` y cada modificación conserva `updatedBy`, con ID de usuario, documento y nombre.
- Las eliminaciones lógicas conservan además el autor que realizó el cambio mediante `updatedBy`.
- La sesión se conserva solamente durante la sesión actual del navegador.

La autenticación local es la primera fase. Para retirar por completo el acceso compartido de Gmail, el transporte con Drive debe sustituirse por una API central autenticada; la app no debe entregar credenciales de la cuenta propietaria a los dispositivos operativos.
