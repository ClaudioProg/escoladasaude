"use strict";

const db = require("../db");

const TIPOS_PERGUNTA = Object.freeze({
  MULTIPLA_ESCOLHA: "multipla_escolha",
  DISSERTATIVA: "dissertativa",
});

const MODOS_RESPOSTA = Object.freeze({
  UNICA: "resposta_unica",
  MULTIPLAS: "respostas_multiplas",
});

class PreTesteError extends Error {
  constructor(message, { status = 400, code = "PRE_TESTE_INVALIDO" } = {}) {
    super(message);
    this.name = "PreTesteError";
    this.status = status;
    this.code = code;
  }
}

function toPositiveInt(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function normalizeText(value, maxLength = 10000) {
  return String(value ?? "")
    .trim()
    .slice(0, maxLength);
}

function normalizeTipo(value) {
  const tipo = normalizeText(value, 40).toLowerCase();
  return Object.values(TIPOS_PERGUNTA).includes(tipo) ? tipo : null;
}

function normalizeModoResposta(value, tipo) {
  if (tipo === TIPOS_PERGUNTA.DISSERTATIVA) {
    return null;
  }

  const modo = normalizeText(value, 40).toLowerCase();
  return Object.values(MODOS_RESPOSTA).includes(modo)
    ? modo
    : MODOS_RESPOSTA.UNICA;
}

function normalizeModoRespostaPayload(payload, tipo) {
  const informouModo = Object.prototype.hasOwnProperty.call(
    payload,
    "modo_resposta",
  );

  if (tipo === TIPOS_PERGUNTA.DISSERTATIVA) {
    if (!informouModo || payload.modo_resposta === null) {
      return null;
    }

    throw new PreTesteError("O modo de resposta informado é inválido.", {
      status: 422,
      code: "PRE_TESTE_MODO_RESPOSTA_INVALIDO",
    });
  }

  if (!informouModo) {
    return MODOS_RESPOSTA.UNICA;
  }

  if (
    payload.modo_resposta === MODOS_RESPOSTA.UNICA ||
    payload.modo_resposta === MODOS_RESPOSTA.MULTIPLAS
  ) {
    return payload.modo_resposta;
  }

  throw new PreTesteError("O modo de resposta informado é inválido.", {
    status: 422,
    code: "PRE_TESTE_MODO_RESPOSTA_INVALIDO",
  });
}

function normalizarIdsSelecionados(value) {
  if (!Array.isArray(value)) {
    return null;
  }

  const ids = value.map(toPositiveInt);
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) {
    return null;
  }
  return ids.sort((a, b) => a - b);
}

function executor(conn = db) {
  if (typeof conn === "function") {
    return conn;
  }

  if (conn && typeof conn.query === "function") {
    return conn.query.bind(conn);
  }

  throw new Error("Executor de banco inválido para o pré-teste.");
}

async function carregarVersaoCompleta(conn, versaoId) {
  const query = executor(conn);
  const id = toPositiveInt(versaoId);

  if (!id) {
    return null;
  }

  const versaoResult = await query(
    `
    SELECT
      v.id,
      v.pre_teste_id,
      v.numero_versao,
      v.status,
      v.publicado_em,
      v.criado_em,
      v.atualizado_em
    FROM pre_teste_versoes v
    WHERE v.id = $1
    LIMIT 1
    `,
    [id],
  );

  const versao = versaoResult.rows?.[0];

  if (!versao) {
    return null;
  }

  const perguntasResult = await query(
    `
    SELECT id, versao_id, tipo, modo_resposta, enunciado, ordem, criado_em, atualizado_em
    FROM pre_teste_perguntas
    WHERE versao_id = $1
    ORDER BY ordem, id
    `,
    [id],
  );

  const perguntas = perguntasResult.rows || [];
  const perguntaIds = perguntas.map((item) => Number(item.id));
  let alternativas = [];

  if (perguntaIds.length) {
    const alternativasResult = await query(
      `
      SELECT id, pergunta_id, texto, ordem, criado_em, atualizado_em
      FROM pre_teste_alternativas
      WHERE pergunta_id = ANY($1::integer[])
      ORDER BY pergunta_id, ordem, id
      `,
      [perguntaIds],
    );
    alternativas = alternativasResult.rows || [];
  }

  return {
    ...versao,
    id: Number(versao.id),
    pre_teste_id: Number(versao.pre_teste_id),
    numero_versao: Number(versao.numero_versao),
    perguntas: perguntas.map((pergunta) => ({
      ...pergunta,
      id: Number(pergunta.id),
      versao_id: Number(pergunta.versao_id),
      ordem: Number(pergunta.ordem),
      modo_resposta: normalizeModoResposta(
        pergunta.modo_resposta,
        pergunta.tipo,
      ),
      alternativas: alternativas
        .filter(
          (alternativa) =>
            Number(alternativa.pergunta_id) === Number(pergunta.id),
        )
        .map((alternativa) => ({
          ...alternativa,
          id: Number(alternativa.id),
          pergunta_id: Number(alternativa.pergunta_id),
          ordem: Number(alternativa.ordem),
        })),
    })),
  };
}

