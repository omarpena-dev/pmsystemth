import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createApp } from "../server/app.mjs";
import { openDatabase } from "../server/db.mjs";

const directory = mkdtempSync(join(tmpdir(), "nexo-planning-"));
let db, server, client;
const projectBody = {
  name: "Plan de entrega",
  description: "Pruebas de colaboración y planificación",
  start_date: "2020-01-01",
  due_date: "2030-12-31",
};
function httpClient(baseUrl) {
  let cookie = "",
    csrf = "";
  const request = async (
    path,
    { method = "GET", body, auth = true, token = csrf } = {},
  ) => {
    const response = await fetch(`${baseUrl}/api${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(auth && cookie ? { Cookie: cookie } : {}),
        "x-csrf-token": token,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (auth && response.headers.get("set-cookie"))
      cookie = response.headers.get("set-cookie").split(";")[0];
    return { status: response.status, data: await response.json() };
  };
  return {
    request,
    async login() {
      csrf = (await request("/session")).data.csrf;
      const response = await request("/demo-login", {
        method: "POST",
        body: {},
      });
      expectStatus(response, 200);
      csrf = response.data.csrf;
    },
  };
}
function expectStatus(response, expected) {
  assert.equal(response.status, expected, JSON.stringify(response.data));
  return response.data;
}
async function project() {
  return expectStatus(
    await client.request("/projects", { method: "POST", body: projectBody }),
    201,
  );
}
async function task(projectId, title = "Una tarea pendiente") {
  return expectStatus(
    await client.request("/tasks", {
      method: "POST",
      body: {
        project_id: projectId,
        title,
        status: "todo",
        start_date: "2026-01-01",
        due_date: "2026-02-01",
        estimate: 4,
      },
    }),
    201,
  );
}
async function planning(taskId) {
  return expectStatus(await client.request(`/tasks/${taskId}/planning`), 200);
}
async function dependencies(taskId, ids) {
  return client.request(`/tasks/${taskId}/dependencies`, {
    method: "PUT",
    body: { depends_on_ids: ids },
  });
}
async function updateTask(original, status, overrides = {}) {
  return client.request(`/tasks/${original.id}`, {
    method: "PUT",
    body: { ...original, status, ...overrides },
  });
}
before(async () => {
  const created = createApp({
    NODE_ENV: "test",
    DEMO_MODE: "true",
    SESSION_SECRET: "test-planning-not-a-production-secret",
    DATABASE_PATH: join(directory, "planning.sqlite"),
  });
  db = created.db;
  server = created.app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  client = httpClient(`http://127.0.0.1:${server.address().port}`);
  await client.login();
});
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  db?.close();
  rmSync(directory, { recursive: true, force: true });
});

test("planning endpoints require a session, enforce CSRF, and keep task/item scope", async () => {
  const p = await project(),
    a = await task(p.id),
    b = await task(p.id);
  expectStatus(
    await client.request(`/tasks/${a.id}/planning`, { auth: false }),
    401,
  );
  expectStatus(await client.request("/milestones", { auth: false }), 401);
  expectStatus(
    await client.request(`/tasks/${a.id}/checklist`, {
      method: "POST",
      body: { title: "Una subtarea" },
      token: "invalid",
    }),
    403,
  );
  const item = expectStatus(
    await client.request(`/tasks/${a.id}/checklist`, {
      method: "POST",
      body: { title: "Una subtarea" },
    }),
    201,
  );
  expectStatus(
    await client.request(`/tasks/${b.id}/checklist/${item.id}`, {
      method: "PUT",
      body: { done: true },
    }),
    404,
  );
  expectStatus(
    await client.request(`/tasks/${b.id}/checklist/${item.id}`, {
      method: "DELETE",
    }),
    404,
  );
  assert.equal((await planning(a.id)).checklist[0].done, false);
  expectStatus(await client.request("/tasks/missing/planning"), 404);
});

