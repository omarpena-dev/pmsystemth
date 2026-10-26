import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

type Project = {
  id: string;
  name: string;
  start_date: string;
  due_date: string;
};
type Task = { id: string; title: string };
const workspaceDate = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const shiftDate = (value: string, days: number) => {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
async function bootstrap(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Hola, Omar" })).toBeVisible();
  const session = await page.request.get("/api/session");
  expect(session.ok()).toBeTruthy();
  return (await session.json()).csrf as string;
}
async function create(page: Page, token: string, route: string, body: unknown) {
  const response = await page.request.post(`/api${route}`, {
    headers: { "x-csrf-token": token },
    data: body,
  });
  expect(response.status(), await response.text()).toBe(201);
  return response.json();
}
async function projectFixture(page: Page, token: string): Promise<Project> {
  const date = workspaceDate();
  return create(page, token, "/projects", {
    name: `Seguimiento E2E ${Date.now()}`,
    description: "Proyecto aislado para verificar entregas y esfuerzo real",
    start_date: shiftDate(date, -7),
    due_date: shiftDate(date, 30),
    budget: 12000,
    spent: 3000,
    status: "active",
  });
}
async function taskFixture(
  page: Page,
  token: string,
  project: Project,
  title: string,
): Promise<Task> {
  return create(page, token, "/tasks", {
    title,
    project_id: project.id,
    start_date: workspaceDate(),
    due_date: shiftDate(workspaceDate(), 3),
    status: "todo",
    priority: "medium",
    assignee_id: "demo-pm",
    estimate: 4,
  });
}
async function openProject(page: Page, project: Project) {
  await page
    .locator("aside.sidebar")
    .getByRole("button", { name: project.name, exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: project.name, exact: true }),
  ).toBeVisible();
}
async function openTask(page: Page, task: Task) {
  await page.getByRole("button", { name: new RegExp(task.title) }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Planificación y seguimiento" }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Nueva subtarea" }),
  ).toBeVisible();
}

