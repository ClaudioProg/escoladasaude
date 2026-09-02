"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");

const controllerPath = path.resolve(
  __dirname,
  "../src/controllers/eventoAdminController.js",
);
const routePath = path.resolve(__dirname, "../src/routes/eventoRoute.js");

function trecho(source, inicio, fim) {
  const from = source.indexOf(inicio);
  const to = source.indexOf(fim, from + inicio.length);
  assert.ok(from >= 0, `Início não encontrado: ${inicio}`);
  assert.ok(to > from, `Fim não encontrado: ${fim}`);
  return source.slice(from, to);
}

function carregarController(dbMock) {
  const originalLoad = Module._load;
  Module._load = function loadControlado(request, parent, isMain) {
    if (
      request === "../db" &&
      parent?.filename?.includes(`${path.sep}src${path.sep}`)
    ) {
      return dbMock;
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

function respostaHttp() {
  const resposta = { status: null, body: null };
  return {
    resposta,
    res: {
      status(code) {
        resposta.status = code;
        return this;
      },
      json(body) {
        resposta.body = body;
        return this;
      },
    },
  };
}

async function atualizarComEstadoInicial(publicado, body) {
  const estado = { titulo: "Evento", publicado };
  const chamadas = [];
  const client = {
    async query(sql, params = []) {
      const normalizado = String(sql).replace(/\s+/g, " ").trim();
      chamadas.push({ sql: normalizado, params });
      if (normalizado === "BEGIN" || normalizado === "COMMIT") {
        return { rowCount: 0, rows: [] };
      }
      if (normalizado === "ROLLBACK") {
        return { rowCount: 0, rows: [] };
      }
      if (
        /SELECT id, termo_ativo, termo_titulo, termo_conteudo_html FROM eventos/i.test(
          normalizado,
        )
      ) {
        return {
          rowCount: 1,
          rows: [
            {
              id: 7,
              termo_ativo: false,
              termo_titulo: null,
              termo_conteudo_html: null,
            },
          ],
        };
      }
      if (/UPDATE eventos SET/i.test(normalizado)) {
        if (/\btitulo\s*=\s*\$2/i.test(normalizado)) {
          estado.titulo = params[1];
        }
        if (/\bpublicado\b/i.test(normalizado)) {
          estado.publicado = !estado.publicado;
        }
        return { rowCount: 1, rows: [] };
      }
      throw new Error(`SQL não esperado: ${normalizado}`);
    },
    release() {},
  };
  const dbMock = {
    getClient: async () => client,
    query: async () => {
      throw new Error("db.query global não esperado");
    },
    tx: async () => {
      throw new Error("db.tx global não esperado");
    },
  };
  const controller = carregarController(dbMock);
  const { res, resposta } = respostaHttp();

  await controller.atualizarEvento(
    {
      params: { id: "7" },
      body,
      user: { id: 1, perfil: "administrador" },
      perfil: "administrador",
    },
    res,
  );

  assert.equal(resposta.status, 200);
  return { estado, chamadas };
}

async function criarComBody(body) {
  const chamadas = [];
  const client = {
    async query(sql, params = []) {
      const normalizado = String(sql).replace(/\s+/g, " ").trim();
      chamadas.push({ sql: normalizado, params });

      if (/INSERT INTO eventos/i.test(normalizado)) {
        assert.match(normalizado, /\bpublicado\b/);
        assert.match(normalizado, /\bFALSE\b/);
        return { rowCount: 1, rows: [{ id: 31, publicado: false }] };
      }
      if (/INSERT INTO turmas/i.test(normalizado)) {
        return { rowCount: 1, rows: [{ id: 41 }] };
      }
      if (/SELECT id, nome, email, perfil FROM usuarios/i.test(normalizado)) {
        const ids = Array.isArray(params[0]) ? params[0] : [];
        return {
          rowCount: ids.length,
          rows: ids.map((id) => ({
            id,
            nome: `Usuário ${id}`,
            email: `usuario${id}@example.test`,
            perfil: "administrador",
          })),
        };
      }

      return { rowCount: 1, rows: [] };
    },
    release() {},
  };
  const controller = carregarController({
    getClient: async () => client,
    query: async () => {
      throw new Error("db.query global não esperado");
    },
    tx: async () => {
      throw new Error("db.tx global não esperado");
    },
  });
  const { res, resposta } = respostaHttp();

  await controller.criarEvento(
    {
      body,
      user: { id: 1, perfil: "administrador" },
      perfil: "administrador",
    },
    res,
  );

  return { chamadas, resposta };
}

function dadosMinimos(overrides = {}) {
  return {
    titulo: "Evento",
    local: "Auditório",
    tipo: "Curso",
    unidade_id: 3,
    ...overrides,
  };
}

test("criação legada como rascunho tolera ausência de turma e nasce despublicada", async () => {
  const { chamadas, resposta } = await criarComBody(
    dadosMinimos({ salvar_como_rascunho: true, publicado: true }),
  );

  assert.equal(resposta.status, 201);
  assert.equal(resposta.body.data.publicado, false);
  assert.equal(
    chamadas.filter((chamada) => /INSERT INTO turmas/i.test(chamada.sql))
      .length,
    0,
  );
});

test("criação normal com turma válida ignora publicado=true e nasce despublicada", async () => {
  const { resposta } = await criarComBody(
    dadosMinimos({
      publicado: true,
      turmas: [
        {
          nome: "Turma A",
          vagas_total: 20,
          carga_horaria: 4,
          datas: [
            {
              data: "2026-09-10",
              horario_inicio: "08:00",
              horario_fim: "12:00",
            },
          ],
          organizadores: [1],
          palestrantes: [],
          assinantes: [2474],
        },
      ],
    }),
  );

  assert.equal(resposta.status, 201);
  assert.equal(resposta.body.data.publicado, false);
});

test("criação normal sem turma continua rejeitada", async () => {
  const { resposta } = await criarComBody(dadosMinimos());
  assert.equal(resposta.status, 400);
  assert.match(resposta.body.message, /ao menos uma turma/i);
});

test("update comum preserva publicado=true e ignora campos indevidos de publicação", async () => {
  const { estado, chamadas } = await atualizarComEstadoInicial(true, {
    titulo: "Evento editado",
    publicado: false,
    salvar_como_rascunho: true,
  });

  assert.equal(estado.titulo, "Evento editado");
  assert.equal(estado.publicado, true);
  assert.ok(
    chamadas
      .filter((chamada) => /UPDATE eventos SET/i.test(chamada.sql))
      .every((chamada) => !/\bpublicado\b/i.test(chamada.sql)),
  );
});

test("update comum preserva publicado=false", async () => {
  const { estado } = await atualizarComEstadoInicial(false, {
    titulo: "Evento despublicado editado",
    publicado: true,
  });

  assert.equal(estado.titulo, "Evento despublicado editado");
  assert.equal(estado.publicado, false);
});

test("payload contendo somente publicação não produz UPDATE no endpoint comum", async () => {
  const { estado, chamadas } = await atualizarComEstadoInicial(true, {
    publicado: false,
    salvar_como_rascunho: true,
  });

  assert.equal(estado.publicado, true);
  assert.equal(
    chamadas.filter((chamada) => /UPDATE eventos SET/i.test(chamada.sql))
      .length,
    0,
  );
});

test("rotas específicas e administrativas alteram somente publicação", () => {
  const controller = fs.readFileSync(controllerPath, "utf8");
  const routes = fs.readFileSync(routePath, "utf8");
  const update = trecho(
    controller,
    "async function atualizarEvento",
    "async function validarEventoParaPublicacao",
  );
  const publish = trecho(
    controller,
    "async function publicarEvento",
    "async function despublicarEvento",
  );
  const unpublish = trecho(
    controller,
    "async function despublicarEvento",
    "async function excluirEvento",
  );

  assert.doesNotMatch(update, /\bpublicado\b|salvar_como_rascunho/);
  assert.match(publish, /SET publicado = TRUE/);
  assert.match(unpublish, /SET publicado = FALSE/);
  assert.doesNotMatch(unpublish, /\bDELETE\b/);
  assert.match(
    routes,
    /"\/:id\/publicar",[\s\S]*?authMiddleware,[\s\S]*?requireAdmin/,
  );
  assert.match(
    routes,
    /"\/:id\/despublicar",[\s\S]*?authMiddleware,[\s\S]*?requireAdmin/,
  );
});
