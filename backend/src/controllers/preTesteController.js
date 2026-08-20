"use strict";

const {
  PreTesteError,
  obterConfiguracaoAdministrativa,
  criarOuObterRascunho,
  adicionarPergunta,
  atualizarPergunta,
  excluirPergunta,
  reordenarPerguntas,
  adicionarAlternativa,
  atualizarAlternativa,
  excluirAlternativa,
  reordenarAlternativas,
  publicarVersao,
  definirAtivo,
  obterPreTesteParaResponder,
} = require("../services/preTesteService");
const {
  podeAcessarEvento,
} = require("../services/eventoAcessoRegistroService");
const {
  obterResultados,
  listarRespostasDissertativas,
  listarParticipantes,
  obterParticipante,
  obterDadosRelatorio,
} = require("../services/preTesteResultadosService");
const {
  formatarNomeArquivoRelatorio,
  gerarPdfResultadosPreTeste,
} = require("../utils/preTesteResultadosPdf");

function ok(
  res,
  data,
  message = "Operação realizada com sucesso.",
  status = 200,
) {
  return res.status(status).json({ ok: true, data, message });
}

function fail(res, status, message, code = "PRE_TESTE_ERRO") {
  return res.status(status).json({
    ok: false,
    data: null,
    message,
    code,
  });
}

async function executar(
  res,
  operacao,
  {
    successMessage = "Operação realizada com sucesso.",
    successStatus = 200,
  } = {},
) {
  try {
    const data = await operacao();
    return ok(res, data, successMessage, successStatus);
  } catch (error) {
    if (error instanceof PreTesteError) {
      return fail(res, error.status, error.message, error.code);
    }

    console.error("[preTesteController] erro interno:", {
      name: error?.name,
      code: error?.code,
      message: error?.message,
    });
    return fail(
      res,
      500,
      "Não foi possível processar o pré-teste.",
      "PRE_TESTE_ERRO_INTERNO",
    );
  }
}

