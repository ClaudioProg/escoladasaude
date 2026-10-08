"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const jwt = require("jsonwebtoken");
const { inspect } = require("node:util");

const SECRET = "ficticio-middleware-etapa06-nao-producao";
const ENV = { NODE_ENV: "test", JWT_SECRET: SECRET, JWT_ISSUER: "issuer-local",
  JWT_AUDIENCE: "audience-local", AUTH_VERSION_MODE: "bridge" };
const RID = "request-local";

function sign(fields = { auth_version: 1 }, options = {}, secret = SECRET) {
  return jwt.sign({ sub: "7", perfil: "usuario", ...fields }, secret,
    { expiresIn: "1d", issuer: ENV.JWT_ISSUER, audience: ENV.JWT_AUDIENCE, ...options });
}

function fixture(t, { env = {}, row = { id: 7, perfil: "usuario", deleted_at: null, auth_version: 1 },
  decoded, queryError } = {}) {
  const testEnv = { ...ENV, ...env };
  const logs = [];
  const query = t.mock.fn(async () => {
    if (queryError) throw queryError;
    return { rows: row ? [row] : [] };
  });
  // O helper e o middleware recebem a mesma env ficticia, sem alterar globals.
  const versionModule = { exports: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve("./authVersion"), "utf8"),
    { module: versionModule, exports: versionModule.exports, process: { env: testEnv } });
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve("./authMiddleware"), "utf8"), {
    module, exports: module.exports, process: { env: testEnv },
    console: Object.fromEntries(["log", "warn", "error"].map(level => [level, (...args) => logs.push(args)])),
    require(name) {
      if (name === "jsonwebtoken") return decoded === undefined ? jwt : { verify: () => decoded };
      if (name === "./authVersion") return versionModule.exports;
      if (name === "../db") return { query };
      throw new Error("Dependencia nao autorizada no teste");
    },
  });
  async function authenticate(token = sign(), { admin = false, authorization } = {}) {
    const req = { headers: { authorization: authorization === undefined ? "Bearer " + token : authorization } };
    const res = { locals: {}, statusCode: 200, getHeader: () => RID,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; } };
    let nextCalls = 0;
    const result = admin
      ? await module.exports.authAdmin(req, res, () => { nextCalls += 1; })
      : await module.exports.authenticateRequest(req, res);
    return { result, req, res, nextCalls };
  }
  return { authenticate, query, logs, row, middleware: module.exports };
}

function assertIdentity(output, perfil = "usuario") {
  assert.equal(output.result.ok, true);
  assert.equal(JSON.stringify(output.req.user), JSON.stringify({ id: 7, perfil }));
  assert.equal(output.req.userId, 7);
  assert.equal(output.req.perfil, perfil);
  assert.equal(output.res.locals.user, output.req.user);
  assert.equal(Object.hasOwn(output.req.user, "auth_version"), false);
}

function assertFailure(output, status, code, erro, extra = {}) {
  assert.equal(output.result.ok, false);
  assert.equal(output.res.statusCode, status);
  assert.deepEqual(JSON.parse(JSON.stringify(output.res.body)),
    { ok: false, erro, autenticado: false, requestId: RID, code, ...extra });
  for (const key of ["user", "userId", "perfil"]) assert.equal(Object.hasOwn(output.req, key), false);
  assert.equal(Object.hasOwn(output.res.locals, "user"), false);
}

function assertReason(f, reason) {
  assert.ok(f.logs.some(args => args[1]?.reason === reason));
}

for (const [mode, claim, dbVersion, accepted] of [
  ["bridge", 1, 1, true], ["bridge", 2, 2, true], ["bridge", 1, 2, false],
  ["bridge", 2, 1, false], ["bridge", undefined, 1, true], ["bridge", undefined, 2, false],
  ["strict", 1, 1, true], ["strict", 2, 2, true], ["strict", undefined, 1, false],
  ["strict", undefined, 2, false],
  ["strict", 1, 2, false],
  ["strict", 2, 1, false],
]) {
  test(`${mode}: claim ${claim === undefined ? "ausente" : claim} / DB ${dbVersion}`, async (t) => {
    const f = fixture(t, { env: { AUTH_VERSION_MODE: mode },
      row: { id: 7, perfil: "usuario", deleted_at: null, auth_version: dbVersion } });
    const output = await f.authenticate(sign(claim === undefined ? {} : { auth_version: claim }));
    if (accepted) {
      assertIdentity(output);
      assert.equal(Object.hasOwn(output.result.decoded, "auth_version"), claim !== undefined);
    } else {
      assertFailure(output, 401, "AUTH-401-SESSAO-INVALIDA", "Sessão inválida.", { sessionExpired: true });
      assertReason(f, mode === "strict" && claim === undefined ? "invalid_version_claim" : "version_mismatch");
      if (mode === "strict" && claim !== undefined) {
        for (const sentinel of ["auth_version", String(claim), String(dbVersion)]) {
          assert.equal(inspect(f.logs).includes(sentinel), false);
        }
      }
    }
    const expectedQueries = mode === "strict" && claim === undefined ? 0 : 1;
    assert.equal(f.query.mock.callCount(), expectedQueries);
    if (expectedQueries) {
      assert.match(f.query.mock.calls[0].arguments[0], /^\s*SELECT[\s\S]*\bauth_version\b/i);
      assert.equal(JSON.stringify(f.query.mock.calls[0].arguments[1]), "[7]");
    }
  });
}

