function inteiroNaoNegativo(value) {
  const numero = Number(value);
  return Number.isFinite(numero) && numero > 0 ? Math.trunc(numero) : 0;
}

function formatarDataEvento(value) {
  const ymd = String(value || "").slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
}

function formatarHorarioEvento(value) {
  const match = /^(\d{2}):(\d{2})/.exec(String(value || ""));
  return match ? `${match[1]}:${match[2]}` : "";
}

export function agendaEvento(evento = {}) {
  const inicio = formatarDataEvento(evento.data_inicio_geral);
  const fim = formatarDataEvento(evento.data_fim_geral);
  const horaInicio = formatarHorarioEvento(evento.horario_inicio_geral);
  const horaFim = formatarHorarioEvento(evento.horario_fim_geral);

  return {
    periodo:
      inicio && fim && inicio !== fim
        ? `${inicio} a ${fim}`
        : inicio || fim || "Datas a definir",
    horario:
      horaInicio && horaFim
        ? `${horaInicio}–${horaFim}`
        : horaInicio || horaFim || "Horário a definir",
  };
}

export function apresentacaoTituloEvento(value) {
  const titulo = String(value || "").trim() || "Evento sem título";
  const tamanho = Array.from(titulo).length;
  const classeFonte =
    tamanho <= 72
      ? "text-xl leading-7"
      : tamanho <= 120
        ? "text-lg leading-6"
        : "text-base leading-5";

  return { titulo, classeFonte, truncarVisualmente: tamanho > 160 };
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
