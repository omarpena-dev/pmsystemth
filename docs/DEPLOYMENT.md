# Desplegar Nexo en Render

El código está preparado para un Web Service de Node 24 con un disco persistente. No se ha desplegado ni probado contra Render o Google en esta sesión: se necesitan acceso a la cuenta de Render, las credenciales OAuth de Google. El dominio autorizado ya está definido como `timhortonsmx.com` y el PM administrador como `omar.pena@timhortonsmx.com`.

## 1. Preparar Google Workspace

En Google Cloud Console, crea o selecciona un proyecto de tu organización:

1. Activa **Google Calendar API** y **Google Drive API**.
2. Configura Google Auth Platform / pantalla de consentimiento como **Internal** para tu organización. Si usas una aplicación External durante pruebas, añade los usuarios de prueba y revisa los requisitos de verificación de Google antes de abrir el acceso.
3. Crea un cliente OAuth de tipo **Web application**. Guarda Client ID y Client Secret en las variables del servicio de Render; nunca en Git ni en el chat.
4. Añade como redirect URI exacta `https://TU-SERVICIO.onrender.com/auth/google/callback`. El dominio real se conoce al crear el servicio. Para desarrollo local añade `http://localhost:3000/auth/google/callback`.
5. Los permisos solicitados son `openid`, `email`, `profile`, `calendar.events` y `drive.metadata.readonly`. Si el administrador restringe aplicaciones OAuth, debe autorizar este cliente y estos permisos.

El servidor valida el ID token de Google, el correo verificado y el claim `hd` del dominio. El parámetro `hd` de la pantalla de Google es solamente una ayuda visual; la restricción se aplica en el servidor.

## 2. Crear el servicio

1. Sube los archivos al repositorio `omarpena-dev/pmsystemth` en GitHub.
2. En [Render Dashboard](https://dashboard.render.com/), selecciona **New → Blueprint**, conecta el repositorio y revisa `render.yaml`.
3. El blueprint solicita **Starter y disco persistente de 1 GB**, que tienen coste. Revisa la tarifa vigente y el resumen de Render antes de crear recursos. No se ha contratado ningún recurso desde esta sesión.
4. Completa las variables pendientes:

| Variable                  | Valor                                                          |
| ------------------------- | -------------------------------------------------------------- |
| `GOOGLE_CLIENT_ID`        | Client ID del cliente OAuth web                                |
| `GOOGLE_CLIENT_SECRET`    | Client Secret, como secreto de Render                          |
| `GOOGLE_WORKSPACE_DOMAIN` | Dominio exacto, sin `@`, por ejemplo `empresa.com`             |
| `PM_EMAILS`               | Correos de PM autorizados, separados por comas                 |
| `SESSION_SECRET`          | Render genera un valor aleatorio; consérvalo entre despliegues |

`APP_URL` se obtiene automáticamente de `RENDER_EXTERNAL_URL`. Si utilizas un dominio personalizado, establece `APP_URL=https://tu-dominio` y registra también su callback en Google. No añadas una barra final al callback.

Render ejecuta `npm ci --include=dev && npm run build`, después `npm start`. `/api/health` comprueba que SQLite responde. El servidor de producción **no inicia** sin la configuración obligatoria y **nunca habilita el modo demo**, aunque se configure `DEMO_MODE=true`.

## 3. Prueba de aceptación en Render

La prueba local no reemplaza esta comprobación después del despliegue:

- Verifica que el servicio esté Healthy y que `/api/health` devuelva `{"status":"ok"}`.
- Inicia sesión con un PM de `PM_EMAILS`. Comprueba que una cuenta externa al dominio no tenga acceso.
- Crea un proyecto y una tarea, asigna una persona que haya iniciado sesión y publica un comentario.
- Recarga la página. Reinicia el servicio desde Render y confirma que se conserva el proyecto y la sesión.
- Desde la tarea, busca un archivo de Drive, vincúlalo y ábrelo con los permisos de tu cuenta.
- Guarda la tarea y pulsa **Sincronizar tarea guardada**. Comprueba en Calendar un evento de día completo desde la fecha de inicio hasta la entrega, inclusive. Repite la operación: debe actualizar el mismo evento, no duplicarlo.
- Entra con una cuenta de miembro: puede colaborar en tareas y comentarios, pero no crear/eliminar proyectos ni eliminar tareas.
- Exporta un CSV y verifica que contiene las tareas filtradas.
- Prueba en móvil y cierra sesión.

## Persistencia y mantenimiento

- La base de datos y las sesiones están en `/var/data/nexo.sqlite`. SQLite usa WAL. Usa una única instancia del servicio; no escales horizontalmente esta versión.
- No uses el disco efímero para datos reales. El plan gratuito sin disco no conserva SQLite al redesplegar.
- Los tokens OAuth se cifran con AES-256-GCM usando una clave derivada de `SESSION_SECRET`. Si cambias el secreto, se invalidan las sesiones y no podrás descifrar los tokens existentes; los usuarios deberán iniciar sesión de nuevo. Conserva este valor de forma segura.
- Configura y comprueba copias de seguridad. Para obtener una copia consistente mientras el servicio está activo, usa la API de backup de SQLite o detén el proceso antes de copiar el archivo; copiar solamente el `.sqlite` con WAL activo puede perder cambios.
- Los eventos de Calendar se sincronizan manualmente, por usuario y tarea. Eliminar una tarea o desconectar Google **no elimina eventos ya creados**. No hay sincronización bidireccional ni en segundo plano.
- Los usuarios ven los mismos proyectos del espacio interno. No hay aislamiento por proyecto, gestión de invitados, dependencias Gantt ni facturación. El presupuesto se registra manualmente en MXN; las horas son estimaciones pendientes, no partes de tiempo.
- No se incluyen correos o invitaciones automáticas: los miembros se incorporan al iniciar sesión con su cuenta corporativa.
