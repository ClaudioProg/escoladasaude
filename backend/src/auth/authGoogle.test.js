"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { inspect } = require("node:util");
const authVersion = require("./authVersion");
const jwt = require("jsonwebtoken");

const USER = { id: 7, nome: "Usuario local", email: "synthetic@example.invalid", cpf: "12345678909",
  perfil: "usuario", deleted_at: null, auth_version: 1 };
const ENV = { NODE_ENV: "test", GOOGLE_CLIENT_ID: "synthetic-client", AUTH_VERSION_MODE: "bridge",
  JWT_SECRET: "ficticio-google-access-etapa06", JWT_ISSUER: "issuer-local", JWT_AUDIENCE: "audience-local" };

function fixture(t, { user = USER, payload = { email: USER.email, email_verified: true },
  providerError, env = {}, queryError, realIssuer = false } = {}) {
  const testEnv = { ...ENV, ...env };
  const logs = [];
  const consoleMock = Object.fromEntries(["log", "warn", "error"].map(level => [level, (...args) => logs.push(args)]));
  let handler;
  const verifyIdToken = t.mock.fn(async () => {
    if (providerError) throw providerError;
    return { getPayload: () => payload };
  });
  const query = t.mock.fn(async () => {
    if (queryError) throw queryError;
    return { rows: user ? [{ ...user }] : [] };
  });
  let generate = () => "synthetic.access.jwt";
  if (realIssuer) {
    const issuerModule = { exports: {} };
    vm.runInNewContext(fs.readFileSync(require.resolve("./generateToken"), "utf8"), {
      module: issuerModule, exports: issuerModule.exports, process: { env: testEnv }, console: consoleMock,
      require(name) {
        if (name === "jsonwebtoken") return jwt;
        if (name === "./authVersion") return authVersion;
        throw new Error("Dependencia nao autorizada");
      },
    });
    generate = issuerModule.exports;
  }
  const generateJwt = t.mock.fn(generate);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve("./authGoogle"), "utf8"), {
    module, exports: module.exports, process: { env: testEnv }, console: consoleMock,
    require(name) {
      if (name === "express") return { Router: () => ({ post(route, callback) {
        assert.equal(route, "/google"); handler = callback;
      } }) };
      if (name === "google-auth-library") return { OAuth2Client: class {
        constructor(clientId) { assert.equal(clientId, String(testEnv.GOOGLE_CLIENT_ID || "").trim()); }
        verifyIdToken(...args) { return verifyIdToken(...args); }
      } };
      if (name === "../db") return { query };
      if (name === "./generateToken") return generateJwt;
      if (name === "./authVersion") return authVersion;
      throw new Error("Dependencia nao autorizada");
    },
  });
  async function login(body = { credential: "synthetic-id-token" }) {
    const req = { body };
    const res = { statusCode: null, headers: {}, cookies: [],
      set(key, value) { this.headers[key] = value; return this; },
      status(code) { this.statusCode = code; return this; },
      json(response) { this.body = response; return this; } };
    await handler(req, res);
    return res;
  }
  return { login, query, generateJwt, verifyIdToken, logs };
}

for (const version of [1, 2, 2147483647]) {
  test(`Google encaminha versao ${version} pela query existente e preserva sucesso`, async (t) => {
    const f = fixture(t, { user: { ...USER, auth_version: version } });
    const res = await f.login();
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(JSON.stringify(res.body)), {
      ok: true, code: "AUTH-GOOGLE-200-LOGIN", message: "Login com Google realizado com sucesso.",
      token: "synthetic.access.jwt",
      usuario: { id: USER.id, nome: USER.nome, email: USER.email, cpf: USER.cpf, perfil: USER.perfil },
    });
    assert.equal(f.query.mock.callCount(), 1);
    assert.match(f.query.mock.calls[0].arguments[0], /^\s*SELECT[\s\S]*\bauth_version\b/);
    assert.equal(JSON.stringify(f.query.mock.calls[0].arguments[1]), JSON.stringify([USER.email]));
    assert.equal(JSON.stringify(f.generateJwt.mock.calls[0].arguments),
      JSON.stringify([{ id: 7, perfil: "usuario", auth_version: version }, "1d"]));
    assert.equal(JSON.stringify(f.verifyIdToken.mock.calls[0].arguments),
      JSON.stringify([{ idToken: "synthetic-id-token", audience: ENV.GOOGLE_CLIENT_ID }]));
    assert.match(res.headers["Cache-Control"], /no-store/);
    assert.equal(res.cookies.length, 0);
  });
}

