/* eslint-disable no-console */
"use strict";

/**
 * ✅ backend/src/controllers/loginController.js — v2.1
 * Atualizado em 23/06/2026
 * Plataforma Escola da Saúde
 *
 * Rota oficial:
 * - POST /api/login
 *
 * Contrato oficial:
 * - Login por CPF e senha.
 * - Token retornado exclusivamente no JSON.
 * - Frontend usa Authorization: Bearer <token>.
 * - Sem cookie de autenticação.
 * - Perfil oficial vindo de usuarios.perfil.
 * - Perfil é string única.
 * - Perfis oficiais: usuario, organizador, administrador.
 *
 * Segurança v2.1:
 * - Bloqueia login de conta excluída: usuarios.deleted_at IS NOT NULL.
 *
 * Observação obrigatória:
 * - generateToken.js também deve trabalhar com perfil como string única.
 */

const { performance } = require("node:perf_hooks");
const { verifyPassword, PasswordServiceError } = require("../services/passwordService");
const { isWellFormedUnicode } = require("../services/passwordStructure");

const dbModule = require("../db");
const generateToken = require("../auth/generateToken");
const { isValidAuthVersion } = require("../auth/authVersion");
const { gerarNotificacaoDeAvaliacao } = require("./notificacaoController");
const { createAuthSessionService } = require("../services/authSessionService");
const { sessionCookieName, sessionCookieOptions } = require("../auth/authSessionMiddleware");

/* ────────────────────────────────────────────────────────────────
   DB
──────────────────────────────────────────────────────────────── */

const defaultDb = dbModule?.db ?? dbModule;

if (!defaultDb?.query || typeof defaultDb.query !== "function") {
  console.error("[loginController] DB inválido:", Object.keys(dbModule || {}));
  throw new Error("DB inválido em loginController.js: query ausente.");
}

function getDb(req) {
  return req?.db?.query ? req.db : defaultDb;
}

/* ────────────────────────────────────────────────────────────────
   Config
──────────────────────────────────────────────────────────────── */

const IS_PROD = process.env.NODE_ENV === "production";

const PERFIS_OFICIAIS = new Set(["usuario", "organizador", "administrador"]);

const DUMMY_BCRYPT_HASH =
  "$2b$10$CwTycUXWue0Thq9StjUM0uJ8N9YqvYQx8rU0lE8r1W3sQ8v7r8E2S";

/* ────────────────────────────────────────────────────────────────
   Logs
──────────────────────────────────────────────────────────────── */

function mkRid(prefix = "AUTH") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function log(rid, level, message, extra) {
  const prefix = `[AUTH][RID=${rid}]`;
  const safeExtra = {
    usuarioId: Number.isInteger(extra?.usuarioId) && extra.usuarioId > 0 && extra.usuarioId <= 2147483647 ? extra.usuarioId : null,
    perfil: PERFIS_OFICIAIS.has(extra?.perfil) ? extra.perfil : null,
  };

  if (level === "error") {
    const metadata = { code: "AUTH_LOGIN_FAILURE" };
    if (["stored_hash_invalid", "crypto_operation_failed", "invalid_db_auth_version"].includes(extra?.diagnostic)) {
      metadata.diagnostic = extra.diagnostic;
    }
    return console.error(`${prefix} ✖ ${message}`, metadata);
  }

  if (!IS_PROD) {
    if (level === "warn") {
      return console.warn(`${prefix} ⚠ ${message}`, safeExtra);
    }

    return console.log(`${prefix} • ${message}`, safeExtra);
  }

  return undefined;
}

/* ────────────────────────────────────────────────────────────────
   Helpers
──────────────────────────────────────────────────────────────── */

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setNoStoreHeaders(res) {
  res.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate",
  );
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  res.set("Surrogate-Control", "no-store");
}

function normalizarPerfilOficial(perfilRaw) {
  const perfil = String(perfilRaw || "").trim();

  if (!perfil) return "";

  if (!PERFIS_OFICIAIS.has(perfil)) return "";

  return perfil;
}

function sanitizeUserForResponse(usuario, perfil) {
  return {
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    cpf: usuario.cpf,
    perfil,
    imagem_base64: usuario.imagem_base64 || null,
  };
}

