"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");

const { authorize } = require("../src/middlewares/authorize");
const {
  obterContextoResultados,
  obterResultados,
  listarRespostasDissertativas,
  listarParticipantes,
  obterParticipante,
  obterDadosRelatorio,
  montarPerguntas,
} = require("../src/services/preTesteResultadosService");
const {
  formatarNomeArquivoRelatorio,
  gerarPdfResultadosPreTeste,
} = require("../src/utils/preTesteResultadosPdf");

function resultado(rows = []) {
  return { rowCount: rows.length, rows };
}

const eventoRows = [{ id: 7, titulo: "Formação em Saúde Pública" }];
const versaoRows = [
  {
    pre_teste_id: 3,
    ativo: true,
    versao_atual_id: 22,
    versao_id: 22,
    numero_versao: 2,
    status: "publicado",
    publicado_em: "2026-08-20T12:00:00.000Z",
    total_submissoes: 1,
    respondentes_unicos: 1,
    primeira_resposta: "2026-08-20T13:00:00.000Z",
    ultima_resposta: "2026-08-20T13:00:00.000Z",
  },
  {
    pre_teste_id: 3,
    ativo: true,
    versao_atual_id: 22,
    versao_id: 21,
    numero_versao: 1,
    status: "publicado",
    publicado_em: "2026-08-19T12:00:00.000Z",
    total_submissoes: 2,
    respondentes_unicos: 2,
    primeira_resposta: "2026-08-19T13:00:00.000Z",
    ultima_resposta: "2026-08-19T14:00:00.000Z",
  },
];

const perguntasRows = [
  {
    pergunta_id: 101,
    tipo: "multipla_escolha",
    enunciado: "Qual alternativa representa seu conhecimento atual?",
    pergunta_ordem: 1,
    alternativa_id: 1001,
    alternativa_texto: "Conhecimento inicial",
    alternativa_ordem: 1,
    quantidade: 1,
  },
  {
    pergunta_id: 101,
    tipo: "multipla_escolha",
    enunciado: "Qual alternativa representa seu conhecimento atual?",
    pergunta_ordem: 1,
    alternativa_id: 1002,
    alternativa_texto: "Conhecimento avançado",
    alternativa_ordem: 2,
    quantidade: 3,
  },
  {
    pergunta_id: 102,
    tipo: "dissertativa",
    enunciado: "O que você espera aprender?",
    pergunta_ordem: 2,
    alternativa_id: null,
    alternativa_texto: null,
    alternativa_ordem: null,
    quantidade: 4,
  },
];

const previewRows = [
  {
    pergunta_id: 102,
    submissao_id: 500,
    participante: "Ana Ávila",
    enviado_em: "2026-08-20T13:00:00.000Z",
    resposta_texto: "Quero ampliar minha atuação na atenção básica.",
  },
];

