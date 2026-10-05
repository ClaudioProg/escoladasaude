"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { AuthSessionError, createAuthSessionService, hashToken, makeToken } = require("./authSessionService");

const NOW = new Date("2026-08-25T12:00:00.000Z");

function fakeDb({ profiles = ["usuario"], context = null, active = [], session = null, touchState = { valid: true, written: false }, touchError = null, updateRows = [] } = {}) {
  const calls = [];
  const query = async (sql, params = []) => {
    calls.push({ sql, params });
    if (sql.includes("FROM public.usuarios WHERE")) return { rows: [{ id: params[0] }] };
    if (sql.includes("SELECT perfil_codigo")) return { rows: profiles.map((perfil_codigo) => ({ perfil_codigo })) };
    if (sql.includes("SELECT ultima_area_ativa")) return { rows: context ? [{ ultima_area_ativa: context }] : [] };
    if (sql.includes("ORDER BY criada_em")) return { rows: active };
    if (sql.includes("JOIN public.usuarios")) return { rows: session ? [session] : [] };
    if (sql.includes("WITH locked AS MATERIALIZED")) {
      if (touchError) throw touchError;
      return { rows: touchState === null ? [] : [touchState] };
    }
    if (sql.includes("RETURNING id")) return { rows: updateRows, rowCount: updateRows.length };
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
    const db = fakeDb({ profiles: ["usuario"], session: base, updateRows: [{ area_ativa: "usuario" }] });
    const out = await createAuthSessionService({ db, now: () => NOW }).validateSession("opaque");
    assert.deepEqual(out, { id: 7, perfis: ["usuario"], areaAtiva: "usuario", sessionId: "s1" });
  });
  await t.test("revogada, expirada e limite vencido rejeitam", async () => {
    for (const session of [{ ...base, revogada_em: NOW }, { ...base, expira_em: NOW }, { ...base, limite_absoluto_em: NOW }]) {
      await assert.rejects(createAuthSessionService({ db: fakeDb({ session }), now: () => NOW }).validateSession("x"), AuthSessionError);
    }
  });
  await t.test("touch distingue escrita de sessao valida sem escrita", async () => {
    const noWrite = fakeDb({ touchState: { valid: true, written: false } });
    assert.equal((await createAuthSessionService({ db: noWrite, now: () => NOW }).touchSession("s1")).written, false);
    const written = fakeDb({ touchState: { valid: true, written: true } });
    assert.equal((await createAuthSessionService({ db: written, now: () => NOW }).touchSession("s1")).written, true);
    assert.match(written.calls[0].sql, /LEAST\(\$3, s\.limite_absoluto_em\)/);
  });
  await t.test("touch rejeita sessao inexistente, revogada ou expirada", async () => {
    for (const [label, touchState] of [
      ["inexistente", null],
      ["revogada", { valid: false, written: false }],
      ["expirada por inatividade", { valid: false, written: false }],
      ["expirada pelo limite absoluto", { valid: false, written: false }],
    ]) {
      await assert.rejects(
        createAuthSessionService({ db: fakeDb({ touchState }), now: () => NOW }).touchSession("s1"),
        (error) => error instanceof AuthSessionError && error.code === "AUTH_SESSION_INVALID",
        label,
      );
    }
  });
  await t.test("revogacoes sao idempotentes e motivo e tecnico", async () => {
    const service = createAuthSessionService({ db: fakeDb(), now: () => NOW });
    assert.equal((await service.revokeSession(7, "s1", "logout")).revoked, false);
    await assert.rejects(service.revokeSession(7, "s1", "texto livre"), AuthSessionError);
    assert.equal((await service.revokeUserSessions(7, "password_changed", "s1")).revoked, 0);
  });
  await t.test("troca area atualiza so a sessao e preferencia", async () => {
    const db = fakeDb({ profiles: ["usuario", "gestor"], updateRows: [{ id: "s1" }] });
    const service = createAuthSessionService({ db, now: () => NOW });
    assert.deepEqual(await service.changeActiveArea({ sessionId: "s1", usuarioId: 7, areaAtiva: "gestor" }), { areaAtiva: "gestor" });
    assert.equal(db.calls.some((call) => call.sql.includes("ON CONFLICT (usuario_id)")), true);
  });
});

