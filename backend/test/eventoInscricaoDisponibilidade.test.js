"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  FREQUENCIA_MINIMA_PERCENTUAL,
  LIMITE_INGRESSO_PERCENTUAL,
  consultarDisponibilidadeTurmas,
  avaliarPrazoInscricaoTurma,
  resumirDisponibilidadeEvento,
} = require("../src/services/eventoInscricaoDisponibilidadeService");

function montarTurma({
  horasProgramadas = 4,
  horasOficiais = horasProgramadas,
  segundosDecorridos = 0,
  encontros = 1,
  encerrada = false,
  vagas = 40,
  inscritos = 0,
} = {}) {
  return {
    total_encontros: encontros,
    encontros_iniciados: segundosDecorridos > 0 ? 1 : 0,
    total_segundos: horasProgramadas * 3600,
    segundos_decorridos: segundosDecorridos,
    carga_horaria: horasOficiais,
    encerrada,
    vagas_total: vagas,
    vagas_preenchidas: inscritos,
  };
}

test("utiliza 75% de frequência exigida e até 25% de ausência acumulada", () => {
  assert.equal(FREQUENCIA_MINIMA_PERCENTUAL, 75);
  assert.equal(LIMITE_INGRESSO_PERCENTUAL, 25);
});

test("curso das 8h às 12h aceita até 9h, mas não após 9h", () => {
  const antes = avaliarPrazoInscricaoTurma(
    montarTurma({ segundosDecorridos: 3599 }),
  );
  const limite = avaliarPrazoInscricaoTurma(
    montarTurma({ segundosDecorridos: 3600 }),
  );
  const depois = avaliarPrazoInscricaoTurma(
    montarTurma({ segundosDecorridos: 3601 }),
  );

  assert.equal(antes.inscricao_no_prazo, true);
  assert.equal(limite.inscricao_no_prazo, true);
  assert.equal(limite.frequencia_maxima_possivel, 75);
  assert.equal(depois.inscricao_no_prazo, false);
});

test("16 horas em dois dias permite 12h do primeiro dia e não 12h00min01s", () => {
  const base = { horasProgramadas: 16, horasOficiais: 16, encontros: 2 };
  assert.equal(
    avaliarPrazoInscricaoTurma(
      montarTurma({ ...base, segundosDecorridos: 4 * 3600 }),
    ).inscricao_no_prazo,
    true,
  );
  assert.equal(
    avaliarPrazoInscricaoTurma(
      montarTurma({ ...base, segundosDecorridos: 4 * 3600 + 1 }),
    ).inscricao_no_prazo,
    false,
  );
});

test("entrada não é encerrada no início da primeira aula", () => {
  const turma = montarTurma({
    horasProgramadas: 4, horasOficiais: 4,
    segundosDecorridos: 1,
  });
  turma.encontros_iniciados = turma.total_encontros;
  assert.equal(avaliarPrazoInscricaoTurma(turma).inscricao_no_prazo, true);
});

test("usa o menor valor entre a carga oficial e a programação para garantir 75%", () => {
  const turma = montarTurma({
    horasProgramadas: 9, horasOficiais: 8,
    segundosDecorridos: 2 * 3600,
  });
  assert.equal(avaliarPrazoInscricaoTurma(turma).inscricao_no_prazo, true);
  turma.segundos_decorridos += 1;
  assert.equal(avaliarPrazoInscricaoTurma(turma).inscricao_no_prazo, false);
});

test("bloqueia turma sem cronograma, sem carga horária ou com horário inválido", () => {
  assert.equal(avaliarPrazoInscricaoTurma({}).inscricao_no_prazo, false);
  assert.equal(
    avaliarPrazoInscricaoTurma(montarTurma({ horasOficiais: 0 })).inscricao_no_prazo,
    false,
  );
  assert.equal(
    avaliarPrazoInscricaoTurma({
      ...montarTurma(),
      encontros_invalidos: 1,
    }).inscricao_no_prazo,
    false,
  );
});

test("bloqueia turma efetivamente encerrada", () => {
  assert.equal(
    avaliarPrazoInscricaoTurma(
      montarTurma({ segundosDecorridos: 4 * 3600, encerrada: true }),
    ).inscricao_no_prazo,
    false,
  );
});

