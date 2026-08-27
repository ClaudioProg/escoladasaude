// ✅ backend/src/auth/authMiddleware.js — v2.1
// Atualizado em 23/06/2026
/* eslint-disable no-console */
"use strict";

/**
 * Plataforma Escola da Saúde
 *
 * Contrato oficial de autenticação:
 * - Token recebido exclusivamente por Authorization: Bearer <token>
 * - JWT oficial:
 *   {
 *     sub: string,
 *     perfil: "usuario" | "organizador" | "administrador"
 *   }
 *
 * Request oficial após autenticação:
 * - req.user
 * - req.userId
 * - req.perfil
 *
 * Segurança v2.1:
 * - Além de validar o JWT, consulta o banco.
 * - Bloqueia usuários inexistentes.
 * - Bloqueia usuários com deleted_at IS NOT NULL.
 * - Usa sempre o perfil atual do banco, não apenas o perfil gravado no token.
 */

const jwt = require("jsonwebtoken");

const dbModule = require("../db");
const db = dbModule?.db ?? dbModule;

/* ──────────────────────────────────────────────────────────────
   Constantes oficiais
────────────────────────────────────────────────────────────── */

const PERFIS_OFICIAIS = new Set(["usuario", "organizador", "administrador"]);
const PERFIL_ADMINISTRADOR = "administrador";

const IS_PROD = process.env.NODE_ENV === "production";
const JWT_ISS = process.env.JWT_ISSUER || undefined;
const JWT_AUD = process.env.JWT_AUDIENCE || undefined;

/* ──────────────────────────────────────────────────────────────
   Contratos obrigatórios
────────────────────────────────────────────────────────────── */

if (!db || typeof db.query !== "function") {
  console.error("[authMiddleware] db.query inválido:", db);
  throw new Error("Contrato inválido: backend/src/db deve exportar query.");
}

/* ──────────────────────────────────────────────────────────────
   Helpers
────────────────────────────────────────────────────────────── */

function requestUrlForLog(req) {
  const url = String(req?.originalUrl || req?.url || "");
  const queryStart = url.indexOf("?");

  return queryStart >= 0 ? url.slice(0, queryStart) : url;
}

function buildAuthLog(req, extra = {}) {
  return {
    requestId: req.requestId || null,
    method: req.method,
    url: requestUrlForLog(req),
    ip: req.ip,
    userAgent: req.headers?.["user-agent"] || null,
    ...extra,
  };
}

function buildAuthErrorResponse(res, status, message, extra = {}) {
  return res.status(status).json({
    ok: false,
    erro: message,
    autenticado: false,
    requestId: res.getHeader("X-Request-Id"),
    ...extra,
  });
}

function normalizarPerfilOficial(perfil) {
  const valor = String(perfil || "").trim();

  if (!valor) return "";
  if (!PERFIS_OFICIAIS.has(valor)) return "";

  return valor;
}

function perfilPermitido(perfilUsuario, perfisPermitidos = []) {
  const perfil = normalizarPerfilOficial(perfilUsuario);

  if (!perfil) return false;

  if (!Array.isArray(perfisPermitidos) || !perfisPermitidos.length) {
    return false;
  }

  return perfisPermitidos.some((item) => {
    const permitido = normalizarPerfilOficial(item);
    return permitido && permitido === perfil;
  });
}

function extractToken(req) {
  const authorization = String(req.headers?.authorization || "").trim();
  const bearerMatch = authorization.match(/^Bearer\s+(.+)$/i);

  if (!bearerMatch?.[1]?.trim()) {
    return null;
  }

  return bearerMatch[1].trim();
}

function getJwtSecret() {
  const jwtSecret = String(process.env.JWT_SECRET || "").trim();

  if (!jwtSecret) return null;

  return jwtSecret;
}

function verifyJwtToken(token) {
  const jwtSecret = getJwtSecret();

  if (!jwtSecret) {
    const error = new Error("JWT_SECRET ausente ou inválido.");
    error.code = "JWT_SECRET_MISSING";
    throw error;
  }

  const verifyOptions = {};

  if (JWT_ISS) verifyOptions.issuer = JWT_ISS;
  if (JWT_AUD) verifyOptions.audience = JWT_AUD;

  return jwt.verify(token, jwtSecret, verifyOptions);
}

function normalizeUserFromJwt(decoded) {
  const id = Number(decoded?.sub);

  if (!Number.isSafeInteger(id) || id <= 0) {
    return null;
  }

  const perfil = normalizarPerfilOficial(decoded?.perfil);

  if (!perfil) {
    return null;
  }

  return {
    id,
    perfil,
  };
}

async function carregarUsuarioAtivoDoBanco(usuarioJwt) {
  const id = Number(usuarioJwt?.id);

  if (!Number.isSafeInteger(id) || id <= 0) {
    return {
      ok: false,
      reason: "invalid_id",
      user: null,
    };
  }

  const result = await db.query(
    `
    SELECT
      id,
      perfil,
      deleted_at
    FROM usuarios
    WHERE id = $1
    LIMIT 1
    `,
    [id],
  );

  const row = result.rows?.[0];

  if (!row) {
    return {
      ok: false,
      reason: "not_found",
      user: null,
    };
  }

  if (row.deleted_at) {
    return {
      ok: false,
      reason: "deleted",
      user: null,
    };
  }

  const perfil = normalizarPerfilOficial(row.perfil);

  if (!perfil) {
    return {
      ok: false,
      reason: "invalid_profile",
      user: null,
    };
  }

  return {
    ok: true,
    reason: null,
    user: {
      id: Number(row.id),
      perfil,
    },
  };
}

