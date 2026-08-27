/* eslint-disable no-console */
"use strict";

/**
 * COMPATIBILIDADE TEMPORÁRIA PARA CLIENTES PRÉ-MIGRAÇÃO DE 27/05/2026.
 *
 * GET /api/auth/me não é contrato oficial novo. O contrato oficial de sessão
 * permanece GET /api/perfil/me; esta rota existe somente para permitir a
 * transição segura de bundles antigos que esperam o envelope histórico.
 */

const express = require("express");

const requireAuth = require("../auth/authMiddleware");
const perfilController = require("../controllers/perfilController");

const router = express.Router();

if (typeof requireAuth !== "function") {
  throw new Error(
    "[authLegacyCompatRoute] authMiddleware deve exportar uma função.",
  );
}

if (typeof perfilController.obterMeuPerfilAutenticado !== "function") {
  throw new Error(
    "[authLegacyCompatRoute] perfilController.obterMeuPerfilAutenticado ausente.",
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

function noStore(_req, res, next) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  return next();
}

function usuarioLegado(data) {
  return {
    id: data.id,
    nome: data.nome,
    email: data.email,
    cpf: data.cpf,
    perfil: data.perfil,
  };
}

/**
 * GET /api/auth/me
 *
 * Adaptador deliberadamente pontual: autentica pelo middleware JWT oficial e
 * reutiliza a mesma leitura de perfil de GET /api/perfil/me. Não há redirect,
 * fallback de token nem catch-all para outras rotas legadas.
 */
router.get(
  "/me",
  requireAuth,
  noStore,
  routeTag("authLegacyCompat:v1:GET /auth/me"),
  asyncHandler(async (req, res) => {
    const resultado = await perfilController.obterMeuPerfilAutenticado(req);

    if (!resultado.ok) {
      return res.status(resultado.status).json({
        autenticado: false,
        erro: resultado.message,
        code: resultado.code,
        requestId: res.getHeader("X-Request-Id"),
      });
    }

    return res.status(200).json({
      autenticado: true,
      usuario: usuarioLegado(resultado.data),
    });
  }),
);

module.exports = router;
