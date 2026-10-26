import express from "express";
import session from "express-session";
import helmet from "helmet";
import { google } from "googleapis";
import { z } from "zod";
import {
  randomUUID,
  randomBytes,
  createCipheriv,
  createDecipheriv,
  createHash,
  timingSafeEqual,
} from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { openDatabase, SQLiteSessionStore, seedDemo } from "./db.mjs";

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v,
    "Fecha inválida",
  );
const projectSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    description: z.string().max(3000).default(""),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .default("#7c69ef"),
    status: z
      .enum(["planning", "active", "at_risk", "completed"])
      .default("planning"),
    start_date: date,
    due_date: date,
    budget: z.number().min(0).max(1e10).default(0),
    spent: z.number().min(0).max(1e10).default(0),
  })
  .refine((v) => v.due_date >= v.start_date, {
    message: "La fecha final debe ser posterior a la inicial",
    path: ["due_date"],
  });
const taskSchema = z
  .object({
    project_id: z.string().min(1),
    title: z.string().trim().min(2).max(200),
    description: z.string().max(5000).default(""),
    status: z.enum(["todo", "in_progress", "review", "done"]).default("todo"),
    priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
    assignee_id: z.string().nullable().default(null),
    start_date: date,
    due_date: date,
    estimate: z.number().min(0).max(10000).default(0),
    drive_url: z
      .union([
        z.literal(""),
        z
          .string()
          .url()
          .refine(
            (v) =>
              ["drive.google.com", "docs.google.com"].includes(
                new URL(v).hostname,
              ),
            "Usa un enlace de Google Drive",
          ),
      ])
      .default(""),
  })
  .refine((v) => v.due_date >= v.start_date, {
    message: "La fecha final debe ser posterior a la inicial",
    path: ["due_date"],
  });

