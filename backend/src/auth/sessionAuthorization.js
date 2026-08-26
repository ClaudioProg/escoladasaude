"use strict";

const OFFICIAL_PROFILES = new Set([
  "usuario",
  "institucional",
  "organizador",
  "administrador",
  "gestor",
  "diagnostico",
  "avaliador",
  "relator",
  "cai_administrador",
  "cai_coordenador",
]);

function validProfile(value) {
  return typeof value === "string" && OFFICIAL_PROFILES.has(value);
}

function validProfiles(perfis) {
  return Array.isArray(perfis) && perfis.length > 0 &&
    perfis.every(validProfile) && perfis.includes("usuario") &&
    new Set(perfis).size === perfis.length;
}

function send(res, status, code, message) {
  return res.status(status).json({ ok: false, code, message, data: null });
}

function identity(req) {
  const user = req?.user;
  if (!user || !Number.isInteger(user.id) || !Array.isArray(user.perfis) ||
    !validProfiles(user.perfis) || typeof user.areaAtiva !== "string" ||
    typeof user.sessionId !== "string" ||
    user.sessionId.length === 0) return null;
  return user;
}

function requireAnyProfile(perfis) {
  if (!Array.isArray(perfis) || perfis.length === 0 || perfis.some((perfil) => !validProfile(perfil)) ||
    new Set(perfis).size !== perfis.length) {
    throw new Error("AUTH_SESSION_PROFILE_CONFIGURATION_INVALID");
  }
  const allowed = new Set(perfis);
  return (req, res, next) => {
    const user = identity(req);
    if (!user) return send(res, 401, "AUTH-401-UNAUTHENTICATED", "Não autenticado.");
    if (!user.perfis.some((perfil) => allowed.has(perfil))) {
      return send(res, 403, "AUTH-403-FORBIDDEN", "Acesso negado.");
    }
    return next();
  };
}

function requireProfile(perfil) {
  if (!validProfile(perfil)) throw new Error("AUTH_SESSION_PROFILE_CONFIGURATION_INVALID");
  return requireAnyProfile([perfil]);
}

module.exports = { requireProfile, requireAnyProfile, validProfile, validProfiles };
