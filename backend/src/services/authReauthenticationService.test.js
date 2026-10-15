"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const bcrypt = require("bcrypt");
const argon2 = require("argon2");
const passwordService = require("./passwordService");
const { createReauthenticationService, PURPOSES } = require("./authReauthenticationService");
const { fixture, COOKIE, OTHER_COOKIE, SID, START, micros, hash } = require("./authReauthentication.fixture");
const denied = action => assert.rejects(action, { code: "AUTH_REAUTH_INVALID" });
const failed = action => assert.rejects(action, { code: "AUTH_REAUTH_FAILURE" });
const password = "SenhaSintetica123!";
let hashes;
test.before(async () => {
  hashes = { bcrypt: await bcrypt.hash(password, 4), argon2id: await argon2.hash(password,
    { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 }) };
});
for (const algorithm of ["bcrypt", "argon2id"]) for (const correct of [true, false])
test("real password verifier / " + algorithm + " / " + correct, async () => {
  const f = fixture({ passwords: passwordService }); f.state.user.senha = hashes[algorithm];
  if (correct) {
    const out = await f.issue({ password });
    assert.match(out.proof, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(out.authorizationGranted, false); assert.equal(out.mfaSatisfied, false);
    assert.equal(micros(out.expiresAt) - micros(START), 300000000n);
    assert.equal(Object.keys(f.state.proofs).length, 1);
    assert.equal(f.state.proofs[hash(out.proof).toString("hex")].consumida_em, null);
  } else { await denied(f.issue({ password: "incorrect" })); assert.equal(Object.keys(f.state.proofs).length, 0); }
  assert.equal(f.state.attempts.length, 1);
});
for (const kind of ["invalid-hash", "crypto-error", "requires-change"])
test("verifier failures never create a proof / " + kind, async () => {
  const f = fixture({ passwords: kind === "invalid-hash" ? passwordService : { verifyPassword: async () => {
    if (kind === "crypto-error") throw new passwordService.PasswordServiceError("PASSWORD_CRYPTO_OPERATION_FAILED", "SECRET_CRYPTO");
    return { authenticated: true, requiresPasswordChange: true };
  } } });
  if (kind === "requires-change") await denied(f.issue()); else await failed(f.issue());
  assert.equal(Object.keys(f.state.proofs).length, 0); assert.equal(f.state.attempts.length, 1);
});
test("real bcrypt 72-byte ambiguity requires change and cannot issue", async () => {
  const f = fixture({ passwords: passwordService }), long = "a".repeat(72);
  f.state.user.senha = await bcrypt.hash(long, 4);
  await denied(f.issue({ password: long })); assert.equal(Object.keys(f.state.proofs).length, 0);
});
for (const update of [{ senha: "new-hash" }, { auth_version: 2 }, { email_version: 2 }, { deleted_at: START }])
test("credential/account change during verification is rejected / " + Object.keys(update)[0], async () => {
  const f = fixture();
  f.passwords.verifyPassword = async () => { f.critical(update); return { authenticated: true, requiresPasswordChange: false }; };
  await denied(f.issue()); assert.equal(Object.keys(f.state.proofs).length, 0);
});
test("legacy hash ABA during verification is rejected by row revision even with unchanged version", async () => {
  const f = fixture();
  f.passwords.verifyPassword = async () => {
    f.critical({ senha: "new-hash" }); f.critical({ senha: "stored-hash" });
    return { authenticated: true, requiresPasswordChange: false };
  };
  await denied(f.issue()); assert.equal(f.state.user.auth_version, 1);
});
for (const [seconds, extra, valid] of [[299, 999999n, true], [300, 0n, false], [300, 1n, false]])
test("strict five-minute boundary / " + seconds + "/" + extra, async () => {
  const f = fixture(), out = await f.issue(); f.at(seconds, extra);
  if (valid) assert.equal((await f.consume(out.proof)).consumed, true); else await denied(f.consume(out.proof));
});
test("single use, exact purpose and no implicit operation authorization", async () => {
  const f = fixture(), out = await f.issue();
  await denied(f.consume(out.proof, { purpose: "alterar_email" }));
  assert.equal((await f.consume(out.proof)).authorizationGranted, false);
  await denied(f.consume(out.proof));
  assert.equal(f.state.operation, null);
});
test("two concurrent model consumers result in exactly one consumption", async () => {
  const f = fixture(), out = await f.issue();
  const results = await Promise.allSettled([f.consume(out.proof), f.consume(out.proof)]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(results.filter(r => r.status === "rejected").length, 1);
});
for (const kind of ["different-session", "revoked", "expired", "absolute", "deleted", "version", "legacy-password", "legacy-email"])
test("current state invalidates proof / " + kind, async () => {
  const f = fixture(), out = await f.issue();
  if (kind === "different-session") return denied(f.consume(out.proof, { cookieToken: OTHER_COOKIE }));
  if (kind === "revoked") f.revoke();
  if (kind === "expired") f.state.sessions[SID].expira_em = f.now();
  if (kind === "absolute") f.state.sessions[SID].limite_absoluto_em = f.now();
  if (kind === "deleted") f.critical({ deleted_at: f.now() });
  if (kind === "version") f.state.user.auth_version = 2; // Even without simulated trigger, compare proof version.
  if (kind === "legacy-password") f.critical({ senha: "legacy-new-hash" });
  if (kind === "legacy-email") f.critical({ email: "synthetic@example.invalid" });
  await denied(f.consume(out.proof));
});
test("valid proof never renews normal session or another proof", async () => {
  const f = fixture(), original = structuredClone(f.state.sessions), out = await f.issue();
  f.at(120); await f.consume(out.proof);
  assert.deepEqual(f.state.sessions, original);
  assert.equal(Object.values(f.state.proofs)[0].expira_em, out.expiresAt);
  assert.equal(f.calls.some(c => /UPDATE public\.auth_sessao/i.test(c.sql)), false);
});
test("caller rollback restores consumption and the sensitive model operation together", async () => {
  const f = fixture(), out = await f.issue();
  await assert.rejects(f.db.tx(async executor => {
    await f.service.consume(executor, { cookieToken: COOKIE, proof: out.proof, purpose: "trocar_senha" });
    executor.model.state.operation = "synthetic-operation";
    throw new Error("ROLLBACK_OPERATION");
  }), /ROLLBACK_OPERATION/);
  assert.equal(f.state.operation, null);
  assert.equal(Object.values(f.state.proofs)[0].consumida_em, null);
  await f.consume(out.proof);
});
for (const step of ["issue", "consume", "audit", "commit"])
test("write/audit/commit failure does not leave a partial proof transition / " + step, async () => {
  const f = fixture();
  if (step === "issue") { f.fail = "issue"; await failed(f.issue()); assert.equal(f.state.attempts.length, 1); }
  else {
    const out = await f.issue();
    if (step === "consume") f.fail = "consume";
    if (step === "audit") f.failAudit = true;
    if (step === "commit") f.failCommit = true;
    if (step === "commit") await assert.rejects(f.consume(out.proof), /SECRET_COMMIT/);
    else await failed(f.consume(out.proof));
    assert.equal(Object.values(f.state.proofs)[0].consumida_em, null);
  }
});
test("audit issuance failure rolls back proof but preserves durable password attempt", async () => {
  const f = fixture(); f.failAudit = true;
  await failed(f.issue()); assert.equal(Object.keys(f.state.proofs).length, 0); assert.equal(f.state.attempts.length, 1);
});
test("wrong passwords consume a shared account window and are denied before further crypto", async () => {
  let calls = 0;
  const f = fixture({ passwords: { verifyPassword: async () => { calls++; return { authenticated: false, requiresPasswordChange: false }; } } });
  for (let i = 0; i < 3; i++) await denied(f.issue());
  await assert.rejects(f.issue(), { code: "AUTH_REAUTH_LIMIT" }); assert.equal(calls, 3);
  // Different live cookie cannot reset the account window.
  await assert.rejects(f.issue({ cookieToken: OTHER_COOKIE }), { code: "AUTH_REAUTH_LIMIT" });
  f.at(899, 999999n); await assert.rejects(f.issue(), { code: "AUTH_REAUTH_LIMIT" });
  f.at(900); await denied(f.issue()); assert.equal(calls, 4);
});
test("concurrent model attempts cannot overbook the last account slot", async () => {
  const f = fixture(); await f.issue(); await f.issue();
  const results = await Promise.allSettled([f.issue(), f.issue()]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(f.state.attempts.length, 3);
});
for (const purpose of [undefined, "arbitrary", "*", "trocar_senha ", "constructor"])
test("controlled purpose registry rejects / " + purpose, async () => {
  const f = fixture(); await denied(f.issue({ purpose })); assert.equal(f.calls.length, 0);
});
for (const profile of ["gestor", "administrador", "diagnostico", "cai_administrador"])
test("password component cannot satisfy privileged MFA / " + profile, async () => {
  const f = fixture(); f.state.profiles.push(profile);
  const out = await f.issue(), consumed = await f.consume(out.proof);
  for (const result of [out, consumed]) {
    assert.equal(result.mfaRequired, true); assert.equal(result.mfaSatisfied, false); assert.equal(result.authorizationGranted, false);
  }
});
for (const args of [{ usuarioId: 8 }, { perfil: "administrador" }, { sessionId: SID },
  { identity: { id: 8, authVersion: 1 } }, { identity: { id: 7, authVersion: 2 } }, { cookieToken: "invalid" }])
test("caller-supplied identity cannot replace server session / " + JSON.stringify(args), async () => {
  const f = fixture(); await denied(f.issue(args)); assert.equal(f.state.attempts.length, 0);
});
test("missing/malformed attempt policy fails closed", () => {
  for (const attemptPolicy of [undefined, {}, { windowMs: 0, maxAccount: 3 }, { windowMs: 1000, maxAccount: 0 }]) {
    assert.throws(() => createReauthenticationService({ db: { tx() {} }, registrarAuditoria() {}, attemptPolicy }), { code: "AUTH_REAUTH_CONFIG" });
  }
});
test("entropy failure rolls back issuance without exposing secrets", async () => {
  const f = fixture({ cryptoApi: { randomUUID: crypto.randomUUID, randomBytes: () => { throw new Error("SECRET_ENTROPY"); } } });
  await failed(f.issue()); assert.equal(Object.keys(f.state.proofs).length, 0); assert.equal(f.state.attempts.length, 1);
});
test("consumer rejects nontransaction executor, wrong transaction and reuse", async () => {
  const f = fixture(), out = await f.issue(), args = { cookieToken: COOKIE, proof: out.proof, purpose: "trocar_senha" };
  await failed(f.service.consume({ query() {} }, args));
  await f.db.tx(async executor => {
    const query = executor.raw.query;
    executor.raw.query = (sql, params) => sql.includes("reauth:transaction") ?
      Promise.resolve({ rows: [{ isolamento: "serializable", somente_leitura: "off" }] }) : query(sql, params);
    await failed(f.service.consume(executor, args));
  });
  await f.db.tx(async executor => {
    await f.service.consume(executor, args);
    await failed(f.service.consume(executor, args));
  });
});
test("SQL contract uses fresh PostgreSQL clock, final validity fences, locks and exact lifetime", async () => {
  const f = fixture(), out = await f.issue(); await f.consume(out.proof);
  for (const tag of ["issue", "consume"]) {
    const sql = f.calls.find(c => c.tag === tag).sql;
    assert.match(sql, /clock_timestamp\(\)/); assert.match(sql, /interval '5 minutes'/);
    assert.match(sql, /s\.expira_em > instant\.now/); assert.match(sql, /s\.revogada_em IS NULL/);
  }
  assert.match(f.calls.find(c => c.tag === "consume").sql, /p\.expira_em > instant\.now/);
  const order = f.calls.filter(c => ["user", "session", "proof"].includes(c.tag)).map(c => c.tag);
  assert.deepEqual(order, ["user", "session", "user", "session", "user", "session", "proof"]);
  for (const tag of ["user", "session", "proof"]) assert.match(f.calls.find(c => c.tag === tag).sql, /FOR UPDATE/);
  assert.equal(f.calls.some(c => /^(BEGIN|COMMIT)\b/.test(c.sql)), false);
  assert.deepEqual(PURPOSES, ["trocar_senha", "alterar_email", "encerrar_conta", "conceder_perfil"]);
});
test("secrets stay out of audit, errors and persisted attempt records", async () => {
  const f = fixture(), out = await f.issue(); await f.consume(out.proof);
  const persisted = JSON.stringify({ audits: f.state.audits, attempts: f.state.attempts });
  for (const secret of [COOKIE, out.proof, "synthetic-password", "stored-hash"]) assert.equal(persisted.includes(secret), false);
  assert.equal(Object.keys(f.state.proofs)[0], hash(out.proof).toString("hex"));
  const bad = fixture(); bad.fail = "issue";
  await assert.rejects(bad.issue(), error => !/SECRET_DB|password=|SELECT|token=/.test(JSON.stringify(error)));
});

test("expiry after final session lock cannot issue a proof", async () => {
  const f = fixture();
  f.onQuery = tag => { if (tag === "issue") f.at(1800); };
  await denied(f.issue()); assert.equal(Object.keys(f.state.proofs).length, 0);
});
test("expiry between proof lock and final consumption fence cannot consume", async () => {
  const f = fixture(), out = await f.issue(); f.at(299, 999999n);
  f.onQuery = tag => { if (tag === "consume") f.at(300); };
  await denied(f.consume(out.proof)); assert.equal(Object.values(f.state.proofs)[0].consumida_em, null);
});
test("concurrent revocation during password verification cannot issue", async () => {
  const f = fixture();
  f.passwords.verifyPassword = async () => { f.revoke(); return { authenticated: true, requiresPasswordChange: false }; };
  await denied(f.issue()); assert.equal(Object.keys(f.state.proofs).length, 0);
});

test("commit failure during issuance returns no secret and leaves only the prior attempt", async () => {
  const f = fixture();
  f.passwords.verifyPassword = async () => { f.failCommit = true; return { authenticated: true, requiresPasswordChange: false }; };
  await failed(f.issue());
  assert.equal(Object.keys(f.state.proofs).length, 0); assert.equal(f.state.attempts.length, 1);
});
test("invalid cookie or revoked session cannot reach password verifier", async () => {
  let verified = 0;
  const f = fixture({ passwords: { verifyPassword: async () => { verified++; return { authenticated: true, requiresPasswordChange: false }; } } });
  f.revoke(); await denied(f.issue());
  await denied(f.issue({ cookieToken: "x".repeat(43) }));
  assert.equal(verified, 0); assert.equal(f.state.attempts.length, 0);
});
