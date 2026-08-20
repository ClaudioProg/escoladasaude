"use strict";

const db = require("../db");
const { PreTesteError, TIPOS_PERGUNTA } = require("./preTesteService");

const RESPOSTAS_INICIAIS_POR_PERGUNTA = 10;
const PARTICIPANTES_POR_PAGINA = 20;
const LIMITE_MAXIMO_POR_PAGINA = 100;

function executor(conn = db) {
  if (typeof conn === "function") {
    return conn;
  }

  if (conn && typeof conn.query === "function") {
    return conn.query.bind(conn);
  }

  throw new Error("Executor de banco inválido para resultados do pré-teste.");
}

function toPositiveInt(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function toNonNegativeInt(value, fallback = 0) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : fallback;
}

function toCount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function normalizeSearch(value) {
  return String(value || "")
    .trim()
    .slice(0, 120);
}

function normalizarPaginacao({ pagina, limite } = {}, limitePadrao) {
  const page = toPositiveInt(pagina) || 1;
  const pageSize = Math.min(
    toPositiveInt(limite) || limitePadrao,
    LIMITE_MAXIMO_POR_PAGINA,
  );

  return {
    pagina: page,
    limite: pageSize,
    offset: (page - 1) * pageSize,
  };
}

function mapVersao(row) {
  return {
    id: Number(row.versao_id),
    numero_versao: Number(row.numero_versao),
    status: row.status,
    publicado_em: row.publicado_em,
    atual: Number(row.versao_id) === Number(row.versao_atual_id),
    total_submissoes: toCount(row.total_submissoes),
    respondentes_unicos: toCount(row.respondentes_unicos),
    primeira_resposta: row.primeira_resposta || null,
    ultima_resposta: row.ultima_resposta || null,
  };
}

async function obterContextoResultados(eventoId, versaoId, conn = db) {
  const query = executor(conn);
  const eid = toPositiveInt(eventoId);
  const vid =
    versaoId == null || versaoId === "" ? null : toPositiveInt(versaoId);

  if (!eid) {
    throw new PreTesteError("evento_id inválido.");
  }

  if (versaoId != null && versaoId !== "" && !vid) {
    throw new PreTesteError("versao_id inválido.");
  }

  const eventoResult = await query(
    `
    /* pre_teste_resultados:contexto_evento */
    SELECT id, titulo
    FROM eventos
    WHERE id = $1
    LIMIT 1
    `,
    [eid],
  );

  if (!eventoResult.rowCount) {
    throw new PreTesteError("Evento não encontrado.", {
      status: 404,
      code: "EVENTO_NAO_ENCONTRADO",
    });
  }

  const versoesResult = await query(
    `
    /* pre_teste_resultados:contexto_versoes */
    SELECT
      pt.id AS pre_teste_id,
      pt.ativo,
      pt.versao_atual_id,
      v.id AS versao_id,
      v.numero_versao,
      v.status,
      v.publicado_em,
      COUNT(s.id)::integer AS total_submissoes,
      COUNT(DISTINCT s.usuario_id)::integer AS respondentes_unicos,
      MIN(s.enviado_em) AS primeira_resposta,
      MAX(s.enviado_em) AS ultima_resposta
    FROM pre_testes_evento pt
    LEFT JOIN pre_teste_versoes v
      ON v.pre_teste_id = pt.id
     AND v.status = 'publicado'
    LEFT JOIN pre_teste_submissoes s
      ON s.evento_id = pt.evento_id
     AND s.versao_id = v.id
    WHERE pt.evento_id = $1
    GROUP BY
      pt.id,
      pt.ativo,
      pt.versao_atual_id,
      v.id,
      v.numero_versao,
      v.status,
      v.publicado_em
    ORDER BY
      (v.id = pt.versao_atual_id) DESC NULLS LAST,
      v.numero_versao DESC NULLS LAST,
      v.id DESC NULLS LAST
    `,
    [eid],
  );

  const rows = versoesResult.rows || [];
  const configurado = rows.length > 0;
  const versoes = rows.filter((row) => row.versao_id).map(mapVersao);

  if (vid && !versoes.some((versao) => versao.id === vid)) {
    throw new PreTesteError("A versão informada não pertence a este evento.", {
      status: 404,
      code: "PRE_TESTE_VERSAO_EVENTO_INCOMPATIVEL",
    });
  }

  const versaoSelecionada = vid
    ? versoes.find((versao) => versao.id === vid)
    : versoes[0] || null;

  return {
    evento: {
      id: Number(eventoResult.rows[0].id),
      titulo: eventoResult.rows[0].titulo,
    },
    configurado,
    ativo: rows[0]?.ativo === true,
    pre_teste_id: rows[0]?.pre_teste_id ? Number(rows[0].pre_teste_id) : null,
    versoes,
    versao_selecionada: versaoSelecionada,
  };
}