async function obterConfiguracaoAdministrativa(eventoId, conn = db) {
  const query = executor(conn);
  const id = toPositiveInt(eventoId);

  if (!id) {
    throw new PreTesteError("evento_id inválido.");
  }

  const eventoResult = await query(
    "SELECT id, titulo, publicado FROM eventos WHERE id = $1 LIMIT 1",
    [id],
  );

  if (!eventoResult.rowCount) {
    throw new PreTesteError("Evento não encontrado.", {
      status: 404,
      code: "EVENTO_NAO_ENCONTRADO",
    });
  }

  const configuracaoResult = await query(
    `
    SELECT
      pt.id,
      pt.evento_id,
      pt.ativo,
      pt.versao_atual_id,
      pt.criado_em,
      pt.atualizado_em,
      r.id AS rascunho_id
    FROM pre_testes_evento pt
    LEFT JOIN pre_teste_versoes r
      ON r.pre_teste_id = pt.id
     AND r.status = 'rascunho'
    WHERE pt.evento_id = $1
    LIMIT 1
    `,
    [id],
  );

  const configuracao = configuracaoResult.rows?.[0];

  if (!configuracao) {
    return {
      configurado: false,
      ativo: false,
      evento: eventoResult.rows[0],
      versao_publicada: null,
      rascunho: null,
    };
  }

  const [rascunho, versaoPublicada] = await Promise.all([
    carregarVersaoCompleta(conn, configuracao.rascunho_id),
    carregarVersaoCompleta(conn, configuracao.versao_atual_id),
  ]);

  return {
    configurado: true,
    id: Number(configuracao.id),
    evento_id: Number(configuracao.evento_id),
    ativo: configuracao.ativo === true,
    versao_atual_id: toPositiveInt(configuracao.versao_atual_id),
    criado_em: configuracao.criado_em,
    atualizado_em: configuracao.atualizado_em,
    evento: eventoResult.rows[0],
    versao_publicada: versaoPublicada,
    rascunho,
  };
}

async function criarOuObterRascunho(eventoId) {
  const id = toPositiveInt(eventoId);

  if (!id) {
    throw new PreTesteError("evento_id inválido.");
  }

  return db.tx(async (tx) => {
    const evento = await tx.query(
      "SELECT id FROM eventos WHERE id = $1 FOR SHARE",
      [id],
    );

    if (!evento.rowCount) {
      throw new PreTesteError("Evento não encontrado.", {
        status: 404,
        code: "EVENTO_NAO_ENCONTRADO",
      });
    }

    await tx.query(
      `
      INSERT INTO pre_testes_evento (evento_id, ativo)
      VALUES ($1, FALSE)
      ON CONFLICT (evento_id) DO NOTHING
      `,
      [id],
    );

    const configuracaoResult = await tx.query(
      `
      SELECT id, versao_atual_id
      FROM pre_testes_evento
      WHERE evento_id = $1
      FOR UPDATE
      `,
      [id],
    );
    const configuracao = configuracaoResult.rows[0];

    const rascunhoExistente = await tx.query(
      `
      SELECT id
      FROM pre_teste_versoes
      WHERE pre_teste_id = $1 AND status = 'rascunho'
      LIMIT 1
      `,
      [configuracao.id],
    );

    if (!rascunhoExistente.rowCount) {
      const numeroResult = await tx.query(
        `
        SELECT COALESCE(MAX(numero_versao), 0) + 1 AS proximo
        FROM pre_teste_versoes
        WHERE pre_teste_id = $1
        `,
        [configuracao.id],
      );
      const novaVersaoResult = await tx.query(
        `
        INSERT INTO pre_teste_versoes (pre_teste_id, numero_versao)
        VALUES ($1, $2)
        RETURNING id
        `,
        [configuracao.id, Number(numeroResult.rows[0].proximo)],
      );
      const novaVersaoId = Number(novaVersaoResult.rows[0].id);

      if (configuracao.versao_atual_id) {
        const publicada = await carregarVersaoCompleta(
          tx,
          configuracao.versao_atual_id,
        );

        for (const pergunta of publicada?.perguntas || []) {
          const perguntaResult = await tx.query(
            `
            INSERT INTO pre_teste_perguntas
              (versao_id, tipo, modo_resposta, enunciado, ordem)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id
            `,
            [
              novaVersaoId,
              pergunta.tipo,
              pergunta.modo_resposta,
              pergunta.enunciado,
              pergunta.ordem,
            ],
          );
          const novaPerguntaId = Number(perguntaResult.rows[0].id);

          for (const alternativa of pergunta.alternativas || []) {
            await tx.query(
              `
              INSERT INTO pre_teste_alternativas
                (pergunta_id, texto, ordem)
              VALUES ($1, $2, $3)
              `,
              [novaPerguntaId, alternativa.texto, alternativa.ordem],
            );
          }
        }
      }
    }

    return obterConfiguracaoAdministrativa(id, tx);
  });
}

