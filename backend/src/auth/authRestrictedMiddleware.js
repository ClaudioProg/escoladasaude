"use strict";

const cookie = require("cookie");
const { sessionCookieName } = require("./authSessionMiddleware");
const { createRestrictedContextService, enabledValue } = require("../services/authRestrictedContextService");

const STATUS_PATH = "/api/auth/contexto-restrito";
function respond(res, status, code) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json({ ok: false, code, message: status === 401 ? "Nova autenticacao necessaria." :
    status === 403 ? "Regularizacao necessaria." : "Validacao de acesso indisponivel." });
}
function createRestrictedContextMiddleware({ service, isProduction = false, enabled = () => enabledValue(process.env.AUTH_RESTRICTED_CONTEXT_ENABLED) }) {
  if (typeof service?.access !== "function") throw new Error("AUTH_RESTRICTED_SERVICE_REQUIRED");
  return async function restricted(req, res, next, identity = null) {
    try {
      const active = enabled();
      if (active === false) return next();
      if (active !== true) return respond(res, 503, "AUTH_RESTRICTED_CONFIG");
      const name = sessionCookieName(isProduction);
      const header = String(req.headers?.cookie || "");
      // Duplicatas do cookie de sessao sao ambiguas; nao escolher uma autoridade.
      const values = header.split(";").map(value => value.trim()).filter(value => value.split("=")[0] === name);
      if (values.length > 1) return respond(res, 401, "AUTH_RESTRICTED_INVALID");
      const token = cookie.parse(header)[name];
      const operation = req.method === "GET" && req.originalUrl?.split("?")[0] === STATUS_PATH;
      const state = await service.access({ cookieToken: token, identity, allowedOperation: operation });
      if (state?.permitted !== true) return respond(res, 403, "AUTH_RESTRICTED_REQUIRED");
      req.restrictedContext = state;
      return next();
    } catch (error) {
      return respond(res, error?.code === "AUTH_RESTRICTED_INVALID" ? 401 : 503,
        error?.code === "AUTH_RESTRICTED_INVALID" ? "AUTH_RESTRICTED_INVALID" : "AUTH_RESTRICTED_UNAVAILABLE");
    }
  };
}
async function enforceRestrictedContext(req, res, next, identity = null) {
  try {
    const dbModule = require("../db");
    const db = dbModule?.db ?? dbModule;
    return await createRestrictedContextMiddleware({
      service: createRestrictedContextService({ db }), isProduction: process.env.NODE_ENV === "production",
    })(req, res, next, identity);
  } catch { return respond(res, 503, "AUTH_RESTRICTED_UNAVAILABLE"); }
}
module.exports = { createRestrictedContextMiddleware, enforceRestrictedContext, STATUS_PATH };