test("checklist progress persists and prevents completion until every item is done", async () => {
  const p = await project(),
    t = await task(p.id);
  expectStatus(
    await client.request(`/tasks/${t.id}/checklist`, {
      method: "POST",
      body: { title: "  " },
    }),
    400,
  );
  const first = expectStatus(
    await client.request(`/tasks/${t.id}/checklist`, {
      method: "POST",
      body: { title: "  Aprobar diseño  " },
    }),
    201,
  );
  const second = expectStatus(
    await client.request(`/tasks/${t.id}/checklist`, {
      method: "POST",
      body: { title: "Verificar entrega" },
    }),
    201,
  );
  assert.equal(first.title, "Aprobar diseño");
  expectStatus(await updateTask(t, "done"), 409);
  expectStatus(
    await client.request(`/tasks/${t.id}/checklist/${first.id}`, {
      method: "PUT",
      body: { done: true, title: "Diseño aprobado" },
    }),
    200,
  );
  expectStatus(await updateTask(t, "done"), 409);
  expectStatus(
    await client.request(`/tasks/${t.id}/checklist/${second.id}`, {
      method: "PUT",
      body: { done: true },
    }),
    200,
  );
  expectStatus(await updateTask(t, "done"), 200);
  assert.equal(
    (await planning(t.id)).checklist.filter((item) => item.done).length,
    2,
  );
  expectStatus(
    await client.request(`/tasks/${t.id}/checklist`, {
      method: "POST",
      body: { title: "Trabajo nuevo" },
    }),
    409,
  );
  expectStatus(
    await client.request(`/tasks/${t.id}/checklist/${first.id}`, {
      method: "PUT",
      body: { done: false },
    }),
    409,
  );
  expectStatus(await updateTask(t, "todo"), 200);
  expectStatus(
    await client.request(`/tasks/${t.id}/checklist/${first.id}`, {
      method: "PUT",
      body: { done: false },
    }),
    200,
  );
  expectStatus(
    await client.request(`/tasks/${t.id}/checklist/${second.id}`, {
      method: "DELETE",
    }),
    200,
  );
  const saved = await planning(t.id);
  assert.equal(saved.checklist.length, 1);
  assert.equal(saved.checklist[0].title, "Diseño aprobado");
  assert.equal(saved.checklist[0].done, false);
  const workspace = expectStatus(await client.request("/workspace"), 200);
  const summary = workspace.taskPlanning.find((item) => item.task_id === t.id);
  assert.equal(summary.checklist_total, 1);
  assert.equal(summary.checklist_done, 0);
});

test("dependencies reject self, foreign project, and indirect cycles without replacing valid edges", async () => {
  const p = await project(),
    other = await project();
  const a = await task(p.id, "Depende de otra tarea"),
    b = await task(p.id, "Tarea predecesora"),
    c = await task(p.id, "Inicio del trabajo"),
    foreign = await task(other.id);
  expectStatus(await dependencies(a.id, [b.id]), 200);
  expectStatus(await dependencies(b.id, [c.id]), 200);
  expectStatus(await dependencies(a.id, [a.id]), 409);
  expectStatus(await dependencies(a.id, [b.id, foreign.id]), 409);
  expectStatus(await dependencies(a.id, [b.id, "missing"]), 404);
  expectStatus(await dependencies(c.id, [a.id]), 409);
  expectStatus(await dependencies(b.id, [a.id]), 409);
  assert.deepEqual(
    (await planning(a.id)).dependencies.map((t) => t.id),
    [b.id],
  );
  assert.deepEqual(
    (await planning(b.id)).dependencies.map((t) => t.id),
    [c.id],
  );
  assert.deepEqual((await planning(c.id)).dependencies, []);
  assert.deepEqual(
    (await planning(b.id)).dependents.map((t) => t.id),
    [a.id],
  );
  expectStatus(await updateTask(a, "todo", { project_id: other.id }), 409);
  expectStatus(await updateTask(c, "todo", { project_id: other.id }), 409);
  expectStatus(await dependencies(a.id, []), 200);
  assert.deepEqual((await planning(a.id)).dependencies, []);
  expectStatus(await updateTask(a, "todo", { project_id: other.id }), 200);
});

