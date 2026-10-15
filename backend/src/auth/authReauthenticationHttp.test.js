"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const { createRequire } = require("node:module");
const { Readable } = require("node:stream");
const jwt = require("jsonwebtoken");
const VERSION = require("./authVersion");
const { createReauthenticationRouter, configuration, enabled, BASE_PATH } = require("./authReauthenticationHttp");
const { fixture, COOKIE, OTHER_COOKIE, SID, hash } = require("../services/authReauthentication.fixture");
const { fixture: restrictedFixture, TOKEN: D2_COOKIE } = require("../services/authRestrictedContext.fixture");
const { createRestrictedContextMiddleware } = require("./authRestrictedMiddleware");
const ORIGIN = "https://app.example.test";
const JWT_SECRET = "synthetic-reauth-jwt-not-production";
const env = () => ({ NODE_ENV: "test", JWT_SECRET, AUTH_VERSION_MODE: "strict", AUTH_REAUTH_ENABLED: "true",
  AUTH_REAUTH_ATTEMPT_WINDOW_MS: "900000", AUTH_REAUTH_MAX_ACCOUNT: "3", AUTH_REAUTH_MAX_IP: "100",
  AUTH_REAUTH_CSRF_SECRET: Buffer.alloc(32, 71).toString("base64url"), AUTH_REAUTH_ALLOWED_ORIGINS: ORIGIN });