async function obterRascunhoGerenciavel(conn, versaoId) {
  const query = executor(conn);
  const id = toPositiveInt(versaoId);
  const result = await query(
    `
    SELECT v.id, v.pre_teste_id
    FROM pre_teste_versoes v
    WHERE v.id = $1 AND v.status = 'rascunho'
    FOR UPDATE
    `,
    [id || 0],
  );

  if (!result.rowCount) {
    throw new PreTesteError(
      "Versão de rascunho não encontrada ou já publicada.",
      { status: 409, code: "PRE_TESTE_VERSAO_IMUTAVEL" },
    );
  }

  return result.rows[0];
}

async function reordenarRegistros(conn, { tabela, colunaPai, paiId, ids }) {
  const query = executor(conn);
  const normalizados = Array.isArray(ids)
    ? ids.map(toPositiveInt).filter(Boolean)
    : [];

  if (
    !normalizados.length ||
    new Set(normalizados).size !== normalizados.length
  ) {
    throw new PreTesteError("A ordem informada é inválida.", {
      code: "PRE_TESTE_ORDEM_INVALIDA",
    });
  }

  const atuais = await query(
    `SELECT id FROM ${tabela} WHERE ${colunaPai} = $1 ORDER BY ordem, id`,
    [paiId],
  );
  const atuaisIds = atuais.rows.map((item) => Number(item.id));

  if (
    atuaisIds.length !== normalizados.length ||
    atuaisIds.some((id) => !normalizados.includes(id))
  ) {
    throw new PreTesteError(
      "A ordenação deve conter exatamente todos os itens atuais.",
      { code: "PRE_TESTE_ORDEM_INCOMPLETA" },
    );
  }

  await query(
    `UPDATE ${tabela} SET ordem = ordem + 100000 WHERE ${colunaPai} = $1`,
    [paiId],
  );

  for (let index = 0; index < normalizados.length; index += 1) {
    await query(
      `UPDATE ${tabela} SET ordem = $1, atualizado_em = NOW() WHERE id = $2`,
      [index + 1, normalizados[index]],
    );
  }
}

async function adicionarPergunta(versaoId, payload = {}) {
  const tipo = normalizeTipo(payload.tipo);
  const modoResposta = normalizeModoRespostaPayload(payload, tipo);
  const enunciado = normalizeText(payload.enunciado, 5000);

  if (!tipo || !enunciado) {
    throw new PreTesteError("Tipo e enunciado da pergunta são obrigatórios.");
  }

  return db.tx(async (tx) => {
    await obterRascunhoGerenciavel(tx, versaoId);
    const ordemResult = await tx.query(
      `
      SELECT COALESCE(MAX(ordem), 0) + 1 AS proxima
      FROM pre_teste_perguntas
      WHERE versao_id = $1
      `,
      [versaoId],
    );
    const result = await tx.query(
      `
      INSERT INTO pre_teste_perguntas
        (versao_id, tipo, modo_resposta, enunciado, ordem)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
      `,
      [
        versaoId,
        tipo,
        modoResposta,
        enunciado,
        Number(ordemResult.rows[0].proxima),
      ],
    );
    return carregarVersaoCompleta(tx, versaoId).then((versao) =>
      versao.perguntas.find(
        (pergunta) => pergunta.id === Number(result.rows[0].id),
      ),
    );
  });
}

async function atualizarPergunta(versaoId, perguntaId, payload = {}) {
  const tipo = normalizeTipo(payload.tipo);
  const modoResposta = normalizeModoRespostaPayload(payload, tipo);
  const enunciado = normalizeText(payload.enunciado, 5000);
  const id = toPositiveInt(perguntaId);

  if (!tipo || !enunciado || !id) {
    throw new PreTesteError("Pergunta inválida.");
  }

  return db.tx(async (tx) => {
    await obterRascunhoGerenciavel(tx, versaoId);
    const atual = await tx.query(
      `
      SELECT tipo, modo_resposta
      FROM pre_teste_perguntas
      WHERE id = $1 AND versao_id = $2
      FOR UPDATE
      `,
      [id, versaoId],
    );

    if (!atual.rowCount) {
      throw new PreTesteError("Pergunta não encontrada.", { status: 404 });
    }

    const result = await tx.query(
      `
      UPDATE pre_teste_perguntas
      SET tipo = $1, modo_resposta = $2, enunciado = $3, atualizado_em = NOW()
      WHERE id = $4 AND versao_id = $5
      RETURNING id
      `,
      [tipo, modoResposta, enunciado, id, versaoId],
    );

    if (!result.rowCount) {
      throw new PreTesteError("Pergunta não encontrada.", { status: 404 });
    }

    if (tipo === TIPOS_PERGUNTA.DISSERTATIVA) {
      await tx.query(
        "DELETE FROM pre_teste_alternativas WHERE pergunta_id = $1",
        [id],
      );
    }

    const versao = await carregarVersaoCompleta(tx, versaoId);
    return versao.perguntas.find((pergunta) => pergunta.id === id);
  });
}

