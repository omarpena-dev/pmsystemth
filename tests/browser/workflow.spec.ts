import { test, expect } from "@playwright/test";
test("PM creates a project and task, comments, updates status and exports", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Hola, Omar" })).toBeVisible();
  await page.screenshot({ path: "/tmp/nexo-dashboard.png", fullPage: true });
  await page
    .getByRole("button", { name: "Nuevo proyecto", exact: true })
    .click();
  await page
    .getByLabel("Nombre del proyecto")
    .fill("Proyecto E2E " + Date.now());
  await page
    .getByLabel("Descripción", { exact: true })
    .fill("Verificación completa de colaboración");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Crear proyecto", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Proyectos", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /Proyecto E2E/ }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Proyecto E2E/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Nueva tarea", exact: true }).click();
  await page.getByLabel("Nombre de la tarea").fill("Preparar prueba funcional");
  await page
    .getByRole("combobox", { name: "Responsable", exact: true })
    .selectOption("demo-ana");
  await page.getByLabel("Esfuerzo estimado (horas)").fill("6");
  await page.getByRole("button", { name: "Crear tarea", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: /Preparar prueba funcional/ }).click();
  await page
    .getByRole("textbox", { name: "Comentario", exact: true })
    .fill("Listo para revisión del PM");
  await page.getByRole("button", { name: "Enviar comentario" }).click();
  await expect(
    page.getByText("Listo para revisión del PM", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Estado", exact: true })
    .selectOption("done");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(
    page
      .locator(".kanban-column")
      .filter({
        has: page.getByRole("button", {
          name: "Crear tarea en Completada",
          exact: true,
        }),
      })
      .getByRole("heading", { name: "Preparar prueba funcional" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Hola, Omar" })).toBeVisible();
  await page
    .getByRole("button", { name: "Mis tareas", exact: false })
    .first()
    .click();
  await page.getByRole("button", { name: "Solo mis tareas" }).click();
  await page.getByRole("button", { name: "Lista", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Buscar proyectos o tareas" })
    .fill("Preparar prueba funcional");
  await expect(
    page.getByRole("button", { name: /Preparar prueba funcional/ }),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/nexo-tareas-.*\.csv/);
  await page
    .getByRole("button", { name: "Integraciones NUEVO", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Google Calendar", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Equipo", exact: true }).click();
  await page
    .locator(".member-card")
    .filter({ has: page.getByRole("heading", { name: "Ana García" }) })
    .getByRole("button", { name: "Ver tareas" })
    .click();
  await expect(page.getByLabel("Filtrar responsable")).toHaveValue("demo-ana");
  await expect(
    page.getByRole("button", { name: /Preparar prueba funcional/ }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("mobile navigation, timeline and task dialog fit the screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Hola, Omar" })).toBeVisible();
  await page.screenshot({ path: "/tmp/nexo-mobile.png", fullPage: true });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.locator(".search-box").click();
  await page
    .getByRole("textbox", { name: "Buscar proyectos o tareas" })
    .fill("Diseñar");
  await expect(
    page.getByRole("textbox", { name: "Buscar proyectos o tareas" }),
  ).toHaveValue("Diseñar");
  await page.getByRole("button", { name: "Limpiar búsqueda" }).click();
  await page.getByRole("button", { name: "Abrir menú" }).click();
  await page.getByRole("button", { name: "Cronograma", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Una perspectiva más amplia." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Periodo siguiente" }).click();
  await page.getByRole("button", { name: "Hoy", exact: true }).click();
  await page
    .getByRole("button", { name: "Diseñar el nuevo dashboard", exact: true })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(
    await page
      .getByRole("dialog")
      .evaluate((el) => el.getBoundingClientRect().width < innerWidth),
  ).toBeTruthy();
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
