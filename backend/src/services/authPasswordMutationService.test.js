"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const util = require("node:util");
const bcrypt = require("bcrypt");
const argon2 = require("argon2");
const passwords = require("./passwordService");
const { createPasswordMutationService, PasswordMutationError } = require("./authPasswordMutationService");
const { fixture } = require("./authPasswordMutation.fixture");
const OLD = "Trilho! Laranja 7 Nuvem clara";
const NEXT = "Aurora! Cedro 9 Vento azul";
let hashes;
test.before(async () => {
  hashes = { bcrypt: await bcrypt.hash(OLD, 4), argon2id: await passwords.createNewPasswordHash(OLD, {}) };
});
const rejects = (action, code) => assert.rejects(action, { code });
function baseline(f) { return structuredClone(f.state); }

test("real policy creates approved Argon2id outside all locks; opaque preparation exposes nothing", async () => {
  const f = fixture(hashes.bcrypt), before = baseline(f);
  const handle = await f.service.prepare(f.args(NEXT));
  assert.deepEqual(f.state, before);
  assert.equal(f.active, 0);
  assert.deepEqual(Reflect.ownKeys(handle), []);
  assert.equal(Object.getPrototypeOf(handle), null);
  assert.equal(Object.isFrozen(handle), true);
  assert.equal(util.inspect(handle).includes(NEXT), false);
  const out = await f.service.mutate(handle);
  assert.deepEqual(out, { usuarioId: 7, authVersion: 4, status: "committed" });
  assert.match(f.state.user.senha, /^\$argon2id\$v=19\$m=19456,p=1,t=2\$/);
  assert.equal((await passwords.verifyPassword(NEXT, f.state.user.senha)).authenticated, true);
  assert.equal(f.state.history.length, 1);
  assert.equal(f.state.history[0].senha_hash, before.user.senha);
  assert.deepEqual(f.decisions.map(d => d.phase), ["prepare", "mutate"]);
});