async function excluirPergunta(versaoId, perguntaId) {
  const id = toPositiveInt(perguntaId);

  return db.tx(async (tx) => {
    await obterRascunhoGerenciavel(tx, versaoId);
    const result = await tx.query(
      "DELETE FROM pre_teste_perguntas WHERE id = $1 AND versao_id = $2 RETURNING id",
      [id || 0, versaoId],
    );

    if (!result.rowCount) {
      throw new PreTesteError("Pergunta não encontrada.", { status: 404 });
    }

    const restantes = await tx.query(
      "SELECT id FROM pre_teste_perguntas WHERE versao_id = $1 ORDER BY ordem, id",
      [versaoId],
    );
    if (restantes.rowCount) {
      await reordenarRegistros(tx, {
        tabela: "pre_teste_perguntas",
        colunaPai: "versao_id",
        paiId: versaoId,
        ids: restantes.rows.map((item) => Number(item.id)),
      });
    }
    return carregarVersaoCompleta(tx, versaoId);
  });
}

async function reordenarPerguntas(versaoId, ids) {
  return db.tx(async (tx) => {
    await obterRascunhoGerenciavel(tx, versaoId);
    await reordenarRegistros(tx, {
      tabela: "pre_teste_perguntas",
      colunaPai: "versao_id",
      paiId: versaoId,
      ids,
    });
    return carregarVersaoCompleta(tx, versaoId);
  });
}

async function obterPerguntaDeRascunho(conn, perguntaId) {
  const query = executor(conn);
  const result = await query(
    `
    SELECT p.id, p.versao_id, p.tipo, p.modo_resposta
    FROM pre_teste_perguntas p
    JOIN pre_teste_versoes v ON v.id = p.versao_id
    WHERE p.id = $1 AND v.status = 'rascunho'
    FOR UPDATE OF v
    `,
    [toPositiveInt(perguntaId) || 0],
  );

  if (!result.rowCount) {
    throw new PreTesteError("Pergunta de rascunho não encontrada.", {
      status: 404,
    });
  }

  return result.rows[0];
}

async function adicionarAlternativa(perguntaId, payload = {}) {
  const texto = normalizeText(payload.texto, 2000);

  if (!texto) {
    throw new PreTesteError("O texto da alternativa é obrigatório.");
  }

  return db.tx(async (tx) => {
    const pergunta = await obterPerguntaDeRascunho(tx, perguntaId);

    if (pergunta.tipo !== TIPOS_PERGUNTA.MULTIPLA_ESCOLHA) {
      throw new PreTesteError(
        "Somente perguntas de múltipla escolha possuem alternativas.",
      );
    }

    const ordemResult = await tx.query(
      `
      SELECT COALESCE(MAX(ordem), 0) + 1 AS proxima
      FROM pre_teste_alternativas
      WHERE pergunta_id = $1
      `,
      [perguntaId],
    );
    const result = await tx.query(
      `
      INSERT INTO pre_teste_alternativas (pergunta_id, texto, ordem)
      VALUES ($1, $2, $3)
      RETURNING *
      `,
      [perguntaId, texto, Number(ordemResult.rows[0].proxima)],
    );
    return result.rows[0];
  });
}

async function atualizarAlternativa(alternativaId, payload = {}) {
  const id = toPositiveInt(alternativaId);
  const possuiTexto = Object.prototype.hasOwnProperty.call(payload, "texto");
  const texto = possuiTexto ? normalizeText(payload.texto, 2000) : null;

  if (!id || !possuiTexto || !texto) {
    throw new PreTesteError("Alternativa inválida.");
  }

  return db.tx(async (tx) => {
    const atual = await tx.query(
      `
      SELECT a.id, a.texto, a.pergunta_id
      FROM pre_teste_alternativas a
      JOIN pre_teste_perguntas p ON p.id = a.pergunta_id
      JOIN pre_teste_versoes v ON v.id = p.versao_id
      WHERE a.id = $1 AND v.status = 'rascunho'
      FOR UPDATE OF v
      `,
      [id],
    );

    if (!atual.rowCount) {
      throw new PreTesteError("Alternativa de rascunho não encontrada.", {
        status: 404,
      });
    }

    const result = await tx.query(
      `
      UPDATE pre_teste_alternativas
      SET texto = $1, atualizado_em = NOW()
      WHERE id = $2
      RETURNING *
      `,
      [texto, id],
    );
    return result.rows[0];
  });
}

