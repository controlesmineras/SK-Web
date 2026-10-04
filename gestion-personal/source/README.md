# GESTIÓN DE PERSONAL

Aplicación independiente de Seguridad Física. La interfaz se publica en GitHub Pages desde `gestion-personal/`. No utiliza el inicio de sesión de ChatGPT.

## Compilar la interfaz

Instala las dependencias con pnpm y ejecuta `pnpm exec vite build --config vite.github.config.ts`. Copia `github-dist/` en `gestion-personal/`, conservando la carpeta `source/`.

## Datos y acceso

Los registros se conservan en una base de datos propia, separada de SK Admin y Plaza Blending. El servidor independiente recibe las solicitudes en `https://gestion-de-personal.nelsoncaste86.chatgpt.site/api/data`. GitHub Pages sirve la interfaz y no ejecuta código del servidor.

El acceso usa un enlace privado con una clave en el fragmento `#access=`. Esa clave no forma parte del código de GitHub y se guarda solo en el dispositivo al abrir el enlace. El servidor exige `Authorization: Bearer <clave>` para leer o escribir y compara su SHA-256 con el secreto `GP_ACCESS_HASH`. No publiques la clave ni los datos de personal en el repositorio.

Se conservan las personas, servicios y permisos ya guardados en la base central. Los borradores pendientes de un dispositivo de la versión anterior deben sincronizarse desde ese dispositivo antes de cambiar de dirección.
