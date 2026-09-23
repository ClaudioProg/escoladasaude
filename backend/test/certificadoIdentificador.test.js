"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  formatarIdentificadorCertificado,
  mascararCpfCertificado,
} = require("../src/utils/certificadoIdentificador");

test("CPF mascara exatamente os seis algarismos centrais", () => {
  assert.equal(mascararCpfCertificado("123.456.789-45"), "123.***.***-45");
  assert.equal(mascararCpfCertificado("12345678945"), "123.***.***-45");
  assert.equal(mascararCpfCertificado("123"), null);
});

for (const perfil of ["participante", "organizador", "avulso"]) {
  test(`${perfil} exibe CPF protegido com rótulo`, () => {
    assert.deepEqual(formatarIdentificadorCertificado({ cpf: "12345678945" }), {
      tipo: "cpf",
      valor: "123.***.***-45",
      texto: "CPF: 123.***.***-45",
    });
  });

  test(`${perfil} exibe registro funcional completo e prioritário`, () => {
    assert.deepEqual(
      formatarIdentificadorCertificado({
        cpf: "12345678945",
        registro: "RF-00987/A",
      }),
      {
        tipo: "registro_funcional",
        valor: "RF-00987/A",
        texto: "Registro funcional: RF-00987/A",
      },
    );
  });
}

test("ausência real de documento não inventa identificador", () => {
  assert.equal(formatarIdentificadorCertificado({}), null);
});
