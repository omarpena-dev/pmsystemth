import { useEffect, useId, useState } from "react";
import {
  AlertCircle,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronRight,
  Circle,
  Clock3,
  Flag,
  GitBranch,
  ListChecks,
  LoaderCircle,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import "./planning.css";
import { workspaceToday } from "./dates";

type Api = (path: string, method?: string, body?: unknown) => Promise<any>;
type Notify = (message: string, error?: boolean) => void;
type PlanningTask = {
  id: string;
  title: string;
  status: string;
  project_id: string;
};
type PlanningProject = {
  id: string;
  name: string;
  color: string;
  start_date: string;
  due_date: string;
};
type ChecklistItem = {
  id: string;
  task_id: string;
  title: string;
  done: boolean;
};
type TimeEntry = {
  id: string;
  task_id: string;
  user_id: string;
  name: string;
  minutes: number;
  note: string;
  worked_on: string;
  created_at: string;
};
type PlanningData = {
  checklist: ChecklistItem[];
  dependencies: PlanningTask[];
  dependents: PlanningTask[];
  timeEntries: TimeEntry[];
  totalMinutes: number;
};
type Milestone = {
  id: string;
  project_id: string;
  title: string;
  due_date: string;
  status: "open" | "done";
  created_at: string;
};
const states: Record<string, string> = {
  todo: "Por hacer",
  in_progress: "En progreso",
  review: "En revisión",
  done: "Completada",
};
const localDate = workspaceToday;
const dateLabel = (value: string) =>
  new Date(`${value}T12:00:00`).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
const durationLabel = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours} h${rest ? ` ${rest} min` : ""}` : `${rest} min`;
};
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "No se pudo completar la operación.";

export function TaskPlanning({
  taskId,
  projectId,
  tasks,
  admin,
  currentUserId,
  api,
  onChanged,
  notify,
}: {
  taskId: string;
  projectId: string;
  tasks: PlanningTask[];
  admin: boolean;
  currentUserId: string;
  api: Api;
  onChanged: () => void | Promise<void>;
  notify: Notify;
}) {
  const prefix = useId();
  const [data, setData] = useState<PlanningData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [itemTitle, setItemTitle] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [dependencyIds, setDependencyIds] = useState<string[]>([]);
  const [minutes, setMinutes] = useState(60);
  const [workedOn, setWorkedOn] = useState(localDate);
  const [note, setNote] = useState("");
  const url = `/tasks/${encodeURIComponent(taskId)}`;

  const applyData = (result: PlanningData, preserveDraft = false) => {
    const hasDraft =
      [...dependencyIds].sort().join(",") !==
      (data?.dependencies
        .map((item) => item.id)
        .sort()
        .join(",") || "");
    setData(result);
    if (!preserveDraft || !hasDraft) {
      setDependencyIds(result.dependencies.map((item) => item.id));
    }
  };
  const load = async () => applyData(await api(`${url}/planning`), true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setData(null);
    setDependencyIds([]);
    setItemTitle("");
    setEditingId(null);
    setEditingTitle("");
    setMinutes(60);
    setWorkedOn(localDate());
    setNote("");
    api(`${url}/planning`)
      .then((result: PlanningData) => {
        if (active) applyData(result);
      })
      .catch((e: unknown) => {
        if (active) setError(errorMessage(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [taskId]);

  const mutate = async (operation: () => Promise<unknown>, message: string) => {
    setBusy(true);
    setError("");
    try {
      await operation();
      try {
        await load();
        await onChanged();
      } catch {
        setError(
          "El cambio se guardó, pero no se pudo actualizar la vista. Reintenta la carga.",
        );
      }
      notify(message);
      return true;
    } catch (e) {
      setError(errorMessage(e));
      notify(errorMessage(e), true);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const completed = data?.checklist.filter((item) => item.done).length || 0;
  const currentTask = tasks.find((task) => task.id === taskId);
  const availableTasks = tasks.filter(
    (task) => task.project_id === projectId && task.id !== taskId,
  );
  const outstanding =
    data?.dependencies.filter((task) => task.status !== "done") || [];
  const dependencyDirty =
    [...dependencyIds].sort().join(",") !==
    (data?.dependencies
      .map((task) => task.id)
      .sort()
      .join(",") || "");

  return (
    <section
      className="plan-task-planning"
      aria-label="Planificación de la tarea"
    >
      <div className="plan-section-heading">
        <div>
          <span className="plan-kicker">DEL PLAN A LA ENTREGA</span>
          <h3>Planificación y seguimiento</h3>
        </div>
        <ListChecks size={21} />
      </div>
      {loading && (
        <div className="plan-loading" role="status">
          <LoaderCircle className="spin" size={17} /> Cargando seguimiento…
        </div>
      )}
      {error && (
        <div className="plan-error" role="alert">
          <AlertCircle size={16} />
          <span>{error}</span>
          {!loading && !busy && (
            <button
              type="button"
              className="plan-link-button"
              onClick={async () => {
                setLoading(true);
                setError("");
                try {
                  await load();
                } catch (e) {
                  setError(errorMessage(e));
                } finally {
                  setLoading(false);
                }
              }}
            >
              Reintentar
            </button>
          )}
        </div>
      )}
      {data && !loading && (
        <>
          <section
            className="plan-section"
            aria-labelledby={`${prefix}-checklist`}
          >
            <div className="plan-subheading">
              <h4 id={`${prefix}-checklist`}>
                <ListChecks size={16} />
                Subtareas
              </h4>
              <span className="plan-counter" aria-live="polite">
                {completed}/{data.checklist.length} completadas
              </span>
            </div>
            {data.checklist.length > 0 && (
              <div className="plan-checklist-progress" aria-hidden="true">
                <span
                  style={{
                    width: `${(completed / data.checklist.length) * 100}%`,
                  }}
                />
              </div>
            )}
            <p className="plan-hint">
              Una lista de pasos para esta entrega. Completa todos antes de
              cerrar la tarea.
            </p>
            <ul className="plan-checklist">
              {data.checklist.map((item) => (
                <li key={item.id} className={item.done ? "plan-item-done" : ""}>
                  {editingId === item.id ? (
                    <form
                      className="plan-inline-edit"
                      onSubmit={async (event) => {
                        event.preventDefault();
                        const success = await mutate(
                          () =>
                            api(`${url}/checklist/${item.id}`, "PUT", {
                              title: editingTitle.trim(),
                            }),
                          "Subtarea actualizada",
                        );
                        if (success) setEditingId(null);
                      }}
                    >
                      <input
                        autoFocus
                        aria-label="Editar nombre de subtarea"
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        minLength={1}
                        maxLength={200}
                        required
                        disabled={busy}
                      />
                      <button
                        type="submit"
                        className="icon-btn"
                        aria-label="Guardar subtarea"
                        disabled={busy || !editingTitle.trim()}
                      >
                        <Check size={15} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label="Cancelar edición de subtarea"
                        disabled={busy}
                        onClick={() => setEditingId(null)}
                      >
                        <X size={15} />
                      </button>
                    </form>
                  ) : (
                    <>
                      <label className="plan-check-label">
                        <input
                          type="checkbox"
                          checked={item.done}
                          disabled={busy}
                          onChange={async (event) => {
                            if (busy) return;
                            const previousDone = item.done;
                            const nextDone = event.currentTarget.checked;
                            setData((current) =>
                              current
                                ? {
                                    ...current,
                                    checklist: current.checklist.map((entry) =>
                                      entry.id === item.id
                                        ? { ...entry, done: nextDone }
                                        : entry,
                                    ),
                                  }
                                : current,
                            );
                            const success = await mutate(
                              () =>
                                api(`${url}/checklist/${item.id}`, "PUT", {
                                  done: nextDone,
                                }),
                              nextDone
                                ? "Subtarea completada"
                                : "Subtarea pendiente",
                            );
                            if (!success) {
                              setData((current) =>
                                current
                                  ? {
                                      ...current,
                                      checklist: current.checklist.map(
                                        (entry) =>
                                          entry.id === item.id
                                            ? { ...entry, done: previousDone }
                                            : entry,
                                      ),
                                    }
                                  : current,
                              );
                            }
                          }}
                        />
                        <span>{item.title}</span>
                      </label>
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`Editar subtarea ${item.title}`}
                        disabled={busy}
                        onClick={() => {
                          setEditingId(item.id);
                          setEditingTitle(item.title);
                        }}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`Eliminar subtarea ${item.title}`}
                        disabled={busy}
                        onClick={() => {
                          if (confirm(`¿Eliminar la subtarea «${item.title}»?`))
                            mutate(
                              () =>
                                api(`${url}/checklist/${item.id}`, "DELETE"),
                              "Subtarea eliminada",
                            );
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
            {!data.checklist.length && (
              <p className="plan-empty-inline">
                Divide el trabajo en pasos más pequeños.
              </p>
            )}
            <form
              className="plan-add-checklist"
              onSubmit={async (event) => {
                event.preventDefault();
                const success = await mutate(
                  () =>
                    api(`${url}/checklist`, "POST", {
                      title: itemTitle.trim(),
                    }),
                  "Subtarea añadida",
                );
                if (success) setItemTitle("");
              }}
            >
              <input
                aria-label="Nueva subtarea"
                placeholder="Añadir un paso al plan…"
                maxLength={200}
                required
                value={itemTitle}
                onChange={(event) => setItemTitle(event.target.value)}
                disabled={busy || currentTask?.status === "done"}
              />
              <button
                type="submit"
                className="btn secondary small"
                disabled={
                  busy || !itemTitle.trim() || currentTask?.status === "done"
                }
              >
                <Plus size={15} />
                Añadir
              </button>
            </form>
            {currentTask?.status === "done" && (
              <p className="plan-hint">
                La tarea está completada. Reábrela antes de añadir pasos
                pendientes.
              </p>
            )}
          </section>

          <section
            className="plan-section"
            aria-labelledby={`${prefix}-dependencies`}
          >
            <div className="plan-subheading">
              <h4 id={`${prefix}-dependencies`}>
                <GitBranch size={16} />
                Dependencias
              </h4>
              <span className="plan-counter">
                {data.dependencies.length} previas
              </span>
            </div>
            <p className="plan-hint">
              Estas tareas del mismo proyecto deben completarse antes de iniciar
              esta entrega.
            </p>
            {outstanding.length > 0 ? (
              <div className="plan-warning">
                <AlertCircle size={15} />
                <span>
                  Bloqueada por {outstanding.length}{" "}
                  {outstanding.length === 1
                    ? "tarea pendiente"
                    : "tareas pendientes"}
                  . Completa las anteriores para avanzar.
                </span>
              </div>
            ) : data.dependencies.length > 0 ? (
              <div className="plan-success">
                <CheckCheck size={15} />
                Todas las tareas previas están completadas.
              </div>
            ) : null}
            {availableTasks.length ? (
              <div className="plan-dependency-options">
                {availableTasks.map((task) => (
                  <label key={task.id} className="plan-dependency-option">
                    <input
                      type="checkbox"
                      checked={dependencyIds.includes(task.id)}
                      disabled={busy}
                      onChange={(event) =>
                        setDependencyIds(
                          event.target.checked
                            ? [...dependencyIds, task.id]
                            : dependencyIds.filter((id) => id !== task.id),
                        )
                      }
                    />
                    <span>{task.title}</span>
                    <small
                      className={`plan-task-state plan-state-${task.status}`}
                    >
                      {states[task.status] || task.status}
                    </small>
                  </label>
                ))}
              </div>
            ) : (
              <p className="plan-empty-inline">
                No hay otras tareas en este proyecto para vincular.
              </p>
            )}
            <div className="plan-dependency-actions">
              <span className="plan-hint">
                No se permiten dependencias circulares.
              </span>
              <button
                type="button"
                className="btn secondary small"
                disabled={busy || !dependencyDirty}
                onClick={() =>
                  mutate(
                    () =>
                      api(`${url}/dependencies`, "PUT", {
                        depends_on_ids: dependencyIds,
                      }),
                    "Dependencias guardadas",
                  )
                }
              >
                <Save size={14} />
                Guardar dependencias
              </button>
            </div>
            {data.dependents.length > 0 && (
              <div className="plan-dependent-list">
                <strong>Esperan esta entrega</strong>
                {data.dependents.map((task) => (
                  <div key={task.id}>
                    <ChevronRight size={13} />
                    <span>{task.title}</span>
                    <small>{states[task.status] || task.status}</small>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="plan-section" aria-labelledby={`${prefix}-time`}>
            <div className="plan-subheading">
              <h4 id={`${prefix}-time`}>
                <Clock3 size={16} />
                Registro de horas
              </h4>
              <span className="plan-time-total" aria-live="polite">
                {durationLabel(data.totalMinutes)}
              </span>
            </div>
            <p className="plan-hint">
              Registra el tiempo real invertido. Cada entrada conserva su autor.
            </p>
            <form
              className="plan-time-form"
              onSubmit={async (event) => {
                event.preventDefault();
                const success = await mutate(
                  () =>
                    api(`${url}/time`, "POST", {
                      minutes,
                      worked_on: workedOn,
                      note: note.trim(),
                    }),
                  "Tiempo registrado",
                );
                if (success) setNote("");
              }}
            >
              <div className="plan-time-fields">
                <label>
                  Fecha del trabajo
                  <input
                    type="date"
                    required
                    max={localDate()}
                    value={workedOn}
                    onChange={(e) => setWorkedOn(e.target.value)}
                    disabled={busy}
                  />
                </label>
                <label>
                  Tiempo (minutos)
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    step={1}
                    required
                    value={minutes}
                    onChange={(e) => setMinutes(Number(e.target.value))}
                    disabled={busy}
                  />
                </label>
              </div>
              <label>
                Nota del registro
                <input
                  placeholder="Ej. Revisión del prototipo con el equipo"
                  maxLength={1000}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  disabled={busy}
                />
              </label>
              <div className="plan-time-form-footer">
                <span className="plan-hint">
                  Máximo 24 horas por persona y día.
                </span>
                <button
                  className="btn secondary small"
                  type="submit"
                  disabled={busy || minutes < 1 || !Number.isInteger(minutes)}
                >
                  <Plus size={14} />
                  Registrar tiempo
                </button>
              </div>
            </form>
            {data.timeEntries.length ? (
              <ul className="plan-time-entries">
                {data.timeEntries.map((entry) => (
                  <li key={entry.id}>
                    <span className="plan-time-avatar">
                      {entry.name
                        .split(" ")
                        .slice(0, 2)
                        .map((n) => n[0])
                        .join("")}
                    </span>
                    <div>
                      <strong>
                        {entry.name}
                        <small>{dateLabel(entry.worked_on)}</small>
                      </strong>
                      {entry.note && <p>{entry.note}</p>}
                    </div>
                    <b>{durationLabel(entry.minutes)}</b>
                    {(admin || entry.user_id === currentUserId) && (
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`Eliminar registro de ${entry.name} de ${entry.minutes} minutos`}
                        disabled={busy}
                        onClick={() => {
                          if (confirm("¿Eliminar este registro de tiempo?"))
                            mutate(
                              () => api(`${url}/time/${entry.id}`, "DELETE"),
                              "Registro eliminado",
                            );
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="plan-empty-inline">
                Aún no se ha registrado tiempo en esta tarea.
              </p>
            )}
          </section>
        </>
      )}
    </section>
  );
}

export function MilestonesView({
  projects,
  admin,
  api,
  notify,
  onChanged,
}: {
  projects: PlanningProject[];
  admin: boolean;
  api: Api;
  notify: Notify;
  onChanged?: () => void | Promise<void>;
}) {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [projectFilter, setProjectFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Milestone | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    project_id: "",
    title: "",
    due_date: localDate(),
    status: "open" as "open" | "done",
  });
  const load = async () => setMilestones(await api("/milestones"));
  useEffect(() => {
    let active = true;
    api("/milestones")
      .then((result: Milestone[]) => {
        if (active) setMilestones(result);
      })
      .catch((e: unknown) => {
        if (active) setError(errorMessage(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const mutate = async (operation: () => Promise<unknown>, message: string) => {
    setBusy(true);
    setError("");
    try {
      await operation();
      try {
        await load();
        await onChanged?.();
      } catch {
        setError(
          "El cambio se guardó, pero no se pudo actualizar la vista. Reintenta la carga.",
        );
      }
      notify(message);
      return true;
    } catch (e) {
      setError(errorMessage(e));
      notify(errorMessage(e), true);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const selectedProject = projects.find(
    (project) => project.id === form.project_id,
  );
  const boundedDate = (project?: PlanningProject) => {
    const now = localDate();
    return project
      ? now < project.start_date
        ? project.start_date
        : now > project.due_date
          ? project.due_date
          : now
      : now;
  };
  const beginNew = () => {
    const project = projects.find((p) => p.id === projectFilter) || projects[0];
    setEditing(null);
    setForm({
      project_id: project?.id || "",
      title: "",
      due_date: boundedDate(project),
      status: "open",
    });
    setShowForm(true);
    setError("");
  };
  const beginEdit = (milestone: Milestone) => {
    setEditing(milestone);
    setForm({
      project_id: milestone.project_id,
      title: milestone.title,
      due_date: milestone.due_date,
      status: milestone.status,
    });
    setShowForm(true);
    setError("");
    requestAnimationFrame(() =>
      document
        .getElementById("plan-milestone-form")
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" }),
    );
  };
  const filtered = milestones.filter(
    (milestone) =>
      (projectFilter === "all" || milestone.project_id === projectFilter) &&
      (stateFilter === "all" ||
        (stateFilter === "overdue"
          ? milestone.status === "open" && milestone.due_date < localDate()
          : milestone.status === stateFilter)),
  );
  const completed = milestones.filter(
    (milestone) => milestone.status === "done",
  ).length;
  const late = milestones.filter(
    (milestone) =>
      milestone.status === "open" && milestone.due_date < localDate(),
  ).length;

  return (
    <div className="plan-milestones-view">
      <div className="plan-milestone-stats">
        <div>
          <span className="plan-summary-icon">
            <Flag size={20} />
          </span>
          <strong>
            {milestones.length}
            <small>Hitos definidos</small>
          </strong>
        </div>
        <div>
          <span className="plan-summary-icon plan-summary-done">
            <CheckCheck size={20} />
          </span>
          <strong>
            {completed}
            <small>Alcanzados</small>
          </strong>
        </div>
        <div>
          <span className="plan-summary-icon plan-summary-late">
            <Clock3 size={20} />
          </span>
          <strong>
            {late}
            <small>Pendientes vencidos</small>
          </strong>
        </div>
      </div>
      <div className="plan-milestone-toolbar">
        <div>
          <label className="plan-sr-only" htmlFor="plan-project-filter">
            Filtrar hitos por proyecto
          </label>
          <select
            id="plan-project-filter"
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
          >
            <option value="all">Todos los proyectos</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <label className="plan-sr-only" htmlFor="plan-state-filter">
            Filtrar estado de hitos
          </label>
          <select
            id="plan-state-filter"
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
          >
            <option value="all">Todos los estados</option>
            <option value="open">Pendientes</option>
            <option value="done">Alcanzados</option>
            <option value="overdue">Vencidos</option>
          </select>
        </div>
        {admin && (
          <button
            type="button"
            className="btn primary"
            disabled={!projects.length || busy}
            onClick={beginNew}
          >
            <Plus size={16} />
            Nuevo hito
          </button>
        )}
      </div>
      {showForm && admin && (
        <section className="plan-milestone-editor" id="plan-milestone-form">
          <div className="plan-subheading">
            <h3>
              <Flag size={17} />
              {editing ? "Editar hito" : "Un punto clave en el camino"}
            </h3>
            <button
              type="button"
              className="icon-btn"
              aria-label="Cerrar formulario de hito"
              disabled={busy}
              onClick={() => setShowForm(false)}
            >
              <X size={17} />
            </button>
          </div>
          <p className="plan-hint">
            Los hitos marcan una entrega importante del proyecto. Su fecha debe
            quedar dentro de las fechas del proyecto.
          </p>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              const success = await mutate(
                () =>
                  api(
                    editing ? `/milestones/${editing.id}` : "/milestones",
                    editing ? "PUT" : "POST",
                    form,
                  ),
                editing ? "Hito actualizado" : "Hito creado",
              );
              if (success) setShowForm(false);
            }}
          >
            <div className="plan-milestone-fields">
              <label>
                Nombre del hito
                <input
                  autoFocus
                  required
                  minLength={2}
                  maxLength={200}
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Ej. Lanzamiento de la nueva plataforma"
                  disabled={busy}
                />
              </label>
              <label>
                Proyecto del hito
                <select
                  required
                  value={form.project_id}
                  onChange={(e) => {
                    const project = projects.find(
                      (p) => p.id === e.target.value,
                    );
                    setForm({
                      ...form,
                      project_id: e.target.value,
                      due_date: boundedDate(project),
                    });
                  }}
                  disabled={busy}
                >
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Fecha del hito
                <input
                  type="date"
                  required
                  min={selectedProject?.start_date}
                  max={selectedProject?.due_date}
                  value={form.due_date}
                  onChange={(e) =>
                    setForm({ ...form, due_date: e.target.value })
                  }
                  disabled={busy}
                />
              </label>
              <label>
                Estado del hito
                <select
                  value={form.status}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      status: e.target.value as "open" | "done",
                    })
                  }
                  disabled={busy}
                >
                  <option value="open">Pendiente</option>
                  <option value="done">Alcanzado</option>
                </select>
              </label>
            </div>
            <div className="plan-editor-footer">
              {selectedProject && (
                <span className="plan-hint">
                  {dateLabel(selectedProject.start_date)} —{" "}
                  {dateLabel(selectedProject.due_date)}
                </span>
              )}
              <span className="plan-flex-spacer" />
              <button
                type="button"
                className="btn secondary small"
                disabled={busy}
                onClick={() => setShowForm(false)}
              >
                Cancelar
              </button>
              <button
                className="btn primary small"
                disabled={busy || !form.title.trim()}
              >
                {busy ? (
                  <LoaderCircle className="spin" size={15} />
                ) : (
                  <Check size={15} />
                )}
                {editing ? "Guardar hito" : "Crear hito"}
              </button>
            </div>
          </form>
        </section>
      )}
      {error && (
        <div className="plan-error" role="alert">
          <AlertCircle size={16} />
          <span>{error}</span>
          {!loading && !busy && (
            <button
              type="button"
              className="plan-link-button"
              onClick={async () => {
                setLoading(true);
                setError("");
                try {
                  await load();
                } catch (e) {
                  setError(errorMessage(e));
                } finally {
                  setLoading(false);
                }
              }}
            >
              Reintentar
            </button>
          )}
        </div>
      )}
      {loading ? (
        <div className="plan-loading" role="status">
          <LoaderCircle className="spin" size={18} />
          Cargando hitos…
        </div>
      ) : filtered.length ? (
        <div className="plan-milestone-groups">
          {projects
            .filter((project) =>
              filtered.some((milestone) => milestone.project_id === project.id),
            )
            .map((project) => {
              const items = filtered
                .filter((milestone) => milestone.project_id === project.id)
                .sort((a, b) => a.due_date.localeCompare(b.due_date));
              return (
                <section className="plan-milestone-project" key={project.id}>
                  <header>
                    <i style={{ background: project.color }} />
                    <h3>{project.name}</h3>
                    <span>
                      {items.length} {items.length === 1 ? "hito" : "hitos"}
                    </span>
                  </header>
                  <ul>
                    {items.map((milestone) => {
                      const isLate =
                        milestone.status === "open" &&
                        milestone.due_date < localDate();
                      return (
                        <li
                          key={milestone.id}
                          className={
                            milestone.status === "done"
                              ? "plan-milestone-done"
                              : ""
                          }
                        >
                          <span
                            className="plan-milestone-marker"
                            style={
                              {
                                "--milestone-color": project.color,
                              } as React.CSSProperties
                            }
                          >
                            {milestone.status === "done" ? (
                              <CheckCheck size={18} />
                            ) : (
                              <Flag size={18} />
                            )}
                          </span>
                          <div className="plan-milestone-description">
                            <h4>{milestone.title}</h4>
                            <span className={isLate ? "plan-overdue-date" : ""}>
                              <CalendarDays size={13} />
                              {dateLabel(milestone.due_date)}
                            </span>
                          </div>
                          <span
                            className={`plan-milestone-status ${milestone.status === "done" ? "plan-status-done" : isLate ? "plan-status-late" : ""}`}
                          >
                            {milestone.status === "done"
                              ? "Alcanzado"
                              : isLate
                                ? "Vencido"
                                : "Pendiente"}
                          </span>
                          {admin && (
                            <div className="plan-milestone-actions">
                              <button
                                type="button"
                                className="icon-btn"
                                aria-label={`${milestone.status === "done" ? "Reabrir" : "Completar"} hito ${milestone.title}`}
                                title={
                                  milestone.status === "done"
                                    ? "Marcar pendiente"
                                    : "Marcar alcanzado"
                                }
                                disabled={busy}
                                onClick={() =>
                                  mutate(
                                    () =>
                                      api(
                                        `/milestones/${milestone.id}`,
                                        "PUT",
                                        {
                                          project_id: milestone.project_id,
                                          title: milestone.title,
                                          due_date: milestone.due_date,
                                          status:
                                            milestone.status === "done"
                                              ? "open"
                                              : "done",
                                        },
                                      ),
                                    milestone.status === "done"
                                      ? "Hito pendiente"
                                      : "Hito alcanzado",
                                  )
                                }
                              >
                                {milestone.status === "done" ? (
                                  <Circle size={16} />
                                ) : (
                                  <Check size={16} />
                                )}
                              </button>
                              <button
                                type="button"
                                className="icon-btn"
                                aria-label={`Editar hito ${milestone.title}`}
                                disabled={busy}
                                onClick={() => beginEdit(milestone)}
                              >
                                <Pencil size={15} />
                              </button>
                              <button
                                type="button"
                                className="icon-btn"
                                aria-label={`Eliminar hito ${milestone.title}`}
                                disabled={busy}
                                onClick={() => {
                                  if (
                                    confirm(
                                      `¿Eliminar el hito «${milestone.title}»?`,
                                    )
                                  )
                                    mutate(
                                      () =>
                                        api(
                                          `/milestones/${milestone.id}`,
                                          "DELETE",
                                        ),
                                      "Hito eliminado",
                                    );
                                }}
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
        </div>
      ) : (
        <div className="plan-milestones-empty">
          <span>
            <Flag size={29} />
          </span>
          <h3>
            {milestones.length
              ? "No hay hitos con estos filtros"
              : "Cada gran proyecto tiene momentos clave"}
          </h3>
          <p>
            {milestones.length
              ? "Prueba otro proyecto o estado para ver más entregas."
              : projects.length
                ? "Define una entrega importante y dale una fecha visible para todo el equipo."
                : "Primero crea un proyecto para organizar sus hitos."}
          </p>
          {admin && projects.length > 0 && !showForm && (
            <button type="button" className="btn secondary" onClick={beginNew}>
              <Plus size={15} />
              Crear hito
            </button>
          )}
        </div>
      )}
      <div className="plan-milestone-note">
        <Flag size={15} />
        <span>
          Los hitos son puntos de control manuales; completar tareas no cambia
          automáticamente su estado.
        </span>
      </div>
    </div>
  );
}
