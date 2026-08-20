import test from "node:test";
import assert from "node:assert/strict";

import {
  buildUpdateUrl,
  getBuildSignature,
  getSafeReturnPath,
  getUrlWithoutUpdateMarker,
  shouldAttemptAutomaticUpdate,
} from "./platformVersion.js";

const loaded = "escoladasaude::2.0.4::build-a";
const published = "escoladasaude::2.0.4::build-b";

test("assinatura usa o build gerado em version.json", () => {
  assert.equal(
    getBuildSignature({
      app: "escoladasaude",
      version: "2.0.4",
      buildId: "build-b",
    }),
    published,
  );
});

test("assinatura explícita deve coincidir com os campos do mesmo build", () => {
  assert.equal(
    getBuildSignature({
      app: "escoladasaude",
      version: "2.0.4",
      buildId: "build-b",
      signature: published,
    }),
    published,
  );
  assert.equal(
    getBuildSignature({
      app: "escoladasaude",
      version: "2.0.4",
      buildId: "build-b",
      signature: loaded,
    }),
    null,
  );
});

test("build carregado diferente inicia atualização automática", () => {
  assert.equal(
    shouldAttemptAutomaticUpdate({
      loadedSignature: loaded,
      publishedSignature: published,
      lastAttempt: null,
      now: 1_000,
    }),
    true,
  );
});

test("mesma versão publicada não recarrega", () => {
  assert.equal(
    shouldAttemptAutomaticUpdate({
      loadedSignature: published,
      publishedSignature: published,
      lastAttempt: null,
    }),
    false,
  );
});

test("tentativa recente para o mesmo build impede loop", () => {
  assert.equal(
    shouldAttemptAutomaticUpdate({
      loadedSignature: loaded,
      publishedSignature: published,
      lastAttempt: JSON.stringify({
        signature: published,
        attemptedAt: 1_000,
      }),
      now: 1_001,
    }),
    false,
  );
});

test("ciclo A para B termina quando o reload carrega o bundle B", () => {
  assert.equal(
    shouldAttemptAutomaticUpdate({
      loadedSignature: loaded,
      publishedSignature: published,
      lastAttempt: null,
      now: 1_000,
    }),
    true,
  );

  const tentativaRegistrada = JSON.stringify({
    signature: published,
    attemptedAt: 1_000,
  });

  assert.equal(
    shouldAttemptAutomaticUpdate({
      loadedSignature: loaded,
      publishedSignature: published,
      lastAttempt: tentativaRegistrada,
      now: 1_001,
    }),
    false,
  );
  assert.equal(
    shouldAttemptAutomaticUpdate({
      loadedSignature: published,
      publishedSignature: published,
      lastAttempt: tentativaRegistrada,
      now: 1_002,
    }),
    false,
  );
});

test("retorno preserva rota local e rejeita destino externo", () => {
  assert.equal(
    getSafeReturnPath({ pathname: "/painel", search: "?aba=1", hash: "#x" }),
    "/painel?aba=1#x",
  );
  assert.equal(getSafeReturnPath({ pathname: "//externo.test" }), "/");

  const url = buildUpdateUrl({
    returnPath: "/painel?aba=1#x",
    publishedSignature: published,
  });
  const params = new URL(url, "https://escola.test").searchParams;
  assert.equal(params.get("retorno"), "/painel?aba=1#x");
  assert.equal(params.get("versao"), published);
});

test("remove somente o marcador transitório após atualização confirmada", () => {
  assert.equal(
    getUrlWithoutUpdateMarker({
      pathname: "/painel",
      search: "?aba=1&atualizado=build-b&filtro=ativo",
      hash: "#resumo",
    }),
    "/painel?aba=1&filtro=ativo#resumo",
  );
});