async function sendInvalidCredentials(res, startedAt) {
  let remaining = 250 - (performance.now() - startedAt);
  while (remaining > 0) {
    await sleep(remaining);
    remaining = 250 - (performance.now() - startedAt);
  }
  return res.status(401).json({
    ok: false,
    code: "AUTH-401-CREDENCIAIS-INVALIDAS",
    message: "CPF ou senha inválidos. Verifique os dados informados e tente novamente.",
    erro: "CPF ou senha inválidos. Verifique os dados informados e tente novamente.",
  });
}

function sendValidationError(res, fieldErrors) {
  return res.status(422).json({
    ok: false,
    code: "AUTH-422-LOGIN-VALIDACAO",
    message: "Erro de validação no login.",
    erro: "Erro de validação no login.",
    fieldErrors,
  });
}

async function compareDummyPassword(senha) {
  try {
    await verifyPassword(senha || "senha-invalida", DUMMY_BCRYPT_HASH);
  } catch {
    // noop
  }
}

/* ────────────────────────────────────────────────────────────────
   Query
──────────────────────────────────────────────────────────────── */

async function buscarUsuarioPorCpf(req, cpf) {
  const db = getDb(req);

  const result = await db.query(
    `
    SELECT
      u.id,
      u.nome,
      u.email,
      u.cpf,
      u.perfil,
      u.auth_version,
      u.senha,
      u.deleted_at,
      a.imagem_base64
    FROM usuarios u
    LEFT JOIN assinaturas a ON a.usuario_id = u.id
    WHERE u.cpf = $1
    LIMIT 1
    `,
    [cpf],
  );

  return result.rows?.[0] || null;
}

/* ────────────────────────────────────────────────────────────────
   POST /api/login
──────────────────────────────────────────────────────────────── */

