/* eslint-disable no-console */
"use strict";

/**
 * ✅ backend/src/controllers/contaExclusaoController.js — v1.0
 * Plataforma Escola da Saúde
 *
 * Função:
 * - Solicitação pública de exclusão de conta.
 * - Solicitação autenticada de exclusão de conta.
 * - Confirmação por token.
 * - Anonimização segura da conta.
 *
 * Não faz:
 * - DELETE físico em usuarios.
 * - Remoção de registros institucionais obrigatórios.
 */

const bcrypt = require("bcrypt");
const crypto = require("crypto");

const dbModule = require("../db");
const db = dbModule?.db ?? dbModule;

const { sendEmail: enviarEmail } = require("../services/mailer");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const TOKEN_BYTES = 32;
const TOKEN_TTL_HOURS = 24;

function normEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function safePreview(value, start = 6, end = 4) {
  const text = String(value || "");
  if (!text) return "";
  if (text.length <= start + end) return "***";
  return `${text.slice(0, start)}...${text.slice(-end)}`;
}

function removeTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function normalizeFrontendBase(raw) {
  const base = removeTrailingSlash(String(raw || "").trim());
  if (!base) return "";
  if (/^https?:\/\/.+/i.test(base)) return base;
  return "";
}

function getFrontendBaseFromRequest(req) {
  const staticBase = normalizeFrontendBase(process.env.FRONTEND_URL);
  if (staticBase) return staticBase;

  const origin = String(req.headers.origin || "").trim();
  if (/^https?:\/\/.+/i.test(origin)) return removeTrailingSlash(origin);

  const forwardedProto = String(req.headers["x-forwarded-proto"] || "")
    .trim()
    .toLowerCase();
  const forwardedHost = String(req.headers["x-forwarded-host"] || "").trim();

  if (forwardedProto === "https" && forwardedHost) {
    return `https://${removeTrailingSlash(forwardedHost)}`;
  }

  if (process.env.NODE_ENV !== "production") {
    return "http://localhost:5173";
  }

  return "";
}

function getClientIp(req) {
  return (
    String(req.headers["x-forwarded-for"] || "")
      .split(",")[0]
      .trim() ||
    req.ip ||
    null
  );
}

function getUserAgent(req) {
  return String(req.headers["user-agent"] || "").slice(0, 1000) || null;
}

function gerarToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString("base64url");
}

function hashToken(token) {
  return crypto
    .createHash("sha256")
    .update(String(token || ""))
    .digest("hex");
}

function getHmacSecret() {
  return (
    String(process.env.DATA_ERASURE_HMAC_SECRET || "").trim() ||
    String(process.env.JWT_SECRET || "").trim()
  );
}

function hmacPersonalData(value) {
  const secret = getHmacSecret();

  if (!secret || !value) return null;

  return crypto
    .createHmac("sha256", secret)
    .update(String(value))
    .digest("hex");
}

function buildDeletionLink(req, token) {
  const base = getFrontendBaseFromRequest(req);
  const encoded = encodeURIComponent(String(token || "").trim());

  return `${base}/excluir-conta/confirmar/${encoded}`;
}

function calcularDigitoCpf(digits, pesoInicial) {
  let soma = 0;

  for (let i = 0; i < digits.length; i += 1) {
    soma += Number(digits[i]) * (pesoInicial - i);
  }

  const resto = soma % 11;
  const digito = 11 - resto;

  return digito >= 10 ? 0 : digito;
}

function gerarCpfValidoSintetico(usuarioId) {
  const id = Number(usuarioId);

  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error("usuarioId inválido para CPF sintético.");
  }

  const baseNumero = 100000000 + (id % 800000000);
  const base = String(baseNumero).padStart(9, "0").slice(0, 9);

  const d1 = calcularDigitoCpf(base, 10);
  const d2 = calcularDigitoCpf(`${base}${d1}`, 11);

  return `${base}${d1}${d2}`;
}

function gerarEmailSintetico(usuarioId) {
  return `usuario.excluido.${usuarioId}@conta-excluida.invalid`;
}