function attachUserContext(req, res, user) {
  req.db = req.db ?? db;

  req.user = user;
  req.userId = user.id;
  req.perfil = user.perfil;

  res.locals.user = user;
}

/* ──────────────────────────────────────────────────────────────
   Core de autenticação
────────────────────────────────────────────────────────────── */

async function authenticateRequest(req, res) {
  const token = extractToken(req);

  if (!token) {
    if (!IS_PROD) {
      console.warn(
        "[authMiddleware] token ausente",
        buildAuthLog(req, { tokenSource: null }),
      );
    }

    return {
      ok: false,
      response: buildAuthErrorResponse(res, 401, "Não autenticado.", {
        code: "AUTH-401-NAO-AUTENTICADO",
        sessionExpired: false,
      }),
    };
  }

  try {
    const decoded = verifyJwtToken(token);
    const userFromJwt = normalizeUserFromJwt(decoded);

    if (!userFromJwt) {
      console.warn(
        "[authMiddleware] payload JWT fora do contrato oficial",
        buildAuthLog(req, {
          decodedKeys: decoded ? Object.keys(decoded) : [],
        }),
      );

      return {
        ok: false,
        response: buildAuthErrorResponse(res, 401, "Sessão inválida.", {
          code: "AUTH-401-SESSAO-INVALIDA",
          sessionExpired: true,
        }),
      };
    }

    const banco = await carregarUsuarioAtivoDoBanco(userFromJwt);

    if (!banco.ok) {
      console.warn(
        "[authMiddleware] usuário bloqueado na validação de sessão",
        buildAuthLog(req, {
          userId: userFromJwt.id,
          reason: banco.reason,
        }),
      );

      const isDeleted = banco.reason === "deleted";

      return {
        ok: false,
        response: buildAuthErrorResponse(
          res,
          401,
          isDeleted
            ? "Conta excluída. Faça um novo cadastro para utilizar a plataforma."
            : "Sessão inválida.",
          {
            code: isDeleted
              ? "AUTH-401-CONTA-EXCLUIDA"
              : "AUTH-401-USUARIO-INDISPONIVEL",
            sessionExpired: true,
            contaExcluida: isDeleted,
          },
        ),
      };
    }

    attachUserContext(req, res, banco.user);

    return {
      ok: true,
      user: banco.user,
      decoded,
    };
  } catch (error) {
    const isExpired = error?.name === "TokenExpiredError";
    const isJwtError =
      error?.name === "JsonWebTokenError" || error?.name === "NotBeforeError";
    const isSecretMissing = error?.code === "JWT_SECRET_MISSING";

    if (isSecretMissing) {
      console.error(
        "[authMiddleware] JWT_SECRET ausente ou inválido",
        buildAuthLog(req),
      );

      return {
        ok: false,
        response: res.status(500).json({
          ok: false,
          erro: "Falha de configuração de autenticação.",
          code: "AUTH-500-JWT-SECRET-AUSENTE",
          autenticado: false,
          requestId: res.getHeader("X-Request-Id"),
        }),
      };
    }

    if (isExpired) {
      return {
        ok: false,
        response: buildAuthErrorResponse(res, 401, "Token expirado.", {
          code: "AUTH-401-TOKEN-EXPIRADO",
          sessionExpired: true,
        }),
      };
    }

    if (isJwtError) {
      return {
        ok: false,
        response: buildAuthErrorResponse(res, 401, "Token inválido.", {
          code: "AUTH-401-TOKEN-INVALIDO",
          sessionExpired: true,
        }),
      };
    }

    console.error(
      "[authMiddleware] falha inesperada na autenticação",
      buildAuthLog(req, {
        errorName: error?.name,
        errorMessage: error?.message,
        errorCode: error?.code,
        errorConstraint: error?.constraint,
      }),
    );

    return {
      ok: false,
      response: res.status(500).json({
        ok: false,
        erro: "Falha ao validar sessão.",
        code: "AUTH-500-FALHA-VALIDACAO-SESSAO",
        autenticado: false,
        requestId: res.getHeader("X-Request-Id"),
      }),
    };
  }
}

/* ──────────────────────────────────────────────────────────────
   Middlewares
────────────────────────────────────────────────────────────── */

async function authMiddleware(req, res, next) {
  const authResult = await authenticateRequest(req, res);

  if (!authResult.ok) {
    return authResult.response;
  }

  return next();
}

async function authAdmin(req, res, next) {
  const authResult = await authenticateRequest(req, res);

  if (!authResult.ok) {
    return authResult.response;
  }

  if (!perfilPermitido(req.user.perfil, [PERFIL_ADMINISTRADOR])) {
    console.warn(
      "[authAdmin] acesso negado",
      buildAuthLog(req, {
        userId: req.user?.id,
        perfil: req.user?.perfil,
      }),
    );

    return res.status(403).json({
      ok: false,
      erro: "Acesso restrito a administradores.",
      code: "AUTH-403-ADMINISTRADOR-NECESSARIO",
      autenticado: true,
      autorizado: false,
      requestId: res.getHeader("X-Request-Id"),
    });
  }

  return next();
}

/* ──────────────────────────────────────────────────────────────
   Exports
────────────────────────────────────────────────────────────── */

module.exports = authMiddleware;

module.exports.authMiddleware = authMiddleware;
module.exports.authAdmin = authAdmin;

module.exports.perfilPermitido = perfilPermitido;
module.exports.normalizarPerfilOficial = normalizarPerfilOficial;
module.exports.extractToken = extractToken;
module.exports.authenticateRequest = authenticateRequest;
