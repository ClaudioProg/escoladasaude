export const VERSION_UPDATE_COOLDOWN_MS = 5 * 60 * 1000;

function normalizarTexto(valor) {
  return String(valor || "").trim();
}

export function getBuildSignature(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const app = normalizarTexto(payload.app);
  const version = normalizarTexto(payload.version);
  const buildId = normalizarTexto(payload.buildId);
  const buildAt = normalizarTexto(payload.buildAt);
  const signature = normalizarTexto(payload.signature);

  if (!app && !version && !buildId && !buildAt) {
    return null;
  }

  const derivedSignature = [
    app || "app-desconhecido",
    version || "sem-versao",
    buildId || buildAt || "sem-build",
  ].join("::");

  if (signature && signature !== derivedSignature) {
    return null;
  }

  return signature || derivedSignature;
}

export function parseVersionUpdateAttempt(value) {
  try {
    const parsed = JSON.parse(String(value || ""));
    const signature = normalizarTexto(parsed?.signature);
    const attemptedAt = Number(parsed?.attemptedAt);

    if (!signature || !Number.isFinite(attemptedAt)) {
      return null;
    }

    return { signature, attemptedAt };
  } catch {
    return null;
  }
}

export function shouldAttemptAutomaticUpdate({
  loadedSignature,
  publishedSignature,
  lastAttempt,
  now = Date.now(),
  cooldownMs = VERSION_UPDATE_COOLDOWN_MS,
}) {
  if (
    !normalizarTexto(loadedSignature) ||
    !normalizarTexto(publishedSignature) ||
    loadedSignature === publishedSignature
  ) {
    return false;
  }

  const attempt = parseVersionUpdateAttempt(lastAttempt);
  if (!attempt || attempt.signature !== publishedSignature) {
    return true;
  }

  return now - attempt.attemptedAt >= cooldownMs;
}

export function getSafeReturnPath(locationLike) {
  const pathname = String(locationLike?.pathname || "/");
  const search = String(locationLike?.search || "");
  const hash = String(locationLike?.hash || "");

  if (!pathname.startsWith("/") || pathname.startsWith("//")) {
    return "/";
  }

  return `${pathname}${search}${hash}`;
}

export function getUrlWithoutUpdateMarker(locationLike) {
  const pathname = String(locationLike?.pathname || "/");
  const searchParams = new URLSearchParams(
    String(locationLike?.search || "").replace(/^\?/, ""),
  );
  const hash = String(locationLike?.hash || "");

  searchParams.delete("atualizado");

  const search = searchParams.toString();
  return `${pathname}${search ? `?${search}` : ""}${hash}`;
}

export function buildUpdateUrl({ returnPath, publishedSignature } = {}) {
  const params = new URLSearchParams({ origem: "versao" });
  const safeReturnPath = getSafeReturnPath({ pathname: returnPath || "/" });

  params.set("retorno", safeReturnPath);
  if (normalizarTexto(publishedSignature)) {
    params.set("versao", publishedSignature);
  }

  return `/atualizar.html?${params.toString()}`;
}
