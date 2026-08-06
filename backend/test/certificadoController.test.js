"use strict";

const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");

function carregarControllerSemInfraestruturaExterna() {
  const controllerPath = path.resolve(
    __dirname,
    "../src/controllers/certificadoController.js",
  );
  const originalLoad = Module._load;

  Module._load = function loadComDependenciasControladas(
    request,
    parent,
    isMain,
  ) {
    if (parent?.filename === controllerPath && request === "../db") {
      return {
        query: async () => {
          throw new Error("DB fallback não deve ser usado neste teste.");
        },
      };
    }

    if (parent?.filename === controllerPath && request === "../paths") {
      return {
        CERT_DIR: path.resolve(__dirname, ".tmp-certificados"),
        ensureDir: async () => {},
      };
    }

    if (
      parent?.filename === controllerPath &&
      request === "./notificacaoController"
    ) {
      return {};
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    delete require.cache[controllerPath];
    return require(controllerPath);
  } finally {
    Module._load = originalLoad;
  }
}

const { obterAssinantesDaTurma } =
  carregarControllerSemInfraestruturaExterna();

function registro({
  usuarioId,
  ordem,
  nome,
  origem = "turma_certificado_assinante",
  papel = "assinante",
}) {
  return {
    id: usuarioId,
    usuario_id: usuarioId,
    ordem,
    origem,
    papel,
    cargo_fallback: origem === "turma_responsavel" ? "Organizador(a)" : "Assinante",
    nome,
    email: `${usuarioId}@example.test`,
    perfil: origem === "turma_responsavel" ? "organizador" : "usuario",
    imagem_base64: null,
  };
}

function ordenarComoConsulta(rows) {
  return rows.sort((a, b) => {
    const ordemA =
      Number(a.usuario_id) === 2474
        ? 999
        : Number(a.usuario_id) === 17
          ? 998
          : Number(a.ordem);
    const ordemB =
      Number(b.usuario_id) === 2474
        ? 999
        : Number(b.usuario_id) === 17
          ? 998
          : Number(b.ordem);

    return ordemA - ordemB || String(a.nome).localeCompare(String(b.nome));
  });
}

function criarDb({ assinantes = [], organizadores = [] } = {}) {
  const chamadas = [];

  return {
    chamadas,
    async query(sql, params) {
      chamadas.push({ sql, params });

      const incluiOrganizadores = /\bturma_responsavel\b/i.test(sql);
      const excluirUsuarioId = Number(params?.[3] || 0);
      const candidatos = [
        ...assinantes,
        ...(incluiOrganizadores ? organizadores : []),
      ];
      const deduplicados = new Map();

      for (const item of candidatos) {
        const usuarioId = Number(item.usuario_id);

        if (!usuarioId || usuarioId === excluirUsuarioId) {
          continue;
        }

        const atual = deduplicados.get(usuarioId);
        const itemEhExplicito =
          item.origem === "turma_certificado_assinante";
        const atualEhExplicito =
          atual?.origem === "turma_certificado_assinante";

        if (!atual || (itemEhExplicito && !atualEhExplicito)) {
          deduplicados.set(usuarioId, item);
        }
      }

      return {
        rows: ordenarComoConsulta(Array.from(deduplicados.values())),
      };
    },
  };
}

const rafaelaRocha = registro({
  usuarioId: 12,
  ordem: 1,
  nome: "Rafaela Rocha",
});
const rafaellaPitol = registro({
  usuarioId: 17,
  ordem: 2,
  nome: "Rafaella Pitol Corrêa",
});

test("dois assinantes explícitos e seis organizadores retornam somente os dois assinantes", async () => {
  const organizadores = [
    registro({
      usuarioId: 12,
      ordem: 10,
      nome: "Rafaela Rocha",
      origem: "turma_responsavel",
      papel: "organizador",
    }),
    registro({
      usuarioId: 17,
      ordem: 10,
      nome: "Rafaella Pitol Corrêa",
      origem: "turma_responsavel",
      papel: "organizador",
    }),
    ...[30, 31, 32, 33].map((usuarioId) =>
      registro({
        usuarioId,
        ordem: 10,
        nome: `Organizador ${usuarioId}`,
        origem: "turma_responsavel",
        papel: "organizador",
      }),
    ),
  ];
  const db = criarDb({
    assinantes: [rafaelaRocha, rafaellaPitol],
    organizadores,
  });

  const result = await obterAssinantesDaTurma(db, 1);

  assert.deepEqual(
    result.map((item) => item.usuario_id),
    [12, 17],
  );
  assert.doesNotMatch(db.chamadas[0].sql, /\bturma_responsavel\b/i);
  assert.doesNotMatch(db.chamadas[0].sql, /\bUNION\s+ALL\b/i);
});

test("organizador não selecionado como assinante não assina", async () => {
  const db = criarDb({
    assinantes: [rafaellaPitol],
    organizadores: [
      registro({
        usuarioId: 30,
        ordem: 10,
        nome: "Organizador 30",
        origem: "turma_responsavel",
        papel: "organizador",
      }),
    ],
  });

  const result = await obterAssinantesDaTurma(db, 1);

  assert.deepEqual(
    result.map((item) => item.usuario_id),
    [17],
  );
});

test("organizador explicitamente cadastrado como assinante assina normalmente", async () => {
  const organizadorAssinante = registro({
    usuarioId: 30,
    ordem: 1,
    nome: "Organizador Assinante",
  });
  const db = criarDb({
    assinantes: [organizadorAssinante, rafaellaPitol],
    organizadores: [
      registro({
        usuarioId: 30,
        ordem: 10,
        nome: "Organizador Assinante",
        origem: "turma_responsavel",
        papel: "organizador",
      }),
    ],
  });

  const result = await obterAssinantesDaTurma(db, 1);

  assert.deepEqual(
    result.map((item) => item.usuario_id),
    [30, 17],
  );
  assert.equal(result[0].origem, "turma_certificado_assinante");
});

test("preserva a exclusão do titular do certificado", async () => {
  const db = criarDb({
    assinantes: [rafaelaRocha, rafaellaPitol],
  });

  const result = await obterAssinantesDaTurma(db, 1, {
    excluirUsuarioId: 12,
  });

  assert.deepEqual(
    result.map((item) => item.usuario_id),
    [17],
  );
});

test("aceita no máximo três assinantes explícitos e rejeita o quarto", async () => {
  const terceiro = registro({
    usuarioId: 30,
    ordem: 2,
    nome: "Terceiro Assinante",
  });
  const quarto = registro({
    usuarioId: 31,
    ordem: 3,
    nome: "Quarto Assinante",
  });

  const tres = await obterAssinantesDaTurma(
    criarDb({ assinantes: [rafaelaRocha, terceiro, rafaellaPitol] }),
    1,
  );

  assert.equal(tres.length, 3);

  await assert.rejects(
    obterAssinantesDaTurma(
      criarDb({
        assinantes: [rafaelaRocha, terceiro, quarto, rafaellaPitol],
      }),
      1,
    ),
    (error) => {
      assert.equal(error.code, "CERTIFICADO_ASSINANTES_QUANTIDADE_INVALIDA");
      assert.equal(error.details?.total_assinantes, 4);
      return true;
    },
  );
});

test("Rafaella Pitol permanece obrigatória", async () => {
  await assert.rejects(
    obterAssinantesDaTurma(
      criarDb({ assinantes: [rafaelaRocha] }),
      1,
    ),
    (error) => {
      assert.equal(error.code, "CERTIFICADO_ASSINATURA_RAFAELLA_AUSENTE");
      return true;
    },
  );
});

test("Fábio Lopez permanece na última posição quando selecionado", async () => {
  const fabioLopez = registro({
    usuarioId: 2474,
    ordem: 1,
    nome: "Fábio Lopez",
  });
  const db = criarDb({
    assinantes: [fabioLopez, rafaelaRocha, rafaellaPitol],
  });

  const result = await obterAssinantesDaTurma(db, 1);

  assert.deepEqual(
    result.map((item) => item.usuario_id),
    [12, 17, 2474],
  );
});
