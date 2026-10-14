"use strict";

const { randomUUID, createHash, timingSafeEqual } = require("node:crypto");
const { createAuthOutboxCrypto } = require("./authOutboxCrypto");
const LEASE_SECONDS = 180;
const MAX_ATTEMPTS = 6;
const STAMP = "'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"'";
const PURPOSES = ["confirmacao", "alteracao", "recuperacao"];
const OFFSETS = Object.freeze({
  recuperacao: Object.freeze([0, 1, 3, 7, 15, 25]),
  confirmacao: Object.freeze([0, 1, 5, 15, 60, 180]),
  alteracao: Object.freeze([0, 1, 5, 15, 60, 180]),
});
class AuthOutboxWorkerError extends Error {
  constructor() { super("AUTH_OUTBOX_WORKER_FAILURE"); this.code = "AUTH_OUTBOX_WORKER_FAILURE"; }
}
function micros(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new AuthOutboxWorkerError();
  }
  return BigInt(Date.parse(value)) * 1000n + BigInt(value.slice(23, 26));
}
function stamp(value) {
  return new Date(Number(value / 1000n)).toISOString().slice(0, 20) + String(value % 1000000n).padStart(6, "0") + "Z";
}
function nextAttempt(row, now) {
  if (!OFFSETS[row.finalidade] || !Number.isInteger(row.tentativas) || row.tentativas < 1 || row.tentativas >= MAX_ATTEMPTS) return null;
  const clock = micros(now), created = micros(row.criada_em), expires = micros(row.expira_em);
  // Pula slots vencidos; nunca soma um intervalo ao horario da falha.
  const future = OFFSETS[row.finalidade].slice(row.tentativas).map(m => created + BigInt(m) * 60000000n)
    .find(t => t > clock && t < expires);
  return future === undefined ? null : stamp(future);
}
function rows(result) {
  if (!result || !Array.isArray(result.rows)) throw new AuthOutboxWorkerError();
  return result.rows;
}
const CANDIDATES = `/* worker:candidates */ SELECT o.id, COALESCE(c.usuario_id, r.usuario_id) AS usuario_id
  FROM public.auth_outbox o
  LEFT JOIN public.auth_email_confirmacao c ON c.id = o.confirmacao_id
  LEFT JOIN public.auth_recuperacao_senha r ON r.id = o.recuperacao_id
  WHERE (o.status = 'pending' AND o.proxima_tentativa_em <= clock_timestamp())
    OR (o.status = 'processing' AND o.lease_expira_em <= clock_timestamp())
  ORDER BY COALESCE(o.proxima_tentativa_em, o.lease_expira_em), o.id LIMIT 32`;

