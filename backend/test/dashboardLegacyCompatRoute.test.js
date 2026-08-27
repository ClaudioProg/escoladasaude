"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");

const bcrypt = require("bcrypt");
const express = require("express");

const JWT_SECRET_TESTE = "dashboard-legacy-compat-test-secret";
const SENHA_TESTE = "SenhaTeste#123";
const USUARIO_TESTE = {
  id: 702,
  nome: "Usuário do Dashboard Legado",
  email: "dashboard-legado@example.test",
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

const SENHA_HASH_TESTE = bcrypt.hashSync(SENHA_TESTE, 10);

function criarDbFalso() {
  return {
    async query(sql, params = []) {
      const normalizado = String(sql).replace(/\s+/g, " ").trim();

      if (/FROM usuarios u LEFT JOIN assinaturas a/i.test(normalizado)) {
        assert.equal(params[0], USUARIO_TESTE.cpf);
        return {
          rowCount: 1,
          rows: [{ ...USUARIO_TESTE, senha: SENHA_HASH_TESTE, deleted_at: null }],
        };
      }

      assert.equal(params[0], USUARIO_TESTE.id);

      if (/SELECT id, perfil, deleted_at FROM usuarios/i.test(normalizado)) {
        return {
          rowCount: 1,
          rows: [
            {
              id: USUARIO_TESTE.id,
              perfil: USUARIO_TESTE.perfil,
              deleted_at: null,
            },
          ],
        };
      }

      if (/FROM usuarios WHERE id = \$1 LIMIT 1/i.test(normalizado)) {
        return { rowCount: 1, rows: [USUARIO_TESTE] };
      }

      if (/COUNT\(DISTINCT e\.id\)::int AS total/i.test(normalizado)) {
        return { rowCount: 1, rows: [{ total: 7 }] };
      }

      if (/AVG\(.*desempenho_organizador/i.test(normalizado)) {
        return { rowCount: 1, rows: [{ media_10: 8.5 }] };
      }

      if (/FROM turma_responsavel tr/i.test(normalizado)) {
        return { rowCount: 1, rows: [{ total: 8 }] };
      }

      if (/NOT EXISTS \( SELECT 1 FROM avaliacoes/i.test(normalizado)) {
        return { rowCount: 1, rows: [{ total: 2 }] };
      }

      if (/FROM certificados c/i.test(normalizado)) {
        return { rowCount: 1, rows: [{ total: 3 }] };
      }

      if (/FROM certificados WHERE usuario_id/i.test(normalizado)) {
        return { rowCount: 1, rows: [{ total: 6 }] };
      }

      if (/WITH minhas_turmas AS/i.test(normalizado)) {
        return { rowCount: 1, rows: [{ presenca_total: 9, falta_total: 1 }] };
      }

      if (/ BETWEEN /i.test(normalizado)) {
        return { rowCount: 1, rows: [{ total: 1 }] };
      }

      if (/data_inicio::date \+ COALESCE\(t\.horario_inicio/i.test(normalizado)) {
        return { rowCount: 1, rows: [{ total: 4 }] };
      }

      throw new Error(`SQL não esperado no teste: ${normalizado}`);
    },
  };
}

function carregarRotasComDbFalso() {
  const authPath = path.resolve(__dirname, "../src/auth/authMiddleware.js");
  const loginControllerPath = path.resolve(
    __dirname,
    "../src/controllers/loginController.js",
  );
  const perfilControllerPath = path.resolve(
    __dirname,
    "../src/controllers/perfilController.js",
  );
  const dashboardControllerPath = path.resolve(
    __dirname,
    "../src/controllers/dashboardController.js",
  );
  const loginRoutePath = path.resolve(__dirname, "../src/routes/loginRoute.js");
  const authLegacyRoutePath = path.resolve(
    __dirname,
    "../src/routes/authLegacyCompatRoute.js",
  );
  const dashboardRoutePath = path.resolve(
    __dirname,
    "../src/routes/dashboardRoute.js",
  );
  const dashboardLegacyRoutePath = path.resolve(
    __dirname,
    "../src/routes/dashboardLegacyCompatRoute.js",
  );
  const originalLoad = Module._load;
  const dbFalso = criarDbFalso();

  for (const modulePath of [
    authPath,
    loginControllerPath,
    perfilControllerPath,
    dashboardControllerPath,
    loginRoutePath,
    authLegacyRoutePath,
    dashboardRoutePath,
    dashboardLegacyRoutePath,
  ]) {
    delete require.cache[modulePath];
  }

  Module._load = function carregarComDbFalso(request, parent, isMain) {
    if (
      request === "../db" &&
      [authPath, loginControllerPath, perfilControllerPath, dashboardControllerPath].includes(
        parent?.filename,
      )
    ) {
      return dbFalso;
    }

    if (
      request === "./notificacaoController" &&
      parent?.filename === loginControllerPath
    ) {
      return { gerarNotificacaoDeAvaliacao: async () => undefined };
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    return {
      loginRoute: require(loginRoutePath),
      authLegacyRoute: require(authLegacyRoutePath),
      dashboardRoute: require(dashboardRoutePath),
      dashboardLegacyRoute: require(dashboardLegacyRoutePath),
    };
  } finally {
    Module._load = originalLoad;
  }
}

async function iniciarApp() {
  const {
    loginRoute,
    authLegacyRoute,
    dashboardRoute,
    dashboardLegacyRoute,
  } = carregarRotasComDbFalso();
  const app = express();

  app.use(express.json());
  app.use("/api/login", loginRoute);
  app.use("/api/auth", authLegacyRoute);
  app.use("/api/dashboard", dashboardRoute);
  app.use("/api/dashboard-usuario", dashboardLegacyRoute);
  app.use((_req, res) =>
    res.status(404).json({ code: "API_ROTA_NAO_ENCONTRADA" }),
  );

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  return {
    url: `http://127.0.0.1:${server.address().port}`,
    stop: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function requisitar(url, pathName, { token, method = "GET", body } = {}) {
  const headers = body ? { "Content-Type": "application/json" } : {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${url}${pathName}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  return { response, body: await response.json() };
}

const originalJwtSecret = process.env.JWT_SECRET;
const originalJwtIss = process.env.JWT_ISS;
const originalJwtAud = process.env.JWT_AUD;
const originalJwtIssuer = process.env.JWT_ISSUER;
const originalJwtAudience = process.env.JWT_AUDIENCE;

test.before(() => {
  process.env.JWT_SECRET = JWT_SECRET_TESTE;
  delete process.env.JWT_ISS;
  delete process.env.JWT_AUD;
  delete process.env.JWT_ISSUER;
  delete process.env.JWT_AUDIENCE;
});

test.after(() => {
  for (const [name, value] of [
    ["JWT_SECRET", originalJwtSecret],
    ["JWT_ISS", originalJwtIss],
    ["JWT_AUD", originalJwtAud],
    ["JWT_ISSUER", originalJwtIssuer],
    ["JWT_AUDIENCE", originalJwtAudience],
  ]) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

test("fluxo histórico login -> auth/me -> dashboard-usuario permanece compatível", async () => {
  const app = await iniciarApp();

  try {
    const login = await requisitar(app.url, "/api/login", {
      method: "POST",
      body: { cpf: USUARIO_TESTE.cpf, senha: SENHA_TESTE },
    });
    assert.equal(login.response.status, 200);
    assert.equal(login.body.ok, true);
    assert.equal(typeof login.body.token, "string");

    const authMe = await requisitar(app.url, "/api/auth/me", {
      token: login.body.token,
    });
    assert.equal(authMe.response.status, 200);
    assert.equal(authMe.body.autenticado, true);
    assert.equal(authMe.body.usuario.id, USUARIO_TESTE.id);

    const dashboardLegado = await requisitar(
      app.url,
      "/api/dashboard-usuario",
      { token: login.body.token },
    );
    assert.equal(dashboardLegado.response.status, 200);
    assert.equal(
      dashboardLegado.response.headers.get("cache-control"),
      "no-store",
    );
    assert.equal(
      dashboardLegado.response.headers.get("x-route-handler"),
      "dashboardLegacyCompat:v1:GET /dashboard-usuario",
    );
    assert.deepEqual(dashboardLegado.body, {
      inscricaoFuturas: 4,
      avaliacaoPendentes: 2,
      certificadosEmitidos: 3,
      presencasTotal: 9,
      faltasTotal: 1,
      notaUsuario: 9,
      cursosRealizados: 7,
      eventosinstrutor: 8,
      inscricaoAtuais: 1,
      proximosEventos: 4,
      certificadosTotal: 6,
      mediaAvaliacao: 8.5,
    });
  } finally {
    await app.stop();
  }
});

test("dashboard legado mantém autenticação e não cria catch-all", async () => {
  const app = await iniciarApp();

  try {
    const semToken = await requisitar(app.url, "/api/dashboard-usuario");
    assert.equal(semToken.response.status, 401);

    const tokenInvalido = await requisitar(app.url, "/api/dashboard-usuario", {
      token: "token-invalido",
    });
    assert.equal(tokenInvalido.response.status, 401);

    const login = await requisitar(app.url, "/api/login", {
      method: "POST",
      body: { cpf: USUARIO_TESTE.cpf, senha: SENHA_TESTE },
    });

    const dashboardAtual = await requisitar(app.url, "/api/dashboard", {
      token: login.body.token,
    });
    assert.equal(dashboardAtual.response.status, 200);
    assert.equal(dashboardAtual.body.ok, true);
    assert.equal(dashboardAtual.body.data.inscricao_futura, 4);
    assert.equal(dashboardAtual.body.data.avaliacao_pendente, 2);

    const inexistente = await requisitar(
      app.url,
      "/api/dashboard-usuario/rota-que-nao-existe",
      { token: login.body.token },
    );
    assert.equal(inexistente.response.status, 404);
    assert.equal(inexistente.body.code, "API_ROTA_NAO_ENCONTRADA");
  } finally {
    await app.stop();
  }
});
