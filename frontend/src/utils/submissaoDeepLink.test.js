import assert from "node:assert/strict";
import test from "node:test";

import { parseChamadaId, urlSubmissaoChamada } from "./submissaoDeepLink.js";

test("aceita somente identificadores inteiros positivos seguros", () => {
  for (const value of [1, "42", "9007199254740991"]) {
    assert.equal(parseChamadaId(value), Number(value));
  }
  for (const value of [null, undefined, "", "0", "01", "-1", "1.5", "x", "9007199254740992"]) {
    assert.equal(parseChamadaId(value), null, String(value));
  }
});

test("gera link permanente para a chamada, sem dados do participante", () => {
  assert.equal(
    urlSubmissaoChamada("https://escoladasaude.vercel.app", 42),
    "https://escoladasaude.vercel.app/submissao?chamada_id=42",
  );
  assert.equal(
    urlSubmissaoChamada("https://exemplo.org", "8", "/escola/"),
    "https://exemplo.org/escola/submissao?chamada_id=8",
  );
});

test("rejeita chamadas inválidas e origens não HTTP", () => {
  assert.throws(() => urlSubmissaoChamada("https://exemplo.org", "abc"), /inválido/);
  assert.throws(() => urlSubmissaoChamada("javascript:alert(1)", 12), /inválida|Invalid URL/);
});
