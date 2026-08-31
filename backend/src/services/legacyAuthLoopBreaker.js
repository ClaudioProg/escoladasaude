/* eslint-disable no-console */
"use strict";

const crypto = require("node:crypto");

const {
  CLIENT_BUILD_HEADER,
  parseBuildSignature,
} = require("../middlewares/clientBuildCompatibility");

const LEGACY_AUTH_LOOP_BREAKER_CONFIG = Object.freeze({
  threshold: 20,
  windowMs: 2_000,
  stateTtlMs: 10_000,
  maxRows: 4_096,
});

function isLegacyAuthLoopBreakerEnabled(env = process.env) {
  return /^(1|true|yes|on)$/i.test(
    String(env.LEGACY_AUTH_LOOP_BREAKER_ENABLED || "").trim(),
  );
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token, "utf8").digest();
}

function getAuthenticatedToken(req) {
  return require("../auth/authMiddleware").extractToken(req);
}

async function decideWithPostgres({ tokenHash }) {
  // Lazy require: com a flag desligada, o adapter legado não cria qualquer
  // dependência operacional nova além das consultas que ele já fazia.
  const db = require("../db");
  const config = LEGACY_AUTH_LOOP_BREAKER_CONFIG;

  return db.one(
    `
      SELECT
        should_trigger AS "shouldTrigger",
        observed_count AS "requestCount",
        observed_window_started_at AS "windowStartedAt",
        observed_expires_at AS "expiresAt"
      FROM public.legacy_auth_loop_breaker_decide($1, $2, $3, $4, $5)
    `,
    [
      tokenHash,
      config.threshold,
      config.windowMs,
      config.stateTtlMs,
      config.maxRows,
    ],
  );
}

function setNoStore(res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
}

function createLegacyAuthLoopBreakerMiddleware({
  getEnabled = isLegacyAuthLoopBreakerEnabled,
  decide = decideWithPostgres,
  getToken = getAuthenticatedToken,
  logger = console,
} = {}) {
  return async function legacyAuthLoopBreaker(req, res, next) {
    if (!getEnabled()) {
      return next();
    }

    // Somente uma assinatura moderna sintaticamente válida isenta o request.
    // A política global de minimum build roda antes desta rota e continua sendo
    // a única responsável por bloquear builds modernos comprovadamente antigos.
    if (parseBuildSignature(req.get(CLIENT_BUILD_HEADER))) {
      return next();
    }

    const token = getToken(req);

    // O middleware é montado depois de requireAuth. Esta guarda evita criar
    // estado caso a ordem seja alterada acidentalmente no futuro.
    if (!token || !req.user) {
      return next();
    }

    const tokenHash = hashToken(token);
    const hashPrefix = tokenHash.toString("hex").slice(0, 12);

    let decision;

    try {
      decision = await decide({ tokenHash });
    } catch (error) {
      // Fail-open: indisponibilidade do mecanismo temporário não invalida uma
      // sessão JWT que o middleware oficial acabou de autenticar.
      logger.error("[legacy-auth-loop-breaker] decision_error", {
        hashPrefix,
        requestId: req.requestId || null,
        errorCode: error?.code || null,
      });
      return next();
    }

    if (!decision?.shouldTrigger) {
      return next();
    }

    setNoStore(res);
    logger.info("[legacy-auth-loop-breaker] triggered", {
      hashPrefix,
      requestId: req.requestId || null,
      requestCount: Number(decision.requestCount),
      windowStartedAt: decision.windowStartedAt || null,
      expiresAt: decision.expiresAt || null,
    });

    return res.status(426).json({
      ok: false,
      data: null,
      message: "Esta versão da plataforma precisa ser atualizada.",
      code: "APP_UPDATE_REQUIRED",
      adminHint: null,
      details: null,
      requestId: req.requestId || null,
    });
  };
}

module.exports = {
  LEGACY_AUTH_LOOP_BREAKER_CONFIG,
  createLegacyAuthLoopBreakerMiddleware,
  decideWithPostgres,
  hashToken,
  isLegacyAuthLoopBreakerEnabled,
};
