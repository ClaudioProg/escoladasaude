"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createHmac } = require("node:crypto");
const { normalizeQuotaIp, createQuotaIpHasher, subjectLockKey } = require("./authQuotaIp");

// Somente IPs de documentacao e segredos sinteticos de teste.
const secret = () => Buffer.alloc(32, 7);
const config = () => ({ activeKeyId: "k1", keys: [{ keyId: "k1", secret: secret() }] });

for (const [input, expected] of [
  ["192.0.2.1", "192.0.2.1"],
  ["2001:DB8::1", "2001:0db8:0000:0000:0000:0000:0000:0001"],
  ["2001:0db8:0:0:0:0:0:1", "2001:0db8:0000:0000:0000:0000:0000:0001"],
  ["::", "0000:0000:0000:0000:0000:0000:0000:0000"],
  ["::1", "0000:0000:0000:0000:0000:0000:0000:0001"],
  ["::ffff:192.0.2.1", "192.0.2.1"], ["::FFFF:c000:201", "192.0.2.1"],
  ["2001:db8::192.0.2.1", "2001:0db8:0000:0000:0000:0000:c000:0201"],
]) test("IP: normalizacao literal " + input, () => assert.equal(normalizeQuotaIp(input), expected));

for (const input of [null, undefined, 123, {}, "", " 192.0.2.1", "192.0.2.1 ",
  "192.0.2.1, 198.51.100.1", "192.0.2.1:443", "[2001:db8::1]", "[::1]:443", "fe80::1%eth0",
  "192.0.2.1/24", "192.000.2.1", "999.0.2.1", "::ffff:192.000.2.1", "1::2::3", "2001:db8::1\n",
  "hostname.invalid", "a".repeat(46)]) {
  test("IP: rejeita entrada ambigua/invalida " + JSON.stringify(input), () =>
    assert.throws(() => normalizeQuotaIp(input), { code: "AUTH_QUOTA_IP_INVALIDO" }));
}

test("HMAC: SHA-256 com segredo injetado e separacao de dominio", () => {
  const hasher = createQuotaIpHasher(config());
  const identity = hasher.identify("192.0.2.1");
  const expected = createHmac("sha256", secret()).update("escola:v3:auth-quota:ip:v1\0" + "192.0.2.1").digest();
  assert.equal(identity.current.keyId, "k1");
  assert.equal(identity.current.digest.length, 32);
  assert.deepEqual(identity.current.digest, expected);
  assert.equal(identity.lockKey, subjectLockKey("ip:192.0.2.1"));
  assert.deepEqual(identity, hasher.identify("::ffff:c000:201"));
});

test("HMAC: IPv6 equivalente conserva digest e lock", () => {
  const hasher = createQuotaIpHasher(config());
  assert.deepEqual(hasher.identify("2001:DB8::1"), hasher.identify("2001:0db8:0:0:0:0:0:1"));
  assert.notDeepEqual(hasher.identify("192.0.2.1").current.digest, hasher.identify("192.0.2.2").current.digest);
});

test("HMAC: versoes antigas + ativa; ordem de configuracao nao altera identidade", () => {
  const keys = [{ keyId: "k2", secret: Buffer.alloc(32, 9) }, ...config().keys];
  const a = createQuotaIpHasher({ activeKeyId: "k2", keys }).identify("192.0.2.1");
  const b = createQuotaIpHasher({ activeKeyId: "k2", keys: [...keys].reverse() }).identify("192.0.2.1");
  assert.deepEqual(a, b);
  assert.deepEqual(a.candidates.map(key => key.keyId), ["k1", "k2"]);
  assert.notDeepEqual(a.candidates[0].digest, a.current.digest);
  assert.equal(a.lockKey, createQuotaIpHasher(config()).identify("192.0.2.1").lockKey);
});

test("HMAC: captura buffers e configuracao; mutacao externa nao troca segredo", () => {
  const input = config();
  const hasher = createQuotaIpHasher(input);
  const before = hasher.identify("192.0.2.1");
  input.keys[0].secret.fill(0); input.keys[0].keyId = "changed"; input.activeKeyId = "changed";
  assert.deepEqual(hasher.identify("192.0.2.1"), before);
  before.current.digest.fill(0);
  assert.notDeepEqual(hasher.identify("192.0.2.1").current.digest, before.current.digest);
});

for (const [label, input] of [
  ["ausente", undefined], ["null", null], ["vazia", {}],
  ["sem segredo", { activeKeyId: "k1", keys: [{ keyId: "k1" }] }],
  ["segredo string", { activeKeyId: "k1", keys: [{ keyId: "k1", secret: "x".repeat(32) }] }],
  ["segredo curto", { activeKeyId: "k1", keys: [{ keyId: "k1", secret: Buffer.alloc(31) }] }],
  ["chaves vazias", { activeKeyId: "k1", keys: [] }],
  ["ativa desconhecida", { ...config(), activeKeyId: "missing" }],
  ["identificador invalido", { activeKeyId: "K1", keys: [{ keyId: "K1", secret: secret() }] }],
  ["identificador longo", { activeKeyId: "x".repeat(65), keys: [{ keyId: "x".repeat(65), secret: secret() }] }],
  ["duplicada", { ...config(), keys: [...config().keys, ...config().keys] }],
  ["campo extra", { ...config(), secret: secret() }],
  ["campo extra da chave", { activeKeyId: "k1", keys: [{ ...config().keys[0], env: "ignored" }] }],
  ["muitas versoes", { activeKeyId: "k0", keys: Array.from({ length: 17 }, (_, n) => ({ keyId: "k" + n, secret: secret() })) }],
]) test("HMAC: rejeita configuracao " + label, () =>
  assert.throws(() => createQuotaIpHasher(input), { code: "AUTH_QUOTA_HMAC_CONFIG_INVALIDA" }));

for (const suffix of ["\n", "\r\n", "\u2028", "\u2029"]) {
  test("HMAC: key_id rejeita terminador final " + JSON.stringify(suffix), () => {
    const keyId = "k1" + suffix;
    assert.throws(() => createQuotaIpHasher({ activeKeyId: keyId, keys: [{ keyId, secret: secret() }] }),
      { code: "AUTH_QUOTA_HMAC_CONFIG_INVALIDA" });
  });
}
