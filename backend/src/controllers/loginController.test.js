"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const { performance } = require("node:perf_hooks");
const { PasswordServiceError } = require("../services/passwordStructure");
const { sessionCookieName, sessionCookieOptions, SESSION_COOKIE_PERSISTENT_MS } = require("../auth/authSessionMiddleware");

const LOGIN_CONTROLLER_PATH = require.resolve("./loginController");
const UNAUTHENTICATED_PASSWORD_RESULT = Object.freeze({
  authenticated: false,
  algorithm: null,
  needsRehash: false,
  canUpgrade: false,
  requiresPasswordChange: false,
});
const USER = {
  id: 7,
  nome: "Usuária de teste",
  email: "teste@example.test",
  cpf: "12345678901",
  perfil: "usuario",
  senha: "hash",
  deleted_at: null,
  imagem_base64: null,
};

function loadLoginController({ verifyPassword = async () => ({ authenticated: true, algorithm: "bcrypt", canUpgrade: true, needsRehash: false, requiresPasswordChange: false }), createSession, revokeSession = async () => {}, generateJwt = () => "legacy.jwt", notify = async () => {}, passwordWriters = {}, clock = performance } = {}) {
  delete require.cache[LOGIN_CONTROLLER_PATH];
  const originalLoad = Module._load;
  Module._load = function mockLoginDependencies(request, parent, isMain) {
    if (parent?.filename === LOGIN_CONTROLLER_PATH) {
      if (request === "node:perf_hooks") return { performance: clock };
      if (request === "../services/passwordService") return { verifyPassword, PasswordServiceError, ...passwordWriters };
      if (request === "../db") return { query() {} };
      if (request === "../auth/generateToken") return generateJwt;
      if (request === "./notificacaoController") return { gerarNotificacaoDeAvaliacao: notify };
      if (request === "../services/authSessionService") return { createAuthSessionService: () => ({ createSession, revokeSession }) };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    return require("./loginController");
  } finally {
    Module._load = originalLoad;
  }
}

function response({ cookieError = null, jsonError = null } = {}) {
  const out = { statusCode: null, body: null, cookies: [], headers: {} };
  out.set = (name, value) => { out.headers[name] = value; return out; };
  out.status = (code) => { out.statusCode = code; return out; };
  out.json = (body) => { if (jsonError) throw jsonError; out.body = body; return out; };
  out.cookie = (name, value, options) => { if (cookieError) throw cookieError; out.cookies.push({ name, value, options }); return out; };
  return out;
}

function request(body = {}) {
  return {
    body: { cpf: USER.cpf, senha: "senha-valida", ...body },
    headers: { "user-agent": "browser raw/1.0" },
    get(name) { return this.headers[name]; },
    ip: "203.0.113.7",
    db: { query: async () => ({ rows: [{ ...USER }] }) },
  };
}

test("login local cria sessao, preserva JWT e nunca expoe ou registra token opaco", async () => {
  let sessionArgs;
  let revocations = 0;
  const opaqueToken = "opaque-session-token";
  const { loginUsuario } = loadLoginController({
    createSession: async (args) => { sessionArgs = args; return { token: opaqueToken, session: { id: "s1" } }; },
    revokeSession: async () => { revocations += 1; },
  });
  const res = response();
  const logged = [];
  const originalLog = console.log;
  console.log = (...args) => logged.push(args.join(" "));
  try {
    await loginUsuario(request(), res, assert.fail);
  } finally {
    console.log = originalLog;
  }

  assert.deepEqual(sessionArgs, {
    usuarioId: 7,
    manterConectado: false,
    userAgent: "browser raw/1.0",
    ip: "203.0.113.7",
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.token, "legacy.jwt");
  assert.deepEqual(Object.keys(res.body).sort(), ["code", "message", "ok", "token", "usuario"]);
  assert.equal(JSON.stringify(res.body).includes(opaqueToken), false);
  assert.equal(logged.join(" ").includes(opaqueToken), false);
  assert.equal(revocations, 0);
  assert.deepEqual(res.cookies, [{
    name: "escola_saude_session",
    value: opaqueToken,
    options: { httpOnly: true, secure: false, sameSite: "lax", path: "/" },
  }]);
});

test("manter_conectado aceita apenas boolean true e controla Max-Age", async () => {
  for (const [value, expected] of [[true, true], [false, false], [undefined, false], ["true", false], ["false", false], [1, false], [0, false], [null, false], [{}, false], [[], false]]) {
    let sessionArgs;
    const { loginUsuario } = loadLoginController({
      createSession: async (args) => { sessionArgs = args; return { token: "opaque", session: { id: "s1" } }; },
    });
    const res = response();
    await loginUsuario(request(value === undefined ? {} : { manter_conectado: value }), res, assert.fail);
    assert.equal(sessionArgs.manterConectado, expected);
    assert.equal(res.cookies[0].options.maxAge, expected ? SESSION_COOKIE_PERSISTENT_MS : undefined);
    assert.equal(res.cookies[0].options.expires, undefined);
  }
});

test("contrato central do cookie diferencia producao e desenvolvimento", () => {
  assert.equal(sessionCookieName(true), "__Host-escola_saude_session");
  assert.deepEqual(sessionCookieOptions(true, false), {
    httpOnly: true, secure: true, sameSite: "lax", path: "/",
  });
  assert.deepEqual(sessionCookieOptions(true, true), {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 30 * 24 * 60 * 60 * 1000,
  });
  assert.equal(sessionCookieName(false), "escola_saude_session");
  assert.deepEqual(sessionCookieOptions(false, false), {
    httpOnly: true, secure: false, sameSite: "lax", path: "/",
  });
});

test("credenciais invalidas nao criam sessao ou cookie e preservam resposta publica", async () => {
  let calls = 0;
  const { loginUsuario } = loadLoginController({
    verifyPassword: async () => UNAUTHENTICATED_PASSWORD_RESULT,
    createSession: async () => { calls += 1; return { token: "opaque" }; },
  });
  const res = response();
  await loginUsuario(request(), res, assert.fail);
  assert.equal(calls, 0);
  assert.equal(res.cookies.length, 0);
  assert.equal(res.statusCode, 401);
  assertInvalidCredentials(res);
});

test("falha operacional ao criar sessao nao emite cookie ou JWT e preserva o erro", async () => {
  const original = new Error("session backend unavailable");
  let revocations = 0;
  const { loginUsuario } = loadLoginController({
    createSession: async () => { throw original; },
    revokeSession: async () => { revocations += 1; },
  });
  const res = response();
  let nextError;
  await loginUsuario(request(), res, (error) => { nextError = error; });
  assert.equal(nextError, original);
  assert.equal(revocations, 0);
  assert.equal(res.statusCode, null);
  assert.equal(res.body, null);
  assert.equal(res.cookies.length, 0);
});

test("falha de JWT ocorre antes de createSession sem cookie ou revogacao", async () => {
  const original = new Error("jwt generation failed");
  let creations = 0;
  let revocations = 0;
  const { loginUsuario } = loadLoginController({
    createSession: async () => { creations += 1; return { token: "opaque", session: { id: "s1" } }; },
    revokeSession: async () => { revocations += 1; },
    generateJwt: () => { throw original; },
  });
  const res = response();
  let nextError;
  await loginUsuario(request(), res, (error) => { nextError = error; });
  assert.equal(nextError, original);
  assert.equal(creations, 0);
  assert.equal(revocations, 0);
  assert.equal(res.cookies.length, 0);
  assert.equal(res.body, null);
});

test("falhas de cookie ou resposta revogam a sessao e preservam o erro principal", async () => {
  for (const [phase, options] of [["cookie", { cookieError: new Error("cookie failed") }], ["json", { jsonError: new Error("json failed") }]]) {
    const original = phase === "cookie" ? options.cookieError : options.jsonError;
    const revocations = [];
    const { loginUsuario } = loadLoginController({
      createSession: async () => ({ token: "opaque", session: { id: "session-7" } }),
      revokeSession: async (...args) => { revocations.push(args); },
    });
    const res = response(options);
    let nextError;
    await loginUsuario(request(), res, (error) => { nextError = error; });
    assert.equal(nextError, original);
    assert.deepEqual(revocations, [[7, "session-7", "login_response_failure"]]);
  }
});

test("falha da revogacao compensatoria nao mascara erro ou registra segredo", async () => {
  const original = new Error("response failed");
  const revokeFailure = Object.assign(new Error("opaque-revoke-secret"), { code: "DB_FAILURE" });
  const { loginUsuario } = loadLoginController({
    createSession: async () => ({ token: "opaque-session-token", session: { id: "session-7" } }),
    revokeSession: async () => { throw revokeFailure; },
  });
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(args.join(" "));
  try {
    const res = response({ cookieError: original });
    let nextError;
    await loginUsuario(request(), res, (error) => { nextError = error; });
    assert.equal(nextError, original);
  } finally {
    console.error = originalError;
  }
  assert.equal(errors.join(" ").includes("opaque-session-token"), false);
  assert.equal(errors.join(" ").includes("opaque-revoke-secret"), false);
});

const INVALID_CREDENTIALS = {
  ok: false,
  code: "AUTH-401-CREDENCIAIS-INVALIDAS",
  message: "CPF ou senha inválidos. Verifique os dados informados e tente novamente.",
  erro: "CPF ou senha inválidos. Verifique os dados informados e tente novamente.",
};
const INTERNAL_ERROR = {
  ok: false,
  code: "AUTH-500-LOGIN",
  message: "Erro interno no servidor.",
  erro: "Erro interno no servidor.",
};

function assertInvalidCredentials(res) {
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, INVALID_CREDENTIALS);
  assert.deepEqual(res.cookies, []);
}

function loginFixture(t, { user = USER, result = {}, verificationError = null, verificationDelay = 0, clock } = {}) {
  const verified = { authenticated: true, algorithm: "bcrypt", needsRehash: false, canUpgrade: true, requiresPasswordChange: false, ...result };
  const calls = {
    verify: t.mock.fn(async () => {
      if (verificationDelay) await new Promise((resolve) => setTimeout(resolve, verificationDelay));
      if (verificationError) throw verificationError;
      return verified;
    }),
    createSession: t.mock.fn(async () => ({ token: "opaque-session-token", session: { id: "s1" } })),
    generateJwt: t.mock.fn(() => "legacy.jwt"),
    notify: t.mock.fn(async () => {}),
    upgrade: t.mock.fn(assert.fail),
    hash: t.mock.fn(assert.fail),
    query: t.mock.fn(async (sql) => {
      assert.match(sql, /^\s*SELECT\b/i, "Login não pode escrever senha, histórico ou versão.");
      return { rows: user ? [{ ...user }] : [] };
    }),
  };
  const { loginUsuario } = loadLoginController({
    verifyPassword: calls.verify,
    createSession: calls.createSession,
    generateJwt: calls.generateJwt,
    notify: calls.notify,
    passwordWriters: { upgradeLegacyPasswordHash: calls.upgrade, createNewPasswordHash: calls.hash },
    clock,
  });
  const req = request();
  req.db.query = calls.query;
  return { loginUsuario, req, res: response(), calls };
}

function assertNoPasswordWriter(calls) {
  assert.equal(calls.upgrade.mock.callCount(), 0);
  assert.equal(calls.hash.mock.callCount(), 0);
  assert.equal(calls.query.mock.callCount(), 1);
}

function assertNoAccess(calls, res) {
  for (const method of [calls.generateJwt, calls.createSession, calls.notify]) assert.equal(method.mock.callCount(), 0);
  assert.deepEqual(res.cookies, []);
  assert.equal(Object.hasOwn(res.body, "token"), false);
  assert.equal(Object.hasOwn(res.body, "usuario"), false);
  assertNoPasswordWriter(calls);
}

for (const [label, result] of [
  ["bcrypt elegível para upgrade", { algorithm: "bcrypt", canUpgrade: true }],
  ["Argon2id", { algorithm: "argon2id", canUpgrade: false }],
  ["Argon2id com needsRehash", { algorithm: "argon2id", canUpgrade: false, needsRehash: true }],
]) {
  test(`${label}: login normal preserva JWT/perfil/sessão/cookie sem writer`, async (t) => {
    const { loginUsuario, req, res, calls } = loginFixture(t, { result });
    await loginUsuario(req, res, assert.fail);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, {
      ok: true, code: "AUTH-200-LOGIN", message: "Login realizado com sucesso.", token: "legacy.jwt",
      usuario: { id: 7, nome: USER.nome, email: USER.email, cpf: USER.cpf, perfil: "usuario", imagem_base64: null },
    });
    assert.deepEqual(calls.verify.mock.calls[0].arguments, [req.body.senha, USER.senha]);
    assert.deepEqual(calls.generateJwt.mock.calls[0].arguments, [{ id: 7, perfil: "usuario" }, "1d"]);
    assert.deepEqual(calls.createSession.mock.calls[0].arguments, [{ usuarioId: 7, manterConectado: false, userAgent: "browser raw/1.0", ip: "203.0.113.7" }]);
    assert.deepEqual(calls.notify.mock.calls[0].arguments, [7]);
    assert.deepEqual(res.cookies, [{ name: "escola_saude_session", value: "opaque-session-token", options: sessionCookieOptions(false, false) }]);
    assert.match(res.headers["Cache-Control"], /no-store/);
    assertNoPasswordWriter(calls);
  });
}

