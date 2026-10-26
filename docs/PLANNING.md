# Planificación y seguimiento en Nexo

Estas funciones funcionan localmente sin credenciales de Google o Render. Los cambios se guardan en la misma base de datos del espacio de trabajo. La actualización añade tablas sin reemplazar proyectos, tareas, usuarios ni comentarios existentes.

## Subtareas

Abre una tarea guardada y ve a **Planificación y seguimiento**. Añade los pasos de su checklist, edita sus nombres y marca los terminados. Son pasos de una tarea; no tienen responsables o fechas independientes.

La tarea principal no puede completarse mientras haya pasos pendientes. Para añadir o reabrir pasos de una tarea completada, primero devuelve la tarea a **Por hacer**. Los cambios de checklist se guardan de inmediato, independientemente del formulario de detalles de la tarea.

## Dependencias

En la misma sección, selecciona las tareas predecesoras del mismo proyecto y pulsa **Guardar dependencias**. Una tarea con predecesoras pendientes aparece bloqueada en el tablero y en Reportes. Solo puede pasar a **En progreso**, **En revisión** o **Completada** cuando todas sus predecesoras estén completadas.

No se admiten ciclos, autorreferencias ni relaciones entre proyectos distintos. Para reabrir una predecesora completada, primero devuelve sus dependientes activas a **Por hacer**. Antes de mover una tarea con relaciones a otro proyecto, retira las relaciones en ambos sentidos.

Las dependencias controlan el orden del trabajo. No modifican automáticamente fechas, calculan ruta crítica o reprograman el cronograma. Eliminar una tarea también retira sus relaciones.

## Registro de horas

Indica la fecha trabajada, los minutos (entre 1 y 1440 por registro) y una nota opcional. La fecha no puede ser posterior al día actual del espacio de trabajo, cuya zona es **America/Mexico_City**. El total de una persona en un día no puede superar 24 horas, sumando todas sus tareas.

Cada registro conserva a su autor. Solo esa persona o un PM puede eliminarlo. Para corregirlo, elimina el registro y añade el correcto. Las horas no se convierten automáticamente en gasto ni cambian la estimación de la tarea.

## Hitos

En **Hitos**, el PM puede crear, editar, completar y eliminar entregas clave por proyecto. La fecha de cada hito debe estar entre el inicio y la entrega del proyecto. Si cambias las fechas del proyecto, primero ajusta los hitos que quedarían fuera de ese intervalo.

Completar un hito es una decisión del PM; no se calcula a partir del estado de las tareas. Los miembros pueden consultarlos.

## Reportes

**Reportes** muestra por proyecto:

- Tareas completadas, vencidas y bloqueadas.
- Presupuesto, gasto manual y saldo disponible, en MXN.
- Esfuerzo estimado frente al tiempo registrado, incluyendo todas las fechas.

Filtra un proyecto o consulta todo el portafolio. El botón de exportación descarga los mismos proyectos seleccionados en CSV. Las tareas vencidas o bloqueadas se pueden abrir directamente para tomar una decisión.

El CSV del tablero también incluye horas registradas, bloqueo y avance de subtareas. El presupuesto sigue siendo un registro manual; los reportes no calculan facturación ni capacidad semanal.

## Roles y guardado

Todos los miembros pueden colaborar en tareas, comentarios, checklist, dependencias y registrar sus propias horas. Solo el PM administra proyectos, hitos y elimina tareas. Los cambios de estado desde el tablero actualizan exclusivamente el estado para conservar los demás detalles vigentes.

La edición completa de detalles todavía requiere coordinación si dos personas modifican simultáneamente el mismo formulario: no hay bloqueo de edición ni combinación automática de cambios.
