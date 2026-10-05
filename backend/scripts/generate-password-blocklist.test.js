"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const vm = require("node:vm");
const generator = require("./generate-password-blocklist");
const { deriveBlocklist, sha256 } = generator;
const SOURCE_SHA256 = "0c6d3eec0406f02a47f3b32ded1548db9d02440d6243b216bd952724bbec6af7";
const FINAL_SHA256 = "48712b36836b4869643b8fa6c5f5358a81b05b01bd0a3655b46aa2d169bc28e9";
const scriptPath = path.join(__dirname, "generate-password-blocklist.js");
const script = fs.readFileSync(scriptPath, "utf8");
const canonicalBytes = fs.readFileSync(path.resolve(__dirname, "../src/security/password-common-2097.txt"));
const canonicalEntries = canonicalBytes.toString("utf8").slice(0, -1).split("\n");

function fixtureSource(entries = canonicalEntries) {
  return Buffer.from(`${entries.join("\n")}\n${"x\n".repeat(303872 - entries.length)}`);
}

// A fonte original não está no repositório. Somente seu primeiro digest pode
// ser simulado neste harness; contagens e SHA final são calculados de verdade.
function runCli(source, { simulateSourceHash = false, failTransformation = false, extraArgs = [] } = {}) {
  const existing = Buffer.from([0x00, 0xff, 0x0d, 0x0a, 0x41]);
  const state = { destination: Buffer.from(existing), writes: 0, mkdirs: 0, stdout: "", stderr: "" };
  let hashCalls = 0;
  const fakeFs = {
    readFileSync(file) { assert.equal(file, "fixture-source"); return source; },
    mkdirSync() { state.mkdirs += 1; },
    writeFileSync(file, bytes) {
      assert.equal(file, path.resolve(__dirname, "../src/security/password-common-2097.txt"));
      state.writes += 1;
      state.destination = Buffer.from(bytes);
    },
  };
  const fakeCrypto = {
    createHash(algorithm) {
      const hash = crypto.createHash(algorithm);
      return {
        update(bytes) { hash.update(bytes); return this; },
        digest(encoding) {
          hashCalls += 1;
          const actual = hash.digest(encoding);
          return simulateSourceHash && hashCalls === 1 ? SOURCE_SHA256 : actual;
        },
      };
    },
  };
  const moduleObject = { exports: {} };
  const fakeRequire = (name) => {
    if (name === "node:fs") return fakeFs;
    if (name === "node:path") return path;
    if (name === "node:crypto") return fakeCrypto;
    throw new Error(`Import inesperado: ${name}`);
  };
  fakeRequire.main = moduleObject;
  const fakeProcess = {
    argv: ["node", scriptPath, "fixture-source", ...extraArgs],
    stdout: { write(value) { state.stdout += value; } },
    stderr: { write(value) { state.stderr += value; } },
  };
  vm.runInNewContext(script, {
    require: fakeRequire, module: moduleObject, __dirname, Buffer, process: fakeProcess,
    TextDecoder: failTransformation ? class { constructor() { throw new Error("Falha de transformação simulada."); } } : TextDecoder,
  }, { filename: scriptPath, timeout: 10000 });
  return { ...state, existing, exitCode: fakeProcess.exitCode || 0 };
}

function assertUnchanged(result, errorPattern) {
  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, errorPattern);
  assert.equal(result.writes, 0);
  assert.equal(result.mkdirs, 0);
  assert.deepEqual(result.destination, result.existing);
}

