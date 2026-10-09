# Eliminar activos y evitar seriales duplicados

En SK Web Admin, el administrador principal abre **Hacer registros → Activos fijos → Registro individual**, busca un activo y pulsa **Eliminar activo** al final de su ficha. La confirmación identifica el equipo y explica que conserva su historial. Los auxiliares no pueden eliminar fichas.

La eliminación guarda `deleted`, fecha y autor; mantiene la ficha para identificar novedades, consumos, ingresos y entregas históricos. La cola de sincronización comunica el cambio a los demás equipos. Las listas y los selectores para nuevos registros excluyen eliminados. Una respuesta de sincronización anterior al borrado no reemplaza su cambio local pendiente.

El serial se compara entre todas las clases, ignorando mayúsculas y espacios exteriores. Se comprueba en el formulario, en la revisión de importaciones y dentro de la transacción de escritura local para impedir duplicados entre pestañas. Editar la misma ficha no crea otro activo. Vacíos y `No aplica` no son seriales. Los activos dados de baja conservan su serial; los eliminados permiten corregir un registro erróneo. La carga inicial omite seriales duplicados sin alterar los registros que ya existen.

## Publicación

GitHub Pages publica los controles locales y la opción de eliminar. La sincronización existente admite la señal de eliminación.

Además, actualizar `backend/apps-script/Code.gs` en la **implementación existente** de Apps Script y seleccionar una nueva versión, conservando su URL. Esta actualización valida seriales en la base central bajo bloqueo para altas y ediciones de Admin, auxiliares y Plaza, incluidos lotes; rechaza duplicados sin escrituras parciales. También impide que una edición de un dispositivo atrasado reactive un activo eliminado. Publicar GitHub Pages no publica Apps Script. Hasta aplicar esa versión, el control adicional central no está activo.

## Verificación

- Pruebas de reglas locales, permisos, confirmación, cancelación y error de escritura.
- Pruebas del servicio: seriales entre clases y dispositivos, cambios de serial, lotes duplicados, historial y conservación de la marca tras eliminar, rechazo a auxiliares y reintentos atrasados.
- Prueba con IndexedDB simulado: escrituras concurrentes, borrado durante sincronización, confirmación del borrado y recepción de marcas automáticas.
- La suite anterior incluye un fallo preexistente en `plaza-return-sync.test.cjs`: su formulario simulado no incluye los campos de ubicación introducidos en la versión actual de Plaza. Este cambio no modifica ese formulario ni Plaza.
