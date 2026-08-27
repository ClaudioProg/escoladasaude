import assert from "node:assert/strict";
import test from "node:test";

import {
  erroIndicaSessaoInvalida,
  persistAuthStorage,
  tokenMudouDuranteValidacao,
  usuarioSessaoValido,
} from "./authSessionStorage.js";

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));

  return {
    getItem(key) {
      return values.get(key) || null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

const perfilMeValido = {
  id: 42,
  nome: "Usuário legado",
  email: "usuario@example.test",
  perfil: "usuario",
  perfil_incompleto: false,
};

test("/perfil/me válido repara perfil legado sem serializar objeto em perfil", () => {
  const storage = createStorage({
    token: "Bearer token-legado",
    usuario: JSON.stringify({ id: 42, perfil: "usuario" }),
    perfil: JSON.stringify({ id: 42, perfil: "usuario" }),
  });

  persistAuthStorage(storage, storage.getItem("token"), perfilMeValido);

  assert.equal(storage.getItem("token"), "token-legado");
  assert.equal(storage.getItem("usuario"), JSON.stringify(perfilMeValido));
  assert.equal(storage.getItem("perfil"), "usuario");
});

test("payload fora do contrato não é aceito como sessão válida", () => {
  assert.equal(usuarioSessaoValido({ id: 42, perfil: " usuario " }), false);
  assert.equal(usuarioSessaoValido({ id: 42, perfil: "gestor" }), false);
  assert.equal(usuarioSessaoValido({ id: null, perfil: "usuario" }), false);
});

test("somente 401 confirma sessão inválida", () => {
  assert.equal(erroIndicaSessaoInvalida({ status: 401 }), true);

  for (const status of [0, 403, 404, 429, 500, 503]) {
    assert.equal(erroIndicaSessaoInvalida({ status }), false, String(status));
  }

  assert.equal(erroIndicaSessaoInvalida(new Error("Failed to fetch")), false);
  assert.equal(erroIndicaSessaoInvalida(new Error("timeout")), false);
});

test("resposta antiga não pode sobrescrever token trocado durante a validação", () => {
  assert.equal(tokenMudouDuranteValidacao("token-antigo", "token-novo"), true);
  assert.equal(tokenMudouDuranteValidacao("token-atual", "token-atual"), false);
});