function montarPerguntas(rows, respostasDissertativas = []) {
  const perguntas = new Map();

  for (const row of rows || []) {
    const perguntaId = Number(row.pergunta_id);
    let pergunta = perguntas.get(perguntaId);

    if (!pergunta) {
      pergunta = {
        id: perguntaId,
        tipo: row.tipo,
        enunciado: row.enunciado,
        ordem: Number(row.pergunta_ordem),
        total_respostas: 0,
        alternativas: [],
        respostas: [],
      };
      perguntas.set(perguntaId, pergunta);
    }

    const quantidade = toCount(row.quantidade);
    if (row.tipo === TIPOS_PERGUNTA.MULTIPLA_ESCOLHA && row.alternativa_id) {
      pergunta.alternativas.push({
        id: Number(row.alternativa_id),
        texto: row.alternativa_texto,
        ordem: Number(row.alternativa_ordem),
        quantidade,
      });
      pergunta.total_respostas += quantidade;
    } else if (row.tipo === TIPOS_PERGUNTA.DISSERTATIVA) {
      pergunta.total_respostas = quantidade;
    }
  }

  const respostasPorPergunta = new Map();
  for (const row of respostasDissertativas || []) {
    const perguntaId = Number(row.pergunta_id);
    const lista = respostasPorPergunta.get(perguntaId) || [];
    lista.push({
      submissao_id: Number(row.submissao_id),
      participante: row.participante,
      enviado_em: row.enviado_em,
      resposta: row.resposta_texto,
    });
    respostasPorPergunta.set(perguntaId, lista);
  }

  return [...perguntas.values()].map((pergunta) => {
    const total = pergunta.total_respostas;
    const alternativas = pergunta.alternativas.map((alternativa) => ({
      ...alternativa,
      percentual:
        total > 0
          ? Number(((alternativa.quantidade / total) * 100).toFixed(2))
          : 0,
    }));

    return {
      ...pergunta,
      alternativas,
      respostas: respostasPorPergunta.get(pergunta.id) || [],
    };
  });
}

async function obterResultados(
  eventoId,
  versaoId,
  conn = db,
  { respostasPorPergunta = RESPOSTAS_INICIAIS_POR_PERGUNTA } = {},
) {
  const query = executor(conn);
  const contexto = await obterContextoResultados(eventoId, versaoId, conn);
  const versao = contexto.versao_selecionada;

  if (!versao) {
    return {
      ...contexto,
      resumo: {
        numero_perguntas: 0,
        total_submissoes: 0,
        respondentes_unicos: 0,
        primeira_resposta: null,
        ultima_resposta: null,
      },
      perguntas: [],
    };
  }

  const perguntasResult = await query(
    `
    /* pre_teste_resultados:perguntas_agregadas */
    SELECT
      p.id AS pergunta_id,
      p.tipo,
      p.enunciado,
      p.ordem AS pergunta_ordem,
      a.id AS alternativa_id,
      a.texto AS alternativa_texto,
      a.ordem AS alternativa_ordem,
      COUNT(r.id) FILTER (WHERE s.id IS NOT NULL)::integer AS quantidade
    FROM pre_teste_perguntas p
    LEFT JOIN pre_teste_alternativas a ON a.pergunta_id = p.id
    LEFT JOIN pre_teste_respostas r
      ON r.pergunta_id = p.id
     AND (a.id IS NULL OR r.alternativa_id = a.id)
    LEFT JOIN pre_teste_submissoes s
      ON s.id = r.submissao_id
     AND s.evento_id = $1
     AND s.versao_id = $2
    WHERE p.versao_id = $2
    GROUP BY
      p.id,
      p.tipo,
      p.enunciado,
      p.ordem,
      a.id,
      a.texto,
      a.ordem
    ORDER BY p.ordem, p.id, a.ordem NULLS LAST, a.id NULLS LAST
    `,
    [contexto.evento.id, versao.id],
  );

  const previewLimit = Math.min(
    toPositiveInt(respostasPorPergunta) || RESPOSTAS_INICIAIS_POR_PERGUNTA,
    LIMITE_MAXIMO_POR_PAGINA,
  );
  const respostasResult = await query(
    `
    /* pre_teste_resultados:dissertativas_preview */
    SELECT
      ranked.pergunta_id,
      ranked.submissao_id,
      ranked.participante,
      ranked.enviado_em,
      ranked.resposta_texto
    FROM (
      SELECT
        p.id AS pergunta_id,
        s.id AS submissao_id,
        u.nome AS participante,
        s.enviado_em,
        r.resposta_texto,
        ROW_NUMBER() OVER (
          PARTITION BY p.id
          ORDER BY s.enviado_em, s.id
        ) AS posicao
      FROM pre_teste_perguntas p
      JOIN pre_teste_respostas r ON r.pergunta_id = p.id
      JOIN pre_teste_submissoes s
        ON s.id = r.submissao_id
       AND s.evento_id = $1
       AND s.versao_id = $2
      JOIN usuarios u ON u.id = s.usuario_id
      WHERE p.versao_id = $2
        AND p.tipo = 'dissertativa'
    ) ranked
    WHERE ranked.posicao <= $3
    ORDER BY ranked.pergunta_id, ranked.enviado_em, ranked.submissao_id
    `,
    [contexto.evento.id, versao.id, previewLimit],
  );

  const perguntas = montarPerguntas(perguntasResult.rows, respostasResult.rows);

  return {
    ...contexto,
    resumo: {
      numero_perguntas: perguntas.length,
      total_submissoes: versao.total_submissoes,
      respondentes_unicos: versao.respondentes_unicos,
      primeira_resposta: versao.primeira_resposta,
      ultima_resposta: versao.ultima_resposta,
    },
    perguntas,
  };
}

