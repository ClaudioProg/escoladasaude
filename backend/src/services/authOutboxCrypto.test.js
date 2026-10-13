"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { inspect } = require("node:util");
const { createAuthOutboxCrypto, AuthOutboxCryptoError } = require("./authOutboxCrypto");
const id = n => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
const context = extra => ({ mensagemId: id(1), desafioId: id(2), finalidade: "confirmacao", emailDestino: "synthetic@example.invalid", ...extra });
const config = () => ({ activeKeyId: "aes1", keys: [{ keyId: "aes1", secret: Buffer.alloc(32, 19) }] });
const content = () => Buffer.from('{"v":1,"token":"SYNTHETIC_SECRET_CONTENT"}');
const changed = buffer => { const copy = Buffer.from(buffer); copy[copy.length - 1] ^= 1; return copy; };
function rejected(fn, code) {
  assert.throws(fn, error => {
    assert.ok(error instanceof AuthOutboxCryptoError); assert.equal(error.code, code);
    assert.equal(error.message, code); assert.equal(error.cause, undefined);
    assert.doesNotMatch(inspect(error), /SYNTHETIC_SECRET_CONTENT|synthetic@example|aes1/);
    return true;
  });
}

test("crypto: AES-256-GCM real, nonce 12/tag 16, versao e conteudo somente autenticado", () => {
  const service = createAuthOutboxCrypto(config()); const clear = content();
  const envelope = service.cifrar(context(), clear);
  assert.equal(envelope.nonce.length, 12); assert.equal(envelope.authTag.length, 16);
  assert.equal(envelope.keyId, "aes1"); assert.equal(envelope.conteudoCifrado[0], 1);
  assert.equal(envelope.conteudoCifrado.includes(clear), false);
  assert.deepEqual(service.decifrar(context(), envelope), clear);
  assert.deepEqual(clear, content()); assert.ok(Object.isFrozen(service));
});

test("crypto: interopera com node:crypto independente e AAD JSON canonica", () => {
  const cfg = config(); const service = createAuthOutboxCrypto(cfg); const envelope = service.cifrar(context(), content());
  const decipher = crypto.createDecipheriv("aes-256-gcm", cfg.keys[0].secret, envelope.nonce, { authTagLength: 16 });
  decipher.setAAD(Buffer.from(JSON.stringify(["escola:v3:auth-outbox:aad:v1", id(1), id(2), "confirmacao", "synthetic@example.invalid"])));
  decipher.setAuthTag(envelope.authTag);
  assert.deepEqual(Buffer.concat([decipher.update(envelope.conteudoCifrado.subarray(1)), decipher.final()]), content());
});

for (const field of ["conteudoCifrado", "nonce", "authTag"]) {
  test("crypto: adulteracao de " + field + " falha sem plaintext parcial", () => {
    const s = createAuthOutboxCrypto(config()); const e = s.cifrar(context(), content());
    rejected(() => s.decifrar(context(), { ...e, [field]: changed(e[field]) }), "AUTH_OUTBOX_CRYPTO_DECIFRAGEM_FALHOU");
  });
}
for (const [field, value] of [["mensagemId", id(3)], ["desafioId", id(4)], ["finalidade", "alteracao"],
  ["emailDestino", "other@example.invalid"], ["emailDestino", "SYNTHETIC@example.invalid"]]) {
  test("crypto: AAD divergente - " + field + "=" + value, () => {
    const s = createAuthOutboxCrypto(config()); const e = s.cifrar(context(), content());
    rejected(() => s.decifrar(context({ [field]: value }), e), "AUTH_OUTBOX_CRYPTO_DECIFRAGEM_FALHOU");
  });
}
let envelopeCase = 0;
for (const transform of [e => ({ ...e, keyId: "absent" }), e => ({ ...e, authTag: Buffer.alloc(15) }),
  e => ({ ...e, nonce: Buffer.alloc(11) }), e => ({ ...e, conteudoCifrado: Buffer.from([2, 1]) }),
  e => ({ ...e, conteudoCifrado: Buffer.from([1]) }), e => ({ ...e, extra: "unexpected" }),
  e => ({ ...e, authTag: null }), e => ({ ...e, keyId: "aes1\n" })]) {
  test("crypto: envelope incompleto ou versao nao admitida " + ++envelopeCase, () => {
    const s = createAuthOutboxCrypto(config()); const e = s.cifrar(context(), content());
    rejected(() => s.decifrar(context(), transform(e)), "AUTH_OUTBOX_CRYPTO_DECIFRAGEM_FALHOU");
  });
}