function createAuthOutboxWorker(options = {}) {
  const { db, cryptoConfig, transport, consumer, enabled = false, dryRun = false } = options;
  let stopping = false, cipher;
  const available = () => !stopping && enabled === true && dryRun === false && consumer?.ready === true &&
    typeof consumer.buildMail === "function" && typeof db?.tx === "function" &&
    transport?.maxDurationMs === 120000 && typeof transport.send === "function" && typeof transport.cancel === "function" &&
    typeof transport.ready === "function" && transport.ready() === true;
  function readiness() {
    if (stopping || enabled !== true) return "disabled";
    if (dryRun === true) return "dry-run";
    if (dryRun !== false) return "blocked-config";
    // Nao basta um flag de ambiente: exige um contrato de consumo integrado.
    if (consumer?.ready !== true || typeof consumer.buildMail !== "function") return "blocked-consumer";
    try {
      if (!available()) return "blocked-config";
      cipher ??= createAuthOutboxCrypto(cryptoConfig);
    } catch { return "blocked-config"; }
    return "ready";
  }
  async function transaction(action) {
    try {
      return await db.tx(async executor => {
        if (!executor?.raw || executor.raw !== executor.client || typeof executor.raw.query !== "function") throw new AuthOutboxWorkerError();
        const q = executor.raw.query.bind(executor.raw); // Nunca logar parametros sensiveis na facade.
        await q("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
        await q("SET LOCAL lock_timeout = '2s'");
        await q("SET LOCAL statement_timeout = '5s'");
        return action(q);
      });
    } catch { throw new AuthOutboxWorkerError(); }
  }
  async function lock(q, hint, skip = true) {
    const locking = skip ? "FOR UPDATE SKIP LOCKED" : "FOR UPDATE";
    // Ordem comum ao enqueue/reset: usuario -> desafio -> outbox. Sem advisory de quota.
    const user = rows(await q(`/* worker:user */ SELECT id, email::text AS email, auth_version, email_version,
      deleted_at IS NOT NULL AS excluido, email_confirmado_em IS NOT NULL AS confirmado,
      cadastro_pendente_expira_em IS NOT NULL AS cadastro_pendente
      FROM public.usuarios WHERE id = $1 ${locking}`, [hint.usuario_id]))[0];
    if (!user) return null;
    // Ler FK sem lock antes de bloquear o desafio evita inverter outbox/desafio.
    const reference = rows(await q(`/* worker:reference */ SELECT confirmacao_id, recuperacao_id
      FROM public.auth_outbox WHERE id = $1::uuid`, [hint.id]))[0];
    if (!reference) return null;
    const recovery = reference.recuperacao_id !== null;
    const challenge = rows(await q(recovery
      ? `/* worker:challenge */ SELECT id, usuario_id, token_hash, auth_version_esperada,
          'recuperacao'::text AS finalidade, consumida_em, invalidada_em,
          to_char(expira_em AT TIME ZONE 'UTC', ${STAMP}) AS expira_em
          FROM public.auth_recuperacao_senha WHERE id = $1::uuid ${locking}`
      : `/* worker:challenge */ SELECT id, usuario_id, token_hash, email_version_esperada,
          email_candidato::text AS email_candidato, finalidade, consumida_em, invalidada_em,
          to_char(expira_em AT TIME ZONE 'UTC', ${STAMP}) AS expira_em
          FROM public.auth_email_confirmacao WHERE id = $1::uuid ${locking}`,
    [reference.recuperacao_id ?? reference.confirmacao_id]))[0];
    if (!challenge) return null;
    const row = rows(await q(`/* worker:message */ SELECT id, confirmacao_id, recuperacao_id, email_destino,
      conteudo_cifrado, nonce, auth_tag, key_id, status, tentativas, lease_id,
      to_char(criada_em AT TIME ZONE 'UTC', ${STAMP}) AS criada_em,
      to_char(proxima_tentativa_em AT TIME ZONE 'UTC', ${STAMP}) AS proxima_tentativa_em,
      to_char(ultima_tentativa_em AT TIME ZONE 'UTC', ${STAMP}) AS ultima_tentativa_em,
      to_char(lease_expira_em AT TIME ZONE 'UTC', ${STAMP}) AS lease_expira_em
      FROM public.auth_outbox WHERE id = $1::uuid ${locking}`, [hint.id]))[0];
    if (!row) return null;
    const now = rows(await q(`/* worker:clock */ SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC', ${STAMP}) AS instante`))[0]?.instante;
    const clock = micros(now);
    if (clock < micros(row.criada_em) || (row.ultima_tentativa_em && clock < micros(row.ultima_tentativa_em))) throw new AuthOutboxWorkerError();
    const finalidade = challenge.finalidade;
    const version = recovery ? challenge.auth_version_esperada : challenge.email_version_esperada;
    const currentVersion = recovery ? user.auth_version : user.email_version;
    const valid = row.id === challenge.id && challenge.usuario_id === user.id && PURPOSES.includes(finalidade) &&
      (recovery ? finalidade === "recuperacao" && row.confirmacao_id === null : row.recuperacao_id === null && finalidade !== "recuperacao") &&
      !user.excluido && !user.cadastro_pendente && (finalidade === "confirmacao" ? user.confirmado === false : user.confirmado === true) &&
      Number.isInteger(version) && version >= 1 && version === currentVersion &&
      challenge.consumida_em === null && challenge.invalidada_em === null && micros(challenge.expira_em) > clock &&
      typeof user.email === "string" && (recovery ? user.email.toLowerCase() === row.email_destino :
        typeof challenge.email_candidato === "string" && challenge.email_candidato.toLowerCase() === row.email_destino &&
        (finalidade === "confirmacao" ? user.email.toLowerCase() === row.email_destino : user.email.toLowerCase() !== row.email_destino));
    return { ...row, finalidade, usuario_id: user.id, expira_em: challenge.expira_em, token_hash: challenge.token_hash, now, valid };
  }
  async function update(q, row, status, code, smtpStatus, next = null, fenced = false) {
    const changed = await q(`/* worker:settle */ UPDATE public.auth_outbox SET status = $3,
      proxima_tentativa_em = $4::timestamptz, finalizada_em = CASE WHEN $3 IN ('sent','failed') THEN $5::timestamptz ELSE NULL END,
      lease_id = NULL, lease_adquirida_em = NULL, lease_expira_em = NULL,
      ultimo_erro_codigo = $6, ultimo_erro_smtp_status = $7,
      conteudo_cifrado = CASE WHEN $3 IN ('sent','failed') THEN NULL ELSE conteudo_cifrado END,
      nonce = CASE WHEN $3 IN ('sent','failed') THEN NULL ELSE nonce END,
      auth_tag = CASE WHEN $3 IN ('sent','failed') THEN NULL ELSE auth_tag END,
      key_id = CASE WHEN $3 IN ('sent','failed') THEN NULL ELSE key_id END
      WHERE id = $1::uuid AND status = $8 AND lease_id IS NOT DISTINCT FROM $2::uuid
        AND (NOT $9::boolean OR (status = 'processing' AND lease_expira_em > clock_timestamp())) RETURNING id`,
    [row.id, row.lease_id, status, next, row.now, code, smtpStatus, row.status, fenced]);
    if (changed.rowCount !== 1) return "stale";
    return status;
  }
  async function claim() {
    // Cada candidato usa sua propria transacao; nao acumular locks de contas.
    const hints = await transaction(q => q(CANDIDATES).then(rows));
    for (const hint of hints) {
      const claimed = await transaction(async q => {
        const row = await lock(q, hint);
        if (!row || !((row.status === "pending" && micros(row.proxima_tentativa_em) <= micros(row.now)) ||
            (row.status === "processing" && micros(row.lease_expira_em) <= micros(row.now)))) return null;
        if (!row.valid) return { result: await update(q, row, "failed", "CHALLENGE_INVALID", null) };
        if (!Number.isInteger(row.tentativas) || row.tentativas < 0) throw new AuthOutboxWorkerError();
        if (row.tentativas >= MAX_ATTEMPTS) return { result: await update(q, row, "failed", "RETRY_EXHAUSTED", null) };
        const lease = randomUUID();
        const changed = await q(`/* worker:claim */ UPDATE public.auth_outbox SET status = 'processing',
          tentativas = tentativas + 1, ultima_tentativa_em = $2::timestamptz, proxima_tentativa_em = NULL,
          lease_id = $3::uuid, lease_adquirida_em = $2::timestamptz, lease_expira_em = $2::timestamptz + interval '180 seconds',
          ultimo_erro_codigo = CASE WHEN status = 'processing' THEN 'LEASE_EXPIRED' ELSE ultimo_erro_codigo END,
          ultimo_erro_smtp_status = CASE WHEN status = 'processing' THEN NULL ELSE ultimo_erro_smtp_status END
          WHERE id = $1::uuid AND ((status = 'pending' AND proxima_tentativa_em <= $2::timestamptz)
            OR (status = 'processing' AND lease_expira_em <= $2::timestamptz)) RETURNING id`, [row.id, row.now, lease]);
        if (changed.rowCount !== 1) throw new AuthOutboxWorkerError();
        return { ...row, status: "processing", tentativas: row.tentativas + 1, lease_id: lease };
      });
      if (claimed) return claimed;
    }
    return null;
  }
  async function settle(claimed, outcome) {
    return transaction(async q => {
      const row = await lock(q, claimed, false);
      if (!row || row.status !== "processing" || row.lease_id !== claimed.lease_id || micros(row.lease_expira_em) <= micros(row.now)) return "stale";
      if (outcome.kind === "accepted") return update(q, row, "sent", null, null, null, true);
      const smtpStatus = Number.isInteger(outcome.smtpStatus) && outcome.smtpStatus >= 400 && outcome.smtpStatus <= 599 ? outcome.smtpStatus : null;
      if (outcome.kind === "permanent") return update(q, row, "failed", "SMTP_PERMANENT", smtpStatus, null, true);
      if (outcome.kind === "crypto") return update(q, row, "failed", "CRYPTO_FAILURE", null, null, true);
      if (!row.valid) return update(q, row, "failed", "CHALLENGE_INVALID", null, null, true);
      const next = nextAttempt(row, row.now);
      if (!next) return update(q, row, "failed", "RETRY_EXHAUSTED", null, null, true);
      const code = outcome.kind === "temporary" ? "SMTP_TRANSIENT" : "INTERNAL_FAILURE";
      return update(q, row, "pending", code, code === "SMTP_TRANSIENT" ? smtpStatus : null, next, true);
    });
  }
  async function runOnce() {
    const state = readiness();
    if (state !== "ready") return Object.freeze({ status: state }); // Inclui dry-run: zero DB/decrypt/SMTP/tentativas.
    try {
      const row = await claim();
      if (!row) return { status: "idle" };
      if (row.result) return { status: row.result };
      if (stopping) return { status: await settle(row, { kind: "indeterminate" }) };
      let clear, token, mail;
      try {
        clear = cipher.decifrar({ mensagemId: row.id, desafioId: row.confirmacao_id ?? row.recuperacao_id,
          finalidade: row.finalidade, emailDestino: row.email_destino }, {
          conteudoCifrado: row.conteudo_cifrado, nonce: row.nonce, authTag: row.auth_tag, keyId: row.key_id });
        const payload = JSON.parse(clear.toString("utf8"));
        if (payload.v !== 1 || Object.keys(payload).length !== 2 || typeof payload.token !== "string" ||
            !/^[A-Za-z0-9_-]{43}$/.test(payload.token)) throw new AuthOutboxWorkerError();
        token = Buffer.from(payload.token, "ascii");
        const hash = createHash("sha256").update(token).digest();
        if (!Buffer.isBuffer(row.token_hash) || row.token_hash.length !== hash.length || !timingSafeEqual(hash, row.token_hash)) throw new AuthOutboxWorkerError();
        mail = consumer.buildMail({ finalidade: row.finalidade, token: token.toString("ascii") });
        // Destinatario controlado pelo snapshot; builder nao pode adicionar cc/bcc/envelope.
        if (!mail || typeof mail.subject !== "string" || typeof mail.text !== "string" ||
            Object.keys(mail).some(k => !["subject", "text"].includes(k))) throw new AuthOutboxWorkerError();
      } catch { return { status: await settle(row, { kind: "crypto" }) }; }
      finally { clear?.fill(0); token?.fill(0); }
      try {
        const checked = await transaction(async q => {
          const current = await lock(q, row, false);
          if (!current || current.status !== "processing" || current.lease_id !== row.lease_id || micros(current.lease_expira_em) <= micros(current.now)) return "stale";
          if (!current.valid) return update(q, current, "failed", "CHALLENGE_INVALID", null, null, true);
          // Prazo total SMTP <=120s, com margem para persistir ack dentro de 180s.
          return micros(current.lease_expira_em) - micros(current.now) > 125000000n ? "ready" : "late";
        });
        if (checked !== "ready") return { status: checked === "late" ? await settle(row, { kind: "indeterminate" }) : checked };
        if (stopping || !available()) return { status: await settle(row, { kind: "indeterminate" }) };
        let outcome;
        try { outcome = await transport.send({ to: row.email_destino, ...mail }); }
        catch { outcome = { kind: "indeterminate" }; }
        // Um dry-run inesperado nunca vira sent. Contrato invalido tambem nao vira sent.
        if (!outcome || !["accepted", "temporary", "permanent", "indeterminate"].includes(outcome.kind)) outcome = { kind: "indeterminate" };
        return { status: await settle(row, outcome) };
      } finally { mail = null; }
    } catch { throw new AuthOutboxWorkerError(); }
  }
  async function stop() { stopping = true; await transport?.cancel?.(); }
  return Object.freeze({ runOnce, stop, readiness });
}
module.exports = { createAuthOutboxWorker, AuthOutboxWorkerError, nextAttempt, LEASE_SECONDS, MAX_ATTEMPTS };
