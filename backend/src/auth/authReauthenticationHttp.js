"use strict";

const express = require("express");
const cookie = require("cookie");
const rateLimit = require("express-rate-limit");
const { createHmac, timingSafeEqual } = require("node:crypto");
const { sessionCookieName } = require("./authSessionMiddleware");
const { resolveTokenAuthVersion, getAuthVersionMode } = require("./authVersion");
const { PURPOSES, ReauthenticationError, validateAttemptPolicy } = require("../services/authReauthenticationService");
const BASE_PATH = "/api/auth/reautenticacao";
function configError() { throw new ReauthenticationError("AUTH_REAUTH_CONFIG"); }
function enabled(value) {
  if (value === undefined || value === "false") return false;
  if (value === "true") return true;
  configError();
}
function configuration(env) {
  const number = key => {
    if (!/^[1-9]\d*$/.test(env[key] || "")) configError();
    return Number(env[key]);
  };
  const attemptPolicy = validateAttemptPolicy({ windowMs: number("AUTH_REAUTH_ATTEMPT_WINDOW_MS"),
    maxAccount: number("AUTH_REAUTH_MAX_ACCOUNT") });
  const maxIp = number("AUTH_REAUTH_MAX_IP");
  if (!Number.isSafeInteger(maxIp) || maxIp > 2147483647) configError();
  const secretText = env.AUTH_REAUTH_CSRF_SECRET;
  if (typeof secretText !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(secretText)) configError();
  const secret = Buffer.from(secretText, "base64url");
  if (secret.length !== 32 || secret.toString("base64url") !== secretText ||
      [secretText, secret.toString("utf8")].includes(env.JWT_SECRET)) configError();
  const origins = (env.AUTH_REAUTH_ALLOWED_ORIGINS || "").split(",");
  if (!origins.length || origins.some(origin => {
    try { const url = new URL(origin); return !["https:", "http:"].includes(url.protocol) || url.origin !== origin; }
    catch { return true; }
  }) || new Set(origins).size !== origins.length) configError();
  return { attemptPolicy, maxIp, secret, origins: Object.freeze(origins), isProduction: env.NODE_ENV === "production" };
}
function respond(res, status, code) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json({ ok: false, code, message: "Reautenticacao nao autorizada.", data: null });
}
function readCookie(req, isProduction) {
  const header = req.headers?.cookie;
  if (typeof header !== "string") throw new ReauthenticationError("AUTH_REAUTH_INVALID");
  const name = sessionCookieName(isProduction);
  if (header.split(";").filter(part => part.trim().split("=")[0] === name).length !== 1) {
    throw new ReauthenticationError("AUTH_REAUTH_INVALID");
  }
  return cookie.parse(header)[name];
}
function exactOrigin(req, origins) {
  const supplied = req.headers?.origin;
  if (supplied !== undefined) return typeof supplied === "string" && origins.includes(supplied) ? supplied : null;
  try {
    if (typeof req.headers?.referer !== "string") return null;
    const url = new URL(req.headers.referer);
    return !url.username && !url.password && origins.includes(url.origin) ? url.origin : null;
  } catch { return null; }
}
function csrfToken(secret, origin, identity, cookieToken) {
  // Dedicated CSRF key, never the session/proof token or JWT key. No time/proof renewal.
  return createHmac("sha256", secret).update(JSON.stringify(["reauth-csrf-v1", origin,
    identity.id, identity.sessionId, identity.authVersion, cookieToken])).digest("base64url");
}
function sameToken(actual, expected) {
  return typeof actual === "string" && /^[A-Za-z0-9_-]{43}$/.test(actual) &&
    timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}
