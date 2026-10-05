"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const FILE = path.resolve(__dirname, "../security/password-common-2097.txt");
const EXPECTED_COUNT = 2097;
const EXPECTED_SHA256 = "48712b36836b4869643b8fa6c5f5358a81b05b01bd0a3655b46aa2d169bc28e9";

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

function parseBlocklist(bytes, expectedCount = EXPECTED_COUNT, expectedSha256 = EXPECTED_SHA256) {
  const actualSha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  if (actualSha256 !== expectedSha256) throw new Error("Blocklist local com checksum divergente.");
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (!text.endsWith("\n") || text.includes("\r")) throw new Error("Formato da blocklist local invalido.");
  const entries = text.slice(0, -1).split("\n");
  if (entries.length !== expectedCount) throw new Error("Quantidade da blocklist local invalida.");
  const values = new Set();
  for (const entry of entries) {
    if (!isWellFormedUnicode(entry) || entry !== entry.normalize("NFKC").toLowerCase()) {
      throw new Error("Entrada da blocklist local invalida.");
    }
    const codePoints = [...entry].length;
    if (codePoints < 15 || codePoints > 128 || Buffer.byteLength(entry, "utf8") > 512 || values.has(entry)) {
      throw new Error("Entrada da blocklist local invalida.");
    }
    values.add(entry);
  }
  return values;
}

function loadBlocklist(filePath = FILE, expectedCount = EXPECTED_COUNT, expectedSha256 = EXPECTED_SHA256) {
  return parseBlocklist(fs.readFileSync(filePath), expectedCount, expectedSha256);
}

const BLOCKLIST = loadBlocklist();

function isCommonPassword(normalizedPassword) {
  return BLOCKLIST.has(normalizedPassword.toLowerCase());
}

module.exports = { isCommonPassword, loadBlocklist, parseBlocklist };
