"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { PassThrough } = require("node:stream");
const { once } = require("node:events");
const { execFileSync } = require("node:child_process");
const { Client } = require("pg");
const ExcelJS = require("exceljs");
require("dotenv").config();

const {
  relatorioInstitucional,
  exportarRelatorioXlsx,
  exportarRelatorioPdf,
} = require("../src/controllers/relatorioController");

const connectionString =
  process.env.RELATORIO_INTEGRATION_DATABASE_URL ||
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

function respostaJson() {
  return {
    statusCode: 200,
    setHeader() {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

async function obterDashboard(client, busca) {
  const res = respostaJson();
  await relatorioInstitucional(
    { db: client, method: "POST", body: { busca }, query: {} },
    res,
  );
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  return res.body;
}

async function obterArquivo(handler, client, busca, extensao) {
  const res = new PassThrough();
  const chunks = [];
  res.on("data", (chunk) => chunks.push(chunk));
  res.setHeader = () => {};
  res.status = () => res;
  res.json = (body) => {
    throw new Error(JSON.stringify(body));
  };
  const terminado = once(res, "end");
  await handler(
    {
      db: client,
      method: "POST",
      body: { busca },
      query: {},
      params: { tipo: "institucional" },
    },
    res,
  );
  await terminado;
  const arquivo = Buffer.concat(chunks);
  assert.ok(arquivo.length > 100, `${extensao} vazio`);
  return arquivo;
}

test(
  "dashboard PostgreSQL real recalcula o recorte e protege CPF em resposta e XLSX",
  { skip: !localSeguro },
  async () => {
    const client = new Client({ connectionString });
    await client.connect();
    try {
      await client.query("BEGIN");
      await client.query(`
        CREATE TEMP TABLE eventos (id integer PRIMARY KEY, titulo text, descricao text, local text) ON COMMIT DROP;
        CREATE TEMP TABLE turmas (id integer PRIMARY KEY, evento_id integer, nome text, data_inicio date, data_fim date, horario_inicio time, horario_fim time) ON COMMIT DROP;
        CREATE TEMP TABLE usuarios (id integer PRIMARY KEY, nome text, cpf text, unidade_id integer, email text, celular text) ON COMMIT DROP;
        CREATE TEMP TABLE inscricoes (id integer PRIMARY KEY, usuario_id integer, turma_id integer, data_inscricao timestamp) ON COMMIT DROP;
        CREATE TEMP TABLE presencas (id integer PRIMARY KEY, usuario_id integer, turma_id integer, data_presenca date, presente boolean) ON COMMIT DROP;
        CREATE TEMP TABLE avaliacoes (id integer PRIMARY KEY, usuario_id integer, turma_id integer, data_avaliacao timestamp) ON COMMIT DROP;
        CREATE TEMP TABLE certificados (id integer PRIMARY KEY, usuario_id integer, turma_id integer, evento_id integer, status text, gerado_em timestamp, hash_pdf text, hash_dados text, numero_certificado text) ON COMMIT DROP;
        CREATE TEMP TABLE certificados_avulsos (status text, numero_certificado text) ON COMMIT DROP;
        CREATE TEMP TABLE reservas_salas (status text, data date, confirmado_em timestamp) ON COMMIT DROP;
        CREATE TEMP TABLE notificacoes (lida boolean) ON COMMIT DROP;
        CREATE TEMP TABLE turma_responsavel (turma_id integer, usuario_id integer, papel text) ON COMMIT DROP;
      `);
      await client.query(`
        INSERT INTO eventos VALUES
          (1, 'Saúde LGBT', 'Formação', 'Sala 1'),
          (2, 'Acolhimento', 'População LGBT', 'Sala 2'),
          (3, 'Nutrição', 'Outro tema', 'Sala 3'),
          (4, 'Gestão', 'Outro tema', 'Sala 4');
        INSERT INTO turmas VALUES
          (11, 1, 'T1', '2026-09-01', '2026-09-01', '08:00', '12:00'),
          (12, 2, 'T2', '2026-09-02', '2026-09-02', '08:00', '12:00'),
          (13, 3, 'T3', '2026-09-03', '2026-09-03', '08:00', '12:00'),
          (14, 4, 'T4', '2026-09-04', '2026-09-04', '08:00', '12:00');
        INSERT INTO usuarios VALUES
          (21, 'Maria da Silva', '123.456.789-45', 1, 'maria@example.test', '111'),
          (22, 'João Pereira', '987.654.321-00', 1, 'joao@example.test', '222');
        INSERT INTO inscricoes VALUES
          (31, 21, 11, now()), (32, 22, 11, now()), (33, 22, 12, now()),
          (34, 21, 13, now()), (35, 22, 13, now()), (36, 22, 14, now());
        INSERT INTO presencas VALUES
          (41, 21, 11, '2026-09-01', true), (42, 22, 11, '2026-09-01', false),
          (43, 22, 12, '2026-09-02', true), (44, 21, 13, '2026-09-03', true);
        INSERT INTO avaliacoes VALUES (51, 21, 11, now()), (52, 22, 12, now()), (53, 21, 13, now());
        INSERT INTO certificados VALUES
          (61, 21, 11, 1, 'emitido', now(), 'h', 'h', 'C1'),
          (62, 22, 12, 2, 'emitido', now(), 'h', 'h', 'C2'),
          (63, 21, 13, 3, 'emitido', now(), 'h', 'h', 'C3');
      `);

      const texto = (await obterDashboard(client, "LGBT")).data;
      assert.equal(texto.filtrado.eventos, 2);
      assert.equal(texto.filtrado.turmas, 2);
      assert.equal(texto.filtrado.inscricoes, 3);
      assert.equal(texto.filtrado.usuarios_envolvidos, 2);
      assert.equal(texto.filtrado.presencas, 2);
      assert.equal(texto.filtrado.ausencias_registradas, 1);
      assert.equal(texto.filtrado.avaliacoes, 2);
      assert.equal(texto.filtrado.certificados, 2);
      assert.deepEqual(
        texto.tabelas.eventos.map((row) => row.evento_id).sort(),
        [1, 2],
      );

      const respostaCpf = await obterDashboard(client, "123.456.789-45");
      const pessoa = respostaCpf.data;
      assert.equal(pessoa.filtrado.eventos, 2);
      assert.deepEqual(
        pessoa.tabelas.eventos.map((row) => row.evento_id).sort(),
        [1, 3],
      );
      assert.deepEqual(pessoa.geral, texto.geral);
      assert.equal(pessoa.geral.eventos_total, 4);
      assert.equal(pessoa.filtros.busca, "123.***.***-45");
      assert.equal(respostaCpf.meta.filtros.busca, "123.***.***-45");
      assert.doesNotMatch(
        JSON.stringify(respostaCpf),
        /123[.]456[.]789-45|12345678945/,
      );
      assert.deepEqual(
        (await obterDashboard(client, "12345678945")).data.filtrado,
        pessoa.filtrado,
      );
      const porNome = (await obterDashboard(client, "maria da")).data;
      assert.deepEqual(
        porNome.tabelas.eventos.map((row) => row.evento_id).sort(),
        [1, 3],
      );
      assert.deepEqual(porNome.filtrado, pessoa.filtrado);
      assert.deepEqual(porNome.geral, pessoa.geral);

      const xlsx = await obterArquivo(
        exportarRelatorioXlsx,
        client,
        "123.456.789-45",
        "XLSX",
      );
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(xlsx);
      const celulas = [];
      workbook.eachSheet((sheet) => {
        sheet.eachRow((row) =>
          row.eachCell((cell) => celulas.push(String(cell.value ?? ""))),
        );
      });
      const conteudoXlsx = celulas.join(" ");
      const filtrosXlsx = workbook.getWorksheet("Filtros");
      assert.ok(filtrosXlsx);
      assert.equal(
        filtrosXlsx.getRows(1, filtrosXlsx.rowCount).find((row) =>
          row.getCell(1).value === "busca",
        )?.getCell(2).value,
        "123.***.***-45",
      );
      assert.match(conteudoXlsx, /123[.]\*{3}[.]\*{3}-45/);
      assert.doesNotMatch(conteudoXlsx, /123[.]456[.]789-45|12345678945/);

      const pdf = await obterArquivo(
        exportarRelatorioPdf,
        client,
        "123.456.789-45",
        "PDF",
      );
      assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
      const textoPdf = execFileSync("pdftotext", ["-", "-"], {
        input: pdf,
        encoding: "utf8",
      });
      assert.match(textoPdf, /123[.]\*{3}[.]\*{3}-45/);
      assert.doesNotMatch(textoPdf, /123[.]456[.]789-45|12345678945/);
    } finally {
      await client.query("ROLLBACK").catch(() => {});
      await client.end();
    }
  },
);
