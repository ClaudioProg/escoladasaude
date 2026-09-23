"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const router = require("../src/routes/relatorioRoute");
const { authorize } = require("../src/middlewares/authorize");
const { safeRequestUrl } = require("../src/utils/safeRequestUrl");

function rota(method, path) {
  return router.stack.find(
    (layer) => layer.route?.path === path && layer.route.methods[method],
  )?.route;
}

test("busca institucional possui POST nos mesmos caminhos de painel e exportações", () => {
  assert.ok(rota("post", "/institucional"));
  assert.ok(rota("post", "/exportar/institucional.xlsx"));
  assert.ok(rota("post", "/exportar/institucional.pdf"));
});

test("GET institucional rejeita busca na query sem ecoar CPF", () => {
  for (const path of [
    "/institucional",
    "/exportar/:tipo.xlsx",
    "/exportar/:tipo.pdf",
  ]) {
    const route = rota("get", path);
    assert.ok(route);
    const guard = route.stack.find((layer) =>
      layer.name.startsWith("rejeitarBuscaGet"),
    );
    assert.ok(guard, `guarda ausente em ${path}`);
    const req = {
      query: { busca: "123.456.789-45" },
      params: { tipo: "institucional" },
    };
    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.payload = payload;
        return this;
      },
    };
    guard.handle(req, res, () => assert.fail("GET com busca não foi rejeitado"));
    assert.equal(res.statusCode, 400);
    assert.equal(res.payload.code, "RELATORIO_BUSCA_REQUER_POST");
    assert.doesNotMatch(JSON.stringify(res.payload), /123[.]456[.]789-45/);
  }
});

test("logs e erros retiram a query das URLs de relatório", () => {
  for (const url of [
    "/api/relatorio/institucional?busca=123.456.789-45",
    "/api/relatorio/exportar/institucional.xlsx?busca=12345678945",
    "/api/relatorio/exportar/institucional.pdf?busca=12345678945",
  ]) {
    assert.equal(safeRequestUrl({ originalUrl: url }), url.split("?")[0]);
  }
  assert.equal(safeRequestUrl({ url: "/api/evento/1?pagina=2" }), "/api/evento/1?pagina=2");
});

test("acesso negado não registra CPF recebido em URL legada", () => {
  const originalWarn = console.warn;
  const avisos = [];
  console.warn = (...args) => avisos.push(args);
  try {
    const req = {
      method: "GET",
      originalUrl: "/api/relatorio/institucional?busca=123.456.789-45",
      user: { id: 7, perfil: "usuario" },
    };
    const res = {
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.payload = payload;
        return this;
      },
    };
    authorize("administrador")(req, res, () =>
      assert.fail("usuário sem perfil autorizado"),
    );
    assert.equal(res.statusCode, 403);
    assert.doesNotMatch(JSON.stringify(avisos), /123[.]456[.]789-45/);
  } finally {
    console.warn = originalWarn;
  }
});
