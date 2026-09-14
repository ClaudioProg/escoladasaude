"use strict";

const FREQUENCIA_MINIMA_PERCENTUAL = 75;
const LIMITE_INGRESSO_PERCENTUAL = 100 - FREQUENCIA_MINIMA_PERCENTUAL;

function inteiroNaoNegativo(value) {
  const numero = Number(value);
  return Number.isFinite(numero) && numero > 0 ? Math.trunc(numero) : 0;
}

function avaliarPrazoInscricaoTurma({
  total_encontros,
  encontros_iniciados,
  encerrada = false,
} = {}) {
  const totalEncontros = inteiroNaoNegativo(total_encontros);
  const encontrosIniciados = Math.min(
    inteiroNaoNegativo(encontros_iniciados),
    totalEncontros,
  );
  const percentualDecorrido = totalEncontros
    ? (encontrosIniciados / totalEncontros) * 100
    : 100;
  const frequenciaMaximaPossivel = totalEncontros
    ? ((totalEncontros - encontrosIniciados) / totalEncontros) * 100
    : 0;

  let motivoBloqueio = "";

  if (encerrada) {
    motivoBloqueio = "Esta turma já foi encerrada.";
  } else if (!totalEncontros) {
    motivoBloqueio = "Esta turma ainda não possui cronograma disponível.";
  } else if (frequenciaMaximaPossivel < FREQUENCIA_MINIMA_PERCENTUAL) {
    motivoBloqueio =
      "O período de inscrição terminou porque não é mais possível cumprir 75% da frequência.";
  }

  return {
    total_encontros: totalEncontros,
    encontros_iniciados: encontrosIniciados,
    percentual_decorrido: Number(percentualDecorrido.toFixed(2)),
    frequencia_maxima_possivel: Number(frequenciaMaximaPossivel.toFixed(2)),
    inscricao_no_prazo: motivoBloqueio === "",
    motivo_bloqueio_prazo: motivoBloqueio,
    encerrada: Boolean(encerrada),
  };
}

function resumirDisponibilidadeEvento(turmas = []) {
  const normalizadas = turmas.map((turma) => {
    const prazo = avaliarPrazoInscricaoTurma(turma);
    const vagasTotal = inteiroNaoNegativo(turma.vagas_total);
    const vagasPreenchidas = inteiroNaoNegativo(
      turma.vagas_preenchidas ?? turma.inscritos,
    );

    return {
      ...turma,
      ...prazo,
      vagas_total: vagasTotal,
      vagas_preenchidas: vagasPreenchidas,
      vagas_disponiveis: Math.max(vagasTotal - vagasPreenchidas, 0),
    };
  });
  const turmasNoPrazo = normalizadas.filter(
    (turma) => turma.inscricao_no_prazo,
  );
  const vagasTotal = turmasNoPrazo.reduce(
    (total, turma) => total + turma.vagas_total,
    0,
  );
  const vagasPreenchidas = turmasNoPrazo.reduce(
    (total, turma) =>
      total + Math.min(turma.vagas_preenchidas, turma.vagas_total),
    0,
  );
  const vagasDisponiveis = Math.max(vagasTotal - vagasPreenchidas, 0);

  return {
    turmas: normalizadas,
    evento_visivel_vitrine: turmasNoPrazo.length > 0,
    inscricao_no_prazo: turmasNoPrazo.length > 0,
    evento_encerrado:
      normalizadas.length > 0 && normalizadas.every((turma) => turma.encerrada),
    vagas_total: vagasTotal,
    vagas_preenchidas: vagasPreenchidas,
    vagas_disponiveis: vagasDisponiveis,
    ocupacao_percentual: vagasTotal
      ? Number(((vagasPreenchidas / vagasTotal) * 100).toFixed(2))
      : 0,
    vagas_esgotadas:
      turmasNoPrazo.length > 0 &&
      turmasNoPrazo.every((turma) => turma.vagas_disponiveis === 0),
  };
}

module.exports = {
  FREQUENCIA_MINIMA_PERCENTUAL,
  LIMITE_INGRESSO_PERCENTUAL,
  avaliarPrazoInscricaoTurma,
  resumirDisponibilidadeEvento,
};
