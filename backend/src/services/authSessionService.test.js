"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { AuthSessionError, createAuthSessionService, hashToken, makeToken } = require("./authSessionService");

const NOW = new Date("2026-08-25T12:00:00.000Z");

function fakeDb({ profiles = ["usuario"], context = null, active = [], session = null, touchRows = [], updateRows = [] } = {}) {
  const calls = [];
  const query = async (sql, params = []) => {
    calls.push({ sql, params });
    if (sql.includes("FROM public.usuarios WHERE")) return { rows: [{ id: params[0] }] };
    if (sql.includes("SELECT perfil_codigo")) return { rows: profiles.map((perfil_codigo) => ({ perfil_codigo })) };
    if (sql.includes("SELECT ultima_area_ativa")) return { rows: context ? [{ ultima_area_ativa: context }] : [] };
    if (sql.includes("ORDER BY criada_em")) return { rows: active };
    if (sql.includes("JOIN public.usuarios")) return { rows: session ? [session] : [] };
    if (sql.includes("RETURNING id")) return { rows: touchRows.length ? touchRows : updateRows, rowCount: updateRows.length };
    if (sql.startsWith("UPDATE public.auth_sessao") || sql.startsWith("UPDATE public.auth_usuario_contexto")) return { rows: updateRows, rowCount: updateRows.length };
    return { rows: [], rowCount: 0 };
  };
  return { calls, query, tx: async (fn) => fn({ query }) };
}

test("token opaco possui 256 bits e hash SHA-256 sem persistir o bruto", () => {
  const token = makeToken();
  assert.ok(Buffer.from(token, "base64url").length >= 32);
  assert.equal(hashToken(token).length, 32);
  assert.notEqual(token, hashToken(token).toString("hex"));
});

test("criacao bloqueia usuario, resolve area e limita cinco sessoes", async (t) => {
  await t.test("UUID, area concedida e manter=false", async () => {
    const db = fakeDb({ profiles: ["usuario", "gestor"] });
    const service = createAuthSessionService({ db, now: () => NOW });
    const output = await service.createSession({ usuarioId: 7, areaInicial: "gestor" });
    assert.match(output.session.id, /^[0-9a-f-]{36}$/);
    assert.equal(output.session.limiteAbsolutoEm, null);
    assert.ok(db.calls.some((call) => call.sql.includes("FOR UPDATE")));
    const insert = db.calls.find((call) => call.sql.includes("INSERT INTO public.auth_sessao"));
    assert.equal(Buffer.isBuffer(insert.params[2]), true);
    assert.equal(insert.params.includes(output.token), false);
  });
  await t.test("preferencia valida, invalida e ausente", async () => {
    for (const [context, expected] of [["gestor", "gestor"], ["removido", "usuario"], [null, "usuario"]]) {
      const service = createAuthSessionService({ db: fakeDb({ profiles: ["usuario", "gestor"], context }), now: () => NOW });
      assert.equal((await service.createSession({ usuarioId: 7 })).session.areaAtiva, expected);
    }
  });
  await t.test("area nao concedida rejeita e manter=true limita 30d", async () => {
    const service = createAuthSessionService({ db: fakeDb(), now: () => NOW });
    await assert.rejects(service.createSession({ usuarioId: 7, areaInicial: "gestor" }), AuthSessionError);
    const persistent = createAuthSessionService({ db: fakeDb(), now: () => NOW });
    const made = await persistent.createSession({ usuarioId: 7, manterConectado: true });
    assert.equal(made.session.limiteAbsolutoEm - NOW, 30 * 24 * 60 * 60 * 1000);
  });
  await t.test("sexta revoga a mais antiga e expiradas nao contam", async () => {
    const db = fakeDb({ active: Array.from({ length: 5 }, (_, index) => ({ id: `old-${index}` })) });
    const service = createAuthSessionService({ db, now: () => NOW });
    await service.createSession({ usuarioId: 7 });
    assert.equal(db.calls.filter((call) => call.params.includes("old-0")).length, 1);
    const clean = fakeDb({ active: [] });
    await createAuthSessionService({ db: clean, now: () => NOW }).createSession({ usuarioId: 7 });
    assert.equal(clean.calls.some((call) => call.params.includes("session_limit")), false);
  });
});

test("validacao, touch, revogacao e area mantem contratos", async (t) => {
  const base = { id: "s1", usuario_id: 7, area_ativa: "gestor", expira_em: new Date(NOW.getTime() + 3600000), limite_absoluto_em: null, revogada_em: null, deleted_at: null };
  await t.test("valida perfis e reduz area removida para usuario", async () => {
    const db = fakeDb({ profiles: ["usuario"], session: base });
    const out = await createAuthSessionService({ db, now: () => NOW }).validateSession("opaque");
    assert.deepEqual(out, { id: 7, perfis: ["usuario"], areaAtiva: "usuario", sessionId: "s1" });
  });
  await t.test("revogada, expirada e limite vencido rejeitam", async () => {
    for (const session of [{ ...base, revogada_em: NOW }, { ...base, expira_em: NOW }, { ...base, limite_absoluto_em: NOW }]) {
      await assert.rejects(createAuthSessionService({ db: fakeDb({ session }), now: () => NOW }).validateSession("x"), AuthSessionError);
    }
  });
  await t.test("touch so escreve apos 60s e respeita limite", async () => {
    const noWrite = fakeDb();
    assert.equal((await createAuthSessionService({ db: noWrite, now: () => NOW }).touchSession("s1")).written, false);
    const written = fakeDb({ touchRows: [{ id: "s1" }] });
    assert.equal((await createAuthSessionService({ db: written, now: () => NOW }).touchSession("s1")).written, true);
    assert.match(written.calls[0].sql, /LEAST\(\$3, limite_absoluto_em\)/);
  });
  await t.test("revogacoes sao idempotentes e motivo e tecnico", async () => {
    const service = createAuthSessionService({ db: fakeDb(), now: () => NOW });
    assert.equal((await service.revokeSession("s1", "logout")).revoked, false);
    await assert.rejects(service.revokeSession("s1", "texto livre"), AuthSessionError);
    assert.equal((await service.revokeUserSessions(7, "password_changed", "s1")).revoked, 0);
  });
  await t.test("troca area atualiza so a sessao e preferencia", async () => {
    const db = fakeDb({ profiles: ["usuario", "gestor"], updateRows: [{ id: "s1" }] });
    const service = createAuthSessionService({ db, now: () => NOW });
    assert.deepEqual(await service.changeActiveArea({ sessionId: "s1", usuarioId: 7, areaAtiva: "gestor" }), { areaAtiva: "gestor" });
    assert.equal(db.calls.some((call) => call.sql.includes("ON CONFLICT (usuario_id)")), true);
  });
});
