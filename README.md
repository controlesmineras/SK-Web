# SK Web

Sistema web de inventario y control de activos SK 3.7.

Primera etapa: aplicación local-first para tablet con Personal, registro de activos fijos, novedades administrativas y consumo de repuestos YT/Columnas. La operación se almacena en IndexedDB para funcionar sin conexión; la sincronización con Google Drive `appDataFolder` se implementa como respaldo remoto mediante un único botón.

## Estado
- Interfaz inicial: implementada.
- Almacenamiento local IndexedDB: implementado.
- Operación offline entre módulos: implementada.
- Sincronización bidireccional Google Drive appDataFolder: implementada con conciliación registro por registro.
- Usuarios locales vinculados a Personal, PIN cifrado, roles y huella de auditoría: implementados.
- Contador de registros pendientes y resumen de enviados/recibidos: implementados.
- API central sin sesión compartida de Gmail: pendiente de vincular y desplegar el servicio de base de datos.
- Prueba alternativa con Google Sheets: prevista posteriormente.

Proyecto estudiado, diseñado y desarrollado por **Nelson Castellanos C.-Huy Sano**.