function montarEmailExclusaoConta({ nome, link }) {
  const nomeSeguro = String(nome || "usuário").trim() || "usuário";

  const text = [
    `Olá, ${nomeSeguro}.`,
    "",
    "Recebemos uma solicitação para excluir sua conta da Plataforma Escola da Saúde.",
    "",
    "Para confirmar a exclusão, acesse o link abaixo:",
    link,
    "",
    "Se você não solicitou esta exclusão, ignore esta mensagem.",
    "",
    "Ao confirmar, seus dados pessoais de cadastro serão removidos ou anonimizados. Registros institucionais necessários para obrigações administrativas, auditoria, certificados, presenças e segurança poderão ser preservados.",
    "",
    "Secretaria Municipal de Saúde — Escola da Saúde",
  ].join("\n");

  const html = `
  <div style="margin:0;padding:24px;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a;">
    <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:24px;overflow:hidden;">
      <div style="padding:24px 28px;background:#064e3b;color:#ffffff;">
        <h1 style="margin:0;font-size:22px;line-height:1.25;">Exclusão de conta</h1>
        <p style="margin:8px 0 0;font-size:14px;line-height:1.5;color:#dcfce7;">
          Plataforma Escola da Saúde
        </p>
      </div>

      <div style="padding:28px;">
        <p style="margin:0 0 14px;font-size:15px;line-height:1.6;">
          Olá, <strong>${nomeSeguro}</strong>.
        </p>

        <p style="margin:0 0 14px;font-size:15px;line-height:1.6;">
          Recebemos uma solicitação para excluir sua conta da Plataforma Escola da Saúde.
        </p>

        <p style="margin:0 0 22px;font-size:15px;line-height:1.6;">
          Para confirmar a exclusão, clique no botão abaixo:
        </p>

        <p style="margin:0 0 24px;text-align:center;">
          <a href="${link}" style="display:inline-block;padding:13px 20px;border-radius:14px;background:#dc2626;color:#ffffff;text-decoration:none;font-weight:700;">
            Confirmar exclusão da conta
          </a>
        </p>

        <p style="margin:0 0 14px;font-size:13px;line-height:1.6;color:#64748b;">
          Se você não solicitou esta exclusão, ignore esta mensagem.
        </p>

        <p style="margin:0;font-size:13px;line-height:1.6;color:#64748b;">
          Ao confirmar, seus dados pessoais de cadastro serão removidos ou anonimizados. Registros institucionais necessários para obrigações administrativas, auditoria, certificados, presenças e segurança poderão ser preservados.
        </p>
      </div>

      <div style="border-top:1px solid #e5e7eb;padding:16px 28px;background:#f8fafc;text-align:center;">
        <p style="margin:0;font-size:12px;line-height:1.5;color:#64748b;">
          Secretaria Municipal de Saúde — Escola da Saúde
        </p>
      </div>
    </div>
  </div>
  `;

  return { text, html };
}

async function criarSolicitacao(req, usuario, origem) {
  const token = gerarToken();
  const tokenHash = hashToken(token);
  const emailHmac = hmacPersonalData(normEmail(usuario.email));

  await db.query(
    `
    UPDATE account_deletion_requests
       SET status = CASE
                      WHEN expires_at <= now() THEN 'expired'
                      ELSE 'superseded'
                    END
     WHERE usuario_id = $1
       AND status = 'pending'
    `,
    [usuario.id],
  );

  await db.query(
    `
    INSERT INTO account_deletion_requests (
      usuario_id,
      email_original_hmac,
      token_hash,
      status,
      origem,
      expires_at,
      ip_request,
      user_agent_request
    )
    VALUES (
      $1,
      $2,
      $3,
      'pending',
      $4,
      now() + ($5::text || ' hours')::interval,
      $6,
      $7
    )
    `,
    [
      usuario.id,
      emailHmac,
      tokenHash,
      origem,
      TOKEN_TTL_HOURS,
      getClientIp(req),
      getUserAgent(req),
    ],
  );

  await db.query(
    `
    UPDATE usuarios
       SET deletion_requested_at = now()
     WHERE id = $1
    `,
    [usuario.id],
  );

  const link = buildDeletionLink(req, token);
  const email = montarEmailExclusaoConta({
    nome: usuario.nome,
    link,
  });

  await enviarEmail({
    to: usuario.email,
    subject: "Confirmação de exclusão de conta — Escola da Saúde",
    text: email.text,
    html: email.html,
  });

  return true;
}