const INVALID = [
  ["null", null], ["string", "1"], ["zero", 0], ["negativo", -1], ["decimal", 1.5],
  ["array", []], ["objeto", {}], ["boolean", true], ["acima INT4", 2147483648],
  ["nao safe", Number.MAX_SAFE_INTEGER + 1],
];
for (const mode of ["bridge", "strict"]) {
  for (const [label, version] of INVALID) {
    test(`${mode}: claim ${label} rejeitado antes da query`, async (t) => {
      const f = fixture(t, { env: { AUTH_VERSION_MODE: mode } });
      const output = await f.authenticate(sign({ auth_version: version }));
      assertFailure(output, 401, "AUTH-401-SESSAO-INVALIDA", "Sessão inválida.", { sessionExpired: true });
      assert.equal(f.query.mock.callCount(), 0);
      assertReason(f, "invalid_version_claim");
    });
  }
}

test("undefined explicito no objeto verificado nao equivale a legado", async (t) => {
  const f = fixture(t, { decoded: { sub: "7", perfil: "usuario", auth_version: undefined } });
  assertFailure(await f.authenticate(), 401, "AUTH-401-SESSAO-INVALIDA", "Sessão inválida.", { sessionExpired: true });
  assert.equal(f.query.mock.callCount(), 0);
  assertReason(f, "invalid_version_claim");
});

for (const [label, version] of [["ausente", undefined], ...INVALID, ["NaN", NaN], ["Infinity", Infinity]]) {
  test(`DB ${label} e falha operacional, sem identidade`, async (t) => {
    const f = fixture(t, { row: { id: 7, perfil: "usuario", deleted_at: null, auth_version: version } });
    assertFailure(await f.authenticate(), 500, "AUTH-500-FALHA-VALIDACAO-SESSAO", "Falha ao validar sessão.");
    assert.equal(f.query.mock.callCount(), 1);
    assertReason(f, "invalid_db_auth_version");
  });
}

for (const nodeEnv of ["development", "test", "production"]) {
  for (const [label, mode] of [["ausente", undefined], ["invalido", "secret-config"], ["espacos", " bridge"]]) {
    test(`config ${label} em ${nodeEnv} falha fechado depois de jwt.verify`, async (t) => {
      const f = fixture(t, { env: { NODE_ENV: nodeEnv, AUTH_VERSION_MODE: mode } });
      assertFailure(await f.authenticate(), 500, "AUTH-500-FALHA-VALIDACAO-SESSAO", "Falha ao validar sessão.");
      assert.equal(f.query.mock.callCount(), 0);
      assertReason(f, "invalid_auth_version_mode");
      assert.equal(inspect(f.logs).includes("secret-config"), false);
    });
  }
}

test("Bearer ausente continua 401 antes de qualquer config ou query", async (t) => {
  const f = fixture(t, { env: { AUTH_VERSION_MODE: undefined } });
  assertFailure(await f.authenticate(undefined, { authorization: "" }), 401, "AUTH-401-NAO-AUTENTICADO",
    "Não autenticado.", { sessionExpired: false });
  assert.equal(f.query.mock.callCount(), 0);
});

for (const [label, token, code, erro] of [
  ["expirado", () => sign({}, { expiresIn: -1 }), "AUTH-401-TOKEN-EXPIRADO", "Token expirado."],
  ["assinatura", () => sign({}, {}, SECRET + "-wrong"), "AUTH-401-TOKEN-INVALIDO", "Token inválido."],
  ["issuer", () => sign({}, { issuer: "wrong" }), "AUTH-401-TOKEN-INVALIDO", "Token inválido."],
  ["audience", () => sign({}, { audience: "wrong" }), "AUTH-401-TOKEN-INVALIDO", "Token inválido."],
  ["notBefore", () => sign({}, { notBefore: "1h" }), "AUTH-401-TOKEN-INVALIDO", "Token inválido."],
]) {
  test(`${label} mantem contrato criptografico e precede configuracao ausente`, async (t) => {
    const f = fixture(t, { env: { AUTH_VERSION_MODE: undefined } });
    assertFailure(await f.authenticate(token()), 401, code, erro, { sessionExpired: true });
    assert.equal(f.query.mock.callCount(), 0);
  });
}