test("crypto: leitura de chave anterior explicitamente configurada e nova chave ativa", () => {
  const old = config(); const e = createAuthOutboxCrypto(old).cifrar(context(), content());
  const rotated = { activeKeyId: "aes2", keys: [...old.keys, { keyId: "aes2", secret: Buffer.alloc(32, 23) }] };
  const reader = createAuthOutboxCrypto(rotated);
  assert.deepEqual(reader.decifrar(context(), e), content());
  assert.equal(reader.cifrar(context(), content()).keyId, "aes2");
  rejected(() => createAuthOutboxCrypto({ activeKeyId: "aes2", keys: rotated.keys.slice(1) }).decifrar(context(), e), "AUTH_OUTBOX_CRYPTO_DECIFRAGEM_FALHOU");
  const wrong = config(); wrong.keys[0].secret.fill(33);
  rejected(() => createAuthOutboxCrypto(wrong).decifrar(context(), e), "AUTH_OUTBOX_CRYPTO_DECIFRAGEM_FALHOU");
});

test("crypto: configuracao copiada, imune a mutacao externa posterior", () => {
  const cfg = config(); const s = createAuthOutboxCrypto(cfg); const e = s.cifrar(context(), content());
  cfg.activeKeyId = "other"; cfg.keys[0].secret.fill(0); cfg.keys.length = 0;
  assert.deepEqual(s.decifrar(context(), e), content()); assert.equal(s.cifrar(context(), content()).keyId, "aes1");
});

let configCase = 0;
for (const bad of [undefined, {}, { activeKeyId: "missing", keys: [] },
  { activeKeyId: "missing", keys: config().keys }, { ...config(), extra: true },
  { activeKeyId: "aes1\n", keys: config().keys },
  { activeKeyId: "aes1", keys: [{ keyId: "aes1", secret: Buffer.alloc(31) }] },
  { activeKeyId: "aes1", keys: [{ keyId: "aes1", secret: Buffer.alloc(33) }] },
  { activeKeyId: "aes1", keys: [{ keyId: "aes1", secret: "0".repeat(32) }] },
  { activeKeyId: "aes1", keys: [config().keys[0], config().keys[0]] },
  { activeKeyId: "AES1", keys: config().keys },
  { activeKeyId: "aes1", keys: [{ ...config().keys[0], unknown: true }] }]) {
  test("crypto: configura invalida " + ++configCase, () => rejected(() => createAuthOutboxCrypto(bad), "AUTH_OUTBOX_CRYPTO_CONFIG_INVALIDA"));
}

test("crypto: rejeita configuracao com accessor sem executa-lo", () => {
  const cfg = { keys: config().keys }; Object.defineProperty(cfg, "activeKeyId", { enumerable: true, get() { assert.fail("Getter proibido"); } });
  rejected(() => createAuthOutboxCrypto(cfg), "AUTH_OUTBOX_CRYPTO_CONFIG_INVALIDA");
});
let identityCase = 0;
for (const bad of [null, {}, context({ mensagemId: id(1) + "\n" }), context({ finalidade: "unknown" }),
  context({ emailDestino: "two@example.invalid,other@example.invalid" }), context({ emailDestino: "one@example.invalid\n" }),
  { ...context(), extra: true }]) {
  test("crypto: identidade malformada " + ++identityCase, () => rejected(() => createAuthOutboxCrypto(config()).cifrar(bad, content()), "AUTH_OUTBOX_CRYPTO_IDENTIDADE_INVALIDA"));
}
for (const bad of ["secret", null, Buffer.alloc(0), Buffer.alloc(65537)]) {
  test("crypto: somente Buffer nao vazio limitado a 64KiB - " + (bad?.length ?? "null"), () => rejected(() => createAuthOutboxCrypto(config()).cifrar(context(), bad), "AUTH_OUTBOX_CRYPTO_CONTEUDO_INVALIDO"));
}

test("crypto: RNG criptografico chamado por mensagem sem nonce caller-supplied", t => {
  const original = crypto.randomBytes; const calls = [];
  t.mock.method(crypto, "randomBytes", size => { calls.push(size); return original(size); });
  const s = createAuthOutboxCrypto(config()); const seen = new Set();
  for (let i = 0; i < 32; i++) seen.add(s.cifrar(context(), content()).nonce.toString("hex"));
  assert.equal(seen.size, 32); assert.deepEqual(calls, Array(32).fill(12));
});

test("crypto: falha RNG/cipher sanitizada, sem defaults de segredo", t => {
  const s = createAuthOutboxCrypto(config());
  t.mock.method(crypto, "randomBytes", () => { throw new Error("SYNTHETIC_SECRET_CONTENT synthetic@example.invalid"); });
  rejected(() => s.cifrar(context(), content()), "AUTH_OUTBOX_CRYPTO_FALHOU");
});


test("crypto: UUIDs normalizados e ordem das propriedades nao alteram AAD", () => {
  const s = createAuthOutboxCrypto(config()); const uuid = "abcdef01-abcd-4abc-8abc-abcdef012345";
  const e = s.cifrar(context({ mensagemId: uuid }), content());
  const reordered = { emailDestino: "synthetic@example.invalid", finalidade: "confirmacao", desafioId: id(2), mensagemId: uuid.toUpperCase() };
  assert.deepEqual(s.decifrar(reordered, e), content());
});
