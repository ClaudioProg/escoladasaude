import assert from "node:assert/strict";
import test from "node:test";

import { completeAuthLogin } from "./completeAuthLogin.js";

for (const channel of ["CPF/senha", "Google"]) {
  test(`${channel}: só confirma e navega após persistir a sessão`, () => {
    const calls = [];

    completeAuthLogin({
      response: { token: "jwt" },
      persistSession: () => calls.push("persist"),
      successMessage: "Login realizado com sucesso!",
      showSuccess: () => calls.push("success"),
      navigate: () => calls.push("navigate"),
      destination: "/painel",
    });

    assert.deepEqual(calls, ["persist", "success", "navigate"]);
  });
}

test("falha de persistência não confirma nem navega", () => {
  const calls = [];

  assert.throws(
    () =>
      completeAuthLogin({
        response: { token: "jwt" },
        persistSession: () => {
          throw new Error("storage indisponível");
        },
        successMessage: "Login realizado com sucesso!",
        showSuccess: () => calls.push("success"),
        navigate: () => calls.push("navigate"),
        destination: "/painel",
      }),
    /storage indisponível/,
  );

  assert.deepEqual(calls, []);
});
