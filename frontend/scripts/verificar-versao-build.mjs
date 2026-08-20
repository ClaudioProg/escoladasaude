import fs from "node:fs";
import path from "node:path";

import { validarIdentidadeBuild } from "./build-version.mjs";

const root = process.cwd();
const publicVersionPath = path.join(root, "public", "version.json");
const distVersionPath = path.join(root, "dist", "version.json");
const assetsDir = path.join(root, "dist", "assets");

function lerJson(caminho) {
  return JSON.parse(fs.readFileSync(caminho, "utf8"));
}

function listarJavaScript(caminho) {
  return fs.readdirSync(caminho, { withFileTypes: true }).flatMap((entry) => {
    const destino = path.join(caminho, entry.name);

    if (entry.isDirectory()) {
      return listarJavaScript(destino);
    }

    return entry.isFile() && entry.name.endsWith(".js") ? [destino] : [];
  });
}

const publicPayload = lerJson(publicVersionPath);
const distPayload = lerJson(distVersionPath);
const publicSignature = validarIdentidadeBuild(publicPayload);
const distSignature = validarIdentidadeBuild(distPayload);

if (publicSignature !== distSignature) {
  throw new Error(
    `A assinatura copiada para dist/version.json diverge de public/version.json: ${distSignature} !== ${publicSignature}`,
  );
}

const arquivosComAssinatura = listarJavaScript(assetsDir).filter((arquivo) =>
  fs.readFileSync(arquivo, "utf8").includes(publicSignature),
);

if (!arquivosComAssinatura.length) {
  throw new Error(
    `A assinatura ${publicSignature} não foi incorporada a nenhum bundle JavaScript.`,
  );
}

console.log("[build-version] contrato confirmado:", publicSignature);
console.log(
  "[build-version] bundle:",
  path.relative(root, arquivosComAssinatura[0]),
);
