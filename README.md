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
