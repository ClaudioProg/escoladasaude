"use strict";

/**
 * Contrato de compatibilidade de build do cliente.
 *
 * FASE 1: clientes sem X-Client-Build seguem compatíveis durante a migração
 * do PWA legado.
 * FASE 2: o frontend atual envia a assinatura imutável do build; quando
 * CLIENT_BUILD_MINIMUM estiver configurado, builds comprovadamente mais
 * antigos recebem APP_UPDATE_REQUIRED.
 * FASE 3: após a retirada explicitamente aprovada dos clientes legados, a
 * ausência do header poderá deixar de ser aceita em uma mudança própria.
 */

const CLIENT_BUILD_HEADER = "X-Client-Build";
const CLIENT_BUILD_MINIMUM_HEADER = "X-Client-Build-Minimum";
const CLIENT_BUILD_CURRENT_HEADER = "X-Client-Build-Current";

function normalizeBuildSignature(value) {
  const normalized = String(value || "").trim();

  return normalized && normalized.length <= 256 && !/\s/.test(normalized)
    ? normalized
    : null;
}

function parseSemanticVersion(value) {
  const match = String(value || "").match(/^(\d+)\.(\d+)\.(\d+)$/);

  if (!match) return null;

  return match.slice(1).map((part) => Number(part));
}

function parseBuildSignature(value) {
  const signature = normalizeBuildSignature(value);
  const parts = signature?.split("::") || [];

  if (parts.length !== 3) return null;

  const [app, version, buildId] = parts;
  const semanticVersion = parseSemanticVersion(version);

  if (!app || !semanticVersion || !buildId) return null;

  return { signature, app, semanticVersion, buildId };
}

function compareSemanticVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) {
      return left[index] < right[index] ? -1 : 1;
    }
  }

  return 0;
}

function hasSortableBuildId(value) {
  return /^\d{1,32}$/.test(String(value || ""));
}

function isBuildProvablyOlder(clientBuild, minimumBuild) {
  const client = parseBuildSignature(clientBuild);
  const minimum = parseBuildSignature(minimumBuild);

  if (!client || !minimum || client.app !== minimum.app) {
    return false;
  }

  const versionComparison = compareSemanticVersions(
    client.semanticVersion,
    minimum.semanticVersion,
  );

  if (versionComparison !== 0) {
    return versionComparison < 0;
  }

  if (
    hasSortableBuildId(client.buildId) &&
    hasSortableBuildId(minimum.buildId)
  ) {
    return BigInt(client.buildId) < BigInt(minimum.buildId);
  }

  // IDs não ordenáveis não podem ser classificados com segurança. Não bloquear
  // um cliente por inferência; a política pode usar um buildId numérico.
  return false;
}

function getClientBuildPolicy(env = process.env) {
  const minimumBuild = normalizeBuildSignature(env.CLIENT_BUILD_MINIMUM);
  const currentBuild = normalizeBuildSignature(env.CLIENT_BUILD_CURRENT);

  return {
    minimumBuild: parseBuildSignature(minimumBuild) ? minimumBuild : null,
    currentBuild: parseBuildSignature(currentBuild) ? currentBuild : null,
  };
}

function appendVary(res, value) {
  const current = String(res.getHeader("Vary") || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (!current.includes(value)) current.push(value);
  res.setHeader("Vary", current.join(", "));
}

function createClientBuildCompatibilityMiddleware({ getPolicy = getClientBuildPolicy } = {}) {
  return (req, res, next) => {
    const policy = getPolicy();
    const clientBuild = normalizeBuildSignature(req.get(CLIENT_BUILD_HEADER));

    // A ausência do header é esperada nos bundles históricos e permanece
    // permitida até a FASE 3. Clientes atuais sempre mandam a assinatura.
    if (!clientBuild || !policy.minimumBuild) {
      return next();
    }

    appendVary(res, CLIENT_BUILD_HEADER);

    if (!isBuildProvablyOlder(clientBuild, policy.minimumBuild)) {
      return next();
    }

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader(CLIENT_BUILD_MINIMUM_HEADER, policy.minimumBuild);
    if (policy.currentBuild) {
      res.setHeader(CLIENT_BUILD_CURRENT_HEADER, policy.currentBuild);
    }

    return res.status(426).json({
      ok: false,
      data: null,
      message: "Esta versão da plataforma precisa ser atualizada.",
      code: "APP_UPDATE_REQUIRED",
      adminHint: null,
      details: null,
      requestId: req.requestId || null,
    });
  };
}

module.exports = {
  CLIENT_BUILD_CURRENT_HEADER,
  CLIENT_BUILD_HEADER,
  CLIENT_BUILD_MINIMUM_HEADER,
  createClientBuildCompatibilityMiddleware,
  getClientBuildPolicy,
  isBuildProvablyOlder,
  parseBuildSignature,
};