async function listarRespostasDissertativas(
  eventoId,
  versaoId,
  perguntaId,
  opcoes = {},
  conn = db,
) {
  const query = executor(conn);
  const contexto = await obterContextoResultados(eventoId, versaoId, conn);
  const versao = contexto.versao_selecionada;
  const pid = toPositiveInt(perguntaId);

  if (!versao || !pid) {
    throw new PreTesteError("Pergunta dissertativa não encontrada.", {
      status: 404,
      code: "PRE_TESTE_PERGUNTA_NAO_ENCONTRADA",
    });
  }

  const perguntaResult = await query(
    `
    /* pre_teste_resultados:validar_pergunta_dissertativa */
    SELECT id, enunciado, ordem
    FROM pre_teste_perguntas
    WHERE id = $1 AND versao_id = $2 AND tipo = 'dissertativa'
    LIMIT 1
    `,
    [pid, versao.id],
  );

  if (!perguntaResult.rowCount) {
    throw new PreTesteError("Pergunta dissertativa não encontrada.", {
      status: 404,
      code: "PRE_TESTE_PERGUNTA_NAO_ENCONTRADA",
    });
  }

  const paginacao = normalizarPaginacao(
    opcoes,
    RESPOSTAS_INICIAIS_POR_PERGUNTA,
  );
  const result = await query(
    `
    /* pre_teste_resultados:respostas_dissertativas */
    SELECT
      s.id AS submissao_id,
      u.nome AS participante,
      s.enviado_em,
      r.resposta_texto,
      COUNT(*) OVER()::integer AS total
    FROM pre_teste_respostas r
    JOIN pre_teste_submissoes s
      ON s.id = r.submissao_id
     AND s.evento_id = $1
     AND s.versao_id = $2
    JOIN usuarios u ON u.id = s.usuario_id
    WHERE r.pergunta_id = $3
    ORDER BY s.enviado_em, s.id
    LIMIT $4 OFFSET $5
    `,
    [contexto.evento.id, versao.id, pid, paginacao.limite, paginacao.offset],
  );

  const total = toCount(result.rows?.[0]?.total);
  return {
    pergunta: {
      id: Number(perguntaResult.rows[0].id),
      enunciado: perguntaResult.rows[0].enunciado,
      ordem: Number(perguntaResult.rows[0].ordem),
    },
    respostas: (result.rows || []).map((row) => ({
      submissao_id: Number(row.submissao_id),
      participante: row.participante,
      enviado_em: row.enviado_em,
      resposta: row.resposta_texto,
    })),
    paginacao: {
      pagina: paginacao.pagina,
      limite: paginacao.limite,
      total,
      total_paginas: Math.ceil(total / paginacao.limite),
    },
  };
}

