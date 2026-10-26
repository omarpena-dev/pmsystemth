import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import session from "express-session";
export function openDatabase(path) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, avatar TEXT, role TEXT NOT NULL DEFAULT 'member', tokens TEXT);
    CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', color TEXT NOT NULL, status TEXT NOT NULL, start_date TEXT NOT NULL, due_date TEXT NOT NULL, budget REAL NOT NULL DEFAULT 0, spent REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', status TEXT NOT NULL, priority TEXT NOT NULL, assignee_id TEXT REFERENCES users(id), start_date TEXT NOT NULL, due_date TEXT NOT NULL, estimate REAL NOT NULL DEFAULT 0, drive_url TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS comments(id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id), body TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS activity(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT REFERENCES users(id), message TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS calendar_events(task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id), event_id TEXT NOT NULL, PRIMARY KEY(task_id,user_id));
    CREATE TABLE IF NOT EXISTS sessions(sid TEXT PRIMARY KEY, data TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS checklist(id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, title TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0 CHECK(done IN (0,1)), created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS task_dependencies(task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, depends_on_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, PRIMARY KEY(task_id,depends_on_id), CHECK(task_id != depends_on_id));
    CREATE TABLE IF NOT EXISTS time_entries(id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id), minutes INTEGER NOT NULL CHECK(minutes BETWEEN 1 AND 1440), note TEXT NOT NULL DEFAULT '', worked_on TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS milestones(id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, title TEXT NOT NULL, due_date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','done')), created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS checklist_task ON checklist(task_id);
    CREATE INDEX IF NOT EXISTS dependency_predecessor ON task_dependencies(depends_on_id);
    CREATE INDEX IF NOT EXISTS time_task ON time_entries(task_id);
    CREATE INDEX IF NOT EXISTS time_person_date ON time_entries(user_id,worked_on);
    CREATE INDEX IF NOT EXISTS milestone_project_date ON milestones(project_id,due_date);`);
  return db;
}
export class SQLiteSessionStore extends session.Store {
  constructor(db) {
    super();
    this.db = db;
  }
  get(sid, cb) {
    try {
      const r = this.db
        .prepare("SELECT data FROM sessions WHERE sid=? AND expires>?")
        .get(sid, Date.now());
      cb(null, r ? JSON.parse(r.data) : null);
    } catch (e) {
      cb(e);
    }
  }
  set(sid, value, cb = () => {}) {
    try {
      this.db
        .prepare("DELETE FROM sessions WHERE expires <= ?")
        .run(Date.now());
      this.db
        .prepare("INSERT OR REPLACE INTO sessions VALUES(?,?,?)")
        .run(
          sid,
          JSON.stringify(value),
          value.cookie.expires
            ? +new Date(value.cookie.expires)
            : Date.now() + 86400000,
        );
      cb();
    } catch (e) {
      cb(e);
    }
  }
  destroy(sid, cb = () => {}) {
    try {
      this.db.prepare("DELETE FROM sessions WHERE sid=?").run(sid);
      cb();
    } catch (e) {
      cb(e);
    }
  }
  touch(sid, value, cb = () => {}) {
    this.set(sid, value, cb);
  }
}
export function seedDemo(db) {
  if (db.prepare("SELECT count(*) n FROM projects").get().n) return;
  const users = [
    ["demo-pm", "Omar Peña", "omar@example.test", "admin"],
    ["demo-ana", "Ana García", "ana@example.test", "member"],
    ["demo-carlos", "Carlos Ruiz", "carlos@example.test", "member"],
    ["demo-lucia", "Lucía Torres", "lucia@example.test", "member"],
    ["demo-diego", "Diego Martín", "diego@example.test", "member"],
  ];
  const now = new Date();
  const day = (n) =>
    new Date(now.getFullYear(), now.getMonth(), now.getDate() + n, 12)
      .toISOString()
      .slice(0, 10);
  db.exec("BEGIN");
  try {
    for (const u of users)
      db.prepare(
        "INSERT OR IGNORE INTO users(id,name,email,role) VALUES(?,?,?,?)",
      ).run(...u);
    const projects = [
      [
        "p-website",
        "Rediseño de plataforma",
        "Una experiencia digital más simple, accesible y centrada en nuestros usuarios.",
        "#7c69ef",
        "active",
        -20,
        22,
        45000,
        28500,
      ],
      [
        "p-app",
        "Aplicación móvil",
        "Llevamos las herramientas del equipo a donde esté.",
        "#4c9d93",
        "active",
        -10,
        40,
        32000,
        12400,
      ],
      [
        "p-marketing",
        "Lanzamiento Q4",
        "Una campaña para conectar con nuestros próximos clientes.",
        "#e4a04c",
        "at_risk",
        -15,
        12,
        18000,
        14200,
      ],
      [
        "p-onboarding",
        "Onboarding de clientes",
        "Hagamos que cada nuevo cliente se sienta en casa.",
        "#6194d5",
        "planning",
        0,
        55,
        12000,
        1500,
      ],
    ];
    for (const [
      id,
      name,
      desc,
      color,
      status,
      start,
      end,
      budget,
      spent,
    ] of projects)
      db.prepare("INSERT INTO projects VALUES(?,?,?,?,?,?,?,?,?,?)").run(
        id,
        name,
        desc,
        color,
        status,
        day(start),
        day(end),
        budget,
        spent,
        now.toISOString(),
      );
    const tasks = [
      [
        "p-website",
        "Diseñar el nuevo dashboard",
        "in_progress",
        "high",
        "demo-ana",
        -4,
        2,
        12,
      ],
      [
        "p-website",
        "Definir arquitectura de información",
        "done",
        "high",
        "demo-pm",
        -12,
        -5,
        8,
      ],
      [
        "p-website",
        "Desarrollar componentes UI",
        "in_progress",
        "medium",
        "demo-carlos",
        -2,
        7,
        24,
      ],
      [
        "p-website",
        "Revisión de accesibilidad",
        "review",
        "medium",
        "demo-lucia",
        -3,
        3,
        6,
      ],
      [
        "p-website",
        "Pruebas con usuarios",
        "todo",
        "high",
        "demo-ana",
        4,
        12,
        10,
      ],
      [
        "p-website",
        "Documentar sistema de diseño",
        "todo",
        "low",
        "demo-diego",
        5,
        18,
        8,
      ],
      [
        "p-app",
        "Prototipo de navegación móvil",
        "review",
        "high",
        "demo-lucia",
        -6,
        1,
        16,
      ],
      [
        "p-app",
        "Integración con API",
        "in_progress",
        "high",
        "demo-carlos",
        -2,
        14,
        20,
      ],
      [
        "p-app",
        "Configurar notificaciones",
        "todo",
        "medium",
        "demo-diego",
        7,
        20,
        8,
      ],
      [
        "p-app",
        "Investigar necesidades del equipo",
        "done",
        "medium",
        "demo-ana",
        -9,
        -3,
        6,
      ],
      [
        "p-marketing",
        "Aprobar concepto de campaña",
        "in_progress",
        "urgent",
        "demo-pm",
        -7,
        -1,
        4,
      ],
      [
        "p-marketing",
        "Preparar calendario de contenido",
        "todo",
        "high",
        "demo-diego",
        0,
        5,
        8,
      ],
      [
        "p-marketing",
        "Diseñar piezas de lanzamiento",
        "review",
        "medium",
        "demo-lucia",
        -4,
        4,
        12,
      ],
      [
        "p-marketing",
        "Análisis de audiencia",
        "done",
        "medium",
        "demo-ana",
        -13,
        -7,
        6,
      ],
      [
        "p-onboarding",
        "Mapear recorrido del cliente",
        "todo",
        "medium",
        "demo-ana",
        1,
        15,
        10,
      ],
      [
        "p-onboarding",
        "Definir métricas de éxito",
        "todo",
        "low",
        "demo-pm",
        3,
        18,
        4,
      ],
    ];
    tasks.forEach((t, i) => {
      const [p, title, status, priority, user, start, end, hours] = t;
      db.prepare("INSERT INTO tasks VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(
        `t-${i + 1}`,
        p,
        title,
        "Coordinar entregables con el equipo y compartir avances en esta tarea.",
        status,
        priority,
        user,
        day(start),
        day(end),
        hours,
        "",
        now.toISOString(),
      );
    });
    db.prepare("INSERT INTO comments VALUES(?,?,?,?,?)").run(
      "c-demo",
      "t-1",
      "demo-ana",
      "La propuesta inicial está lista. Estoy incorporando los comentarios del equipo.",
      now.toISOString(),
    );
    db.prepare(
      "INSERT INTO activity(user_id,message,created_at) VALUES(?,?,?)",
    ).run(
      "demo-ana",
      "compartió avances en Diseñar el nuevo dashboard",
      now.toISOString(),
    );
    db.prepare(
      "INSERT INTO activity(user_id,message,created_at) VALUES(?,?,?)",
    ).run(
      "demo-pm",
      "creó el espacio de trabajo del equipo",
      now.toISOString(),
    );
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
