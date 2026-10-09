"use strict";

const { timingSafeEqual } = require("node:crypto");
const { AuthQuotaError, createQuotaIpHasher, subjectLockKey, exactKeys } = require("./authQuotaIp");

// "AQTA": namespace de duas chaves int4, distinto do runner (1163082829).
const QUOTA_LOCK_NAMESPACE = 0x41515441;
const FINALIDADES = Object.freeze(["confirmacao", "alteracao", "recuperacao"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const usedExecutors = new WeakSet();

function fail(code) { throw new AuthQuotaError(code); }
function rows(result) {
  if (!result || !Array.isArray(result.rows)) fail("AUTH_QUOTA_DB_RESULTADO_INVALIDO");
  return result.rows;
}
function one(result) {
  const found = rows(result);
  if (found.length !== 1) fail("AUTH_QUOTA_DB_RESULTADO_INVALIDO");
  return found[0];
}
function validInstant(value) {
  return typeof value === "string" && value.length === 27 && INSTANT_RE.test(value) && Number.isFinite(Date.parse(value));
}
function boolean(value) {
  if (typeof value !== "boolean") fail("AUTH_QUOTA_DB_RESULTADO_INVALIDO");
  return value;
}
function count(value) {
  if (!Number.isSafeInteger(value) || value < 0) fail("AUTH_QUOTA_DB_RESULTADO_INVALIDO");
  return value;
}

function createAuthQuotaService(options = {}) {
  if (!exactKeys(options, ["hmacConfig"])) fail("AUTH_QUOTA_CONFIG_INVALIDA");
  const hasher = options.hmacConfig == null ? null : createQuotaIpHasher(options.hmacConfig);

  // Uma emissao por executor db.tx. Nao permite acumular locks de lotes em ordem
  // inversa nem chamadas concorrentes no mesmo cliente. O chamador faz commit.
  async function registrarEmissao(executor, args) {
    if (!executor || typeof executor.query !== "function" || !executor.raw ||
        executor.raw !== executor.client || typeof executor.raw.query !== "function" ||
        executor.pool || executor.tx) fail("AUTH_QUOTA_EXECUTOR_INVALIDO");
    if (!exactKeys(args, ["emissaoId", "finalidade", "usuarioId", "ip"]) ||
        typeof args.emissaoId !== "string" || args.emissaoId.length !== 36 || !UUID_RE.test(args.emissaoId) ||
        !FINALIDADES.includes(args.finalidade)) fail("AUTH_QUOTA_ARGUMENTO_INVALIDO");
    const usuarioId = args.usuarioId === undefined ? null : args.usuarioId;
    const ip = args.ip === undefined ? null : args.ip;
    if (usuarioId !== null && (!Number.isInteger(usuarioId) || usuarioId < 1 || usuarioId > 2147483647)) {
      fail("AUTH_QUOTA_ARGUMENTO_INVALIDO");
    }
    if (usuarioId === null && ip === null) fail("AUTH_QUOTA_ARGUMENTO_INVALIDO");
    if (ip !== null && !hasher) fail("AUTH_QUOTA_HMAC_CONFIG_AUSENTE");
    const identity = ip === null ? null : hasher.identify(ip);
    const emissaoId = args.emissaoId.toLowerCase();
    if (usedExecutors.has(executor)) fail("AUTH_QUOTA_EXECUTOR_REUTILIZADO");
    usedExecutors.add(executor);
    // Cliente da transacao explicitamente fornecida: nao usa pool, fallback ou
    // facade com logging de parametros. Sem BEGIN/COMMIT e sem imports de db/HTTP.
    const query = executor.raw.query.bind(executor.raw);
    let savepoint = false;
    try {
      // PostgreSQL rejeita SAVEPOINT fora de uma transacao (inclusive autocommit).
      await query("SAVEPOINT auth_quota_guard");
      savepoint = true;
      const mode = one(await query(`/* quota:transaction */ SELECT
        current_setting('transaction_isolation') AS isolamento,
        current_setting('transaction_read_only') AS somente_leitura`));
      if (mode.isolamento !== "read committed" || mode.somente_leitura !== "off") {
        fail("AUTH_QUOTA_TRANSACAO_INVALIDA");
      }
      if (usuarioId !== null) {
        const user = rows(await query(
          "/* quota:user */ SELECT id FROM public.usuarios WHERE id = $1 FOR UPDATE", [usuarioId],
        ));
        if (user.length === 0) {
          await query("ROLLBACK TO SAVEPOINT auth_quota_guard");
          await query("RELEASE SAVEPOINT auth_quota_guard");
          savepoint = false;
          return Object.freeze({ status: "negada" });
        }
        if (user.length !== 1 || user[0].id !== usuarioId) fail("AUTH_QUOTA_DB_RESULTADO_INVALIDO");
      }
      const keys = [subjectLockKey("emissao:" + emissaoId)];
      if (usuarioId !== null) keys.push(subjectLockKey("usuario:" + usuarioId));
      if (identity) keys.push(identity.lockKey);
      for (const key of [...new Set(keys)].sort((a, b) => a - b)) {
        await query("/* quota:lock */ SELECT pg_advisory_xact_lock($1::integer, $2::integer)",
          [QUOTA_LOCK_NAMESPACE, key]);
      }
      // Texto UTC com microssegundos; nunca arredondar via Date antes do INSERT.
      const { instante } = one(await query(`/* quota:clock */ SELECT
        to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS instante`));
      if (!validInstant(instante)) fail("AUTH_QUOTA_DB_RESULTADO_INVALIDO");
      const keyIds = identity ? identity.candidates.map(candidate => candidate.keyId) : [];
      const digests = identity ? identity.candidates.map(candidate => candidate.digest) : [];
      if (identity) {
        // Fail-closed: nao ignorar silenciosamente versoes presentes na janela IP.
        // Configuracao e rollout coordenados continuam a exigir politica propria.
        const coverage = one(await query(`/* quota:keys */ SELECT EXISTS (
          SELECT 1 FROM public.auth_quota_evento
          WHERE ip_hmac IS NOT NULL AND registrada_em > $1::timestamptz - interval '15 minutes'
            AND NOT (ip_hmac_key_id = ANY($2::text[]))
        ) AS desconhecida`, [instante, keyIds]));
        if (boolean(coverage.desconhecida)) fail("AUTH_QUOTA_HMAC_VERSAO_AUSENTE");
      }
      const prior = rows(await query(`/* quota:replay */ SELECT finalidade, usuario_id, ip_hmac,
        ip_hmac_key_id, to_char(registrada_em AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS registrada_em
        FROM public.auth_quota_evento WHERE emissao_id = $1::uuid`, [emissaoId]));
      if (prior.length > 1) fail("AUTH_QUOTA_DB_RESULTADO_INVALIDO");
      if (prior.length === 1) {
        const old = prior[0];
        if (!validInstant(old.registrada_em)) fail("AUTH_QUOTA_DB_RESULTADO_INVALIDO");
        const sameIp = identity ? identity.candidates.some(candidate =>
          old.ip_hmac_key_id === candidate.keyId && Buffer.isBuffer(old.ip_hmac) &&
          old.ip_hmac.length === 32 && timingSafeEqual(old.ip_hmac, candidate.digest))
          : old.ip_hmac === null && old.ip_hmac_key_id === null;
        if (old.finalidade !== args.finalidade || old.usuario_id !== usuarioId || !sameIp) {
          fail("AUTH_QUOTA_EMISSAO_DIVERGENTE");
        }
        await query("RELEASE SAVEPOINT auth_quota_guard");
        savepoint = false;
        return Object.freeze({ status: "aceita", repetida: true, registradaEm: old.registrada_em });
      }
      let denied = false;
      if (usuarioId !== null) {
        const account = one(await query(`/* quota:account */ SELECT
          count(*) FILTER (WHERE registrada_em > $2::timestamptz - interval '60 seconds'
            AND registrada_em <= $2::timestamptz)::integer AS minuto,
          count(*) FILTER (WHERE registrada_em > $2::timestamptz - interval '1 hour'
            AND registrada_em <= $2::timestamptz)::integer AS hora,
          count(*) FILTER (WHERE registrada_em <= $2::timestamptz)::integer AS dia,
          COALESCE(bool_or(registrada_em > $2::timestamptz), false) AS futura
          FROM public.auth_quota_evento
          WHERE usuario_id = $1 AND registrada_em > $2::timestamptz - interval '24 hours'`,
        [usuarioId, instante]));
        denied = count(account.minuto) > 0 || count(account.hora) >= 5 || count(account.dia) >= 10;
        denied = boolean(account.futura) || denied;
      }
      if (identity) {
        const address = one(await query(`/* quota:ip */ SELECT
          count(*) FILTER (WHERE registrada_em <= $1::timestamptz)::integer AS quantidade,
          COALESCE(bool_or(registrada_em > $1::timestamptz), false) AS futura
          FROM public.auth_quota_evento
          WHERE (ip_hmac_key_id, ip_hmac) IN (
            SELECT * FROM unnest($2::text[], $3::bytea[]))
            AND registrada_em > $1::timestamptz - interval '15 minutes'`, [instante, keyIds, digests]));
        denied = count(address.quantidade) >= 10 || boolean(address.futura) || denied;
      }
      if (denied) {
        await query("ROLLBACK TO SAVEPOINT auth_quota_guard");
        await query("RELEASE SAVEPOINT auth_quota_guard");
        savepoint = false;
        return Object.freeze({ status: "negada" });
      }
      const inserted = await query(`/* quota:insert */ INSERT INTO public.auth_quota_evento
        (emissao_id, finalidade, usuario_id, ip_hmac, ip_hmac_key_id, registrada_em)
        VALUES ($1::uuid, $2, $3, $4, $5, $6::timestamptz) RETURNING emissao_id`,
      [emissaoId, args.finalidade, usuarioId, identity?.current.digest ?? null,
        identity?.current.keyId ?? null, instante]);
      if (inserted.rowCount !== 1 || one(inserted).emissao_id !== emissaoId) fail("AUTH_QUOTA_DB_RESULTADO_INVALIDO");
      await query("RELEASE SAVEPOINT auth_quota_guard");
      savepoint = false;
      return Object.freeze({ status: "aceita", repetida: false, registradaEm: instante });
    } catch (error) {
      if (savepoint) {
        try {
          await query("ROLLBACK TO SAVEPOINT auth_quota_guard");
          await query("RELEASE SAVEPOINT auth_quota_guard");
        } catch {
          // Chamador deve abortar db.tx; nao esconder falha de rollback/cliente.
          fail("AUTH_QUOTA_ROLLBACK_FALHOU");
        }
      }
      // Nunca repassar detail/cause do driver com parametros, IP ou digest.
      if (error instanceof AuthQuotaError) throw error;
      fail("AUTH_QUOTA_DB_FALHOU");
    }
  }

  return Object.freeze({ registrarEmissao });
}

module.exports = { createAuthQuotaService, AuthQuotaError, QUOTA_LOCK_NAMESPACE };
