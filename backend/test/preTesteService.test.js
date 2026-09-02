"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");

function carregarService() {
  const servicePath = path.resolve(
    __dirname,
    "../src/services/preTesteService.js",
  );
  const originalLoad = Module._load;

  Module._load = function loadControlado(request, parent, isMain) {
    if (parent?.filename === servicePath && request === "../db") {
      return {
        query: async () => {
          throw new Error("DB global não deve ser usado nestes testes.");
        },
        tx: async () => {
          throw new Error("Transação global não deve ser usada nestes testes.");
        },
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    delete require.cache[servicePath];
    return require(servicePath);
  } finally {
    Module._load = originalLoad;
  }
}

const {
  MODOS_RESPOSTA,
  PreTesteError,
  normalizeModoRespostaPayload,
  processarPreTesteInscricao,
  validarVersaoParaPublicacao,
  validarRespostasPreTeste,
} = carregarService();

test("modo_resposta aceita somente literais exatos e preserva ausência histórica", () => {
  assert.equal(
    normalizeModoRespostaPayload({}, "multipla_escolha"),
    MODOS_RESPOSTA.UNICA,
  );
  assert.equal(
    normalizeModoRespostaPayload(
      { modo_resposta: MODOS_RESPOSTA.UNICA },
      "multipla_escolha",
    ),
    MODOS_RESPOSTA.UNICA,
  );
  assert.equal(
    normalizeModoRespostaPayload(
      { modo_resposta: MODOS_RESPOSTA.MULTIPLAS },
      "multipla_escolha",
    ),
    MODOS_RESPOSTA.MULTIPLAS,
  );
  for (const invalido of [
    null,
    "",
    " ",
    " RESPOSTA_UNICA ",
    "RESPOSTA_UNICA",
    "Resposta_Unica",
    [],
    {},
    1,
    true,
  ]) {
    assert.throws(
      () =>
        normalizeModoRespostaPayload(
          { modo_resposta: invalido },
          "multipla_escolha",
        ),
      (error) =>
        error instanceof PreTesteError &&
        error.status === 422 &&
        error.code === "PRE_TESTE_MODO_RESPOSTA_INVALIDO",
      `valor deveria ser rejeitado: ${JSON.stringify(invalido)}`,
    );
  }
});

test("dissertativa aceita campo ausente ou null do frontend e rejeita modos objetivos", () => {
  assert.equal(normalizeModoRespostaPayload({}, "dissertativa"), null);
  assert.equal(
    normalizeModoRespostaPayload({ modo_resposta: null }, "dissertativa"),
    null,
  );

  for (const invalido of [
    MODOS_RESPOSTA.UNICA,
    MODOS_RESPOSTA.MULTIPLAS,
    "",
    false,
  ]) {
    assert.throws(
      () =>
        normalizeModoRespostaPayload(
          { modo_resposta: invalido },
          "dissertativa",
        ),
      (error) =>
        error instanceof PreTesteError &&
        error.status === 422 &&
        error.code === "PRE_TESTE_MODO_RESPOSTA_INVALIDO",
    );
  }
});

const perguntas = [
  {
    id: 101,
    tipo: "multipla_escolha",
    modo_resposta: "resposta_unica",
    enunciado: "Pergunta objetiva",
    ordem: 1,
    alternativas: [
      { id: 1001, pergunta_id: 101, texto: "A", ordem: 1 },
      { id: 1002, pergunta_id: 101, texto: "B", ordem: 2 },
    ],
  },
  {
    id: 102,
    tipo: "dissertativa",
    enunciado: "Pergunta aberta",
    ordem: 2,
    alternativas: [],
  },
];

function payloadValido() {
  return {
    versao_id: 10,
    respostas: [
      { pergunta_id: 101, alternativa_id: 1001 },
      { pergunta_id: 102, resposta_texto: "Minha resposta" },
    ],
  };
}

function criarQuery({ ativo = true, jaConcluido = false } = {}) {
  const chamadas = [];

  async function q(sql, params = []) {
    chamadas.push({ sql, params });
    const normalizado = String(sql).replace(/\s+/g, " ").trim();

    if (
      /FROM pre_testes_evento pt JOIN pre_teste_versoes v/i.test(normalizado)
    ) {
      return ativo
        ? { rowCount: 1, rows: [{ versao_atual_id: 10 }] }
        : { rowCount: 0, rows: [] };
    }
    if (/SELECT id FROM pre_teste_submissoes/i.test(normalizado)) {
      return jaConcluido
        ? { rowCount: 1, rows: [{ id: 77 }] }
        : { rowCount: 0, rows: [] };
    }
    if (/FROM pre_teste_versoes v WHERE v.id/i.test(normalizado)) {
      return {
        rowCount: 1,
        rows: [
          {
            id: 10,
            pre_teste_id: 5,
            numero_versao: 1,
            status: "publicado",
          },
        ],
      };
    }
    if (/FROM pre_teste_perguntas WHERE versao_id/i.test(normalizado)) {
      return {
        rowCount: 2,
        rows: perguntas.map(({ alternativas, ...pergunta }) => pergunta),
      };
    }
    if (/FROM pre_teste_alternativas WHERE pergunta_id/i.test(normalizado)) {
      return { rowCount: 2, rows: perguntas[0].alternativas };
    }
    if (/INSERT INTO pre_teste_submissoes/i.test(normalizado)) {
      return { rowCount: 1, rows: [{ id: 500 }] };
    }
    if (/INSERT INTO pre_teste_respostas/i.test(normalizado)) {
      return { rowCount: 1, rows: [] };
    }

    throw new Error(`SQL não esperado no teste: ${normalizado}`);
  }

  q.chamadas = chamadas;
  return q;
}

async function assertPreTesteError(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof PreTesteError);
    assert.equal(error.code, code);
    return true;
  });
}

