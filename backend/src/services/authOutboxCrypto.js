"use strict";

const crypto = require("node:crypto");
const VERSION = 1;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PURPOSES = ["confirmacao", "alteracao", "recuperacao"];
const MAX_CONTENT_BYTES = 65536;

class AuthOutboxCryptoError extends Error {
  constructor(code) { super(code); this.name = "AuthOutboxCryptoError"; this.code = code; }
}
function fail(code) { throw new AuthOutboxCryptoError(code); }
function shape(value, keys) {
  return value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype &&
    Reflect.ownKeys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k)) &&
    Reflect.ownKeys(value).every(k => keys.includes(k) && Object.hasOwn(Object.getOwnPropertyDescriptor(value, k), "value"));
}
function keyId(value) {
  return typeof value === "string" && value.length >= 1 && value.length <= 64 && !/[^a-z0-9_-]/.test(value) && /^[a-z0-9]/.test(value);
}
function uuid(value) { return typeof value === "string" && value.length === 36 && UUID.test(value); }
function aad(context) {
  if (!shape(context, ["mensagemId", "desafioId", "finalidade", "emailDestino"]) ||
      !uuid(context.mensagemId) || !uuid(context.desafioId) || !PURPOSES.includes(context.finalidade) ||
      typeof context.emailDestino !== "string" || !context.emailDestino || /[\s\x00-\x1f\x7f,;<>]/.test(context.emailDestino) ||
      Buffer.byteLength(context.emailDestino) > 1024) fail("AUTH_OUTBOX_CRYPTO_IDENTIDADE_INVALIDA");
  // Array JSON evita ambiguidade de delimitadores; email e snapshot exato, sem normalizacao aqui.
  return Buffer.from(JSON.stringify(["escola:v3:auth-outbox:aad:v1", context.mensagemId.toLowerCase(),
    context.desafioId.toLowerCase(), context.finalidade, context.emailDestino]), "utf8");
}

function createAuthOutboxCrypto(config) {
  if (!shape(config, ["activeKeyId", "keys"]) || !keyId(config.activeKeyId) ||
      !Array.isArray(config.keys) || config.keys.length < 1 || config.keys.length > 16) fail("AUTH_OUTBOX_CRYPTO_CONFIG_INVALIDA");
  const keys = new Map();
  for (const entry of config.keys) {
    if (!shape(entry, ["keyId", "secret"]) || !keyId(entry.keyId) || keys.has(entry.keyId) ||
        !Buffer.isBuffer(entry.secret) || entry.secret.length !== 32) fail("AUTH_OUTBOX_CRYPTO_CONFIG_INVALIDA");
    keys.set(entry.keyId, Buffer.from(entry.secret));
  }
  const activeKeyId = config.activeKeyId;
  if (!keys.has(activeKeyId)) fail("AUTH_OUTBOX_CRYPTO_CONFIG_INVALIDA");

  function cifrar(context, content) {
    const associated = aad(context);
    if (!Buffer.isBuffer(content) || content.length < 1 || content.length > MAX_CONTENT_BYTES) fail("AUTH_OUTBOX_CRYPTO_CONTEUDO_INVALIDO");
    const clear = Buffer.from(content);
    try {
      const nonce = crypto.randomBytes(12);
      if (!Buffer.isBuffer(nonce) || nonce.length !== 12) fail("AUTH_OUTBOX_CRYPTO_FALHOU");
      const cipher = crypto.createCipheriv("aes-256-gcm", keys.get(activeKeyId), nonce, { authTagLength: 16 });
      cipher.setAAD(associated);
      const ciphertext = Buffer.concat([cipher.update(clear), cipher.final()]);
      const authTag = cipher.getAuthTag();
      // Byte 1 e versao publica do formato; versao tambem vinculada ao dominio da AAD.
      return Object.freeze({ conteudoCifrado: Buffer.concat([Buffer.from([VERSION]), ciphertext]),
        nonce, authTag, keyId: activeKeyId });
    } catch { fail("AUTH_OUTBOX_CRYPTO_FALHOU"); }
    finally { clear.fill(0); associated.fill(0); }
  }

  function decifrar(context, envelope) {
    const associated = aad(context);
    let partial;
    try {
      if (!shape(envelope, ["conteudoCifrado", "nonce", "authTag", "keyId"]) || !keyId(envelope.keyId) ||
          !keys.has(envelope.keyId) || !Buffer.isBuffer(envelope.conteudoCifrado) ||
          envelope.conteudoCifrado.length < 2 || envelope.conteudoCifrado.length > MAX_CONTENT_BYTES + 1 ||
          envelope.conteudoCifrado[0] !== VERSION || !Buffer.isBuffer(envelope.nonce) || envelope.nonce.length !== 12 ||
          !Buffer.isBuffer(envelope.authTag) || envelope.authTag.length !== 16) fail("AUTH_OUTBOX_CRYPTO_ENVELOPE_INVALIDO");
      const decipher = crypto.createDecipheriv("aes-256-gcm", keys.get(envelope.keyId), envelope.nonce, { authTagLength: 16 });
      decipher.setAAD(associated);
      decipher.setAuthTag(envelope.authTag);
      partial = decipher.update(envelope.conteudoCifrado.subarray(1));
      const final = decipher.final(); // Nenhum plaintext sai antes da autenticacao completa.
      return Buffer.concat([partial, final]);
    } catch { fail("AUTH_OUTBOX_CRYPTO_DECIFRAGEM_FALHOU"); }
    finally { partial?.fill(0); associated.fill(0); }
  }
  return Object.freeze({ cifrar, decifrar });
}

module.exports = { createAuthOutboxCrypto, AuthOutboxCryptoError };
