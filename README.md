# SK Web

Sistema web de inventario y control de activos SK 3.7.

Primera etapa: aplicación local-first para tablet con Personal, registro de activos fijos, novedades administrativas y consumo de repuestos YT/Columnas. La operación se almacena en IndexedDB para funcionar sin conexión; un servicio privado sincroniza automáticamente con Google Drive `appDataFolder` sin solicitar una cuenta de Google al operario.

## Estado
- Interfaz inicial: implementada.
- Almacenamiento local IndexedDB: implementado.
- Operación offline entre módulos: implementada.
- Sincronización automática mediante puente Apps Script: implementada; pendiente desplegar el servicio y pegar su URL en `sync-config.js`.
- Prueba alternativa con Google Sheets: prevista posteriormente.

Proyecto estudiado, diseñado y desarrollado por **Nelson Castellanos C.-Huy Sano**.
