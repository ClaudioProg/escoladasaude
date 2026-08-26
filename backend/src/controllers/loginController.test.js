"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const { sessionCookieName, sessionCookieOptions, SESSION_COOKIE_PERSISTENT_MS } = require("../auth/authSessionMiddleware");

const LOGIN_CONTROLLER_PATH = require.resolve("./loginController");
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

function loadLoginController({ compare = async () => true, createSession, generateJwt = () => "legacy.jwt", notify = async () => {} } = {}) {
  delete require.cache[LOGIN_CONTROLLER_PATH];
  const originalLoad = Module._load;
  Module._load = function mockLoginDependencies(request, parent, isMain) {
    if (parent?.filename === LOGIN_CONTROLLER_PATH) {
      if (request === "bcrypt") return { compare };
      if (request === "../db") return { query() {} };
      if (request === "../auth/generateToken") return generateJwt;
      if (request === "./notificacaoController") return { gerarNotificacaoDeAvaliacao: notify };
      if (request === "../services/authSessionService") return { createAuthSessionService: () => ({ createSession }) };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    return require("./loginController");
  } finally {
    Module._load = originalLoad;
  }
}

function response() {
  const out = { statusCode: null, body: null, cookies: [], headers: {} };
  out.set = (name, value) => { out.headers[name] = value; return out; };
  out.status = (code) => { out.statusCode = code; return out; };
  out.json = (body) => { out.body = body; return out; };
  out.cookie = (name, value, options) => { out.cookies.push({ name, value, options }); return out; };
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
  const opaqueToken = "opaque-session-token";
  const { loginUsuario } = loadLoginController({
    createSession: async (args) => { sessionArgs = args; return { token: opaqueToken, session: { id: "s1" } }; },
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
  assert.deepEqual(res.cookies, [{
    name: "escola_saude_session",
    value: opaqueToken,
    options: { httpOnly: true, secure: false, sameSite: "lax", path: "/" },
  }]);
});

test("manter_conectado aceita apenas boolean true e controla Max-Age", async () => {
  for (const [value, expected] of [[true, true], [false, false], [undefined, false], ["false", false]]) {
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
    compare: async () => false,
    createSession: async () => { calls += 1; return { token: "opaque" }; },
  });
  const res = response();
  await loginUsuario(request(), res, assert.fail);
  assert.equal(calls, 0);
  assert.equal(res.cookies.length, 0);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.message, "Usuário ou senha inválidos.");
});

test("falha operacional ao criar sessao nao emite cookie ou JWT e preserva o erro", async () => {
  const original = new Error("session backend unavailable");
  let generated = false;
  const { loginUsuario } = loadLoginController({
    createSession: async () => { throw original; },
    generateJwt: () => { generated = true; return "legacy.jwt"; },
  });
  const res = response();
  let nextError;
  await loginUsuario(request(), res, (error) => { nextError = error; });
  assert.equal(nextError, original);
  assert.equal(generated, false);
  assert.equal(res.statusCode, null);
  assert.equal(res.body, null);
  assert.equal(res.cookies.length, 0);
});