for (const [label, version] of [
  ["ausente", undefined], ["null", null], ["zero", 0], ["negativo", -1], ["decimal", 1.5],
  ["string", "1"], ["array", []], ["objeto", {}], ["boolean", true], ["NaN", NaN],
  ["Infinity", Infinity], ["acima INT4", 2147483648], ["nao safe", Number.MAX_SAFE_INTEGER + 1],
]) {
  test(`Google DB ${label} retorna 500 operacional exato, nunca 401`, async (t) => {
    const f = fixture(t, { user: { ...USER, auth_version: version } });
    const res = await f.login();
    assert.equal(res.statusCode, 500);
    assert.deepEqual(JSON.parse(JSON.stringify(res.body)), {
      ok: false, code: "AUTH-GOOGLE-500-FALHA-INTERNA", message: "Falha interna na autenticação com Google.",
    });
    assert.equal(f.generateJwt.mock.callCount(), 0);
    assert.equal(f.query.mock.callCount(), 1);
    assert.equal(res.cookies.length, 0);
    assert.ok(f.logs.some(args => args[1]?.reason === "invalid_db_auth_version"));
  });
}

for (const [label, options, code, status, queryCount] of [
  ["email ausente", { payload: { email_verified: true } }, "AUTH-GOOGLE-401-EMAIL-AUSENTE", 401, 0],
  ["email nao verificado", { payload: { email: USER.email, email_verified: false } }, "AUTH-GOOGLE-401-EMAIL-NAO-VERIFICADO", 401, 0],
  ["usuario inexistente", { user: null }, "AUTH-GOOGLE-403-USUARIO-NAO-CADASTRADO", 403, 1],
  ["conta excluida", { user: { ...USER, deleted_at: "2026-10-08", auth_version: null } }, "AUTH-GOOGLE-403-CONTA-EXCLUIDA", 403, 1],
  ["perfil invalido", { user: { ...USER, perfil: "gestor", auth_version: null } }, "AUTH-GOOGLE-403-PERFIL-INVALIDO", 403, 1],
  ["provedor falha", { providerError: new Error("private-provider-error@example.invalid") }, "AUTH-GOOGLE-401-FALHA", 401, 0],
  ["config Google ausente", { env: { GOOGLE_CLIENT_ID: undefined } }, "AUTH-GOOGLE-500-CONFIG-AUSENTE", 500, 0],
]) {
  test(`Google preserva gate ${label}`, async (t) => {
    const f = fixture(t, options);
    const res = await f.login();
    assert.equal(res.statusCode, status);
    assert.equal(res.body.code, code);
    assert.equal(f.generateJwt.mock.callCount(), 0);
    assert.equal(f.query.mock.callCount(), queryCount);
    assert.equal(inspect(f.logs).includes("private-provider-error@example.invalid"), false);
  });
}

test("credencial ausente preserva 400 sem provedor ou banco", async (t) => {
  const f = fixture(t);
  const res = await f.login({});
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, "AUTH-GOOGLE-400-CREDENTIAL-AUSENTE");
  assert.equal(f.verifyIdToken.mock.callCount(), 0);
  assert.equal(f.query.mock.callCount(), 0);
  assert.equal(f.generateJwt.mock.callCount(), 0);
});

test("Google e emissor real assinam access claim sem modificar ID token do provedor", async (t) => {
  const payload = { email: USER.email, email_verified: true, sub: "google-user-id" };
  const snapshot = JSON.stringify(payload);
  const f = fixture(t, { user: { ...USER, auth_version: 2 }, payload, realIssuer: true });
  const res = await f.login();
  assert.equal(res.statusCode, 200);
  const decoded = jwt.verify(res.body.token, ENV.JWT_SECRET, { issuer: ENV.JWT_ISSUER, audience: ENV.JWT_AUDIENCE });
  assert.equal(decoded.auth_version, 2);
  assert.equal(decoded.sub, "7");
  assert.equal(decoded.perfil, "usuario");
  assert.equal(decoded.exp - decoded.iat, 86400);
  assert.equal(JSON.stringify(payload), snapshot);
  assert.equal(Object.hasOwn(payload, "auth_version"), false);
});

test("Google falha operacional nao expoe valor recebido, PII ou stack", async (t) => {
  const value = "db-private-version@example.invalid";
  const f = fixture(t, { user: { ...USER, auth_version: value } });
  const res = await f.login();
  for (const sentinel of [value, USER.email, USER.cpf, "synthetic-id-token", "stack"]) {
    assert.equal(inspect(f.logs).includes(sentinel), false);
    assert.equal(JSON.stringify(res.body).includes(sentinel), false);
  }
});
