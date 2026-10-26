import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  LayoutDashboard,
  FolderKanban,
  CheckSquare,
  CalendarDays,
  Users,
  Puzzle,
  Search,
  Bell,
  Plus,
  ChevronDown,
  ChevronRight,
  ArrowUpRight,
  ArrowRight,
  MoreHorizontal,
  X,
  Check,
  Clock3,
  CircleHelp,
  LogOut,
  LayoutGrid,
  List,
  SlidersHorizontal,
  ArrowDownToLine,
  Link2,
  Send,
  ExternalLink,
  Trash2,
  Pencil,
  Flag,
  Activity,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Menu,
  LoaderCircle,
  Settings2,
} from "lucide-react";
import "./style.css";

type User = {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role: string;
  googleConnected?: boolean;
};
type Project = {
  id: string;
  name: string;
  description: string;
  color: string;
  status: string;
  start_date: string;
  due_date: string;
  budget: number;
  spent: number;
};
type Task = {
  id: string;
  project_id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  assignee_id: string | null;
  start_date: string;
  due_date: string;
  estimate: number;
  drive_url: string;
};
type Comment = { id: string; body: string; name: string; created_at: string };
type Workspace = {
  projects: Project[];
  tasks: Task[];
  users: User[];
  activity: { id: number; name: string; message: string; created_at: string }[];
};
type Session = {
  user: User | null;
  csrf: string;
  demo: boolean;
  googleConfigured: boolean;
  domain: string;
};
const statuses: Record<string, string> = {
  todo: "Por hacer",
  in_progress: "En progreso",
  review: "En revisión",
  done: "Completada",
};
const priorities: Record<string, string> = {
  urgent: "Urgente",
  high: "Alta",
  medium: "Media",
  low: "Baja",
};
const projectStatuses: Record<string, string> = {
  planning: "Planificación",
  active: "En curso",
  at_risk: "En riesgo",
  completed: "Completado",
};
const today = () => new Date().toLocaleDateString("en-CA");
const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const inDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return isoDate(d);
};
const fmt = (
  value: string,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" },
) =>
  new Date(
    value.length === 10 ? `${value}T12:00:00` : value,
  ).toLocaleDateString("es-MX", options);
const initials = (name: string) =>
  name
    .split(" ")
    .slice(0, 2)
    .map((v) => v[0])
    .join("");
