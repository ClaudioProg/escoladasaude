import { apiGet, apiGetFile, downloadBlob } from "./api";

function unwrap(response) {
  return response?.data ?? response;
}

function resultadosPath(eventoId, suffix = "") {
  return `/pre-teste/evento/${Number(eventoId)}/resultados${suffix}`;
}

export async function obterResultadosPreTeste(eventoId, versaoId) {
  const response = await apiGet(resultadosPath(eventoId), {
    auth: true,
    on401: "redirect",
    on403: "redirect",
    query: { versao_id: versaoId },
  });

  return unwrap(response);
}

export async function listarParticipantesPreTeste(
  eventoId,
  { versaoId, busca, pagina = 1, limite = 20 } = {},
) {
  const response = await apiGet(resultadosPath(eventoId, "/participantes"), {
    auth: true,
    on401: "redirect",
    on403: "redirect",
    query: {
      versao_id: versaoId,
      busca,
      pagina,
      limite,
    },
  });

  return unwrap(response);
}

export async function obterRespostasParticipantePreTeste(
  eventoId,
  submissaoId,
  versaoId,
) {
  const response = await apiGet(
    resultadosPath(eventoId, `/submissao/${Number(submissaoId)}`),
    {
      auth: true,
      on401: "redirect",
      on403: "redirect",
      query: { versao_id: versaoId },
    },
  );

  return unwrap(response);
}

export async function listarRespostasDissertativasPreTeste(
  eventoId,
  perguntaId,
  { versaoId, pagina = 1, limite = 20 } = {},
) {
  const response = await apiGet(
    resultadosPath(eventoId, `/pergunta/${Number(perguntaId)}/respostas`),
    {
      auth: true,
      on401: "redirect",
      on403: "redirect",
      query: {
        versao_id: versaoId,
        pagina,
        limite,
      },
    },
  );

  return unwrap(response);
}

export async function baixarRelatorioPreTeste(eventoId, { versaoId, tipo }) {
  const { blob, filename } = await apiGetFile(
    resultadosPath(eventoId, "/pdf"),
    {
      auth: true,
      on401: "redirect",
      on403: "redirect",
      query: { versao_id: versaoId, tipo },
    },
  );

  const nomeFallback = `pre-teste-evento-${Number(eventoId)}-${tipo}.pdf`;
  downloadBlob(filename || nomeFallback, blob);
}
