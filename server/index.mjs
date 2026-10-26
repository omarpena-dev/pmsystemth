import { createApp } from "./app.mjs";
const { app, demo } = createApp();
const port = Number(process.env.PORT || 3000);
app.listen(port, "0.0.0.0", () =>
  console.log(
    `Nexo escuchando en puerto ${port}. Modo ${demo ? "demostración local" : "Google Workspace"}.`,
  ),
);
