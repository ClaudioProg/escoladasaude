"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");

const PDFDocument = require("pdfkit");
const { criarListaPresencaPdf } = require("../src/utils/listaPresencaPdf");
const {
  formatarIdentificadorCertificado,
} = require("../src/utils/certificadoIdentificador");
const {
  desenharCertificadoCompletoV2,
} = require("../src/utils/certificadoLayoutPdf");

let tempDir;

test.before(async () => {
  const baseDir = path.resolve(__dirname, ".tmp");
  await fsp.mkdir(baseDir, { recursive: true });
  tempDir = await fsp.mkdtemp(path.join(baseDir, "pdf-real-"));
  execFileSync("pdfinfo", ["-v"], { stdio: "ignore" });
  execFileSync("pdftotext", ["-v"], { stdio: "ignore" });
});

test.after(async () => {
  if (tempDir) await fsp.rm(tempDir, { recursive: true, force: true });
});

function textoPdf(pdfPath) {
  return execFileSync("pdftotext", ["-layout", pdfPath, "-"], {
    encoding: "utf8",
  });
}

function paginasPdf(pdfPath) {
  const output = execFileSync("pdfinfo", [pdfPath], { encoding: "utf8" });
  return Number(/^Pages:\s+(\d+)$/im.exec(output)?.[1] || 0);
}

function criarInscritos(total) {
  return Array.from({ length: total }, (_, index) => ({
    usuario_id: index + 1,
    nome: `Participante ${String(index + 1).padStart(3, "0")}`,
    cpf: `1234567${String(index).padStart(4, "0")}`.slice(0, 11),
  }));
}

async function gerarLista(nome, datas, totalInscritos = 3) {
  const pdfPath = path.join(tempDir, `${nome}.pdf`);
  const output = fs.createWriteStream(pdfPath);
  const finished = new Promise((resolve, reject) => {
    output.on("finish", resolve);
    output.on("error", reject);
  });
  const resultado = criarListaPresencaPdf({
    turma: {
      id: 99,
      nome: "Turma de validação",
      evento_titulo: "Evento de contingência",
      evento_local: "Auditório",
    },
    datas: datas.map((data) => ({
      data,
      horario_inicio: "08:00",
      horario_fim: "12:00",
    })),
    inscritos: criarInscritos(totalInscritos),
    presencas: [],
    output,
  });
  await finished;
  return { pdfPath, ...resultado };
}

test("lista real cabe na página e reserva mais espaço à assinatura", async () => {
  const { pdfPath, layout } = await gerarLista("uma-data", ["2026-09-24"]);
  assert.equal(paginasPdf(pdfPath), 1);
  assert.equal(
    layout.columns.reduce((sum, value) => sum + value, 0),
    layout.contentWidth,
  );
  assert.equal(layout.columns[3], 116);
  assert.ok(layout.columns[4] >= 210);
  assert.ok(layout.columns[4] > layout.columns[3]);
  assert.match(textoPdf(pdfPath), /24\/09\/2026/);
});

test("duas e três datas reais sempre começam em páginas próprias", async () => {
  const duas = await gerarLista("duas-datas", ["2026-09-24", "2026-09-25"]);
  const tres = await gerarLista("tres-datas", [
    "2026-09-24",
    "2026-09-25",
    "2026-09-26",
  ]);

  assert.equal(paginasPdf(duas.pdfPath), 2);
  assert.equal(paginasPdf(tres.pdfPath), 3);

  const paginasDuas = textoPdf(duas.pdfPath)
    .split("\f")
    .filter((page) => page.trim());
  const paginasTres = textoPdf(tres.pdfPath)
    .split("\f")
    .filter((page) => page.trim());
  assert.match(paginasDuas[0], /24\/09\/2026/);
  assert.doesNotMatch(paginasDuas[0], /25\/09\/2026/);
  assert.match(paginasDuas[1], /25\/09\/2026/);
  assert.deepEqual(
    paginasTres.map((page) => /Data:\s+(\d{2}\/\d{2}\/\d{4})/.exec(page)?.[1]),
    ["24/09/2026", "25/09/2026", "26/09/2026"],
  );
});

test("data seguinte só começa após todas as páginas da primeira data", async () => {
  const { pdfPath } = await gerarLista(
    "overflow-primeira-data",
    ["2026-09-24", "2026-09-25"],
    45,
  );
  const paginas = textoPdf(pdfPath)
    .split("\f")
    .filter((page) => page.trim());
  const primeiraPaginaSegundaData = paginas.findIndex((page) =>
    /Data:\s+25\/09\/2026/.test(page),
  );

  assert.ok(primeiraPaginaSegundaData > 1);
  for (const page of paginas.slice(0, primeiraPaginaSegundaData)) {
    assert.match(page, /Data:\s+24\/09\/2026/);
    assert.doesNotMatch(page, /Data:\s+25\/09\/2026/);
  }
});

async function gerarCertificado(nome, identificadorTexto) {
  const pdfPath = path.join(tempDir, `${nome}.pdf`);
  const output = fs.createWriteStream(pdfPath);
  const finished = new Promise((resolve, reject) => {
    output.on("finish", resolve);
    output.on("error", reject);
  });
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 40 });
  doc.pipe(output);
  desenharCertificadoCompletoV2(doc, {
    nome: "Pessoa de Teste",
    identificadorTexto,
    textoPrincipal: "Participou do evento de validação.",
    dataTexto: "Santos, 22 de setembro de 2026.",
    assinaturas: [],
    numeroCertificado: "TESTE-001",
    codigoValidacao: "CODIGO-TESTE",
    validacaoUrl: "https://example.test/validar/CODIGO-TESTE",
  });
  doc.end();
  await finished;
  return { pdfPath, texto: textoPdf(pdfPath) };
}

for (const perfil of ["participante", "organizador", "avulso"]) {
  test(`PDF real de ${perfil} contém CPF com seis dígitos centrais mascarados`, async () => {
    const identificador = formatarIdentificadorCertificado({
      cpf: "12345678945",
    });
    const { texto } = await gerarCertificado(
      `${perfil}-cpf`,
      identificador.texto,
    );
    assert.match(texto, /CPF:\s+123\.\*\*\*\.\*\*\*-45/);
    assert.doesNotMatch(texto, /123\.456\.789-45|12345678945/);
  });

  test(`PDF real de ${perfil} contém registro funcional completo`, async () => {
    const identificador = formatarIdentificadorCertificado({
      registro: "RF-00987/A",
    });
    const { texto } = await gerarCertificado(
      `${perfil}-registro`,
      identificador.texto,
    );
    assert.match(texto, /Registro funcional:\s+RF-00987\/A/);
  });
}

test("PDF real sem documento não cria rótulo vazio", async () => {
  const { texto } = await gerarCertificado("sem-documento", null);
  assert.doesNotMatch(texto, /CPF:|Registro funcional:/);
});
