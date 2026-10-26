import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.mjs";
const dir = mkdtempSync(join(tmpdir(), "nexo-test-"));
let server,
  db,
  url,
  cookie = "",
  csrf = "",
  projectId,
  taskId;
before(async () => {
  const created = createApp({
    NODE_ENV: "test",
    DATABASE_PATH: join(dir, "test.sqlite"),
    SESSION_SECRET: "test-secret-only-never-use-in-production",
    DEMO_MODE: "true",
  });
  db = created.db;
  server = created.app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  url = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((r) => server.close(r));
  db.close();
  rmSync(dir, { recursive: true, force: true });
});
async function request(
  path,
  { method = "GET", body, auth = true, token = csrf } = {},
) {
  const res = await fetch(url + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(auth && cookie ? { Cookie: cookie } : {}),
      "x-csrf-token": token,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  if (auth && res.headers.get("set-cookie"))
    cookie = res.headers.get("set-cookie").split(";")[0];
  return {
    status: res.status,
    data: res.headers.get("content-type")?.includes("json")
      ? await res.json()
      : await res.text(),
    headers: res.headers,
  };
}
test("health checks DB; workspace is inaccessible without authentication", async () => {
  assert.equal((await request("/api/health")).data.status, "ok");
  assert.equal((await request("/api/workspace")).status, 401);
});
test("session tokens protect demo login and authenticated mutations", async () => {
  const s = await request("/api/session");
  csrf = s.data.csrf;
  assert.equal(s.data.user, null);
  assert.equal(
    (
      await request("/api/demo-login", {
        method: "POST",
        body: {},
        token: "wrong",
      })
    ).status,
    403,
  );
  const login = await request("/api/demo-login", { method: "POST", body: {} });
  assert.equal(login.status, 200);
  assert.equal(login.data.user.role, "admin");
  csrf = login.data.csrf;
  const workspace = await request("/api/workspace");
  assert.equal(workspace.data.projects.length, 4);
  assert.equal(workspace.data.tasks.length, 16);
});
test("create a project; invalid dates are rejected; update budget persists", async () => {
  const p = {
    name: "Proyecto de prueba",
    description: "Integración real de base de datos",
    start_date: "2026-10-20",
    due_date: "2026-11-20",
    budget: 10000,
  };
  assert.equal(
    (
      await request("/api/projects", {
        method: "POST",
        body: { ...p, due_date: "2026-10-01" },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/api/projects", {
        method: "POST",
        body: { ...p, due_date: "2026-02-30" },
      })
    ).status,
    400,
  );
  const created = await request("/api/projects", { method: "POST", body: p });
  assert.equal(created.status, 201);
  projectId = created.data.id;
  assert.equal(
    (
      await request(`/api/projects/${projectId}`, {
        method: "PUT",
        body: { ...p, status: "active", spent: 2500 },
      })
    ).status,
    200,
  );
  assert.equal(
    db.prepare("SELECT spent FROM projects WHERE id=?").get(projectId).spent,
    2500,
  );
});
test("create and update task; reject unknown assignee and malicious file links", async () => {
  const t = {
    project_id: projectId,
    title: "Preparar entregable",
    start_date: "2026-10-21",
    due_date: "2026-10-30",
    assignee_id: "demo-ana",
    estimate: 8,
  };
  assert.equal(
    (
      await request("/api/tasks", {
        method: "POST",
        body: { ...t, assignee_id: "missing" },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/api/tasks", {
        method: "POST",
        body: { ...t, drive_url: "https://evil.test/file" },
      })
    ).status,
    400,
  );
  const created = await request("/api/tasks", { method: "POST", body: t });
  assert.equal(created.status, 201);
  taskId = created.data.id;
  const updated = await request(`/api/tasks/${taskId}`, {
    method: "PUT",
    body: {
      ...t,
      status: "done",
      drive_url: "https://docs.google.com/document/d/example/edit",
    },
  });
  assert.equal(updated.data.status, "done");
  assert.equal(
    db.prepare("SELECT status FROM tasks WHERE id=?").get(taskId).status,
    "done",
  );
});
test("comment persistence, empty comment validation, and activity feed", async () => {
  assert.equal(
    (
      await request(`/api/tasks/${taskId}/comments`, {
        method: "POST",
        body: { body: "   " },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(`/api/tasks/${taskId}/comments`, {
        method: "POST",
        body: { body: "Entregable revisado por el equipo" },
      })
    ).status,
    201,
  );
  const comments = await request(`/api/tasks/${taskId}/comments`);
  assert.equal(comments.data[0].body, "Entregable revisado por el equipo");
  assert.equal(comments.data[0].name, "Omar Peña");
  assert.match(
    (await request("/api/workspace")).data.activity[0].message,
    /comentó/,
  );
});
test("members can collaborate on tasks but cannot delete work or administer projects", async () => {
  db.prepare("UPDATE users SET role='member' WHERE id='demo-pm'").run();
  assert.equal(
    (await request("/api/projects", { method: "POST", body: {} })).status,
    403,
  );
  assert.equal(
    (await request(`/api/projects/${projectId}`, { method: "DELETE" })).status,
    403,
  );
  assert.equal(
    (await request(`/api/tasks/${taskId}`, { method: "DELETE" })).status,
    403,
  );
  assert.equal(
    (
      await request(`/api/tasks/${taskId}/comments`, {
        method: "POST",
        body: { body: "Colaboración del equipo" },
      })
    ).status,
    201,
  );
  db.prepare("UPDATE users SET role='admin' WHERE id='demo-pm'").run();
});
test("Google operations fail explicitly when no account is connected; invalid OAuth state is rejected", async () => {
  assert.equal((await request("/api/google/files")).status, 409);
  assert.equal(
    (
      await request(`/api/tasks/${taskId}/calendar`, {
        method: "POST",
        body: {},
      })
    ).status,
    409,
  );
  const callback = await request("/auth/google/callback?state=fake&code=fake");
  assert.equal(callback.status, 302);
  assert.equal(callback.headers.get("location"), "/?auth_error=google");
});
test("deleting project cascades tasks and comments; logout invalidates session", async () => {
  assert.equal(
    (await request(`/api/projects/${projectId}`, { method: "DELETE" })).status,
    200,
  );
  assert.equal((await request(`/api/tasks/${taskId}/comments`)).status, 404);
  assert.equal(
    db.prepare("SELECT count(*) n FROM comments WHERE task_id=?").get(taskId).n,
    0,
  );
  assert.equal(
    (await request("/api/logout", { method: "POST", body: {} })).status,
    200,
  );
  assert.equal((await request("/api/workspace")).status, 401);
});
test("production refuses insecure or missing configuration", () => {
  assert.throws(
    () =>
      createApp({
        NODE_ENV: "production",
        SESSION_SECRET: "",
        GOOGLE_CLIENT_ID: "",
        GOOGLE_CLIENT_SECRET: "",
        GOOGLE_WORKSPACE_DOMAIN: "",
        PM_EMAILS: "",
        APP_URL: "",
      }),
    /Configura SESSION_SECRET/,
  );
});
test("production disables demo login even with DEMO_MODE=true", async () => {
  const { app, db: productionDb } = createApp({
    NODE_ENV: "production",
    DEMO_MODE: "true",
    DATABASE_PATH: join(dir, "prod.sqlite"),
    SESSION_SECRET: "production-test-secret-at-least-32-characters",
    GOOGLE_CLIENT_ID: "test",
    GOOGLE_CLIENT_SECRET: "test",
    GOOGLE_WORKSPACE_DOMAIN: "example.test",
    PM_EMAILS: "pm@example.test",
    APP_URL: "https://example.test",
  });
  const s = app.listen(0, "127.0.0.1");
  await new Promise((r) => s.once("listening", r));
  try {
    const response = await fetch(
      `http://127.0.0.1:${s.address().port}/api/session`,
    );
    const data = await response.json();
    assert.equal(data.demo, false);
    assert.equal(data.user, null);
    assert.equal(
      productionDb.prepare("SELECT count(*) n FROM projects").get().n,
      0,
    );
  } finally {
    await new Promise((r) => s.close(r));
    productionDb.close();
  }
});
