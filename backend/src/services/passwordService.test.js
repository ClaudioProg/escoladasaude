"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const argon2 = require("argon2");
const bcrypt = require("bcrypt");
const {
  normalizeNewPassword,
  hashNewPassword,
  verifyPassword,
  upgradeLegacyPasswordHash,
} = require("./passwordService");

test("nova senha exige entre 15 e 128 code points após NFKC", () => {
  assert.throws(() => normalizeNewPassword("a".repeat(14)), { code: "PASSWORD_TOO_SHORT" });
  assert.equal(normalizeNewPassword("a".repeat(15)), "a".repeat(15));
  assert.equal(normalizeNewPassword("a".repeat(128)), "a".repeat(128));
  assert.throws(() => normalizeNewPassword("a".repeat(129)), { code: "PASSWORD_TOO_LONG" });
  assert.throws(() => normalizeNewPassword(null), { code: "PASSWORD_INVALID_TYPE" });
  assert.throws(() => normalizeNewPassword(`${"a".repeat(14)}\ud800`), { code: "PASSWORD_INVALID_UNICODE" });
  assert.throws(() => normalizeNewPassword(`${"a".repeat(14)}\udc00`), { code: "PASSWORD_INVALID_UNICODE" });
  assert.throws(() => normalizeNewPassword(`${"a".repeat(14)}\ud800x`), { code: "PASSWORD_INVALID_UNICODE" });
});

test("limite UTF-8 inclui 512 bytes e rejeita entrada acima do limite", () => {
  const atLimit = "😀".repeat(128);
  assert.equal(Buffer.byteLength(atLimit, "utf8"), 512);
  assert.equal(normalizeNewPassword(atLimit), atLimit);
  const overLimit = "😀".repeat(129);
  assert.ok(Buffer.byteLength(overLimit, "utf8") > 512);
  assert.throws(() => normalizeNewPassword(overLimit), { code: "PASSWORD_TOO_LONG" });
});

test("espaços, acentos e emoji são preservados; somente NFKC transforma", () => {
  const password = "  frase com café 😀  ";
  assert.equal(normalizeNewPassword(password), password);
  assert.equal(normalizeNewPassword("Ｆrase com café 😀"), "Frase com café 😀");
  assert.equal(normalizeNewPassword("e\u0301".repeat(15)), "é".repeat(15));
  assert.equal(normalizeNewPassword("😀".repeat(15)), "😀".repeat(15));
  assert.throws(() => normalizeNewPassword("ﬃ".repeat(4)), { code: "PASSWORD_TOO_SHORT" });
  assert.equal(normalizeNewPassword("ﬃ".repeat(5)), "ffi".repeat(5));
  assert.throws(() => normalizeNewPassword("ﬃ".repeat(43)), { code: "PASSWORD_TOO_LONG" });
});

test("novo hash usa Argon2id aprovado, sal aleatório e verificação NFKC", async () => {
  const presented = "Ｆrase segura com emoji 😀";
  const first = await hashNewPassword(presented);
  const second = await hashNewPassword(presented);
  assert.ok(/^\$argon2id\$v=19\$m=19456,p=1,t=2\$/.test(first));
  assert.notEqual(first, second);
  assert.deepEqual(await verifyPassword("Frase segura com emoji 😀", first), {
    authenticated: true,
    algorithm: "argon2id",
    needsRehash: false,
    canUpgrade: false,
    requiresPasswordChange: false,
  });
  assert.equal((await verifyPassword("Frase segura com emoji 😃", first)).authenticated, false);
  await assert.rejects(verifyPassword(`${"a".repeat(14)}\ud800`, first), { code: "PASSWORD_INVALID_UNICODE" });
});

test("Argon2id com parâmetros anteriores indica necessidade de rehash", async () => {
  const hash = await argon2.hash("senha legada argon2id", {
    type: argon2.argon2id,
    memoryCost: 1024,
    timeCost: 1,
    parallelism: 1,
  });
  const result = await verifyPassword("senha legada argon2id", hash);
  assert.equal(result.authenticated, true);
  assert.equal(result.needsRehash, true);
});

test("bcrypt legado compara input original e pode migrar quando tem até 72 bytes", async () => {
  const password = "Ｆrase antiga";
  const hash = await bcrypt.hash(password, 4);
  const legacy2aHash = hash.replace(/^\$2b\$/, "$2a$");
  const result = await verifyPassword(password, hash);
  assert.deepEqual(result, {
    authenticated: true,
    algorithm: "bcrypt",
    needsRehash: false,
    canUpgrade: true,
    requiresPasswordChange: false,
  });
  assert.equal((await verifyPassword(password.normalize("NFKC"), hash)).authenticated, false);
  assert.equal((await verifyPassword("outra senha", hash)).authenticated, false);
  assert.equal((await verifyPassword(password, legacy2aHash)).authenticated, true);
  const migrated = await upgradeLegacyPasswordHash(password, hash);
  assert.ok(/^\$argon2id\$v=19\$m=19456,p=1,t=2\$/.test(migrated));
  assert.equal((await verifyPassword(password.normalize("NFKC"), migrated)).authenticated, true);
});

