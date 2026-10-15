"use strict";

const crypto = require("node:crypto");
const passwordService = require("./passwordService");
const { isValidAuthVersion } = require("../auth/authVersion");
const { validProfiles } = require("../auth/sessionAuthorization");
const PURPOSES = Object.freeze(["trocar_senha", "alterar_email", "encerrar_conta", "conceder_perfil"]);
const MFA_PROFILES = new Set(["gestor", "administrador", "diagnostico", "cai_administrador"]);
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STAMP = "'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"'";
class ReauthenticationError extends Error {
  constructor(code = "AUTH_REAUTH_FAILURE") { super(code); this.code = code; }
}
function fail(code = "AUTH_REAUTH_INVALID") { throw new ReauthenticationError(code); }
function exact(value, keys) {
  return value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype &&
    Reflect.ownKeys(value).every(key => keys.includes(key) && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), "value"));
}
function one(result) {
  if (!Array.isArray(result?.rows) || result.rows.length !== 1) fail();
  return result.rows[0];
}
function raw(executor) {
  if (!executor?.raw || executor.raw !== executor.client || typeof executor.raw.query !== "function" ||
      executor.pool || executor.tx) fail("AUTH_REAUTH_FAILURE");
  return executor.raw.query.bind(executor.raw);
}
function request(args, operation) {
  if (!exact(args, ["cookieToken", "identity", ...(operation === "issue" ? ["password", "purpose"] :
    operation === "consume" ? ["proof", "purpose"] : [])]) ||
      typeof args.cookieToken !== "string" || !TOKEN.test(args.cookieToken)) fail();
  let identity = null;
  if (args.identity != null) {
    if (!exact(args.identity, ["id", "authVersion", "sessionId"]) ||
        !Number.isSafeInteger(args.identity.id) || args.identity.id <= 0 ||
        !isValidAuthVersion(args.identity.authVersion) ||
        (args.identity.sessionId !== undefined && !UUID.test(args.identity.sessionId))) fail();
    identity = Object.freeze({ ...args.identity });
  }
  if (operation !== "authenticate" && !PURPOSES.includes(args.purpose)) fail();
  if (operation === "issue" && (typeof args.password !== "string" || !args.password)) fail();
  if (operation === "consume" && (typeof args.proof !== "string" || !TOKEN.test(args.proof))) fail();
  return Object.freeze({ ...args, identity }); // No caller mutation across awaits.
}
function positive(value) { return Number.isSafeInteger(value) && value > 0 && value <= 2147483647; }
function validateAttemptPolicy(policy) {
  if (!exact(policy, ["windowMs", "maxAccount"]) || !positive(policy.windowMs) || !positive(policy.maxAccount)) {
    fail("AUTH_REAUTH_CONFIG");
  }
  return Object.freeze({ ...policy });
}
function createReauthenticationService({ db, registrarAuditoria, attemptPolicy, cryptoApi = crypto,
  passwords = passwordService } = {}) {
  if (typeof db?.tx !== "function" || typeof registrarAuditoria !== "function" ||
      typeof passwords?.verifyPassword !== "function") fail("AUTH_REAUTH_CONFIG");
  const policy = validateAttemptPolicy(attemptPolicy);
  const usedExecutors = new WeakSet();
  const digest = token => crypto.createHash("sha256").update(token, "utf8").digest();
  async function ownTransaction(action) {
    return db.tx(async executor => {
      const q = raw(executor);
      await q("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
      await q("SET LOCAL lock_timeout = '2s'");
      await q("SET LOCAL statement_timeout = '5s'");
      return action(executor);
    });
  }
  async function locked(executor, req) {
    const q = raw(executor), hash = digest(req.cookieToken);
    const hint = one(await q(`/* reauth:hint */ SELECT id, usuario_id FROM public.auth_sessao WHERE token_hash = $1`, [hash]));
    if (typeof hint.id !== "string" || !UUID.test(hint.id) || !Number.isSafeInteger(hint.usuario_id) ||
        hint.usuario_id <= 0 || hint.usuario_id > 2147483647) fail();
    if (req.identity && (hint.usuario_id !== req.identity.id ||
        (req.identity.sessionId && req.identity.sessionId !== hint.id))) fail();
    // Compatible with D2/reset: user -> session -> proof. Never lock a proof first.
    const user = one(await q(`/* reauth:user */ SELECT id, senha, auth_version, email_version, deleted_at,
      xmin::text AS credential_revision FROM public.usuarios WHERE id = $1 FOR UPDATE`, [hint.usuario_id]));
    if (user.id !== hint.usuario_id || user.deleted_at !== null || !isValidAuthVersion(user.auth_version) ||
        !isValidAuthVersion(user.email_version) || typeof user.credential_revision !== "string" ||
        !user.credential_revision || (req.identity && req.identity.authVersion !== user.auth_version)) fail();
    const profilesResult = await q(`/* reauth:profiles */ SELECT perfil_codigo FROM public.auth_usuario_perfis
      WHERE usuario_id = $1 ORDER BY perfil_codigo`, [user.id]);
    if (!Array.isArray(profilesResult?.rows)) fail();
    const profiles = profilesResult.rows.map(row => row.perfil_codigo);
    if (!validProfiles(profiles)) fail();
    const session = one(await q(`/* reauth:session */ SELECT id, usuario_id FROM public.auth_sessao
      WHERE id = $1::uuid AND usuario_id = $2 AND token_hash = $3 FOR UPDATE`, [hint.id, user.id, hash]));
    if (session.id !== hint.id || session.usuario_id !== user.id) fail();
    // Clock read AFTER all waits, independent of touch eligibility. No session renewal.
    const valid = one(await q(`/* reauth:valid */ SELECT EXISTS (SELECT 1 FROM public.auth_sessao
      WHERE id = $1::uuid AND usuario_id = $2 AND token_hash = $3 AND revogada_em IS NULL
        AND criada_em <= clock_timestamp() AND ultimo_uso_em <= clock_timestamp()
        AND expira_em > clock_timestamp()
        AND (limite_absoluto_em IS NULL OR limite_absoluto_em > clock_timestamp())) AS valid`, [session.id, user.id, hash]));
    if (valid.valid !== true) fail();
    return { user, session, hash, mfaRequired: profiles.some(profile => MFA_PROFILES.has(profile)) };
  }
  async function audit(executor, state, purpose, action) {
    const result = await registrarAuditoria({ usuario_id: state.user.id, acao: action, modulo: "auth",
      critica: true, detalhes: { finalidade: purpose, componente: "senha" } }, executor);
    if (result?.ok !== true) fail("AUTH_REAUTH_FAILURE");
  }
  async function authenticate(args) {
    try {
      const req = request(args, "authenticate");
      return await ownTransaction(async executor => {
        const state = await locked(executor, req);
        return Object.freeze({ id: state.user.id, sessionId: state.session.id,
          authVersion: state.user.auth_version, mfaRequired: state.mfaRequired });
      });
    } catch (error) { if (error instanceof ReauthenticationError) throw error; fail("AUTH_REAUTH_FAILURE"); }
  }
  async function issue(args) {
    try {
      const req = request(args, "issue");
      // Durable reservation BEFORE crypto, in a separate transaction: wrong passwords count too.
      const snapshot = await ownTransaction(async executor => {
        const state = await locked(executor, req);
        const reservation = await raw(executor)(`/* reauth:reserve */ WITH instant AS MATERIALIZED (
          SELECT clock_timestamp() AS now
        ) INSERT INTO public.auth_reautenticacao_tentativa (id, usuario_id, registrada_em)
          SELECT $1::uuid, $2, instant.now FROM instant
          WHERE (SELECT count(*) FROM public.auth_reautenticacao_tentativa
            WHERE usuario_id = $2 AND registrada_em > instant.now - $3::bigint * interval '1 millisecond') < $4
          RETURNING id`, [cryptoApi.randomUUID(), state.user.id, policy.windowMs, policy.maxAccount]);
        if (reservation.rowCount !== 1) fail("AUTH_REAUTH_LIMIT");
        return { ...state.user, sessionId: state.session.id };
      });
      const verified = await passwords.verifyPassword(req.password, snapshot.senha);
      if (verified?.authenticated !== true || verified.requiresPasswordChange !== false) fail();
      return await ownTransaction(async executor => {
        const state = await locked(executor, req), user = state.user;
        if (user.id !== snapshot.id || state.session.id !== snapshot.sessionId || user.senha !== snapshot.senha ||
            user.auth_version !== snapshot.auth_version || user.email_version !== snapshot.email_version ||
            user.credential_revision !== snapshot.credential_revision) fail(); // Includes legacy ABA changes.
        const secret = cryptoApi.randomBytes(32);
        if (!Buffer.isBuffer(secret) || secret.length !== 32) fail("AUTH_REAUTH_FAILURE");
        const proof = secret.toString("base64url"); secret.fill(0);
        const inserted = await raw(executor)(`/* reauth:issue */ WITH instant AS MATERIALIZED (SELECT clock_timestamp() AS now)
          INSERT INTO public.auth_reautenticacao_prova
            (token_hash, sessao_id, usuario_id, auth_version_esperada, finalidade, criada_em, expira_em)
          SELECT $1, s.id, u.id, u.auth_version, $2, instant.now, instant.now + interval '5 minutes'
          FROM instant, public.auth_sessao s, public.usuarios u
          WHERE s.id = $3::uuid AND s.usuario_id = u.id AND u.id = $4 AND s.token_hash = $5
            AND u.auth_version = $6 AND u.deleted_at IS NULL AND s.revogada_em IS NULL
            AND s.criada_em <= instant.now AND s.ultimo_uso_em <= instant.now AND s.expira_em > instant.now
            AND (s.limite_absoluto_em IS NULL OR s.limite_absoluto_em > instant.now)
          RETURNING to_char(expira_em AT TIME ZONE 'UTC', ${STAMP}) AS expira_em`,
        [digest(proof), req.purpose, state.session.id, user.id, state.hash, user.auth_version]);
        if (inserted.rowCount !== 1) fail();
        const expiresAt = one(inserted).expira_em;
        if (typeof expiresAt !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/.test(expiresAt)) fail();
        await audit(executor, state, req.purpose, "AUTH_REAUTH_ISSUED");
        return Object.freeze({ proof, purpose: req.purpose, expiresAt, passwordVerified: true,
          authorizationGranted: false, mfaRequired: state.mfaRequired, mfaSatisfied: false });
      });
    } catch (error) { if (error instanceof ReauthenticationError) throw error; fail("AUTH_REAUTH_FAILURE"); }
  }
  async function consume(executor, args) {
    let q, savepoint = false;
    try {
      const req = request(args, "consume"); q = raw(executor);
      if (usedExecutors.has(executor)) fail("AUTH_REAUTH_FAILURE");
      usedExecutors.add(executor); // One proof per caller-owned transaction, before sensitive-operation locks.
      await q("SAVEPOINT auth_reauth_guard"); savepoint = true;
      const mode = one(await q(`/* reauth:transaction */ SELECT current_setting('transaction_isolation') AS isolamento,
        current_setting('transaction_read_only') AS somente_leitura`));
      if (mode.isolamento !== "read committed" || mode.somente_leitura !== "off") fail("AUTH_REAUTH_FAILURE");
      const state = await locked(executor, req);
      one(await q(`/* reauth:proof */ SELECT token_hash FROM public.auth_reautenticacao_prova
        WHERE token_hash = $1 AND sessao_id = $2::uuid AND usuario_id = $3 AND finalidade = $4 FOR UPDATE`,
      [digest(req.proof), state.session.id, state.user.id, req.purpose]));
      const changed = await q(`/* reauth:consume */ WITH instant AS MATERIALIZED (SELECT clock_timestamp() AS now)
        UPDATE public.auth_reautenticacao_prova p SET consumida_em = instant.now
        FROM instant, public.auth_sessao s, public.usuarios u
        WHERE p.token_hash = $1 AND p.finalidade = $2 AND p.sessao_id = $3::uuid AND p.usuario_id = $4
          AND s.id = p.sessao_id AND s.usuario_id = p.usuario_id AND s.token_hash = $5 AND u.id = s.usuario_id
          AND p.auth_version_esperada = u.auth_version AND u.auth_version = $6 AND u.deleted_at IS NULL
          AND p.consumida_em IS NULL AND p.criada_em <= instant.now AND p.expira_em > instant.now
          AND p.expira_em = p.criada_em + interval '5 minutes' AND s.revogada_em IS NULL
          AND s.criada_em <= instant.now AND s.ultimo_uso_em <= instant.now AND s.expira_em > instant.now
          AND (s.limite_absoluto_em IS NULL OR s.limite_absoluto_em > instant.now)
        RETURNING p.finalidade`, [digest(req.proof), req.purpose, state.session.id, state.user.id, state.hash, state.user.auth_version]);
      if (changed.rowCount !== 1) fail();
      await audit(executor, state, req.purpose, "AUTH_REAUTH_CONSUMED");
      await q("RELEASE SAVEPOINT auth_reauth_guard"); savepoint = false;
      return Object.freeze({ consumed: true, purpose: req.purpose, passwordVerified: true,
        authorizationGranted: false, mfaRequired: state.mfaRequired, mfaSatisfied: false });
    } catch (error) {
      if (savepoint) {
        try { await q("ROLLBACK TO SAVEPOINT auth_reauth_guard"); await q("RELEASE SAVEPOINT auth_reauth_guard"); }
        catch { fail("AUTH_REAUTH_FAILURE"); } // Caller MUST roll back on any failure; no hidden commit.
      }
      if (error instanceof ReauthenticationError) throw error;
      fail("AUTH_REAUTH_FAILURE");
    }
  }
  return Object.freeze({ authenticate, issue, consume });
}
module.exports = { createReauthenticationService, ReauthenticationError, PURPOSES, validateAttemptPolicy };
