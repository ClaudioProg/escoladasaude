"use strict";

const express = require("express");
const { createReauthenticationRouter, configuration, enabled } = require("../auth/authReauthenticationHttp");
const router = express.Router({ caseSensitive: true, strict: true });
let activeRouter;
// Build the IP store once at startup, never per request. Disabled startup loads no DB/audit.
// Enabling or changing configuration requires restart; disabling is observed on every request.
try {
  if (enabled(process.env.AUTH_REAUTH_ENABLED)) {
    const config = configuration(process.env);
    const dbModule = require("../db");
    const { createReauthenticationService } = require("../services/authReauthenticationService");
    activeRouter = createReauthenticationRouter({ config,
      service: createReauthenticationService({ db: dbModule.db ?? dbModule, attemptPolicy: config.attemptPolicy,
        registrarAuditoria: require("../services/auditoriaService").registrarAuditoria }),
      authenticateBearer: require("../auth/authMiddleware").authenticateRequest,
      enforceBarrier: require("../auth/authRestrictedMiddleware").enforceRestrictedContext });
  }
} catch { /* Invalid/incomplete configuration remains unavailable, without logging secrets. */ }
router.use(["/reautenticacao", "/reautenticacao/csrf"], (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (!enabled(process.env.AUTH_REAUTH_ENABLED)) return res.sendStatus(404);
    if (!activeRouter) throw new Error("AUTH_REAUTH_CONFIG");
    return next();
  } catch {
    return res.status(503).json({ ok: false, code: "AUTH_REAUTH_CONFIG", message: "Reautenticacao indisponivel.", data: null });
  }
});
router.use((req, res, next) => activeRouter ? activeRouter(req, res, next) : next());
module.exports = router;
