"use strict";

const crypto = require("node:crypto");
const { createAuthQuotaService, AuthQuotaError } = require("./authQuotaService");
const { createAuthOutboxCrypto } = require("./authOutboxCrypto");
const { normalizeQuotaIp } = require("./authQuotaIp");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const RESULT = Object.freeze({ status: "processada" });
const usedExecutors = new WeakSet();
const STAMP = "'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"'";

class AuthEnqueueError extends Error {
  constructor(code) { super(code); this.name = "AuthEnqueueError"; this.code = code; }
}
function fail(code) { throw new AuthEnqueueError(code); }
function shape(value, allowed) {
  return value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype &&
    Reflect.ownKeys(value).every(k => allowed.includes(k) && Object.hasOwn(Object.getOwnPropertyDescriptor(value, k), "value"));
}
function version(value) { return Number.isInteger(value) && value >= 1 && value <= 2147483647; }
function instant(value) { return typeof value === "string" && value.length === 27 && INSTANT.test(value) && Number.isFinite(Date.parse(value)); }
function micros(value) { return BigInt(Date.parse(value)) * 1000n + BigInt(value.slice(23, 26)); }
function rows(result) { if (!result || !Array.isArray(result.rows)) fail("AUTH_ENQUEUE_DB_RESULTADO_INVALIDO"); return result.rows; }
function one(result) { const all = rows(result); if (all.length !== 1) fail("AUTH_ENQUEUE_DB_RESULTADO_INVALIDO"); return all[0]; }
function email(value) {
  // Mesma regra basica EMAIL_RE/normEmail do authUsuarioController, mais envelope unico da outbox.
  if (typeof value !== "string" || !value || Buffer.byteLength(value) > 1024 ||
      /[\s\x00-\x1f\x7f,;<>]/.test(value) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return null;
  return value.toLowerCase();
}
function request(args) {
  if (!shape(args, ["emissaoId", "finalidade", "usuarioId", "expectedAuthVersion", "expectedEmailVersion", "emailCandidato", "ip"]) ||
      typeof args.emissaoId !== "string" || args.emissaoId.length !== 36 || !UUID.test(args.emissaoId) ||
      !["confirmacao", "alteracao", "recuperacao"].includes(args.finalidade) || !version(args.usuarioId) ||
      !version(args.expectedAuthVersion) || !version(args.expectedEmailVersion) ||
      (args.ip != null && typeof args.ip !== "string") ||
      (args.finalidade === "alteracao" ? !email(args.emailCandidato) : Object.hasOwn(args, "emailCandidato"))) fail("AUTH_ENQUEUE_ARGUMENTO_INVALIDO");
  return Object.freeze({ emissaoId: args.emissaoId.toLowerCase(), finalidade: args.finalidade, usuarioId: args.usuarioId,
    expectedAuthVersion: args.expectedAuthVersion, expectedEmailVersion: args.expectedEmailVersion,
    emailCandidato: args.finalidade === "alteracao" ? email(args.emailCandidato) : null, ip: args.ip ?? null });
}

function createAuthEnqueueService(options) {
  if (!shape(options, ["cryptoConfig", "hmacConfig", "registrarAuditoria"]) || typeof options.registrarAuditoria !== "function") {
    fail("AUTH_ENQUEUE_CONFIG_INVALIDA");
  }
  let cipher; let quota;
  try {
    cipher = createAuthOutboxCrypto(options.cryptoConfig);
    for (const key of options.cryptoConfig.keys) {
      if (options.hmacConfig?.keys?.some(h => Buffer.isBuffer(h.secret) && h.secret.equals(key.secret))) fail("AUTH_ENQUEUE_CONFIG_INVALIDA");
    }
    quota = createAuthQuotaService({ hmacConfig: options.hmacConfig ?? null });
  } catch { fail("AUTH_ENQUEUE_CONFIG_INVALIDA"); }
  const audit = options.registrarAuditoria;
  const acceptsIp = options.hmacConfig != null;

  async function enqueue(executor, args) {
    if (!executor || typeof executor.query !== "function" || !executor.raw || executor.raw !== executor.client ||
        typeof executor.raw.query !== "function" || executor.pool || executor.tx) fail("AUTH_ENQUEUE_EXECUTOR_INVALIDO");
    const req = request(args); // Snapshot antes de qualquer await.
    if (req.ip !== null) {
      if (!acceptsIp) fail("AUTH_ENQUEUE_CONFIG_INVALIDA");
      try { normalizeQuotaIp(req.ip); } catch { fail("AUTH_ENQUEUE_ARGUMENTO_INVALIDO"); }
    }
    if (usedExecutors.has(executor)) fail("AUTH_ENQUEUE_EXECUTOR_REUTILIZADO");
    usedExecutors.add(executor);
    const query = executor.raw.query.bind(executor.raw);
    let savepoint = false;
    let token; let tokenBytes; let payload;
    async function undo() {
      await query("ROLLBACK TO SAVEPOINT auth_enqueue_guard");
      await query("RELEASE SAVEPOINT auth_enqueue_guard"); savepoint = false;
    }
    try {
      await query("SAVEPOINT auth_enqueue_guard"); savepoint = true;
      const mode = one(await query(`/* enqueue:transaction */ SELECT current_setting('transaction_isolation') AS isolamento,
        current_setting('transaction_read_only') AS somente_leitura`));
      if (mode.isolamento !== "read committed" || mode.somente_leitura !== "off") fail("AUTH_ENQUEUE_TRANSACAO_INVALIDA");
      // Ordem obrigatoria: usuario antes de qualquer advisory lock de quotas/desafios/outbox.
      const found = rows(await query(`/* enqueue:user */ SELECT id, email::text AS email, auth_version, email_version,
        deleted_at IS NOT NULL AS excluido, email_confirmado_em IS NOT NULL AS confirmado,
        cadastro_pendente_expira_em IS NOT NULL AS cadastro_pendente
        FROM public.usuarios WHERE id = $1 FOR UPDATE`, [req.usuarioId]));
      if (found.length > 1) fail("AUTH_ENQUEUE_DB_RESULTADO_INVALIDO");
      if (!found.length) { await undo(); return RESULT; }
      const user = found[0];
      if (user.id !== req.usuarioId || !version(user.auth_version) || !version(user.email_version) ||
          [user.excluido, user.confirmado, user.cadastro_pendente].some(v => typeof v !== "boolean")) fail("AUTH_ENQUEUE_DB_RESULTADO_INVALIDO");
      // D1/D4 fora deste nucleo: sem retomada de cadastro, recuperacao nao confirmada ou reativacao.
      if (user.excluido || user.cadastro_pendente || user.auth_version !== req.expectedAuthVersion ||
          user.email_version !== req.expectedEmailVersion ||
          (req.finalidade === "confirmacao" ? user.confirmado : !user.confirmado)) { await undo(); return RESULT; }
      const official = email(user.email);
      if (!official) fail("AUTH_ENQUEUE_DB_RESULTADO_INVALIDO");
      const destination = req.finalidade === "alteracao" ? req.emailCandidato : official;
      if (req.finalidade === "alteracao" && destination === official) { await undo(); return RESULT; }
      const decision = await quota.registrarEmissao(executor, {
        emissaoId: req.emissaoId, finalidade: req.finalidade, usuarioId: req.usuarioId, ip: req.ip,
      });
      if (decision.status === "negada") { await undo(); return RESULT; }
      if (decision.status !== "aceita" || typeof decision.repetida !== "boolean" || !instant(decision.registradaEm)) fail("AUTH_ENQUEUE_DB_RESULTADO_INVALIDO");
      const time = decision.registradaEm;
      // Mesmo UUID liga as tres estruturas sem nova FK a quotas (retencao independente).
      const prior = rows(await query(`/* enqueue:replay */ SELECT o.id, o.confirmacao_id, o.recuperacao_id, o.email_destino,
        COALESCE(c.usuario_id, r.usuario_id) AS usuario_id,
        CASE WHEN c.id IS NOT NULL THEN c.finalidade ELSE 'recuperacao' END AS finalidade,
        c.email_version_esperada, r.auth_version_esperada,
        to_char(o.criada_em AT TIME ZONE 'UTC', ${STAMP}) AS criada_em,
        to_char(COALESCE(c.criada_em, r.criada_em) AT TIME ZONE 'UTC', ${STAMP}) AS desafio_criada_em
        FROM public.auth_outbox o
        LEFT JOIN public.auth_email_confirmacao c ON c.id = o.confirmacao_id
        LEFT JOIN public.auth_recuperacao_senha r ON r.id = o.recuperacao_id
        WHERE o.id = $1::uuid FOR UPDATE OF o`, [req.emissaoId]));
      if (prior.length > 1) fail("AUTH_ENQUEUE_DB_RESULTADO_INVALIDO");
      if (prior.length) {
        const old = prior[0];
        if (old.id !== req.emissaoId || old.usuario_id !== req.usuarioId || old.finalidade !== req.finalidade ||
            old.email_destino !== destination || (req.finalidade === "recuperacao"
              ? old.recuperacao_id !== req.emissaoId || old.confirmacao_id !== null || old.auth_version_esperada !== req.expectedAuthVersion
              : old.confirmacao_id !== req.emissaoId || old.recuperacao_id !== null || old.email_version_esperada !== req.expectedEmailVersion)) {
          fail("AUTH_ENQUEUE_IDENTIDADE_DIVERGENTE");
        }
        if (!decision.repetida || old.criada_em !== time || old.desafio_criada_em !== time) fail("AUTH_ENQUEUE_ESTADO_INCONSISTENTE");
        await query("RELEASE SAVEPOINT auth_enqueue_guard"); savepoint = false; return RESULT;
      }
      if (decision.repetida) fail("AUTH_ENQUEUE_ESTADO_INCONSISTENTE");
      const table = req.finalidade === "recuperacao" ? "auth_recuperacao_senha" : "auth_email_confirmacao";
      const previous = rows(await query(`/* enqueue:previous */ SELECT id,
        to_char(criada_em AT TIME ZONE 'UTC', ${STAMP}) AS criada_em
        FROM public.${table} WHERE usuario_id = $1 AND consumida_em IS NULL AND invalidada_em IS NULL FOR UPDATE`, [req.usuarioId]));
      if (previous.length > 1 || previous.some(p => !instant(p.criada_em) || micros(p.criada_em) > micros(time))) fail("AUTH_ENQUEUE_ESTADO_INCONSISTENTE");
      if (previous.length) {
        const invalidated = await query(`/* enqueue:invalidate */ UPDATE public.${table} SET invalidada_em = $2::timestamptz
          WHERE id = $1::uuid AND usuario_id = $3 AND consumida_em IS NULL AND invalidada_em IS NULL RETURNING id`,
        [previous[0].id, time, req.usuarioId]);
        if (invalidated.rowCount !== 1 || one(invalidated).id !== previous[0].id) fail("AUTH_ENQUEUE_DB_RESULTADO_INVALIDO");
      }
      tokenBytes = crypto.randomBytes(32); // 256 bits; representacao base64url opaca de 43 bytes.
      if (!Buffer.isBuffer(tokenBytes) || tokenBytes.length !== 32) fail("AUTH_ENQUEUE_TOKEN_FALHOU");
      token = Buffer.from(tokenBytes.toString("base64url"), "ascii");
      const tokenHash = crypto.createHash("sha256").update(token).digest();
      const context = { mensagemId: req.emissaoId, desafioId: req.emissaoId, finalidade: req.finalidade, emailDestino: destination };
      payload = Buffer.concat([Buffer.from('{"v":1,"token":"'), token, Buffer.from('"}')]);
      const envelope = cipher.cifrar(context, payload);
      const challengeSql = req.finalidade === "recuperacao"
        ? `/* enqueue:challenge */ INSERT INTO public.auth_recuperacao_senha
          (id, usuario_id, token_hash, auth_version_esperada, criada_em, expira_em)
          VALUES ($1::uuid, $2, $3, $4, $5::timestamptz, $5::timestamptz + interval '30 minutes')
          RETURNING id, to_char(criada_em AT TIME ZONE 'UTC', ${STAMP}) AS criada_em,
            to_char(expira_em AT TIME ZONE 'UTC', ${STAMP}) AS expira_em`
        : `/* enqueue:challenge */ INSERT INTO public.auth_email_confirmacao
          (id, usuario_id, token_hash, email_version_esperada, criada_em, expira_em, email_candidato, finalidade)
          VALUES ($1::uuid, $2, $3, $4, $5::timestamptz, $5::timestamptz + interval '24 hours', $6::public.citext, $7)
          RETURNING id, to_char(criada_em AT TIME ZONE 'UTC', ${STAMP}) AS criada_em,
            to_char(expira_em AT TIME ZONE 'UTC', ${STAMP}) AS expira_em`;
      const values = [req.emissaoId, req.usuarioId, tokenHash,
        req.finalidade === "recuperacao" ? req.expectedAuthVersion : req.expectedEmailVersion, time];
      if (req.finalidade !== "recuperacao") values.push(destination, req.finalidade);
      const inserted = await query(challengeSql, values);
      const challenge = one(inserted);
      const lifetime = req.finalidade === "recuperacao" ? 1800n : 86400n;
      if (inserted.rowCount !== 1 || challenge.id !== req.emissaoId || challenge.criada_em !== time ||
          !instant(challenge.expira_em) || micros(challenge.expira_em) - micros(time) !== lifetime * 1000000n) fail("AUTH_ENQUEUE_DB_RESULTADO_INVALIDO");
      const message = await query(`/* enqueue:outbox */ INSERT INTO public.auth_outbox
        (id, confirmacao_id, recuperacao_id, email_destino, conteudo_cifrado, nonce, auth_tag, key_id,
          status, tentativas, criada_em, proxima_tentativa_em)
        VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, 'pending', 0, $9::timestamptz, $9::timestamptz)
        RETURNING id`, [req.emissaoId, req.finalidade === "recuperacao" ? null : req.emissaoId,
          req.finalidade === "recuperacao" ? req.emissaoId : null, destination,
          envelope.conteudoCifrado, envelope.nonce, envelope.authTag, envelope.keyId, time]);
      if (message.rowCount !== 1 || one(message).id !== req.emissaoId) fail("AUTH_ENQUEUE_DB_RESULTADO_INVALIDO");
      // Auditoria obrigatoria e critica, com apenas IDs/finalidade; mesmo cliente sem facade que loga parametros.
      const auditExecutor = Object.freeze({ ...executor, query });
      const audited = await audit({ usuario_id: req.usuarioId, acao: "auth_desafio_emitido", modulo: "auth",
        entidade: "auth_outbox", entidade_id: req.emissaoId, detalhes: { finalidade: req.finalidade }, critica: true }, auditExecutor);
      if (!audited || audited.ok !== true || !audited.data || audited.data.id == null ||
          audited.data.usuario_id !== req.usuarioId || audited.data.entidade_id !== req.emissaoId ||
          audited.data.acao !== "auth_desafio_emitido" || audited.data.modulo !== "auth") fail("AUTH_ENQUEUE_AUDITORIA_FALHOU");
      await query("RELEASE SAVEPOINT auth_enqueue_guard"); savepoint = false;
      return RESULT; // Provisorio: commit e responsabilidade exclusiva do chamador db.tx.
    } catch (error) {
      if (savepoint) {
        try { await undo(); } catch { fail("AUTH_ENQUEUE_ROLLBACK_FALHOU"); }
      }
      if (error instanceof AuthEnqueueError) throw error;
      if (error instanceof AuthQuotaError) fail(error.code === "AUTH_QUOTA_EMISSAO_DIVERGENTE"
        ? "AUTH_ENQUEUE_IDENTIDADE_DIVERGENTE" : "AUTH_ENQUEUE_QUOTA_FALHOU");
      if (error?.code === "23505" && error?.constraint === "auth_outbox_key_nonce_uq") fail("AUTH_ENQUEUE_NONCE_COLISAO");
      fail("AUTH_ENQUEUE_FALHOU");
    } finally { token?.fill(0); tokenBytes?.fill(0); payload?.fill(0); }
  }
  return Object.freeze({ enqueue });
}

module.exports = { createAuthEnqueueService, AuthEnqueueError };
