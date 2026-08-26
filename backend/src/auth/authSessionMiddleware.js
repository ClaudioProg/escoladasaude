"use strict";

const cookie = require("cookie");
const { AuthSessionError } = require("../services/authSessionService");
const { validProfiles } = require("./sessionAuthorization");

const SESSION_COOKIE_PRODUCTION = "__Host-escola_saude_session";
const SESSION_COOKIE_DEVELOPMENT = "escola_saude_session";
const SESSION_COOKIE_PERSISTENT_MS = 30 * 24 * 60 * 60 * 1000;

function sessionCookieName(isProduction) {
  return isProduction ? SESSION_COOKIE_PRODUCTION : SESSION_COOKIE_DEVELOPMENT;
}

function sessionCookieOptions(isProduction, manterConectado) {
  const options = {
    httpOnly: true,
    secure: Boolean(isProduction),
    sameSite: "lax",
    path: "/",
  };
  if (manterConectado) options.maxAge = SESSION_COOKIE_PERSISTENT_MS;
  return options;
}

function sendUnauthorized(res) {
  return res.status(401).json({
    ok: false,
    code: "AUTH-401-SESSION-INVALID",
    message: "Não autenticado.",
    data: null,
  });
}

function validIdentity(identity) {
  return identity && typeof identity === "object" && !Array.isArray(identity) &&
    Number.isInteger(identity.id) && validProfiles(identity.perfis) &&
    typeof identity.areaAtiva === "string" && typeof identity.sessionId === "string" &&
    identity.sessionId.length > 0;
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
      if (!validIdentity(identity)) {
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
      return next(error);
    }
  };
}

module.exports = {
  createAuthSessionMiddleware,
  SESSION_COOKIE_PRODUCTION,
  SESSION_COOKIE_DEVELOPMENT,
  SESSION_COOKIE_PERSISTENT_MS,
  sessionCookieName,
  sessionCookieOptions,
};
