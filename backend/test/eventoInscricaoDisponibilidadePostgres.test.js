"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  consultarDisponibilidadeTurmas,
  avaliarPrazoInscricaoTurma,
  resumirDisponibilidadeEvento,
} = require("../src/services/eventoInscricaoDisponibilidadeService");

const URL_TESTE = "postgresql://postgres@127.0.0.1:55432/escolatest";
const habilitado =
  process.env.EVENTO_PRAZO_TEST_PG === "true" &&
  process.env.EVENTO_PRAZO_TEST_DATABASE_URL === URL_TESTE;

/**
 * Contrato do ensaio: PostgreSQL EXCLUSIVAMENTE local, transação com ROLLBACK
 * e tabelas TEMP para garantir ausência de alterações nos bancos reais.
 */
test(
  "prazo real em PostgreSQL: aula, curso de dois dias, intervalo e limite exato",
  { skip: !habilitado && "Requer PostgreSQL local isolado explicitamente habilitado." },
  async () => {
    const { Client } = require("pg");
    const client = new Client({
      connectionString: URL_TESTE,
      ssl: false,
      connectionTimeoutMillis: 3000,
    });
    await client.connect();
    try {
      await client.query("BEGIN");
      await client.query(`
        CREATE TEMP TABLE turmas (
          id integer PRIMARY KEY,
          evento_id integer NOT NULL,
          nome text NOT NULL,
          vagas_total integer NOT NULL,
          carga_horaria integer NOT NULL,
          data_inicio date NOT NULL
        ) ON COMMIT DROP;
        CREATE TEMP TABLE datas_turma (
          turma_id integer NOT NULL,
          data date NOT NULL,
          horario_inicio time NOT NULL,
          horario_fim time NOT NULL
        ) ON COMMIT DROP;
        CREATE TEMP TABLE inscricoes (
          turma_id integer NOT NULL
        ) ON COMMIT DROP;
      `);
      await client.query(`
        INSERT INTO turmas(id,evento_id,nome,vagas_total,carga_horaria,data_inicio)
        VALUES
          (9001,9101,'Quatro horas',40,4,'2026-10-09'),
          (9002,9102,'Dezesseis horas',40,16,'2026-10-09'),
          (9003,9103,'Carga oficial menor',40,8,'2026-10-09'),
          (9004,9104,'Quatro dias',40,32,'2026-10-09'),
          (9005,9105,'Sem cronograma',40,4,'2026-10-09'),
          (9006,9106,'Horário inválido',40,4,'2026-10-09');
        INSERT INTO datas_turma(turma_id,data,horario_inicio,horario_fim)
        VALUES
          (9001,'2026-10-09','08:00','12:00'),
          (9002,'2026-10-09','08:00','16:00'),
          (9002,'2026-10-10','08:00','16:00'),
          (9003,'2026-10-09','08:00','17:00'),
          (9004,'2026-10-09','08:00','16:00'),
          (9004,'2026-10-12','08:00','16:00'),
          (9004,'2026-10-13','08:00','16:00'),
          (9004,'2026-10-14','08:00','16:00'),
          (9006,'2026-10-09','12:00','08:00');
        INSERT INTO inscricoes(turma_id) VALUES(9001),(9001),(9002);
      `);

      async function buscar(id, agora, porEvento = false) {
        const rows = await consultarDisponibilidadeTurmas(
          client.query.bind(client),
          [id],
          { porEvento, agoraBr: agora },
        );
        assert.equal(rows.length, 1);
        return avaliarPrazoInscricaoTurma(rows[0]);
      }
      const casos = [
        [9001,"2026-10-09 07:59:59",true],
        [9001,"2026-10-09 08:00:00",true],
        [9001,"2026-10-09 08:59:59",true],
        [9001,"2026-10-09 09:00:00",true],
        [9001,"2026-10-09 09:00:01",false],
        [9001,"2026-10-09 12:00:00",false],
        [9002,"2026-10-09 08:00:00",true],
        [9002,"2026-10-09 11:59:59",true],
        [9002,"2026-10-09 12:00:00",true],
        [9002,"2026-10-09 12:00:01",false],
        [9003,"2026-10-09 10:00:00",true],
        [9003,"2026-10-09 10:00:01",false],
        [9004,"2026-10-09 16:00:00",true],
        [9004,"2026-10-11 18:00:00",true],
        [9004,"2026-10-12 08:00:00",true],
        [9004,"2026-10-12 08:00:01",false],
        [9005,"2026-10-09 08:00:00",false],
        [9006,"2026-10-09 08:00:00",false],
      ];

      for (const [id, agora, esperado] of casos) {
        const prazo = await buscar(id, agora);
        assert.equal(prazo.inscricao_no_prazo, esperado, `${id} em ${agora}`);
      }

      const vitrine = await consultarDisponibilidadeTurmas(
        client.query.bind(client),
        [9101],
        { porEvento: true, agoraBr: "2026-10-09 08:30:00" },
      );
      assert.equal(vitrine[0].vagas_preenchidas, 2);
      assert.equal(resumirDisponibilidadeEvento(vitrine).evento_visivel_vitrine, true);

      const aposPrazo = await consultarDisponibilidadeTurmas(
        client.query.bind(client),
        [9101],
        { porEvento: true, agoraBr: "2026-10-09 09:00:01" },
      );
      assert.equal(resumirDisponibilidadeEvento(aposPrazo).evento_visivel_vitrine, false);

      const t2ViaId = await buscar(9002, "2026-10-09 12:00:00");
      const t2ViaEvento = await buscar(9102, "2026-10-09 12:00:00", true);
      assert.deepEqual(t2ViaId, t2ViaEvento);

      const pausa = await buscar(9004, "2026-10-11 18:00:00");
      assert.equal(pausa.segundos_decorridos, 8 * 3600);

      console.log(`PostgreSQL: ${casos.length + 4} verificações de tempo, pausa, vitrine e coerência passaram.`);
    } finally {
      await client.query("ROLLBACK").catch(() => {});
      await client.end();
    }
  },
);