function criarQuery(overrides = {}) {
  const chamadas = [];
  const defaults = {
    contexto_evento: resultado(eventoRows),
    contexto_versoes: resultado(versaoRows),
    perguntas_agregadas: resultado(perguntasRows),
    dissertativas_preview: resultado(previewRows),
    validar_pergunta_dissertativa: resultado([
      { id: 102, enunciado: "O que você espera aprender?", ordem: 2 },
    ]),
    respostas_dissertativas: resultado([
      {
        submissao_id: 501,
        participante: "Bruno Santos",
        enviado_em: "2026-08-20T13:10:00.000Z",
        resposta_texto: "Uma resposta adicional.",
        total: 11,
      },
    ]),
    participantes: resultado([
      {
        submissao_id: 500,
        usuario_id: 90,
        nome: "Ana Ávila",
        enviado_em: "2026-08-20T13:00:00.000Z",
        total: 1,
      },
    ]),
    participante_detalhe: resultado([
      {
        submissao_id: 500,
        usuario_id: 90,
        participante: "Ana Ávila",
        enviado_em: "2026-08-20T13:00:00.000Z",
        pergunta_id: 101,
        pergunta_ordem: 1,
        tipo: "multipla_escolha",
        enunciado: "Pergunta objetiva",
        resposta_texto: null,
        alternativa_texto: "Conhecimento inicial",
      },
      {
        submissao_id: 500,
        usuario_id: 90,
        participante: "Ana Ávila",
        enviado_em: "2026-08-20T13:00:00.000Z",
        pergunta_id: 102,
        pergunta_ordem: 2,
        tipo: "dissertativa",
        enunciado: "Pergunta aberta",
        resposta_texto: "Minha resposta",
        alternativa_texto: null,
      },
    ]),
    relatorio_consolidado_dissertativas: resultado(previewRows),
    relatorio_detalhado: resultado([]),
  };

  async function query(sql, params = []) {
    const match = String(sql).match(/pre_teste_resultados:([a-z_]+)/);
    const tag = match?.[1];
    chamadas.push({ tag, sql: String(sql), params });

    if (!tag) {
      throw new Error(`Consulta sem marcador de teste: ${sql}`);
    }

    const configured = Object.prototype.hasOwnProperty.call(overrides, tag)
      ? overrides[tag]
      : defaults[tag];
    const value =
      typeof configured === "function"
        ? await configured({ sql: String(sql), params, chamadas })
        : configured;

    if (!value) {
      throw new Error(`Consulta não simulada: ${tag}`);
    }

    return value;
  }

  query.chamadas = chamadas;
  return query;
}

function executarAuthorize(perfil) {
  let nextCalled = false;
  const payload = {};
  const req = {
    user: { id: 1, perfil },
    perfil,
    method: "GET",
    originalUrl: "/api/pre-teste/evento/7/resultados",
  };
  const res = {
    status(code) {
      payload.status = code;
      return this;
    },
    json(body) {
      payload.body = body;
      return this;
    },
  };

  authorize("administrador")(req, res, () => {
    nextCalled = true;
  });

  return { nextCalled, payload };
}

test("administrador pode acessar a consulta protegida", () => {
  const result = executarAuthorize("administrador");
  assert.equal(result.nextCalled, true);
  assert.equal(result.payload.status, undefined);
});

test("usuário comum recebe 403 na consulta protegida", () => {
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const result = executarAuthorize("usuario");
    assert.equal(result.nextCalled, false);
    assert.equal(result.payload.status, 403);
    assert.equal(result.payload.body.code, "AUTH-403-FORBIDDEN");
  } finally {
    console.warn = originalWarn;
  }
});

test("todas as cinco rotas administrativas de resultados exigem administrador", () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, "../src/routes/preTesteRoute.js"),
    "utf8",
  );
  const blocks = source.match(
    /router\.get\([\s\S]*?\/resultados[\s\S]*?authorize\("administrador"\)[\s\S]*?\);/g,
  );
  assert.equal(blocks?.length, 5);
});

test("evento inexistente é rejeitado antes de consultar versões", async () => {
  const query = criarQuery({ contexto_evento: resultado([]) });
  await assert.rejects(
    obterContextoResultados(999, null, query),
    (error) => error.code === "EVENTO_NAO_ENCONTRADO" && error.status === 404,
  );
  assert.equal(query.chamadas.length, 1);
});

test("versão que não pertence ao evento é rejeitada", async () => {
  const query = criarQuery();
  await assert.rejects(
    obterContextoResultados(7, 999, query),
    (error) => error.code === "PRE_TESTE_VERSAO_EVENTO_INCOMPATIVEL",
  );
});

test("evento sem pré-teste retorna estado não configurado e vazio", async () => {
  const query = criarQuery({ contexto_versoes: resultado([]) });
  const data = await obterResultados(7, null, query);
  assert.equal(data.configurado, false);
  assert.equal(data.versao_selecionada, null);
  assert.deepEqual(data.perguntas, []);
  assert.equal(data.resumo.total_submissoes, 0);
});

