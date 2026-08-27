/* eslint-disable no-console */
"use strict";

/**
 * COMPATIBILIDADE TEMPORÁRIA PARA CLIENTES PRÉ-MIGRAÇÃO DE 27/05/2026.
 *
 * GET /api/dashboard-usuario não é contrato oficial novo. O contrato oficial
 * permanece GET /api/dashboard; esta rota existe somente para permitir a
 * transição segura de bundles antigos que esperam o resumo sem envelope.
 */

const express = require("express");

const requireAuth = require("../auth/authMiddleware");
const dashboardController = require("../controllers/dashboardController");

const router = express.Router();

if (typeof requireAuth !== "function") {
  throw new Error(
    "[dashboardLegacyCompatRoute] authMiddleware deve exportar uma função.",
  );
}

if (typeof dashboardController.obterResumoDashboardUsuario !== "function") {
  throw new Error(
    "[dashboardLegacyCompatRoute] dashboardController.obterResumoDashboardUsuario ausente.",
  );
}

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

function routeTag(tag) {
  return (_req, res, next) => {
    res.setHeader("X-Route-Handler", tag);
    return next();
  };
}

function legacyUsageTelemetry(req, _res, next) {
  // Telemetria transitória: suficiente para acompanhar a retirada, sem JWT,
  // CPF, nome, e-mail ou qualquer outro dado pessoal.
  console.info("[legacy-compat]", {
    route: "GET /api/dashboard-usuario",
    userId: req.user?.id || null,
    requestId: req.requestId || null,
  });
  return next();
}

function noStore(_req, res, next) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  return next();
}

function resumoLegado(data) {
  return {
    inscricaoFuturas: data.inscricao_futura,
    avaliacaoPendentes: data.avaliacao_pendente,
    certificadosEmitidos: data.certificado_emitido,
    presencasTotal: data.presenca_total,
    faltasTotal: data.falta_total,
    notaUsuario: data.nota_usuario,
    cursosRealizados: data.curso_realizado,
    eventosinstrutor: data.evento_organizador,
    inscricaoAtuais: data.inscricao_atual,
    proximosEventos: data.proximo_evento,
    certificadosTotal: data.certificado_total,
    mediaAvaliacao: data.media_avaliacao,
  };
}

/**
 * GET /api/dashboard-usuario
 *
 * Adaptador deliberadamente pontual: autentica pelo middleware JWT oficial e
 * reutiliza o cálculo de GET /api/dashboard. Não há redirect, fallback de
 * token nem catch-all para outras rotas legadas.
 */
router.get(
  "/",
  requireAuth,
  noStore,
  legacyUsageTelemetry,
  routeTag("dashboardLegacyCompat:v1:GET /dashboard-usuario"),
  asyncHandler(async (req, res) => {
    const data = await dashboardController.obterResumoDashboardUsuario(
      req.user.id,
    );

    return res.status(200).json(resumoLegado(data));
  }),
);

module.exports = router;