async function excluirAlternativa(alternativaId) {
  const id = toPositiveInt(alternativaId);

  return db.tx(async (tx) => {
    const atual = await tx.query(
      `
      SELECT a.id, a.pergunta_id
      FROM pre_teste_alternativas a
      JOIN pre_teste_perguntas p ON p.id = a.pergunta_id
      JOIN pre_teste_versoes v ON v.id = p.versao_id
      WHERE a.id = $1 AND v.status = 'rascunho'
      FOR UPDATE OF v
      `,
      [id || 0],
    );

    if (!atual.rowCount) {
      throw new PreTesteError("Alternativa de rascunho não encontrada.", {
        status: 404,
      });
    }

    const perguntaId = Number(atual.rows[0].pergunta_id);
    await tx.query("DELETE FROM pre_teste_alternativas WHERE id = $1", [id]);
    const restantes = await tx.query(
      "SELECT id FROM pre_teste_alternativas WHERE pergunta_id = $1 ORDER BY ordem, id",
      [perguntaId],
    );
    if (restantes.rowCount) {
      await reordenarRegistros(tx, {
        tabela: "pre_teste_alternativas",
        colunaPai: "pergunta_id",
        paiId: perguntaId,
        ids: restantes.rows.map((item) => Number(item.id)),
      });
    }
    return { removida: true };
  });
}

async function reordenarAlternativas(perguntaId, ids) {
  return db.tx(async (tx) => {
    await obterPerguntaDeRascunho(tx, perguntaId);
    await reordenarRegistros(tx, {
      tabela: "pre_teste_alternativas",
      colunaPai: "pergunta_id",
      paiId: perguntaId,
      ids,
    });
    return { ordenadas: true };
  });
}

function validarVersaoParaPublicacao(versao) {
  const perguntas = versao?.perguntas || [];

  if (!perguntas.length) {
    throw new PreTesteError(
      "Adicione pelo menos uma pergunta antes de publicar.",
      { code: "PRE_TESTE_SEM_PERGUNTAS" },
    );
  }

  perguntas.forEach((pergunta, index) => {
    if (!normalizeText(pergunta.enunciado, 5000)) {
      throw new PreTesteError(`A pergunta ${index + 1} não possui enunciado.`);
    }
    if (Number(pergunta.ordem) !== index + 1) {
      throw new PreTesteError("A ordem das perguntas é inválida.", {
        code: "PRE_TESTE_ORDEM_INVALIDA",
      });
    }
    if (pergunta.tipo === TIPOS_PERGUNTA.MULTIPLA_ESCOLHA) {
      if ((pergunta.alternativas || []).length < 2) {
        throw new PreTesteError(
          `A pergunta ${index + 1} precisa de pelo menos duas alternativas.`,
        );
      }
      pergunta.alternativas.forEach((alternativa, alternativaIndex) => {
        if (
          !normalizeText(alternativa.texto, 2000) ||
          Number(alternativa.ordem) !== alternativaIndex + 1
        ) {
          throw new PreTesteError(
            `A ordem ou o texto das alternativas da pergunta ${index + 1} é inválido.`,
          );
        }
      });
    } else if ((pergunta.alternativas || []).length) {
      throw new PreTesteError(
        `A pergunta ${index + 1} é dissertativa e não pode ter alternativas.`,
      );
    }
  });
}

async function publicarVersao(versaoId) {
  return db.tx(async (tx) => {
    const rascunho = await obterRascunhoGerenciavel(tx, versaoId);
    const versao = await carregarVersaoCompleta(tx, versaoId);
    validarVersaoParaPublicacao(versao);

    await tx.query(
      `
      UPDATE pre_teste_versoes
      SET status = 'publicado', publicado_em = NOW(), atualizado_em = NOW()
      WHERE id = $1
      `,
      [versaoId],
    );
    await tx.query(
      `
      UPDATE pre_testes_evento
      SET versao_atual_id = $1, atualizado_em = NOW()
      WHERE id = $2
      `,
      [versaoId, rascunho.pre_teste_id],
    );

    const configuracao = await tx.query(
      "SELECT evento_id FROM pre_testes_evento WHERE id = $1",
      [rascunho.pre_teste_id],
    );
    return obterConfiguracaoAdministrativa(configuracao.rows[0].evento_id, tx);
  });
}