test("versão publicada sem respostas retorna resumo zerado sem misturar versão", async () => {
  const query = criarQuery({
    contexto_versoes: resultado([
      { ...versaoRows[0], total_submissoes: 0, respondentes_unicos: 0 },
    ]),
    perguntas_agregadas: resultado(
      perguntasRows.map((row) => ({ ...row, quantidade: 0 })),
    ),
    dissertativas_preview: resultado([]),
  });
  const data = await obterResultados(7, 22, query);
  assert.equal(data.resumo.total_submissoes, 0);
  assert.equal(data.resumo.respondentes_unicos, 0);
  assert.ok(data.perguntas.every((item) => item.total_respostas === 0));
});

test("agregação objetiva calcula quantidades e percentuais", () => {
  const [pergunta] = montarPerguntas(perguntasRows, previewRows);
  assert.deepEqual(
    pergunta.alternativas.map(({ quantidade, percentual }) => ({
      quantidade,
      percentual,
    })),
    [
      { quantidade: 1, percentual: 25 },
      { quantidade: 3, percentual: 75 },
    ],
  );
  assert.equal(pergunta.total_respostas, 4);
});

test("percentuais objetivos permanecem zero quando não há resposta", () => {
  const rows = perguntasRows
    .filter((row) => row.pergunta_id === 101)
    .map((row) => ({ ...row, quantidade: 0 }));
  const [pergunta] = montarPerguntas(rows);
  assert.ok(pergunta.alternativas.every((item) => item.percentual === 0));
});

test("respostas dissertativas são vinculadas somente à pergunta correta", () => {
  const perguntas = montarPerguntas(perguntasRows, previewRows);
  const aberta = perguntas.find((item) => item.id === 102);
  const objetiva = perguntas.find((item) => item.id === 101);
  assert.equal(aberta.respostas[0].resposta, previewRows[0].resposta_texto);
  assert.deepEqual(objetiva.respostas, []);
});

test("consulta de uma versão usa evento e versão em todas as agregações", async () => {
  const query = criarQuery();
  await obterResultados(7, 21, query);
  for (const tag of ["perguntas_agregadas", "dissertativas_preview"]) {
    const chamada = query.chamadas.find((item) => item.tag === tag);
    assert.deepEqual(chamada.params.slice(0, 2), [7, 21]);
  }
});

test("contagem não depende de inscrições ou turmas e não duplica reutilização", async () => {
  const query = criarQuery({
    contexto_versoes: resultado([
      { ...versaoRows[0], total_submissoes: 1, respondentes_unicos: 1 },
    ]),
  });
  const data = await obterResultados(7, 22, query);
  assert.equal(data.resumo.respondentes_unicos, 1);
  assert.equal(data.resumo.total_submissoes, 1);
  assert.ok(
    query.chamadas.every(({ sql }) => !/\b(inscricoes|turmas)\b/i.test(sql)),
  );
});

test("paginação dissertativa valida pergunta e usa versão selecionada", async () => {
  const query = criarQuery();
  const data = await listarRespostasDissertativas(
    7,
    22,
    102,
    { pagina: 2, limite: 10 },
    query,
  );
  assert.equal(data.paginacao.pagina, 2);
  assert.equal(data.paginacao.total, 11);
  const chamada = query.chamadas.find(
    (item) => item.tag === "respostas_dissertativas",
  );
  assert.deepEqual(chamada.params, [7, 22, 102, 10, 10]);
});

test("pergunta de outra versão não pode carregar respostas", async () => {
  const query = criarQuery({ validar_pergunta_dissertativa: resultado([]) });
  await assert.rejects(
    listarRespostasDissertativas(7, 22, 999, {}, query),
    (error) => error.code === "PRE_TESTE_PERGUNTA_NAO_ENCONTRADA",
  );
});

