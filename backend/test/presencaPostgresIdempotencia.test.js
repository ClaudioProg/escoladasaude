"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { Client } = require("pg");
require("dotenv").config();

const {
  gravarPresenca,
  respostaConfirmacaoQr,
} = require("../src/controllers/presencaController");

const connectionString =
  process.env.PRESENCA_INTEGRATION_DATABASE_URL ||
  process.env.DATABASE_URL ||
  "";
let localSeguro = false;
try {
  localSeguro = ["localhost", "127.0.0.1", "::1"].includes(
    new URL(connectionString).hostname,
  );
} catch {
  localSeguro = false;
}

test(
  "PostgreSQL real conserva uma presença no replay e no refresh",
  { skip: !localSeguro },
  async () => {
    const client = new Client({ connectionString });
    await client.connect();
    try {
      await client.query("BEGIN");
      await client.query(`
        CREATE TEMP TABLE presencas (
          id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          usuario_id integer NOT NULL,
          turma_id integer NOT NULL,
          data_presenca date NOT NULL,
          presente boolean NOT NULL,
          confirmado_em timestamp
        ) ON COMMIT DROP;
      `);
      const dados = {
        usuarioId: 21,
        turmaId: 31,
        dataPresenca: "2026-09-23",
        presente: true,
      };
      const query = client.query.bind(client);
      const primeira = await gravarPresenca(query, dados);
      const segunda = await gravarPresenca(query, dados);
      const refresh = await gravarPresenca(query, dados);

      assert.equal(primeira.ja_registrada, false);
      assert.equal(segunda.ja_registrada, true);
      assert.equal(refresh.ja_registrada, true);
      assert.equal(segunda.id, primeira.id);
      assert.equal(refresh.id, primeira.id);
      assert.equal(segunda.presente, true);
      assert.equal(segunda.data_presenca, dados.dataPresenca);
      const respostaInicial = respostaConfirmacaoQr(
        primeira,
        { exigido: false },
        null,
      );
      const respostaReplay = respostaConfirmacaoQr(
        segunda,
        { exigido: false },
        null,
      );
      assert.equal(respostaInicial.status, 201);
      assert.equal(respostaReplay.status, 200);
      assert.equal(respostaReplay.message, "Presença já registrada.");
      assert.equal(respostaReplay.data.presenca.id, primeira.id);
      const total = await client.query(
        "SELECT COUNT(*)::int AS total FROM presencas",
      );
      assert.equal(total.rows[0].total, 1);
    } finally {
      await client.query("ROLLBACK").catch(() => {});
      await client.end();
    }
  },
);
