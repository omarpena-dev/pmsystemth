import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.mjs";

test("status-only updates preserve the latest task fields and enforce workflow guards", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "nexo-status-"));
  const { app, db } = createApp({
    NODE_ENV: "test",
    DEMO_MODE: "true",
    DATABASE_PATH: join(dir, "nexo.sqlite"),
    SESSION_SECRET: "status-regression-secret-for-test-only",
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(async () => {
    await new Promise((r) => server.close(r));
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const url = `http://127.0.0.1:${server.address().port}`;
  let cookie = "",
    csrf = "";
  const request = async (path, method = "GET", body, token = csrf) => {
    const response = await fetch(url + path, {
      method,
      headers: {
        cookie,
        "x-csrf-token": token,
        "content-type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (response.headers.get("set-cookie"))
      cookie = response.headers.get("set-cookie").split(";")[0];
    return { status: response.status, data: await response.json() };
  };
  csrf = (await request("/api/session")).data.csrf;
  csrf = (await request("/api/demo-login", "POST", {})).data.csrf;
  const stale = (await request("/api/workspace")).data.tasks.find(
    (task) => task.id === "t-1",
  );
  const edited = await request(`/api/tasks/${stale.id}`, "PUT", {
    ...stale,
    title: "Título editado por otro miembro",
    description: "Contexto nuevo",
    estimate: 27,
  });
  assert.equal(edited.status, 200);
  const updated = await request(`/api/tasks/${stale.id}/status`, "PATCH", {
    status: "review",
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.data.status, "review");
  assert.equal(updated.data.title, "Título editado por otro miembro");
  assert.equal(updated.data.description, "Contexto nuevo");
  assert.equal(updated.data.estimate, 27);
  assert.equal(
    (
      await request(`/api/tasks/${stale.id}/status`, "PATCH", {
        status: "done",
        title: stale.title,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        `/api/tasks/${stale.id}/status`,
        "PATCH",
        { status: "done" },
        "invalid-csrf",
      )
    ).status,
    403,
  );
  assert.equal(
    (await request("/api/tasks/not-found/status", "PATCH", { status: "done" }))
      .status,
    404,
  );

  const prerequisite = (
    await request("/api/tasks", "POST", {
      project_id: stale.project_id,
      title: "Predecesora pendiente",
      start_date: "2026-01-01",
      due_date: "2026-01-02",
    })
  ).data;
  const dependent = (
    await request("/api/tasks", "POST", {
      project_id: stale.project_id,
      title: "Dependiente bloqueada",
      start_date: "2026-01-02",
      due_date: "2026-01-03",
    })
  ).data;
  assert.equal(
    (
      await request(`/api/tasks/${dependent.id}/dependencies`, "PUT", {
        depends_on_ids: [prerequisite.id],
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request(`/api/tasks/${dependent.id}/status`, "PATCH", {
        status: "in_progress",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(`/api/tasks/${prerequisite.id}/status`, "PATCH", {
        status: "done",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request(`/api/tasks/${dependent.id}/status`, "PATCH", {
        status: "in_progress",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request(`/api/tasks/${prerequisite.id}/status`, "PATCH", {
        status: "todo",
      })
    ).status,
    409,
  );
  const checklist = (
    await request(`/api/tasks/${dependent.id}/checklist`, "POST", {
      title: "Revisión final",
    })
  ).data;
  assert.equal(
    (
      await request(`/api/tasks/${dependent.id}/status`, "PATCH", {
        status: "done",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(
        `/api/tasks/${dependent.id}/checklist/${checklist.id}`,
        "PUT",
        { done: true },
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await request(`/api/tasks/${dependent.id}/status`, "PATCH", {
        status: "done",
      })
    ).status,
    200,
  );
});