for (const algorithm of ["bcrypt", "argon2id"]) {
  test(`${algorithm} incorreto: 401 canônico sem acesso`, async (t) => {
    const { loginUsuario, req, res, calls } = loginFixture(t, { result: UNAUTHENTICATED_PASSWORD_RESULT });
    await loginUsuario(req, res, assert.fail);
    assertInvalidCredentials(res);
    assertNoAccess(calls, res);
  });
}

test("requiresPasswordChange é autoridade para 403 exato sem JWT/sessão/cookie/notificação", async (t) => {
  const { loginUsuario, req, res, calls } = loginFixture(t, { result: { canUpgrade: false, requiresPasswordChange: true } });
  await loginUsuario(req, res, assert.fail);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, {
    ok: false, code: "AUTH-403-TROCA-SENHA-OBRIGATORIA",
    message: "Por segurança, é necessário atualizar sua senha antes de continuar.",
    erro: "Por segurança, é necessário atualizar sua senha antes de continuar.",
    trocaSenhaObrigatoria: true,
  });
  assertNoAccess(calls, res);
});

test("Unicode malformado: 401 canônico antes do verificador para conta ativa", async (t) => {
  for (const senha of ["legado\ud800", "legado\udc00", "legado\ud800x"]) {
    const { loginUsuario, req, res, calls } = loginFixture(t);
    req.body.senha = senha;
    await loginUsuario(req, res, assert.fail);
    assertInvalidCredentials(res);
    assert.equal(calls.verify.mock.callCount(), 0);
    assertNoAccess(calls, res);
  }
});

