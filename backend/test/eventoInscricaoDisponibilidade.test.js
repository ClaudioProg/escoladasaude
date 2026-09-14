"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  FREQUENCIA_MINIMA_PERCENTUAL,
  LIMITE_INGRESSO_PERCENTUAL,
  avaliarPrazoInscricaoTurma,
  resumirDisponibilidadeEvento,
} = require("../src/services/eventoInscricaoDisponibilidadeService");

test("reutiliza a frequência mínima de 75% como limite canônico de ingresso de 25%", () => {
  assert.equal(FREQUENCIA_MINIMA_PERCENTUAL, 75);
  assert.equal(LIMITE_INGRESSO_PERCENTUAL, 25);
  assert.equal(
    avaliarPrazoInscricaoTurma({
      total_encontros: 4,
      encontros_iniciados: 1,
    }).inscricao_no_prazo,
    true,
  );
  assert.equal(
    avaliarPrazoInscricaoTurma({
      total_encontros: 4,
      encontros_iniciados: 2,
    }).inscricao_no_prazo,
    false,
  );
});

test("bloqueia turma encerrada ou sem cronograma", () => {
  assert.equal(
    avaliarPrazoInscricaoTurma({
      total_encontros: 4,
      encontros_iniciados: 4,
      encerrada: true,
    }).inscricao_no_prazo,
    false,
  );
  assert.equal(avaliarSemCronograma().inscricao_no_prazo, false);
});

function avaliarSemCronograma() {
  return avaliarPrazoInscricaoTurma({ total_encontros: 0 });
}

test("mantém evento válido visível mesmo quando todas as vagas estão ocupadas", () => {
  const resumo = resumirDisponibilidadeEvento([
    {
      id: 10,
      total_encontros: 4,
      encontros_iniciados: 0,
      vagas_total: 40,
      vagas_preenchidas: 40,
    },
  ]);

  assert.equal(resumo.evento_visivel_vitrine, true);
  assert.equal(resumo.vagas_esgotadas, true);
  assert.equal(resumo.ocupacao_percentual, 100);
});

test("turma válida sem capacidade positiva não oferece inscrição", () => {
  const resumo = resumirDisponibilidadeEvento([
    {
      id: 15,
      total_encontros: 4,
      encontros_iniciados: 0,
      vagas_total: 0,
      vagas_preenchidas: 0,
    },
  ]);

  assert.equal(resumo.evento_visivel_vitrine, true);
  assert.equal(resumo.vagas_esgotadas, true);
});

test("oculta evento encerrado ou sem turma ainda apta a novas inscrições", () => {
  const resumo = resumirDisponibilidadeEvento([
    {
      id: 11,
      total_encontros: 4,
      encontros_iniciados: 2,
      vagas_total: 40,
      vagas_preenchidas: 12,
    },
    {
      id: 12,
      total_encontros: 1,
      encontros_iniciados: 1,
      encerrada: true,
      vagas_total: 20,
      vagas_preenchidas: 10,
    },
  ]);

  assert.equal(resumo.evento_visivel_vitrine, false);
  assert.equal(resumo.inscricao_no_prazo, false);
});

test("agrega ocupação somente das turmas ainda válidas para ingresso", () => {
  const resumo = resumirDisponibilidadeEvento([
    {
      id: 13,
      total_encontros: 8,
      encontros_iniciados: 2,
      vagas_total: 40,
      vagas_preenchidas: 32,
    },
    {
      id: 14,
      total_encontros: 4,
      encontros_iniciados: 2,
      vagas_total: 100,
      vagas_preenchidas: 100,
    },
  ]);

  assert.equal(resumo.vagas_total, 40);
  assert.equal(resumo.vagas_preenchidas, 32);
  assert.equal(resumo.vagas_disponiveis, 8);
  assert.equal(resumo.ocupacao_percentual, 80);
});

test("controller mantém público-alvo e prazo no backend antes do pré-teste e do INSERT", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../src/controllers/inscricaoController.js"),
    "utf8",
  );
  const inicio = source.indexOf("async function inscreverEmTurma");
  const fim = source.indexOf("async function cancelarInscricaoPorId", inicio);
  const fluxo = source.slice(inicio, fim);
  const acesso = fluxo.indexOf(
    "checarAcessoEvento(usuarioId, turma.evento_id)",
  );
  const bloqueioAcesso = fluxo.indexOf("if (!acesso.ok)");
  const prazo = fluxo.indexOf("carregarPrazoInscricaoTurma(q, turma)");
  const bloqueio = fluxo.indexOf('motivo: "INSCRICAO_FORA_DO_PRAZO_25"');
  const preTeste = fluxo.indexOf("processarPreTesteInscricao");
  const insert = fluxo.indexOf("INSERT INTO inscricoes");

  assert.ok(acesso >= 0);
  assert.ok(bloqueioAcesso > acesso);
  assert.ok(prazo > bloqueioAcesso);
  assert.ok(bloqueio > prazo);
  assert.ok(preTeste > bloqueio);
  assert.ok(insert > preTeste);
});