for (const [label, fields] of [["sub", { sub: "invalid" }], ["perfil", { perfil: "gestor" }]]) {
  test(`payload com ${label} invalido continua bloqueado`, async (t) => {
    const f = fixture(t);
    assertFailure(await f.authenticate(sign({ auth_version: 1, ...fields })), 401,
      "AUTH-401-SESSAO-INVALIDA", "Sessão inválida.", { sessionExpired: true });
    assert.equal(f.query.mock.callCount(), 0);
  });
}

for (const [label, row, code, erro, deleted] of [
  ["inexistente", null, "AUTH-401-USUARIO-INDISPONIVEL", "Sessão inválida.", false],
  ["deleted", { id: 7, perfil: "usuario", deleted_at: "2026-10-08", auth_version: null },
    "AUTH-401-CONTA-EXCLUIDA", "Conta excluída. Faça um novo cadastro para utilizar a plataforma.", true],
  ["perfil invalido", { id: 7, perfil: "gestor", deleted_at: null, auth_version: null },
    "AUTH-401-USUARIO-INDISPONIVEL", "Sessão inválida.", false],
]) {
  test(`${label} continua bloqueado antes da validacao da versao DB`, async (t) => {
    const f = fixture(t, { row });
    assertFailure(await f.authenticate(), 401, code, erro, { sessionExpired: true, contaExcluida: deleted });
    assert.equal(f.query.mock.callCount(), 1);
  });
}

test("perfil atual do banco e autoridade e identidade legada permanece", async (t) => {
  const f = fixture(t, { row: { id: 7, perfil: "organizador", deleted_at: null, auth_version: 1 } });
  assertIdentity(await f.authenticate(), "organizador");
  assert.equal(f.query.mock.callCount(), 1);
});

test("authAdmin usa mesma comparacao e perfil atual do banco", async (t) => {
  const row = { id: 7, perfil: "administrador", deleted_at: null, auth_version: 1 };
  const f = fixture(t, { row });
  const accepted = await f.authenticate(undefined, { admin: true });
  assert.equal(accepted.nextCalls, 1);
  assert.equal(accepted.req.perfil, "administrador");
  row.auth_version = 2;
  const denied = await f.authenticate(undefined, { admin: true });
  assert.equal(denied.res.statusCode, 401);
  assert.equal(denied.res.body.code, "AUTH-401-SESSAO-INVALIDA");
  assert.equal(denied.nextCalls, 0);
  assert.equal(Object.hasOwn(denied.req, "user"), false);
});

test("cada request consulta versao atual, sem cache ou round trip extra", async (t) => {
  const f = fixture(t);
  const token = sign();
  assertIdentity(await f.authenticate(token));
  f.row.auth_version = 2;
  assertFailure(await f.authenticate(token), 401, "AUTH-401-SESSAO-INVALIDA", "Sessão inválida.", { sessionExpired: true });
  assert.equal(f.query.mock.callCount(), 2);
});

test("erro operacional original e secret ausente continuam 500 generico", async (t) => {
  const failure = fixture(t, { queryError: new Error("private@example.invalid raw-stack") });
  assertFailure(await failure.authenticate(), 500, "AUTH-500-FALHA-VALIDACAO-SESSAO", "Falha ao validar sessão.");
  assert.equal(inspect(failure.logs).includes("private@example.invalid"), false);
  const missing = fixture(t, { env: { JWT_SECRET: undefined } });
  assertFailure(await missing.authenticate(), 500, "AUTH-500-JWT-SECRET-AUSENTE", "Falha de configuração de autenticação.");
  assert.equal(missing.query.mock.callCount(), 0);
});

test("logs de mismatch nao incluem token, payload ou numeros de versao", async (t) => {
  const f = fixture(t, { row: { id: 7, perfil: "usuario", deleted_at: null, auth_version: 2000000002 } });
  const token = sign({ auth_version: 2000000001, email: "private@example.invalid", senha: "password-private" });
  const output = await f.authenticate(token);
  assertFailure(output, 401, "AUTH-401-SESSAO-INVALIDA", "Sessão inválida.", { sessionExpired: true });
  assertReason(f, "version_mismatch");
  for (const sentinel of [token, "Bearer", "2000000001", "2000000002", "private@example.invalid", "password-private"]) {
    assert.equal(inspect(f.logs).includes(sentinel), false);
  }
});