test("PASSWORD_INVALID_UNICODE defensivo: 401 canônico sem next", async (t) => {
  const { loginUsuario, req, res, calls } = loginFixture(t, { verificationError: new PasswordServiceError("PASSWORD_INVALID_UNICODE", "detalhe privado") });
  await loginUsuario(req, res, assert.fail);
  assertInvalidCredentials(res);
  assertNoAccess(calls, res);
});

for (const [code, diagnostic] of [
  ["PASSWORD_INVALID_STORED_HASH", "stored_hash_invalid"],
  ["PASSWORD_CRYPTO_OPERATION_FAILED", "crypto_operation_failed"],
]) {
  test(`${code}: 500 público genérico e diagnóstico fixo sem next`, async (t) => {
    const error = new PasswordServiceError(code, "segredo-criptografico senha hash");
    error.stack = "stack-privada";
    const logs = [];
    t.mock.method(console, "error", (...args) => logs.push(args));
    const storedHash = "stored-credential-sensitive-sentinel";
    const { loginUsuario, req, res, calls } = loginFixture(t, { user: { ...USER, senha: storedHash }, verificationError: error });
    await loginUsuario(req, res, assert.fail);
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, INTERNAL_ERROR);
    assert.equal(logs.length, 1);
    assert.deepEqual(logs[0][1], { code: "AUTH_LOGIN_FAILURE", diagnostic });
    for (const secret of [code, error.message, error.stack, req.body.senha, storedHash]) assert.equal(JSON.stringify(logs).includes(secret), false);
    assertNoAccess(calls, res);
  });
}