test("evento sem pré-teste aceita o contrato antigo sem gravar respostas", async () => {
  const q = criarQuery({ ativo: false });
  const result = await processarPreTesteInscricao({
    q,
    eventoId: 1,
    usuarioId: 2,
    preTeste: null,
  });

  assert.deepEqual(result, {
    exigido: false,
    ja_concluido: false,
    submissao_id: null,
  });
  assert.equal(
    q.chamadas.filter((item) => /INSERT INTO/i.test(item.sql)).length,
    0,
  );
});

test("pré-teste ativo rejeita inscrição sem respostas", async () => {
  const q = criarQuery();
  await assertPreTesteError(
    processarPreTesteInscricao({ q, eventoId: 1, usuarioId: 2 }),
    "PRE_TESTE_OBRIGATORIO",
  );
});

test("rejeita versão diferente da versão vigente", async () => {
  const q = criarQuery();
  await assertPreTesteError(
    processarPreTesteInscricao({
      q,
      eventoId: 1,
      usuarioId: 2,
      preTeste: { ...payloadValido(), versao_id: 11 },
    }),
    "PRE_TESTE_VERSAO_INCORRETA",
  );
});

test("rejeita pergunta inexistente ou de outra versão", () => {
  const payload = payloadValido();
  payload.respostas[0].pergunta_id = 999;
  assert.throws(
    () => validarRespostasPreTeste(perguntas, payload),
    (error) => error.code === "PRE_TESTE_RESPOSTAS_INCOMPLETAS",
  );
});

test("rejeita alternativa pertencente a outra pergunta", () => {
  const payload = payloadValido();
  payload.respostas[0].alternativa_id = 9999;
  assert.throws(
    () => validarRespostasPreTeste(perguntas, payload),
    (error) => error.code === "PRE_TESTE_ALTERNATIVA_INVALIDA",
  );
});

test("rejeita resposta dissertativa vazia", () => {
  const payload = payloadValido();
  payload.respostas[1].resposta_texto = "   ";
  assert.throws(
    () => validarRespostasPreTeste(perguntas, payload),
    (error) => error.code === "PRE_TESTE_RESPOSTA_TEXTO_INVALIDA",
  );
});

test("publicação final rejeita pergunta objetiva com menos de duas alternativas", () => {
  assert.throws(
    () =>
      validarVersaoParaPublicacao({
        perguntas: [
          {
            id: 1,
            tipo: "multipla_escolha",
            enunciado: "Pergunta incompleta",
            ordem: 1,
            alternativas: [{ id: 1, texto: "Única", ordem: 1 }],
          },
        ],
      }),
    (error) =>
      error instanceof PreTesteError &&
      /pelo menos duas alternativas/i.test(error.message),
  );
});

