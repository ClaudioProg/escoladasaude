/* eslint-disable no-console */
"use strict";

/**
 * ✅ backend/src/routes/contaExclusaoRoute.js — v1.0
 * Plataforma Escola da Saúde
 *
 * Mount oficial:
 * - /api/conta/exclusao
 */

const express = require("express");
const rateLimit = require("express-rate-limit");

const requireAuth = require("../auth/authMiddleware");
const contaExclusaoController = require("../controllers/contaExclusaoController");

const router = express.Router();

function assertHandler(name, handler) {
  if (typeof handler !== "function") {
    throw new Error(
      `[contaExclusaoRoute] Handler obrigatório ausente: contaExclusaoController.${name}`,
    );
  }
}

assertHandler("solicitarPublica", contaExclusaoController.solicitarPublica);
assertHandler(
  "solicitarAutenticada",
  contaExclusaoController.solicitarAutenticada,
);
assertHandler("confirmar", contaExclusaoController.confirmar);

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

function routeTag(tag) {
  return (_req, res, next) => {
    res.setHeader("X-Route-Handler", tag);
    return next();
  };
}

function noStore(_req, res, next) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  return next();
}

function rateLimitMessage(code, message) {
  return {
    ok: false,
    code,
    message,
  };
}

const solicitarPublicaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitMessage(
    "CONTA_EXCLUSAO-429-SOLICITACAO-PUBLICA-LIMITE",
    "Muitas solicitações. Aguarde antes de tentar novamente.",
  ),
});

const solicitarAutenticadaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitMessage(
    "CONTA_EXCLUSAO-429-SOLICITACAO-AUTENTICADA-LIMITE",
    "Muitas solicitações. Aguarde antes de tentar novamente.",
  ),
});

const confirmarLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitMessage(
    "CONTA_EXCLUSAO-429-CONFIRMACAO-LIMITE",
    "Muitas tentativas de confirmação. Aguarde antes de tentar novamente.",
  ),
});

/**
 * POST /api/conta/exclusao/solicitar-publica
 * Body:
 * {
 *   "email": "usuario@email.com"
 * }
 */
router.post(
  "/solicitar-publica",
  solicitarPublicaLimiter,
  noStore,
  routeTag("contaExclusaoRoute:v1.0:POST /solicitar-publica"),
  asyncHandler(contaExclusaoController.solicitarPublica),
);

/**
 * POST /api/conta/exclusao/solicitar-autenticada
 * Header:
 * Authorization: Bearer <token>
 */
router.post(
  "/solicitar-autenticada",
  requireAuth,
  solicitarAutenticadaLimiter,
  noStore,
  routeTag("contaExclusaoRoute:v1.0:POST /solicitar-autenticada"),
  asyncHandler(contaExclusaoController.solicitarAutenticada),
);

/**
 * POST /api/conta/exclusao/confirmar
 * Body:
 * {
 *   "token": "token-recebido-por-email"
 * }
 */
router.post(
  "/confirmar",
  confirmarLimiter,
  noStore,
  routeTag("contaExclusaoRoute:v1.0:POST /confirmar"),
  asyncHandler(contaExclusaoController.confirmar),
);

router.head("/solicitar-publica", noStore, (_req, res) => res.sendStatus(204));
router.head("/solicitar-autenticada", noStore, (_req, res) =>
  res.sendStatus(204),
);
router.head("/confirmar", noStore, (_req, res) => res.sendStatus(204));

module.exports = router;