for (const [label, user] of [["usuário inexistente", null], ["hash ausente", { ...USER, senha: null }]]) {
  test(`${label}: dummy fixo via verifyPassword e 401 canônico`, async (t) => {
    const { loginUsuario, req, res, calls } = loginFixture(t, { user });
    await loginUsuario(req, res, assert.fail);
    assertInvalidCredentials(res);
    assert.equal(calls.verify.mock.callCount(), 1);
    const args = calls.verify.mock.calls[0].arguments;
    assert.equal(args[0], req.body.senha);
    assert.equal(args[1], "$2b$10$CwTycUXWue0Thq9StjUM0uJ8N9YqvYQx8rU0lE8r1W3sQ8v7r8E2S");
    assertNoAccess(calls, res);
  });
}

test("falha operacional do dummy mantém 401 canônico sem vazar detalhes", async (t) => {
  const { loginUsuario, req, res, calls } = loginFixture(t, { user: null, verificationError: new PasswordServiceError("PASSWORD_CRYPTO_OPERATION_FAILED", "segredo dummy") });
  await loginUsuario(req, res, assert.fail);
  assertInvalidCredentials(res);
  assertNoAccess(calls, res);
});

test("conta excluída preserva 403 legado inclusive com Unicode malformado", async (t) => {
  const { loginUsuario, req, res, calls } = loginFixture(t, { user: { ...USER, deleted_at: "2026-10-08" } });
  req.body.senha = "legado\ud800";
  await loginUsuario(req, res, assert.fail);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, {
    ok: false, code: "AUTH-403-CONTA-EXCLUIDA",
    message: "Esta conta foi excluída e não pode mais ser acessada. Para utilizar a plataforma novamente, faça um novo cadastro.",
    erro: "Esta conta foi excluída e não pode mais ser acessada. Para utilizar a plataforma novamente, faça um novo cadastro.",
    contaExcluida: true,
  });
  assert.equal(calls.verify.mock.callCount(), 0);
  assertNoAccess(calls, res);
});