test("aceita respostas válidas e grava uma submissão com uma resposta por pergunta", async () => {
  const q = criarQuery();
  const result = await processarPreTesteInscricao({
    q,
    eventoId: 1,
    usuarioId: 2,
    preTeste: payloadValido(),
  });

  assert.equal(result.submissao_id, 500);
  assert.equal(
    q.chamadas.filter((item) =>
      /INSERT INTO pre_teste_submissoes/i.test(item.sql),
    ).length,
    1,
  );
  assert.equal(
    q.chamadas.filter((item) =>
      /INSERT INTO pre_teste_respostas/i.test(item.sql),
    ).length,
    2,
  );
});

test("usuário que já respondeu a versão vigente não envia respostas novamente", async () => {
  const q = criarQuery({ jaConcluido: true });
  const result = await processarPreTesteInscricao({
    q,
    eventoId: 1,
    usuarioId: 2,
    preTeste: null,
  });

  assert.equal(result.ja_concluido, true);
  assert.equal(result.submissao_id, 77);
  assert.equal(
    q.chamadas.filter((item) => /INSERT INTO/i.test(item.sql)).length,
    0,
  );
});

test("integração chama o pré-teste antes do INSERT da inscrição na mesma callback transacional", () => {
  const controllerPath = path.resolve(
    __dirname,
    "../src/controllers/inscricaoController.js",
  );
  const source = fs.readFileSync(controllerPath, "utf8");
  const inicio = source.indexOf("async function inscreverEmTurma");
  const preTeste = source.indexOf("await processarPreTesteInscricao", inicio);
  const inscricao = source.indexOf("INSERT INTO inscricoes", inicio);

  assert.ok(inicio >= 0);
  assert.ok(preTeste > inicio);
  assert.ok(inscricao > preTeste);
});

test("publicação do evento prepara o pré-teste antes de expor o evento e confirma uma única transação", () => {
  const controllerPath = path.resolve(
    __dirname,
    "../src/controllers/eventoAdminController.js",
  );
  const source = fs.readFileSync(controllerPath, "utf8");
  const inicio = source.indexOf("async function publicarEvento");
  const begin = source.indexOf('client.query("BEGIN")', inicio);
  const preparar = source.indexOf("prepararParaPublicacaoDoEvento", inicio);
  const publicarEventoSql = source.indexOf("SET publicado = TRUE", inicio);
  const commit = source.indexOf('client.query("COMMIT")', inicio);

  assert.ok(inicio >= 0);
  assert.ok(begin > inicio);
  assert.ok(preparar > begin);
  assert.ok(publicarEventoSql > preparar);
  assert.ok(commit > publicarEventoSql);
});

test("publicação da versão do pré-teste permanece separada da publicação do evento", () => {
  const editorPath = path.resolve(
    __dirname,
    "../../frontend/src/components/eventos/EditorPreTesteEvento.jsx",
  );
  const wizardPath = path.resolve(
    __dirname,
    "../../frontend/src/pages/GestaoEventos.jsx",
  );
  const dashboardPath = path.resolve(
    __dirname,
    "../../frontend/src/pages/DashboardAdministrador.jsx",
  );
  const editor = fs.readFileSync(editorPath, "utf8");
  const wizard = fs.readFileSync(wizardPath, "utf8");
  const dashboard = fs.readFileSync(dashboardPath, "utf8");

  assert.match(
    editor,
    /EventoService\.preTeste\.admin\.publicar\(rascunho\.id\)/,
  );
  assert.doesNotMatch(wizard, /PUBLICAR EVENTO|salvar_como_rascunho/);
  assert.match(editor, /não alteram o estado publicado ou despublicado/);
  assert.match(
    dashboard,
    /publicado \? onDespublicar\(evento\) : onPublicar\(evento\.id\)/,
  );
});

test("respostas múltiplas validam somente cardinalidade, unicidade e pertencimento", () => {
  const pergunta = {
    id: 201,
    tipo: "multipla_escolha",
    modo_resposta: MODOS_RESPOSTA.MULTIPLAS,
    alternativas: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }],
  };

  for (const ids of [[1], [1, 3], [3, 1], [1, 3, 4]]) {
    const [validada] = validarRespostasPreTeste([pergunta], {
      versao_id: 10,
      respostas: [{ pergunta_id: 201, alternativas_ids: ids }],
    });
    assert.deepEqual(
      validada.alternativas_ids,
      [...ids].sort((a, b) => a - b),
    );
    assert.equal("correta" in validada, false);
  }

  assert.throws(
    () =>
      validarRespostasPreTeste([pergunta], {
        versao_id: 10,
        respostas: [{ pergunta_id: 201, alternativas_ids: [1, 1] }],
      }),
    (error) => error.code === "PRE_TESTE_ALTERNATIVAS_INVALIDAS",
  );
  assert.throws(
    () =>
      validarRespostasPreTeste([pergunta], {
        versao_id: 10,
        respostas: [{ pergunta_id: 201, alternativas_ids: [1, 99] }],
      }),
    (error) => error.code === "PRE_TESTE_ALTERNATIVAS_INVALIDAS",
  );
});

