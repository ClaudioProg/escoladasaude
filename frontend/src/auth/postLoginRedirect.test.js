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
  assert.equal(
    sanitizePostLoginRedirect("/eventos/123?origem=qrcode"),
    "/eventos/123?origem=qrcode",
  );
  assert.equal(
    sanitizePostLoginRedirect("/presenca?token=abc123#confirmacao"),
    "/presenca?token=abc123#confirmacao",
  );
  assert.equal(
    sanitizePostLoginRedirect("/presenca/42?token=abc123"),
    "/presenca/42?token=abc123",
  );
});

test("mantém o destino de eventos e chamadas para retorno após cadastro", () => {
  assert.equal(
    sanitizePostLoginRedirect("/eventos/21?origem=qrcode"),
    "/eventos/21?origem=qrcode",
  );
  assert.equal(
    sanitizePostLoginRedirect("/submissao?chamada_id=42"),
    "/submissao?chamada_id=42",
  );
});

test("retorno ao evento rejeita identificador inválido e open redirect", () => {
  assert.equal(sanitizePostLoginRedirect("/eventos/abc"), "/painel");
  assert.equal(
    sanitizePostLoginRedirect("https://externo.example/eventos/123"),
    "/painel",
  );
  assert.equal(
    sanitizePostLoginRedirect("//externo.example/eventos/123"),
    "/painel",
  );
});

test("retorno de presença rejeita variantes externas e caminhos parecidos", () => {
  assert.equal(
    sanitizePostLoginRedirect("/presenca-maliciosa?token=x"),
    "/painel",
  );
  assert.equal(
    sanitizePostLoginRedirect("https://externo.example/presenca?token=x"),
    "/painel",
  );
  assert.equal(
    sanitizePostLoginRedirect("//externo.example/presenca?token=x"),
    "/painel",
  );
});
