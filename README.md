# Nexo · pmsystemth

Aplicación web de gestión de proyectos para un PM y su equipo interno. Interfaz en español, adaptable a escritorio y móvil, inspirada en flujos habituales de OpenProject y monday.com, con diseño propio.

## Incluido

- Resumen con indicadores calculados, entregas próximas y actividad.
- Proyectos con fechas, estado, progreso, presupuesto y gasto registrado en MXN.
- Tareas en Kanban y lista, responsables, prioridades, estimaciones, búsqueda y filtros.
- Cambio de estado mediante selector o arrastrando tarjetas, comentarios persistentes y exportación CSV.
- Cronograma de tareas, equipo y esfuerzo pendiente por persona.
- Google Workspace: OAuth restringido al dominio, roles PM/miembro, búsqueda y enlaces de Drive, creación/actualización manual de eventos de Calendar.
- SQLite persistente, sesiones del servidor, cookies HTTP-only, protección CSRF, validación de entrada, cifrado de tokens y cabeceras de seguridad.

## Desarrollo

Requiere **Node.js 24.x** y npm. No necesita una base de datos externa.

```sh
npm ci
npm run build
npm start
```

Abre el puerto 3000 en tu entorno local. El modo de desarrollo carga un espacio de demostración identificado visualmente, con datos ficticios en `data/demo.sqlite`. Los cambios se guardan allí. No utiliza ni simula conexiones reales con Google.

Para editar la interfaz con recarga automática, ejecuta `npm run dev` y, en otra terminal, `npm run dev:ui` (Vite en puerto 5173 con proxy al servidor 3000). Después de editar, usa `npm run build` para actualizar la interfaz servida por el backend.

Si el directorio de caché de npm del sistema no es escribible, usa `npm ci --cache /workspace/.npm-cache`.

Para Google real, copia `.env.example` a `.env`, configura OAuth y `DEMO_MODE=false`. Los datos reales se guardan en `data/nexo.sqlite`, separados del demo. La cuenta debe tener correo verificado y pertenecer al dominio configurado. Los miembros aparecen después de su primer inicio de sesión.

## Validación

```sh
npm run build
npm test
npm run test:e2e
```

Las pruebas de API usan bases temporales. Playwright necesita Chromium: usa el del sistema si existe, o instala uno con `npx playwright install chromium`. También puedes indicar `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/ruta/a/chromium`. Los tests de navegador crean su propio servidor y base temporal.

Las pruebas cubren autenticación, CSRF, permisos, validaciones, proyectos/tareas/comentarios, persistencia, restricciones de producción, recorrido del PM y vista móvil. OAuth y las APIs de Google requieren una prueba real con credenciales; las pruebas locales verifican el manejo explícito de una cuenta no conectada.

## Render y Google

Consulta [la guía de despliegue](docs/DEPLOYMENT.md). `render.yaml` configura un servicio con disco persistente; el plan y disco tienen coste y deben revisarse antes de aprovisionar.

La implementación usa un único espacio compartido y una única instancia. La sincronización con Calendar es manual desde cada tarea; no es bidireccional. Los permisos de los archivos siguen controlados por Google Drive.
