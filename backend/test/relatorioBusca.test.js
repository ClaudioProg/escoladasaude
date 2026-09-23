"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildTurmasFiltradasWhere,
  normalizarBuscaRelatorio,
} = require("../src/controllers/relatorioController");

test("busca textual aceita palavra, trecho, caixa e acentos no SQL", () => {
  for (const termo of ["LGBT", "lgb", "Saúde da população"]) {
    const normalizada = normalizarBuscaRelatorio(termo);
    assert.equal(normalizada.tipo, "texto");

    const query = buildTurmasFiltradasWhere({
      busca: normalizada.termo,
      busca_tipo: normalizada.tipo,
    });

    assert.deepEqual(query.params, [`%${normalizada.termo}%`]);
    assert.match(query.sqlWhere, /e\.titulo/);
    assert.match(query.sqlWhere, /e\.descricao/);
    assert.match(query.sqlWhere, /unaccent\(lower/);
  }
});

test("busca por nome usa somente vínculos reais pessoa-evento", () => {
  const normalizada = normalizarBuscaRelatorio("Maria da Silva");
  const query = buildTurmasFiltradasWhere({
    busca: normalizada.termo,
    busca_tipo: normalizada.tipo,
  });

  assert.match(query.sqlWhere, /FROM usuarios ub/);
  assert.match(query.sqlWhere, /FROM inscricoes ib/);
  assert.match(query.sqlWhere, /FROM presencas pb/);
  assert.match(query.sqlWhere, /pb\.presente IS TRUE/);
  assert.match(query.sqlWhere, /FROM certificados cb/);
  assert.match(query.sqlWhere, /cb\.status IN \('emitido', 'enviado'\)/);
});

test("CPF formatado ou numérico produz a mesma comparação normalizada", () => {
  for (const termo of ["123.456.789-45", "12345678945"]) {
    const normalizada = normalizarBuscaRelatorio(termo);
    assert.deepEqual(normalizada, {
      termo,
      tipo: "cpf",
      cpf: "12345678945",
    });

    const query = buildTurmasFiltradasWhere({
      busca: normalizada.termo,
      busca_tipo: normalizada.tipo,
      busca_cpf: normalizada.cpf,
    });

    assert.deepEqual(query.params, ["12345678945"]);
    assert.match(query.sqlWhere, /regexp_replace\(COALESCE\(ub\.cpf/);
    assert.doesNotMatch(query.sqlWhere, /12345678945/);
  }
});

test("fragmentos mínimos e termo inexistente não são ampliados no cliente SQL", () => {
  assert.deepEqual(normalizarBuscaRelatorio("ab"), {
    termo: null,
    tipo: null,
    cpf: null,
  });
  assert.deepEqual(normalizarBuscaRelatorio("termo-sem-correspondência"), {
    termo: "termo-sem-correspondência",
    tipo: "texto",
    cpf: null,
  });
});
