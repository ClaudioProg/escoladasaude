"use strict";

const MIN_CODE_POINTS = 15;
const MAX_CODE_POINTS = 128;
const MAX_UTF8_BYTES = 512;

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

module.exports = { PasswordServiceError, isWellFormedUnicode, normalizeNewPassword };
