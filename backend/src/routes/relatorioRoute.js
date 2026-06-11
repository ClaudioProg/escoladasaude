/* eslint-disable no-console */
"use strict";

/**
 * ✅ backend/src/routes/relatorioRoute.js — v3.0
 * Atualizado em: 11/06/2026
 * Plataforma Escola da Saúde
 *
 * Função:
 * - Rotas oficiais do módulo de relatórios institucionais.
 * - Relatórios gerenciais, operacionais, documentais e de saúde da plataforma.
 * - Dashboard institucional com totais gerais e indicadores filtrados.
 * - Exportação XLSX e PDF institucional.
 *
 * Mount oficial:
 * - /api/relatorio
 *
 * Perfil autorizado:
 * - administrador
 *
 * Rotas principais:
 * - GET /institucional
 * - GET /resumo-geral
 * - GET /eventos
 * - GET /presencas
 * - GET /avaliacoes
 * - GET /organizadores
 * - GET /certificados
 * - GET /certificados/pendencias
 * - GET /usuarios
 * - GET /salas
 * - GET /notificacoes
 * - GET /saude-plataforma
 * - GET /exportar/:tipo.xlsx
 * - GET /exportar/:tipo.pdf
 */

const express = require("express");
const rateLimit = require("express-rate-limit");

const authMiddleware = require("../auth/authMiddleware");
const { authorize } = require("../middlewares/authorize");

const {
  relatorioInstitucional,
  resumoGeral,
  relatorioEventos,
  relatorioPresencas,
  relatorioAvaliacoes,
  relatorioorganizadores,
  relatorioCertificados,
  relatorioCertificadosPendencias,
  relatorioUsuarios,
  relatorioSalas,
  relatorioNotificacoes,
  relatorioSaudePlataforma,
  exportarRelatorioXlsx,
  exportarRelatorioPdf,
} = require("../controllers/relatorioController");

const router = express.Router();

/* ─────────────────────────────────────────────
 * Contratos obrigatórios
 * ───────────────────────────────────────────── */

if (typeof authMiddleware !== "function") {
  console.error("[relatorioRoute] authMiddleware inválido:", authMiddleware);

  throw new Error(
    "Contrato inválido: backend/src/auth/authMiddleware.js deve exportar uma função.",
  );
}

if (typeof authorize !== "function") {
  console.error("[relatorioRoute] authorize inválido:", authorize);

  throw new Error(
    "Contrato inválido: backend/src/middlewares/authorize.js deve expor { authorize } como função.",
  );
}

function assertControllerFn(name, fn) {
  if (typeof fn !== "function") {
    console.error(`[relatorioRoute] relatorioController.${name} inválido:`, fn);

    throw new Error(
      `Contrato inválido: relatorioController.${name} deve ser uma função.`,
    );
  }
}

assertControllerFn("relatorioInstitucional", relatorioInstitucional);
assertControllerFn("resumoGeral", resumoGeral);
assertControllerFn("relatorioEventos", relatorioEventos);
assertControllerFn("relatorioPresencas", relatorioPresencas);
assertControllerFn("relatorioAvaliacoes", relatorioAvaliacoes);
assertControllerFn("relatorioorganizadores", relatorioorganizadores);
assertControllerFn("relatorioCertificados", relatorioCertificados);
assertControllerFn(
  "relatorioCertificadosPendencias",
  relatorioCertificadosPendencias,
);
assertControllerFn("relatorioUsuarios", relatorioUsuarios);
assertControllerFn("relatorioSalas", relatorioSalas);
assertControllerFn("relatorioNotificacoes", relatorioNotificacoes);
assertControllerFn("relatorioSaudePlataforma", relatorioSaudePlataforma);
assertControllerFn("exportarRelatorioXlsx", exportarRelatorioXlsx);
assertControllerFn("exportarRelatorioPdf", exportarRelatorioPdf);

/* ─────────────────────────────────────────────
 * Helpers
 * ───────────────────────────────────────────── */

function getRequestId(req) {
  return req?.requestId || req?.rid || null;
}

function responderErro(
  res,
  statusCode,
  message,
  code,
  adminHint,
  details = null,
  req = null,
) {
  return res.status(statusCode).json({
    ok: false,
    data: null,
    message,
    code,
    adminHint,
    details,
    requestId: getRequestId(req),
  });
}

function asyncHandler(fn) {
  return async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

function noStore(_req, res, next) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
}

function ensureAuthenticatedContext(req, res, next) {
  const usuarioId = Number(req?.user?.id);

  if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
    return responderErro(
      res,
      401,
      "Usuário não autenticado.",
      "RELATORIO_USUARIO_NAO_AUTENTICADO",
      "req.user.id não foi encontrado após authMiddleware.",
      null,
      req,
    );
  }

  return next();
}

function ensureTipoExportacaoValido(req, res, next) {
  const tipo = String(req.params?.tipo || "")
    .trim()
    .toLowerCase();

  const tiposValidos = new Set([
    "institucional",
    "eventos",
    "presencas",
    "avaliacoes",
    "organizadores",
    "certificados",
    "usuarios",
    "salas",
    "notificacoes",
    "saude-plataforma",
  ]);

  if (!tiposValidos.has(tipo)) {
    return responderErro(
      res,
      400,
      "Tipo de relatório inválido para exportação.",
      "RELATORIO_EXPORTACAO_TIPO_INVALIDO",
      "Use um dos tipos oficiais de exportação.",
      {
        tipo_recebido: req.params?.tipo || null,
        tipos_validos: Array.from(tiposValidos),
      },
      req,
    );
  }

  req.params.tipo = tipo;

  return next();
}

