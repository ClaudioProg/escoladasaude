"use strict";

const cookie = require("cookie");
const { AuthSessionError } = require("../services/authSessionService");

const SESSION_COOKIE_PRODUCTION = "__Host-escola_saude_session";
const SESSION_COOKIE_DEVELOPMENT = "escola_saude_session";

function sessionCookieName(isProduction) {
  return isProduction ? SESSION_COOKIE_PRODUCTION : SESSION_COOKIE_DEVELOPMENT;
}

function sendUnauthorized(res) {
  return res.status(401).json({
    ok: false,
    code: "AUTH-401-SESSION-INVALID",
    message: "Não autenticado.",
    data: null,
  });
}

function createAuthSessionMiddleware({ sessionService, isProduction = false } = {}) {
  if (!sessionService || typeof sessionService.validateSession !== "function") {
    throw new Error("AUTH_SESSION_SERVICE_REQUIRED");
  }
  const cookieName = sessionCookieName(isProduction);

  return async function authSessionMiddleware(req, res, next) {
    let token;
    try {
      token = cookie.parse(String(req.headers?.cookie || ""))[cookieName];
    } catch {
      return sendUnauthorized(res);
    }
    if (!token) return sendUnauthorized(res);

    try {
      const identity = await sessionService.validateSession(token);
      if (!identity || !Number.isInteger(identity.id) || !Array.isArray(identity.perfis) ||
        !identity.perfis.every((perfil) => typeof perfil === "string") ||
        typeof identity.areaAtiva !== "string" || typeof identity.sessionId !== "string") {
        return sendUnauthorized(res);
      }
      req.user = {
        id: identity.id,
        perfis: [...identity.perfis],
        areaAtiva: identity.areaAtiva,
        sessionId: identity.sessionId,
      };
      return next();
    } catch (error) {
      if (error instanceof AuthSessionError || error?.code === "AUTH_SESSION_INVALID") {
        return sendUnauthorized(res);
      }
      const operational = new Error("AUTH_SESSION_OPERATIONAL_FAILURE");
      operational.code = "AUTH_SESSION_OPERATIONAL_FAILURE";
      return next(operational);
    }
  };
}

module.exports = { createAuthSessionMiddleware, SESSION_COOKIE_PRODUCTION, SESSION_COOKIE_DEVELOPMENT, sessionCookieName };
