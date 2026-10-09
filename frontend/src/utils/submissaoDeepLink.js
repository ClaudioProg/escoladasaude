/**
 * Identificadores e URLs permanentes das chamadas de trabalhos.
 * Nenhum dado da submissão ou sessão é incluído no link público.
 */
export function parseChamadaId(value) {
  const text = String(value ?? "");
  if (!/^[1-9]\\d*$/.test(text)) {
    return null;
  }
  const number = Number(text);
  return Number.isSafeInteger(number) ? number : null;
}

export function urlSubmissaoChamada(siteUrl, chamadaId, basePath = "/") {
  const id = parseChamadaId(chamadaId);
  if (id === null) {
    throw new TypeError("Identificador de chamada inválido.");
  }

  const base = new URL(basePath, siteUrl);
  if (base.protocol !== "https:" && base.protocol !== "http:") {
    throw new TypeError("Origem pública inválida.");
  }

  const url = new URL("submissao", base);
  url.searchParams.set("chamada_id", String(id));
  return url.toString();
}