async function loginUsuario(req, res, next) {
  const startedAt = performance.now();
  const rid = mkRid();
  let sessionService = null;
  let createdSession = null;
  let usuarioIdDaSessao = null;

  setNoStoreHeaders(res);

  try {
    const cpf = onlyDigits(req.body?.cpf);
    const senha =
      typeof req.body?.senha === "string"
        ? req.body.senha
        : String(req.body?.senha || "");
    const manterConectado = req.body?.manter_conectado === true;

    const fieldErrors = {};

    if (!cpf) {
      fieldErrors.cpf = "CPF é obrigatório.";
    } else if (cpf.length !== 11) {
      fieldErrors.cpf = "CPF inválido.";
    }

    if (!senha) {
      fieldErrors.senha = "Senha é obrigatória.";
    }

    if (Object.keys(fieldErrors).length) {
      await sleep(120);
      return sendValidationError(res, fieldErrors);
    }

    const usuario = await buscarUsuarioPorCpf(req, cpf);

    if (!usuario) {
      await compareDummyPassword(senha);
      return await sendInvalidCredentials(res, startedAt);
    }

    if (usuario.deleted_at) {
      await sleep(120);

      log(rid, "warn", "Tentativa de login em conta excluída", {
        usuarioId: usuario.id,
      });

      return res.status(403).json({
        ok: false,
        code: "AUTH-403-CONTA-EXCLUIDA",
        message:
          "Esta conta foi excluída e não pode mais ser acessada. Para utilizar a plataforma novamente, faça um novo cadastro.",
        erro: "Esta conta foi excluída e não pode mais ser acessada. Para utilizar a plataforma novamente, faça um novo cadastro.",
        contaExcluida: true,
      });
    }

    if (!usuario.senha) {
      await compareDummyPassword(senha);

      log(rid, "warn", "Usuário sem hash de senha válido", {
        usuarioId: usuario.id,
      });

      return await sendInvalidCredentials(res, startedAt);
    }

    if (!isWellFormedUnicode(senha)) {
      return await sendInvalidCredentials(res, startedAt);
    }

    let verification;
    try {
      verification = await verifyPassword(senha, usuario.senha);
    } catch (error) {
      if (!(error instanceof PasswordServiceError)) throw error;
      if (error.code === "PASSWORD_INVALID_UNICODE") {
        return await sendInvalidCredentials(res, startedAt);
      }
      const diagnostics = {
        PASSWORD_INVALID_STORED_HASH: "stored_hash_invalid",
        PASSWORD_CRYPTO_OPERATION_FAILED: "crypto_operation_failed",
      };
      if (!Object.hasOwn(diagnostics, error.code)) throw error;
      const diagnostic = diagnostics[error.code];
      log(rid, "error", "Falha na verificação de senha", { diagnostic });
      return res.status(500).json({
        ok: false,
        code: "AUTH-500-LOGIN",
        message: "Erro interno no servidor.",
        erro: "Erro interno no servidor.",
      });
    }

    if (!verification.authenticated) {
      return await sendInvalidCredentials(res, startedAt);
    }

    const perfil = normalizarPerfilOficial(usuario.perfil);

    if (!perfil) {
      log(rid, "warn", "Usuário sem perfil oficial válido", {
        usuarioId: usuario.id,
        perfil: usuario.perfil,
      });

      return res.status(403).json({
        ok: false,
        code: "AUTH-403-PERFIL-INVALIDO",
        message: "Usuário sem perfil de acesso válido.",
        erro: "Usuário sem perfil de acesso válido.",
      });
    }

    if (verification.requiresPasswordChange) {
      return res.status(403).json({
        ok: false,
        code: "AUTH-403-TROCA-SENHA-OBRIGATORIA",
        message: "Por segurança, é necessário atualizar sua senha antes de continuar.",
        erro: "Por segurança, é necessário atualizar sua senha antes de continuar.",
        trocaSenhaObrigatoria: true,
      });
    }

    if (!isValidAuthVersion(usuario.auth_version)) {
      log(rid, "error", "Falha operacional na autenticação", { diagnostic: "invalid_db_auth_version" });
      return res.status(500).json({
        ok: false,
        code: "AUTH-500-LOGIN",
        message: "Erro interno no servidor.",
        erro: "Erro interno no servidor.",
      });
    }

    // canUpgrade/needsRehash não persistem hashes nesta etapa; writer seguro é posterior.
    // JWT legado permanece apenas durante a transição até o cutover de login/cookie.
    const token = generateToken(
      {
        id: usuario.id,
        perfil,
        auth_version: usuario.auth_version,
      },
      "1d",
    );

    sessionService = createAuthSessionService({ db: getDb(req) });
    usuarioIdDaSessao = usuario.id;
    createdSession = await sessionService.createSession({
      usuarioId: usuario.id,
      expectedAuthVersion: usuario.auth_version,
      manterConectado,
      userAgent: typeof req.get === "function" ? req.get("user-agent") : req.headers?.["user-agent"],
      ip: req.ip ?? null,
    });

    const usuarioResponse = sanitizeUserForResponse(usuario, perfil);

    try {
      await gerarNotificacaoDeAvaliacao(usuario.id);
    } catch (error) {
      log(
        rid,
        "warn",
        "Falha ao gerar notificações de avaliação; login preservado",
        error?.message || error,
      );
    }

    res.cookie(
      sessionCookieName(IS_PROD),
      createdSession.token,
      sessionCookieOptions(IS_PROD, manterConectado),
    );

    const response = res.status(200).json({
      ok: true,
      code: "AUTH-200-LOGIN",
      message: "Login realizado com sucesso.",
      token,
      usuario: usuarioResponse,
    });

    log(rid, "info", "login OK", {
      usuarioId: usuario.id,
      perfil,
    });

    return response;
  } catch (error) {
    if (!createdSession && error?.code === "AUTH_SESSION_CREDENTIAL_STATE_CHANGED") {
      return await sendInvalidCredentials(res, startedAt);
    }
    log(rid, "error", "Erro no login", error);

    if (createdSession?.session?.id && sessionService && usuarioIdDaSessao !== null) {
      try {
        await sessionService.revokeSession(
          usuarioIdDaSessao,
          createdSession.session.id,
          "login_response_failure",
        );
      } catch (revokeError) {
        log(rid, "error", "Falha na revogação compensatória da sessão", {
          code: revokeError?.code || "AUTH_SESSION_REVOKE_FAILED",
        });
      }
    }

    if (typeof next === "function") return next(error);

    return res.status(500).json({
      ok: false,
      code: "AUTH-500-LOGIN",
      message: "Erro interno no servidor.",
      erro: "Erro interno no servidor.",
    });
  }
}

module.exports = {
  loginUsuario,
};
