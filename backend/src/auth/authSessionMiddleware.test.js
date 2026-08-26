"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { createAuthSessionMiddleware, SESSION_COOKIE_PRODUCTION, SESSION_COOKIE_DEVELOPMENT, sessionCookieName } = require("./authSessionMiddleware");
const { requireProfile, requireAnyProfile, validProfile, validProfiles } = require("./sessionAuthorization");

const EXPECTED_PROFILES = [
  "usuario", "institucional", "organizador", "administrador", "gestor",
  "diagnostico", "avaliador", "relator", "cai_administrador", "cai_coordenador",
];

function response() { const out = { statusCode: null, body: null }; out.status = (code) => { out.statusCode = code; return out; }; out.json = (body) => { out.body = body; return out; }; return out; }
function run(middleware, req = {}) { const res = response(); let nextError; middleware(req, res, (error) => { nextError = error || true; }); return { res, nextError }; }
function user(perfis = ["usuario"], areaAtiva = "usuario") { return { id: 7, perfis, areaAtiva, sessionId: "s1" }; }

function officialProfilesFromSource() {
  const source = fs.readFileSync(require.resolve("./sessionAuthorization"), "utf8");
  const declaration = source.match(/const OFFICIAL_PROFILES = new Set\(\[([\s\S]*?)\]\);/);
  assert.ok(declaration, "OFFICIAL_PROFILES deve permanecer uma lista declarada explicitamente");
  return [...declaration[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

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
  assert.deepEqual(officialProfilesFromSource(), EXPECTED_PROFILES);
  assert.equal(EXPECTED_PROFILES.length, 10);
  assert.ok(EXPECTED_PROFILES.every(validProfile));
  assert.ok(validProfiles(EXPECTED_PROFILES));
  for (const perfis of [undefined, null, [], "usuario", ["usuario", 1], ["usuario", "perfil_inexistente"], ["gestor"], ["usuario", "usuario"], [" usuario"], ["usuario "], ["usuario,gestor"]]) {
    const middleware = createAuthSessionMiddleware({ sessionService: { validateSession: async () => ({ id: 7, perfis, areaAtiva: "usuario", sessionId: "s1" }) } });
    const invalidRes = response(); let advanced = false;
    await middleware({ headers: { cookie: `${SESSION_COOKIE_DEVELOPMENT}=secret` } }, invalidRes, () => { advanced = true; });
    assert.equal(invalidRes.statusCode, 401); assert.equal(advanced, false);
  }
  for (const perfis of [["usuario"], ["usuario", "gestor"], EXPECTED_PROFILES]) {
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
  for (const req of [
    {}, { user: null }, { user: 7 }, { user: [] },
    { user: { perfis: ["usuario"], areaAtiva: "usuario", sessionId: "s1" } },
    { user: { id: null, perfis: ["usuario"], areaAtiva: "usuario", sessionId: "s1" } },
    { user: { id: "7", perfis: ["usuario"], areaAtiva: "usuario", sessionId: "s1" } },
    { user: { id: 7.5, perfis: ["usuario"], areaAtiva: "usuario", sessionId: "s1" } },
    { user: { id: 7, perfis: ["usuario"], areaAtiva: "usuario" } },
    { user: { id: 7, perfis: ["usuario"], areaAtiva: "usuario", sessionId: "" } },
    { user: { id: 7, perfis: ["usuario"], areaAtiva: "usuario", sessionId: 1 } },
    { user: { id: 7, perfis: ["usuario"], sessionId: "s1" } },
    { user: { id: 7, perfis: ["usuario"], areaAtiva: null, sessionId: "s1" } },
    { user: { id: 7, perfis: ["usuario"], areaAtiva: 1, sessionId: "s1" } },
  ]) assert.equal(run(requireProfile("usuario"), req).res.statusCode, 401);
  assert.equal(run(requireAnyProfile(["gestor", "diagnostico"]), { user: user(["usuario"]) }).res.statusCode, 403);
  assert.equal(run(requireAnyProfile(["gestor"]), { user: user([]) }).res.statusCode, 401);
  assert.throws(() => requireAnyProfile([])); assert.throws(() => requireAnyProfile(["gestor", "gestor"]));
  assert.throws(() => requireAnyProfile(["gestor", " gestor"])); assert.throws(() => requireAnyProfile(["gestor,admin"]));
  assert.throws(() => requireProfile("gestor,admin"));
  assert.throws(() => requireProfile("perfil_inventado"));
});
