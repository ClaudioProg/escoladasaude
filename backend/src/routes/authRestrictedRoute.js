"use strict";
const express = require("express");
const { authenticateRequest } = require("../auth/authMiddleware");
const { resolveTokenAuthVersion, getAuthVersionMode } = require("../auth/authVersion");
const { enforceRestrictedContext } = require("../auth/authRestrictedMiddleware");
const router = express.Router();

// Unica operacao de regularizacao exposta nesta etapa: consultar progresso comprovavel.
// Nao admite PUT/PATCH/POST nem usa o controller legado de atualizacao de perfil.
router.all("/contexto-restrito", async (req, res, next) => {
  if (process.env.AUTH_RESTRICTED_CONTEXT_ENABLED === undefined || process.env.AUTH_RESTRICTED_CONTEXT_ENABLED === "false") {
    return res.sendStatus(404);
  }
  let identity = null;
  if (req.headers?.authorization !== undefined) {
    const auth = await authenticateRequest(req, res);
    if (!auth.ok) return auth.response;
    identity = { id: auth.user.id, authVersion: resolveTokenAuthVersion(auth.decoded, getAuthVersionMode()) };
  }
  return enforceRestrictedContext(req, res, () => {
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ ok: true, data: req.restrictedContext });
  }, identity);
});
module.exports = router;