async function prepararParaPublicacaoDoEvento(conn, eventoId, habilitado) {
  const query = executor(conn);
  const id = toPositiveInt(eventoId);

  if (!id || typeof habilitado !== "boolean") {
    throw new PreTesteError(
      "Informe se o evento deve ou não utilizar o pré-teste.",
    );
  }

  const configuracao = await query(
    `
    SELECT pt.id, pt.versao_atual_id, v.status AS status_versao_atual
    FROM pre_testes_evento pt
    LEFT JOIN pre_teste_versoes v ON v.id = pt.versao_atual_id
    WHERE pt.evento_id = $1
    FOR UPDATE OF pt
    `,
    [id],
  );

  if (!habilitado) {
    if (configuracao.rowCount) {
      const preTesteId = Number(configuracao.rows[0].id);
      await query(
        "UPDATE pre_testes_evento SET ativo = FALSE, atualizado_em = NOW() WHERE id = $1",
        [preTesteId],
      );
      await query(
        "DELETE FROM pre_teste_versoes WHERE pre_teste_id = $1 AND status = 'rascunho'",
        [preTesteId],
      );
    }
    return obterConfiguracaoAdministrativa(id, conn);
  }

  if (!configuracao.rowCount) {
    throw new PreTesteError(
      "O pré-teste selecionado ainda não possui uma versão configurada.",
      { status: 409, code: "PRE_TESTE_SEM_CONFIGURACAO" },
    );
  }

  const atual = configuracao.rows[0];
  const rascunhoResult = await query(
    `
    SELECT id
    FROM pre_teste_versoes
    WHERE pre_teste_id = $1 AND status = 'rascunho'
    FOR UPDATE
    `,
    [atual.id],
  );

  if (rascunhoResult.rowCount) {
    const versaoId = Number(rascunhoResult.rows[0].id);
    const versao = await carregarVersaoCompleta(conn, versaoId);
    validarVersaoParaPublicacao(versao);

    await query(
      `
      UPDATE pre_teste_versoes
      SET status = 'publicado', publicado_em = NOW(), atualizado_em = NOW()
      WHERE id = $1
      `,
      [versaoId],
    );
    await query(
      `
      UPDATE pre_testes_evento
      SET versao_atual_id = $1, ativo = TRUE, atualizado_em = NOW()
      WHERE id = $2
      `,
      [versaoId, atual.id],
    );
  } else {
    if (!atual.versao_atual_id || atual.status_versao_atual !== "publicado") {
      throw new PreTesteError(
        "O pré-teste selecionado não possui uma versão válida para publicação.",
        { status: 409, code: "PRE_TESTE_SEM_VERSAO_PUBLICADA" },
      );
    }

    await query(
      "UPDATE pre_testes_evento SET ativo = TRUE, atualizado_em = NOW() WHERE id = $1",
      [atual.id],
    );
  }

  return obterConfiguracaoAdministrativa(id, conn);
}

async function definirAtivo(
  eventoId,
  ativo,
  { descartarRascunho = false } = {},
) {
  const id = toPositiveInt(eventoId);

  if (!id || typeof ativo !== "boolean") {
    throw new PreTesteError("Evento e estado de ativação são obrigatórios.");
  }

  return db.tx(async (tx) => {
    const configuracao = await tx.query(
      `
      SELECT pt.id, pt.versao_atual_id, v.status
      FROM pre_testes_evento pt
      LEFT JOIN pre_teste_versoes v ON v.id = pt.versao_atual_id
      WHERE pt.evento_id = $1
      FOR UPDATE OF pt
      `,
      [id],
    );

    if (!configuracao.rowCount) {
      if (ativo) {
        throw new PreTesteError(
          "Publique uma versão válida antes de ativar o pré-teste.",
          { status: 409, code: "PRE_TESTE_SEM_VERSAO_PUBLICADA" },
        );
      }
      return obterConfiguracaoAdministrativa(id, tx);
    }

    const atual = configuracao.rows[0];
    if (ativo && (!atual.versao_atual_id || atual.status !== "publicado")) {
      throw new PreTesteError(
        "Publique uma versão válida antes de ativar o pré-teste.",
        { status: 409, code: "PRE_TESTE_SEM_VERSAO_PUBLICADA" },
      );
    }

    await tx.query(
      "UPDATE pre_testes_evento SET ativo = $1, atualizado_em = NOW() WHERE id = $2",
      [ativo, atual.id],
    );

    if (!ativo && descartarRascunho === true) {
      await tx.query(
        "DELETE FROM pre_teste_versoes WHERE pre_teste_id = $1 AND status = 'rascunho'",
        [atual.id],
      );
    }

    return obterConfiguracaoAdministrativa(id, tx);
  });
}

