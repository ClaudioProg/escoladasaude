"use strict";

const passwordService = require("./passwordService");
const { normalizeNewPassword } = require("./passwordStructure");
const { isValidAuthVersion } = require("../auth/authVersion");
const { createAuthSessionService } = require("./authSessionService");

const POLICY_ERRORS = new Set(["PASSWORD_INVALID_TYPE", "PASSWORD_INVALID_UNICODE", "PASSWORD_TOO_SHORT",
  "PASSWORD_TOO_LONG", "PASSWORD_TOO_MANY_BYTES", "PASSWORD_INVALID_CONTEXT", "PASSWORD_TOO_COMMON",
  "PASSWORD_PREDICTABLE", "PASSWORD_PERSONAL_DATA", "PASSWORD_POLICY_OPERATION_FAILED",
  "PASSWORD_CRYPTO_OPERATION_FAILED", "PASSWORD_INVALID_STORED_HASH", "PASSWORD_INVALID_INPUT"]);

const MUTATION_ERRORS = new Set(["AUTH_PASSWORD_FAILURE", "AUTH_PASSWORD_TRANSACTION", "AUTH_PASSWORD_INPUT",
  "AUTH_PASSWORD_CONFIG", "AUTH_PASSWORD_STATE", "AUTH_PASSWORD_STALE", "AUTH_PASSWORD_DENIED",
  "AUTH_PASSWORD_REUSED", "AUTH_PASSWORD_PREPARATION"]);

class PasswordMutationError extends Error {
  constructor(code) { super(code); this.name = "PasswordMutationError"; this.code = code; }
}
function fail(code = "AUTH_PASSWORD_FAILURE") { throw new PasswordMutationError(code); }
function sanitized(error) {
  if (error instanceof PasswordMutationError && MUTATION_ERRORS.has(error.code)) return new PasswordMutationError(error.code);
  if (error instanceof passwordService.PasswordServiceError && POLICY_ERRORS.has(error.code)) {
    return new PasswordMutationError(error.code);
  }
  return new PasswordMutationError("AUTH_PASSWORD_FAILURE");
}
function exact(value, keys) {
  return value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype &&
    Reflect.ownKeys(value).every(key => keys.includes(key) &&
      Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), "value"));
}
function raw(executor) {
  if (!executor?.raw || executor.raw !== executor.client || typeof executor.raw.query !== "function" ||
      typeof executor.query !== "function" || executor.pool || executor.tx) fail("AUTH_PASSWORD_TRANSACTION");
  return executor.raw.query.bind(executor.raw);
}
function request(args) {
  if (!exact(args, ["usuarioId", "expectedAuthVersion", "newPassword"]) ||
      !Number.isSafeInteger(args.usuarioId) || args.usuarioId < 1 || args.usuarioId > 2147483647 ||
      !isValidAuthVersion(args.expectedAuthVersion)) fail("AUTH_PASSWORD_INPUT");
  return Object.freeze({ ...args });
}

/**
 * Internal, unmounted component. authorize is a TRUSTED server-side dependency,
 * never a value/callback selected by a request. It must demonstrate the future
 * operation's authorization again in phase "mutate", using the supplied tx.
 * No default authorizer, current-password check, reauthentication or HTTP flow.
 *
 * prepare MUST run before the caller opens its mutation transaction/locks.
 * mutate(handle, tx) stages effects; only the caller can commit/rollback its tx.
 * Propagate every error and roll back the whole caller transaction.
 */