async function solicitarPublica(req, res) {
  const email = normEmail(req.body?.email);

  if (!email) {
    return res.status(422).json({
      ok: false,
      code: "CONTA_EXCLUSAO-422-EMAIL-OBRIGATORIO",
      message: "Informe o e-mail cadastrado.",
      fieldErrors: {
        email: "Informe o e-mail cadastrado.",
      },
    });
  }

  if (!EMAIL_RE.test(email)) {
    return res.status(422).json({
      ok: false,
      code: "CONTA_EXCLUSAO-422-EMAIL-INVALIDO",
      message: "E-mail inválido.",
      fieldErrors: {
        email: "Formato inválido.",
      },
    });
  }

  const respostaIdempotente = {
    ok: true,
    code: "CONTA_EXCLUSAO-200-SOLICITACAO-RECEBIDA",
    message:
      "Se o e-mail estiver cadastrado, enviaremos as instruções para confirmar a exclusão.",
  };

  try {
    const result = await db.query(
      `
      SELECT id, nome, email, cpf, deleted_at
        FROM usuarios
       WHERE LOWER(email::text) = LOWER($1)
       LIMIT 1
      `,
      [email],
    );

    const usuario = result.rows?.[0];

    if (!usuario || usuario.deleted_at) {
      console.log("[contaExclusao.solicitarPublica] resposta idempotente", {
        emailPreview: safePreview(email),
        found: Boolean(usuario),
        deleted: Boolean(usuario?.deleted_at),
      });

      return res.status(200).json(respostaIdempotente);
    }

    await criarSolicitacao(req, usuario, "web");

    return res.status(200).json(respostaIdempotente);
  } catch (error) {
    console.error("[contaExclusao.solicitarPublica] ERRO", {
      message: error?.message,
      emailPreview: safePreview(email),
    });

    return res.status(200).json(respostaIdempotente);
  }
}

async function solicitarAutenticada(req, res) {
  const usuarioId = Number(req.user?.id || req.userId);

  if (!Number.isSafeInteger(usuarioId) || usuarioId <= 0) {
    return res.status(401).json({
      ok: false,
      code: "CONTA_EXCLUSAO-401-NAO-AUTENTICADO",
      message: "Não autenticado.",
    });
  }

  try {
    const result = await db.query(
      `
      SELECT id, nome, email, cpf, deleted_at
        FROM usuarios
       WHERE id = $1
       LIMIT 1
      `,
      [usuarioId],
    );

    const usuario = result.rows?.[0];

    if (!usuario || usuario.deleted_at) {
      return res.status(404).json({
        ok: false,
        code: "CONTA_EXCLUSAO-404-USUARIO-NAO-ENCONTRADO",
        message: "Usuário não encontrado.",
      });
    }

    await criarSolicitacao(req, usuario, "app");

    return res.status(200).json({
      ok: true,
      code: "CONTA_EXCLUSAO-200-CONFIRMACAO-ENVIADA",
      message: "Enviamos um e-mail para confirmar a exclusão da sua conta.",
    });
  } catch (error) {
    console.error("[contaExclusao.solicitarAutenticada] ERRO", {
      message: error?.message,
      usuarioId,
    });

    return res.status(500).json({
      ok: false,
      code: "CONTA_EXCLUSAO-500-FALHA-SOLICITACAO",
      message: "Não foi possível solicitar a exclusão da conta.",
    });
  }
}

