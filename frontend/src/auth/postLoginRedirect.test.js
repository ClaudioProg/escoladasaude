import assert from "node:assert/strict";
import test from "node:test";

import { sanitizePostLoginRedirect } from "./postLoginRedirect.js";

test("normaliza next ausente, legado, público, externo e inexistente para /painel", () => {
  const invalidTargets = [
    "",
    "/usuario/dashboard",
    "/dashboard-usuario",
    "/home-escola",
    "/dashboard",
    "/usuario",
    "/rota-removida",
    "/login",
    "/cadastro",
    "/esqueci-senha",
    "/redefinir-senha/token",
    "/excluir-conta",
    "/privacidade",
    "/validar-certificado",
    "/presenca",
    "/historico",
    "https://externo.example/painel",
    "//externo.example/painel",
  ];

  for (const target of invalidTargets) {
    assert.equal(sanitizePostLoginRedirect(target), "/painel", target);
  }
});

test("preserva somente destinos privados atuais e seus parâmetros", () => {
  assert.equal(sanitizePostLoginRedirect("/painel"), "/painel");
  assert.equal(
    sanitizePostLoginRedirect("/pesquisa/42/responder?origem=login#questao-1"),
    "/pesquisa/42/responder?origem=login#questao-1",
  );
  assert.equal(
    sanitizePostLoginRedirect("/administrador/interacao/apresentacao/7"),
    "/administrador/interacao/apresentacao/7",
  );
  assert.equal(
    sanitizePostLoginRedirect("/gestao/evento/7/pre-teste/resultados"),
    "/gestao/evento/7/pre-teste/resultados",
  );
});
