"use strict";

const MAX_AUTH_VERSION = 2147483647;

function isValidAuthVersion(value) {
  return typeof value === "number" && Number.isSafeInteger(value) &&
    value >= 1 && value <= MAX_AUTH_VERSION;
}

function validateMode(mode) {
  if (mode !== "bridge" && mode !== "strict") {
    const error = new Error("Configuração de autenticação indisponível.");
    error.code = "AUTH_VERSION_MODE_INVALID";
    throw error;
  }
  return mode;
}

function getAuthVersionMode() {
  return validateMode(process.env.AUTH_VERSION_MODE);
}

function resolveTokenAuthVersion(payload, mode) {
  validateMode(mode);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  if (!Object.prototype.hasOwnProperty.call(payload, "auth_version")) {
    return mode === "bridge" ? 1 : null;
  }
  return isValidAuthVersion(payload.auth_version) ? payload.auth_version : null;
}

module.exports = { isValidAuthVersion, getAuthVersionMode, resolveTokenAuthVersion };
