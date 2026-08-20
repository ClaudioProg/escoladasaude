import assert from "node:assert/strict";
import test from "node:test";

import {
  criarAssinaturaBuild,
  criarIdentidadeBuild,
  validarIdentidadeBuild,
} from "./build-version.mjs";

test("gera uma única assinatura a partir da identidade do build", () => {
  const identidade = criarIdentidadeBuild({
    version: "2.0.4",
    agora: new Date("2026-08-20T18:31:39.259Z"),
  });

  assert.deepEqual(identidade, {
    app: "escoladasaude",
    version: "2.0.4",
    buildId: "1787250699259",
    buildAt: "2026-08-20T18:31:39.259Z",
    signature: "escoladasaude::2.0.4::1787250699259",
  });
  assert.equal(validarIdentidadeBuild(identidade), identidade.signature);
});

test("aceita Build ID fornecido pelo processo sem gerar outro valor", () => {
  const identidade = criarIdentidadeBuild({
    version: "2.0.4",
    agora: new Date("2026-08-20T18:31:39.259Z"),
    buildId: "deploy-123",
  });

  assert.equal(identidade.buildId, "deploy-123");
  assert.equal(
    identidade.signature,
    criarAssinaturaBuild({
      app: "escoladasaude",
      version: "2.0.4",
      buildId: "deploy-123",
    }),
  );
});

test("rejeita version.json cuja assinatura diverge dos próprios campos", () => {
  assert.throws(
    () =>
      validarIdentidadeBuild({
        app: "escoladasaude",
        version: "2.0.4",
        buildId: "build-b",
        signature: "escoladasaude::2.0.4::build-a",
      }),
    /diverge/,
  );
});