function createPasswordMutationService({ db, registrarAuditoria, authorize, passwords = passwordService } = {}) {
  if (typeof db?.tx !== "function" || typeof registrarAuditoria !== "function" ||
      typeof authorize !== "function" || typeof passwords?.createNewPasswordHash !== "function" ||
      typeof passwords?.verifyPassword !== "function") fail("AUTH_PASSWORD_CONFIG");
  const sessions = createAuthSessionService({ db });
  const prepared = new WeakMap();

  async function ownTransaction(action) {
    return db.tx(async executor => {
      const q = raw(executor);
      await q("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
      await q("SET LOCAL lock_timeout = '2s'");
      await q("SET LOCAL statement_timeout = '5s'");
      return action(executor);
    });
  }
  async function readState(executor, req) {
    const q = raw(executor);
    const result = await q(`/* password-mutation:user */ SELECT id, senha, auth_version, deleted_at,
      nome, cpf, email, celular, to_char(data_nascimento, 'YYYY-MM-DD') AS data_nascimento,
      xmin::text AS credential_revision FROM public.usuarios WHERE id = $1 FOR UPDATE`, [req.usuarioId]);
    if (result?.rows?.length !== 1) fail("AUTH_PASSWORD_STATE");
    const user = result.rows[0];
    if (user.id !== req.usuarioId || user.deleted_at !== null || !isValidAuthVersion(user.auth_version) ||
        !isValidAuthVersion(user.auth_version + 1) || typeof user.senha !== "string" || !user.senha ||
        typeof user.credential_revision !== "string" || !/^[1-9]\d*$/.test(user.credential_revision)) {
      fail("AUTH_PASSWORD_STATE");
    }
    if (user.auth_version !== req.expectedAuthVersion) fail("AUTH_PASSWORD_STALE");
    // Lock known rows as well as the parent. FK inserts must take a conflicting
    // parent key-share lock. LIMIT 5 detects corrupt/unsupported history (>4).
    const historyResult = await q(`/* password-mutation:history */ SELECT h.id::text AS id, h.senha_hash,
      h.xmin::text AS history_revision FROM public.auth_senha_historico h
      WHERE h.usuario_id = $1 ORDER BY h.id DESC LIMIT 5 FOR UPDATE`, [user.id]);
    const history = historyResult?.rows;
    if (!Array.isArray(history) || history.length > 4 ||
        history.some(h => typeof h.id !== "string" || !/^[1-9]\d*$/.test(h.id) ||
          typeof h.senha_hash !== "string" || !h.senha_hash ||
          typeof h.history_revision !== "string" || !/^[1-9]\d*$/.test(h.history_revision)) ||
        history.some((h, i) => i > 0 && BigInt(history[i - 1].id) <= BigInt(h.id))) fail("AUTH_PASSWORD_STATE");
    return { user, history };
  }
  async function authorized(phase, req, executor) {
    const decision = await authorize(Object.freeze({ phase, usuarioId: req.usuarioId,
      authVersion: req.expectedAuthVersion }), executor);
    if (decision !== true) fail("AUTH_PASSWORD_DENIED");
  }
  async function prepare(args) {
    try {
      const req = request(args);
      // Structure validation has no DB effects; all personal context below is server-owned.
      const normalized = normalizeNewPassword(req.newPassword);
      const snapshot = await ownTransaction(async executor => {
        const state = await readState(executor, req);
        await authorized("prepare", req, executor);
        return state;
      });
      const context = { nome: snapshot.user.nome, cpf: snapshot.user.cpf, email: snapshot.user.email,
        celular: snapshot.user.celular, dataNascimento: snapshot.user.data_nascimento };
      // All expensive crypto runs AFTER the short snapshot transaction committed.
      const nextHash = await passwords.createNewPasswordHash(req.newPassword, context);
      for (const hash of [snapshot.user.senha, ...snapshot.history.map(h => h.senha_hash)]) {
        // Argon2 normalizes internally; bcrypt compares original bytes. Check both
        // the actual new credential (NFKC) and the presented legacy spelling.
        const effective = await passwords.verifyPassword(normalized, hash);
        if (effective.authenticated === true) fail("AUTH_PASSWORD_REUSED");
        if (normalized !== req.newPassword &&
            (await passwords.verifyPassword(req.newPassword, hash)).authenticated === true) fail("AUTH_PASSWORD_REUSED");
      }
      const handle = Object.freeze(Object.create(null));
      prepared.set(handle, { req: { usuarioId: req.usuarioId, expectedAuthVersion: req.expectedAuthVersion },
        snapshot, nextHash }); // Never retain plaintext; handle exposes no hash or context.
      return handle;
    } catch (error) { throw sanitized(error); }
  }
  async function apply(executor, preparation) {
    const q = raw(executor);
    let guarded = false;
    try {
      await q("SAVEPOINT auth_password_mutation");
      guarded = true;
      const mode = await q(`/* password-mutation:transaction */ SELECT
        current_setting('transaction_isolation') AS isolation,
        current_setting('transaction_read_only') AS read_only`);
      if (mode?.rows?.length !== 1 || mode.rows[0].isolation !== "read committed" ||
          mode.rows[0].read_only !== "off") fail("AUTH_PASSWORD_TRANSACTION");
      const { req, snapshot, nextHash } = preparation;
      const state = await readState(executor, req);
      if (JSON.stringify(state) !== JSON.stringify(snapshot)) fail("AUTH_PASSWORD_STALE");
      await authorized("mutate", req, executor);
      // Authorization may await the future consumer. Recheck all snapshots after
      // it returns, including same-transaction changes made by that consumer.
      if (JSON.stringify(await readState(executor, req)) !== JSON.stringify(snapshot)) fail("AUTH_PASSWORD_STALE");
      const updated = await q(`/* password-mutation:update */ UPDATE public.usuarios
        SET senha = $1, auth_version = auth_version + 1
        WHERE id = $2 AND auth_version = $3 AND senha = $4 AND xmin::text = $5
          AND deleted_at IS NULL AND auth_version < 2147483647 RETURNING id, auth_version`,
      [nextHash, req.usuarioId, req.expectedAuthVersion, snapshot.user.senha, snapshot.user.credential_revision]);
      if (updated?.rowCount !== 1 || updated.rows?.length !== 1 ||
          updated.rows[0].id !== req.usuarioId || updated.rows[0].auth_version !== req.expectedAuthVersion + 1) {
        fail("AUTH_PASSWORD_STALE");
      }
      // Preserve canonical user -> session lock order before touching history.
      const revoked = await sessions.revokeUserSessions(req.usuarioId, "password_changed", null, executor);
      if (!Number.isSafeInteger(revoked?.revoked) || revoked.revoked < 0) fail();
      const inserted = await q(`/* password-mutation:archive */ INSERT INTO public.auth_senha_historico
        (usuario_id, senha_hash) VALUES ($1, $2) RETURNING id::text AS id`, [req.usuarioId, snapshot.user.senha]);
      if (inserted?.rowCount !== 1 || inserted.rows?.length !== 1 ||
          !/^[1-9]\d*$/.test(inserted.rows[0].id) ||
          (snapshot.history[0] && BigInt(inserted.rows[0].id) <= BigInt(snapshot.history[0].id))) fail();
      const removed = await q(`/* password-mutation:prune */ DELETE FROM public.auth_senha_historico
        WHERE usuario_id = $1 AND id IN (SELECT id FROM public.auth_senha_historico
          WHERE usuario_id = $1 ORDER BY id DESC OFFSET 4)`, [req.usuarioId]);
      if (removed?.rowCount !== Math.max(0, snapshot.history.length - 3)) fail();
      const audit = await registrarAuditoria({ usuario_id: req.usuarioId, acao: "alterar", modulo: "auth",
        entidade: "usuarios", entidade_id: req.usuarioId, sucesso: true, severidade: "info", critica: true,
        detalhes: { origem: "mutacao_senha_central" } }, executor);
      if (audit?.ok !== true || !audit.data?.id) fail();
      await q("RELEASE SAVEPOINT auth_password_mutation");
      guarded = false;
      return { usuarioId: req.usuarioId, authVersion: req.expectedAuthVersion + 1 };
    } catch (error) {
      if (guarded) {
        try { await q("ROLLBACK TO SAVEPOINT auth_password_mutation"); await q("RELEASE SAVEPOINT auth_password_mutation"); }
        catch { fail("AUTH_PASSWORD_TRANSACTION"); } // Caller must roll back; never commit after failure.
      }
      throw sanitized(error);
    }
  }
  async function mutate(handle, executor) {
    try {
      const preparation = prepared.get(handle);
      if (!preparation) fail("AUTH_PASSWORD_PREPARATION");
      prepared.delete(handle); // One attempt, including failures; require fresh authorization/preparation.
      const supplied = arguments.length > 1;
      const result = supplied ? await apply(executor, preparation) :
        await ownTransaction(tx => apply(tx, preparation));
      return Object.freeze({ ...result, status: supplied ? "staged" : "committed" });
    } catch (error) { throw sanitized(error); }
  }
  function discard(handle) { return prepared.delete(handle); }
  async function change(args) { return mutate(await prepare(args)); }
  return Object.freeze({ prepare, mutate, discard, change });
}
module.exports = { createPasswordMutationService, PasswordMutationError };
