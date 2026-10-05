"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { isCommonPassword, loadBlocklist, parseBlocklist } = require("./passwordBlocklist");
const { createNewPasswordHash } = require("./passwordService");

const file = path.resolve(__dirname, "../security/password-common-2097.txt");
const bytes = fs.readFileSync(file);
const entries = bytes.toString("utf8").trimEnd().split("\n");

test("blocklist versionada tem 2.097 chaves canonicas elegiveis e distintas", () => {
  assert.equal(entries.length, 2097);
  assert.equal(new Set(entries).size, 2097);
  assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), "48712b36836b4869643b8fa6c5f5358a81b05b01bd0a3655b46aa2d169bc28e9");
  assert.equal(bytes.includes(13), false);
  assert.equal(bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), false);
  assert.equal(bytes.at(-1), 10);
  assert.notEqual(bytes.at(-2), 10);
  assert.equal(bytes.filter((value) => value === 10).length, 2097);
  for (const entry of entries) {
    assert.equal(entry, entry.normalize("NFKC").toLowerCase());
    assert.ok([...entry].length >= 15 && [...entry].length <= 128);
    assert.ok(Buffer.byteLength(entry, "utf8") <= 512);
  }
});

test("blocklist bloqueia entrada exata, caixa e equivalente NFKC", async () => {
  const entry = entries.find((value) => /[a-z]/.test(value));
  assert.ok(entry);
  assert.equal(isCommonPassword(entry), true);
  assert.equal(isCommonPassword(entry.toUpperCase()), true);
  const letter = /[a-z]/.exec(entry)[0];
  const compatibilityVariant = entry.replace(letter, String.fromCharCode(letter.charCodeAt(0) + 0xfee0));
  await assert.rejects(createNewPasswordHash(compatibilityVariant, {}), { code: "PASSWORD_TOO_COMMON" });
});

test("blocklist nao apaga pontuacao e entrada ausente segue", () => {
  const withPunctuation = `${entries[0]}!`;
  assert.equal(isCommonPassword(entries[0]), true);
  assert.equal(isCommonPassword(withPunctuation), false);
  assert.equal(isCommonPassword("frase nova com palavras distantes 😀"), false);
});

test("consultas repetidas usam lista carregada sem reler arquivo", () => {
  const original = fs.readFileSync;
  fs.readFileSync = () => { throw new Error("leitura inesperada"); };
  try {
    assert.equal(isCommonPassword(entries[0]), true);
    assert.equal(isCommonPassword(entries[1]), true);
  } finally {
    fs.readFileSync = original;
  }
});

test("arquivo ausente, alterado e estruturalmente invalido falham fechado", () => {
  assert.throws(() => loadBlocklist(path.join(__dirname, "arquivo-inexistente.txt")));
  const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
  assert.throws(() => parseBlocklist(Buffer.from("curta\n"), 1, hash(Buffer.from("curta\n"))));
  assert.throws(() => parseBlocklist(Buffer.from("frase longa de teste\nfrase longa de teste\n"), 2,
    hash(Buffer.from("frase longa de teste\nfrase longa de teste\n"))));
  assert.throws(() => parseBlocklist(Buffer.from([0xff, 0x0a]), 1, hash(Buffer.from([0xff, 0x0a]))));
  assert.throws(() => parseBlocklist(bytes, 2097, "0".repeat(64)), /checksum/);
});
