"use strict";

function somenteDigitos(value) {
  return String(value || "").replace(/\D/g, "");
}

function mascararCpfCertificado(value) {
  const digits = somenteDigitos(value);

  if (digits.length !== 11) {
    return null;
  }

  return `${digits.slice(0, 3)}.***.***-${digits.slice(9)}`;
}

function formatarIdentificadorCertificado({ cpf, registro } = {}) {
  const registroCompleto = String(registro || "").trim();

  if (registroCompleto) {
    return {
      tipo: "registro_funcional",
      valor: registroCompleto,
      texto: `Registro funcional: ${registroCompleto}`,
    };
  }

  const cpfMascarado = mascararCpfCertificado(cpf);

  if (cpfMascarado) {
    return {
      tipo: "cpf",
      valor: cpfMascarado,
      texto: `CPF: ${cpfMascarado}`,
    };
  }

  return null;
}

module.exports = {
  formatarIdentificadorCertificado,
  mascararCpfCertificado,
  somenteDigitos,
};