function getUserId(req) {
  const id = Number(req?.user?.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function obterPorEvento(req, res) {
  return executar(
    res,
    () => obterConfiguracaoAdministrativa(req.params.evento_id),
    { successMessage: "Configuração do pré-teste carregada." },
  );
}

async function obterResultadosEvento(req, res) {
  return executar(
    res,
    () => obterResultados(req.params.evento_id, req.query?.versao_id || null),
    { successMessage: "Resultados do pré-teste carregados." },
  );
}

async function obterRespostasPergunta(req, res) {
  return executar(
    res,
    () =>
      listarRespostasDissertativas(
        req.params.evento_id,
        req.query?.versao_id || null,
        req.params.pergunta_id,
        {
          pagina: req.query?.pagina,
          limite: req.query?.limite,
        },
      ),
    { successMessage: "Respostas dissertativas carregadas." },
  );
}

async function obterParticipantesResultados(req, res) {
  return executar(
    res,
    () =>
      listarParticipantes(req.params.evento_id, req.query?.versao_id || null, {
        busca: req.query?.busca,
        pagina: req.query?.pagina,
        limite: req.query?.limite,
      }),
    { successMessage: "Participantes do pré-teste carregados." },
  );
}

async function obterParticipanteResultados(req, res) {
  return executar(
    res,
    () =>
      obterParticipante(
        req.params.evento_id,
        req.query?.versao_id || null,
        req.params.submissao_id,
      ),
    { successMessage: "Respostas do participante carregadas." },
  );
}

async function baixarRelatorioResultados(req, res) {
  try {
    const tipo = String(req.query?.tipo || "consolidado")
      .trim()
      .toLowerCase();
    if (!["consolidado", "detalhado"].includes(tipo)) {
      throw new PreTesteError("Tipo de relatório inválido.", {
        code: "PRE_TESTE_RELATORIO_TIPO_INVALIDO",
      });
    }

    const dados = await obterDadosRelatorio(
      req.params.evento_id,
      req.query?.versao_id || null,
      tipo,
    );

    if (!dados.versao_selecionada || dados.resumo.total_submissoes === 0) {
      throw new PreTesteError(
        "Ainda não existem respostas de pré-teste para este evento.",
        { status: 409, code: "PRE_TESTE_SEM_RESPOSTAS" },
      );
    }

    const pdf = await gerarPdfResultadosPreTeste({ tipo, dados });
    const filename = formatarNomeArquivoRelatorio({
      eventoId: dados.evento.id,
      numeroVersao: dados.versao_selecionada.numero_versao,
      tipo,
    });

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", String(pdf.length));
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.status(200).send(pdf);
  } catch (error) {
    if (error instanceof PreTesteError) {
      return fail(res, error.status, error.message, error.code);
    }

    console.error("[preTesteController] erro ao gerar relatório:", {
      name: error?.name,
      code: error?.code,
      message: error?.message,
    });
    return fail(
      res,
      500,
      "Não foi possível gerar o relatório do pré-teste.",
      "PRE_TESTE_RELATORIO_ERRO",
    );
  }
}

async function obterOuCriarRascunho(req, res) {
  return executar(res, () => criarOuObterRascunho(req.params.evento_id), {
    successMessage: "Rascunho do pré-teste disponível.",
    successStatus: 201,
  });
}

async function criarPergunta(req, res) {
  return executar(
    res,
    () => adicionarPergunta(req.params.versao_id, req.body),
    { successMessage: "Pergunta adicionada.", successStatus: 201 },
  );
}

async function editarPergunta(req, res) {
  return executar(
    res,
    () =>
      atualizarPergunta(req.params.versao_id, req.params.pergunta_id, req.body),
    { successMessage: "Pergunta atualizada." },
  );
}

async function removerPergunta(req, res) {
  return executar(
    res,
    () => excluirPergunta(req.params.versao_id, req.params.pergunta_id),
    { successMessage: "Pergunta removida." },
  );
}

async function ordenarPerguntas(req, res) {
  return executar(
    res,
    () => reordenarPerguntas(req.params.versao_id, req.body?.ids),
    { successMessage: "Perguntas reordenadas." },
  );
}

async function criarAlternativa(req, res) {
  return executar(
    res,
    () => adicionarAlternativa(req.params.pergunta_id, req.body),
    { successMessage: "Alternativa adicionada.", successStatus: 201 },
  );
}

async function editarAlternativa(req, res) {
  return executar(
    res,
    () => atualizarAlternativa(req.params.alternativa_id, req.body),
    { successMessage: "Alternativa atualizada." },
  );
}

async function removerAlternativa(req, res) {
  return executar(res, () => excluirAlternativa(req.params.alternativa_id), {
    successMessage: "Alternativa removida.",
  });
}

async function ordenarAlternativas(req, res) {
  return executar(
    res,
    () => reordenarAlternativas(req.params.pergunta_id, req.body?.ids),
    { successMessage: "Alternativas reordenadas." },
  );
}

async function publicar(req, res) {
  return executar(res, () => publicarVersao(req.params.versao_id), {
    successMessage: "Versão do pré-teste publicada.",
  });
}

async function atualizarAtivacao(req, res) {
  return executar(
    res,
    () =>
      definirAtivo(req.params.evento_id, req.body?.ativo, {
        descartarRascunho: req.body?.descartar_rascunho === true,
      }),
    {
      successMessage: req.body?.ativo
        ? "Pré-teste ativado para o evento."
        : "Pré-teste desativado para o evento.",
    },
  );
}

async function obterParaResponder(req, res) {
  const usuarioId = getUserId(req);
  const eventoId = Number(req.params.evento_id);

  if (!usuarioId) {
    return fail(res, 401, "Não autenticado.", "NAO_AUTENTICADO");
  }

  try {
    const acesso = await podeAcessarEvento({
      usuarioId,
      eventoId,
      exigirPublicado: true,
      permitirAdministrador: true,
    });

    if (!acesso?.evento || acesso.evento.publicado !== true) {
      return fail(res, 404, "Evento não encontrado.", "EVENTO_NAO_ENCONTRADO");
    }

    if (!acesso.ok) {
      const naoEncontrado = [
        "EVENTO_NAO_ENCONTRADO",
        "EVENTO_NAO_PUBLICADO",
        "NAO_PUBLICADO",
      ].includes(String(acesso.motivo || ""));
      return fail(
        res,
        naoEncontrado ? 404 : 403,
        naoEncontrado
          ? "Evento não encontrado."
          : "Você não possui acesso a este evento.",
        naoEncontrado ? "EVENTO_NAO_ENCONTRADO" : "EVENTO_ACESSO_NEGADO",
      );
    }
  } catch (error) {
    console.error("[preTesteController] falha ao verificar acesso:", {
      name: error?.name,
      code: error?.code,
      message: error?.message,
    });
    return fail(
      res,
      500,
      "Não foi possível verificar o acesso ao evento.",
      "PRE_TESTE_ACESSO_ERRO",
    );
  }

  return executar(res, () => obterPreTesteParaResponder(eventoId, usuarioId), {
    successMessage: "Pré-teste do evento carregado.",
  });
}

module.exports = {
  obterPorEvento,
  obterResultadosEvento,
  obterRespostasPergunta,
  obterParticipantesResultados,
  obterParticipanteResultados,
  baixarRelatorioResultados,
  obterOuCriarRascunho,
  criarPergunta,
  editarPergunta,
  removerPergunta,
  ordenarPerguntas,
  criarAlternativa,
  editarAlternativa,
  removerAlternativa,
  ordenarAlternativas,
  publicar,
  atualizarAtivacao,
  obterParaResponder,
};
