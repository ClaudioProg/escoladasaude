"use strict";

const FREQUENCIA_MINIMA_PERCENTUAL = 75;
const LIMITE_INGRESSO_PERCENTUAL = 100 - FREQUENCIA_MINIMA_PERCENTUAL;
const SEGUNDOS_POR_HORA = 3600;

/**
 * O cronograma em datas_turma é a fonte dos períodos de aula. Apenas o tempo
 * transcorrido dentro desses períodos conta para a janela de ingresso; noites,
 * finais de semana e intervalos entre datas não são carga horária cursada.
 *
 * A mesma consulta é utilizada pela vitrine, pelo detalhe e pelo POST de
 * inscrição, impedindo que a interface permita algo que o backend recuse.
 *
 * @param {Function} query - client.query.bind(client) ou o executor transacional q
 * @param {number[]} ids - IDs das turmas ou dos eventos
 * @param {Object} options - porEvento e agoraBr (exclusivo para testes)
 */
async function consultarDisponibilidadeTurmas(
  query,
  ids,
  { porEvento = false, agoraBr = null } = {},
) {
  const validos = [
    ...new Set(
      (Array.isArray(ids) ? ids : [])
        .map(Number)
        .filter((id) => Number.isSafeInteger(id) && id > 0),
    ),
  ];
  if (!validos.length) return [];

  const coluna = porEvento ? "evento_id" : "id";
  const resultado = await query(
    `
    SELECT
      t.id,
      t.evento_id,
      t.nome,
      t.vagas_total,
      t.carga_horaria,
      COALESCE(i.inscritos, 0)::int AS vagas_preenchidas,
      COALESCE(d.total_encontros, 0)::int AS total_encontros,
      COALESCE(d.encontros_iniciados, 0)::int AS encontros_iniciados,
      COALESCE(d.encontros_invalidos, 0)::int AS encontros_invalidos,
      COALESCE(d.total_segundos, 0)::numeric AS total_segundos,
      COALESCE(d.segundos_decorridos, 0)::numeric AS segundos_decorridos,
      (
        COALESCE(d.total_encontros, 0) > 0
        AND COALESCE(d.encontros_encerrados, 0) = d.total_encontros
      ) AS encerrada
    FROM turmas t
    CROSS JOIN (
      SELECT COALESCE(
        $2::timestamp,
        timezone('America/Sao_Paulo', statement_timestamp())
      ) AS agora
    ) momento
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::int AS total_encontros,
        COUNT(*) FILTER (
          WHERE dt.horario_fim <= dt.horario_inicio
        )::int AS encontros_invalidos,
        COUNT(*) FILTER (
          WHERE (dt.data::date + dt.horario_inicio) <= momento.agora
        )::int AS encontros_iniciados,
        COUNT(*) FILTER (
          WHERE (dt.data::date + dt.horario_fim) < momento.agora
        )::int AS encontros_encerrados,
        COALESCE(SUM(
          EXTRACT(EPOCH FROM (dt.horario_fim - dt.horario_inicio))
        ) FILTER (
          WHERE dt.horario_fim > dt.horario_inicio
        ), 0) AS total_segundos,
        COALESCE(SUM(
          GREATEST(
            0,
            LEAST(
              EXTRACT(EPOCH FROM (
                dt.horario_fim - dt.horario_inicio
              )),
              EXTRACT(EPOCH FROM (
                momento.agora - (dt.data::date + dt.horario_inicio)
              ))
            )
          )
        ) FILTER (
          WHERE dt.horario_fim > dt.horario_inicio
        ), 0) AS segundos_decorridos
      FROM datas_turma dt
      WHERE dt.turma_id = t.id
    ) d ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS inscritos
      FROM inscricoes ins
      WHERE ins.turma_id = t.id
    ) i ON TRUE
    WHERE t.${coluna} = ANY($1::int[])
    ORDER BY t.evento_id, t.data_inicio, t.id
    `,
    [validos, agoraBr],
  );
  return resultado.rows || [];
}

function numeroNaoNegativo(value) {
  const numero = Number(value);
  return Number.isFinite(numero) && numero > 0 ? numero : 0;
}

function inteiroNaoNegativo(value) {
  return Math.trunc(numeroNaoNegativo(value));
}

function avaliarPrazoInscricaoTurma({
  total_encontros,
  encontros_iniciados,
  encontros_invalidos,
  total_segundos,
  segundos_decorridos,
  carga_horaria,
  encerrada = false,
} = {}) {
  const totalEncontros = inteiroNaoNegativo(total_encontros);
  const encontrosIniciados = Math.min(
    inteiroNaoNegativo(encontros_iniciados),
    totalEncontros,
  );
  const encontrosInvalidos = inteiroNaoNegativo(encontros_invalidos);
  const segundosProgramados = numeroNaoNegativo(total_segundos);
  const segundosDecorridos = Math.min(
    numeroNaoNegativo(segundos_decorridos),
    segundosProgramados,
  );
  const cargaOficialSegundos =
    numeroNaoNegativo(carga_horaria) * SEGUNDOS_POR_HORA;

  // Regra conservadora: se carga oficial e horários divergirem, nunca usar
  // a maior duração para conceder ingresso além do limite de 25%.
  const segundosReferencia = Math.min(
    segundosProgramados,
    cargaOficialSegundos,
  );
  const percentualDecorrido = segundosReferencia
    ? Math.min(100, (segundosDecorridos / segundosReferencia) * 100)
    : 100;
  const frequenciaMaximaPossivel = segundosReferencia
    ? Math.max(0, 100 - percentualDecorrido)
    : 0;

  let motivoBloqueio = "";
  if (encerrada) {
    motivoBloqueio = "Esta turma já foi encerrada.";
  } else if (!totalEncontros || !segundosReferencia) {
    motivoBloqueio = "Esta turma ainda não possui cronograma válido.";
  } else if (encontrosInvalidos) {
    motivoBloqueio = "Esta turma possui horários inválidos no cronograma.";
  } else if (
    segundosDecorridos * 100 >
    segundosReferencia * LIMITE_INGRESSO_PERCENTUAL
  ) {
    motivoBloqueio =
      "O período de inscrição terminou porque não é mais possível cumprir 75% da frequência.";
  }

  return {
    total_encontros: totalEncontros,
    encontros_iniciados: encontrosIniciados,
    total_segundos: segundosProgramados,
    segundos_decorridos: segundosDecorridos,
    segundos_referencia: segundosReferencia,
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
  consultarDisponibilidadeTurmas,
  avaliarPrazoInscricaoTurma,
  resumirDisponibilidadeEvento,
};
