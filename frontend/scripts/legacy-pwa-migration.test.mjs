import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(scriptsDir, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(frontendDir, relativePath), "utf8");
}

test("kill-switch ocupa o URL e o escopo históricos sem recriar cache", () => {
  const source = read("public/sw.js");

  assert.match(source, /self\.skipWaiting\(\)/);
  assert.match(source, /self\.clients\.claim\(\)/);
  assert.match(source, /client\.navigate\(UPDATE_URL\)/);
  assert.match(source, /workbox-precache-/);
  assert.match(source, /name === "api-cache"/);
  assert.doesNotMatch(source, /addEventListener\("fetch"/);
});

test("recuperação automática mantém a sessão oficial e remove somente cache técnico", () => {
  const source = read("public/atualizar.html");

  assert.match(source, /const STORAGE_KEYS_TO_REMOVE = \["escola_build_version"\]/);
  assert.doesNotMatch(source, /localStorage\.removeItem\("token"\)/);
  assert.doesNotMatch(source, /localStorage\.removeItem\("usuario"\)/);
  assert.doesNotMatch(source, /localStorage\.removeItem\("perfil"\)/);
  assert.match(source, /navigator\.serviceWorker\.getRegistrations\(\)/);
  assert.match(source, /params\.has\("origem"\)/);
});

test("sw.js não é reescrito como SPA e sempre é buscado sem cache HTTP", () => {
  const config = JSON.parse(read("vercel.json"));
  const swHeaders = config.headers.find((entry) => entry.source === "/sw.js");

  assert.ok(swHeaders);
  assert.equal(
    swHeaders.headers.find((header) => header.key === "Cache-Control")?.value,
    "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
  );
  const spaRewrite = config.rewrites.find((entry) =>
    entry.destination.endsWith("/index.html"),
  );
  assert.ok(spaRewrite?.source.includes("sw.js"));
});
