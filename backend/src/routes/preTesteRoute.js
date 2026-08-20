"use strict";

const express = require("express");
const authMiddleware = require("../auth/authMiddleware");
const { authorize } = require("../middlewares/authorize");
const controller = require("../controllers/preTesteController");

const router = express.Router();
const PERFIS_PARTICIPANTE = Object.freeze([
  "administrador",
  "organizador",
  "usuario",
]);

const wrap = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

function ensureNumericParam(paramName) {
  return (req, res, next) => {
    const value = Number(req.params?.[paramName]);
    if (!Number.isInteger(value) || value <= 0) {
      return res.status(400).json({
        ok: false,
        data: null,
        message: `${paramName} inválido.`,
        code: "PARAMETRO_INVALIDO",
      });
    }
    req.params[paramName] = String(value);
    return next();
  };
}

router.use(authMiddleware);

router.get(
  "/evento/:evento_id/responder",
  authorize(...PERFIS_PARTICIPANTE),
  ensureNumericParam("evento_id"),
  wrap(controller.obterParaResponder),
);

router.get(
  "/evento/:evento_id/resultados",
  authorize("administrador"),
  ensureNumericParam("evento_id"),
  wrap(controller.obterResultadosEvento),
);

router.get(
  "/evento/:evento_id/resultados/participantes",
  authorize("administrador"),
  ensureNumericParam("evento_id"),
  wrap(controller.obterParticipantesResultados),
);

router.get(
  "/evento/:evento_id/resultados/submissao/:submissao_id",
  authorize("administrador"),
  ensureNumericParam("evento_id"),
  ensureNumericParam("submissao_id"),
  wrap(controller.obterParticipanteResultados),
);

router.get(
  "/evento/:evento_id/resultados/pergunta/:pergunta_id/respostas",
  authorize("administrador"),
  ensureNumericParam("evento_id"),
  ensureNumericParam("pergunta_id"),
  wrap(controller.obterRespostasPergunta),
);

router.get(
  "/evento/:evento_id/resultados/pdf",
  authorize("administrador"),
  ensureNumericParam("evento_id"),
  wrap(controller.baixarRelatorioResultados),
);

router.get(
  "/evento/:evento_id",
  authorize("administrador"),
  ensureNumericParam("evento_id"),
  wrap(controller.obterPorEvento),
);

router.post(
  "/evento/:evento_id/rascunho",
  authorize("administrador"),
  ensureNumericParam("evento_id"),
  wrap(controller.obterOuCriarRascunho),
);

router.put(
  "/evento/:evento_id/ativacao",
  authorize("administrador"),
  ensureNumericParam("evento_id"),
  wrap(controller.atualizarAtivacao),
);

router.post(
  "/versao/:versao_id/pergunta",
  authorize("administrador"),
  ensureNumericParam("versao_id"),
  wrap(controller.criarPergunta),
);

router.put(
  "/versao/:versao_id/pergunta/:pergunta_id",
  authorize("administrador"),
  ensureNumericParam("versao_id"),
  ensureNumericParam("pergunta_id"),
  wrap(controller.editarPergunta),
);

router.delete(
  "/versao/:versao_id/pergunta/:pergunta_id",
  authorize("administrador"),
  ensureNumericParam("versao_id"),
  ensureNumericParam("pergunta_id"),
  wrap(controller.removerPergunta),
);

router.put(
  "/versao/:versao_id/perguntas/ordem",
  authorize("administrador"),
  ensureNumericParam("versao_id"),
  wrap(controller.ordenarPerguntas),
);

router.post(
  "/pergunta/:pergunta_id/alternativa",
  authorize("administrador"),
  ensureNumericParam("pergunta_id"),
  wrap(controller.criarAlternativa),
);

router.put(
  "/pergunta/:pergunta_id/alternativas/ordem",
  authorize("administrador"),
  ensureNumericParam("pergunta_id"),
  wrap(controller.ordenarAlternativas),
);

router.put(
  "/alternativa/:alternativa_id",
  authorize("administrador"),
  ensureNumericParam("alternativa_id"),
  wrap(controller.editarAlternativa),
);

router.delete(
  "/alternativa/:alternativa_id",
  authorize("administrador"),
  ensureNumericParam("alternativa_id"),
  wrap(controller.removerAlternativa),
);

router.post(
  "/versao/:versao_id/publicar",
  authorize("administrador"),
  ensureNumericParam("versao_id"),
  wrap(controller.publicar),
);

module.exports = router;
