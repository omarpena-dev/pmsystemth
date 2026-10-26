import { randomUUID } from "node:crypto";
import { z } from "zod";

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (value) =>
      !isNaN(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value,
    "Fecha inválida",
  );
const activeStatuses = new Set(["in_progress", "review", "done"]);
const milestoneSchema = z.object({
  project_id: z.string().min(1),
  title: z.string().trim().min(2).max(200),
  due_date: date,
  status: z.enum(["open", "done"]).default("open"),
});
const checklistTitle = z.string().trim().min(1).max(200);
const localToday = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

export function createPlanning({ db, getTask, getProject, apiError, log }) {
  const transaction = (operation) => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  };
  const dependenciesFor = (id) =>
    db
      .prepare(
        `SELECT t.id,t.title,t.status,t.project_id
    FROM task_dependencies d JOIN tasks t ON t.id=d.depends_on_id
    WHERE d.task_id=? ORDER BY t.created_at,t.id`,
      )
      .all(id);
  const dependentsFor = (id) =>
    db
      .prepare(
        `SELECT t.id,t.title,t.status,t.project_id
    FROM task_dependencies d JOIN tasks t ON t.id=d.task_id
    WHERE d.depends_on_id=? ORDER BY t.created_at,t.id`,
      )
      .all(id);
  const getChecklistItem = (taskId, itemId) => {
    getTask(taskId);
    const row = db
      .prepare("SELECT * FROM checklist WHERE id=? AND task_id=?")
      .get(itemId, taskId);
    if (!row) throw apiError(404, "Subtarea no encontrada");
    return { ...row, done: !!row.done };
  };
  const ensureOpenChecklist = (task) => {
    if (task.status === "done")
      throw apiError(
        409,
        "Reabre la tarea antes de añadir o reabrir subtareas",
      );
  };
  const milestoneFor = (id) => {
    const milestone = db.prepare("SELECT * FROM milestones WHERE id=?").get(id);
    if (!milestone) throw apiError(404, "Hito no encontrado");
    return milestone;
  };
  const checkMilestoneDate = (milestone, project) => {
    if (
      milestone.due_date < project.start_date ||
      milestone.due_date > project.due_date
    )
      throw apiError(
        409,
        "La fecha del hito debe estar dentro de las fechas del proyecto",
      );
  };
  const allMilestones = () =>
    db
      .prepare("SELECT * FROM milestones ORDER BY due_date,created_at,id")
      .all();
  const summary = () =>
    db
      .prepare(
        `SELECT t.id task_id,
    (SELECT COUNT(*) FROM checklist c WHERE c.task_id=t.id) checklist_total,
    (SELECT COUNT(*) FROM checklist c WHERE c.task_id=t.id AND c.done=1) checklist_done,
    COALESCE((SELECT SUM(minutes) FROM time_entries e WHERE e.task_id=t.id),0) total_minutes,
    EXISTS(SELECT 1 FROM task_dependencies d JOIN tasks p ON p.id=d.depends_on_id WHERE d.task_id=t.id AND p.status!='done') blocked
    FROM tasks t`,
      )
      .all()
      .map((row) => ({ ...row, blocked: !!row.blocked }));

  function assertTaskUpdate(previous, next) {
    const dependencies = dependenciesFor(previous.id);
    const dependents = dependentsFor(previous.id);
    if (
      previous.project_id !== next.project_id &&
      (dependencies.length || dependents.length)
    )
      throw apiError(
        409,
        "Quita las dependencias de esta tarea y sus dependientes antes de moverla a otro proyecto",
      );
    if (
      activeStatuses.has(next.status) &&
      dependencies.some((task) => task.status !== "done")
    )
      throw apiError(
        409,
        "Completa las tareas predecesoras antes de iniciar, revisar o completar esta tarea",
      );
    if (
      next.status === "done" &&
      db
        .prepare("SELECT id FROM checklist WHERE task_id=? AND done=0 LIMIT 1")
        .get(previous.id)
    )
      throw apiError(
        409,
        "Completa todas las subtareas antes de completar esta tarea",
      );
    if (
      previous.status === "done" &&
      next.status !== "done" &&
      dependents.some((task) => activeStatuses.has(task.status))
    )
      throw apiError(
        409,
        "Devuelve primero las tareas dependientes a Por hacer antes de reabrir esta tarea",
      );
  }
  function assertProjectUpdate(id, project) {
    if (
      db
        .prepare(
          "SELECT id FROM milestones WHERE project_id=? AND (due_date<? OR due_date>?) LIMIT 1",
        )
        .get(id, project.start_date, project.due_date)
    )
      throw apiError(
        409,
        "Las nuevas fechas dejarían hitos fuera del proyecto. Ajusta primero sus fechas",
      );
  }
  function registerRoutes(app, admin) {
    app.get("/api/tasks/:id/planning", (req, res) => {
      getTask(req.params.id);
      const checklist = db
        .prepare(
          "SELECT * FROM checklist WHERE task_id=? ORDER BY created_at,id",
        )
        .all(req.params.id)
        .map((row) => ({ ...row, done: !!row.done }));
      const timeEntries = db
        .prepare(
          "SELECT e.*,u.name FROM time_entries e JOIN users u ON u.id=e.user_id WHERE e.task_id=? ORDER BY e.worked_on DESC,e.created_at DESC,e.id",
        )
        .all(req.params.id);
      res.json({
        checklist,
        dependencies: dependenciesFor(req.params.id),
        dependents: dependentsFor(req.params.id),
        timeEntries,
        totalMinutes: timeEntries.reduce(
          (sum, entry) => sum + entry.minutes,
          0,
        ),
      });
    });
    app.post("/api/tasks/:id/checklist", (req, res) => {
      const task = getTask(req.params.id);
      ensureOpenChecklist(task);
      const { title } = z.object({ title: checklistTitle }).parse(req.body);
      const id = randomUUID();
      transaction(() => {
        db.prepare(
          "INSERT INTO checklist(id,task_id,title,done,created_at) VALUES(?,?,?,0,?)",
        ).run(id, task.id, title, new Date().toISOString());
        log(req, `añadió la subtarea ${title} en ${task.title}`);
      });
      res.status(201).json(getChecklistItem(task.id, id));
    });
    app.put("/api/tasks/:id/checklist/:itemId", (req, res) => {
      const task = getTask(req.params.id);
      const previous = getChecklistItem(task.id, req.params.itemId);
      const patch = z
        .object({
          title: checklistTitle.optional(),
          done: z.boolean().optional(),
        })
        .refine(
          (v) => v.title !== undefined || v.done !== undefined,
          "Incluye título o estado",
        )
        .parse(req.body);
      const next = { ...previous, ...patch };
      if (!next.done) ensureOpenChecklist(task);
      transaction(() => {
        db.prepare(
          "UPDATE checklist SET title=?,done=? WHERE id=? AND task_id=?",
        ).run(next.title, Number(next.done), previous.id, task.id);
        log(req, `actualizó la subtarea ${next.title} en ${task.title}`);
      });
      res.json(getChecklistItem(task.id, previous.id));
    });
    app.delete("/api/tasks/:id/checklist/:itemId", (req, res) => {
      const item = getChecklistItem(req.params.id, req.params.itemId);
      transaction(() => {
        db.prepare("DELETE FROM checklist WHERE id=? AND task_id=?").run(
          item.id,
          req.params.id,
        );
        log(
          req,
          `eliminó la subtarea ${item.title} en ${getTask(req.params.id).title}`,
        );
      });
      res.json({ ok: true });
    });
    app.put("/api/tasks/:id/dependencies", (req, res) => {
      const task = getTask(req.params.id);
      const { depends_on_ids } = z
        .object({
          depends_on_ids: z
            .array(z.string().min(1))
            .max(100)
            .refine(
              (ids) => new Set(ids).size === ids.length,
              "No repitas dependencias",
            ),
        })
        .parse(req.body);
      const prerequisites = depends_on_ids.map((id) => getTask(id));
      if (prerequisites.some((p) => p.id === task.id))
        throw apiError(409, "Una tarea no puede depender de sí misma");
      if (prerequisites.some((p) => p.project_id !== task.project_id))
        throw apiError(
          409,
          "Las dependencias deben pertenecer al mismo proyecto",
        );
      if (
        activeStatuses.has(task.status) &&
        prerequisites.some((p) => p.status !== "done")
      )
        throw apiError(
          409,
          "Devuelve esta tarea a Por hacer antes de añadir predecesoras pendientes",
        );
      // Follow outgoing predecessor edges. Reaching the edited task would close a cycle.
      const graph = new Map();
      for (const edge of db
        .prepare("SELECT task_id,depends_on_id FROM task_dependencies")
        .all()) {
        if (!graph.has(edge.task_id)) graph.set(edge.task_id, []);
        graph.get(edge.task_id).push(edge.depends_on_id);
      }
      const pending = [...depends_on_ids],
        visited = new Set();
      while (pending.length) {
        const current = pending.pop();
        if (current === task.id)
          throw apiError(409, "La dependencia crearía un ciclo entre tareas");
        if (visited.has(current)) continue;
        visited.add(current);
        pending.push(...(graph.get(current) || []));
      }
      transaction(() => {
        db.prepare("DELETE FROM task_dependencies WHERE task_id=?").run(
          task.id,
        );
        for (const id of depends_on_ids)
          db.prepare(
            "INSERT INTO task_dependencies(task_id,depends_on_id) VALUES(?,?)",
          ).run(task.id, id);
        log(req, `actualizó las dependencias de ${task.title}`);
      });
      res.json({ dependencies: dependenciesFor(task.id) });
    });
    app.post("/api/tasks/:id/time", (req, res) => {
      const task = getTask(req.params.id);
      const entry = z
        .object({
          minutes: z.number().int().min(1).max(1440),
          note: z.string().trim().max(1000).default(""),
          worked_on: date.refine(
            (v) => v <= localToday(),
            "No puedes registrar horas en una fecha futura",
          ),
        })
        .parse(req.body);
      const total = db
        .prepare(
          "SELECT COALESCE(SUM(minutes),0) total FROM time_entries WHERE user_id=? AND worked_on=?",
        )
        .get(req.user.id, entry.worked_on).total;
      if (total + entry.minutes > 1440)
        throw apiError(
          409,
          "El total de tiempo registrado por persona no puede superar 24 horas en un día",
        );
      const id = randomUUID();
      transaction(() => {
        db.prepare(
          "INSERT INTO time_entries(id,task_id,user_id,minutes,note,worked_on,created_at) VALUES(?,?,?,?,?,?,?)",
        ).run(
          id,
          task.id,
          req.user.id,
          entry.minutes,
          entry.note,
          entry.worked_on,
          new Date().toISOString(),
        );
        log(req, `registró ${entry.minutes} minutos en ${task.title}`);
      });
      res
        .status(201)
        .json(
          db
            .prepare(
              "SELECT e.*,u.name FROM time_entries e JOIN users u ON u.id=e.user_id WHERE e.id=?",
            )
            .get(id),
        );
    });
    app.delete("/api/tasks/:id/time/:entryId", (req, res) => {
      const task = getTask(req.params.id);
      const entry = db
        .prepare("SELECT * FROM time_entries WHERE id=? AND task_id=?")
        .get(req.params.entryId, task.id);
      if (!entry) throw apiError(404, "Registro de horas no encontrado");
      if (entry.user_id !== req.user.id && req.user.role !== "admin")
        throw apiError(
          403,
          "Solo puedes eliminar tus propios registros de horas",
        );
      transaction(() => {
        db.prepare("DELETE FROM time_entries WHERE id=? AND task_id=?").run(
          entry.id,
          task.id,
        );
        log(req, `eliminó un registro de horas en ${task.title}`);
      });
      res.json({ ok: true });
    });
    app.get("/api/milestones", (_req, res) => res.json(allMilestones()));
    app.post("/api/milestones", admin, (req, res) => {
      const milestone = milestoneSchema.parse(req.body);
      checkMilestoneDate(milestone, getProject(milestone.project_id));
      const id = randomUUID();
      transaction(() => {
        db.prepare(
          "INSERT INTO milestones(id,project_id,title,due_date,status,created_at) VALUES(?,?,?,?,?,?)",
        ).run(
          id,
          milestone.project_id,
          milestone.title,
          milestone.due_date,
          milestone.status,
          new Date().toISOString(),
        );
        log(req, `creó el hito ${milestone.title}`);
      });
      res.status(201).json(milestoneFor(id));
    });
    app.put("/api/milestones/:id", admin, (req, res) => {
      milestoneFor(req.params.id);
      const milestone = milestoneSchema.parse(req.body);
      checkMilestoneDate(milestone, getProject(milestone.project_id));
      transaction(() => {
        db.prepare(
          "UPDATE milestones SET project_id=?,title=?,due_date=?,status=? WHERE id=?",
        ).run(
          milestone.project_id,
          milestone.title,
          milestone.due_date,
          milestone.status,
          req.params.id,
        );
        log(req, `actualizó el hito ${milestone.title}`);
      });
      res.json(milestoneFor(req.params.id));
    });
    app.delete("/api/milestones/:id", admin, (req, res) => {
      const milestone = milestoneFor(req.params.id);
      transaction(() => {
        db.prepare("DELETE FROM milestones WHERE id=?").run(milestone.id);
        log(req, `eliminó el hito ${milestone.title}`);
      });
      res.json({ ok: true });
    });
  }
  return {
    registerRoutes,
    assertTaskUpdate,
    assertProjectUpdate,
    summary,
    allMilestones,
  };
}