test("workflow guards block starting unfinished prerequisites and reopening work used by active dependents", async () => {
  const p = await project(),
    predecessor = await task(p.id, "Aprobar requisitos"),
    dependent = await task(p.id, "Implementar requisitos");
  expectStatus(await dependencies(dependent.id, [predecessor.id]), 200);
  for (const status of ["in_progress", "review", "done"])
    expectStatus(await updateTask(dependent, status), 409);
  let workspace = expectStatus(await client.request("/workspace"), 200);
  assert.equal(
    workspace.taskPlanning.find((t) => t.task_id === dependent.id).blocked,
    true,
  );
  expectStatus(await updateTask(predecessor, "done"), 200);
  expectStatus(await updateTask(dependent, "in_progress"), 200);
  expectStatus(await updateTask(predecessor, "todo"), 409);
  const pending = await task(p.id, "Otra predecesora pendiente");
  expectStatus(await dependencies(dependent.id, [pending.id]), 409);
  assert.deepEqual(
    (await planning(dependent.id)).dependencies.map((t) => t.id),
    [predecessor.id],
  );
  expectStatus(await updateTask(dependent, "done"), 200);
  expectStatus(await updateTask(predecessor, "review"), 409);
  expectStatus(await updateTask(dependent, "todo"), 200);
  expectStatus(await updateTask(predecessor, "todo"), 200);
  workspace = expectStatus(await client.request("/workspace"), 200);
  assert.equal(
    workspace.tasks.find((t) => t.id === predecessor.id).status,
    "todo",
  );
});

test("time entries validate duration and dates, persist author and totals, and protect deletion ownership", async () => {
  const p = await project(),
    t = await task(p.id),
    other = await task(p.id);
  for (const minutes of [0, -1, 1441, 0.5])
    expectStatus(
      await client.request(`/tasks/${t.id}/time`, {
        method: "POST",
        body: { minutes, worked_on: "2020-06-01" },
      }),
      400,
    );
  for (const worked_on of ["2026-02-30", "2999-01-01"])
    expectStatus(
      await client.request(`/tasks/${t.id}/time`, {
        method: "POST",
        body: { minutes: 60, worked_on },
      }),
      400,
    );
  const entry = expectStatus(
    await client.request(`/tasks/${t.id}/time`, {
      method: "POST",
      body: {
        minutes: 90,
        worked_on: "2020-06-01",
        note: "  Revisión con el equipo  ",
      },
    }),
    201,
  );
  assert.equal(entry.user_id, "demo-pm");
  assert.equal(entry.name, "Omar Peña");
  let saved = await planning(t.id);
  assert.equal(saved.totalMinutes, 90);
  assert.equal(saved.timeEntries[0].note, "Revisión con el equipo");
  expectStatus(
    await client.request(`/tasks/${other.id}/time/${entry.id}`, {
      method: "DELETE",
    }),
    404,
  );
  db.prepare("UPDATE time_entries SET user_id='demo-ana' WHERE id=?").run(
    entry.id,
  );
  db.prepare("UPDATE users SET role='member' WHERE id='demo-pm'").run();
  try {
    expectStatus(
      await client.request(`/tasks/${t.id}/time/${entry.id}`, {
        method: "DELETE",
      }),
      403,
    );
    const own = expectStatus(
      await client.request(`/tasks/${t.id}/time`, {
        method: "POST",
        body: { minutes: 30, worked_on: "2020-06-01" },
      }),
      201,
    );
    expectStatus(
      await client.request(`/tasks/${t.id}/time/${own.id}`, {
        method: "DELETE",
      }),
      200,
    );
    assert.equal((await planning(t.id)).totalMinutes, 90);
  } finally {
    db.prepare("UPDATE users SET role='admin' WHERE id='demo-pm'").run();
  }
  expectStatus(
    await client.request(`/tasks/${t.id}/time/${entry.id}`, {
      method: "DELETE",
    }),
    200,
  );
  saved = await planning(t.id);
  assert.equal(saved.totalMinutes, 0);
  assert.deepEqual(saved.timeEntries, []);
});