const money = (n: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(n);
const avatarColors = ["#7c69ef", "#4e9e93", "#d99455", "#6891c8", "#c27899"];
let csrfToken = "";
async function api<T = any>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "No se pudo completar la solicitud");
  return data;
}
function Avatar({
  user,
  size = 30,
  index = 0,
}: {
  user?: User;
  size?: number;
  index?: number;
}) {
  return (
    <span
      className="avatar"
      title={user?.name || "Sin asignar"}
      style={{
        width: size,
        height: size,
        background: user ? avatarColors[index % 5] : "#e5e7ef",
        fontSize: size / 3.1,
      }}
    >
      {user ? initials(user.name) : "—"}
    </span>
  );
}
function GoogleLogo() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.05.96-3.38.96-2.6 0-4.8-1.75-5.59-4.1H3.07v2.59A10 10 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.41 13.94A6 6 0 0 1 6.1 12c0-.67.11-1.32.31-1.94V7.47H3.07A10 10 0 0 0 2 12c0 1.61.39 3.14 1.07 4.53l3.34-2.59Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.96c1.47 0 2.79.51 3.83 1.51l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.93 5.47l3.34 2.59C7.2 7.71 9.4 5.96 12 5.96Z"
      />
    </svg>
  );
}
function App() {
  const [taskInitialStatus, setTaskInitialStatus] = useState("todo");
  const [session, setSession] = useState<Session | null>(null),
    [data, setData] = useState<Workspace>({
      projects: [],
      tasks: [],
      users: [],
      activity: [],
    });
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [view, setView] = useState("overview"),
    [query, setQuery] = useState(""),
    [projectFilter, setProjectFilter] = useState("all"),
    [statusFilter, setStatusFilter] = useState("all"),
    [mine, setMine] = useState(false),
    [taskView, setTaskView] = useState("board");
  const [modal, setModal] = useState<"project" | "task" | "help" | null>(null),
    [editProject, setEditProject] = useState<Project | null>(null),
    [editTask, setEditTask] = useState<Task | null>(null),
    [toast, setToast] = useState<{ message: string; error?: boolean } | null>(
      null,
    ),
    [loading, setLoading] = useState(true),
    [fatal, setFatal] = useState(""),
    [sidebar, setSidebar] = useState(false),
    [notifications, setNotifications] = useState(false);
  const notify = (message: string, error = false) =>
    setToast({ message, error });
  const reload = async () => setData(await api<Workspace>("/workspace"));
  useEffect(() => {
    (async () => {
      try {
        let s = await api<Session>("/session");
        csrfToken = s.csrf;
        if (!s.user && s.demo) {
          const login = await api("/demo-login", "POST", {});
          csrfToken = login.csrf;
          s = { ...s, user: login.user, csrf: login.csrf };
        }
        setSession(s);
        if (s.user) await reload();
      } catch (e) {
        setFatal((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  const user = session?.user,
    admin = user?.role === "admin";
  const navigate = (v: string, p = "all") => {
    setView(v);
    setProjectFilter(p);
    setQuery("");
    setStatusFilter("all");
    setMine(false);
    setAssigneeFilter("all");
    setSidebar(false);
  };
  const newTask = (p?: string, status = "todo") => {
    if (!data.projects.length) {
      notify("Primero crea un proyecto", true);
      return;
    }
    setEditTask(null);
    setTaskInitialStatus(status);
    if (p) setProjectFilter(p);
    setModal("task");
  };
  const newProject = () => {
    setEditProject(null);
    setModal("project");
  };
  const openTask = (t: Task) => {
    setEditTask(t);
    setModal("task");
  };
  const connect = () => {
    if (!session?.googleConfigured) {
      notify(
        "Configura GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_WORKSPACE_DOMAIN y PM_EMAILS en el servidor para conectar Google.",
        true,
      );
      return;
    }
    window.location.href = "/auth/google";
  };
  const changeStatus = async (t: Task, status: string) => {
    try {
      await api(`/tasks/${t.id}`, "PUT", { ...t, status });
      await reload();
      notify("Estado actualizado");
    } catch (e) {
      notify((e as Error).message, true);
    }
  };
  const selectedProject = data.projects.find((p) => p.id === projectFilter);
  const filteredTasks = data.tasks.filter(
    (t) =>
      (projectFilter === "all" || t.project_id === projectFilter) &&
      (statusFilter === "all" || t.status === statusFilter) &&
      (!mine || t.assignee_id === user?.id) &&
      (assigneeFilter === "all" || t.assignee_id === assigneeFilter) &&
      `${t.title} ${t.description} ${data.projects.find((p) => p.id === t.project_id)?.name}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const filteredProjects = data.projects.filter((p) =>
    `${p.name} ${p.description}`.toLowerCase().includes(query.toLowerCase()),
  );
  const completed = data.tasks.filter((t) => t.status === "done").length;
  const overdue = data.tasks.filter(
    (t) => t.status !== "done" && t.due_date < isoDate(new Date()),
  );
  const dueSoon = data.tasks
    .filter((t) => t.status !== "done" && t.due_date <= inDays(7))
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  const userFor = (id: string | null) => data.users.find((u) => u.id === id);
  const exportCSV = () => {
    const headers = [
      "Tarea",
      "Proyecto",
      "Estado",
      "Prioridad",
      "Responsable",
      "Inicio",
      "Entrega",
      "Horas",
    ];
    const rows = filteredTasks.map((t) => [
      t.title,
      data.projects.find((p) => p.id === t.project_id)?.name || "",
      statuses[t.status],
      priorities[t.priority],
      userFor(t.assignee_id)?.name || "",
      t.start_date,
      t.due_date,
      t.estimate,
    ]);
    const safe = (v: unknown) => {
      let str = String(v);
      if (/^[=+@\-\t\r]/.test(str)) str = "'" + str;
      return '"' + str.replaceAll('"', '""') + '"';
    };
    const blob = new Blob(
      [
        "\uFEFF" +
          [headers, ...rows].map((r) => r.map(safe).join(",")).join("\r\n"),
      ],
      { type: "text/csv;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nexo-tareas-${isoDate(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    notify("Reporte exportado");
  };
  if (loading)
    return (
      <div className="loading-screen">
        <span className="brand-mark">n</span>
        <LoaderCircle className="spin" />
        <p>Preparando tu espacio de trabajo…</p>
      </div>
    );
  if (fatal)
    return (
      <div className="loading-screen">
        <AlertCircle />
        <h2>No se pudo cargar el espacio</h2>
        <p>{fatal}</p>
        <button className="btn primary" onClick={() => location.reload()}>
          Reintentar
        </button>
      </div>
    );
  if (!user)
    return (
      <div className="login">
        <div className="login-art">
          <div className="brand">
            <span className="brand-mark">n</span>nexo
            <span className="brand-dot">.</span>
          </div>
          <span className="eyebrow">TU EQUIPO. EN SINTONÍA.</span>
          <h1>
            Grandes proyectos.
            <br />
            Un mismo lugar.
          </h1>
          <p>
            Conecta personas, organiza ideas y convierte los planes de tu equipo
            en avances reales.
          </p>
          <div className="login-tiles">
            <span>
              <CheckCircle2 />
              Proyectos claros
            </span>
            <span>
              <Users />
              Equipos conectados
            </span>
            <span>
              <Activity />
              Avances visibles
            </span>
          </div>
          <div className="orb orb-one" />
          <div className="orb orb-two" />
        </div>
        <div className="login-form">
          <span className="mini-label">BIENVENIDO A NEXO</span>
          <h2>
            Tu próximo gran proyecto
            <br />
            empieza aquí.
          </h2>
          <p>Accede con la cuenta de Google Workspace de tu equipo.</p>
          {location.search.includes("auth_error") && (
            <div className="error-box">
              {location.search.includes("domain")
                ? "Tu cuenta no pertenece al dominio autorizado."
                : "No se pudo iniciar sesión. Verifica la configuración y los permisos de Google."}
            </div>
          )}
          <button className="btn google-signin" onClick={connect}>
            <GoogleLogo />
            Continuar con Google
            <ArrowRight size={18} />
          </button>
          <small>
            Acceso exclusivo para {session?.domain || "el equipo autorizado"}.
            <br />
            Tus proyectos permanecen dentro de tu organización.
          </small>
        </div>
        {toast && (
          <div role="alert" className="toast error">
            {toast.message}
          </div>
        )}
      </div>
    );
  return (
    <div className="app-shell">
      {sidebar && (
        <div className="sidebar-scrim" onClick={() => setSidebar(false)} />
      )}
      <aside className={`sidebar ${sidebar ? "open" : ""}`}>
        <div className="brand">
          <span className="brand-mark">n</span>nexo
          <span className="brand-dot">.</span>
        </div>
        <div className="workspace-switch">
          <span className="workspace-icon">N</span>
          <div>
            <strong>Mi espacio de trabajo</strong>
            <small>Equipo interno</small>
          </div>
          <ChevronDown size={14} />
        </div>
        <div className="nav-label">ESPACIO DE TRABAJO</div>
        <nav>
          {[
            ["overview", "Resumen", LayoutDashboard],
            ["projects", "Proyectos", FolderKanban],
            ["tasks", "Mis tareas", CheckSquare],
            ["timeline", "Cronograma", CalendarDays],
            ["team", "Equipo", Users],
          ].map(([id, label, Icon]: any) => (
            <button
              key={id}
              className={`nav-item ${view === id ? "active" : ""}`}
              onClick={() => {
                navigate(id);
                if (id === "tasks") setMine(true);
              }}
            >
              <Icon size={19} />
              <span>{label}</span>
              {id === "tasks" && (
                <b>
                  {
                    data.tasks.filter(
                      (t) => t.assignee_id === user.id && t.status !== "done",
                    ).length
                  }
                </b>
              )}
            </button>
          ))}
        </nav>
        <div className="nav-label projects-label">
          TUS PROYECTOS
          {admin && (
            <button
              className="icon-btn"
              aria-label="Crear proyecto"
              onClick={newProject}
            >
              <Plus size={16} />
            </button>
          )}
        </div>
        <div className="project-nav">
          {data.projects.slice(0, 5).map((p) => (
            <button
              key={p.id}
              onClick={() => navigate("tasks", p.id)}
              className={
                projectFilter === p.id && view === "tasks" ? "selected" : ""
              }
            >
              <i style={{ background: p.color }} />
              <span>{p.name}</span>
            </button>
          ))}
          {!data.projects.length && (
            <p className="sidebar-hint">Tus proyectos aparecerán aquí.</p>
          )}
        </div>
        <div className="sidebar-bottom">
          <div className="workspace-promo">
            <div className="promo-icon">
              <GoogleLogo />
            </div>
            <strong>Todo conectado.</strong>
            <p>Tu equipo y Google Workspace, en un solo lugar.</p>
            <button onClick={() => navigate("integrations")}>
              Ver integraciones
              <ArrowUpRight size={15} />
            </button>
          </div>
          <button
            className={`nav-item ${view === "integrations" ? "active" : ""}`}
            onClick={() => navigate("integrations")}
          >
            <Puzzle size={18} />
            Integraciones<span className="new-pill">NUEVO</span>
          </button>
          <button className="nav-item" onClick={() => setModal("help")}>
            <CircleHelp size={18} />
            Ayuda y primeros pasos
          </button>
          <div className="sidebar-user">
            <Avatar user={user} size={36} />
            <div>
              <strong>{user.name}</strong>
              <small>{admin ? "Project Manager" : "Miembro del equipo"}</small>
            </div>
            <button
              className="icon-btn"
              title="Cerrar sesión"
              onClick={async () => {
                await api("/logout", "POST", {});
                location.reload();
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button
            className="icon-btn mobile-menu"
            aria-label="Abrir menú"
            onClick={() => setSidebar(true)}
          >
            <Menu />
          </button>
          <div className="breadcrumb">
            Espacio de trabajo
            <ChevronRight size={14} />
            <strong>
              {
                {
                  overview: "Resumen",
                  projects: "Proyectos",
                  tasks: selectedProject?.name || "Mis tareas",
                  timeline: "Cronograma",
                  team: "Equipo",
                  integrations: "Integraciones",
                }[view]
              }
            </strong>
          </div>
          <div className="top-actions">
            <label className="search-box">
              <Search size={16} />
              <input
                aria-label="Buscar proyectos o tareas"
                placeholder="Buscar en tu espacio…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  if (!["projects", "tasks", "overview"].includes(view))
                    setView("tasks");
                }}
              />
              {query ? (
                <button
                  className="icon-btn"
                  aria-label="Limpiar búsqueda"
                  onClick={() => setQuery("")}
                >
                  <X size={13} />
                </button>
              ) : (
                <kbd>⌕</kbd>
              )}
            </label>
            <div className="notification-wrap">
              <button
                className="notification-btn icon-btn"
                aria-label="Próximas entregas"
                onClick={() => setNotifications(!notifications)}
              >
                <Bell size={20} />
                {dueSoon.length > 0 && <i />}
              </button>
              {notifications && (
                <div className="notification-panel">
                  <strong>Próximas entregas</strong>
                  <small>Incluye tareas vencidas</small>
                  {dueSoon.slice(0, 6).map((t) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        openTask(t);
                        setNotifications(false);
                      }}
                    >
                      <span>{t.title}</span>
                      <small
                        className={
                          t.due_date < isoDate(new Date()) ? "danger-text" : ""
                        }
                      >
                        {fmt(t.due_date)}
                      </small>
                    </button>
                  ))}
                  {!dueSoon.length && (
                    <p>Todo al día. No hay entregas próximas.</p>
                  )}
                </div>
              )}
            </div>
            <span className="top-divider" />
            <Avatar user={user} size={33} />
          </div>
        </header>
        <main>
          {session?.demo && (
            <div className="demo-banner">
              <span>
                <span className="live-dot" />
                Espacio de demostración · Datos de ejemplo, editables y
                guardados localmente.
              </span>
              <button onClick={() => navigate("integrations")}>
                Conectar Workspace
                <ArrowUpRight size={12} />
              </button>
            </div>
          )}
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {view === "overview"
                  ? "VAMOS A HACER QUE SUCEDA"
                  : view === "integrations"
                    ? "UN EQUIPO MÁS CONECTADO"
                    : "TU ESPACIO, ORGANIZADO"}
              </div>
              <h1>
                {view === "overview"
                  ? `Hola, ${user.name.split(" ")[0]} `
                  : view === "projects"
                    ? "Cada proyecto, bajo control."
                    : view === "tasks"
                      ? selectedProject?.name || "Tu trabajo, en movimiento."
                      : view === "timeline"
                        ? "Una perspectiva más amplia."
                        : view === "team"
                          ? "Las personas detrás del progreso."
                          : "Tus herramientas, juntas."}
                {view === "overview" && <span className="greeting-sun">✺</span>}
              </h1>
              <p>
                {view === "overview"
                  ? "Este es el pulso de tu equipo. Hagamos que hoy cuente."
                  : view === "projects"
                    ? "De la primera idea a la última entrega. Todo empieza aquí."
                    : view === "tasks"
                      ? selectedProject?.description ||
                        "Prioriza, colabora y da el siguiente paso."
                      : view === "timeline"
                        ? "Anticipa las entregas y mantén los planes en sintonía."
                        : view === "team"
                          ? "Distribuye el trabajo y encuentra el equilibrio del equipo."
                          : "Menos pestañas. Más tiempo para lo que importa."}
              </p>
            </div>
            <div className="heading-actions">
              {view === "overview" ? (
                <span className="date-pill">
                  <CalendarDays size={15} />
                  {fmt(isoDate(new Date()), {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </span>
              ) : null}
              {["overview", "projects"].includes(view) && admin ? (
                <button className="btn primary" onClick={newProject}>
                  <Plus size={17} />
                  Nuevo proyecto
                </button>
              ) : view === "tasks" ? (
                <button className="btn primary" onClick={() => newTask()}>
                  <Plus size={17} />
                  Nueva tarea
                </button>
              ) : view === "timeline" ? (
                <button className="btn secondary" onClick={exportCSV}>
                  <ArrowDownToLine size={16} />
                  Exportar tareas
                </button>
              ) : null}
            </div>
          </div>
          {view === "overview" && (
            <>
              <div className="stats-grid">
                <Stat
                  icon={<FolderKanban size={21} />}
                  label="Proyectos activos"
                  value={
                    data.projects.filter(
                      (p) => p.status === "active" || p.status === "at_risk",
                    ).length
                  }
                  meta={`${data.projects.length} proyectos en tu espacio`}
                  color="purple"
                  trend="En marcha"
                />
                <Stat
                  icon={<CheckCircle2 size={21} />}
                  label="Tareas completadas"
                  value={completed}
                  meta={`de ${data.tasks.length} tareas en total`}
                  color="green"
                  trend={
                    data.tasks.length
                      ? `${Math.round((completed / data.tasks.length) * 100)}% del total`
                      : "Sin tareas"
                  }
                />
                <Stat
                  icon={<Clock3 size={21} />}
                  label="Entregas próximas"
                  value={
                    dueSoon.filter((t) => t.due_date >= isoDate(new Date()))
                      .length
                  }
                  meta="Durante los próximos 7 días"
                  color="orange"
                  trend="Esta semana"
                />
                <Stat
                  icon={<Users size={21} />}
                  label="Miembros del equipo"
                  value={data.users.length}
                  meta="Personas construyendo juntas"
                  color="blue"
                  trend="En el espacio"
                />
              </div>
              <section className="section-block">
                <div className="section-heading">
                  <div>
                    <h2>
                      Proyectos en foco{" "}
                      <span className="count-badge">
                        {data.projects.length}
                      </span>
                    </h2>
                    <p>Una mirada rápida a lo que estamos construyendo.</p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => navigate("projects")}
                  >
                    Ver todos los proyectos
                    <ArrowRight size={15} />
                  </button>
                </div>
                <div className="project-grid">
                  {filteredProjects.slice(0, 3).map((p) => (
                    <ProjectCard
                      key={p.id}
                      project={p}
                      tasks={data.tasks.filter((t) => t.project_id === p.id)}
                      users={data.users}
                      onClick={() => navigate("tasks", p.id)}
                      onEdit={
                        admin
                          ? () => {
                              setEditProject(p);
                              setModal("project");
                            }
                          : undefined
                      }
                    />
                  ))}
                  {!filteredProjects.length && (
                    <Empty
                      icon={<FolderKanban />}
                      title={
                        query
                          ? "No encontramos proyectos"
                          : "El próximo gran proyecto empieza aquí"
                      }
                      text={
                        query
                          ? "Prueba con otra búsqueda."
                          : "Crea tu primer proyecto y reúne al equipo."
                      }
                      action={admin && !query ? newProject : undefined}
                      actionLabel="Crear proyecto"
                    />
                  )}
                </div>
              </section>
              <div className="overview-bottom">
                <section className="panel tasks-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>El siguiente paso</h2>
                      <p>Las entregas que necesitan tu atención.</p>
                    </div>
                    <button
                      className="icon-btn"
                      aria-label="Ver todas las tareas"
                      onClick={() => navigate("tasks")}
                    >
                      <ArrowUpRight size={19} />
                    </button>
                  </div>
                  <TaskTable
                    tasks={(query ? filteredTasks : dueSoon).slice(0, 5)}
                    projects={data.projects}
                    users={data.users}
                    onOpen={openTask}
                    compact
                  />
                  <div className="panel-footer">
                    <span>
                      {overdue.length ? (
                        <>
                          <i className="warning-dot" />
                          {overdue.length}{" "}
                          {overdue.length === 1
                            ? "tarea requiere"
                            : "tareas requieren"}{" "}
                          atención
                        </>
                      ) : (
                        <>
                          <Check size={14} />
                          Todo está al día
                        </>
                      )}
                    </span>
                    <button
                      className="text-button"
                      onClick={() => navigate("tasks")}
                    >
                      Ver tablero
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </section>
                <section className="panel progress-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Así vamos</h2>
                      <p>Cada pequeño avance cuenta.</p>
                    </div>
                    <Activity size={18} />
                  </div>
                  <div
                    className="donut"
                    style={
                      {
                        "--progress": `${data.tasks.length ? (completed / data.tasks.length) * 100 : 0}%`,
                      } as React.CSSProperties
                    }
                  >
                    <div>
                      <strong>
                        {data.tasks.length
                          ? Math.round((completed / data.tasks.length) * 100)
                          : 0}
                        <small>%</small>
                      </strong>
                      <span>completado</span>
                    </div>
                  </div>
                  <div className="progress-legend">
                    {Object.entries(statuses).map(([s, label]) => (
                      <button
                        key={s}
                        onClick={() => {
                          navigate("tasks");
                          setStatusFilter(s);
                        }}
                      >
                        <span>
                          <i className={`status-dot ${s}`} />
                          {label}
                        </span>
                        <b>{data.tasks.filter((t) => t.status === s).length}</b>
                      </button>
                    ))}
                  </div>
                </section>
              </div>
              <section className="activity-strip">
                <div className="activity-strip-icon">
                  <Activity size={18} />
                </div>
                <div>
                  <strong>El equipo sigue avanzando</strong>
                  <p>
                    {data.activity[0] ? (
                      <>
                        <b>{data.activity[0].name?.split(" ")[0]}</b>{" "}
                        {data.activity[0].message}.
                      </>
                    ) : (
                      "La actividad del equipo aparecerá aquí."
                    )}
                  </p>
                </div>
                <span>Última actividad</span>
                <button
                  className="icon-btn"
                  aria-label="Ver actividad del equipo"
                  onClick={() => navigate("team")}
                >
                  <ArrowRight size={17} />
                </button>
              </section>
            </>
          )}
          {view === "projects" && (
            <>
              <div className="toolbar">
                <div className="tabs">
                  <button className="active">
                    Todos los proyectos <span>{filteredProjects.length}</span>
                  </button>
                </div>
                <span className="muted">
                  {data.projects.filter((p) => p.status === "at_risk").length}{" "}
                  en riesgo
                </span>
              </div>
              <div className="project-grid all-projects">
                {filteredProjects.map((p) => (
                  <ProjectCard
                    key={p.id}
                    project={p}
                    tasks={data.tasks.filter((t) => t.project_id === p.id)}
                    users={data.users}
                    onClick={() => navigate("tasks", p.id)}
                    onEdit={
                      admin
                        ? () => {
                            setEditProject(p);
                            setModal("project");
                          }
                        : undefined
                    }
                  />
                ))}
                {admin && !query && (
                  <button className="add-project-card" onClick={newProject}>
                    <span>
                      <Plus size={24} />
                    </span>
                    <strong>Una nueva idea</strong>
                    <p>Dale un espacio a tu próximo proyecto.</p>
                  </button>
                )}
                {query && !filteredProjects.length && (
                  <Empty
                    icon={<Search />}
                    title="Sin resultados"
                    text="Intenta buscar otro nombre de proyecto."
                  />
                )}
              </div>
            </>
          )}
          {view === "tasks" && (
            <>
              <div className="toolbar wrap">
                <div className="tabs">
                  <button
                    className={taskView === "board" ? "active" : ""}
                    onClick={() => setTaskView("board")}
                  >
                    <LayoutGrid size={16} />
                    Tablero
                  </button>
                  <button
                    className={taskView === "list" ? "active" : ""}
                    onClick={() => setTaskView("list")}
                  >
                    <List size={16} />
                    Lista
                  </button>
                </div>
                <div className="filter-actions">
                  <label className="select-wrap">
                    <SlidersHorizontal size={14} />
                    <select
                      aria-label="Filtrar proyecto"
                      value={projectFilter}
                      onChange={(e) => setProjectFilter(e.target.value)}
                    >
                      <option value="all">Todos los proyectos</option>
                      {data.projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <select
                    aria-label="Filtrar estado"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <option value="all">Todos los estados</option>
                    {Object.entries(statuses).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Filtrar responsable"
                    value={assigneeFilter}
                    onChange={(e) => {
                      setAssigneeFilter(e.target.value);
                      setMine(false);
                    }}
                  >
                    <option value="all">Todos los responsables</option>
                    {data.users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className={`btn small ${mine ? "selected-btn" : "secondary"}`}
                    onClick={() => {
                      setMine(!mine);
                      setAssigneeFilter("all");
                    }}
                  >
                    <Users size={14} />
                    {mine ? "Solo mis tareas" : "Todo el equipo"}
                  </button>
                  <button
                    className="icon-btn"
                    aria-label="Exportar CSV"
                    onClick={exportCSV}
                  >
                    <ArrowDownToLine size={18} />
                  </button>
                </div>
              </div>
              {taskView === "list" ? (
                <div className="panel">
                  <TaskTable
                    tasks={filteredTasks}
                    projects={data.projects}
                    users={data.users}
                    onOpen={openTask}
                  />
                </div>
              ) : (
                <div className="kanban">
                  {Object.entries(statuses).map(([s, label]) => (
                    <section
                      key={s}
                      className="kanban-column"
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const t = data.tasks.find(
                          (t) => t.id === e.dataTransfer.getData("text/plain"),
                        );
                        if (t) changeStatus(t, s);
                      }}
                    >
                      <div className="column-heading">
                        <span>
                          <i className={`status-dot ${s}`} />
                          {label}
                          <b>
                            {filteredTasks.filter((t) => t.status === s).length}
                          </b>
                        </span>
                        <button
                          className="icon-btn"
                          aria-label={`Crear tarea en ${label}`}
                          onClick={() => newTask(undefined, s)}
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                      <div className="column-body">
                        {filteredTasks
                          .filter((t) => t.status === s)
                          .map((t) => (
                            <article
                              className="task-card"
                              key={t.id}
                              draggable
                              onDragStart={(e) =>
                                e.dataTransfer.setData("text/plain", t.id)
                              }
                            >
                              <button
                                className="task-card-content"
                                onClick={() => openTask(t)}
                              >
                                <small
                                  style={{
                                    color: data.projects.find(
                                      (p) => p.id === t.project_id,
                                    )?.color,
                                  }}
                                >
                                  {
                                    data.projects.find(
                                      (p) => p.id === t.project_id,
                                    )?.name
                                  }
                                </small>
                                <h3>{t.title}</h3>
                                <p>{t.description}</p>
                                <span className={`priority ${t.priority}`}>
                                  <Flag size={11} />
                                  {priorities[t.priority]}
                                </span>
                              </button>
                              <footer>
                                <span
                                  className={
                                    t.due_date < isoDate(new Date()) &&
                                    s !== "done"
                                      ? "danger-text"
                                      : ""
                                  }
                                >
                                  <CalendarDays size={13} />
                                  {fmt(t.due_date)}
                                </span>
                                <Avatar
                                  user={userFor(t.assignee_id)}
                                  size={26}
                                  index={data.users.findIndex(
                                    (u) => u.id === t.assignee_id,
                                  )}
                                />
                              </footer>
                              <select
                                aria-label={`Estado de ${t.title}`}
                                value={s}
                                onChange={(e) =>
                                  changeStatus(t, e.target.value)
                                }
                              >
                                {Object.entries(statuses).map(([k, v]) => (
                                  <option key={k} value={k}>
                                    {v}
                                  </option>
                                ))}
                              </select>
                            </article>
                          ))}
                        {!filteredTasks.some((t) => t.status === s) && (
                          <div className="column-empty">
                            Sin tareas aquí.
                            <br />
                            Hay espacio para el siguiente paso.
                          </div>
                        )}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </>
          )}
          {view === "timeline" && (
            <Timeline
              projects={data.projects}
              tasks={data.tasks}
              onOpen={openTask}
            />
          )}
          {view === "team" && (
            <>
              <div className="team-summary">
                <span className="soft-icon purple">
                  <Users size={22} />
                </span>
                <div>
                  <strong>Un buen equipo encuentra su equilibrio.</strong>
                  <p>
                    Las horas muestran el esfuerzo pendiente estimado en todas
                    las fechas; no representan disponibilidad semanal.
                  </p>
                </div>
              </div>
              <div className="team-grid">
                {data.users.map((u, i) => {
                  const tasks = data.tasks.filter(
                    (t) => t.assignee_id === u.id,
                  );
                  const pending = tasks.filter((t) => t.status !== "done");
                  const hours = pending.reduce((n, t) => n + t.estimate, 0);
                  return (
                    <article className="panel member-card" key={u.id}>
                      <div className="member-top">
                        <Avatar user={u} size={52} index={i} />
                        <span
                          className={`role-badge ${u.role === "admin" ? "pm" : ""}`}
                        >
                          {u.role === "admin" ? "Project Manager" : "Miembro"}
                        </span>
                      </div>
                      <h3>{u.name}</h3>
                      <p>{u.email}</p>
                      <div className="member-stats">
                        <div>
                          <strong>{pending.length}</strong>
                          <span>En curso</span>
                        </div>
                        <div>
                          <strong>{tasks.length - pending.length}</strong>
                          <span>Completadas</span>
                        </div>
                        <div>
                          <strong>
                            {hours}
                            <small> h</small>
                          </strong>
                          <span>Pendientes</span>
                        </div>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => {
                          navigate("tasks");
                          setQuery("");
                          setMine(u.id === user.id);
                          setStatusFilter("all");
                          setTaskView("list");
                          setAssigneeView(u.id);
                        }}
                      >
                        Ver tareas
                        <ArrowRight size={14} />
                      </button>
                    </article>
                  );
                })}
              </div>
              <section className="panel activity-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Actividad del equipo</h2>
                    <p>Las últimas novedades de tu espacio de trabajo.</p>
                  </div>
                </div>
                {data.activity.map((a) => (
                  <div className="activity-row" key={a.id}>
                    <Avatar
                      user={data.users.find((u) => u.name === a.name)}
                      size={30}
                    />
                    <p>
                      <strong>{a.name}</strong> {a.message}
                    </p>
                    <small>
                      {fmt(a.created_at, {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </small>
                  </div>
                ))}
                {!data.activity.length && (
                  <p className="empty-text">
                    Aquí aparecerán las primeras novedades.
                  </p>
                )}
              </section>
            </>
          )}
          {view === "integrations" && (
            <>
              <div className="workspace-hero">
                <div className="workspace-hero-logos">
                  <GoogleLogo />
                  <Plus size={18} />
                  <span className="brand-mark">n</span>
                </div>
                <div>
                  <span className="eyebrow">GOOGLE WORKSPACE + NEXO</span>
                  <h2>
                    Más conexión.
                    <br />
                    Menos trabajo duplicado.
                  </h2>
                  <p>
                    Tu identidad, tus archivos y tus entregas, conectados con
                    las herramientas que ya usa tu equipo.
                  </p>
                </div>
                <div className="connection-badge">
                  <i
                    className={
                      user.googleConnected ? "live-dot" : "offline-dot"
                    }
                  />
                  {user.googleConnected
                    ? "Cuenta conectada"
                    : "Cuenta sin conectar"}
                </div>
              </div>
              <div className="integration-grid">
                {[
                  {
                    title: "Google Workspace",
                    sub: "Un acceso seguro para tu equipo",
                    icon: <GoogleLogo />,
                    text: "Inicia sesión con la cuenta de tu organización. El acceso está restringido al dominio autorizado.",
                    action: user.googleConnected
                      ? "Cuenta conectada"
                      : "Conectar cuenta",
                    click: connect,
                  },
                  {
                    title: "Google Calendar",
                    sub: "Cada entrega en su lugar",
                    icon: <CalendarDays size={25} />,
                    text: "Crea o actualiza un evento en tu calendario desde una tarea. Tú decides cuándo sincronizar.",
                    action: "Ir a mis tareas",
                    click: () => navigate("tasks"),
                  },
                  {
                    title: "Google Drive",
                    sub: "El contexto, siempre a mano",
                    icon: <FolderKanban size={25} />,
                    text: "Busca archivos de tu Drive y vincúlalos a una tarea. Se mantienen los permisos originales de Google.",
                    action: "Vincular desde una tarea",
                    click: () => navigate("tasks"),
                  },
                ].map((item, i) => (
                  <article key={item.title} className="panel integration-card">
                    <div className={`integration-logo logo-${i}`}>
                      {item.icon}
                    </div>
                    <h3>{item.title}</h3>
                    <strong>{item.sub}</strong>
                    <p>{item.text}</p>
                    <button className="btn secondary" onClick={item.click}>
                      {item.action}
                      <ArrowUpRight size={15} />
                    </button>
                  </article>
                ))}
              </div>
              <div className="panel integration-settings">
                <div>
                  <h3>Configuración de la organización</h3>
                  <p>
                    Dominio autorizado:{" "}
                    <strong>
                      {session?.domain || "Pendiente de configuración"}
                    </strong>
                  </p>
                  <p>
                    Los miembros aparecen al iniciar sesión por primera vez con
                    su cuenta corporativa.
                  </p>
                  {session?.demo && (
                    <p>
                      Los cambios del modo demo no se transfieren al espacio
                      real.
                    </p>
                  )}
                </div>
                {user.googleConnected ? (
                  <button
                    className="btn danger"
                    onClick={async () => {
                      if (
                        !confirm(
                          "¿Desconectar Calendar y Drive? Podrás seguir usando Nexo y volver a conectar después.",
                        )
                      )
                        return;
                      try {
                        await api("/google/disconnect", "POST", {});
                        const s = await api("/session");
                        csrfToken = s.csrf;
                        setSession(s);
                        notify("Cuenta desconectada");
                      } catch (e) {
                        notify((e as Error).message, true);
                      }
                    }}
                  >
                    Desconectar Google
                  </button>
                ) : (
                  <span className="setup-tag">
                    <Settings2 size={15} />
                    {session?.googleConfigured
                      ? "OAuth configurado"
                      : "OAuth pendiente"}
                  </span>
                )}
              </div>
            </>
          )}
          <footer className="page-footer">
            <span>
              <span className="footer-logo">n</span>Un espacio para avanzar
              juntos.
            </span>
            <span>Nexo · Gestión de proyectos</span>
          </footer>
        </main>
      </div>
      {modal === "project" && (
        <ProjectModal
          project={editProject}
          close={() => setModal(null)}
          saved={async () => {
            await reload();
            setModal(null);
            notify(
              editProject
                ? "Proyecto actualizado"
                : "Tu nuevo proyecto está listo",
            );
          }}
          notify={notify}
        />
      )}
      {modal === "task" && (
        <TaskModal
          task={editTask}
          defaultStatus={taskInitialStatus}
          defaultProject={
            projectFilter === "all" ? data.projects[0]?.id : projectFilter
          }
          projects={data.projects}
          users={data.users}
          admin={!!admin}
          connected={!!user.googleConnected}
          close={() => setModal(null)}
          saved={async () => {
            await reload();
            setModal(null);
            notify("Tarea guardada");
          }}
          notify={notify}
        />
      )}
      {modal === "help" && (
        <Modal
          title="Tu equipo, en sintonía"
          subtitle="Tres pasos para empezar con Nexo."
          close={() => setModal(null)}
        >
          <div className="help-steps">
            {[
              [
                "01",
                "Dale espacio a tu proyecto",
                "Crea un proyecto, define fechas y presupuesto. El PM puede actualizarlo en cualquier momento.",
              ],
              [
                "02",
                "Convierte los planes en tareas",
                "Asigna responsables, prioriza y mueve las tareas por el tablero. Los comentarios mantienen al equipo al día.",
              ],
              [
                "03",
                "Conecta lo que ya usas",
                "Accede con Google Workspace, vincula archivos de Drive y envía entregas a tu Calendar.",
              ],
            ].map(([n, title, text]) => (
              <div key={n}>
                <b>{n}</b>
                <section>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </section>
              </div>
            ))}
          </div>
          <div className="info-box">
            El cronograma y los indicadores se calculan con tus datos. La
            sincronización con Calendar es manual desde cada tarea.
          </div>
        </Modal>
      )}
      {toast && (
        <div role="alert" className={`toast ${toast.error ? "error" : ""}`}>
          {toast.error ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
          <span>{toast.message}</span>
          <button
            className="icon-btn"
            aria-label="Cerrar aviso"
            onClick={() => setToast(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
  function setAssigneeView(id: string) {
    setMine(false);
    setAssigneeFilter(id);
  }
}
function Stat({
  icon,
  label,
  value,
  meta,
  color,
  trend,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  meta: string;
  color: string;
  trend: string;
}) {
  return (
    <article className="stat-card">
      <div className="stat-top">
        <span className={`soft-icon ${color}`}>{icon}</span>
        <span className={`stat-trend ${color}`}>{trend}</span>
      </div>
      <div className="stat-number">
        {value}
        <span>{label}</span>
      </div>
      <p>{meta}</p>
    </article>
  );
}
function ProjectCard({
  project: p,
  tasks,
  users,
  onClick,
  onEdit,
}: {
  project: Project;
  tasks: Task[];
  users: User[];
  onClick: () => void;
  onEdit?: () => void;
}) {
  const done = tasks.filter((t) => t.status === "done").length;
  const progress = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const members = users.filter((u) =>
    tasks.some((t) => t.assignee_id === u.id),
  );
  return (
    <article
      className="project-card"
      style={{ "--project-color": p.color } as React.CSSProperties}
    >
      <div className="project-card-top">
        <span className="project-icon">
          <FolderKanban size={22} />
        </span>
        <span className={`project-status ${p.status}`}>
          <i />
          {projectStatuses[p.status]}
        </span>
        {onEdit && (
          <button
            className="icon-btn"
            aria-label={`Editar ${p.name}`}
            title="Editar proyecto"
            onClick={onEdit}
          >
            <MoreHorizontal size={19} />
          </button>
        )}
      </div>
      <button className="project-title-btn" onClick={onClick}>
        <h3>{p.name}</h3>
        <ArrowUpRight size={17} />
      </button>
      <p className="project-description">
        {p.description || "Un nuevo objetivo para construir juntos."}
      </p>
      <div className="project-progress-label">
        <span>Progreso</span>
        <strong>{progress}%</strong>
      </div>
      <div className="progress-track">
        <i style={{ width: `${progress}%`, background: p.color }} />
      </div>
      <div className="project-card-meta">
        <span>
          <CheckSquare size={13} />
          {done}/{tasks.length} tareas
        </span>
        <span>
          <CalendarDays size={13} />
          {fmt(p.due_date)}
        </span>
      </div>
      <div className="project-card-footer">
        <div className="avatar-stack">
          {members.slice(0, 4).map((u) => (
            <Avatar key={u.id} user={u} size={27} index={users.indexOf(u)} />
          ))}
          {members.length > 4 && (
            <span className="more-members">+{members.length - 4}</span>
          )}
          {!members.length && (
            <span className="muted">Sin responsables aún</span>
          )}
        </div>
        <button
          aria-label={`Abrir ${p.name}`}
          className="round-arrow"
          onClick={onClick}
        >
          <ArrowUpRight size={16} />
        </button>
      </div>
    </article>
  );
}
function Empty({
  icon,
  title,
  text,
  action,
  actionLabel,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  action?: () => void;
  actionLabel?: string;
}) {
  return (
    <div className="empty-state">
      <span>{icon}</span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action && (
        <button className="btn primary" onClick={action}>
          <Plus size={16} />
          {actionLabel}
        </button>
      )}
    </div>
  );
}
function TaskTable({
  tasks,
  projects,
  users,
  onOpen,
  compact = false,
}: {
  tasks: Task[];
  projects: Project[];
  users: User[];
  onOpen: (t: Task) => void;
  compact?: boolean;
}) {
  return tasks.length ? (
    <div className="table-scroll">
      <table className={`task-table ${compact ? "compact" : ""}`}>
        <thead>
          <tr>
            <th>Tarea</th>
            <th>Estado</th>
            {!compact && <th>Prioridad</th>}
            <th>Entrega</th>
            <th className="assignee-heading">{compact ? "" : "Responsable"}</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => (
            <tr key={t.id}>
              <td>
                <button onClick={() => onOpen(t)}>
                  <span
                    className={`task-check ${t.status === "done" ? "checked" : ""}`}
                  >
                    {t.status === "done" && <Check size={11} />}
                  </span>
                  <div>
                    <strong>{t.title}</strong>
                    <small>
                      {projects.find((p) => p.id === t.project_id)?.name}
                    </small>
                  </div>
                </button>
              </td>
              <td>
                <span className={`status-badge ${t.status}`}>
                  <i />
                  {statuses[t.status]}
                </span>
              </td>
              {!compact && (
                <td>
                  <span className={`priority ${t.priority}`}>
                    {priorities[t.priority]}
                  </span>
                </td>
              )}
              <td>
                <span
                  className={`table-date ${t.due_date < isoDate(new Date()) && t.status !== "done" ? "danger-text" : ""}`}
                >
                  {fmt(t.due_date)}
                </span>
              </td>
              <td>
                <Avatar
                  user={users.find((u) => u.id === t.assignee_id)}
                  size={28}
                  index={Math.max(
                    0,
                    users.findIndex((u) => u.id === t.assignee_id),
                  )}
                />
                {!compact && (
                  <span className="table-assignee">
                    {users
                      .find((u) => u.id === t.assignee_id)
                      ?.name.split(" ")[0] || "Sin asignar"}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty
      icon={<CheckCircle2 />}
      title="Todo despejado por aquí"
      text="Crea una tarea o cambia los filtros para ver más trabajo."
    />
  );
}
function Timeline({
  projects,
  tasks,
  onOpen,
}: {
  projects: Project[];
  tasks: Task[];
  onOpen: (t: Task) => void;
}) {
  const [offset, setOffset] = useState(0);
  const start = new Date();
  start.setDate(start.getDate() - 7 + offset * 28);
  const startStr = isoDate(start);
  const days = 35;
  const end = new Date(start);
  end.setDate(end.getDate() + days);
  const endStr = isoDate(end);
  const diff = (a: string, b: string) =>
    Math.round((Date.parse(a) - Date.parse(b)) / 86400000);
  const visible = tasks.filter(
    (t) => t.due_date >= startStr && t.start_date <= endStr,
  );
  const todayOffset = diff(isoDate(new Date()), startStr);
  return (
    <div className="panel timeline-panel">
      <div className="timeline-toolbar">
        <div>
          <h3>
            {fmt(startStr, { month: "long", year: "numeric" })} —{" "}
            {fmt(endStr, { month: "long", year: "numeric" })}
          </h3>
          <p>Haz clic en una barra para abrir la tarea.</p>
        </div>
        <div>
          <button
            className="btn secondary small"
            onClick={() => setOffset(offset - 1)}
            aria-label="Periodo anterior"
          >
            ←
          </button>
          <button className="btn secondary small" onClick={() => setOffset(0)}>
            Hoy
          </button>
          <button
            className="btn secondary small"
            onClick={() => setOffset(offset + 1)}
            aria-label="Periodo siguiente"
          >
            →
          </button>
        </div>
      </div>
      <div className="timeline-scroll">
        <div className="timeline-content">
          <div className="timeline-row timeline-header">
            <div>PROYECTO / TAREA</div>
            <div className="timeline-dates">
              {Array.from({ length: 7 }, (_, i) => {
                const d = new Date(start);
                d.setDate(d.getDate() + i * 5);
                return <span key={i}>{fmt(isoDate(d))}</span>;
              })}
            </div>
          </div>
          {projects.map((p) => (
            <React.Fragment key={p.id}>
              <div className="timeline-project">
                <i style={{ background: p.color }} />
                {p.name}
              </div>
              {visible
                .filter((t) => t.project_id === p.id)
                .map((t) => {
                  const left =
                    (Math.max(0, diff(t.start_date, startStr)) / days) * 100;
                  const width =
                    (Math.max(
                      1,
                      Math.min(days, diff(t.due_date, startStr) + 1) -
                        Math.max(0, diff(t.start_date, startStr)),
                    ) /
                      days) *
                    100;
                  return (
                    <div className="timeline-row" key={t.id}>
                      <button
                        className="timeline-task-title"
                        onClick={() => onOpen(t)}
                      >
                        <i className={`status-dot ${t.status}`} />
                        {t.title}
                      </button>
                      <div className="timeline-track">
                        {todayOffset >= 0 && todayOffset <= days && (
                          <i
                            className="today-line"
                            style={{ left: `${(todayOffset / days) * 100}%` }}
                          />
                        )}
                        <button
                          className={`timeline-bar ${t.status === "done" ? "complete" : ""}`}
                          style={{
                            left: `${left}%`,
                            width: `${Math.min(width, 100 - left)}%`,
                            background: p.color,
                          }}
                          onClick={() => onOpen(t)}
                          title={`${t.title}: ${fmt(t.start_date)} – ${fmt(t.due_date)}`}
                        >
                          {t.status === "done" ? <Check size={12} /> : null}
                          <span>{t.title}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
            </React.Fragment>
          ))}
          {!visible.length && (
            <Empty
              icon={<CalendarDays />}
              title="Sin tareas en este período"
              text="Explora otro período o crea tareas con fechas de entrega."
            />
          )}
        </div>
      </div>
      <div className="timeline-key">
        <i />
        Hoy<span>Fechas de tareas · Sin cálculo de dependencias</span>
      </div>
    </div>
  );
}
function Modal({
  title,
  subtitle,
  close,
  children,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  close: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const listener = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab") {
        const nodes = ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input,textarea,select,a[href],[tabindex="0"]',
        );
        if (!nodes?.length) return;
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", listener);
    return () => {
      document.body.style.overflow = old;
      document.removeEventListener("keydown", listener);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        ref={ref}
        tabIndex={-1}
      >
        <div className="modal-heading">
          <div>
            <span className="mini-label">ESPACIO DE TRABAJO</span>
            <h2 id="modal-title">{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-btn" aria-label="Cerrar" onClick={close}>
            <X size={21} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
function ProjectModal({
  project,
  close,
  saved,
  notify,
}: {
  project: Project | null;
  close: () => void;
  saved: () => Promise<void>;
  notify: (m: string, e?: boolean) => void;
}) {
  const [form, setForm] = useState({
    name: project?.name || "",
    description: project?.description || "",
    color: project?.color || "#7c69ef",
    status: project?.status || "planning",
    start_date: project?.start_date || isoDate(new Date()),
    due_date: project?.due_date || inDays(30),
    budget: project?.budget || 0,
    spent: project?.spent || 0,
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const field = (k: string, v: string | number) => setForm({ ...form, [k]: v });
  return (
    <Modal
      title={project ? "Editar proyecto" : "Un nuevo comienzo"}
      subtitle="Define el rumbo. El equipo se encarga de hacerlo realidad."
      close={close}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await api(
              project ? `/projects/${project.id}` : "/projects",
              project ? "PUT" : "POST",
              form,
            );
            await saved();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Nombre del proyecto
          <input
            required
            minLength={2}
            maxLength={120}
            autoFocus
            placeholder="Ej. Rediseño de plataforma"
            value={form.name}
            onChange={(e) => field("name", e.target.value)}
          />
        </label>
        <label>
          Descripción
          <textarea
            rows={3}
            maxLength={3000}
            placeholder="¿Qué vamos a construir juntos?"
            value={form.description}
            onChange={(e) => field("description", e.target.value)}
          />
        </label>
        <div className="form-grid">
          <label>
            Fecha de inicio
            <input
              type="date"
              required
              value={form.start_date}
              onChange={(e) => field("start_date", e.target.value)}
            />
          </label>
          <label>
            Fecha de entrega
            <input
              type="date"
              required
              min={form.start_date}
              value={form.due_date}
              onChange={(e) => field("due_date", e.target.value)}
            />
          </label>
          <label>
            Estado
            <select
              value={form.status}
              onChange={(e) => field("status", e.target.value)}
            >
              {Object.entries(projectStatuses).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            Color del proyecto
            <div className="color-picker">
              {avatarColors.map((c) => (
                <button
                  type="button"
                  key={c}
                  aria-label={`Color ${c}`}
                  className={form.color === c ? "chosen" : ""}
                  style={{ background: c }}
                  onClick={() => field("color", c)}
                >
                  {form.color === c && <Check size={15} />}
                </button>
              ))}
            </div>
          </label>
          <label>
            Presupuesto (MXN)
            <input
              type="number"
              min={0}
              max={1e10}
              step="0.01"
              value={form.budget}
              onChange={(e) => field("budget", Number(e.target.value))}
            />
          </label>
          <label>
            Gasto registrado (MXN)
            <input
              type="number"
              min={0}
              max={1e10}
              step="0.01"
              value={form.spent}
              onChange={(e) => field("spent", Number(e.target.value))}
            />
          </label>
        </div>
        {form.budget > 0 && (
          <div className="info-box">
            Disponible: {money(form.budget - form.spent)} ·{" "}
            {Math.round((form.spent / form.budget) * 100)}% utilizado
          </div>
        )}
        {error && (
          <div role="alert" className="error-box">
            {error}
          </div>
        )}
        <div className="modal-footer">
          {project && (
            <button
              type="button"
              className="icon-btn danger-text"
              title="Eliminar proyecto"
              disabled={busy}
              onClick={async () => {
                if (
                  !confirm(
                    "¿Eliminar este proyecto y todas sus tareas y comentarios? Esta acción no se puede deshacer.",
                  )
                )
                  return;
                setBusy(true);
                try {
                  await api(`/projects/${project.id}`, "DELETE");
                  await saved();
                  notify("Proyecto eliminado");
                } catch (e) {
                  setError((e as Error).message);
                  setBusy(false);
                }
              }}
            >
              <Trash2 size={18} />
            </button>
          )}
          <span className="spacer" />
          <button
            type="button"
            className="btn secondary"
            onClick={close}
            disabled={busy}
          >
            Cancelar
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <Check size={16} />
            )}{" "}
            {project ? "Guardar cambios" : "Crear proyecto"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function TaskModal({
  task,
  defaultStatus,
  defaultProject,
  projects,
  users,
  admin,
  connected,
  close,
  saved,
  notify,
}: {
  task: Task | null;
  defaultStatus: string;
  defaultProject: string;
  projects: Project[];
  users: User[];
  admin: boolean;
  connected: boolean;
  close: () => void;
  saved: () => Promise<void>;
  notify: (m: string, e?: boolean) => void;
}) {
  const [form, setForm] = useState({
    project_id: task?.project_id || defaultProject,
    title: task?.title || "",
    description: task?.description || "",
    status: task?.status || defaultStatus,
    priority: task?.priority || "medium",
    assignee_id: task?.assignee_id || null,
    start_date: task?.start_date || isoDate(new Date()),
    due_date: task?.due_date || inDays(7),
    estimate: task?.estimate || 0,
    drive_url: task?.drive_url || "",
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [comments, setComments] = useState<Comment[]>([]),
    [comment, setComment] = useState(""),
    [drive, setDrive] = useState(false),
    [driveQuery, setDriveQuery] = useState(""),
    [files, setFiles] = useState<
      { id: string; name: string; webViewLink?: string }[]
    >([]),
    [driveLoading, setDriveLoading] = useState(false),
    [commentBusy, setCommentBusy] = useState(false),
    [calendarBusy, setCalendarBusy] = useState(false);
  const field = (k: string, v: unknown) => setForm({ ...form, [k]: v });
  useEffect(() => {
    if (task)
      api<Comment[]>(`/tasks/${task.id}/comments`)
        .then(setComments)
        .catch((e) => setError(e.message));
  }, [task?.id]);
  const searchDrive = async () => {
    setDriveLoading(true);
    setError("");
    try {
      setFiles(await api(`/google/files?q=${encodeURIComponent(driveQuery)}`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDriveLoading(false);
    }
  };
  return (
    <Modal
      wide
      title={task ? "Un paso más cerca" : "¿Cuál es el siguiente paso?"}
      subtitle={
        task
          ? "Actualiza los detalles y mantén a todos en sintonía."
          : "Transforma una idea en una tarea concreta."
      }
      close={close}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await api(
              task ? `/tasks/${task.id}` : "/tasks",
              task ? "PUT" : "POST",
              form,
            );
            await saved();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Nombre de la tarea
          <input
            required
            minLength={2}
            maxLength={200}
            autoFocus
            placeholder="Ej. Diseñar la página de inicio"
            value={form.title}
            onChange={(e) => field("title", e.target.value)}
          />
        </label>
        <label>
          Descripción
          <textarea
            rows={3}
            maxLength={5000}
            placeholder="Comparte el contexto y los resultados esperados…"
            value={form.description}
            onChange={(e) => field("description", e.target.value)}
          />
        </label>
        <div className="form-grid">
          <label>
            Proyecto
            <select
              value={form.project_id}
              onChange={(e) => field("project_id", e.target.value)}
              required
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Responsable
            <select
              value={form.assignee_id || ""}
              onChange={(e) => field("assignee_id", e.target.value || null)}
            >
              <option value="">Sin asignar</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Estado
            <select
              value={form.status}
              onChange={(e) => field("status", e.target.value)}
            >
              {Object.entries(statuses).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            Prioridad
            <select
              value={form.priority}
              onChange={(e) => field("priority", e.target.value)}
            >
              {Object.entries(priorities).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            Fecha de inicio
            <input
              type="date"
              required
              value={form.start_date}
              onChange={(e) => field("start_date", e.target.value)}
            />
          </label>
          <label>
            Fecha de entrega
            <input
              type="date"
              required
              min={form.start_date}
              value={form.due_date}
              onChange={(e) => field("due_date", e.target.value)}
            />
          </label>
          <label>
            Esfuerzo estimado (horas)
            <input
              type="number"
              min={0}
              max={10000}
              step="0.5"
              value={form.estimate}
              onChange={(e) => field("estimate", Number(e.target.value))}
            />
          </label>
          <div className="calendar-field">
            <span>Google Calendar</span>
            <button
              type="button"
              className="btn secondary"
              disabled={!task || !connected || calendarBusy}
              title={
                !connected
                  ? "Primero conecta Google Workspace"
                  : !task
                    ? "Guarda la tarea primero"
                    : "Se sincronizan los últimos datos guardados"
              }
              onClick={async () => {
                if (!task) return;
                setCalendarBusy(true);
                try {
                  const { url } = await api(
                    `/tasks/${task.id}/calendar`,
                    "POST",
                    {},
                  );
                  notify(
                    url
                      ? "Evento creado o actualizado en tu Calendar"
                      : "Calendar actualizado",
                  );
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setCalendarBusy(false);
                }
              }}
            >
              {calendarBusy ? (
                <LoaderCircle className="spin" size={15} />
              ) : (
                <CalendarDays size={15} />
              )}
              Sincronizar tarea guardada
            </button>
          </div>
        </div>
        <label>
          Archivo de Google Drive
          <div className="input-with-button">
            <input
              type="url"
              aria-label="Archivo de Google Drive"
              placeholder="https://drive.google.com/…"
              value={form.drive_url}
              onChange={(e) => field("drive_url", e.target.value)}
            />
            <button
              type="button"
              className="btn secondary"
              disabled={!connected}
              title={
                !connected
                  ? "Conecta Google para buscar en Drive"
                  : "Buscar en Drive"
              }
              onClick={() => {
                setDrive(!drive);
                if (!drive) searchDrive();
              }}
            >
              <Search size={15} />
              Buscar
            </button>
            {form.drive_url &&
              /^https:\/\/(drive|docs)\.google\.com\//.test(form.drive_url) && (
                <a
                  className="btn secondary"
                  href={form.drive_url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Abrir archivo de Drive"
                >
                  <ExternalLink size={15} />
                </a>
              )}
          </div>
        </label>
        {drive && (
          <div className="drive-picker">
            <div className="input-with-button">
              <input
                aria-label="Nombre del archivo"
                placeholder="Buscar por nombre…"
                value={driveQuery}
                onChange={(e) => setDriveQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    searchDrive();
                  }
                }}
              />
              <button
                type="button"
                className="btn secondary"
                disabled={driveLoading}
                onClick={searchDrive}
              >
                {driveLoading ? "Buscando…" : "Buscar"}
              </button>
            </div>
            {files.map((f) => (
              <button
                type="button"
                className="drive-file"
                key={f.id}
                onClick={() => {
                  field(
                    "drive_url",
                    f.webViewLink ||
                      `https://drive.google.com/file/d/${f.id}/view`,
                  );
                  setDrive(false);
                }}
              >
                <FolderKanban size={15} />
                {f.name}
                <Link2 size={14} />
              </button>
            ))}
            {!files.length && !driveLoading && (
              <p>No se encontraron archivos. Prueba otro nombre.</p>
            )}
          </div>
        )}
        {!connected && (
          <div className="info-box">
            <GoogleLogo />
            Conecta tu cuenta en Integraciones para buscar en Drive y
            sincronizar con Calendar. También puedes pegar un enlace de Drive.
          </div>
        )}
        {error && (
          <div role="alert" className="error-box">
            {error}
          </div>
        )}
        <div className="modal-footer">
          {task && admin && (
            <button
              type="button"
              className="icon-btn danger-text"
              disabled={busy}
              aria-label="Eliminar tarea"
              onClick={async () => {
                if (!confirm("¿Eliminar esta tarea y sus comentarios?")) return;
                setBusy(true);
                try {
                  await api(`/tasks/${task.id}`, "DELETE");
                  await saved();
                  notify("Tarea eliminada");
                } catch (e) {
                  setError((e as Error).message);
                  setBusy(false);
                }
              }}
            >
              <Trash2 size={18} />
            </button>
          )}
          <span className="spacer" />
          <button
            type="button"
            className="btn secondary"
            disabled={busy}
            onClick={close}
          >
            Cancelar
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <Check size={16} />
            )}{" "}
            {task ? "Guardar cambios" : "Crear tarea"}
          </button>
        </div>
      </form>
      {task && (
        <section className="comments-section">
          <h3>
            Conversación <span className="count-badge">{comments.length}</span>
          </h3>
          {comments.map((c) => (
            <div className="comment" key={c.id}>
              <Avatar
                user={{ id: c.id, name: c.name, email: "", role: "member" }}
                size={29}
              />
              <div>
                <strong>
                  {c.name}
                  <time>
                    {fmt(c.created_at, {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </strong>
                <p>{c.body}</p>
              </div>
            </div>
          ))}
          {!comments.length && (
            <p className="empty-text">
              Comparte un avance o inicia la conversación.
            </p>
          )}
          <form
            className="comment-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!comment.trim()) return;
              setCommentBusy(true);
              try {
                await api(`/tasks/${task.id}/comments`, "POST", {
                  body: comment,
                });
                setComments(await api(`/tasks/${task.id}/comments`));
                setComment("");
                notify("Comentario publicado");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setCommentBusy(false);
              }
            }}
          >
            <input
              aria-label="Comentario"
              required
              maxLength={3000}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Comparte algo con tu equipo…"
            />
            <button
              className="btn primary"
              aria-label="Enviar comentario"
              disabled={commentBusy || !comment.trim()}
            >
              {commentBusy ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <Send size={16} />
              )}
            </button>
          </form>
        </section>
      )}
    </Modal>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