test("resposta única e questão histórica sem modo preservam cardinalidade escalar", () => {
  const historica = {
    id: 301,
    tipo: "multipla_escolha",
    modo_resposta: null,
    alternativas: [{ id: 11 }, { id: 12 }],
  };

  for (const alternativaId of [11, 12]) {
    const [validada] = validarRespostasPreTeste([historica], {
      versao_id: 10,
      respostas: [{ pergunta_id: 301, alternativa_id: alternativaId }],
    });
    assert.equal(validada.alternativa_id, alternativaId);
    assert.equal("correta" in validada, false);
  }

  assert.throws(
    () =>
      validarRespostasPreTeste([historica], {
        versao_id: 10,
        respostas: [{ pergunta_id: 301, alternativas_ids: [11, 12] }],
      }),
    (error) => error.code === "PRE_TESTE_ALTERNATIVA_INVALIDA",
  );
});

test("publicação objetiva exige apenas estrutura válida nos dois modos", () => {
  const base = {
    enunciado: "Pergunta",
    ordem: 1,
    tipo: "multipla_escolha",
    alternativas: [
      { id: 1, texto: "A", ordem: 1 },
      { id: 2, texto: "B", ordem: 2 },
      { id: 3, texto: "C", ordem: 3 },
    ],
  };

  assert.doesNotThrow(() =>
    validarVersaoParaPublicacao({
      perguntas: [{ ...base, modo_resposta: MODOS_RESPOSTA.UNICA }],
    }),
  );
  assert.doesNotThrow(() =>
    validarVersaoParaPublicacao({
      perguntas: [{ ...base, modo_resposta: MODOS_RESPOSTA.MULTIPLAS }],
    }),
  );
});

test("falha posterior à gravação do pré-teste permite rollback do conjunto atômico", async () => {
  const qBase = criarQuery();
  let staged = [];
  let rollback = false;

  const q = async (sql, params) => {
    const result = await qBase(sql, params);
    if (/INSERT INTO pre_teste_/i.test(sql)) staged.push({ sql, params });
    return result;
  };

  try {
    await processarPreTesteInscricao({
      q,
      eventoId: 1,
      usuarioId: 2,
      preTeste: payloadValido(),
    });
    throw new Error("Falha simulada no INSERT de inscricoes");
  } catch {
    rollback = true;
    staged = [];
  }

  assert.equal(rollback, true);
  assert.deepEqual(staged, []);
});

test("rotas administrativas exigem administrador e rota do participante exige autenticação", () => {
  const routePath = path.resolve(__dirname, "../src/routes/preTesteRoute.js");
  const source = fs.readFileSync(routePath, "utf8");
  const controllerPath = path.resolve(
    __dirname,
    "../src/controllers/preTesteController.js",
  );
  const controllerSource = fs.readFileSync(controllerPath, "utf8");

  assert.match(source, /router\.use\(authMiddleware\)/);
  assert.match(source, /authorize\("administrador"\)/);
  assert.match(source, /\/evento\/:evento_id\/responder/);
  assert.match(source, /authorize\(\.\.\.PERFIS_PARTICIPANTE\)/);
  assert.match(controllerSource, /acesso\.evento\.publicado !== true/);
});

test("middleware administrativo libera administrador e rejeita usuário comum", () => {
  const { authorize } = require("../src/middlewares/authorize");
  const middleware = authorize("administrador");
  let adminLiberado = false;
  let usuarioLiberado = false;
  let statusUsuario = null;

  middleware({ user: { id: 1, perfil: "administrador" } }, {}, () => {
    adminLiberado = true;
  });
  middleware(
    { user: { id: 2, perfil: "usuario" } },
    {
      status(status) {
        statusUsuario = status;
        return this;
      },
      json() {
        return this;
      },
    },
    () => {
      usuarioLiberado = true;
    },
  );

  assert.equal(adminLiberado, true);
  assert.equal(usuarioLiberado, false);
  assert.equal(statusUsuario, 403);
});