async function listarParticipantes(eventoId, versaoId, opcoes = {}, conn = db) {
  const query = executor(conn);
  const contexto = await obterContextoResultados(eventoId, versaoId, conn);
  const versao = contexto.versao_selecionada;
  const paginacao = normalizarPaginacao(opcoes, PARTICIPANTES_POR_PAGINA);
  const busca = normalizeSearch(opcoes.busca);

  if (!versao) {
    return {
      participantes: [],
      paginacao: {
        pagina: paginacao.pagina,
        limite: paginacao.limite,
        total: 0,
        total_paginas: 0,
      },
    };
  }

  const result = await query(
    `
    /* pre_teste_resultados:participantes */
    SELECT
      s.id AS submissao_id,
      s.usuario_id,
      u.nome,
      s.enviado_em,
      COUNT(*) OVER()::integer AS total
    FROM pre_teste_submissoes s
    JOIN usuarios u ON u.id = s.usuario_id
    WHERE s.evento_id = $1
      AND s.versao_id = $2
      AND ($3::text = '' OR LOWER(u.nome) LIKE '%' || LOWER($3) || '%')
    ORDER BY u.nome, s.enviado_em, s.id
    LIMIT $4 OFFSET $5
    `,
    [contexto.evento.id, versao.id, busca, paginacao.limite, paginacao.offset],
  );

  const total = toCount(result.rows?.[0]?.total);
  return {
    participantes: (result.rows || []).map((row) => ({
      submissao_id: Number(row.submissao_id),
      usuario_id: Number(row.usuario_id),
      nome: row.nome,
      enviado_em: row.enviado_em,
    })),
    paginacao: {
      pagina: paginacao.pagina,
      limite: paginacao.limite,
      total,
      total_paginas: Math.ceil(total / paginacao.limite),
    },
  };
}

function montarParticipanteDetalhado(rows) {
  if (!rows?.length) {
    return null;
  }

  const first = rows[0];
  return {
    submissao_id: Number(first.submissao_id),
    usuario_id: Number(first.usuario_id),
    nome: first.participante,
    enviado_em: first.enviado_em,
    respostas: rows.map((row) => ({
      pergunta_id: Number(row.pergunta_id),
      ordem: Number(row.pergunta_ordem),
      tipo: row.tipo,
      enunciado: row.enunciado,
      resposta:
        row.tipo === TIPOS_PERGUNTA.MULTIPLA_ESCOLHA
          ? row.alternativa_texto || null
          : row.resposta_texto || null,
    })),
  };
}

async function obterParticipante(eventoId, versaoId, submissaoId, conn = db) {
  const query = executor(conn);
  const contexto = await obterContextoResultados(eventoId, versaoId, conn);
  const versao = contexto.versao_selecionada;
  const sid = toPositiveInt(submissaoId);

  if (!versao || !sid) {
    throw new PreTesteError("Submissão não encontrada.", {
      status: 404,
      code: "PRE_TESTE_SUBMISSAO_NAO_ENCONTRADA",
    });
  }

  const result = await query(
    `
    /* pre_teste_resultados:participante_detalhe */
    SELECT
      s.id AS submissao_id,
      s.usuario_id,
      u.nome AS participante,
      s.enviado_em,
      p.id AS pergunta_id,
      p.ordem AS pergunta_ordem,
      p.tipo,
      p.enunciado,
      r.resposta_texto,
      a.texto AS alternativa_texto
    FROM pre_teste_submissoes s
    JOIN usuarios u ON u.id = s.usuario_id
    JOIN pre_teste_perguntas p ON p.versao_id = s.versao_id
    LEFT JOIN pre_teste_respostas r
      ON r.submissao_id = s.id
     AND r.pergunta_id = p.id
    LEFT JOIN pre_teste_alternativas a
      ON a.id = r.alternativa_id
     AND a.pergunta_id = p.id
    WHERE s.id = $1
      AND s.evento_id = $2
      AND s.versao_id = $3
    ORDER BY p.ordem, p.id
    `,
    [sid, contexto.evento.id, versao.id],
  );

  const participante = montarParticipanteDetalhado(result.rows);
  if (!participante) {
    throw new PreTesteError("Submissão não encontrada.", {
      status: 404,
      code: "PRE_TESTE_SUBMISSAO_NAO_ENCONTRADA",
    });
  }

  return participante;
}