test("perfil inválido preserva 403 legado antes de troca obrigatória", async (t) => {
  const { loginUsuario, req, res, calls } = loginFixture(t, { user: { ...USER, perfil: "gestor" }, result: { requiresPasswordChange: true } });
  await loginUsuario(req, res, assert.fail);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { ok: false, code: "AUTH-403-PERFIL-INVALIDO", message: "Usuário sem perfil de acesso válido.", erro: "Usuário sem perfil de acesso válido." });
  assertNoAccess(calls, res);
});

test("validação 422 de campos permanece antes de busca/verificação", async (t) => {
  for (const [body, fieldErrors] of [
    [{ cpf: "", senha: "" }, { cpf: "CPF é obrigatório.", senha: "Senha é obrigatória." }],
    [{ cpf: "123" }, { cpf: "CPF inválido." }],
  ]) {
    const { loginUsuario, req, res, calls } = loginFixture(t);
    Object.assign(req.body, body);
    await loginUsuario(req, res, assert.fail);
    assert.equal(res.statusCode, 422);
    assert.deepEqual(res.body, { ok: false, code: "AUTH-422-LOGIN-VALIDACAO", message: "Erro de validação no login.", erro: "Erro de validação no login.", fieldErrors });
    for (const method of Object.values(calls)) assert.equal(method.mock.callCount(), 0);
    assert.deepEqual(res.cookies, []);
  }
});

test("erro não relacionado ao passwordService preserva next e identidade", async (t) => {
  const original = new Error("falha externa");
  const { loginUsuario, req, res, calls } = loginFixture(t, { verificationError: original });
  let forwarded;
  await loginUsuario(req, res, (error) => { forwarded = error; });
  assert.equal(forwarded, original);
  assert.equal(res.body, null);
  assert.equal(calls.createSession.mock.callCount(), 0);
});

for (const [label, options] of [
  ["inexistente/dummy rápido", { user: null }],
  ["senha incorreta com custo", { result: UNAUTHENTICATED_PASSWORD_RESULT, verificationDelay: 40 }],
]) {
  test(`piso total de 250 ms: ${label}`, async (t) => {
    const { loginUsuario, req, res } = loginFixture(t, options);
    const startedAt = performance.now();
    await loginUsuario(req, res, assert.fail);
    const elapsed = performance.now() - startedAt;
    assertInvalidCredentials(res);
    assert.ok(elapsed >= 248, `401 em ${elapsed.toFixed(1)} ms; esperado piso aproximado de 250 ms.`);
    t.diagnostic(`Duração total: ${elapsed.toFixed(1)} ms (limite inferior 248 ms, sem upper bound).`);
  });
}

test("piso desconta processamento e não aguarda quando custo já supera 250 ms", async (t) => {
  for (const elapsed of [210, 300]) {
    let now = 0;
    const waits = [];
    const clock = { now: () => now };
    const { loginUsuario, req, res, calls } = loginFixture(t, { clock });
    calls.verify.mock.mockImplementation(async () => { now = elapsed; return UNAUTHENTICATED_PASSWORD_RESULT; });
    const timerMock = t.mock.method(global, "setTimeout", (resolve, ms) => {
      waits.push(ms);
      now += ms;
      resolve();
    });
    try {
      await loginUsuario(req, res, assert.fail);
    } finally {
      timerMock.mock.restore();
    }
    assertInvalidCredentials(res);
    assert.deepEqual(waits, elapsed < 250 ? [250 - elapsed] : []);
  }
});
