"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { gravarPresenca } = require("../src/controllers/presencaController");

function criarQueryEmMemoria() {
  let registro = null;
  let proximoId = 1;
  const chamadas = [];

  const q = async (sql, params) => {
    chamadas.push({ sql, params });

    if (/pg_advisory_xact_lock/.test(sql)) return { rows: [], rowCount: 1 };

    if (/^\s*UPDATE presencas/.test(sql)) {
      if (!registro) return { rows: [], rowCount: 0 };
      const alterou =
        registro.presente !== params[3] || !registro.confirmado_em;
      if (!alterou) return { rows: [], rowCount: 0 };
      registro = {
        ...registro,
        presente: params[3],
        confirmado_em: new Date(),
      };
      return { rows: [{ ...registro }], rowCount: 1 };
    }

    if (/^\s*SELECT[\s\S]+FROM presencas/.test(sql)) {
      return registro
        ? { rows: [{ ...registro }], rowCount: 1 }
        : { rows: [], rowCount: 0 };
    }

    if (/^\s*INSERT INTO presencas/.test(sql)) {
      registro = {
        id: proximoId++,
        usuario_id: params[0],
        turma_id: params[1],
        data_presenca: params[2],
        presente: params[3],
        confirmado_em: new Date(),
      };
      return { rows: [{ ...registro }], rowCount: 1 };
    }

    throw new Error(`SQL não tratado no teste: ${sql}`);
  };

  return { q, chamadas, getRegistro: () => registro };
}

test("replay e refresh retornam a presença existente sem inserir duplicata", async () => {
  const banco = criarQueryEmMemoria();
  const dados = {
    usuarioId: 10,
    turmaId: 20,
    dataPresenca: "2026-09-22",
    presente: true,
  };

  const primeira = await gravarPresenca(banco.q, dados);
  const replay = await gravarPresenca(banco.q, dados);
  const refresh = await gravarPresenca(banco.q, dados);

  assert.equal(primeira.ja_registrada, false);
  assert.equal(replay.ja_registrada, true);
  assert.equal(refresh.ja_registrada, true);
  assert.equal(banco.getRegistro().id, 1);
  assert.equal(
    banco.chamadas.filter(({ sql }) => /^\s*INSERT INTO presencas/.test(sql))
      .length,
    1,
  );
  assert.equal(
    banco.chamadas.filter(({ sql }) => /pg_advisory_xact_lock/.test(sql))
      .length,
    3,
  );
});