async function obterPreTesteParaResponder(eventoId, usuarioId, conn = db) {
  const query = executor(conn);
  const eid = toPositiveInt(eventoId);
  const uid = toPositiveInt(usuarioId);

  if (!eid || !uid) {
    throw new PreTesteError("Evento ou usuário inválido.");
  }

  const result = await query(
    `
    SELECT pt.versao_atual_id
    FROM pre_testes_evento pt
    JOIN pre_teste_versoes v
      ON v.id = pt.versao_atual_id
     AND v.pre_teste_id = pt.id
     AND v.status = 'publicado'
    WHERE pt.evento_id = $1 AND pt.ativo = TRUE
    LIMIT 1
    `,
    [eid],
  );

  if (!result.rowCount) {
    return { tem_pre_teste: false };
  }

  const versaoId = Number(result.rows[0].versao_atual_id);
  const concluido = await query(
    `
    SELECT EXISTS(
      SELECT 1
      FROM pre_teste_submissoes
      WHERE evento_id = $1 AND versao_id = $2 AND usuario_id = $3
    ) AS concluido
    `,
    [eid, versaoId, uid],
  );
  const versao = await carregarVersaoCompleta(conn, versaoId);

  return {
    tem_pre_teste: true,
    ja_concluido: concluido.rows[0].concluido === true,
    versao_id: versaoId,
    numero_versao: versao.numero_versao,
    perguntas: versao.perguntas.map((pergunta) => ({
      id: pergunta.id,
      tipo: pergunta.tipo,
      modo_resposta: pergunta.modo_resposta,
      enunciado: pergunta.enunciado,
      ordem: pergunta.ordem,
      alternativas: pergunta.alternativas.map((alternativa) => ({
        id: alternativa.id,
        texto: alternativa.texto,
        ordem: alternativa.ordem,
      })),
    })),
  };
}

function validarRespostasPreTeste(perguntas, payload) {
  const versaoId = toPositiveInt(payload?.versao_id);
  const respostas = Array.isArray(payload?.respostas)
    ? payload.respostas
    : null;

  if (!versaoId || !respostas) {
    throw new PreTesteError(
      "Responda ao pré-teste antes de concluir a inscrição.",
      { status: 422, code: "PRE_TESTE_OBRIGATORIO" },
    );
  }

  if (respostas.length !== perguntas.length) {
    throw new PreTesteError("Responda todas as perguntas do pré-teste.", {
      status: 422,
      code: "PRE_TESTE_RESPOSTAS_INCOMPLETAS",
    });
  }

  const respostasPorPergunta = new Map();
  for (const resposta of respostas) {
    const perguntaId = toPositiveInt(resposta?.pergunta_id);
    if (!perguntaId || respostasPorPergunta.has(perguntaId)) {
      throw new PreTesteError("As respostas do pré-teste são inválidas.", {
        status: 422,
        code: "PRE_TESTE_RESPOSTAS_INVALIDAS",
      });
    }
    respostasPorPergunta.set(perguntaId, resposta);
  }

  return perguntas.map((pergunta) => {
    const resposta = respostasPorPergunta.get(Number(pergunta.id));
    if (!resposta) {
      throw new PreTesteError("Responda todas as perguntas do pré-teste.", {
        status: 422,
        code: "PRE_TESTE_RESPOSTAS_INCOMPLETAS",
      });
    }

    if (pergunta.tipo === TIPOS_PERGUNTA.MULTIPLA_ESCOLHA) {
      const modoResposta = normalizeModoResposta(
        pergunta.modo_resposta,
        pergunta.tipo,
      );
      if (modoResposta === MODOS_RESPOSTA.MULTIPLAS) {
        const alternativasIds = normalizarIdsSelecionados(
          resposta.alternativas_ids,
        );
        const idsValidos = new Set(
          (pergunta.alternativas || []).map((alternativa) =>
            Number(alternativa.id),
          ),
        );
        if (
          !alternativasIds?.length ||
          alternativasIds.some(
            (alternativaId) => !idsValidos.has(alternativaId),
          ) ||
          toPositiveInt(resposta.alternativa_id) ||
          normalizeText(resposta.resposta_texto)
        ) {
          throw new PreTesteError(
            "Selecione uma ou mais alternativas válidas em cada pergunta de respostas múltiplas.",
            { status: 422, code: "PRE_TESTE_ALTERNATIVAS_INVALIDAS" },
          );
        }
        return {
          pergunta_id: Number(pergunta.id),
          alternativa_id: null,
          alternativas_ids: alternativasIds,
          resposta_texto: null,
        };
      }

      const alternativaId = toPositiveInt(resposta.alternativa_id);
      const alternativaValida = (pergunta.alternativas || []).some(
        (alternativa) => Number(alternativa.id) === alternativaId,
      );
      if (
        !alternativaValida ||
        Array.isArray(resposta.alternativas_ids) ||
        normalizeText(resposta.resposta_texto)
      ) {
        throw new PreTesteError(
          "Selecione uma alternativa válida em cada pergunta objetiva.",
          { status: 422, code: "PRE_TESTE_ALTERNATIVA_INVALIDA" },
        );
      }
      return {
        pergunta_id: Number(pergunta.id),
        alternativa_id: alternativaId,
        alternativas_ids: null,
        resposta_texto: null,
      };
    }

    const texto = normalizeText(resposta.resposta_texto, 10000);
    if (
      !texto ||
      toPositiveInt(resposta.alternativa_id) ||
      Array.isArray(resposta.alternativas_ids)
    ) {
      throw new PreTesteError(
        "Preencha uma resposta válida em cada pergunta dissertativa.",
        { status: 422, code: "PRE_TESTE_RESPOSTA_TEXTO_INVALIDA" },
      );
    }
    return {
      pergunta_id: Number(pergunta.id),
      alternativa_id: null,
      alternativas_ids: null,
      resposta_texto: texto,
    };
  });
}