test("upgrade de bcrypt legado não exige mínimo atual, mas revalida a senha", async () => {
  const hash = await bcrypt.hash("curta", 4);
  const upgraded = await upgradeLegacyPasswordHash("curta", hash);
  assert.equal((await verifyPassword("curta", upgraded)).authenticated, true);
  await assert.rejects(upgradeLegacyPasswordHash("errada", hash), { code: "PASSWORD_LEGACY_UPGRADE_DENIED" });
});

test("bcrypt 71/72/73 bytes distingue upgrade seguro de troca obrigatória", async () => {
  for (const [length, canUpgrade] of [[71, true], [72, false], [73, false]]) {
    const password = "a".repeat(length);
    const hash = await bcrypt.hash(password, 4);
    const result = await verifyPassword(password, hash);
    assert.equal(result.authenticated, true);
    assert.equal(result.canUpgrade, canUpgrade);
    assert.equal(result.requiresPasswordChange, !canUpgrade);
    if (canUpgrade) {
      assert.equal((await verifyPassword(password, await upgradeLegacyPasswordHash(password, hash))).authenticated, true);
    } else {
      await assert.rejects(upgradeLegacyPasswordHash(password, hash), { code: "PASSWORD_LEGACY_UPGRADE_DENIED" });
    }
  }
  const unicodeAtLimit = "😀".repeat(18);
  const unicodeBeyond = "😀".repeat(19);
  assert.equal(Buffer.byteLength(unicodeAtLimit, "utf8"), 72);
  assert.equal((await verifyPassword(unicodeAtLimit, await bcrypt.hash(unicodeAtLimit, 4))).requiresPasswordChange, true);
  assert.equal((await verifyPassword(unicodeBeyond, await bcrypt.hash(unicodeBeyond, 4))).requiresPasswordChange, true);
});

test("prefixo de 72 bytes autentica no bcrypt, mas não pode ser migrado", async () => {
  const fullPassword = `${"a".repeat(72)}sufixo`;
  const prefix = fullPassword.slice(0, 72);
  const hash = await bcrypt.hash(fullPassword, 4);
  assert.equal((await verifyPassword(fullPassword, hash)).authenticated, true);
  const result = await verifyPassword(prefix, hash);
  assert.equal(result.authenticated, true);
  assert.equal(result.canUpgrade, false);
  assert.equal(result.requiresPasswordChange, true);
  await assert.rejects(upgradeLegacyPasswordHash(prefix, hash), { code: "PASSWORD_LEGACY_UPGRADE_DENIED" });
});

test("bcrypt legado aceita entrada Unicode malformada válida, mas exige troca", async () => {
  const password = `legado\ud800${"a".repeat(10)}`;
  const hash = await bcrypt.hash(password, 4);
  const result = await verifyPassword(password, hash);
  assert.equal(result.authenticated, true);
  assert.equal(result.canUpgrade, false);
  assert.equal(result.requiresPasswordChange, true);
  await assert.rejects(upgradeLegacyPasswordHash(password, hash), { code: "PASSWORD_LEGACY_UPGRADE_DENIED" });
});

test("hash desconhecido, malformado ou de outra variante Argon2 lança erro tipado", async () => {
  for (const hash of [null, undefined, "", "hash", "$2b$10$incompleto", "$argon2id$v=19$m=1,t=1,p=1$"]) {
    await assert.rejects(verifyPassword("senha de teste", hash), { code: "PASSWORD_INVALID_STORED_HASH" });
  }
  for (const type of [argon2.argon2i, argon2.argon2d]) {
    const hash = await argon2.hash("senha de teste", { type, memoryCost: 1024, timeCost: 1, parallelism: 1 });
    await assert.rejects(verifyPassword("senha de teste", hash), { code: "PASSWORD_INVALID_STORED_HASH" });
  }
  await assert.rejects(verifyPassword(null, "hash"), { code: "PASSWORD_INVALID_INPUT" });
});

test("senha incorreta retorna authenticated=false sem exception", async () => {
  const bcryptHash = await bcrypt.hash("senha correta", 4);
  const argon2Hash = await hashNewPassword("frase senha correta");
  for (const hash of [bcryptHash, argon2Hash]) {
    assert.deepEqual(await verifyPassword("senha incorreta", hash), {
      authenticated: false,
      algorithm: null,
      needsRehash: false,
      canUpgrade: false,
      requiresPasswordChange: false,
    });
  }
});

test("falha da biblioteca vira erro operacional sem expor entrada ou hash", async () => {
  const hash = await hashNewPassword("frase senha de teste");
  const originalVerify = argon2.verify;
  argon2.verify = async () => { throw new Error("sentinela interna"); };
  try {
    await assert.rejects(verifyPassword("frase senha de teste", hash), (error) => {
      assert.equal(error.code, "PASSWORD_CRYPTO_OPERATION_FAILED");
      assert.equal(error.message.includes("frase senha de teste"), false);
      assert.equal(error.message.includes(hash), false);
      assert.equal(error.message.includes("sentinela"), false);
      return true;
    });
  } finally {
    argon2.verify = originalVerify;
  }
});
