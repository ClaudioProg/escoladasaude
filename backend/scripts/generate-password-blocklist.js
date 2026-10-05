"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const SOURCE_SHA256 = "0c6d3eec0406f02a47f3b32ded1548db9d02440d6243b216bd952724bbec6af7";
const FINAL_SHA256 = "48712b36836b4869643b8fa6c5f5358a81b05b01bd0a3655b46aa2d169bc28e9";
const EXPECTED_SOURCE_LINES = 303872;
const EXPECTED_FINAL_COUNT = 2097;
const OUTPUT = path.resolve(__dirname, "../src/security/password-common-2097.txt");

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
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

function deriveBlocklist(source) {
  if (arguments.length !== 1 || !Buffer.isBuffer(source)) {
    throw new Error("A transformação exige somente um Buffer de fonte.");
  }
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const metrics = { lines: 0, tooShort: 0, tooLong: 0, tooManyBytes: 0, invalidUnicode: 0, duplicates: 0 };
  const entries = [];
  const seen = new Set();

  function accept(line) {
    metrics.lines += 1;
    let value;
    try {
      value = decoder.decode(line);
    } catch {
      metrics.invalidUnicode += 1;
      return;
    }
    if (!isWellFormedUnicode(value)) {
      metrics.invalidUnicode += 1;
      return;
    }
    const normalized = value.normalize("NFKC");
    const codePoints = [...normalized].length;
    if (codePoints < 15) { metrics.tooShort += 1; return; }
    if (codePoints > 128) { metrics.tooLong += 1; return; }
    if (Buffer.byteLength(normalized, "utf8") > 512) { metrics.tooManyBytes += 1; return; }
    const key = normalized.toLowerCase();
    if (!key || seen.has(key)) { metrics.duplicates += 1; return; }
    seen.add(key);
    entries.push(key);
  }

  let start = 0;
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== 10) continue;
    const end = index > start && source[index - 1] === 13 ? index - 1 : index;
    accept(source.subarray(start, end));
    start = index + 1;
  }
  if (start < source.length) {
    const end = source[source.length - 1] === 13 ? source.length - 1 : source.length;
    accept(source.subarray(start, end));
  }

  const output = Buffer.from(`${entries.join("\n")}\n`, "utf8");
  return { output, metrics, entries: entries.length };
}

function writeCanonicalBlocklist(sourcePath) {
  const source = fs.readFileSync(sourcePath);
  const sourceSha256 = sha256(source);
  if (sourceSha256 !== SOURCE_SHA256) throw new Error("SHA-256 da fonte divergente.");
  let sourceLines = 0;
  for (const byte of source) {
    if (byte === 10) sourceLines += 1;
  }
  if (source.length > 0 && source.at(-1) !== 10) sourceLines += 1;
  if (sourceLines !== EXPECTED_SOURCE_LINES) throw new Error("Quantidade de linhas da fonte divergente.");
  const result = deriveBlocklist(source);
  if (result.entries !== EXPECTED_FINAL_COUNT) throw new Error("Quantidade de entradas elegíveis divergente.");
  const outputSha256 = sha256(result.output);
  if (outputSha256 !== FINAL_SHA256) throw new Error("SHA-256 da blocklist gerada divergente.");
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, result.output);
  return { ...result, sourceSha256, outputSha256 };
}

if (require.main === module) {
  const sourcePath = process.argv[2];
  if (!sourcePath || process.argv.length !== 3) {
    process.stderr.write("Uso: node scripts/generate-password-blocklist.js <arquivo-fonte-local>\n");
    process.exitCode = 1;
  } else {
    try {
      const result = writeCanonicalBlocklist(sourcePath);
      process.stdout.write(JSON.stringify({ sourceSha256: result.sourceSha256, outputSha256: result.outputSha256, ...result.metrics, entries: result.entries }) + "\n");
    } catch (error) {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    }
  }
}

module.exports = { deriveBlocklist, sha256 };
