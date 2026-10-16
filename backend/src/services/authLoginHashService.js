"use strict";
const passwordService = require("./passwordService");
const { isValidAuthVersion } = require("../auth/authVersion");
const CODES = new Set(["AUTH_HASH_FAILURE", "AUTH_HASH_CHANGED", "AUTH_HASH_REQUIRED_CHANGE", "AUTH_HASH_CONFIG"]);
class LoginHashError extends Error {
  constructor(code = "AUTH_HASH_FAILURE") { super(code); this.name = "LoginHashError"; this.code = code; }
}
function fail(code) { throw new LoginHashError(code); }
function safe(error) {
  return new LoginHashError(error instanceof LoginHashError && CODES.has(error.code) ? error.code : "AUTH_HASH_FAILURE");
}
function raw(tx) {
  if (!tx?.raw || tx.raw !== tx.client || typeof tx.raw.query !== "function" || tx.pool || tx.tx) fail();
  return tx.raw.query.bind(tx.raw);
}
function snapshot(user) {
  if (!Number.isInteger(user?.id) || user.id < 1 || user.id > 2147483647 ||
      !isValidAuthVersion(user.auth_version) || typeof user.senha !== "string" || !user.senha ||
      user.deleted_at !== null || (typeof user.perfil !== "string" || !["usuario", "organizador", "administrador"].includes(user.perfil.trim())) ||
      typeof user.credential_revision !== "string" || !/^[1-9]\d*$/.test(user.credential_revision)) fail();
  return Object.freeze({ id: user.id, senha: user.senha, auth_version: user.auth_version,
    perfil: user.perfil, deleted_at: null, credential_revision: user.credential_revision });
}
function same(a, b) {
  return Object.keys(a).every(key => a[key] === b[key]);
}
function createLoginHashService({ db, registrarAuditoria, passwords = passwordService } = {}) {
  if (typeof db?.tx !== "function" || typeof registrarAuditoria !== "function" ||
      ["verifyPassword", "upgradeLegacyPasswordHash", "rehashAuthenticatedPassword"].some(k => typeof passwords?.[k] !== "function")) {
    fail("AUTH_HASH_CONFIG");
  }
  async function read(tx, id) {
    const result = await raw(tx)(`/* login-hash:user */ SELECT id, senha, auth_version, perfil, deleted_at,
      xmin::text AS credential_revision FROM public.usuarios WHERE id = $1 FOR UPDATE`, [id]);
    if (result?.rows?.length !== 1) fail("AUTH_HASH_CHANGED");
    const u = result.rows[0];
    if (u.deleted_at !== null) fail("AUTH_HASH_CHANGED");
    return snapshot(u);
  }
  async function prepare(user, password) {
    try {
      const expected = snapshot(user);
      const verified = await passwords.verifyPassword(password, expected.senha);
      if (verified.authenticated !== true) fail("AUTH_HASH_CHANGED");
      if (verified.requiresPasswordChange !== false) fail("AUTH_HASH_REQUIRED_CHANGE");
      let nextHash = null, kind = "current";
      if (verified.algorithm === "bcrypt") {
        if (verified.canUpgrade !== true || Buffer.byteLength(password, "utf8") >= 72) fail("AUTH_HASH_REQUIRED_CHANGE");
        nextHash = await passwords.upgradeLegacyPasswordHash(password, expected.senha);
        kind = "upgraded_bcrypt";
      } else if (verified.algorithm === "argon2id") {
        if (verified.needsRehash === true) {
          nextHash = await passwords.rehashAuthenticatedPassword(password, expected.senha);
          kind = "rehashed_argon2id";
        } else if (verified.needsRehash !== false) fail();
      } else fail();
      let used = false;
      // Closure retains only snapshots/hash and one-use state, never an exposed password/hash object.
      return async function credentialGuard(tx) {
        try {
          if (used) fail(); used = true;
          const q = raw(tx);
          const mode = await q(`/* login-hash:mode */ SELECT current_setting('transaction_isolation') AS isolation,
            current_setting('transaction_read_only') AS read_only`);
          if (mode?.rows?.length !== 1 || mode.rows[0].isolation !== "read committed" || mode.rows[0].read_only !== "off") fail();
          await q("SET LOCAL lock_timeout = '2s'");
          await q("SET LOCAL statement_timeout = '5s'");
          if (!same(expected, await read(tx, expected.id))) fail("AUTH_HASH_CHANGED");
          if (nextHash === null) return Object.freeze({ status: "current" });
          // user -> ALL existing sessions: immediate FKs serialize even a direct
          // D2/proof insertion on an existing session during this decision.
          const sessions = await q(`/* login-hash:sessions */ SELECT id FROM public.auth_sessao
            WHERE usuario_id = $1 ORDER BY id FOR UPDATE`, [expected.id]);
          if (!Array.isArray(sessions?.rows)) fail();
          const state = await q(`/* login-hash:security */ SELECT EXISTS (
            SELECT 1 FROM public.auth_contexto_restrito c JOIN public.auth_sessao s ON s.id = c.sessao_id
              WHERE s.usuario_id = $1) AS has_context,
            EXISTS (SELECT 1 FROM public.auth_reautenticacao_prova WHERE usuario_id = $1) AS has_proof`, [expected.id]);
          const security = state?.rows?.[0];
          if (state?.rows?.length !== 1 || typeof security.has_context !== "boolean" || typeof security.has_proof !== "boolean") fail();
          // Conservative: preserve even expired/consumed records; never delete,
          // disable a trigger, or reconstruct a previously invalidated context.
          if (security.has_context || security.has_proof) return Object.freeze({ status: "deferred_security_state" });
          const updated = await q(`/* login-hash:update */ UPDATE public.usuarios SET senha = $1
            WHERE id = $2 AND senha = $3 AND auth_version = $4 AND xmin::text = $5
              AND deleted_at IS NULL AND perfil = $6
            RETURNING id, auth_version, xmin::text AS credential_revision`,
          [nextHash, expected.id, expected.senha, expected.auth_version, expected.credential_revision, expected.perfil]);
          const row = updated?.rows?.[0];
          if (updated?.rowCount !== 1 || updated.rows?.length !== 1 || row.id !== expected.id ||
              row.auth_version !== expected.auth_version || typeof row.credential_revision !== "string" ||
              !/^[1-9]\d*$/.test(row.credential_revision) || row.credential_revision === expected.credential_revision) fail();
          // Revisions and audit-row xmin bind recovery to a committed technical
          // transition. No credential/hash fingerprint or request payload stored.
          const audit = await registrarAuditoria({ usuario_id: expected.id, acao: "alterar", modulo: "auth",
            entidade: "usuarios", entidade_id: expected.id, sucesso: true, severidade: "info", critica: true,
            detalhes: { origem: "rehash_tecnico_login", tipo: kind, auth_version: expected.auth_version,
              revisao_anterior: expected.credential_revision, revisao_nova: row.credential_revision } }, tx);
          if (audit?.ok !== true || !audit.data?.id) fail();
          return Object.freeze({ status: kind });
        } catch (error) { throw safe(error); } // createSession's db.tx MUST roll back on every guard failure.
      };
    } catch (error) { throw safe(error); }
  }
  async function recover(user, password) {
    try {
      const original = snapshot(user);
      const current = await db.tx(async tx => {
        const q = raw(tx);
        await q("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
        await q("SET LOCAL lock_timeout = '2s'");
        await q("SET LOCAL statement_timeout = '5s'");
        const u = await read(tx, original.id);
        if (u.auth_version !== original.auth_version || u.perfil !== original.perfil ||
            u.senha === original.senha || u.credential_revision === original.credential_revision) fail("AUTH_HASH_CHANGED");
        const proof = await q(`/* login-hash:provenance */ SELECT EXISTS (
          SELECT 1 FROM public.auditoria_eventos a
          WHERE a.usuario_id = $1 AND a.acao = 'alterar' AND a.modulo = 'auth'
            AND a.entidade = 'usuarios' AND a.entidade_id = $1::text AND a.sucesso = true
            AND a.detalhes->>'origem' = 'rehash_tecnico_login'
            AND a.detalhes->>'tipo' IN ('upgraded_bcrypt', 'rehashed_argon2id')
            AND a.detalhes->>'revisao_anterior' = $2 AND a.detalhes->>'revisao_nova' = $3
            AND a.detalhes->>'auth_version' = $4::text AND a.xmin::text = $3) AS proven`,
        [original.id, original.credential_revision, u.credential_revision, original.auth_version]);
        if (proof?.rows?.length !== 1 || proof.rows[0].proven !== true) fail("AUTH_HASH_CHANGED");
        return u;
      });
      // Fresh verification outside locks; an audit marker alone never authenticates.
      const verified = await passwords.verifyPassword(password, current.senha);
      if (verified.authenticated !== true || verified.algorithm !== "argon2id" ||
          verified.requiresPasswordChange !== false || verified.needsRehash !== false) fail("AUTH_HASH_CHANGED");
      const guard = await prepare(current, password);
      return async tx => {
        const result = await guard(tx); // Exact new revision is checked before any session effects.
        if (result.status !== "current") fail();
        return Object.freeze({ status: "concurrent_upgrade" });
      };
    } catch (error) { throw safe(error); }
  }
  return Object.freeze({ prepare, recover });
}
module.exports = { createLoginHashService, LoginHashError };
