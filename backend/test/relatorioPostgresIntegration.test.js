"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { Client } = require("pg");
require("dotenv").config();

const {
  buildTurmasFiltradasWhere,
  normalizarBuscaRelatorio,
} = require("../src/controllers/relatorioController");

const connectionString =
  process.env.RELATORIO_INTEGRATION_DATABASE_URL ||
  process.env.DATABASE_URL ||
  "";
let localSeguro = false;
try {
  const url = new URL(connectionString);
  localSeguro = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
} catch {
  localSeguro = false;
}

function consultaBusca(termo) {
  const busca = normalizarBuscaRelatorio(termo);
  const { params, sqlWhere } = buildTurmasFiltradasWhere({
    busca: busca.termo,
    busca_tipo: busca.tipo,
    busca_cpf: busca.cpf,
  });
  return {
    text: `SELECT DISTINCT e.id FROM turmas t JOIN eventos e ON e.id = t.evento_id ${sqlWhere} ORDER BY e.id`,
    values: params,
  };
}

test(
  "PostgreSQL real filtra título, descrição, nome, CPF e vínculos sem persistir fixtures",
  { skip: !localSeguro },
  async () => {
    const client = new Client({ connectionString });
    await client.connect();

    try {
      await client.query("BEGIN");
      await client.query(`
        CREATE TEMP TABLE eventos (
          id integer PRIMARY KEY,
          titulo text,
          descricao text
        ) ON COMMIT DROP;
        CREATE TEMP TABLE turmas (
          id integer PRIMARY KEY,
          evento_id integer,
          data_inicio date,
          data_fim date
        ) ON COMMIT DROP;
        CREATE TEMP TABLE usuarios (
          id integer PRIMARY KEY,
          nome text,
          cpf text
        ) ON COMMIT DROP;
        CREATE TEMP TABLE inscricoes (usuario_id integer, turma_id integer) ON COMMIT DROP;
        CREATE TEMP TABLE presencas (usuario_id integer, turma_id integer, presente boolean) ON COMMIT DROP;
        CREATE TEMP TABLE certificados (usuario_id integer, evento_id integer, status text) ON COMMIT DROP;
      `);
      await client.query(`
        INSERT INTO eventos VALUES
          (1, 'Saúde LGBT em foco', 'Título corresponde'),
          (2, 'Oficina de acolhimento', 'Descrição sobre população LGBT'),
          (3, 'Evento sem o termo', 'Conteúdo geral'),
          (4, 'Evento certificado', 'Conteúdo geral');
        INSERT INTO turmas VALUES
          (11, 1, '2026-09-01', '2026-09-01'),
          (12, 2, '2026-09-02', '2026-09-02'),
          (13, 3, '2026-09-03', '2026-09-03'),
          (14, 4, '2026-09-04', '2026-09-04');
        INSERT INTO usuarios VALUES
          (21, 'Maria da Silva', '123.456.789-45'),
          (22, 'Maria da Silva', '987.654.321-00'),
          (23, 'João Presente', '111.222.333-44'),
          (24, 'Ana Certificada', '555.666.777-88');
        INSERT INTO inscricoes VALUES (21, 11), (21, 12), (22, 13);
        INSERT INTO presencas VALUES (23, 13, true), (23, 12, false);
        INSERT INTO certificados VALUES (24, 4, 'emitido'), (24, 2, 'cancelado');
      `);

      assert.deepEqual((await client.query(consultaBusca("lGbT"))).rows, [
        { id: 1 },
        { id: 2 },
      ]);
      assert.deepEqual((await client.query(consultaBusca("maria da"))).rows, [
        { id: 1 },
        { id: 2 },
        { id: 3 },
      ]);
      assert.deepEqual(
        (await client.query(consultaBusca("123.456.789-45"))).rows,
        [{ id: 1 }, { id: 2 }],
      );
      assert.deepEqual(
        (await client.query(consultaBusca("12345678945"))).rows,
        [{ id: 1 }, { id: 2 }],
      );
      assert.deepEqual((await client.query(consultaBusca("João Pres"))).rows, [
        { id: 3 },
      ]);
      assert.deepEqual((await client.query(consultaBusca("Ana Cert"))).rows, [
        { id: 4 },
      ]);
      assert.deepEqual(
        (await client.query(consultaBusca("pessoa inexistente"))).rows,
        [],
      );
    } finally {
      await client.query("ROLLBACK").catch(() => {});
      await client.end();
    }
  },
);
