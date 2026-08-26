import assert from "node:assert/strict";
import test from "node:test";

import { persistAuthStorage } from "../auth/authSessionStorage.js";

function createStorage({ failOnSet = false } = {}) {
  const values = new Map();

  return {
    getItem(key) {
      return values.get(key) || null;
    },
    setItem(key, value) {
      if (failOnSet) {
        throw new Error("storage indisponível");
      }
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

test("persiste e relê token, usuário e perfil do contrato oficial", () => {
  const storage = createStorage();
  const usuario = { id: 42, perfil: "usuario" };

  persistAuthStorage(storage, "Bearer token-oficial", usuario);

  assert.equal(storage.getItem("token"), "token-oficial");
  assert.equal(storage.getItem("usuario"), JSON.stringify(usuario));
  assert.equal(storage.getItem("perfil"), "usuario");
});

test("propaga falha de localStorage como erro de persistência", () => {
  assert.throws(
    () =>
      persistAuthStorage(createStorage({ failOnSet: true }), "token-oficial", {
        id: 42,
        perfil: "usuario",
      }),
    /storage indisponível/,
  );
});