function agruparParticipantesRelatorio(rows) {
  const participantes = new Map();

  for (const row of rows || []) {
    const submissaoId = Number(row.submissao_id);
    const atual = participantes.get(submissaoId) || {
      submissao_id: submissaoId,
      usuario_id: Number(row.usuario_id),
      nome: row.participante,
      enviado_em: row.enviado_em,
      respostas: [],
    };

    atual.respostas.push({
      pergunta_id: Number(row.pergunta_id),
      ordem: Number(row.pergunta_ordem),
      tipo: row.tipo,
      enunciado: row.enunciado,
      resposta:
        row.tipo === TIPOS_PERGUNTA.MULTIPLA_ESCOLHA
          ? row.alternativa_texto || null
          : row.resposta_texto || null,
    });
    participantes.set(submissaoId, atual);
  }

  return [...participantes.values()];
}

async function obterDadosRelatorio(eventoId, versaoId, tipo, conn = db) {
  const query = executor(conn);
  const resultados = await obterResultados(eventoId, versaoId, conn);
  const versao = resultados.versao_selecionada;

  if (!versao || resultados.resumo.total_submissoes === 0) {
    return { ...resultados, tipo, participantes: [] };
  }

  if (tipo === "consolidado") {
    const respostasResult = await query(
      `
      /* pre_teste_resultados:relatorio_consolidado_dissertativas */
      SELECT
        p.id AS pergunta_id,
        s.id AS submissao_id,
        u.nome AS participante,
        s.enviado_em,
        r.resposta_texto
      FROM pre_teste_perguntas p
      JOIN pre_teste_respostas r ON r.pergunta_id = p.id
      JOIN pre_teste_submissoes s
        ON s.id = r.submissao_id
       AND s.evento_id = $1
       AND s.versao_id = $2
      JOIN usuarios u ON u.id = s.usuario_id
      WHERE p.versao_id = $2
        AND p.tipo = 'dissertativa'
      ORDER BY p.ordem, s.enviado_em, s.id
      `,
      [resultados.evento.id, versao.id],
    );

    const perguntas = montarPerguntas(
      resultados.perguntas.flatMap((pergunta) =>
        pergunta.tipo === TIPOS_PERGUNTA.MULTIPLA_ESCOLHA
          ? pergunta.alternativas.map((alternativa) => ({
              pergunta_id: pergunta.id,
              tipo: pergunta.tipo,
              enunciado: pergunta.enunciado,
              pergunta_ordem: pergunta.ordem,
              alternativa_id: alternativa.id,
              alternativa_texto: alternativa.texto,
              alternativa_ordem: alternativa.ordem,
              quantidade: alternativa.quantidade,
            }))
          : [
              {
                pergunta_id: pergunta.id,
                tipo: pergunta.tipo,
                enunciado: pergunta.enunciado,
                pergunta_ordem: pergunta.ordem,
                quantidade: pergunta.total_respostas,
              },
            ],
      ),
      respostasResult.rows,
    );

    return { ...resultados, tipo, perguntas, participantes: [] };
  }

  if (tipo !== "detalhado") {
    throw new PreTesteError("Tipo de relatório inválido.", {
      code: "PRE_TESTE_RELATORIO_TIPO_INVALIDO",
    });
  }

  const detalhadoResult = await query(
    `
    /* pre_teste_resultados:relatorio_detalhado */
    SELECT
      s.id AS submissao_id,
      s.usuario_id,
      u.nome AS participante,
      s.enviado_em,
      p.id AS pergunta_id,
      p.ordem AS pergunta_ordem,
      p.tipo,
      p.enunciado,
      r.resposta_texto,
      a.texto AS alternativa_texto
    FROM pre_teste_submissoes s
    JOIN usuarios u ON u.id = s.usuario_id
    JOIN pre_teste_perguntas p ON p.versao_id = s.versao_id
    LEFT JOIN pre_teste_respostas r
      ON r.submissao_id = s.id
     AND r.pergunta_id = p.id
    LEFT JOIN pre_teste_alternativas a
      ON a.id = r.alternativa_id
     AND a.pergunta_id = p.id
    WHERE s.evento_id = $1
      AND s.versao_id = $2
    ORDER BY u.nome, s.enviado_em, s.id, p.ordem, p.id
    `,
    [resultados.evento.id, versao.id],
  );

  return {
    ...resultados,
    tipo,
    participantes: agruparParticipantesRelatorio(detalhadoResult.rows),
  };
}

module.exports = {
  RESPOSTAS_INICIAIS_POR_PERGUNTA,
  obterContextoResultados,
  obterResultados,
  listarRespostasDissertativas,
  listarParticipantes,
  obterParticipante,
  obterDadosRelatorio,
  montarPerguntas,
  montarParticipanteDetalhado,
};