test("revokeUserSessions preserva API antiga e usa somente o executor explicito", async (t) => {
  const expectedSql = `UPDATE public.auth_sessao SET revogada_em = $2, motivo_revogacao = $3
        WHERE usuario_id = $1 AND revogada_em IS NULL AND ($4::uuid IS NULL OR id <> $4)`;
  const exceptId = "6b9d2f14-4925-4d35-92a4-8c8b5b4e2f91";

  function setup(t, rowCount = 0) {
    const db = fakeDb();
    t.mock.method(db, "query", async () => ({ rows: [], rowCount }));
    t.mock.method(db, "tx", () => { throw new Error("transacao interna proibida"); });
    const now = t.mock.fn(() => NOW);
    return { db, now, service: createAuthSessionService({ db, now }) };
  }

  await t.test("dois argumentos usam db.query, null e rowCount", async (t) => {
    const { db, now, service } = setup(t, 3);
    assert.deepEqual(await service.revokeUserSessions(7, "password_changed"), { revoked: 3 });
    assert.equal(db.query.mock.callCount(), 1);
    assert.deepEqual(db.query.mock.calls[0].arguments, [expectedSql, [7, NOW, "password_changed", null]]);
    assert.equal(now.mock.callCount(), 1);
    assert.equal(db.tx.mock.callCount(), 0);
  });

  await t.test("tres argumentos preservam UUID e retorno zero", async (t) => {
    const { db, service } = setup(t);
    assert.deepEqual(await service.revokeUserSessions(7, "password_changed", exceptId), { revoked: 0 });
    assert.equal(db.query.mock.callCount(), 1);
    assert.deepEqual(db.query.mock.calls[0].arguments, [expectedSql, [7, NOW, "password_changed", exceptId]]);
    assert.equal(db.tx.mock.callCount(), 0);
  });

  await t.test("executor com apenas query preserva null e UUID sem usar db", async (t) => {
    for (const exceptSessionId of [null, exceptId]) {
      const { db, now, service } = setup(t);
      const executor = { query: t.mock.fn(async function () {
        assert.equal(this, executor);
        return { rows: [], rowCount: 4 };
      }) };
      assert.deepEqual(Object.keys(executor), ["query"]);
      assert.deepEqual(await service.revokeUserSessions(7, "password_changed", exceptSessionId, executor), { revoked: 4 });
      assert.equal(executor.query.mock.callCount(), 1);
      assert.deepEqual(executor.query.mock.calls[0].arguments, [expectedSql, [7, NOW, "password_changed", exceptSessionId]]);
      assert.equal(db.query.mock.callCount(), 0);
      assert.equal(db.tx.mock.callCount(), 0);
      assert.equal(now.mock.callCount(), 1);
    }
  });

  await t.test("motivo invalido falha antes de query com e sem executor", async (t) => {
    const { db, now, service } = setup(t);
    const executor = { query: t.mock.fn() };
    const invalidReason = (error) => error instanceof AuthSessionError && error.code === "AUTH_SESSION_REASON_INVALID";
    await assert.rejects(service.revokeUserSessions(7, "texto livre"), invalidReason);
    await assert.rejects(service.revokeUserSessions(7, "texto livre", null, executor), invalidReason);
    assert.equal(db.query.mock.callCount(), 0);
    assert.equal(executor.query.mock.callCount(), 0);
    assert.equal(db.tx.mock.callCount(), 0);
    assert.equal(now.mock.callCount(), 0);
  });

  await t.test("executor explicito invalido rejeita sem fallback", async (t) => {
    for (const [label, executor] of [
      ["undefined", undefined],
      ["null", null],
      ["objeto vazio", {}],
      ["string", "executor"],
      ["funcao sem query", t.mock.fn()],
      ["query nao-function", { query: "invalida" }],
    ]) {
      await t.test(label, async (t) => {
        const { db, now, service } = setup(t);
        await assert.rejects(
          service.revokeUserSessions(7, "password_changed", null, executor),
          (error) => error instanceof AuthSessionError && error.code === "AUTH_SESSION_EXECUTOR_INVALID",
        );
        assert.equal(db.query.mock.callCount(), 0);
        assert.equal(db.tx.mock.callCount(), 0);
        assert.equal(now.mock.callCount(), 0);
        if (typeof executor === "function") assert.equal(executor.mock.callCount(), 0);
      });
    }
  });

  await t.test("erro de query chega intacto ao chamador sem fallback", async (t) => {
    const { db, service } = setup(t);
    const original = new Error("executor indisponivel");
    const executor = { query: t.mock.fn(async () => { throw original; }) };
    await assert.rejects(service.revokeUserSessions(7, "password_changed", null, executor), (error) => error === original);
    assert.equal(executor.query.mock.callCount(), 1);
    assert.equal(db.query.mock.callCount(), 0);
    assert.equal(db.tx.mock.callCount(), 0);
  });
});

