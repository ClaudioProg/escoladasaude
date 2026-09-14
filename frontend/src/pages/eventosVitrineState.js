function inteiroNaoNegativo(value) {
  const numero = Number(value);
  return Number.isFinite(numero) && numero > 0 ? Math.trunc(numero) : 0;
}

export function eventoPath(eventoId) {
  const id = Number(eventoId);
  return Number.isInteger(id) && id > 0 ? `/eventos/${id}` : "/evento";
}

export function eventoCanonicalUrl(origin, eventoId) {
  const base = String(origin || "").replace(/\/+$/, "");
  return `${base}${eventoPath(eventoId)}`;
}

export function eventoVisivelNaVitrine(evento) {
  return evento?.publicado === true && evento?.evento_visivel_vitrine === true;
}

export function filtrarEventosVitrine(eventos = []) {
  return (Array.isArray(eventos) ? eventos : []).filter(eventoVisivelNaVitrine);
}

export function ocupacaoEvento(evento = {}) {
  const vagasTotal = inteiroNaoNegativo(evento.vagas_total);
  const vagasPreenchidas = Math.min(
    inteiroNaoNegativo(evento.vagas_preenchidas),
    vagasTotal,
  );
  const vagasDisponiveis = Math.max(vagasTotal - vagasPreenchidas, 0);
  const percentual = vagasTotal
    ? Math.round((vagasPreenchidas / vagasTotal) * 100)
    : 0;

  return {
    vagasTotal,
    vagasPreenchidas,
    vagasDisponiveis,
    percentual,
    esgotadas: vagasTotal > 0 && vagasDisponiveis === 0,
  };
}

export function inscricoesDoEvento(inscricoes = [], eventoId) {
  const id = Number(eventoId);
  return (Array.isArray(inscricoes) ? inscricoes : []).filter(
    (inscricao) => Number(inscricao?.evento_id) === id,
  );
}

export function mensagemElegibilidade(evento = {}) {
  if (evento.pode_se_inscrever !== false) {
    return "";
  }
  return (
    String(evento.motivo_bloqueio || "").trim() ||
    `Este evento é exclusivo para ${evento.publico_alvo_label || "o público configurado"}.`
  );
}

export function estadoInscricaoEvento(evento = {}, inscricoes = []) {
  if (Array.isArray(inscricoes) && inscricoes.length > 0) {
    return "inscrito";
  }
  if (evento.vagas_esgotadas === true) {
    return "lotado";
  }
  if (evento.elegivel_publico_alvo === false) {
    return "inelegivel";
  }
  if (evento.pode_se_inscrever === true) {
    return "disponivel";
  }
  return "indisponivel";
}