async function confirmar(req, res) {
  const tokenRaw = req.body?.token || "";
  let token = String(tokenRaw || "").trim();

  try {
    token = decodeURIComponent(token);
  } catch {
    // mantém bruto
  }

  if (!token) {
    return res.status(422).json({
      ok: false,
      code: "CONTA_EXCLUSAO-422-TOKEN-OBRIGATORIO",
      message: "Token ausente.",
      fieldErrors: {
        token: "Token ausente.",
      },
    });
  }

  const tokenHash = hashToken(token);
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const requestQ = await client.query(
      `
      SELECT
        r.id AS request_id,
        r.usuario_id,
        r.status,
        r.expires_at,
        u.id,
        u.nome,
        u.email,
        u.cpf,
        u.deleted_at
      FROM account_deletion_requests r
      JOIN usuarios u ON u.id = r.usuario_id
      WHERE r.token_hash = $1
      FOR UPDATE
      `,
      [tokenHash],
    );

    const row = requestQ.rows?.[0];

    if (
      !row ||
      row.status !== "pending" ||
      new Date(row.expires_at) <= new Date()
    ) {
      if (row?.request_id && row.status === "pending") {
        await client.query(
          `
          UPDATE account_deletion_requests
             SET status = 'expired'
           WHERE id = $1
          `,
          [row.request_id],
        );
      }

      await client.query("COMMIT");

      return res.status(400).json({
        ok: false,
        code: "CONTA_EXCLUSAO-400-TOKEN-INVALIDO-EXPIRADO",
        message: "Token inválido ou expirado.",
      });
    }

    if (row.deleted_at) {
      await client.query(
        `
        UPDATE account_deletion_requests
           SET status = 'processed',
               confirmed_at = COALESCE(confirmed_at, now()),
               processed_at = COALESCE(processed_at, now()),
               ip_confirm = $2,
               user_agent_confirm = $3
         WHERE id = $1
        `,
        [row.request_id, getClientIp(req), getUserAgent(req)],
      );

      await client.query("COMMIT");

      return res.status(200).json({
        ok: true,
        code: "CONTA_EXCLUSAO-200-JA_PROCESSADA",
        message: "A conta já havia sido excluída.",
      });
    }

    const usuarioId = row.usuario_id;
    const cpfSintetico = gerarCpfValidoSintetico(usuarioId);
    const emailSintetico = gerarEmailSintetico(usuarioId);
    const senhaAleatoria = crypto.randomBytes(48).toString("hex");
    const senhaHash = await bcrypt.hash(senhaAleatoria, 10);

    const emailHmac = hmacPersonalData(normEmail(row.email));
    const cpfHmac = hmacPersonalData(String(row.cpf || ""));

    await client.query(
      `
      DELETE FROM assinaturas
       WHERE usuario_id = $1
      `,
      [usuarioId],
    );

    await client.query(
      `
      DELETE FROM notificacoes
       WHERE usuario_id = $1
      `,
      [usuarioId],
    );

    await client.query(
      `
      DELETE FROM notificacoes_evento_agendadas
       WHERE usuario_id = $1
      `,
      [usuarioId],
    );

    await client.query(
      `
      DELETE FROM notificacoes_programadas
       WHERE usuario_id = $1
      `,
      [usuarioId],
    );

    await client.query(
      `
      UPDATE usuarios
         SET nome = 'Usuário Excluído',
             cpf = $2,
             email = $3,
             senha = $4,
             perfil = 'usuario',
             registro = NULL,
             unidade_id = NULL,
             data_nascimento = NULL,
             cargo_id = NULL,
             genero_id = NULL,
             orientacao_sexual_id = NULL,
             cor_raca_id = NULL,
             escolaridade_id = NULL,
             deficiencia_id = NULL,
             celular = NULL,
             deleted_at = now(),
             deleted_reason = 'user_request',
             deletion_confirmed_at = now(),
             deletion_processed_at = now(),
             email_hmac_deleted = $5,
             cpf_hmac_deleted = $6
       WHERE id = $1
      `,
      [usuarioId, cpfSintetico, emailSintetico, senhaHash, emailHmac, cpfHmac],
    );

    await client.query(
      `
      UPDATE account_deletion_requests
         SET status = 'processed',
             confirmed_at = now(),
             processed_at = now(),
             ip_confirm = $2,
             user_agent_confirm = $3
       WHERE id = $1
      `,
      [row.request_id, getClientIp(req), getUserAgent(req)],
    );

    await client.query("COMMIT");

    console.log("[contaExclusao.confirmar] conta anonimizada", {
      usuarioId,
      requestId: row.request_id,
    });

    return res.status(200).json({
      ok: true,
      code: "CONTA_EXCLUSAO-200-CONTA-EXCLUIDA",
      message: "Conta excluída com sucesso.",
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("[contaExclusao.confirmar] ERRO", {
      message: error?.message,
      code: error?.code,
      detail: error?.detail,
      constraint: error?.constraint,
    });

    return res.status(500).json({
      ok: false,
      code: "CONTA_EXCLUSAO-500-FALHA-CONFIRMACAO",
      message: "Não foi possível confirmar a exclusão da conta.",
    });
  } finally {
    client.release();
  }
}

module.exports = {
  solicitarPublica,
  solicitarAutenticada,
  confirmar,
};