test("daily time limit covers all tasks rather than allowing more than 24 hours across tasks", async () => {
  const p = await project(),
    a = await task(p.id),
    b = await task(p.id);
  expectStatus(
    await client.request(`/tasks/${a.id}/time`, {
      method: "POST",
      body: { minutes: 1400, worked_on: "2020-06-02" },
    }),
    201,
  );
  expectStatus(
    await client.request(`/tasks/${b.id}/time`, {
      method: "POST",
      body: { minutes: 41, worked_on: "2020-06-02" },
    }),
    409,
  );
  expectStatus(
    await client.request(`/tasks/${b.id}/time`, {
      method: "POST",
      body: { minutes: 40, worked_on: "2020-06-02" },
    }),
    201,
  );
  assert.equal((await planning(b.id)).totalMinutes, 40);
  const workspace = expectStatus(await client.request("/workspace"), 200);
  assert.equal(
    workspace.taskPlanning.find((t) => t.task_id === a.id).total_minutes,
    1400,
  );
});

test("milestones enforce PM permissions and project dates, and remain consistent with project edits", async () => {
  const p = await project();
  const body = {
    project_id: p.id,
    title: "Entrega al equipo",
    due_date: "2026-11-01",
    status: "open",
  };
  expectStatus(
    await client.request("/milestones", {
      method: "POST",
      body: { ...body, due_date: "2031-01-01" },
    }),
    409,
  );
  expectStatus(
    await client.request("/milestones", {
      method: "POST",
      body: { ...body, due_date: "2019-12-31" },
    }),
    409,
  );
  expectStatus(
    await client.request("/milestones", {
      method: "POST",
      body: { ...body, due_date: "2026-02-30" },
    }),
    400,
  );
  const milestone = expectStatus(
    await client.request("/milestones", { method: "POST", body }),
    201,
  );
  db.prepare("UPDATE users SET role='member' WHERE id='demo-pm'").run();
  try {
    expectStatus(
      await client.request("/milestones", { method: "POST", body }),
      403,
    );
    expectStatus(
      await client.request(`/milestones/${milestone.id}`, {
        method: "PUT",
        body: { ...body, status: "done" },
      }),
      403,
    );
    expectStatus(
      await client.request(`/milestones/${milestone.id}`, { method: "DELETE" }),
      403,
    );
    assert.ok(
      expectStatus(await client.request("/milestones"), 200).some(
        (m) => m.id === milestone.id,
      ),
    );
  } finally {
    db.prepare("UPDATE users SET role='admin' WHERE id='demo-pm'").run();
  }
  expectStatus(
    await client.request(`/projects/${p.id}`, {
      method: "PUT",
      body: { ...projectBody, due_date: "2026-10-01" },
    }),
    409,
  );
  expectStatus(
    await client.request(`/milestones/${milestone.id}`, {
      method: "PUT",
      body: {
        ...body,
        title: "Entrega aprobada",
        due_date: "2026-09-30",
        status: "done",
      },
    }),
    200,
  );
  expectStatus(
    await client.request(`/projects/${p.id}`, {
      method: "PUT",
      body: { ...projectBody, due_date: "2026-10-01" },
    }),
    200,
  );
  const saved = expectStatus(await client.request("/milestones"), 200).find(
    (m) => m.id === milestone.id,
  );
  assert.equal(saved.status, "done");
  assert.equal(saved.title, "Entrega aprobada");
  expectStatus(
    await client.request(`/milestones/${milestone.id}`, { method: "DELETE" }),
    200,
  );
  assert.ok(
    !expectStatus(await client.request("/milestones"), 200).some(
      (m) => m.id === milestone.id,
    ),
  );
});

