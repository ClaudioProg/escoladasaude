"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createAuthSessionMiddleware, SESSION_COOKIE_PRODUCTION, SESSION_COOKIE_DEVELOPMENT, sessionCookieName } = require("./authSessionMiddleware");
const { requireProfile, requireAnyProfile } = require("./sessionAuthorization");

function response() { const out = { statusCode: null, body: null }; out.status = (code) => { out.statusCode = code; return out; }; out.json = (body) => { out.body = body; return out; }; return out; }
function run(middleware, req = {}) { const res = response(); let nextError; middleware(req, res, (error) => { nextError = error || true; }); return { res, nextError }; }

test("cookie de sessao e identidade sem aliases", async () => {
  assert.equal(SESSION_COOKIE_PRODUCTION, "__Host-escola_saude_session");
  assert.equal(sessionCookieName(false), SESSION_COOKIE_DEVELOPMENT);
  assert.equal(SESSION_COOKIE_DEVELOPMENT.startsWith("__Host-"), false);
  let calls = 0;
  const middleware = createAuthSessionMiddleware({ sessionService: { validateSession: async () => { calls += 1; return { id: 7, perfis: ["usuario", "gestor"], areaAtiva: "gestor", sessionId: "s1" }; } }, isProduction: true });
  const req = { headers: { cookie: `${SESSION_COOKIE_PRODUCTION}=opaque; other=x` } };
  const res = response(); let nextCalled = false;
  await middleware(req, res, () => { nextCalled = true; });
  assert.equal(calls, 1); assert.equal(nextCalled, true);
  assert.deepEqual(req.user, { id: 7, perfis: ["usuario", "gestor"], areaAtiva: "gestor", sessionId: "s1" });
  assert.equal(req.userId, undefined); assert.equal(req.perfil, undefined); assert.equal(req.user.perfil, undefined);
});

test("middleware rejeita ausencia, bearer, cookie invalido e isola falha operacional", async () => {
  const invalid = createAuthSessionMiddleware({ sessionService: { validateSession: async () => { const e = new Error(); e.code = "AUTH_SESSION_INVALID"; throw e; } } });
  for (const req of [
    { headers: {} },
    { headers: { authorization: "Bearer token" } },
    { headers: { cookie: "other=x" } },
    { headers: { cookie: `${SESSION_COOKIE_DEVELOPMENT}=x` } },
  ]) {
    const res = response(); let nextError; await invalid(req, res, (err) => { nextError = err; });
    assert.equal(res.statusCode, 401); assert.equal(res.body.code, "AUTH-401-SESSION-INVALID"); assert.equal(nextError, undefined);
  }
  const operational = createAuthSessionMiddleware({ sessionService: { validateSession: async () => { throw new Error("db token=x"); } } });
  const res = response(); let nextError; await operational({ headers: { cookie: `${SESSION_COOKIE_DEVELOPMENT}=secret` } }, res, (err) => { nextError = err; });
  assert.equal(res.statusCode, null); assert.equal(nextError.code, "AUTH_SESSION_OPERATIONAL_FAILURE"); assert.equal(nextError.message.includes("secret"), false);
});

test("autorizacao nova e fail-closed sem bypass", () => {
  const valid = { user: { id: 7, perfis: ["gestor"], areaAtiva: "administrador", sessionId: "s1" } };
  let advanced = false; requireProfile("gestor")(valid, response(), () => { advanced = true; }); assert.equal(advanced, true);
  const denied = run(requireProfile("diagnostico"), valid); assert.equal(denied.res.statusCode, 403);
  advanced = false; requireAnyProfile(["diagnostico", "gestor"])(valid, response(), () => { advanced = true; }); assert.equal(advanced, true);
  assert.equal(run(requireProfile("administrador"), valid).res.statusCode, 403);
  assert.equal(run(requireProfile("gestor"), { user: { id: 7, perfis: "gestor" } }).res.statusCode, 401);
  assert.throws(() => requireAnyProfile([])); assert.throws(() => requireProfile("gestor,admin"));
  assert.throws(() => requireProfile("perfil_inventado"));
});