function createReauthenticationRouter({ service, config, authenticateBearer, enforceBarrier,
  versionMode = getAuthVersionMode } = {}) {
  if (![service?.authenticate, service?.issue, authenticateBearer, enforceBarrier, versionMode].every(fn => typeof fn === "function")) configError();
  const { secret, origins, isProduction, attemptPolicy, maxIp } = config;
  validateAttemptPolicy(attemptPolicy);
  if (!Buffer.isBuffer(secret) || secret.length !== 32 || !Array.isArray(origins) || !origins.length ||
      !Number.isSafeInteger(maxIp) || maxIp <= 0) configError();
  const router = express.Router({ caseSensitive: true, strict: true });
  // Existing express-rate-limit mechanism, separate store, no email/recovery quota reuse.
  // IP guard is process-local. The account reservation in PostgreSQL is authoritative across replicas.
  const limiter = rateLimit({ windowMs: attemptPolicy.windowMs, limit: maxIp, standardHeaders: true,
    legacyHeaders: false, passOnStoreError: false,
    handler: (_req, res) => respond(res, 429, "AUTH_REAUTH_LIMIT") });
  router.all(["/reautenticacao", "/reautenticacao/csrf"], async (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const path = req.originalUrl?.split("?")[0];
      if (![BASE_PATH, BASE_PATH + "/csrf"].includes(path) || req.originalUrl.includes("?")) return respond(res, 404, "AUTH_REAUTH_NOT_FOUND");
      const isCsrf = path.endsWith("/csrf");
      if (req.method !== (isCsrf ? "GET" : "POST")) return respond(res, 405, "AUTH_REAUTH_METHOD");
      const origin = exactOrigin(req, origins);
      if (!origin) return respond(res, 403, "AUTH_REAUTH_CSRF");
      const cookieToken = readCookie(req, isProduction);
      let identity = null;
      if (req.headers?.authorization !== undefined) {
        const auth = await authenticateBearer(req, res);
        if (auth?.ok !== true) return auth?.response; // No cookie fallback for an invalid provided JWT.
        identity = { id: auth.user.id, authVersion: resolveTokenAuthVersion(auth.decoded, versionMode()) };
        if (identity.authVersion === null) return respond(res, 401, "AUTH_REAUTH_INVALID");
      }
      const current = await service.authenticate({ cookieToken, identity });
      const trusted = { id: current.id, sessionId: current.sessionId, authVersion: current.authVersion };
      let permitted = false;
      const blocked = await enforceBarrier(req, res, () => { permitted = true; }, trusted);
      if (!permitted) return blocked; // Same D2 barrier, no new allowlist or role bypass.
      const token = csrfToken(secret, origin, trusted, cookieToken);
      if (isCsrf) return res.status(200).json({ ok: true, data: { csrfToken: token } });
      if (!sameToken(req.headers?.["x-reauth-csrf"], token)) return respond(res, 403, "AUTH_REAUTH_CSRF");
      if (!/^application\/json(?:\s*;|$)/i.test(req.headers?.["content-type"] || "")) return respond(res, 415, "AUTH_REAUTH_CONTENT_TYPE");
      req.reauthentication = { cookieToken, identity: trusted };
      return limiter(req, res, next);
    } catch (error) { return respond(res, error?.code === "AUTH_REAUTH_INVALID" ? 401 : 503,
      error?.code === "AUTH_REAUTH_INVALID" ? "AUTH_REAUTH_INVALID" : "AUTH_REAUTH_UNAVAILABLE"); }
  });
  router.post("/reautenticacao", express.json({ limit: "16kb", strict: true }), async (req, res) => {
    try {
      const body = req.body;
      if (!body || Object.getPrototypeOf(body) !== Object.prototype ||
          Object.keys(body).some(key => !["senha", "finalidade"].includes(key)) ||
          typeof body.senha !== "string" || !body.senha || Buffer.byteLength(body.senha, "utf8") > 16 * 1024 ||
          !PURPOSES.includes(body.finalidade)) {
        return respond(res, 400, "AUTH_REAUTH_INPUT");
      }
      const output = await service.issue({ ...req.reauthentication, password: body.senha, purpose: body.finalidade });
      return res.status(200).json({ ok: true, data: output });
    } catch (error) {
      const status = error?.code === "AUTH_REAUTH_LIMIT" ? 429 : error?.code === "AUTH_REAUTH_INVALID" ? 401 : 503;
      return respond(res, status, status === 503 ? "AUTH_REAUTH_UNAVAILABLE" : error.code);
    } finally { delete req.reauthentication; }
  });
  router.use((error, _req, res, _next) => respond(res,
    error?.type === "entity.too.large" ? 413 : 400, "AUTH_REAUTH_INPUT"));
  return router;
}
module.exports = { createReauthenticationRouter, configuration, enabled, BASE_PATH };