for (const [label, password, code] of [
  ["null", null, "PASSWORD_INVALID_TYPE"], ["short", "Ab9!x", "PASSWORD_TOO_SHORT"],
  ["long", NEXT.repeat(10), "PASSWORD_TOO_LONG"],
  ["high surrogate", "Frase Invalida 98\ud800", "PASSWORD_INVALID_UNICODE"],
  ["low surrogate", "Frase Invalida 98\udc00", "PASSWORD_INVALID_UNICODE"],
  ["NFKC expands over limit", "\ufb03".repeat(43), "PASSWORD_TOO_LONG"],
  ["blocklist", "123456789012345", "PASSWORD_TOO_COMMON"],
  ["predictable", "abcdefghijklmno", "PASSWORD_PREDICTABLE"],
]) test("official policy rejects " + label + " with no writes", async () => {
  const f = fixture(hashes.bcrypt), before = baseline(f);
  await rejects(f.service.change(f.args(password)), code);
  assert.deepEqual(f.state, before);
});
for (const [label, password] of [
  ["name", "Vento! Pessoa 97 Cristal"],
  ["cpf", "Vento! 12345678909 Cristal"],
  ["email", "Vento! pessoa@example.invalid 97"],
  ["phone", "Vento! 11987654321 Cristal"],
  ["birth", "Vento! 23/04/1985 Cristal 97"],
]) test("policy personal context comes only from current server row / " + label, async () => {
  const f = fixture(hashes.bcrypt), before = baseline(f);
  await rejects(f.service.change(f.args(password)), "PASSWORD_PERSONAL_DATA");
  assert.deepEqual(f.state, before);
});
test("caller cannot override policy context or smuggle authorization metadata", async () => {
  for (const extra of [{ context: {} }, { cpf: "ignored" }, { authorized: true }, { authorize: () => true }]) {
    const f = fixture(hashes.bcrypt);
    await rejects(f.service.prepare({ ...f.args(NEXT), ...extra }), "AUTH_PASSWORD_INPUT");
    assert.equal(f.transactions, 0);
  }
});
test("NFKC, no trimming or lowercasing, accents and emoji survive real hash creation", async () => {
  const password = "  \uff21urora! Caf\u00e9 97 Cristal \ud83d\ude00  ";
  const f = fixture(hashes.bcrypt);
  await f.service.change(f.args(password));
  assert.equal((await passwords.verifyPassword(password.normalize("NFKC"), f.state.user.senha)).authenticated, true);
  assert.equal((await passwords.verifyPassword(password.trim(), f.state.user.senha)).authenticated, false);
  assert.equal((await passwords.verifyPassword(password.toLowerCase(), f.state.user.senha)).authenticated, false);
});
for (const [label, password] of [
  ["15 code points", "R9!zQ4@xL7#pV2?"],
  ["128 code points / 512 bytes", Array.from({ length: 128 }, (_, i) => String.fromCodePoint(0x1f300 + i)).join("")],
]) test("official policy accepts exact boundary / " + label, async () => {
  const f = fixture(hashes.bcrypt);
  await f.service.change(f.args(password));
  assert.equal((await passwords.verifyPassword(password, f.state.user.senha)).authenticated, true);
});
for (const algorithm of ["bcrypt", "argon2id"]) {
  test("current password reuse uses real " + algorithm + " verification", async () => {
    const f = fixture(hashes[algorithm]), before = baseline(f);
    await rejects(f.service.change(f.args(OLD)), "AUTH_PASSWORD_REUSED");
    assert.deepEqual(f.state, before);
  });
  for (let slot = 0; slot < 4; slot++) test("each known historical credential is refused / " + algorithm + " / " + slot, async () => {
    const target = algorithm === "bcrypt" ? await bcrypt.hash(NEXT, 4) : await passwords.createNewPasswordHash(NEXT, {});
    const f = fixture(hashes.bcrypt), salted = algorithm === "bcrypt" ?
      await bcrypt.hash(NEXT, 4) : await passwords.createNewPasswordHash(NEXT, {});
    assert.notEqual(target, salted);
    for (let i = 0; i < 4; i++) f.addHistory(hashes.argon2id);
    f.state.history[slot].senha_hash = target;
    const before = baseline(f);
    await rejects(f.service.change(f.args(NEXT)), "AUTH_PASSWORD_REUSED");
    assert.deepEqual(f.state, before);
  });
}
for (const [label, legacy, presented] of [
  ["raw legacy spelling", "\uff21urora! Cedro 9 Vento azul", "\uff21urora! Cedro 9 Vento azul"],
  ["effective NFKC matches bcrypt", NEXT, "\uff21urora! Cedro 9 Vento azul"],
  ["72 bytes", "x".repeat(72), "x".repeat(72)],
  ["same 72-byte prefix", "x".repeat(72) + "old", "x".repeat(72) + "new"],
  ["72 UTF-8 bytes", "\ud83d\ude00".repeat(18), "\ud83d\ude00".repeat(18)],
]) test("bcrypt equivalence cannot bypass history / " + label, async () => {
  // Policy fixtures only for repeated x/emoji: actual structural validation and verifier still run.
  const f = fixture(await bcrypt.hash(legacy, 4), { passwords: {
    createNewPasswordHash: p => argon2.hash(p.normalize("NFKC"), { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 }),
    verifyPassword: passwords.verifyPassword,
  } });
  await rejects(f.service.change(f.args(presented)), "AUTH_PASSWORD_REUSED");
});
test("Argon2 historical NFKC equivalent is refused", async () => {
  const f = fixture(await passwords.createNewPasswordHash(NEXT, {}));
  await rejects(f.service.change(f.args("\uff21urora! Cedro 9 Vento azul")), "AUTH_PASSWORD_REUSED");
});
test("first change archives only the actual known previous hash, with no backfill", async () => {
  const f = fixture(hashes.bcrypt);
  await f.service.change(f.args(NEXT));
  assert.deepEqual(f.state.history.map(h => h.senha_hash), [hashes.bcrypt]);
  assert.equal(f.calls.filter(c => c.tag === "archive").length, 1);
});
test("sliding window is current plus four confirmed previous credentials; fifth-oldest may be used", async () => {
  const f = fixture(hashes.bcrypt);
  const values = [NEXT, "Lagoa! Prisma 83 Folha violeta", "Marfim! Lua 28 Estrada verde",
    "Pedra! Mirante 46 Ceu lilas", "Bosque! Farol 52 Estrela vinho"];
  const committed = [hashes.bcrypt];
  for (const value of values) {
    await f.service.change(f.args(value));
    committed.unshift(f.state.user.senha);
    assert.deepEqual(f.state.history.map(h => h.senha_hash), committed.slice(1, 5));
    assert.ok(f.state.history.length <= 4);
  }
  for (const value of values) await rejects(f.service.prepare(f.args(value)), "AUTH_PASSWORD_REUSED");
  await f.service.change(f.args(OLD));
  assert.equal(f.state.user.auth_version, 9);
  assert.equal(f.state.history.length, 4);
});
test("history ordering uses numeric bigint identities even across 9/10; timestamp ties do not decide order", async () => {
  const f = fixture(hashes.bcrypt);
  f.state.history = [9, 10, 8, 7].map(id => ({ id: String(id), senha_hash: hashes.argon2id, history_revision: "99" }));
  await f.service.change(f.args(NEXT));
  assert.deepEqual(f.state.history.map(h => h.id), ["31", "10", "9", "8"]);
  const sql = f.calls.find(c => c.tag === "history").sql;
  assert.match(sql, /ORDER BY h\.id DESC/);
});
for (const [label, fields, code] of [
  ["deleted", { deleted_at: "2026-10-16" }, "AUTH_PASSWORD_STATE"],
  ["null hash", { senha: null }, "AUTH_PASSWORD_STATE"],
  ["zero version", { auth_version: 0 }, "AUTH_PASSWORD_STATE"],
  ["string version", { auth_version: "3" }, "AUTH_PASSWORD_STATE"],
  ["overflow", { auth_version: 2147483647 }, "AUTH_PASSWORD_STATE"],
  ["invalid revision", { credential_revision: null }, "AUTH_PASSWORD_STATE"],
]) test("ineligible state fails closed / " + label, async () => {
  const f = fixture(hashes.bcrypt), args = f.args(NEXT);
  Object.assign(f.state.user, fields);
  const before = baseline(f);
  await rejects(f.service.change(args), code);
  assert.deepEqual(f.state, before);
});
test("missing user fails closed", async () => {
  const f = fixture(hashes.bcrypt); f.state.user = null;
  await rejects(f.service.change({ usuarioId: 7, expectedAuthVersion: 3, newPassword: NEXT }), "AUTH_PASSWORD_STATE");
});
test("caller version must match the current server version", async () => {
  const f = fixture(hashes.bcrypt);
  await rejects(f.service.prepare({ ...f.args(NEXT), expectedAuthVersion: 2 }), "AUTH_PASSWORD_STALE");
});
test("last valid version increment is accepted without reducing or resetting version", async () => {
  const f = fixture(hashes.bcrypt); f.state.user.auth_version = 2147483646;
  await f.service.change(f.args(NEXT));
  assert.equal(f.state.user.auth_version, 2147483647);
});
for (const kind of ["corrupt hash", "excess history", "invalid identity", "invalid revision"]) test("unknown/corrupt historical state denies preparation / " + kind, async () => {
  const f = fixture(hashes.bcrypt);
  f.addHistory(hashes.bcrypt);
  if (kind === "corrupt hash") f.state.history[0].senha_hash = "CANARY_INVALID_HASH";
  if (kind === "excess history") for (let i = 0; i < 4; i++) f.addHistory(hashes.bcrypt);
  if (kind === "invalid identity") f.state.history[0].id = "0";
  if (kind === "invalid revision") f.state.history[0].history_revision = "0";
  const before = baseline(f);
  await rejects(f.service.change(f.args(NEXT)), kind === "corrupt hash" ? "PASSWORD_INVALID_STORED_HASH" : "AUTH_PASSWORD_STATE");
  assert.deepEqual(f.state, before);
});
for (const [label, mutate] of [
  ["hash without version", f => f.bump({ senha: hashes.argon2id })],
  ["version", f => f.bump({ auth_version: 4 })],
  ["deleted", f => f.bump({ deleted_at: "2026-10-16" })],
  ["personal context", f => f.bump({ email: "new@example.invalid" })],
  ["hash ABA", f => { f.bump({ senha: hashes.argon2id }); f.bump({ senha: hashes.bcrypt }); }],
  ["history inserted", f => f.addHistory(hashes.bcrypt)],
  ["history removed", f => { f.state.history = []; }],
  ["history revision ABA", f => { const h = f.state.history[0], original = h.senha_hash; h.senha_hash = hashes.bcrypt; h.senha_hash = original; h.history_revision = "999"; }],
]) test("state changed after crypto snapshot demands fresh preparation / " + label, async () => {
  const f = fixture(hashes.bcrypt);
  f.addHistory(hashes.argon2id);
  const handle = await f.service.prepare(f.args(NEXT));
  mutate(f); const before = baseline(f);
  await assert.rejects(f.service.mutate(handle), error => ["AUTH_PASSWORD_STALE", "AUTH_PASSWORD_STATE"].includes(error.code));
  assert.deepEqual(f.state, before);
  await rejects(f.service.mutate(handle), "AUTH_PASSWORD_PREPARATION");
});
test("change during real crypto preparation is rejected, including same-hash same-version ABA", async () => {
  let f;
  f = fixture(hashes.bcrypt, { passwords: {
    async createNewPasswordHash(...args) {
      assert.equal(f.active, 0);
      const nextHash = await passwords.createNewPasswordHash(...args);
      f.bump({ senha: hashes.argon2id }); f.bump({ senha: hashes.bcrypt });
      return nextHash;
    },
    verifyPassword: passwords.verifyPassword,
  } });
  await rejects(f.service.change(f.args(NEXT)), "AUTH_PASSWORD_STALE");
  assert.equal(f.state.user.senha, hashes.bcrypt);
  assert.equal(f.state.user.auth_version, 3);
  assert.equal(f.state.history.length, 0);
});
test("two model writers based on one state have exactly one winner; no retry or lost update", async () => {
  const f = fixture(hashes.bcrypt);
  const a = await f.service.prepare(f.args(NEXT));
  const b = await f.service.prepare(f.args("Marfim! Lagoa 51 Cristal verde"));
  const results = await Promise.allSettled([f.service.mutate(a), f.service.mutate(b)]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(results.find(r => r.status === "rejected").reason.code, "AUTH_PASSWORD_STALE");
  assert.equal(f.state.user.auth_version, 4);
  assert.equal(f.state.history.length, 1);
  assert.equal(f.state.audits.length, 1);
});
test("authorization is checked again under mutation lock and cannot be a cached client boolean", async () => {
  const f = fixture(hashes.bcrypt), before = baseline(f);
  const handle = await f.service.prepare(f.args(NEXT));
  f.allowMutate = false;
  await rejects(f.service.mutate(handle), "AUTH_PASSWORD_DENIED");
  assert.deepEqual(f.state, before);
  assert.equal(f.calls.some(c => c.tag === "update"), false);
});
test("authorization during preparation is required", async () => {
  const f = fixture(hashes.bcrypt), before = baseline(f); f.allowPrepare = false;
  await rejects(f.service.change(f.args(NEXT)), "AUTH_PASSWORD_DENIED");
  assert.deepEqual(f.state, before);
});
test("authorizer cannot change server context after final revalidation", async () => {
  const f = fixture(hashes.bcrypt, { authorize: async (decision, tx) => {
    if (decision.phase === "mutate") tx.model.state.user.nome = "Other Current Name";
    return true;
  } });
  const before = baseline(f);
  await rejects(f.service.change(f.args(NEXT)), "AUTH_PASSWORD_STALE");
  assert.deepEqual(f.state, before);
});
test("configuration requires explicit trusted authorizer, db.tx, canonical crypto and critical audit", () => {
  for (const missing of ["db", "authorize", "registrarAuditoria", "passwords"]) {
    const args = { db: { tx() {} }, authorize() {}, registrarAuditoria() {}, passwords };
    args[missing] = null;
    assert.throws(() => createPasswordMutationService(args), { code: "AUTH_PASSWORD_CONFIG" });
  }
});
test("preparations are private, instance-bound, discarded and single use", async () => {
  const f = fixture(hashes.bcrypt), other = fixture(hashes.bcrypt);
  const handle = await f.service.prepare(f.args(NEXT));
  await rejects(other.service.mutate(handle), "AUTH_PASSWORD_PREPARATION");
  await rejects(f.service.mutate({ usuarioId: 7, nextHash: hashes.argon2id }), "AUTH_PASSWORD_PREPARATION");
  assert.equal(f.service.discard(handle), true);
  await rejects(f.service.mutate(handle), "AUTH_PASSWORD_PREPARATION");
  const next = await f.service.prepare(f.args(NEXT));
  await f.service.mutate(next);
  await rejects(f.service.mutate(next), "AUTH_PASSWORD_PREPARATION");
});
test("all sessions including current are revoked, canonical audit shares tx, other account survives", async () => {
  const f = fixture(hashes.bcrypt);
  await f.service.change(f.args(NEXT));
  assert.ok(f.state.sessions.filter(s => s.usuario_id === 7).every(s => s.revogada_em && s.motivo_revogacao === "password_changed"));
  assert.equal(f.state.sessions.find(s => s.usuario_id === 8).revogada_em, null);
  assert.deepEqual(f.state.contexts, [{ usuario_id: 8 }]);
  assert.deepEqual(f.state.proofs, [{ usuario_id: 8 }]);
  const mutation = f.calls.find(c => c.tag === "update");
  assert.equal(f.auditExecutor, mutation.executor);
  assert.equal(f.calls.find(c => c.tag === "revoke").executor, mutation.executor);
  assert.equal(f.auditArgs.critica, true);
  assert.equal(f.auditArgs.acao, "alterar");
  assert.equal(f.auditArgs.severidade, "info");
  assert.equal(f.auditArgs.req, undefined);
  assert.deepEqual(f.auditArgs.detalhes, { origem: "mutacao_senha_central" });
  const meta = JSON.stringify(f.state.audits);
  for (const secret of [OLD, NEXT, hashes.bcrypt, f.state.user.senha, f.state.user.cpf, f.state.user.email]) {
    assert.equal(meta.includes(secret), false);
  }
  assert.ok(f.calls.filter(c => ["user", "history", "update", "archive"].includes(c.tag)).every(c => !c.facade));
});
test("zero active sessions is a valid complete revocation", async () => {
  const f = fixture(hashes.bcrypt); f.state.sessions = [];
  await f.service.change(f.args(NEXT));
  assert.equal(f.state.audits.length, 1);
});
for (const step of ["set", "savepoint", "transaction", "user", "history", "update", "revoke", "archive", "prune", "audit", "release", "commit"])
test("any intermediate failure restores every modeled effect / " + step, async t => {
  const f = fixture(hashes.bcrypt);
  for (let i = 0; i < 4; i++) f.addHistory(hashes.argon2id);
  const handle = await f.service.prepare(f.args(NEXT)), before = baseline(f);
  if (step === "commit") f.failCommit = true;
  else f.fail = step;
  t.mock.method(console, "error", () => {});
  await assert.rejects(f.service.mutate(handle), error => {
    assert.ok(["AUTH_PASSWORD_FAILURE", "AUTH_PASSWORD_TRANSACTION"].includes(error.code));
    assert.equal(util.inspect(error).includes("CANARY"), false);
    assert.equal(JSON.stringify(error).includes(hashes.bcrypt), false);
    return true;
  });
  assert.deepEqual(f.state, before);
});
for (const operation of ["createNewPasswordHash", "verifyPassword"]) test("crypto failure has no DB mutation or leaked cause / " + operation, async () => {
  const f = fixture(hashes.bcrypt, { passwords: { ...passwords,
    [operation]: async () => { throw new Error("CANARY_CRYPTO " + NEXT + hashes.bcrypt); } } });
  const before = baseline(f);
  await assert.rejects(f.service.change(f.args(NEXT)), error => error.code === "AUTH_PASSWORD_FAILURE" && !util.inspect(error).includes("CANARY"));
  assert.deepEqual(f.state, before);
});
test("malformed audit success cannot commit", async () => {
  for (const result of [{ ok: false }, { ok: true }, { ok: true, data: {} }]) {
    const f = fixture(hashes.bcrypt), before = baseline(f); f.auditResult = result;
    await rejects(f.service.change(f.args(NEXT)), "AUTH_PASSWORD_FAILURE");
    assert.deepEqual(f.state, before);
  }
});
test("external transaction stages mutation and operation together with no nested db.tx", async () => {
  const f = fixture(hashes.bcrypt);
  const handle = await f.service.prepare(f.args(NEXT));
  await f.db.tx(async tx => {
    const before = f.transactions;
    const result = await f.service.mutate(handle, tx);
    assert.equal(result.status, "staged");
    assert.equal(f.transactions, before);
    assert.equal(f.state.user.senha, hashes.bcrypt);
    tx.model.state.operation = "operation-staged";
    assert.equal(tx.model.state.user.auth_version, 4);
  });
  assert.equal(f.state.user.auth_version, 4);
  assert.equal(f.state.operation, "operation-staged");
});
test("external caller rollback reverses successful mutation, audit, history and operation", async () => {
  const f = fixture(hashes.bcrypt), before = baseline(f);
  const handle = await f.service.prepare(f.args(NEXT));
  await assert.rejects(f.db.tx(async tx => {
    await f.service.mutate(handle, tx);
    tx.model.state.operation = "must-rollback";
    throw new Error("CALLER_ABORT");
  }), /CALLER_ABORT/);
  assert.deepEqual(f.state, before);
});
test("service savepoint undoes its entire mutation even if caller catches an error", async t => {
  const f = fixture(hashes.bcrypt), before = baseline(f);
  const handle = await f.service.prepare(f.args(NEXT)); f.fail = "audit";
  t.mock.method(console, "error", () => {});
  await f.db.tx(async tx => {
    await rejects(f.service.mutate(handle, tx), "AUTH_PASSWORD_FAILURE");
    assert.deepEqual(tx.model.state, before);
  });
  assert.deepEqual(f.state, before);
});
for (const mode of [{ isolation: "repeatable read", read_only: "off" }, { isolation: "read committed", read_only: "on" }])
test("caller transaction mode must be read committed and read write / " + JSON.stringify(mode), async () => {
  const f = fixture(hashes.bcrypt), before = baseline(f);
  const handle = await f.service.prepare(f.args(NEXT)); f.mode = mode;
  await rejects(f.db.tx(tx => f.service.mutate(handle, tx)), "AUTH_PASSWORD_TRANSACTION");
  assert.deepEqual(f.state, before);
});
for (const executor of [null, {}, { query() {} }]) test("invalid caller executor cannot fall back to independent transaction / " + String(executor), async () => {
  const f = fixture(hashes.bcrypt);
  const handle = await f.service.prepare(f.args(NEXT)), count = f.transactions;
  await rejects(f.service.mutate(handle, executor), "AUTH_PASSWORD_TRANSACTION");
  assert.equal(f.transactions, count);
});
test("request is copied before any await; accessors cannot supply mutable authority", async () => {
  const f = fixture(hashes.bcrypt), args = f.args(NEXT);
  const pending = f.service.prepare(args); args.usuarioId = 8; args.newPassword = "changed";
  const handle = await pending;
  await f.service.mutate(handle);
  assert.equal((await passwords.verifyPassword(NEXT, f.state.user.senha)).authenticated, true);
  const bad = { ...f.args(NEXT) }; Object.defineProperty(bad, "newPassword", { get() { throw new Error("CANARY_GETTER"); } });
  await rejects(f.service.prepare(bad), "AUTH_PASSWORD_INPUT");
});
test("unknown errors including forged typed errors do not reveal dependency messages", async () => {
  const f = fixture(hashes.bcrypt, { authorize: () => { throw new PasswordMutationError("CANARY_DEPENDENCY"); } });
  await assert.rejects(f.service.change(f.args(NEXT)), error => error.code === "AUTH_PASSWORD_FAILURE" && !util.inspect(error).includes("CANARY"));
});
test("existing D2 and reauthentication triggers invalidate changed credentials; source stays external to service", () => {
  for (const [file, table] of [
    ["2026-10-15-auth-contexto-restrito-expand.sql", "auth_contexto_restrito"],
    ["2026-10-15-auth-reautenticacao-expand.sql", "auth_reautenticacao_prova"],
  ]) {
    const sql = fs.readFileSync(path.resolve(__dirname, "../../db/migrations", file), "utf8");
    assert.match(sql, /NEW\.senha IS DISTINCT FROM OLD\.senha/);
    assert.match(sql, /NEW\.auth_version IS DISTINCT FROM OLD\.auth_version/);
    assert.ok(sql.includes("DELETE FROM public." + table));
  }
});

for (const [field, value] of [["usuarioId", 0], ["usuarioId", "7"], ["usuarioId", 2147483648],
  ["expectedAuthVersion", 0], ["expectedAuthVersion", "3"], ["expectedAuthVersion", 2147483648]])
test("invalid identity/version input does not open a transaction / " + field + "/" + value, async () => {
  const f = fixture(hashes.bcrypt);
  await rejects(f.service.prepare({ ...f.args(NEXT), [field]: value }), "AUTH_PASSWORD_INPUT");
  assert.equal(f.transactions, 0);
});
test("invalid current hash is rejected without replacing an unknown credential", async () => {
  const f = fixture("CANARY_INVALID_CURRENT_HASH"), before = baseline(f);
  await rejects(f.service.change(f.args(NEXT)), "PASSWORD_INVALID_STORED_HASH");
  assert.deepEqual(f.state, before);
});
test("history delete/reinsert with identical hash but new identity invalidates preparation", async () => {
  const f = fixture(hashes.bcrypt); f.addHistory(hashes.argon2id);
  const handle = await f.service.prepare(f.args(NEXT));
  f.state.history = []; f.addHistory(hashes.argon2id);
  const before = baseline(f);
  await rejects(f.service.mutate(handle), "AUTH_PASSWORD_STALE");
  assert.deepEqual(f.state, before);
});
