"use strict";

const { isIP } = require("node:net");
const { createHmac, createHash } = require("node:crypto");

class AuthQuotaError extends Error {
  constructor(code) {
    super(code);
    this.name = "AuthQuotaError";
    this.code = code;
  }
}

function fail(code) { throw new AuthQuotaError(code); }
function plain(value) {
  return value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
}
function exactKeys(value, allowed) {
  return plain(value) && Reflect.ownKeys(value).every(key => allowed.includes(key));
}

// Apenas um endereco literal. Nunca interpreta headers, portas, listas ou zone IDs.
function normalizeQuotaIp(ip) {
  if (typeof ip !== "string" || ip.length > 45 || ip.includes("%")) fail("AUTH_QUOTA_IP_INVALIDO");
  const family = isIP(ip);
  if (family === 4) return ip;
  if (family !== 6) fail("AUTH_QUOTA_IP_INVALIDO");
  let source = ip.toLowerCase();
  if (source.includes(".")) {
    const split = source.lastIndexOf(":");
    const octets = source.slice(split + 1).split(".").map(Number);
    source = source.slice(0, split + 1) + ((octets[0] << 8) | octets[1]).toString(16) +
      ":" + ((octets[2] << 8) | octets[3]).toString(16);
  }
  const sides = source.split("::");
  const left = sides[0] ? sides[0].split(":") : [];
  const right = sides.length === 2 && sides[1] ? sides[1].split(":") : [];
  const groups = sides.length === 2
    ? [...left, ...Array(8 - left.length - right.length).fill("0"), ...right]
    : left;
  const words = groups.map(group => parseInt(group, 16));
  // IPv4-mapped IPv6 tem a mesma identidade do IPv4 correspondente.
  if (words.slice(0, 5).every(word => word === 0) && words[5] === 0xffff) {
    return [words[6] >> 8, words[6] & 255, words[7] >> 8, words[7] & 255].join(".");
  }
  // Forma expandida canonica: equivalencia sem depender do texto recebido.
  return words.map(word => word.toString(16).padStart(4, "0")).join(":");
}

function subjectLockKey(subject) {
  // Identificador efemero de lock; nao e chave persistida de quota nem HMAC.
  // Independe da versao HMAC. Colisoes apenas serializam sujeitos adicionais.
  return createHash("sha256").update("escola:v3:auth-quota:lock:" + subject).digest().readInt32BE(0);
}

function createQuotaIpHasher(config) {
  if (!exactKeys(config, ["activeKeyId", "keys"]) || typeof config.activeKeyId !== "string" ||
      !Array.isArray(config.keys) || config.keys.length === 0 || config.keys.length > 16) {
    fail("AUTH_QUOTA_HMAC_CONFIG_INVALIDA");
  }
  const ids = new Set();
  const keys = config.keys.map(key => {
    if (!exactKeys(key, ["keyId", "secret"]) || typeof key.keyId !== "string" ||
        (!/^[a-z0-9]/.test(key.keyId) || /[^a-z0-9_-]/.test(key.keyId) || key.keyId.length > 64) || ids.has(key.keyId) ||
        !Buffer.isBuffer(key.secret) || key.secret.length < 32) fail("AUTH_QUOTA_HMAC_CONFIG_INVALIDA");
    ids.add(key.keyId);
    return { keyId: key.keyId, secret: Buffer.from(key.secret) };
  }).sort((a, b) => a.keyId.localeCompare(b.keyId, "en"));
  const activeKeyId = config.activeKeyId;
  if (!ids.has(activeKeyId)) fail("AUTH_QUOTA_HMAC_CONFIG_INVALIDA");
  return Object.freeze({
    identify(ip) {
      const normalized = normalizeQuotaIp(ip);
      const candidates = keys.map(({ keyId, secret }) => ({
        keyId, digest: createHmac("sha256", secret).update("escola:v3:auth-quota:ip:v1\0" + normalized).digest(),
      }));
      return {
        lockKey: subjectLockKey("ip:" + normalized),
        candidates,
        current: candidates.find(candidate => candidate.keyId === activeKeyId),
      };
    },
  });
}

module.exports = { AuthQuotaError, normalizeQuotaIp, createQuotaIpHasher, subjectLockKey, exactKeys };
