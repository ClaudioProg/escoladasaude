export function publicationControlAriaLabel(evento = {}) {
  const publicado =
    evento?.publicado === true ||
    evento?.publicado === "true" ||
    evento?.publicado === 1;
  const titulo = String(evento?.titulo || evento?.nome || "").trim();
  return `${publicado ? "Despublicar" : "Publicar"} evento${
    titulo ? ` ${titulo}` : ""
  }`;
}

export function openDespublicationConfirmation(evento) {
  const id = Number(evento?.id);
  return Number.isInteger(id) && id > 0 ? evento : null;
}

export function cancelDespublicationConfirmation() {
  return null;
}

export async function confirmDespublication(evento, request) {
  const id = Number(evento?.id);
  if (!Number.isInteger(id) || id <= 0) {
    return false;
  }

  await request(id);
  return true;
}