test("checklist, dependencies and hours remain consistent through task completion and reports", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const token = await bootstrap(page);
  const project = await projectFixture(page, token);
  const predecessor = await taskFixture(
    page,
    token,
    project,
    "Preparar insumos previos",
  );
  const delivery = await taskFixture(
    page,
    token,
    project,
    "Entregar propuesta con seguimiento",
  );
  await page.reload();
  await expect(page.getByRole("heading", { name: "Hola, Omar" })).toBeVisible();
  await openProject(page, project);
  await openTask(page, delivery);
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("textbox", { name: "Nueva subtarea" })
    .fill("Revisar criterios de aceptación");
  await dialog.getByRole("button", { name: "Añadir", exact: true }).click();
  const checklist = dialog.getByRole("checkbox", {
    name: "Revisar criterios de aceptación",
    exact: true,
  });
  await expect(checklist).not.toBeChecked();
  await dialog
    .getByRole("combobox", { name: "Estado", exact: true })
    .selectOption("done");
  await dialog.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(
    dialog
      .getByRole("alert")
      .filter({ hasText: /Completa todas las subtareas/ }),
  ).toBeVisible();
  await dialog
    .getByRole("combobox", { name: "Estado", exact: true })
    .selectOption("todo");
  await checklist.check();
  await expect(checklist).toBeChecked();
  await dialog.getByRole("spinbutton", { name: "Tiempo (minutos)" }).fill("90");
  await expect(dialog.getByLabel("Fecha del trabajo")).toHaveValue(
    workspaceDate(),
  );
  await dialog
    .getByRole("textbox", { name: "Nota del registro" })
    .fill("Revisión detallada con operaciones");
  await dialog
    .getByRole("button", { name: "Registrar tiempo", exact: true })
    .click();
  await expect(
    dialog
      .locator(".plan-time-entries")
      .getByText("Revisión detallada con operaciones", { exact: true }),
  ).toBeVisible();
  await expect(dialog.locator(".plan-time-total")).toHaveText("1 h 30 min");
  await dialog
    .getByRole("checkbox", { name: /Preparar insumos previos/ })
    .check();
  await dialog
    .getByRole("button", { name: "Guardar dependencias", exact: true })
    .click();
  await expect(
    dialog.getByText(/Bloqueada por 1 tarea pendiente/),
  ).toBeVisible();
  await dialog
    .getByRole("combobox", { name: "Estado", exact: true })
    .selectOption("in_progress");
  await dialog.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(
    dialog
      .getByRole("alert")
      .filter({ hasText: /Completa las tareas predecesoras/ }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();
  const deliveryCard = page
    .locator(".task-card")
    .filter({
      has: page.getByRole("heading", { name: delivery.title, exact: true }),
    });
  await expect(
    deliveryCard.getByText("Bloqueada por predecesora", { exact: true }),
  ).toBeVisible();
  await deliveryCard
    .getByRole("combobox", { name: `Estado de ${delivery.title}`, exact: true })
    .selectOption("in_progress");
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: /Completa las tareas predecesoras/ }),
  ).toBeVisible();
  await expect(deliveryCard.getByRole("combobox")).toHaveValue("todo");

  await page.getByRole("button", { name: "Reportes", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Proyecto del reporte", exact: true })
    .selectOption(project.id);
  await expect(
    page
      .locator(".reports-stats article")
      .filter({ hasText: "Esfuerzo registrado" })
      .locator("strong"),
  ).toHaveText("1.5 h");
  await expect(
    page
      .locator(".reports-attention")
      .getByText(delivery.title, { exact: true }),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Exportar reporte CSV", exact: true })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^nexo-reporte-.*\.csv$/);
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();
  const csv = await readFile(downloadPath!, "utf8");
  expect(csv).toContain(project.name);
  expect(csv).toContain('"Horas registradas"');
  expect(csv).toContain('"1.5"');
  expect(csv.trim().split(/\r?\n/)).toHaveLength(2);

  await openProject(page, project);
  await openTask(page, predecessor);
  await dialog
    .getByRole("combobox", { name: "Estado", exact: true })
    .selectOption("done");
  await dialog.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(dialog).toHaveCount(0);
  await openTask(page, delivery);
  await expect(
    dialog.getByRole("checkbox", {
      name: "Revisar criterios de aceptación",
      exact: true,
    }),
  ).toBeChecked();
  await expect(dialog.locator(".plan-time-total")).toHaveText("1 h 30 min");
  await expect(
    dialog.getByText("Todas las tareas previas están completadas.", {
      exact: true,
    }),
  ).toBeVisible();
  await dialog
    .getByRole("combobox", { name: "Estado", exact: true })
    .selectOption("done");
  await dialog.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(deliveryCard.getByRole("combobox")).toHaveValue("done");
  expect(errors).toEqual([]);
});

test("PM creates, edits and completes a project milestone", async ({
  page,
}) => {
  const token = await bootstrap(page);
  const project = await projectFixture(page, token);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Hola, Omar" })).toBeVisible();
  await page.getByRole("button", { name: "Hitos", exact: true }).click();
  await page.getByLabel("Filtrar hitos por proyecto").selectOption(project.id);
  await page.getByRole("button", { name: "Nuevo hito", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Nombre del hito", exact: true })
    .fill("Validación de operaciones");
  await page
    .getByRole("combobox", { name: "Proyecto del hito", exact: true })
    .selectOption(project.id);
  await page
    .getByLabel("Fecha del hito", { exact: true })
    .fill(shiftDate(workspaceDate(), 5));
  await page.getByRole("button", { name: "Crear hito", exact: true }).click();
  const milestone = page
    .locator(".plan-milestone-project li")
    .filter({ hasText: "Validación de operaciones" });
  await expect(milestone).toBeVisible();
  await milestone
    .getByRole("button", {
      name: "Editar hito Validación de operaciones",
      exact: true,
    })
    .click();
  await page
    .getByRole("textbox", { name: "Nombre del hito", exact: true })
    .fill("Validación final de operaciones");
  await page
    .getByLabel("Fecha del hito", { exact: true })
    .fill(shiftDate(workspaceDate(), 6));
  await page.getByRole("button", { name: "Guardar hito", exact: true }).click();
  const edited = page
    .locator(".plan-milestone-project li")
    .filter({ hasText: "Validación final de operaciones" });
  await edited
    .getByRole("button", {
      name: "Completar hito Validación final de operaciones",
      exact: true,
    })
    .click();
  await expect(edited.locator(".plan-milestone-status")).toHaveText(
    "Alcanzado",
  );
  await page.reload();
  await expect(page.getByRole("heading", { name: "Hola, Omar" })).toBeVisible();
  await page.getByRole("button", { name: "Hitos", exact: true }).click();
  await page.getByLabel("Filtrar hitos por proyecto").selectOption(project.id);
  await expect(edited.locator(".plan-milestone-status")).toHaveText(
    "Alcanzado",
  );
});

test("mobile drawer hides keyboard targets, traps focus and returns focus on Escape", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await bootstrap(page);
  const drawer = page.locator("aside.sidebar");
  await page.keyboard.press("Tab");
  expect(
    await drawer.evaluate((el) => el.contains(document.activeElement)),
  ).toBeFalsy();
  const trigger = page.getByRole("button", { name: "Abrir menú", exact: true });
  await trigger.click();
  await expect(drawer).not.toHaveAttribute("inert");
  expect(
    await drawer.evaluate((el) => el.contains(document.activeElement)),
  ).toBeTruthy();
  await page.keyboard.press("Shift+Tab");
  expect(
    await drawer.evaluate((el) => el.contains(document.activeElement)),
  ).toBeTruthy();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(drawer).toHaveAttribute("inert");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});