test("lista de participantes pesquisa por nome, pagina e não expõe CPF", async () => {
  const query = criarQuery();
  const data = await listarParticipantes(
    7,
    22,
    { busca: "Ana", pagina: 1, limite: 20 },
    query,
  );
  assert.equal(data.participantes[0].nome, "Ana Ávila");
  assert.equal("cpf" in data.participantes[0], false);
  const chamada = query.chamadas.find((item) => item.tag === "participantes");
  assert.deepEqual(chamada.params, [7, 22, "Ana", 20, 0]);
  assert.doesNotMatch(chamada.sql, /\bcpf\b/i);
});

test("detalhe do participante usa uma submissão compatível com evento e versão", async () => {
  const query = criarQuery();
  const data = await obterParticipante(7, 22, 500, query);
  assert.equal(data.submissao_id, 500);
  assert.equal(data.respostas.length, 2);
  assert.equal(data.respostas[0].resposta, "Conhecimento inicial");
  const chamada = query.chamadas.find(
    (item) => item.tag === "participante_detalhe",
  );
  assert.deepEqual(chamada.params, [500, 7, 22]);
});

test("submissão de outro evento ou versão não é retornada", async () => {
  const query = criarQuery({ participante_detalhe: resultado([]) });
  await assert.rejects(
    obterParticipante(7, 22, 800, query),
    (error) => error.code === "PRE_TESTE_SUBMISSAO_NAO_ENCONTRADA",
  );
});

test("relatório consolidado carrega todas as respostas dissertativas", async () => {
  const query = criarQuery({
    contexto_versoes: resultado([
      { ...versaoRows[0], total_submissoes: 4, respondentes_unicos: 4 },
    ]),
    relatorio_consolidado_dissertativas: resultado([
      ...previewRows,
      {
        ...previewRows[0],
        submissao_id: 501,
        participante: "Bruno Santos",
        resposta_texto: "Outra resposta integral.",
      },
    ]),
  });
  const data = await obterDadosRelatorio(7, 22, "consolidado", query);
  const aberta = data.perguntas.find((item) => item.id === 102);
  assert.equal(aberta.respostas.length, 2);
  assert.equal(data.tipo, "consolidado");
});

test("relatório detalhado agrupa respostas por submissão", async () => {
  const queryComDetalhes = criarQuery({
    relatorio_detalhado: resultado([
      {
        submissao_id: 500,
        usuario_id: 90,
        participante: "Ana Ávila",
        enviado_em: "2026-08-20T13:00:00.000Z",
        pergunta_id: 101,
        pergunta_ordem: 1,
        tipo: "multipla_escolha",
        enunciado: "Pergunta objetiva",
        resposta_texto: null,
        alternativa_texto: "Conhecimento inicial",
      },
      {
        submissao_id: 500,
        usuario_id: 90,
        participante: "Ana Ávila",
        enviado_em: "2026-08-20T13:00:00.000Z",
        pergunta_id: 102,
        pergunta_ordem: 2,
        tipo: "dissertativa",
        enunciado: "Pergunta aberta",
        resposta_texto: "Resposta completa",
        alternativa_texto: null,
      },
    ]),
  });
  const data = await obterDadosRelatorio(7, 22, "detalhado", queryComDetalhes);
  assert.equal(data.participantes.length, 1);
  assert.equal(data.participantes[0].respostas.length, 2);
});

function dadosPdf({ detalhado = false, respostasLongas = 1 } = {}) {
  const textoLongo =
    "Atenção básica, saúde coletiva e educação permanente. ".repeat(45);
  const base = {
    evento: { id: 7, titulo: "Formação em Saúde Pública – ação avançada" },
    versao_selecionada: {
      id: 22,
      numero_versao: 2,
      publicado_em: "2026-08-20T12:00:00.000Z",
    },
    resumo: {
      numero_perguntas: 2,
      total_submissoes: 4,
      respondentes_unicos: 4,
      primeira_resposta: "2026-08-20T13:00:00.000Z",
      ultima_resposta: "2026-08-20T14:00:00.000Z",
    },
    perguntas: montarPerguntas(
      perguntasRows,
      Array.from({ length: respostasLongas }, (_, index) => ({
        pergunta_id: 102,
        submissao_id: 500 + index,
        participante: `Participante ${index + 1}`,
        enviado_em: "2026-08-20T13:00:00.000Z",
        resposta_texto: textoLongo,
      })),
    ),
    participantes: [],
  };

  if (detalhado) {
    base.participantes = Array.from({ length: 5 }, (_, index) => ({
      submissao_id: 500 + index,
      nome: `Participante ${index + 1} – João da Saúde`,
      enviado_em: "2026-08-20T13:00:00.000Z",
      respostas: [
        {
          pergunta_id: 101,
          ordem: 1,
          tipo: "multipla_escolha",
          enunciado: "Pergunta objetiva",
          resposta: "Conhecimento inicial",
        },
        {
          pergunta_id: 102,
          ordem: 2,
          tipo: "dissertativa",
          enunciado: "Pergunta aberta",
          resposta: textoLongo,
        },
      ],
    }));
  }

  return base;
}