function bearer(f, logs) {
  const mod = { exports: {} };
  vm.runInThisContext("(function(require,module,exports,process,console){" + fs.readFileSync(path.join(__dirname, "authMiddleware.js"), "utf8") + "\n})")(
    name => name === "../db" ? { query: async (_sql, params) => ({ rows: [{ id: params[0], perfil: "usuario",
      deleted_at: null, auth_version: f.state.user.auth_version }] }) } : name === "./authVersion" ?
      { ...VERSION, getAuthVersionMode: () => "strict" } : require(name), mod, mod.exports, { env: env() },
    { warn: (...args) => logs.push(args), error: (...args) => logs.push(args) });
  return mod.exports.authenticateRequest;
}
function setup({ restricted = false, configEnv = {}, fixtureOptions = {} } = {}) {
  const f = fixture(fixtureOptions), logs = [], config = configuration({ ...env(), ...configEnv });
  const d2 = restrictedFixture();
  if (restricted) { f.state.sessions[SID].token_hash = hash(D2_COOKIE); d2.state.session.id = SID; }
  const enforceBarrier = createRestrictedContextMiddleware({ service: d2.service, enabled: () => restricted });
  const authenticateBearer = bearer(f, logs);
  const router = createReauthenticationRouter({ service: f.service, config, authenticateBearer, enforceBarrier,
    versionMode: () => "strict" });
  return { f, d2, logs, router, config, authenticateBearer, enforceBarrier };
}
function send(router, { method = "POST", url = "/reautenticacao", headers = {}, body = { senha: "synthetic-password", finalidade: "trocar_senha" },
  rawBody, cookieToken = COOKIE } = {}) {
  return new Promise((resolve, reject) => {
    const raw = rawBody ?? JSON.stringify(body);
    const req = new Readable({ read() { this.push(Buffer.from(raw)); this.push(null); } });
    Object.assign(req, { method, url, originalUrl: "/api/auth" + url, baseUrl: "", params: {}, query: {},
      headers: { origin: ORIGIN, ...(cookieToken === null ? {} : { cookie: "escola_saude_session=" + cookieToken }),
        "content-type": "application/json", "content-length": String(Buffer.byteLength(raw)), ...headers },
      socket: { remoteAddress: "127.0.0.1" }, ip: "127.0.0.1", app: { get: () => false } });
    const res = { locals: {}, statusCode: 200, headers: {}, headersSent: false,
      setHeader(key, value) { this.headers[key.toLowerCase()] = value; }, getHeader(key) { return this.headers[key.toLowerCase()]; },
      status(code) { this.statusCode = code; return this; }, json(data) { this.body = data; resolve(this); return this; },
      sendStatus(code) { this.statusCode = code; resolve(this); return this; }, end() { resolve(this); return this; } };
    router.handle(req, res, error => error ? reject(error) : resolve({ ...res, fallthrough: true }));
  });
}
async function csrf(s, options = {}) {
  const out = await send(s.router, { method: "GET", url: "/reautenticacao/csrf", ...options });
  assert.equal(out.statusCode, 200); return out.body.data.csrfToken;
}
async function issue(s, options = {}) {
  return send(s.router, { ...options, headers: { "x-reauth-csrf": await csrf(s), ...options.headers } });
}
test("actual HTTP route emits only a password component, no-store, without session renewal", async () => {
  const s = setup(), sessions = structuredClone(s.f.state.sessions), out = await issue(s);
  assert.equal(out.statusCode, 200); assert.equal(out.headers["cache-control"], "no-store");
  assert.match(out.body.data.proof, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(out.body.data.authorizationGranted, false); assert.equal(out.body.data.mfaSatisfied, false);
  assert.deepEqual(s.f.state.sessions, sessions);
});
for (const value of [null, "invalid", ""])
test("invalid/absent cookie cannot emit proof / " + value, async () => {
  const s = setup(), out = await send(s.router, { cookieToken: value, headers: { "x-reauth-csrf": "A".repeat(43) } });
  assert.equal(out.statusCode, 401); assert.equal(s.f.state.attempts.length, 0);
});
test("Bearer alone cannot issue; provided invalid/conflicting Bearer cannot fall back to cookie", async () => {
  for (const [cookieToken, token] of [[null, jwt.sign({ sub: "7", perfil: "usuario", auth_version: 1 }, JWT_SECRET)],
    [COOKIE, "invalid-token"], [COOKIE, jwt.sign({ sub: "8", perfil: "usuario", auth_version: 1 }, JWT_SECRET)],
    [COOKIE, jwt.sign({ sub: "7", perfil: "usuario", auth_version: 2 }, JWT_SECRET)]]) {
    const s = setup(), out = await send(s.router, { cookieToken, headers: { authorization: "Bearer " + token } });
    assert.equal(out.statusCode, 401); assert.equal(s.f.state.attempts.length, 0);
  }
});
test("matching real JWT and verified cookie can request password component", async () => {
  const s = setup(), token = jwt.sign({ sub: "7", perfil: "usuario", auth_version: 1 }, JWT_SECRET, { expiresIn: "1h" });
  const out = await issue(s, { headers: { authorization: "Bearer " + token } });
  assert.equal(out.statusCode, 200);
});
test("ambiguous duplicated cookie is rejected", async () => {
  const s = setup(), out = await send(s.router, { headers: { cookie: "escola_saude_session=" + COOKIE + "; escola_saude_session=" + OTHER_COOKIE } });
  assert.equal(out.statusCode, 401); assert.equal(s.f.calls.length, 0);
});
test("production accepts only the official Host session cookie", async () => {
  const s = setup({ configEnv: { NODE_ENV: "production" } });
  let out = await send(s.router, { method: "GET", url: "/reautenticacao/csrf" }); assert.equal(out.statusCode, 401);
  out = await send(s.router, { method: "GET", url: "/reautenticacao/csrf", headers: { cookie: "__Host-escola_saude_session=" + COOKIE } });
  assert.equal(out.statusCode, 200);
});
for (const origin of ["https://evil.example.test", "null", "https://app.example.test.evil.test", ORIGIN + "/", ORIGIN + ":443", undefined])
test("CSRF exact Origin required without permissive fallback / " + origin, async () => {
  const s = setup(), out = await send(s.router, { headers: { origin } });
  assert.equal(out.statusCode, 403); assert.equal(s.f.calls.length, 0);
});
test("Referer fallback validates only exact configured origin; invalid Origin cannot fall back", async () => {
  const s = setup();
  let out = await send(s.router, { method: "GET", url: "/reautenticacao/csrf", headers: { origin: undefined, referer: ORIGIN + "/conta" } });
  assert.equal(out.statusCode, 200);
  out = await send(s.router, { headers: { origin: "null", referer: ORIGIN + "/conta" } }); assert.equal(out.statusCode, 403);
});
for (const token of [undefined, "invalid", "A".repeat(43)])
test("CSRF HMAC required before password attempt / " + token, async () => {
  const s = setup(), out = await send(s.router, { headers: { "x-reauth-csrf": token } });
  assert.equal(out.statusCode, 403); assert.equal(s.f.state.attempts.length, 0);
});
test("CSRF binds current session, account version and origin", async () => {
  for (const kind of ["session", "version", "origin"]) {
    const s = setup({ configEnv: { AUTH_REAUTH_ALLOWED_ORIGINS: ORIGIN + ",https://second.example.test" } });
    const token = await csrf(s);
    if (kind === "version") s.f.state.user.auth_version = 2;
    const out = await send(s.router, { cookieToken: kind === "session" ? OTHER_COOKIE : COOKIE,
      headers: { "x-reauth-csrf": token, ...(kind === "origin" ? { origin: "https://second.example.test" } : {}) } });
    assert.equal(out.statusCode, 403); assert.equal(s.f.state.attempts.length, 0);
  }
});
for (const profile of ["usuario", "gestor", "administrador", "diagnostico", "cai_administrador"])
test("D2 restricted account has no reauth/role bypass / " + profile, async () => {
  const s = setup({ restricted: true });
  if (profile !== "usuario") { s.f.state.profiles.push(profile); s.d2.profiles.push(profile); }
  const before = structuredClone(s.d2.state), out = await send(s.router, { cookieToken: D2_COOKIE });
  assert.equal(out.statusCode, 403); assert.equal(s.f.state.attempts.length, 0);
  assert.deepEqual(s.d2.state, before); assert.equal(s.d2.calls.some(c => c.tag === "touch"), false);
});
for (const body of [{ senha: "synthetic-password", finalidade: "*" },
  { senha: "synthetic-password", finalidade: "trocar_senha", usuarioId: 8 },
  { senha: "synthetic-password", finalidade: "trocar_senha", sessionId: SID },
  { senha: "synthetic-password", finalidade: "trocar_senha", perfil: "administrador" },
  { senha: "synthetic-password", finalidade: "trocar_senha", regularizado: true },
  { senha: "", finalidade: "trocar_senha" }])
test("HTTP rejects arbitrary purpose or identity fields / " + JSON.stringify(body), async () => {
  const s = setup(), out = await issue(s, { body }); assert.equal(out.statusCode, 400); assert.equal(s.f.state.attempts.length, 0);
});
for (const [method, url] of [["GET", "/reautenticacao"], ["HEAD", "/reautenticacao/csrf"], ["POST", "/reautenticacao/csrf"],
  ["PUT", "/reautenticacao"], ["DELETE", "/reautenticacao"]])
test("HTTP methods are exact / " + method + url, async () => {
  const s = setup(), out = await send(s.router, { method, url }); assert.equal(out.statusCode, 405);
});
test("no URL/query proof, no public consumer, no alias", async () => {
  const s = setup();
  for (const url of ["/reautenticacao?proof=synthetic-secret", "/reautenticacao/consumir", "/Reautenticacao", "/reautenticacao/"]) {
    const out = await send(s.router, { url }); assert.ok(out.statusCode === 404 || out.fallthrough);
    assert.equal(JSON.stringify(out.body ?? {}).includes("synthetic-secret"), false);
  }
  assert.equal(s.f.state.attempts.length, 0);
});
test("password guessing consumes account reservation even on HTTP rejection", async () => {
  const s = setup({ fixtureOptions: { passwords: { verifyPassword: async () => ({ authenticated: false, requiresPasswordChange: false }) } } });
  const csrfToken = await csrf(s);
  for (let i = 0; i < 4; i++) {
    const out = await send(s.router, { headers: { "x-reauth-csrf": csrfToken } });
    assert.equal(out.statusCode, i < 3 ? 401 : 429);
  }
  assert.equal(s.f.state.attempts.length, 3);
});
test("existing rate-limit IP mechanism rejects before a further password attempt", async () => {
  const s = setup({ configEnv: { AUTH_REAUTH_MAX_IP: "2" } }), csrfToken = await csrf(s);
  for (let i = 0; i < 3; i++) {
    const out = await send(s.router, { headers: { "x-reauth-csrf": csrfToken } });
    assert.equal(out.statusCode, i < 2 ? 200 : 429);
  }
  assert.equal(s.f.state.attempts.length, 2);
});
test("malformed/oversized JSON and non-JSON cannot disclose presented password", async () => {
  const s = setup(), csrfToken = await csrf(s);
  const bad = await send(s.router, { rawBody: '{"senha":"SECRET_BODY",', headers: { "x-reauth-csrf": csrfToken } });
  assert.equal(bad.statusCode, 400); assert.equal(JSON.stringify(bad.body).includes("SECRET_BODY"), false);
  const huge = await send(s.router, { body: { senha: "x".repeat(17000), finalidade: "trocar_senha" }, headers: { "x-reauth-csrf": csrfToken } });
  assert.equal(huge.statusCode, 413);
  const nonJson = await send(s.router, { headers: { "x-reauth-csrf": csrfToken, "content-type": "text/plain" } });
  assert.equal(nonJson.statusCode, 415); assert.equal(s.f.state.attempts.length, 0);
});
for (const key of ["AUTH_REAUTH_ATTEMPT_WINDOW_MS", "AUTH_REAUTH_MAX_ACCOUNT", "AUTH_REAUTH_MAX_IP", "AUTH_REAUTH_CSRF_SECRET", "AUTH_REAUTH_ALLOWED_ORIGINS"])
test("enabled HTTP requires explicit configuration / " + key, () => {
  const values = env(); delete values[key]; assert.throws(() => configuration(values), { code: "AUTH_REAUTH_CONFIG" });
});
for (const origins of ["*", ORIGIN + "/", ORIGIN + ",", ORIGIN + "," + ORIGIN, "null"])
test("origin configuration rejects wildcard, malformed and ambiguous values / " + origins, () => {
  assert.throws(() => configuration({ ...env(), AUTH_REAUTH_ALLOWED_ORIGINS: origins }), { code: "AUTH_REAUTH_CONFIG" });
});
test("CSRF key must be dedicated rather than JWT reuse", () => {
  const values = env(); values.JWT_SECRET = values.AUTH_REAUTH_CSRF_SECRET;
  assert.throws(() => configuration(values), { code: "AUTH_REAUTH_CONFIG" });
});
test("default/false flag disabled and ambiguous values fail closed", () => {
  assert.equal(enabled(undefined), false); assert.equal(enabled("false"), false); assert.equal(enabled("true"), true);
  for (const value of ["TRUE", "0", "", true]) assert.throws(() => enabled(value), { code: "AUTH_REAUTH_CONFIG" });
});
function productionRouter(s, values) {
  const filename = path.join(__dirname, "../routes/authReauthenticationRoute.js"), localRequire = createRequire(filename), mod = { exports: {} };
  let dbLoads = 0;
  vm.runInThisContext("(function(require,module,exports,process){" + fs.readFileSync(filename, "utf8") + "\n})")(
    name => name === "../db" ? (++dbLoads, { db: s.f.db }) : name === "../services/authReauthenticationService" ?
      { createReauthenticationService: () => s.f.service } : name === "../services/auditoriaService" ?
        { registrarAuditoria: s.f.audit } : name === "../auth/authMiddleware" ? { authenticateRequest: s.authenticateBearer } :
          name === "../auth/authRestrictedMiddleware" ? { enforceRestrictedContext: s.enforceBarrier } : localRequire(name),
    mod, mod.exports, { env: values });
  return { router: mod.exports, dbLoads: () => dbLoads };
}
test("production wrapper gates default/invalid flags without loading database", async () => {
  for (const value of [undefined, "false", "invalid"]) {
    const s = setup(), values = { ...env(), AUTH_REAUTH_ENABLED: value }, wrapper = productionRouter(s, values);
    const out = await send(wrapper.router);
    assert.equal(out.statusCode, value === "invalid" ? 503 : 404); assert.equal(wrapper.dbLoads(), 0);
  }
});
test("production wrapper mounts actual endpoints and observes later disable", async () => {
  const s = setup(), values = env(), wrapper = productionRouter(s, values);
  const response = await send(wrapper.router, { method: "GET", url: "/reautenticacao/csrf" });
  assert.equal(response.statusCode, 200); assert.equal(wrapper.dbLoads(), 1);
  const out = await send(wrapper.router, { headers: { "x-reauth-csrf": response.body.data.csrfToken } }); assert.equal(out.statusCode, 200);
  values.AUTH_REAUTH_ENABLED = "false";
  assert.equal((await send(wrapper.router)).statusCode, 404);
});
test("HTTP failures/logs/audits expose neither password nor proof nor SQL", async () => {
  const s = setup(), csrfToken = await csrf(s); s.f.fail = "issue";
  const out = await send(s.router, { headers: { "x-reauth-csrf": csrfToken } });
  assert.equal(out.statusCode, 503); assert.equal(out.headers["cache-control"], "no-store");
  const emitted = JSON.stringify({ response: out.body, logs: s.logs, audits: s.f.state.audits });
  for (const secret of [COOKIE, "synthetic-password", "stored-hash", "SECRET_DB", "SELECT", "token_hash"]) assert.equal(emitted.includes(secret), false);
});

test("enabled wrapper with incomplete configuration fails before loading database", async () => {
  const s = setup(), values = env(); delete values.AUTH_REAUTH_MAX_ACCOUNT;
  const wrapper = productionRouter(s, values), out = await send(wrapper.router);
  assert.equal(out.statusCode, 503); assert.equal(wrapper.dbLoads(), 0);
});
test("enabling after disabled startup requires restart rather than recreating IP store on request", async () => {
  const s = setup(), values = { ...env(), AUTH_REAUTH_ENABLED: "false" }, wrapper = productionRouter(s, values);
  values.AUTH_REAUTH_ENABLED = "true";
  const out = await send(wrapper.router);
  assert.equal(out.statusCode, 503); assert.equal(wrapper.dbLoads(), 0);
});
