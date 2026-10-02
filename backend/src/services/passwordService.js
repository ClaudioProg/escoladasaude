"use strict";

const argon2 = require("argon2");
const bcrypt = require("bcrypt");

const ARGON2_OPTIONS = Object.freeze({
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
});

const MIN_CODE_POINTS = 15;
const MAX_CODE_POINTS = 128;
const MAX_UTF8_BYTES = 512;
const BCRYPT_MAX_UTF8_BYTES = 72;

// node.bcrypt.js supports the $2a$ and $2b$ variants.
const BCRYPT_HASH_RE = /^\$2[ab]\$(?:0[4-9]|[12]\d|3[01])\$[./A-Za-z0-9]{53}$/;
const ARGON2ID_HASH_RE = /^\$argon2id\$v=19\$([mtp]=[1-9]\d*,){2}[mtp]=[1-9]\d*\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/;

class PasswordServiceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PasswordServiceError";
    this.code = code;
  }
}

function isWellFormedUnicode(value) {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function normalizeNewPassword(password) {
  if (typeof password !== "string") {
    throw new PasswordServiceError("PASSWORD_INVALID_TYPE", "Senha deve ser texto.");
  }
  if (!isWellFormedUnicode(password)) {
    throw new PasswordServiceError("PASSWORD_INVALID_UNICODE", "Senha contém Unicode inválido.");
  }

  const normalized = password.normalize("NFKC");
  const codePoints = [...normalized].length;
  if (codePoints < MIN_CODE_POINTS) {
    throw new PasswordServiceError("PASSWORD_TOO_SHORT", "Senha deve ter ao menos 15 caracteres.");
  }
  if (codePoints > MAX_CODE_POINTS) {
    throw new PasswordServiceError("PASSWORD_TOO_LONG", "Senha deve ter no máximo 128 caracteres.");
  }
  if (Buffer.byteLength(normalized, "utf8") > MAX_UTF8_BYTES) {
    throw new PasswordServiceError("PASSWORD_TOO_MANY_BYTES", "Senha excede o limite de 512 bytes UTF-8.");
  }

  return normalized;
}

async function hashNewPassword(password) {
  const normalized = normalizeNewPassword(password);
  return hashArgon2id(normalized);
}

async function hashArgon2id(normalized) {
  try {
    return await argon2.hash(normalized, ARGON2_OPTIONS);
  } catch {
    throw new PasswordServiceError("PASSWORD_CRYPTO_OPERATION_FAILED", "Falha na operação criptográfica.");
  }
}

function incorrectPassword() {
  return {
    authenticated: false,
    algorithm: null,
    needsRehash: false,
    canUpgrade: false,
    requiresPasswordChange: false,
  };
}

function isArgon2idHash(hash) {
  if (!ARGON2ID_HASH_RE.test(hash)) return false;
  const parts = hash.split("$");
  const parameters = Object.fromEntries(parts[3].split(",").map((entry) => entry.split("=")));
  if (Object.keys(parameters).length !== 3) return false;
  const memory = Number(parameters.m);
  const time = Number(parameters.t);
  const parallelism = Number(parameters.p);
  if (
    !Number.isSafeInteger(memory) || memory < 8 * parallelism || memory > 0xffffffff ||
    !Number.isSafeInteger(time) || time < 1 || time > 0xffffffff ||
    !Number.isSafeInteger(parallelism) || parallelism < 1 || parallelism > 0xffffff
  ) return false;
  return [parts[4], parts[5]].every((encoded, index) => {
    const decoded = Buffer.from(encoded, "base64");
    return decoded.length >= (index === 0 ? 8 : 4) &&
      decoded.toString("base64").replace(/=+$/, "") === encoded;
  });
}

async function verifyPassword(password, hash) {
  if (typeof password !== "string") {
    throw new PasswordServiceError("PASSWORD_INVALID_INPUT", "Senha apresentada inválida.");
  }
  if (typeof hash !== "string" || (!BCRYPT_HASH_RE.test(hash) && !isArgon2idHash(hash))) {
    throw new PasswordServiceError("PASSWORD_INVALID_STORED_HASH", "Hash de senha armazenado inválido.");
  }

  if (BCRYPT_HASH_RE.test(hash)) {
    try {
      if (!(await bcrypt.compare(password, hash))) return incorrectPassword();
      const requiresPasswordChange =
        Buffer.byteLength(password, "utf8") >= BCRYPT_MAX_UTF8_BYTES ||
        !isWellFormedUnicode(password);
      return {
        authenticated: true,
        algorithm: "bcrypt",
        needsRehash: false,
        canUpgrade: !requiresPasswordChange,
        requiresPasswordChange,
      };
    } catch {
      throw new PasswordServiceError("PASSWORD_CRYPTO_OPERATION_FAILED", "Falha na operação criptográfica.");
    }
  }

  if (!isWellFormedUnicode(password)) {
    throw new PasswordServiceError("PASSWORD_INVALID_UNICODE", "Senha contém Unicode inválido.");
  }
  let needsRehash;
  try {
    needsRehash = argon2.needsRehash(hash, ARGON2_OPTIONS);
  } catch {
    throw new PasswordServiceError("PASSWORD_INVALID_STORED_HASH", "Hash de senha armazenado inválido.");
  }
  try {
    if (!(await argon2.verify(hash, password.normalize("NFKC")))) return incorrectPassword();
  } catch {
    throw new PasswordServiceError("PASSWORD_CRYPTO_OPERATION_FAILED", "Falha na operação criptográfica.");
  }
  return {
    authenticated: true,
    algorithm: "argon2id",
    needsRehash,
    canUpgrade: false,
    requiresPasswordChange: false,
  };
}

// Recheck the legacy hash: callers cannot bypass the 72-byte bridge by supplying metadata.
async function upgradeLegacyPasswordHash(password, legacyHash) {
  const result = await verifyPassword(password, legacyHash);
  if (result.algorithm !== "bcrypt" || !result.authenticated || !result.canUpgrade) {
    throw new PasswordServiceError("PASSWORD_LEGACY_UPGRADE_DENIED", "Senha legada não pode ser migrada automaticamente.");
  }
  return hashArgon2id(password.normalize("NFKC"));
}

module.exports = {
  PasswordServiceError,
  normalizeNewPassword,
  hashNewPassword,
  verifyPassword,
  upgradeLegacyPasswordHash,
};
