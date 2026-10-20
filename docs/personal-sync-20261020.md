# Alta de colaboradores y sincronización de Admin

El formulario enviaba un campo oculto `id` vacío después del identificador generado por `mark()`. Esto sobrescribía el ID, guardaba las altas en la misma clave local y hacía que el servidor las omitiera. Tres pruebas reprodujeron el problema antes del cambio: ID vacío, sobreescritura de dos altas y ausencia del colaborador en la vista de Plaza.

La corrección conserva el ID generado y protege también la escritura local de otros formularios. Al abrir Admin o sincronizar, los registros con clave vacía que aún existan en IndexedDB reciben un ID estable dentro de una transacción y quedan pendientes de envío. La reparación conserva todos sus campos y las señales de eliminación; no puede reconstruir registros ya sobreescritos o eliminados del dispositivo.

Al enviar personal se solicita la ficha central completa para verificar su recepción y adoptar el ID existente si el documento ya estaba registrado. Un alta o edición local que ocurra durante la petición se conserva pendiente y activa otro ciclo. Una respuesta que omita al funcionario no lo borra ni anuncia éxito. La confirmación rápida de otros registros permanece disponible.

No cambia el backend, los permisos ni el catálogo de Plaza. No requiere actualizar `Code.gs`. Después del despliegue, actualizar Admin en el dispositivo de origen, sincronizar allí y luego sincronizar Plaza Blending.

## Validación

- `npm ci` instala únicamente una dependencia de desarrollo para simular IndexedDB.
- `node --test tests/admin-personal*.test.cjs tests/admin-session-sync.test.cjs tests/admin-mark-sync.test.cjs`: pruebas de alta, reparación transaccional, concurrencia, confirmación, reintentos y sesiones.
- `npm test`: la suite general conserva cinco fallos previos de activos (mensajes de duplicidad y condiciones de serial/marca). Reproducidos también en la base anterior; no se modifica esa lógica.
- Se utilizan datos sintéticos y el código real del backend en un entorno de pruebas. No se crean ni modifican funcionarios reales durante la validación.
