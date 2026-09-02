"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

function ler(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), "utf8");
}

const migrationOriginal = ler(
  "../db/migrations/2026-08-20-pre-teste-evento.sql",
);
const migrationMultipla = ler(
  "../db/migrations/2026-09-01-pre-teste-respostas-multiplas.sql",
);

test("alteração de schema é necessária e migration é aditiva e versionada", () => {
  assert.doesNotMatch(
    migrationOriginal,
    /modo_resposta|alternativas_ids|\bcorreta\b/,
  );
  assert.match(
    migrationMultipla,
    /ADD COLUMN IF NOT EXISTS modo_resposta text/,
  );
  assert.doesNotMatch(migrationMultipla, /\bcorreta\b|gabarito|acerto/i);
  assert.match(
    migrationMultipla,
    /ADD COLUMN IF NOT EXISTS alternativas_ids integer\[\]/,
  );
  assert.doesNotMatch(migrationMultipla, /DROP TABLE|TRUNCATE/);
});

test("questões históricas são promovidas para resposta única sem reescrever respostas", () => {
  assert.match(
    migrationMultipla,
    /SET modo_resposta = 'resposta_unica'[\s\S]*?tipo = 'multipla_escolha'/,
  );
  assert.match(
    migrationMultipla,
    /alternativa_id IS NOT NULL[\s\S]*?alternativas_ids IS NULL/,
  );
  assert.doesNotMatch(
    migrationMultipla,
    /UPDATE\s+pre_teste_respostas\s+SET\s+alternativa_id/i,
  );
});

test("constraint e trigger distinguem resposta única, múltipla e dissertativa", () => {
  assert.match(
    migrationMultipla,
    /tipo = 'multipla_escolha'[\s\S]*?modo_resposta IS NOT NULL[\s\S]*?modo_resposta IN \('resposta_unica', 'respostas_multiplas'\)/,
  );
  assert.match(migrationMultipla, /'resposta_unica', 'respostas_multiplas'/);
  assert.match(migrationMultipla, /v_modo_resposta = 'resposta_unica'/);
  assert.match(migrationMultipla, /NEW\.alternativas_ids IS NOT NULL/);
  assert.match(migrationMultipla, /v_modo_resposta = 'respostas_multiplas'/);
  assert.match(migrationMultipla, /cardinality\(NEW\.alternativas_ids\) = 0/);
  assert.match(migrationMultipla, /COUNT\(DISTINCT alternativa_id\)/);
  assert.match(migrationMultipla, /v_tipo = 'dissertativa'/);
});

test("editor permite dois modos sem controles de classificação", () => {
  const source = ler(
    "../../frontend/src/components/eventos/EditorPreTesteEvento.jsx",
  );

  assert.match(source, /Tipo de resposta/);
  assert.match(source, /Apenas uma alternativa/);
  assert.match(source, /Uma ou mais alternativas/);
  assert.match(source, /type="radio"/);
  assert.doesNotMatch(source, /\bcorreta\b|gabarito|alternativa_correta_id/i);
});

test("participante recebe radio para única, checkbox para múltipla e envia array", () => {
  const modal = ler(
    "../../frontend/src/components/eventos/ModalPreTesteInscricao.jsx",
  );
  const service = ler("../src/services/preTesteService.js");

  assert.match(modal, /\? "checkbox"\s*: "radio"/);
  assert.match(modal, /Selecione uma ou mais alternativas/);
  assert.match(modal, /Selecione apenas uma alternativa/);
  assert.match(modal, /alternativas_ids: proximas/);
  assert.match(service, /alternativas_ids: alternativasIds/);
  assert.doesNotMatch(
    service.slice(
      service.indexOf("async function obterPreTesteParaResponder"),
      service.indexOf("function validarRespostasPreTeste"),
    ),
    /correta:/,
  );
});