function contarPaginasPdf(pdf) {
  return (pdf.toString("latin1").match(/\/Type \/Page\b/g) || []).length;
}

test("rodapé não cria páginas adicionais em relatório de uma página", async () => {
  const dados = dadosPdf();
  dados.resumo.numero_perguntas = 1;
  dados.perguntas = montarPerguntas(
    perguntasRows.filter((row) => row.pergunta_id === 101),
  );

  const pdf = await gerarPdfResultadosPreTeste({
    tipo: "consolidado",
    dados,
  });

  assert.equal(contarPaginasPdf(pdf), 1);
});

test("PDF consolidado é válido, não vazio e suporta acentos e texto longo", async () => {
  const pdf = await gerarPdfResultadosPreTeste({
    tipo: "consolidado",
    dados: dadosPdf({ respostasLongas: 4 }),
  });
  assert.equal(pdf.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.ok(pdf.length > 5000);
});

test("PDF detalhado multipágina é válido e não vazio", async () => {
  const pdf = await gerarPdfResultadosPreTeste({
    tipo: "detalhado",
    dados: dadosPdf({ detalhado: true }),
  });
  assert.equal(pdf.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.ok(pdf.length > 7000);
});

test("nome do arquivo PDF identifica evento, versão e tipo", () => {
  assert.equal(
    formatarNomeArquivoRelatorio({
      eventoId: 7,
      numeroVersao: 2,
      tipo: "detalhado",
    }),
    "pre-teste-evento-7-versao-2-detalhado.pdf",
  );
});

test("controller de PDF responde com headers de download e conteúdo não vazio", async () => {
  const controllerPath = path.resolve(
    __dirname,
    "../src/controllers/preTesteController.js",
  );
  const originalLoad = Module._load;

  Module._load = function loadControlado(request, parent, isMain) {
    if (
      parent?.filename === controllerPath &&
      request === "../services/preTesteResultadosService"
    ) {
      return {
        obterResultados: async () => ({}),
        listarRespostasDissertativas: async () => ({}),
        listarParticipantes: async () => ({}),
        obterParticipante: async () => ({}),
        obterDadosRelatorio: async () => dadosPdf({ respostasLongas: 1 }),
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  let controller;
  try {
    delete require.cache[controllerPath];
    controller = require(controllerPath);
  } finally {
    Module._load = originalLoad;
  }

  const response = { headers: {} };
  const res = {
    setHeader(name, value) {
      response.headers[name] = value;
    },
    status(code) {
      response.status = code;
      return this;
    },
    send(body) {
      response.body = body;
      return this;
    },
    json(body) {
      response.body = body;
      return this;
    },
  };

  await controller.baixarRelatorioResultados(
    {
      params: { evento_id: "7" },
      query: { versao_id: "22", tipo: "consolidado" },
    },
    res,
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers["Content-Type"], "application/pdf");
  assert.match(
    response.headers["Content-Disposition"],
    /pre-teste-evento-7-versao-2/,
  );
  assert.ok(Buffer.isBuffer(response.body));
  assert.equal(response.body.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.ok(response.body.length > 2500);
});
