"use strict";

// Servidor exclusivamente local para o E2E PWA. Ele monta as rotas reais
// com a mesma fixture usada pelos testes de compatibilidade e alterna entre
// os dois builds sem tocar banco, Render, Vercel ou produção.

const express = require("express");
const fs = require("node:fs/promises");
const http = require("node:http");
const Module = require("node:module");
const path = require("node:path");

const bcrypt = require("bcrypt");

const PORT = Number(process.env.PWA_E2E_PORT || 4175);
const LEGACY_DIST = process.env.PWA_E2E_LEGACY_DIST;
const CURRENT_DIST = process.env.PWA_E2E_CURRENT_DIST;
const PASSWORD = "SenhaTeste#123";
const USER = {
  id: 703,
  nome: "Usuario E2E",
  email: "e2e@example.test",
  cpf: "12345678901",
  perfil: "usuario",
  celular: "13999999999",
  registro: "28.053-7",
  cargo_id: 1,
  unidade_id: 2,
  data_nascimento: "1990-01-02",
  genero_id: 3,
  orientacao_sexual_id: 4,
  cor_raca_id: 5,
  escolaridade_id: 6,
  deficiencia_id: 7,
};

if (!LEGACY_DIST || !CURRENT_DIST || !process.env.JWT_SECRET) {
  throw new Error(
    "PWA_E2E_LEGACY_DIST, PWA_E2E_CURRENT_DIST e JWT_SECRET são obrigatórios.",
  );
}

const passwordHash = bcrypt.hashSync(PASSWORD, 10);

const db = {
  async query(sql) {
    const normalized = String(sql).replace(/\s+/g, " ").trim();

    if (/FROM usuarios u LEFT JOIN assinaturas a/i.test(normalized)) {
      return { rowCount: 1, rows: [{ ...USER, senha: passwordHash, deleted_at: null }] };
    }
    if (/SELECT id, perfil, deleted_at FROM usuarios/i.test(normalized)) {
      return { rowCount: 1, rows: [{ id: USER.id, perfil: USER.perfil, deleted_at: null }] };
    }
    if (/FROM usuarios WHERE id = \$1 LIMIT 1/i.test(normalized)) {
      return { rowCount: 1, rows: [USER] };
    }
    if (/COUNT\(DISTINCT e\.id\)::int AS total/i.test(normalized)) return { rowCount: 1, rows: [{ total: 7 }] };
    if (/AVG\(.*desempenho_organizador/i.test(normalized)) return { rowCount: 1, rows: [{ media_10: 8.5 }] };
    if (/FROM turma_responsavel tr/i.test(normalized)) return { rowCount: 1, rows: [{ total: 8 }] };
    if (/NOT EXISTS \( SELECT 1 FROM avaliacoes/i.test(normalized)) return { rowCount: 1, rows: [{ total: 2 }] };
    if (/FROM certificados c/i.test(normalized)) return { rowCount: 1, rows: [{ total: 3 }] };
    if (/FROM certificados WHERE usuario_id/i.test(normalized)) return { rowCount: 1, rows: [{ total: 6 }] };
    if (/WITH minhas_turmas AS/i.test(normalized)) return { rowCount: 1, rows: [{ presenca_total: 9, falta_total: 1 }] };
    if (/ BETWEEN /i.test(normalized)) return { rowCount: 1, rows: [{ total: 1 }] };
    if (/data_inicio::date \+ COALESCE\(t\.horario_inicio/i.test(normalized)) return { rowCount: 1, rows: [{ total: 4 }] };

    throw new Error(`SQL inesperado no E2E PWA: ${normalized}`);
  },
};

function loadRoutes() {
  const sourceRoot = path.resolve(__dirname, "..");
  const modules = {
    auth: path.join(sourceRoot, "src/auth/authMiddleware.js"),
    loginController: path.join(sourceRoot, "src/controllers/loginController.js"),
    perfilController: path.join(sourceRoot, "src/controllers/perfilController.js"),
    dashboardController: path.join(sourceRoot, "src/controllers/dashboardController.js"),
    login: path.join(sourceRoot, "src/routes/loginRoute.js"),
    authLegacy: path.join(sourceRoot, "src/routes/authLegacyCompatRoute.js"),
    perfil: path.join(sourceRoot, "src/routes/perfilRoute.js"),
    dashboard: path.join(sourceRoot, "src/routes/dashboardRoute.js"),
    dashboardLegacy: path.join(sourceRoot, "src/routes/dashboardLegacyCompatRoute.js"),
  };

  Object.values(modules).forEach((modulePath) => delete require.cache[modulePath]);
  const originalLoad = Module._load;

  Module._load = function loadWithFixture(request, parent, isMain) {
    if (
      request === "../db" &&
      parent &&
      [modules.auth, modules.loginController, modules.perfilController, modules.dashboardController].includes(parent.filename)
    ) return db;
    if (request === "./notificacaoController" && parent?.filename === modules.loginController) {
      return { gerarNotificacaoDeAvaliacao: async () => undefined };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    return {
      login: require(modules.login),
      authLegacy: require(modules.authLegacy),
      perfil: require(modules.perfil),
      dashboard: require(modules.dashboard),
      dashboardLegacy: require(modules.dashboardLegacy),
    };
  } finally {
    Module._load = originalLoad;
  }
}

function contentType(filename) {
  return {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json; charset=utf-8",
  }[path.extname(filename)] || "application/octet-stream";
}

let stage = "legacy";
const calls = [];
const routes = loadRoutes();
const app = express();

app.use(express.json());
app.use((req, _res, next) => {
  calls.push({ method: req.method, path: req.path });
  next();
});
app.use("/api/login", routes.login);
app.use("/api/auth", routes.authLegacy);
app.use("/api/perfil", routes.perfil);
app.use("/api/dashboard", routes.dashboard);
app.use("/api/dashboard-usuario", routes.dashboardLegacy);
app.use("/api", (_req, res) => res.status(404).json({ code: "API_ROTA_NAO_ENCONTRADA" }));

app.post("/__e2e/switch", (req, res) => {
  stage = req.body?.stage === "current" ? "current" : "legacy";
  res.status(200).json({ ok: true, stage });
});
app.get("/__e2e/evidence", (_req, res) => res.json({ stage, calls }));

app.use(async (req, res) => {
  const root = stage === "legacy" ? LEGACY_DIST : CURRENT_DIST;
  const requested = decodeURIComponent(new URL(req.url, "http://local").pathname);
  const relative = requested === "/" ? "index.html" : requested.replace(/^\/+/, "");
  if (relative.includes("..")) return res.sendStatus(400);
  const file = path.join(root, relative);

  try {
    res.type(contentType(file)).send(await fs.readFile(file));
  } catch {
    if (!path.extname(relative)) {
      return res.type("text/html").send(await fs.readFile(path.join(root, "index.html")));
    }
    return res.sendStatus(404);
  }
});

const server = http.createServer(app);
server.listen(PORT, "127.0.0.1", () => {
  console.log(`PWA_E2E_READY http://127.0.0.1:${PORT}`);
});

function stop() {
  server.close(() => process.exit(0));
}
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
