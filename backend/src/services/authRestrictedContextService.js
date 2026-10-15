"use strict";

const { createHash } = require("node:crypto");
const { isValidAuthVersion } = require("../auth/authVersion");
const { validProfiles } = require("../auth/sessionAuthorization");
const { IDLE_MS, TOUCH_MS } = require("./authSessionService");
const IDLE_SECONDS = 1800;
const ABSOLUTE_SECONDS = 7200;
const STAMP = "'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"'";
const MFA_PROFILES = new Set(["gestor", "administrador", "diagnostico", "cai_administrador"]);
class RestrictedContextError extends Error {
  constructor(code = "AUTH_RESTRICTED_FAILURE") { super(code); this.code = code; }
}
function rawQuery(executor) {
  if (!executor?.raw || executor.raw !== executor.client || typeof executor.raw.query !== "function") {
    throw new RestrictedContextError();
  }
  return executor.raw.query.bind(executor.raw); // Hash/token e params nunca passam pelo logger da facade.
}
function records(result) {
  if (!Array.isArray(result?.rows)) throw new RestrictedContextError();
  return result.rows;
}
function micros(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(value) ||
      !Number.isFinite(Date.parse(value))) throw new RestrictedContextError("AUTH_RESTRICTED_INVALID");
  return BigInt(Date.parse(value)) * 1000n + BigInt(value.slice(23, 26));
}
function deny() { throw new RestrictedContextError("AUTH_RESTRICTED_INVALID"); }
function enabledValue(value) {
  if (value === undefined || value === "false") return false;
  if (value === "true") return true;
  throw new RestrictedContextError("AUTH_RESTRICTED_CONFIG");
}
// Chamado somente na transacao da NOVA autenticacao, sob lock do usuario.
// Nunca criar/reabrir contexto a partir de um cookie antigo ou de um Bearer.
async function initializeRestrictedContext(executor, { sessionId, usuarioId, authVersion }) {
  try {
    if (!isValidAuthVersion(authVersion)) deny();
    const q = rawQuery(executor);
    const result = await q(`/* restricted:initialize */ INSERT INTO public.auth_contexto_restrito
      (sessao_id, auth_version_esperada, iniciada_em, ultimo_uso_em, expira_em, limite_absoluto_em)
      SELECT s.id, u.auth_version, s.criada_em, s.criada_em,
             LEAST(s.expira_em, s.criada_em + interval '30 minutes'),
             s.criada_em + interval '120 minutes'
        FROM public.auth_sessao s JOIN public.usuarios u ON u.id = s.usuario_id
       WHERE s.id = $1::uuid AND s.usuario_id = $2 AND u.auth_version = $3
         AND u.deleted_at IS NULL AND s.revogada_em IS NULL
         AND s.criada_em <= clock_timestamp() AND s.expira_em > clock_timestamp()
      RETURNING sessao_id`, [sessionId, usuarioId, authVersion]);
    if (result.rowCount !== 1) deny();
  } catch (error) {
    if (error instanceof RestrictedContextError) throw error;
    throw new RestrictedContextError();
  }
}
function accountProgress(user, profiles) {
  for (const key of ["id", "auth_version", "deleted_at", "email_confirmado_em", "cadastro_pendente_expira_em",
    "cargo_id", "unidade_id", "data_nascimento", "escolaridade_id", "deficiencia_id"]) {
    if (!Object.hasOwn(user, key) || user[key] === undefined) deny();
  }
  if (!isValidAuthVersion(user.auth_version) || user.deleted_at !== null || !validProfiles(profiles)) deny();
  for (const field of ["email_confirmado_em", "cadastro_pendente_expira_em"]) {
    if (user[field] !== null && !Number.isFinite(new Date(user[field]).getTime())) deny();
  }
  const progress = {
    emailConfirmado: user.email_confirmado_em !== null,
    cadastroPendente: user.cadastro_pendente_expira_em !== null,
    dadosPreenchidos: ["cargo_id", "unidade_id", "data_nascimento", "escolaridade_id", "deficiencia_id"]
      .every(key => user[key] !== null && user[key] !== ""),
    revisaoComprovada: false, politicasComprovadas: false,
    mfaExigido: profiles.some(profile => MFA_PROFILES.has(profile)), mfaComprovado: false,
  };
  const pending = [];
  if (!progress.emailConfirmado) pending.push("email");
  if (progress.cadastroPendente) pending.push("cadastro");
  if (!progress.dadosPreenchidos) pending.push("dados");
  // Nao ha persistencia/fluxo aprovado de revisao, politicas ou MFA neste schema.
  pending.push("revisao_nao_comprovada", "politicas_nao_comprovadas");
  if (progress.mfaExigido) pending.push("mfa_nao_comprovado");
  return { progress, pending };
}
function createRestrictedContextService({ db }) {
  if (typeof db?.tx !== "function") throw new RestrictedContextError();
  async function access({ cookieToken, identity = null, allowedOperation = false }) {
    try {
      if (identity !== null && (!Number.isInteger(identity.id) || identity.id <= 0 ||
          (identity.authVersion !== undefined && !isValidAuthVersion(identity.authVersion)))) deny();
      if (!cookieToken && !identity) deny();
      if (cookieToken !== undefined && cookieToken !== null &&
          (typeof cookieToken !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(cookieToken))) deny();
      return await db.tx(async executor => {
        const q = rawQuery(executor);
        await q("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
        await q("SET LOCAL lock_timeout = '2s'");
        await q("SET LOCAL statement_timeout = '5s'");
        let hint;
        const hash = cookieToken ? createHash("sha256").update(cookieToken, "utf8").digest() : null;
        if (hash) {
          hint = records(await q(`/* restricted:hint */ SELECT id, usuario_id FROM public.auth_sessao WHERE token_hash = $1`, [hash]))[0];
          if (!hint || (identity && hint.usuario_id !== identity.id) ||
              (identity?.sessionId && hint.id !== identity.sessionId)) deny();
        }
        const usuarioId = hint?.usuario_id ?? identity.id;
        const user = records(await q(`/* restricted:user */ SELECT id, auth_version, deleted_at,
          email_confirmado_em, cadastro_pendente_expira_em, cargo_id, unidade_id,
          data_nascimento, escolaridade_id, deficiencia_id
          FROM public.usuarios WHERE id = $1 FOR UPDATE`, [usuarioId]))[0];
        if (!user || user.id !== usuarioId) deny();
        if (identity?.authVersion !== undefined && identity.authVersion !== user.auth_version) deny();
        const profiles = records(await q(`/* restricted:profiles */ SELECT perfil_codigo
          FROM public.auth_usuario_perfis WHERE usuario_id = $1 ORDER BY perfil_codigo`, [usuarioId])).map(row => row.perfil_codigo);
        const state = accountProgress(user, profiles);
        if (!hint) return { permitted: false }; // Bearer nao comprova contexto restrito.
        const session = records(await q(`/* restricted:session */ SELECT id, usuario_id, revogada_em,
          to_char(criada_em AT TIME ZONE 'UTC', ${STAMP}) AS criada_em,
          to_char(expira_em AT TIME ZONE 'UTC', ${STAMP}) AS expira_em,
          to_char(limite_absoluto_em AT TIME ZONE 'UTC', ${STAMP}) AS limite_absoluto_em
          FROM public.auth_sessao WHERE id = $1::uuid AND token_hash = $2 AND usuario_id = $3 FOR UPDATE`,
        [hint.id, hash, usuarioId]))[0];
        if (!session || session.id !== hint.id || session.usuario_id !== usuarioId || session.revogada_em !== null) deny();
        const context = records(await q(`/* restricted:context */ SELECT auth_version_esperada,
          to_char(iniciada_em AT TIME ZONE 'UTC', ${STAMP}) AS iniciada_em,
          to_char(ultimo_uso_em AT TIME ZONE 'UTC', ${STAMP}) AS ultimo_uso_em,
          to_char(expira_em AT TIME ZONE 'UTC', ${STAMP}) AS expira_em,
          to_char(limite_absoluto_em AT TIME ZONE 'UTC', ${STAMP}) AS limite_absoluto_em
          FROM public.auth_contexto_restrito WHERE sessao_id = $1::uuid FOR UPDATE`, [session.id]))[0];
        const instant = records(await q(`/* restricted:clock */ SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC', ${STAMP}) AS instante`))[0]?.instante;
        const now = micros(instant);
        if (!context || context.auth_version_esperada !== user.auth_version ||
            micros(session.criada_em) > now || micros(session.expira_em) <= now ||
            (session.limite_absoluto_em !== null && micros(session.limite_absoluto_em) <= now) ||
            micros(context.iniciada_em) !== micros(session.criada_em) ||
            micros(context.ultimo_uso_em) < micros(context.iniciada_em) || micros(context.ultimo_uso_em) > now ||
            micros(context.limite_absoluto_em) !== micros(context.iniciada_em) + 7200000000n ||
            micros(context.expira_em) > micros(context.limite_absoluto_em) ||
            micros(context.expira_em) > micros(context.ultimo_uso_em) + 1800000000n ||
            micros(context.expira_em) <= now || micros(context.limite_absoluto_em) <= now) deny();
        if (allowedOperation !== true) return { permitted: false }; // Negacao nao renova inatividade.
        // Clock final depois de todos os locks. Concorrencia nunca renova prazo absoluto.
        const touched = await q(`/* restricted:touch */ WITH instant AS MATERIALIZED (SELECT clock_timestamp() AS now)
          UPDATE public.auth_contexto_restrito c SET ultimo_uso_em = instant.now,
            expira_em = LEAST(instant.now + interval '30 minutes', c.limite_absoluto_em)
          FROM instant, public.auth_sessao s, public.usuarios u
          WHERE c.sessao_id = $1::uuid AND s.id = c.sessao_id AND u.id = s.usuario_id AND u.id = $2
            AND c.auth_version_esperada = u.auth_version AND u.deleted_at IS NULL AND s.revogada_em IS NULL
            AND c.expira_em > instant.now AND c.limite_absoluto_em > instant.now AND c.ultimo_uso_em <= instant.now
            AND s.expira_em > instant.now AND (s.limite_absoluto_em IS NULL OR s.limite_absoluto_em > instant.now)
          RETURNING to_char(c.ultimo_uso_em AT TIME ZONE 'UTC', ${STAMP}) AS ultimo_uso_em,
            to_char(c.expira_em AT TIME ZONE 'UTC', ${STAMP}) AS expira_em,
            to_char(c.limite_absoluto_em AT TIME ZONE 'UTC', ${STAMP}) AS limite_absoluto_em`, [session.id, usuarioId]);
        if (touched.rowCount !== 1) deny();
        const live = records(touched)[0];
        if (!live || live.limite_absoluto_em !== context.limite_absoluto_em ||
            micros(live.ultimo_uso_em) < now || micros(live.expira_em) <= micros(live.ultimo_uso_em) ||
            micros(live.expira_em) > micros(live.limite_absoluto_em)) deny();
        // Mesma politica canonica: validade independe da escrita de touch estar devida.
        // A sessao ja esta bloqueada desde user -> session -> context, no mesmo executor.
        const normal = await q(`/* restricted:touch-session */ WITH locked AS MATERIALIZED (
          SELECT id, revogada_em, expira_em, limite_absoluto_em, ultimo_uso_em
            FROM public.auth_sessao WHERE id = $1::uuid FOR UPDATE
        ), touched AS (
          UPDATE public.auth_sessao AS s SET ultimo_uso_em = $2::timestamptz,
            expira_em = LEAST($2::timestamptz + $3::bigint * interval '1 millisecond',
              COALESCE(locked.limite_absoluto_em, 'infinity'::timestamptz))
          FROM locked WHERE s.id = locked.id
            AND locked.revogada_em IS NULL AND locked.expira_em > $2::timestamptz
            AND (locked.limite_absoluto_em IS NULL OR locked.limite_absoluto_em > $2::timestamptz)
            AND locked.ultimo_uso_em <= $2::timestamptz - $4::bigint * interval '1 millisecond'
          RETURNING s.id
        ) SELECT EXISTS (
          SELECT 1 FROM locked WHERE revogada_em IS NULL AND expira_em > $2::timestamptz
            AND (limite_absoluto_em IS NULL OR limite_absoluto_em > $2::timestamptz)
            AND ultimo_uso_em <= $2::timestamptz
        ) AS valid, EXISTS (SELECT 1 FROM touched) AS written`,
        [session.id, live.ultimo_uso_em, IDLE_MS, TOUCH_MS]);
        if (records(normal)[0]?.valid !== true) deny();
        return { permitted: true, restricted: true, ...state,
          expiresAt: live.expira_em, absoluteExpiresAt: live.limite_absoluto_em };
      });
    } catch (error) {
      if (error instanceof RestrictedContextError) throw error;
      throw new RestrictedContextError(); // Sem causa, SQL, token, email ou CPF.
    }
  }
  return Object.freeze({ access });
}
module.exports = { createRestrictedContextService, initializeRestrictedContext, RestrictedContextError,
  enabledValue, IDLE_SECONDS, ABSOLUTE_SECONDS };
