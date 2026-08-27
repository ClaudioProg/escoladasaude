"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");

const express = require("express");
const jwt = require("jsonwebtoken");

const JWT_SECRET_TESTE = "auth-legacy-compat-test-secret";
const USUARIO_TESTE = {
  id: 701,
  nome: "Usuário de Compatibilidade",
  email: "compatibilidade@example.test",
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
  senha: "hash-que-nunca-pode-sair-na-resposta",
};

function criarDbFalso() {
  return {
    async query(sql, params = []) {
      const normalizado = String(sql).replace(/\s+/g, " ").trim();

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
        const { senha, ...usuarioDaConsulta } = USUARIO_TESTE;
        return { rowCount: 1, rows: [usuarioDaConsulta] };
      }

      throw new Error(`SQL não esperado no teste: ${normalizado}`);
    },
  };
}

function carregarRotasComDbFalso() {
  const authPath = path.resolve(__dirname, "../src/auth/authMiddleware.js");
  const controllerPath = path.resolve(
    __dirname,
    "../src/controllers/perfilController.js",
  );
  const perfilRoutePath = path.resolve(__dirname, "../src/routes/perfilRoute.js");
  const legacyRoutePath = path.resolve(
    __dirname,
    "../src/routes/authLegacyCompatRoute.js",
  );
  const originalLoad = Module._load;
  const dbFalso = criarDbFalso();

  for (const modulePath of [
    authPath,
    controllerPath,
    perfilRoutePath,
    legacyRoutePath,
  ]) {
    delete require.cache[modulePath];
  }

  Module._load = function carregarComDbFalso(request, parent, isMain) {
    if (
      request === "../db" &&
      [authPath, controllerPath].includes(parent?.filename)
    ) {
      return dbFalso;
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    return {
      legacyRoute: require(legacyRoutePath),
      perfilRoute: require(perfilRoutePath),
    };
  } finally {
    Module._load = originalLoad;
  }
}

async function iniciarApp() {
  const { legacyRoute, perfilRoute } = carregarRotasComDbFalso();
  const app = express();

  app.use("/api/auth", legacyRoute);
  app.use("/api/perfil", perfilRoute);
  app.use("/api/auth", (_req, res) =>
    res.status(404).json({ code: "API_ROTA_NAO_ENCONTRADA" }),
  );

  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  const { port } = server.address();

  return {
    url: `http://127.0.0.1:${port}`,
    stop: () => new Promise((resolve) => server.close(resolve)),
  };
}

function tokenValido() {
  return jwt.sign(
    { sub: String(USUARIO_TESTE.id), perfil: USUARIO_TESTE.perfil },
    JWT_SECRET_TESTE,
    { expiresIn: "5m" },
  );
}

async function requisitar(url, pathName, token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const response = await fetch(`${url}${pathName}`, { headers });

  return {
    response,
    body: await response.json(),
  };
}

const originalJwtSecret = process.env.JWT_SECRET;
const originalJwtIss = process.env.JWT_ISS;
const originalJwtAud = process.env.JWT_AUD;

test.before(() => {
  process.env.JWT_SECRET = JWT_SECRET_TESTE;
  delete process.env.JWT_ISS;
  delete process.env.JWT_AUD;
});

test.after(() => {
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalJwtSecret;

  if (originalJwtIss === undefined) delete process.env.JWT_ISS;
  else process.env.JWT_ISS = originalJwtIss;

  if (originalJwtAud === undefined) delete process.env.JWT_AUD;
  else process.env.JWT_AUD = originalJwtAud;
});

test("GET /api/auth/me exige Bearer válido e mantém o contrato legado", async () => {
  const app = await iniciarApp();

  try {
    const semToken = await requisitar(app.url, "/api/auth/me");
    assert.equal(semToken.response.status, 401);
    assert.equal(semToken.body.autenticado, false);

    const tokenNaQuery = await requisitar(
      app.url,
      `/api/auth/me?token=${encodeURIComponent(tokenValido())}`,
    );
    assert.equal(tokenNaQuery.response.status, 401);

    const tokenInvalido = await requisitar(
      app.url,
      "/api/auth/me",
      "token-invalido",
    );
    assert.equal(tokenInvalido.response.status, 401);
    assert.equal(tokenInvalido.body.autenticado, false);

    const valido = await requisitar(app.url, "/api/auth/me", tokenValido());
    assert.equal(valido.response.status, 200);
    assert.equal(valido.response.headers.get("cache-control"), "no-store");
    assert.equal(
      valido.response.headers.get("x-route-handler"),
      "authLegacyCompat:v1:GET /auth/me",
    );
    assert.deepEqual(valido.body, {
      autenticado: true,
      usuario: {
        id: USUARIO_TESTE.id,
        nome: USUARIO_TESTE.nome,
        email: USUARIO_TESTE.email,
        cpf: USUARIO_TESTE.cpf,
        perfil: USUARIO_TESTE.perfil,
      },
    });
    assert.equal("senha" in valido.body.usuario, false);
  } finally {
    await app.stop();
  }
});

test("/api/perfil/me mantém contrato oficial e outras rotas /auth continuam 404", async () => {
  const app = await iniciarApp();

  try {
    const perfilAtual = await requisitar(
      app.url,
      "/api/perfil/me",
      tokenValido(),
    );
    assert.equal(perfilAtual.response.status, 200);
    assert.equal(perfilAtual.body.ok, true);
    assert.equal(perfilAtual.body.data.id, USUARIO_TESTE.id);
    assert.equal(perfilAtual.body.data.senha, undefined);

    const inexistente = await requisitar(
      app.url,
      "/api/auth/rota-que-nao-existe",
    );
    assert.equal(inexistente.response.status, 404);
    assert.equal(inexistente.body.code, "API_ROTA_NAO_ENCONTRADA");
  } finally {
    await app.stop();
  }
});

test("o mount da compatibilidade ocorre antes do middleware global de 404", () => {
  const indexPath = path.resolve(__dirname, "../src/routes/index.js");
  const source = fs.readFileSync(indexPath, "utf8");

  assert.ok(source.indexOf('mount("/auth", authLegacyCompatRoute') >= 0);
  assert.ok(
    source.indexOf('mount("/auth", authLegacyCompatRoute') <
      source.indexOf("router.use(apiNotFound)"),
  );
});