test("mantém evento iniciado visível durante o primeiro quarto das aulas", () => {
  const resumo = resumirDisponibilidadeEvento([
    {
      id: 10,
      ...montarTurma({
        segundosDecorridos: 30 * 60,
        inscritos: 40,
      }),
    },
  ]);
  assert.equal(resumo.evento_visivel_vitrine, true);
  assert.equal(resumo.inscricao_no_prazo, true);
  assert.equal(resumo.vagas_esgotadas, true);
  assert.equal(resumo.ocupacao_percentual, 100);
});

test("evento sem capacidade ainda aparece enquanto dentro do prazo, mas sem vagas", () => {
  const resumo = resumirDisponibilidadeEvento([
    { id: 15, ...montarTurma({ vagas: 0 }) },
  ]);
  assert.equal(resumo.evento_visivel_vitrine, true);
  assert.equal(resumo.vagas_esgotadas, true);
});

test("oculta evento somente depois de todas as turmas ultrapassarem 25%", () => {
  const resumo = resumirDisponibilidadeEvento([
    {
      id: 11,
      ...montarTurma({ segundosDecorridos: 2 * 3600 }),
    },
    {
      id: 12,
      ...montarTurma({ segundosDecorridos: 4 * 3600, encerrada: true }),
    },
  ]);
  assert.equal(resumo.evento_visivel_vitrine, false);
  assert.equal(resumo.inscricao_no_prazo, false);
});

test("agrega vagas exclusivamente das turmas cujo ingresso continua possível", () => {
  const resumo = resumirDisponibilidadeEvento([
    {
      id: 13,
      ...montarTurma({
        horasProgramadas: 16, horasOficiais: 16,
        segundosDecorridos: 4 * 3600, inscritos: 32,
      }),
    },
    {
      id: 14,
      ...montarTurma({
        segundosDecorridos: 2 * 3600,
        vagas: 100, inscritos: 100,
      }),
    },
  ]);
  assert.equal(resumo.vagas_total, 40);
  assert.equal(resumo.vagas_preenchidas, 32);
  assert.equal(resumo.vagas_disponiveis, 8);
});

test("consulta usa parâmetros e uma única regra de progresso para turma e evento", async () => {
  const calls = [];
  const q = async (sql, params) => {
    calls.push({ sql, params });
    return { rows: [] };
  };
  assert.deepEqual(await consultarDisponibilidadeTurmas(q, [2, 2, 3]), []);
  assert.deepEqual(await consultarDisponibilidadeTurmas(q, [5], {
    porEvento: true, agoraBr: "2026-10-09 09:00:00",
  }), []);
  assert.equal(calls[0].params[0].length, 2);
  assert.match(calls[0].sql, /t\.id = ANY\(\$1::int\[\]\)/);
  assert.match(calls[1].sql, /t\.evento_id = ANY\(\$1::int\[\]\)/);
  assert.match(calls[0].sql, /America\/Sao_Paulo/);
  assert.match(calls[0].sql, /segundos_decorridos/);
  assert.equal(calls[1].params[1], "2026-10-09 09:00:00");
});

test("listagem e POST consultam o mesmo serviço e o POST mantém o bloqueio antes do INSERT", () => {
  const evento = fs.readFileSync(
    path.join(__dirname, "../src/controllers/eventoPublicoController.js"),
    "utf8",
  );
  const insc = fs.readFileSync(
    path.join(__dirname, "../src/controllers/inscricaoController.js"),
    "utf8",
  );
  assert.match(evento, /consultarDisponibilidadeTurmas/);
  assert.match(insc, /consultarDisponibilidadeTurmas/);

  const inicio = insc.indexOf("async function inscreverEmTurma");
  const fim = insc.indexOf("async function cancelarInscricaoPorId", inicio);
  const fluxo = insc.slice(inicio, fim);
  const acesso = fluxo.indexOf(
    "checarAcessoEvento(usuarioId, turma.evento_id)",
  );
  const bloqueioAcesso = fluxo.indexOf("if (!acesso.ok)");
  const prazo = fluxo.indexOf("carregarPrazoInscricaoTurma(q, turma)");
  const bloqueio = fluxo.indexOf('motivo: "INSCRICAO_FORA_DO_PRAZO_25"');
  const preTeste = fluxo.indexOf("processarPreTesteInscricao");
  const insert = fluxo.indexOf("INSERT INTO inscricoes");
  assert.ok(acesso >= 0 && bloqueioAcesso > acesso);
  assert.ok(prazo > bloqueioAcesso);
  assert.ok(bloqueio > prazo);
  assert.ok(preTeste > bloqueio);
  assert.ok(insert > preTeste);
});