function ensureExtension(ext) {
  return (req, res, next) => {
    const pathOnly = String(req.path || req.originalUrl || "")
      .split("?")[0]
      .toLowerCase();

    if (!pathOnly.endsWith(`.${ext}`)) {
      return responderErro(
        res,
        404,
        "Rota de exportação não encontrada.",
        "RELATORIO_EXPORTACAO_EXTENSAO_OBRIGATORIA",
        `A exportação oficial usa a rota /api/relatorio/exportar/:tipo.${ext}.`,
        {
          path_recebido: pathOnly,
          originalUrl: req.originalUrl || null,
        },
        req,
      );
    }

    return next();
  };
}

/* ─────────────────────────────────────────────
 * Rate limit
 * ───────────────────────────────────────────── */

const relatorioLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    data: null,
    message: "Muitas requisições. Aguarde alguns instantes e tente novamente.",
    code: "RELATORIO_RATE_LIMIT",
    adminHint:
      "Rate limit aplicado ao grupo de relatórios para proteger endpoints pesados.",
    details: null,
  },
});

const exportacaoLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    data: null,
    message:
      "Muitas exportações solicitadas. Aguarde alguns instantes e tente novamente.",
    code: "RELATORIO_EXPORTACAO_RATE_LIMIT",
    adminHint:
      "Rate limit aplicado às exportações por serem operações mais pesadas.",
    details: null,
  },
});

/* ─────────────────────────────────────────────
 * Middlewares do grupo
 * ───────────────────────────────────────────── */

router.use(noStore);
router.use(authMiddleware);
router.use(ensureAuthenticatedContext);
router.use(authorize("administrador"));

/* ─────────────────────────────────────────────
 * Dashboard institucional
 * ───────────────────────────────────────────── */

/**
 * GET /api/relatorio/institucional
 *
 * Query oficial:
 * - data_inicio=YYYY-MM-DD
 * - data_fim=YYYY-MM-DD
 * - evento_id=integer
 * - turma_id=integer
 * - organizador_id=integer
 * - usuario_id=integer
 * - unidade_id=integer
 * - status=programado|andamento|encerrado
 *
 * Retorna:
 * - geral: totais globais da plataforma
 * - filtrado: indicadores que mudam conforme filtros
 * - series: dados para gráficos
 * - tabelas: dados resumidos
 */
router.get(
  "/institucional",
  relatorioLimiter,
  asyncHandler(relatorioInstitucional),
);

/* ─────────────────────────────────────────────
 * Relatórios individuais
 * ───────────────────────────────────────────── */

router.get("/resumo-geral", relatorioLimiter, asyncHandler(resumoGeral));

router.get("/eventos", relatorioLimiter, asyncHandler(relatorioEventos));

router.get("/presencas", relatorioLimiter, asyncHandler(relatorioPresencas));

router.get("/avaliacoes", relatorioLimiter, asyncHandler(relatorioAvaliacoes));

router.get(
  "/organizadores",
  relatorioLimiter,
  asyncHandler(relatorioorganizadores),
);

router.get(
  "/certificados",
  relatorioLimiter,
  asyncHandler(relatorioCertificados),
);

router.get(
  "/certificados/pendencias",
  relatorioLimiter,
  asyncHandler(relatorioCertificadosPendencias),
);

router.get("/usuarios", relatorioLimiter, asyncHandler(relatorioUsuarios));

router.get("/salas", relatorioLimiter, asyncHandler(relatorioSalas));

router.get(
  "/notificacoes",
  relatorioLimiter,
  asyncHandler(relatorioNotificacoes),
);

router.get(
  "/saude-plataforma",
  relatorioLimiter,
  asyncHandler(relatorioSaudePlataforma),
);

/* ─────────────────────────────────────────────
 * Exportações
 * ───────────────────────────────────────────── */

/**
 * GET /api/relatorio/exportar/:tipo.xlsx
 *
 * Tipos:
 * - institucional
 * - eventos
 * - presencas
 * - avaliacoes
 * - organizadores
 * - certificados
 * - usuarios
 * - salas
 * - notificacoes
 * - saude-plataforma
 */
router.get(
  "/exportar/:tipo.xlsx",
  exportacaoLimiter,
  ensureExtension("xlsx"),
  ensureTipoExportacaoValido,
  asyncHandler(exportarRelatorioXlsx),
);

/**
 * GET /api/relatorio/exportar/:tipo.pdf
 *
 * Tipos:
 * - institucional
 *
 * Observação:
 * - O PDF institucional é visual, com cabeçalho, cards, barras, ranking e rodapé.
 */
router.get(
  "/exportar/:tipo.pdf",
  exportacaoLimiter,
  ensureExtension("pdf"),
  ensureTipoExportacaoValido,
  asyncHandler(exportarRelatorioPdf),
);

module.exports = router;
