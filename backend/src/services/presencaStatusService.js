"use strict";

const STATUS_ENCONTRO = Object.freeze({
  AGUARDANDO_EVENTO: "aguardando_evento",
  AGUARDANDO_CONFIRMACAO: "aguardando_confirmacao",
  PRESENCA_CONFIRMADA: "presenca_confirmada",
  FALTA: "falta",
});

function classificarStatusEncontro({ presente, agora, inicio, fim } = {}) {
  if (presente === true) {
    return STATUS_ENCONTRO.PRESENCA_CONFIRMADA;
  }

  const agoraLocal = String(agora || "").trim();
  const inicioLocal = String(inicio || "").trim();
  const fimLocal = String(fim || "").trim();

  if (!agoraLocal || !inicioLocal || !fimLocal) {
    return STATUS_ENCONTRO.AGUARDANDO_EVENTO;
  }

  if (agoraLocal < inicioLocal) {
    return STATUS_ENCONTRO.AGUARDANDO_EVENTO;
  }

  if (agoraLocal <= fimLocal) {
    return STATUS_ENCONTRO.AGUARDANDO_CONFIRMACAO;
  }

  return STATUS_ENCONTRO.FALTA;
}

module.exports = {
  STATUS_ENCONTRO,
  classificarStatusEncontro,
};
