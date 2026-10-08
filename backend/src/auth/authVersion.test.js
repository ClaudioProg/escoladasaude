"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { isValidAuthVersion, getAuthVersionMode, resolveTokenAuthVersion } = require("./authVersion");

const INVALID = [
  ["undefined", undefined], ["null", null], ["string", "1"], ["zero", 0],
  ["negativo", -1], ["decimal", 1.5], ["NaN", NaN], ["Infinity", Infinity],
  ["array", []], ["objeto", {}], ["boolean", true],
  ["acima INT4", 2147483648], ["nao safe", Number.MAX_SAFE_INTEGER + 1],
];

test("versao aceita somente inteiros JSON no intervalo INT4 positivo", () => {
  for (const value of [1, 2, 2147483647]) assert.equal(isValidAuthVersion(value), true);
});

for (const [label, value] of INVALID) {
  test(`versao ${label} e invalida mesmo quando a propriedade esta presente`, () => {
    assert.equal(isValidAuthVersion(value), false);
    for (const mode of ["bridge", "strict"]) {
      assert.equal(resolveTokenAuthVersion({ auth_version: value }, mode), null);
    }
  });
}

test("bridge distingue ausencia real de undefined e strict rejeita ausencia", () => {
  assert.equal(resolveTokenAuthVersion({}, "bridge"), 1);
  assert.equal(resolveTokenAuthVersion({}, "strict"), null);
  assert.equal(resolveTokenAuthVersion({ auth_version: undefined }, "bridge"), null);
  const inherited = Object.create({ auth_version: 2 });
  assert.equal(resolveTokenAuthVersion(inherited, "bridge"), 1);
  assert.equal(resolveTokenAuthVersion(inherited, "strict"), null);
  for (const mode of ["bridge", "strict"]) {
    for (const value of [1, 2, 2147483647]) {
      assert.equal(resolveTokenAuthVersion({ auth_version: value }, mode), value);
    }
    for (const payload of [null, undefined, [], "payload"]) {
      assert.equal(resolveTokenAuthVersion(payload, mode), null);
    }
  }
});

for (const nodeEnv of ["development", "test", "production"]) {
  test(`AUTH_VERSION_MODE e obrigatorio e exato em ${nodeEnv}, sem fallback`, (t) => {
    const old = Object.fromEntries(["NODE_ENV", "AUTH_VERSION_MODE"].map(key => [key, process.env[key]]));
    t.after(() => {
      for (const [key, value] of Object.entries(old)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });
    process.env.NODE_ENV = nodeEnv;
    for (const mode of [undefined, "", "BRIDGE", " bridge", "strict ", "config-secret-sentinel"]) {
      if (mode === undefined) delete process.env.AUTH_VERSION_MODE;
      else process.env.AUTH_VERSION_MODE = mode;
      assert.throws(getAuthVersionMode, error => {
        assert.equal(error.code, "AUTH_VERSION_MODE_INVALID");
        assert.equal(error.message.includes("config-secret-sentinel"), false);
        return true;
      });
      assert.throws(() => resolveTokenAuthVersion({ auth_version: 1 }, mode), { code: "AUTH_VERSION_MODE_INVALID" });
    }
    for (const mode of ["bridge", "strict"]) {
      process.env.AUTH_VERSION_MODE = mode;
      assert.equal(getAuthVersionMode(), mode);
    }
  });
}
