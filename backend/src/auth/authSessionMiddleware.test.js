"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createAuthSessionMiddleware, SESSION_COOKIE_PRODUCTION, SESSION_COOKIE_DEVELOPMENT, sessionCookieName } = require("./authSessionMiddleware");
const { requireProfile, requireAnyProfile } = require("./sessionAuthorization");

function response() { const out = { statusCode: null, body: null }; out.status = (code) => { out.statusCode = code; return out; }; out.json = (body) => { out.body = body; return out; }; return out; }
function run(middleware, req = {}) { const res = response(); let nextError; middleware(req, res, (error) => { nextError = error || true; }); return { res, nextError }; }
function user(perfis = ["usuario"], areaAtiva = "usuario") { return { id: 7, perfis, areaAtiva, sessionId: "s1" }; }

test("cookie oficial autentica uma vez e publica identidade sem aliases", async () => {
  assert.equal(SESSION_COOKIE_PRODUCTION, "__Host-escola_saude_session");
  assert.equal(SESSION_COOKIE_DEVELOPMENT, "escola_saude_session");
  assert.equal(sessionCookieName(true), "__Host-escola_saude_session");
  assert.equal(sessionCookieName(false), "escola_saude_session");
  let calls = 0;
  const middleware = createAuthSessionMiddleware({ sessionService: { validateSession: async () => { calls += 1; return { id: 7, perfis: ["usuario", "gestor"], areaAtiva: "gestor", sessionId: "s1" }; } }, isProduction: true });
  const req = { headers: { cookie: `${SESSION_COOKIE_PRODUCTION}=opaque; other=x` } };
  const res = response(); let nextCalled = false;
  await middleware(req, res, () => { nextCalled = true; });
  assert.equal(calls, 1); assert.equal(nextCalled, true);
  assert.deepEqual(req.user, { id: 7, perfis: ["usuario", "gestor"], areaAtiva: "gestor", sessionId: "s1" });
  assert.equal(req.userId, undefined); assert.equal(req.perfil, undefined); assert.equal(req.user.perfil, undefined);
});

test("middleware rejeita credenciais ausentes ou invalidas sem chamar service indevidamente", async () => {
  let calls = 0;
  const invalid = createAuthSessionMiddleware({ sessionService: { validateSession: async () => { calls += 1; const e = new Error(); e.code = "AUTH_SESSION_INVALID"; throw e; } } });
  for (const req of [
    { headers: {} },
    { headers: { authorization: "Bearer token" } },
    { headers: { cookie: "other=x" } },
    { headers: { cookie: `${SESSION_COOKIE_DEVELOPMENT}=` } },
    { headers: { cookie: "not-a-cookie" } },
  ]) {
    const res = response(); let nextError; await invalid(req, res, (err) => { nextError = err; });
    assert.equal(res.statusCode, 401); assert.equal(res.body.code, "AUTH-401-SESSION-INVALID"); assert.equal(nextError, undefined);
  }
  assert.equal(calls, 0);
  const validCookie = { headers: { cookie: `other=x; ${SESSION_COOKIE_DEVELOPMENT}=x; extra=y` } };
  const validRes = response(); await invalid(validCookie, validRes, () => {});
  assert.equal(calls, 1); assert.equal(validRes.statusCode, 401);
});

test("middleware preserva erro operacional original e rejeita identidade malformada", async () => {
  const original = new Error("database unavailable");
  const operational = createAuthSessionMiddleware({ sessionService: { validateSession: async () => { throw original; } } });
  const res = response(); let nextError; await operational({ headers: { cookie: `${SESSION_COOKIE_DEVELOPMENT}=secret` } }, res, (err) => { nextError = err; });
  assert.equal(res.statusCode, null); assert.equal(nextError, original); assert.equal(res.body, null);
  for (const perfis of [[], "usuario", ["usuario", "perfil_inexistente"], ["gestor"], ["usuario", "usuario"], [" usuario"]]) {
    const middleware = createAuthSessionMiddleware({ sessionService: { validateSession: async () => user(perfis, "usuario") } });
    const invalidRes = response(); let advanced = false;
    await middleware({ headers: { cookie: `${SESSION_COOKIE_DEVELOPMENT}=secret` } }, invalidRes, () => { advanced = true; });
    assert.equal(invalidRes.statusCode, 401); assert.equal(advanced, false);
  }
  for (const perfis of [["usuario"], ["usuario", "gestor"]]) {
    const middleware = createAuthSessionMiddleware({ sessionService: { validateSession: async () => user(perfis) } });
    const validRes = response(); let advanced = false;
    await middleware({ headers: { cookie: `${SESSION_COOKIE_DEVELOPMENT}=safe` } }, validRes, () => { advanced = true; });
    assert.equal(validRes.statusCode, null); assert.equal(advanced, true);
  }
});

test("autorizacao nova e fail-closed sem bypass", () => {
  const valid = { user: user(["usuario", "gestor"], "administrador") };
  let advanced = false; requireProfile("usuario")(valid, response(), () => { advanced = true; }); assert.equal(advanced, true);
  advanced = false; requireProfile("gestor")(valid, response(), () => { advanced = true; }); assert.equal(advanced, true);
  const denied = run(requireProfile("diagnostico"), valid); assert.equal(denied.res.statusCode, 403);
  advanced = false; requireAnyProfile(["diagnostico", "gestor"])(valid, response(), () => { advanced = true; }); assert.equal(advanced, true);
  assert.equal(run(requireProfile("administrador"), valid).res.statusCode, 403);
  assert.equal(run(requireProfile("gestor"), { user: user(["usuario", "administrador"]) }).res.statusCode, 403);
  assert.equal(run(requireProfile("gestor"), { user: user(["usuario"], "gestor") }).res.statusCode, 403);
  assert.equal(run(requireProfile("gestor"), { user: { id: 7, perfis: "gestor" } }).res.statusCode, 401);
  assert.equal(run(requireAnyProfile(["gestor", "diagnostico"]), { user: user(["usuario"]) }).res.statusCode, 403);
  assert.equal(run(requireAnyProfile(["gestor"]), { user: user([]) }).res.statusCode, 401);
  assert.throws(() => requireAnyProfile([])); assert.throws(() => requireAnyProfile(["gestor", "gestor"]));
  assert.throws(() => requireAnyProfile(["gestor", " gestor"])); assert.throws(() => requireAnyProfile(["gestor,admin"]));
  assert.throws(() => requireProfile("gestor,admin"));
  assert.throws(() => requireProfile("perfil_inventado"));
});