test("helper puro transforma fixture, preserva ordem, Unicode, pontuacao e LF", () => {
  const source = Buffer.concat([
    Buffer.from("FRASE-SENHA-NOVA-01\ncurta\n"),
    Buffer.from(`${"a".repeat(129)}\n${"😀".repeat(128)}\n`),
    Buffer.from("Ｆrase-Senha-Nova-01\n"), Buffer.from([0xff, 0x0a]),
    Buffer.from("Outra frase de teste\n"),
  ]);
  const first = deriveBlocklist(source);
  assert.equal(first.output.toString("utf8"), `frase-senha-nova-01\n${"😀".repeat(128)}\noutra frase de teste\n`);
  assert.equal(sha256(first.output), sha256(deriveBlocklist(source).output));
  assert.equal(first.entries, 3);
  assert.equal(first.output.at(-1), 10);
  assert.notEqual(first.output.at(-2), 10);
  assert.equal(first.output.includes(13), false);
  assert.equal(first.output.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), false);
  const crlfSource = Buffer.from(Array.from(source).flatMap((byte) => byte === 10 ? [13, 10] : [byte]));
  assert.deepEqual(deriveBlocklist(crlfSource).output, first.output);
  assert.deepEqual(first.metrics, { lines: 7, tooShort: 1, tooLong: 1, tooManyBytes: 0, invalidUnicode: 1, duplicates: 1 });
  assert.equal(Buffer.byteLength("😀".repeat(128), "utf8"), 512);
  const originalWrite = fs.writeFileSync;
  fs.writeFileSync = () => { throw new Error("Helper puro não pode escrever."); };
  try { assert.deepEqual(deriveBlocklist(source).output, first.output); }
  finally { fs.writeFileSync = originalWrite; }
});

test("API publica nao exporta writer e rejeita expectativas no helper", () => {
  assert.deepEqual(Object.keys(generator).sort(), ["deriveBlocklist", "sha256"]);
  for (const key of ["expectedSha", "expectedSourceSha", "expectedFinalSha", "expectedCount", "expectedLines",
    "expectedSha256", "expectedOutputSha256", "expectedEntries", "unknown"]) {
    assert.throws(() => deriveBlocklist(Buffer.from("frase longa de teste\n"), { [key]: 1 }), /somente um Buffer/);
  }
  assert.throws(() => deriveBlocklist("frase longa de teste"), /somente um Buffer/);
});

test("CLI rejeita tentativas de fornecer expectativas alternativas", () => {
  assertUnchanged(runCli(Buffer.from("fixture\n"), {
    extraArgs: [JSON.stringify({ expectedSourceSha: "x", expectedFinalSha: "x", expectedCount: 1, expectedLines: 1 })],
  }), /Uso:/);
});

test("SHA fonte divergente preserva destino com zero writes", () => {
  assertUnchanged(runCli(fixtureSource()), /SHA-256 da fonte divergente/);
});

test("linhas fonte divergentes preservam destino com zero writes", () => {
  assertUnchanged(runCli(fixtureSource().subarray(0, -2), { simulateSourceHash: true }), /linhas da fonte divergente/);
});

test("total final divergente preserva destino com zero writes", () => {
  assertUnchanged(runCli(fixtureSource(canonicalEntries.slice(0, -1)), { simulateSourceHash: true }), /entradas elegíveis divergente/);
});

test("SHA final divergente preserva destino com zero writes", () => {
  const altered = [...canonicalEntries];
  altered[0] = "frase sintetica divergente";
  assertUnchanged(runCli(fixtureSource(altered), { simulateSourceHash: true }), /SHA-256 da blocklist gerada divergente/);
});

test("falha de transformacao preserva destino com zero writes", () => {
  assertUnchanged(runCli(fixtureSource(), { simulateSourceHash: true, failTransformation: true }), /Falha de transformação simulada/);
});

test("CLI com gates satisfeitos grava uma vez os bytes canonicos LF-only", () => {
  const result = runCli(fixtureSource(), { simulateSourceHash: true });
  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.equal(result.writes, 1);
  assert.deepEqual(result.destination, canonicalBytes);
  assert.equal(sha256(result.destination), FINAL_SHA256);
  assert.equal(result.destination.includes(13), false);
  assert.equal(result.destination.at(-1), 10);
  assert.notEqual(result.destination.at(-2), 10);
  const metrics = JSON.parse(result.stdout);
  assert.equal(metrics.lines, 303872);
  assert.equal(metrics.entries, 2097);
  assert.equal(metrics.sourceSha256, SOURCE_SHA256);
  assert.equal(metrics.outputSha256, FINAL_SHA256);
});
