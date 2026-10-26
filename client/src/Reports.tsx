import { useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  BarChart3,
  Clock3,
  Wallet,
  AlertCircle,
  Link2,
  CheckCircle2,
} from "lucide-react";
import { downloadCSV } from "./csv";
import { workspaceToday } from "./dates";
import "./reports.css";

type Project = {
  id: string;
  name: string;
  color: string;
  status: string;
  budget: number;
  spent: number;
  due_date: string;
};
type Task = {
  id: string;
  project_id: string;
  title: string;
  status: string;
  due_date: string;
  estimate: number;
  assignee_id: string | null;
};
export type PlanningSummary = {
  task_id: string;
  checklist_total: number;
  checklist_done: number;
  total_minutes: number;
  blocked: boolean;
};
const formatMoney = (v: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(v);
const hours = (v: number) =>
  new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 }).format(v);
const localToday = workspaceToday;
export function Reports({
  projects,
  tasks,
  planning,
  onOpen,
  onProject,
}: {
  projects: Project[];
  tasks: Task[];
  planning: PlanningSummary[];
  onOpen: (task: Task) => void;
  onProject: (id: string) => void;
}) {
  const [projectFilter, setProjectFilter] = useState("all");
  const selected = projects.filter(
    (p) => projectFilter === "all" || p.id === projectFilter,
  );
  const selectedTasks = tasks.filter((t) =>
    selected.some((p) => p.id === t.project_id),
  );
  const summary = new Map(planning.map((p) => [p.task_id, p]));
  const rows = selected.map((p) => {
    const work = selectedTasks.filter((t) => t.project_id === p.id);
    return {
      project: p,
      total: work.length,
      done: work.filter((t) => t.status === "done").length,
      late: work.filter((t) => t.status !== "done" && t.due_date < localToday())
        .length,
      blocked: work.filter((t) => summary.get(t.id)?.blocked).length,
      estimated: work.reduce((n, t) => n + t.estimate, 0),
      logged: work.reduce(
        (n, t) => n + (summary.get(t.id)?.total_minutes || 0) / 60,
        0,
      ),
    };
  });
  const budget = selected.reduce((n, p) => n + p.budget, 0),
    spent = selected.reduce((n, p) => n + p.spent, 0);
  const estimated = rows.reduce((n, r) => n + r.estimated, 0),
    logged = rows.reduce((n, r) => n + r.logged, 0);
  const attention = selectedTasks
    .filter(
      (t) =>
        t.status !== "done" &&
        (t.due_date < localToday() || summary.get(t.id)?.blocked),
    )
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  const exportReport = () =>
    downloadCSV(`nexo-reporte-${localToday()}.csv`, [
      [
        "Proyecto",
        "Estado",
        "Presupuesto MXN",
        "Gasto MXN",
        "Disponible MXN",
        "Tareas",
        "Completadas",
        "Vencidas",
        "Bloqueadas",
        "Horas estimadas",
        "Horas registradas",
      ],
      ...rows.map((r) => [
        r.project.name,
        (
          {
            planning: "Planificación",
            active: "En curso",
            at_risk: "En riesgo",
            completed: "Completado",
          } as Record<string, string>
        )[r.project.status],
        r.project.budget,
        r.project.spent,
        r.project.budget - r.project.spent,
        r.total,
        r.done,
        r.late,
        r.blocked,
        r.estimated,
        Number(r.logged.toFixed(2)),
      ]),
    ]);
  return (
    <div className="reports">
      <div className="reports-toolbar">
        <label>
          Proyecto del reporte
          <select
            aria-label="Proyecto del reporte"
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
          >
            <option value="all">Todo el portafolio</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="btn secondary"
          disabled={!selected.length}
          onClick={exportReport}
        >
          <ArrowDownToLine size={16} />
          Exportar reporte CSV
        </button>
      </div>
      <div className="reports-stats">
        <article>
          <span className="soft-icon purple">
            <Wallet size={20} />
          </span>
          <span>Presupuesto del portafolio</span>
          <strong>{formatMoney(budget)}</strong>
          <small>MXN · Registrado por el PM</small>
        </article>
        <article>
          <span className="soft-icon orange">
            <BarChart3 size={20} />
          </span>
          <span>Gasto registrado</span>
          <strong className={spent > budget ? "reports-over" : ""}>
            {formatMoney(spent)}
          </strong>
          <small>
            {budget > 0
              ? `${Math.round((spent / budget) * 100)}% del presupuesto`
              : "Sin presupuesto asignado"}
          </small>
        </article>
        <article>
          <span className="soft-icon green">
            <CheckCircle2 size={20} />
          </span>
          <span>Saldo disponible</span>
          <strong className={spent > budget ? "reports-over" : ""}>
            {formatMoney(budget - spent)}
          </strong>
          <small>Presupuesto menos gasto registrado</small>
        </article>
        <article>
          <span className="soft-icon blue">
            <Clock3 size={20} />
          </span>
          <span>Esfuerzo registrado</span>
          <strong>
            {hours(logged)}
            <em> h</em>
          </strong>
          <small>De {hours(estimated)} h estimadas en total</small>
        </article>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>El portafolio en números</h2>
            <p>Avance, presupuesto y esfuerzo real de cada proyecto.</p>
          </div>
        </div>
        <div className="table-scroll">
          <table className="reports-table">
            <thead>
              <tr>
                <th>Proyecto</th>
                <th>Avance</th>
                <th>Presupuesto</th>
                <th>Gasto</th>
                <th>Saldo</th>
                <th>Estimadas / reales</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.project.id}>
                  <td>
                    <button onClick={() => onProject(r.project.id)}>
                      <i style={{ background: r.project.color }} />
                      {r.project.name}
                      <ArrowUpRight size={14} />
                    </button>
                    <small>
                      {r.late} vencidas · {r.blocked} bloqueadas
                    </small>
                  </td>
                  <td>
                    <strong>
                      {r.total ? Math.round((r.done / r.total) * 100) : 0}%
                    </strong>
                    <small>
                      {r.done} de {r.total} tareas
                    </small>
                    <div className="progress-track">
                      <i
                        style={{
                          background: r.project.color,
                          width: `${r.total ? (r.done / r.total) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </td>
                  <td>{formatMoney(r.project.budget)}</td>
                  <td>{formatMoney(r.project.spent)}</td>
                  <td
                    className={
                      r.project.spent > r.project.budget ? "reports-over" : ""
                    }
                  >
                    {formatMoney(r.project.budget - r.project.spent)}
                  </td>
                  <td>
                    <strong>
                      {hours(r.estimated)} / {hours(r.logged)} h
                    </strong>
                    {r.logged > r.estimated && (
                      <small className="reports-over">
                        Sobre la estimación
                      </small>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!selected.length && (
          <div className="empty-state">
            <BarChart3 />
            <h3>Tu portafolio empieza con un proyecto</h3>
            <p>Al registrar proyectos y horas, verás aquí los resultados.</p>
          </div>
        )}
        <p className="reports-note">
          El gasto se registra manualmente. Las horas incluyen todas las fechas
          de trabajo y no calculan costes ni disponibilidad semanal.
        </p>
      </section>
      <section className="panel reports-attention">
        <div className="panel-heading">
          <div>
            <h2>Lo que necesita una decisión</h2>
            <p>Tareas vencidas o con predecesoras pendientes.</p>
          </div>
          <AlertCircle size={18} />
        </div>
        {attention.length ? (
          attention.map((t) => (
            <button key={t.id} onClick={() => onOpen(t)}>
              <span className="reports-attention-icon">
                {summary.get(t.id)?.blocked ? (
                  <Link2 size={16} />
                ) : (
                  <Clock3 size={16} />
                )}
              </span>
              <span>
                <strong>{t.title}</strong>
                <small>
                  {projects.find((p) => p.id === t.project_id)?.name}
                </small>
              </span>
              <span className="reports-issue">
                {summary.get(t.id)?.blocked ? "Bloqueada" : "Vencida"}
              </span>
              <ArrowUpRight size={15} />
            </button>
          ))
        ) : (
          <div className="reports-all-clear">
            <CheckCircle2 size={24} />
            <div>
              <strong>Todo en movimiento</strong>
              <p>No hay tareas vencidas o bloqueadas en esta selección.</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