test("hardening prova predicates de limite, touch e revogacao", async (t) => {
  await t.test("limite absoluto vencido nao entra no limite e ordenacao e deterministica", async () => {
    const db = fakeDb({ active: Array.from({ length: 6 }, (_, index) => ({ id: `old-${index}` })) });
    await createAuthSessionService({ db, now: () => NOW }).createSession({ usuarioId: 7 });
    const activeQuery = db.calls.find((call) => call.sql.includes("ORDER BY criada_em"));
    assert.match(activeQuery.sql, /limite_absoluto_em IS NULL OR limite_absoluto_em > \$2/);
    assert.match(activeQuery.sql, /ORDER BY criada_em ASC, id ASC FOR UPDATE/);
    assert.equal(db.calls.filter((call) => call.sql.includes("session_limit")).length, 2);
  });
  await t.test("touch bloqueia a linha e distingue estado invalido sem UPDATE no-op", async () => {
    const db = fakeDb();
    await createAuthSessionService({ db, now: () => NOW }).touchSession("s1");
    const sql = db.calls[0].sql;
    assert.match(sql, /WITH locked AS MATERIALIZED/);
    assert.match(sql, /WHERE id = \$1\s+FOR UPDATE/);
    assert.match(sql, /locked\.revogada_em IS NULL AND locked\.expira_em > \$2/);
    assert.match(sql, /locked\.limite_absoluto_em IS NULL OR locked\.limite_absoluto_em > \$2/);
    assert.match(sql, /locked\.ultimo_uso_em <= \$4/);
    assert.match(sql, /EXISTS \(\s*SELECT 1 FROM locked/);
    assert.match(sql, /LEAST\(\$3, s\.limite_absoluto_em\)/);
  });
  await t.test("erro operacional de touch preserva a causa", async () => {
    const original = new Error("database unavailable");
    await assert.rejects(
      createAuthSessionService({ db: fakeDb({ touchError: original }), now: () => NOW }).touchSession("s1"),
      (error) => error === original,
    );
  });
  await t.test("revogacao especifica exige usuario proprietario e e idempotente", async () => {
    const db = fakeDb({ updateRows: [{ id: "s1" }] });
    const service = createAuthSessionService({ db, now: () => NOW });
    assert.equal((await service.revokeSession(7, "s1", "logout")).revoked, true);
    const call = db.calls[0];
    assert.match(call.sql, /id = \$1 AND usuario_id = \$2 AND revogada_em IS NULL/);
    assert.deepEqual(call.params.slice(0, 2), ["s1", 7]);
    const other = fakeDb();
    assert.equal((await createAuthSessionService({ db: other, now: () => NOW }).revokeSession(8, "s1", "logout")).revoked, false);
  });
});

test("CAS de area preserva concorrencia e falha fechado", async (t) => {
  const base = { id: "s1", usuario_id: 7, area_ativa: "removido", expira_em: new Date(NOW.getTime() + 3600000), limite_absoluto_em: null, revogada_em: null, deleted_at: null };
  function concurrentDb(nextSession, profiles) {
    let sessionReads = 0;
    return {
      tx: async (fn) => fn({ query: async () => ({ rows: [] }) }),
      query: async (sql) => {
        if (sql.includes("JOIN public.usuarios")) return { rows: [sessionReads++ === 0 ? base : nextSession] };
        if (sql.includes("SELECT perfil_codigo")) return { rows: profiles.map((perfil_codigo) => ({ perfil_codigo })) };
        if (sql.includes("SET area_ativa = 'usuario'")) return { rows: [] };
        return { rows: [] };
      },
    };
  }
  await t.test("CAS falho preserva nova area valida", async () => {
    const db = concurrentDb({ ...base, area_ativa: "gestor" }, ["usuario", "gestor"]);
    const out = await createAuthSessionService({ db, now: () => NOW }).validateSession("x");
    assert.equal(out.areaAtiva, "gestor");
  });
  await t.test("novo estado invalido tenta fallback seguro uma vez", async () => {
    const db = concurrentDb({ ...base, area_ativa: "ainda_removido" }, ["usuario"]);
    await assert.rejects(createAuthSessionService({ db, now: () => NOW }).validateSession("x"), AuthSessionError);
  });
  await t.test("revogacao concorrente durante releitura falha fechado", async () => {
    const db = concurrentDb({ ...base, revogada_em: NOW }, ["usuario"]);
    await assert.rejects(createAuthSessionService({ db, now: () => NOW }).validateSession("x"), AuthSessionError);
  });
});