test("project deletion cascades checklist, dependency edges, time entries, and milestones", async () => {
  const p = await project(),
    a = await task(p.id),
    b = await task(p.id);
  await dependencies(a.id, [b.id]);
  const check = expectStatus(
    await client.request(`/tasks/${a.id}/checklist`, {
      method: "POST",
      body: { title: "Revisar implementación" },
    }),
    201,
  );
  const time = expectStatus(
    await client.request(`/tasks/${a.id}/time`, {
      method: "POST",
      body: { minutes: 15, worked_on: "2020-06-03" },
    }),
    201,
  );
  const milestone = expectStatus(
    await client.request("/milestones", {
      method: "POST",
      body: { project_id: p.id, title: "Cierre", due_date: "2026-11-01" },
    }),
    201,
  );
  expectStatus(
    await client.request(`/projects/${p.id}`, { method: "DELETE" }),
    200,
  );
  assert.equal(
    db.prepare("SELECT COUNT(*) n FROM checklist WHERE id=?").get(check.id).n,
    0,
  );
  assert.equal(
    db.prepare("SELECT COUNT(*) n FROM time_entries WHERE id=?").get(time.id).n,
    0,
  );
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) n FROM task_dependencies WHERE task_id=? OR depends_on_id=?",
      )
      .get(a.id, b.id).n,
    0,
  );
  assert.equal(
    db.prepare("SELECT COUNT(*) n FROM milestones WHERE id=?").get(milestone.id)
      .n,
    0,
  );
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  expectStatus(await client.request(`/tasks/${a.id}/planning`), 404);
});

test("additive migration keeps original database records and is safe to run twice", () => {
  const path = join(directory, "legacy.sqlite");
  const original = new DatabaseSync(path);
  original.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE users(id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, avatar TEXT, role TEXT NOT NULL DEFAULT 'member', tokens TEXT);
    CREATE TABLE projects(id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', color TEXT NOT NULL, status TEXT NOT NULL, start_date TEXT NOT NULL, due_date TEXT NOT NULL, budget REAL NOT NULL DEFAULT 0, spent REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
    CREATE TABLE tasks(id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', status TEXT NOT NULL, priority TEXT NOT NULL, assignee_id TEXT REFERENCES users(id), start_date TEXT NOT NULL, due_date TEXT NOT NULL, estimate REAL NOT NULL DEFAULT 0, drive_url TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
    INSERT INTO users(id,name,email,role) VALUES('legacy-user','Usuario existente','legacy@example.test','admin');
    INSERT INTO projects VALUES('legacy-project','Proyecto existente','Datos que deben preservarse','#7560e8','active','2026-01-01','2026-12-31',10000,2500,'2026-01-01T00:00:00Z');
    INSERT INTO tasks VALUES('legacy-task','legacy-project','Trabajo existente','','todo','high','legacy-user','2026-01-01','2026-02-01',8,'','2026-01-01T00:00:00Z');
  `);
  original.close();
  for (let attempt = 0; attempt < 2; attempt++) {
    const migrated = openDatabase(path);
    try {
      assert.equal(
        migrated.prepare("SELECT title FROM tasks WHERE id='legacy-task'").get()
          .title,
        "Trabajo existente",
      );
      assert.equal(
        migrated
          .prepare("SELECT spent FROM projects WHERE id='legacy-project'")
          .get().spent,
        2500,
      );
      assert.equal(
        migrated.prepare("SELECT email FROM users WHERE id='legacy-user'").get()
          .email,
        "legacy@example.test",
      );
      for (const table of [
        "checklist",
        "task_dependencies",
        "time_entries",
        "milestones",
      ])
        assert.ok(
          migrated
            .prepare(
              "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
            )
            .get(table),
        );
      migrated
        .prepare(
          "INSERT OR IGNORE INTO checklist(id,task_id,title,done,created_at) VALUES('migration-check','legacy-task','Dato nuevo',0,'2026-01-01')",
        )
        .run();
      assert.equal(
        migrated
          .prepare(
            "SELECT COUNT(*) n FROM checklist WHERE id='migration-check'",
          )
          .get().n,
        1,
      );
      assert.deepEqual(migrated.prepare("PRAGMA foreign_key_check").all(), []);
    } finally {
      migrated.close();
    }
  }
});
