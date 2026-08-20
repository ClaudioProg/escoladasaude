import fs from "node:fs";
import path from "node:path";

import { criarIdentidadeBuild } from "./build-version.mjs";

const root = process.cwd();
const publicDir = path.join(root, "public");
const outputPath = path.join(publicDir, "version.json");

function obterVersaoPlataforma() {
  const packagePath = path.join(root, "package.json");
  const packagePayload = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  const versaoPackage = String(packagePayload?.version || "").trim();
  const versaoEnv = String(process.env.VITE_APP_VERSION || "").trim();

  return versaoPackage || versaoEnv || "2.0.0";
}

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

const versionPayload = criarIdentidadeBuild({
  version: obterVersaoPlataforma(),
  buildId: String(process.env.PLATFORM_BUILD_ID || "").trim(),
});

fs.writeFileSync(
  outputPath,
  `${JSON.stringify(versionPayload, null, 2)}\n`,
  "utf8",
);

console.log("[build-version] version.json gerado em:", outputPath);
console.log("[build-version] assinatura:", versionPayload.signature);
