"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { PassThrough } = require("node:stream");
const { once } = require("node:events");
const test = require("node:test");
const PDFDocument = require("pdfkit");

const { gerarPdfFisico } = require("../src/controllers/certificadoController");
const {
  getIdentificadorInfo,
  desenharCertificado,
} = require("../src/controllers/certificadoAvulsoController");

let tempDir;
test.before(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cert-controller-pdf-"));
  execFileSync("pdftotext", ["-v"], { stdio: "ignore" });
});
test.after(async () => {
  if (tempDir) await fs.rm(tempDir, { recursive: true, force: true });
});

const dbAssinantes = {
  async query() {
    return {
      rows: [
        {
          id: 17,
          usuario_id: 17,
          ordem: 1,
          origem: "turma_certificado_assinante",
          papel: "assinante",
          cargo_fallback: "Chefe da Escola da Saúde",
          nome: "Assinante da Fixture",
          email: "assinante@example.test",
          perfil: "gestor",
          imagem_base64: null,
        },
      ],
    };
  },
};

async function pdfEvento(tipo, documento, sequencia) {
  const resultado = await gerarPdfFisico({
    tipo,
    usuario_id: 701,
    evento_id: 801,
    turma_id: 901,
    numero_certificado: `TESTE-${sequencia}`,
    codigo_validacao: `controller-${sequencia}`,
    contextoTurma: {
      titulo: "Evento de Validação",
      turma_nome: "Turma de Validação",
      data_inicio: "2026-09-01",
      data_fim: "2026-09-01",
      carga_horaria: 4,
    },
    nomeUsuario: "Pessoa de Teste",
    cpfUsuario: documento.cpf || "",
    registroUsuario: documento.registro || "",
    horasTotal: 4,
    db: dbAssinantes,
    outputDir: tempDir,
  });
  return execFileSync("pdftotext", ["-layout", resultado.caminho, "-"], {
    encoding: "utf8",
  });
}

async function pdfAvulso(documento) {
  const info = getIdentificadorInfo(documento);
  const doc = new PDFDocument({ size: "A4", layout: "landscape" });
  const output = new PassThrough();
  const chunks = [];
  output.on("data", (chunk) => chunks.push(chunk));
  const terminado = once(output, "end");
  doc.pipe(output);
  desenharCertificado(doc, {
    nome: "Pessoa Avulsa",
    curso: "Curso de Validação",
    modalidade: "participante",
    data_inicio: "2026-09-01",
    data_fim: "2026-09-01",
    carga_horaria: 4,
    numero_certificado: "TESTE-AVULSO",
    ...info,
  });
  doc.end();
  await terminado;
  return execFileSync("pdftotext", ["-", "-"], {
    input: Buffer.concat(chunks),
    encoding: "utf8",
  });
}

for (const tipo of ["usuario", "organizador"]) {
  for (const [nome, documento, esperado] of [
    ["CPF", { cpf: "123.456.789-45" }, "CPF: 123.***.***-45"],
    ["registro", { registro: "RF-00987/A" }, "Registro funcional: RF-00987/A"],
  ]) {
    test(`controlador ${tipo} leva ${nome} ao PDF na emissão e reconstrução`, async () => {
      const inicial = await pdfEvento(
        tipo,
        documento,
        `${tipo}-${nome}-inicial`,
      );
      const reconstruido = await pdfEvento(
        tipo,
        documento,
        `${tipo}-${nome}-reconstruido`,
      );
      assert.ok(inicial.includes(esperado), inicial);
      assert.ok(reconstruido.includes(esperado), reconstruido);
      assert.doesNotMatch(inicial, /123[.]456[.]789-45/);
      assert.doesNotMatch(reconstruido, /123[.]456[.]789-45/);
    });
  }
}

for (const [nome, documento, esperado] of [
  ["CPF", "123.456.789-45", "CPF: 123.***.***-45"],
  ["registro", "RF-00987/A", "Registro funcional: RF-00987/A"],
]) {
  test(`controlador avulso leva ${nome} ao PDF inicial e regenerado`, async () => {
    const inicial = await pdfAvulso(documento);
    const regenerado = await pdfAvulso(documento);
    assert.ok(inicial.includes(esperado), inicial);
    assert.ok(regenerado.includes(esperado), regenerado);
    assert.doesNotMatch(inicial, /123[.]456[.]789-45/);
  });
}
