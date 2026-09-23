"use strict";

const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const jwt = require("jsonwebtoken");

function carregarController() {
  const controllerPath = path.resolve(
    __dirname,
    "../src/controllers/presencaController.js",
  );
  const originalLoad = Module._load;
  process.env.PRESENCA_TOKEN_SECRET = "segredo-local-de-teste-presenca";

  Module._load = function loadControlado(request, parent, isMain) {
    if (parent?.filename === controllerPath && request === "../db") {
      return {
        query: async () => {
          throw new Error(
            "A identidade divergente não deve consultar o banco.",
          );
        },
        pool: null,
      };
    }
    if (
      parent?.filename === controllerPath &&
      request === "./notificacaoController"
    ) {
      return {};
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    delete require.cache[controllerPath];
    return require(controllerPath);
  } finally {
    Module._load = originalLoad;
  }
}

function respostaFake() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

const { confirmarPresencaViaToken } = carregarController();

test("token vinculado a outro usuário é recusado antes de qualquer gravação", async () => {
  const token = jwt.sign(
    { usuario_id: 101, turma_id: 12, data_presenca: "2026-09-22" },
    process.env.PRESENCA_TOKEN_SECRET,
    { expiresIn: "5m" },
  );
  const req = { user: { id: 202 }, body: { token } };
  const res = respostaFake();

  await confirmarPresencaViaToken(req, res);

  assert.equal(res.statusCode, 403);
  assert.equal(res.payload.ok, false);
  assert.equal(res.payload.details.motivo, "TOKEN_USUARIO_DIVERGENTE");
});

test("token inválido não registra presença", async () => {
  const req = { user: { id: 202 }, body: { token: "token-invalido" } };
  const res = respostaFake();

  await confirmarPresencaViaToken(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.payload.ok, false);
});