export function createApp(config = {}) {
  const env = { ...process.env, ...config };
  env.APP_URL ||= env.RENDER_EXTERNAL_URL;
  const production = env.NODE_ENV === "production";
  const demo = !production && env.DEMO_MODE !== "false";
  const domain = (env.GOOGLE_WORKSPACE_DOMAIN || "").toLowerCase().trim();
  const pmEmails = (env.PM_EMAILS || "")
    .toLowerCase()
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  if (
    production &&
    (!env.SESSION_SECRET ||
      env.SESSION_SECRET.length < 32 ||
      !env.GOOGLE_CLIENT_ID ||
      !env.GOOGLE_CLIENT_SECRET ||
      !domain ||
      !pmEmails.length ||
      !env.APP_URL?.startsWith("https://"))
  )
    throw new Error(
      "Configura SESSION_SECRET (32+ caracteres), GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_WORKSPACE_DOMAIN, PM_EMAILS y APP_URL HTTPS antes de iniciar producción.",
    );
  const secret = env.SESSION_SECRET || randomBytes(32).toString("hex");
  const key = createHash("sha256").update(secret).digest();
  const encrypt = (value) => {
    const iv = randomBytes(12);
    const c = createCipheriv("aes-256-gcm", key, iv);
    const body = Buffer.concat([c.update(JSON.stringify(value)), c.final()]);
    return Buffer.concat([iv, c.getAuthTag(), body]).toString("base64");
  };
  const decrypt = (value) => {
    const b = Buffer.from(value, "base64");
    const c = createDecipheriv("aes-256-gcm", key, b.subarray(0, 12));
    c.setAuthTag(b.subarray(12, 28));
    return JSON.parse(
      Buffer.concat([c.update(b.subarray(28)), c.final()]).toString(),
    );
  };
  const db = openDatabase(
    env.DATABASE_PATH || (demo ? "./data/demo.sqlite" : "./data/nexo.sqlite"),
  );
  if (demo) seedDemo(db);
  const app = express();
  app.disable("x-powered-by");
  if (production) app.set("trust proxy", 1);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https://lh3.googleusercontent.com"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: production ? [] : null,
        },
      },
    }),
  );
  app.use(express.json({ limit: "64kb" }));
  app.use(
    session({
      secret,
      store: new SQLiteSessionStore(db),
      resave: false,
      saveUninitialized: false,
      name: "nexo.sid",
      cookie: {
        httpOnly: true,
        secure: production,
        sameSite: "lax",
        maxAge: 7 * 86400000,
      },
    }),
  );
  const publicUser = (user) =>
    user
      ? {
          id: user.id,
          name: user.name,
          email: user.email,
          avatar: user.avatar,
          role: user.role,
          googleConnected: !!user.tokens,
        }
      : null;
  const userFor = (req) =>
    req.session.userId
      ? db.prepare("SELECT * FROM users WHERE id=?").get(req.session.userId)
      : null;
  const log = (req, message) =>
    db
      .prepare("INSERT INTO activity(user_id,message,created_at) VALUES(?,?,?)")
      .run(req.session.userId, message, new Date().toISOString());
  const csrf = (req) => (req.session.csrf ||= randomBytes(24).toString("hex"));
  const apiError = (status, message) =>
    Object.assign(new Error(message), { status });
  app.get("/api/health", (_req, res) => {
    db.prepare("SELECT 1").get();
    res.json({ status: "ok" });
  });
  app.get("/api/session", (req, res) =>
    res.json({
      user: publicUser(userFor(req)),
      csrf: csrf(req),
      demo,
      googleConfigured: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
      domain,
    }),
  );
  // Session-bound CSRF tokens and SameSite cookies protect state-changing endpoints.
  app.use((req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    const token = req.get("x-csrf-token") || "";
    const expected = req.session.csrf || "";
    if (
      !expected ||
      Buffer.byteLength(token) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(token), Buffer.from(expected))
    )
      return res
        .status(403)
        .json({ error: "La sesión expiró. Recarga la página." });
    next();
  });
  app.post("/api/demo-login", (req, res, next) => {
    if (!demo) return res.status(404).json({ error: "No disponible" });
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.userId = "demo-pm";
      res.json({ user: publicUser(userFor(req)), csrf: csrf(req) });
    });
  });
  app.post("/api/logout", (req, res, next) =>
    req.session.destroy((err) => {
      if (err) return next(err);
      res.clearCookie("nexo.sid");
      res.json({ ok: true });
    }),
  );
  function oauth() {
    return new google.auth.OAuth2(
      env.GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_SECRET,
      `${(env.APP_URL || "http://localhost:3000").replace(/\/$/, "")}/auth/google/callback`,
    );
  }
  app.get("/auth/google", (req, res) => {
    if (
      !env.GOOGLE_CLIENT_ID ||
      !env.GOOGLE_CLIENT_SECRET ||
      !domain ||
      !pmEmails.length
    )
      return res.redirect("/?auth_error=configuration");
    const state = randomBytes(24).toString("hex");
    req.session.oauthState = state;
    req.session.oauthAt = Date.now();
    res.redirect(
      oauth().generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        state,
        hd: domain,
        scope: [
          "openid",
          "email",
          "profile",
          "https://www.googleapis.com/auth/calendar.events",
          "https://www.googleapis.com/auth/drive.metadata.readonly",
        ],
      }),
    );
  });
  app.get("/auth/google/callback", async (req, res) => {
    try {
      if (
        !req.query.state ||
        req.query.state !== req.session.oauthState ||
        Date.now() - req.session.oauthAt > 600000
      )
        throw apiError(403, "state");
      delete req.session.oauthState;
      delete req.session.oauthAt;
      if (typeof req.query.code !== "string") throw apiError(400, "code");
      const auth = oauth();
      const { tokens } = await auth.getToken(req.query.code);
      const ticket = await auth.verifyIdToken({
        idToken: tokens.id_token,
        audience: env.GOOGLE_CLIENT_ID,
      });
      const profile = ticket.getPayload();
      if (
        !profile?.email_verified ||
        profile.hd?.toLowerCase() !== domain ||
        !profile.email?.toLowerCase().endsWith(`@${domain}`)
      )
        throw apiError(403, "domain");
      const id = profile.sub;
      const old = db.prepare("SELECT tokens FROM users WHERE id=?").get(id);
      const previous = old?.tokens ? decrypt(old.tokens) : {};
      db.prepare(
        "INSERT INTO users(id,name,email,avatar,role,tokens) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,email=excluded.email,avatar=excluded.avatar,role=excluded.role,tokens=excluded.tokens",
      ).run(
        id,
        profile.name || profile.email,
        profile.email.toLowerCase(),
        profile.picture || null,
        pmEmails.includes(profile.email.toLowerCase()) ? "admin" : "member",
        encrypt({ ...previous, ...tokens }),
      );
      req.session.regenerate((err) => {
        if (err) return res.redirect("/?auth_error=google");
        req.session.userId = id;
        req.session.save(() => res.redirect("/"));
      });
    } catch (e) {
      console.error("Google OAuth failed:", e.status || "provider_error");
      res.redirect(
        `/?auth_error=${e.message === "domain" ? "domain" : "google"}`,
      );
    }
  });
  app.use("/api", (req, res, next) => {
    req.user = userFor(req);
    if (!req.user)
      return res.status(401).json({ error: "Inicia sesión para continuar" });
    next();
  });
  const admin = (req, _res, next) =>
    req.user.role === "admin"
      ? next()
      : next(
          apiError(
            403,
            "Solo el PM puede administrar proyectos y eliminar tareas",
          ),
        );
  const getProject = (id) => {
    const p = db.prepare("SELECT * FROM projects WHERE id=?").get(id);
    if (!p) throw apiError(404, "Proyecto no encontrado");
    return p;
  };
  const getTask = (id) => {
    const t = db.prepare("SELECT * FROM tasks WHERE id=?").get(id);
    if (!t) throw apiError(404, "Tarea no encontrada");
    return t;
  };
  const validateAssignee = (id) => {
    if (id && !db.prepare("SELECT id FROM users WHERE id=?").get(id))
      throw apiError(400, "Responsable no encontrado");
  };
  app.get("/api/workspace", (_req, res) =>
    res.json({
      projects: db
        .prepare("SELECT * FROM projects ORDER BY created_at DESC")
        .all(),
      tasks: db.prepare("SELECT * FROM tasks ORDER BY created_at DESC").all(),
      users: db
        .prepare("SELECT id,name,email,avatar,role FROM users ORDER BY name")
        .all(),
      activity: db
        .prepare(
          "SELECT a.*,u.name FROM activity a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 25",
        )
        .all(),
    }),
  );
  app.post("/api/projects", admin, (req, res) => {
    const p = projectSchema.parse(req.body);
    const id = randomUUID();
    db.prepare("INSERT INTO projects VALUES(?,?,?,?,?,?,?,?,?,?)").run(
      id,
      p.name,
      p.description,
      p.color,
      p.status,
      p.start_date,
      p.due_date,
      p.budget,
      p.spent,
      new Date().toISOString(),
    );
    log(req, `creó el proyecto ${p.name}`);
    res.status(201).json(getProject(id));
  });
  app.put("/api/projects/:id", admin, (req, res) => {
    getProject(req.params.id);
    const p = projectSchema.parse(req.body);
    db.prepare(
      "UPDATE projects SET name=?,description=?,color=?,status=?,start_date=?,due_date=?,budget=?,spent=? WHERE id=?",
    ).run(
      p.name,
      p.description,
      p.color,
      p.status,
      p.start_date,
      p.due_date,
      p.budget,
      p.spent,
      req.params.id,
    );
    log(req, `actualizó el proyecto ${p.name}`);
    res.json(getProject(req.params.id));
  });
  app.delete("/api/projects/:id", admin, (req, res) => {
    const p = getProject(req.params.id);
    db.prepare("DELETE FROM projects WHERE id=?").run(p.id);
    log(req, `archivó y eliminó el proyecto ${p.name}`);
    res.json({ ok: true });
  });
  app.post("/api/tasks", (req, res) => {
    const t = taskSchema.parse(req.body);
    getProject(t.project_id);
    validateAssignee(t.assignee_id);
    const id = randomUUID();
    db.prepare("INSERT INTO tasks VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(
      id,
      t.project_id,
      t.title,
      t.description,
      t.status,
      t.priority,
      t.assignee_id,
      t.start_date,
      t.due_date,
      t.estimate,
      t.drive_url,
      new Date().toISOString(),
    );
    log(req, `creó la tarea ${t.title}`);
    res.status(201).json(getTask(id));
  });
  app.put("/api/tasks/:id", (req, res) => {
    getTask(req.params.id);
    const t = taskSchema.parse(req.body);
    getProject(t.project_id);
    validateAssignee(t.assignee_id);
    db.prepare(
      "UPDATE tasks SET project_id=?,title=?,description=?,status=?,priority=?,assignee_id=?,start_date=?,due_date=?,estimate=?,drive_url=? WHERE id=?",
    ).run(
      t.project_id,
      t.title,
      t.description,
      t.status,
      t.priority,
      t.assignee_id,
      t.start_date,
      t.due_date,
      t.estimate,
      t.drive_url,
      req.params.id,
    );
    log(req, `actualizó ${t.title}`);
    res.json(getTask(req.params.id));
  });
  app.delete("/api/tasks/:id", admin, (req, res) => {
    const t = getTask(req.params.id);
    db.prepare("DELETE FROM tasks WHERE id=?").run(t.id);
    log(req, `eliminó la tarea ${t.title}`);
    res.json({ ok: true });
  });
  app.get("/api/tasks/:id/comments", (req, res) => {
    getTask(req.params.id);
    res.json(
      db
        .prepare(
          "SELECT c.*,u.name FROM comments c JOIN users u ON u.id=c.user_id WHERE task_id=? ORDER BY created_at",
        )
        .all(req.params.id),
    );
  });
  app.post("/api/tasks/:id/comments", (req, res) => {
    getTask(req.params.id);
    const { body } = z
      .object({ body: z.string().trim().min(1).max(3000) })
      .parse(req.body);
    db.prepare("INSERT INTO comments VALUES(?,?,?,?,?)").run(
      randomUUID(),
      req.params.id,
      req.user.id,
      body,
      new Date().toISOString(),
    );
    log(req, `comentó en ${getTask(req.params.id).title}`);
    res.status(201).json({ ok: true });
  });
  async function googleAuth(req) {
    if (!req.user.tokens)
      throw apiError(
        409,
        "Conecta tu cuenta de Google Workspace para usar esta función",
      );
    const auth = oauth();
    auth.setCredentials(decrypt(req.user.tokens));
    auth.on("tokens", (tokens) => {
      const current = db
        .prepare("SELECT tokens FROM users WHERE id=?")
        .get(req.user.id);
      db.prepare("UPDATE users SET tokens=? WHERE id=?").run(
        encrypt({ ...decrypt(current.tokens), ...tokens }),
        req.user.id,
      );
    });
    return auth;
  }
  app.get("/api/google/files", async (req, res) => {
    const auth = await googleAuth(req);
    const q = typeof req.query.q === "string" ? req.query.q.slice(0, 100) : "";
    const escaped = q.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const { data } = await google.drive({ version: "v3", auth }).files.list({
      q: `trashed = false${q ? ` and name contains '${escaped}'` : ""}`,
      fields: "files(id,name,mimeType,webViewLink,modifiedTime)",
      pageSize: 30,
      orderBy: "modifiedTime desc",
    });
    res.json(data.files || []);
  });
  app.post("/api/tasks/:id/calendar", async (req, res) => {
    const t = getTask(req.params.id);
    const auth = await googleAuth(req);
    const cal = google.calendar({ version: "v3", auth });
    const end = new Date(`${t.due_date}T12:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    const requestBody = {
      summary: t.title,
      description: `${getProject(t.project_id).name}\n\n${t.description}${t.drive_url ? `\n${t.drive_url}` : ""}`,
      start: { date: t.start_date },
      end: { date: end.toISOString().slice(0, 10) },
    };
    const existing = db
      .prepare(
        "SELECT event_id FROM calendar_events WHERE task_id=? AND user_id=?",
      )
      .get(t.id, req.user.id);
    let data;
    if (existing) {
      try {
        ({ data } = await cal.events.update({
          calendarId: "primary",
          eventId: existing.event_id,
          requestBody,
        }));
      } catch (e) {
        if (e.code !== 404 && e.code !== 410) throw e;
      }
    }
    if (!data) {
      const eventId = createHash("sha256")
        .update(`${t.id}:${req.user.id}${existing ? `:${randomUUID()}` : ""}`)
        .digest("hex");
      try {
        ({ data } = await cal.events.insert({
          calendarId: "primary",
          requestBody: { ...requestBody, id: eventId },
        }));
      } catch (e) {
        if (e.code !== 409) throw e;
        ({ data } = await cal.events.update({
          calendarId: "primary",
          eventId,
          requestBody,
        }));
      }
    }
    db.prepare("INSERT OR REPLACE INTO calendar_events VALUES(?,?,?)").run(
      t.id,
      req.user.id,
      data.id,
    );
    log(req, `sincronizó ${t.title} con Google Calendar`);
    res.json({ url: data.htmlLink });
  });
  app.post("/api/google/disconnect", async (req, res) => {
    const u = req.user;
    if (u.tokens) {
      try {
        const auth = await googleAuth(req);
        await auth.revokeCredentials();
      } catch {
        /* Local deletion must work even if Google already revoked access. */
      }
      db.prepare("UPDATE users SET tokens=NULL WHERE id=?").run(u.id);
    }
    res.json({ ok: true });
  });
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "Ruta no encontrada" }),
  );
  const dist = resolve("dist");
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.get("/{*path}", (_req, res) =>
      res.sendFile(resolve(dist, "index.html")),
    );
  }
  app.use((err, _req, res, _next) => {
    if (err instanceof z.ZodError)
      return res.status(400).json({
        error: err.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      });
    const status =
      err.status ||
      ([400, 401, 403, 404, 409, 429].includes(err.code) ? err.code : 500);
    if (status >= 500) console.error("Request failed:", err.code || err.name);
    res.status(status >= 400 && status < 600 ? status : 500).json({
      error: err.status
        ? err.message
        : err.code === 403
          ? "Google rechazó el permiso. Verifica los permisos de tu cuenta."
          : err.code === 401
            ? "La conexión con Google expiró. Vuelve a conectar tu cuenta."
            : "No se pudo completar la operación. Intenta de nuevo.",
    });
  });
  return { app, db, demo };
}