async function processarPreTesteInscricao({
  q,
  eventoId,
  usuarioId,
  preTeste,
}) {
  const query = executor(q);
  const eid = toPositiveInt(eventoId);
  const uid = toPositiveInt(usuarioId);

  const configuracao = await query(
    `
    SELECT pt.versao_atual_id
    FROM pre_testes_evento pt
    JOIN pre_teste_versoes v
      ON v.id = pt.versao_atual_id
     AND v.pre_teste_id = pt.id
     AND v.status = 'publicado'
    WHERE pt.evento_id = $1 AND pt.ativo = TRUE
    FOR SHARE OF pt, v
    `,
    [eid],
  );

  if (!configuracao.rowCount) {
    return { exigido: false, ja_concluido: false, submissao_id: null };
  }

  const versaoId = Number(configuracao.rows[0].versao_atual_id);
  const existente = await query(
    `
    SELECT id
    FROM pre_teste_submissoes
    WHERE evento_id = $1 AND versao_id = $2 AND usuario_id = $3
    LIMIT 1
    `,
    [eid, versaoId, uid],
  );

  if (existente.rowCount) {
    return {
      exigido: true,
      ja_concluido: true,
      submissao_id: Number(existente.rows[0].id),
    };
  }

  if (toPositiveInt(preTeste?.versao_id) !== versaoId) {
    throw new PreTesteError(
      preTeste
        ? "O pré-teste foi atualizado. Recarregue as perguntas e tente novamente."
        : "Responda ao pré-teste antes de concluir a inscrição.",
      {
        status: 422,
        code: preTeste ? "PRE_TESTE_VERSAO_INCORRETA" : "PRE_TESTE_OBRIGATORIO",
      },
    );
  }

  const versao = await carregarVersaoCompleta({ query }, versaoId);
  const respostas = validarRespostasPreTeste(versao.perguntas, preTeste);

  const submissaoResult = await query(
    `
    INSERT INTO pre_teste_submissoes (evento_id, versao_id, usuario_id)
    VALUES ($1, $2, $3)
    ON CONFLICT (usuario_id, evento_id, versao_id) DO NOTHING
    RETURNING id
    `,
    [eid, versaoId, uid],
  );

  if (!submissaoResult.rowCount) {
    const concorrente = await query(
      `
      SELECT id
      FROM pre_teste_submissoes
      WHERE evento_id = $1 AND versao_id = $2 AND usuario_id = $3
      `,
      [eid, versaoId, uid],
    );
    return {
      exigido: true,
      ja_concluido: true,
      submissao_id: Number(concorrente.rows[0].id),
    };
  }

  const submissaoId = Number(submissaoResult.rows[0].id);
  for (const resposta of respostas) {
    await query(
      `
      INSERT INTO pre_teste_respostas
        (submissao_id, pergunta_id, alternativa_id, alternativas_ids, resposta_texto)
      VALUES ($1, $2, $3, $4, $5)
      `,
      [
        submissaoId,
        resposta.pergunta_id,
        resposta.alternativa_id,
        resposta.alternativas_ids,
        resposta.resposta_texto,
      ],
    );
  }

  return {
    exigido: true,
    ja_concluido: false,
    submissao_id: submissaoId,
  };
}

module.exports = {
  TIPOS_PERGUNTA,
  MODOS_RESPOSTA,
  PreTesteError,
  normalizeModoRespostaPayload,
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
  prepararParaPublicacaoDoEvento,
  definirAtivo,
  obterPreTesteParaResponder,
  validarVersaoParaPublicacao,
  validarRespostasPreTeste,
  processarPreTesteInscricao,
  carregarVersaoCompleta,
};
