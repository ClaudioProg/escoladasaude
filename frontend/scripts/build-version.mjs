const DEFAULT_APP_ID = "escoladasaude";

function normalizarTexto(valor) {
  return String(valor || "").trim();
}

export function criarAssinaturaBuild({ app, version, buildId } = {}) {
  const appNormalizado = normalizarTexto(app);
  const versaoNormalizada = normalizarTexto(version);
  const buildIdNormalizado = normalizarTexto(buildId);

  if (!appNormalizado || !versaoNormalizada || !buildIdNormalizado) {
    throw new Error(
      "A identidade do build exige app, version e buildId não vazios.",
    );
  }

  return `${appNormalizado}::${versaoNormalizada}::${buildIdNormalizado}`;
}

export function criarIdentidadeBuild({
  version,
  agora = new Date(),
  buildId,
  app = DEFAULT_APP_ID,
} = {}) {
  const dataBuild = agora instanceof Date ? agora : new Date(agora);

  if (Number.isNaN(dataBuild.getTime())) {
    throw new Error("A data usada para gerar o Build ID é inválida.");
  }

  const buildIdUnico = normalizarTexto(buildId) || String(dataBuild.getTime());
  const identidade = {
    app: normalizarTexto(app) || DEFAULT_APP_ID,
    version: normalizarTexto(version),
    buildId: buildIdUnico,
    buildAt: dataBuild.toISOString(),
  };

  return {
    ...identidade,
    signature: criarAssinaturaBuild(identidade),
  };
}

export function validarIdentidadeBuild(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("version.json não contém um objeto válido.");
  }

  const assinaturaCalculada = criarAssinaturaBuild(payload);
  const assinaturaDeclarada = normalizarTexto(payload.signature);

  if (!assinaturaDeclarada) {
    throw new Error("version.json não contém a assinatura imutável do build.");
  }

  if (assinaturaDeclarada !== assinaturaCalculada) {
    throw new Error(
      "A assinatura declarada em version.json diverge de app, version e buildId.",
    );
  }

  return assinaturaDeclarada;
}
