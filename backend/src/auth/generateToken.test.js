"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const jwt = require("jsonwebtoken");
const authVersion = require("./authVersion");

const SECRET = "ficticio-emissor-etapa06-nao-producao";
const ENV = { NODE_ENV: "test", JWT_SECRET: SECRET, JWT_ISSUER: "issuer-local",
  JWT_AUDIENCE: "audience-local", AUTH_VERSION_MODE: "bridge" };

function fixture(t, env = {}) {
  const sign = t.mock.fn((...args) => jwt.sign(...args));
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve("./generateToken"), "utf8"), {
    module, exports: module.exports, process: { env: { ...ENV, ...env } },
    console: { error: t.mock.fn() },
    require(name) {
      if (name === "jsonwebtoken") return { sign };
      if (name === "./authVersion") return authVersion;
      throw new Error("Dependencia nao autorizada no teste");
    },
  });
  return { generate: module.exports, sign };
}

for (const version of [1, 2, 2147483647]) {
  test(`access JWT inclui auth_version=${version}, sub/perfil e configuracao atuais`, (t) => {
    const { generate, sign } = fixture(t);
    const token = generate({ id: 7, perfil: "usuario", auth_version: version, email: "private@example.invalid",
      AUTH_VERSION_MODE: "strict" });
    const decoded = jwt.verify(token, SECRET, { issuer: ENV.JWT_ISSUER, audience: ENV.JWT_AUDIENCE });
    assert.deepEqual(Object.keys(decoded).sort(), ["aud", "auth_version", "exp", "iat", "iss", "perfil", "sub"].sort());
    assert.equal(decoded.sub, "7");
    assert.equal(decoded.perfil, "usuario");
    assert.equal(decoded.auth_version, version);
    assert.equal(decoded.exp - decoded.iat, 86400);
    assert.equal(sign.mock.callCount(), 1);
  });
}

test("expiresIn e opcoes explicitas continuam prevalecendo", (t) => {
  const { generate } = fixture(t);
  const token = generate({ id: 7, perfil: "organizador", auth_version: 2 }, "2h",
    { issuer: "other-issuer", audience: "other-audience", jwtid: "local-id", algorithm: "HS256" });
  const decoded = jwt.verify(token, SECRET, { issuer: "other-issuer", audience: "other-audience", jwtid: "local-id" });
  assert.equal(decoded.exp - decoded.iat, 7200);
  assert.equal(decoded.perfil, "organizador");
});

const INVALID = [
  ["ausente", {}], ["undefined", { auth_version: undefined }], ["string", { auth_version: "1" }],
  ["null", { auth_version: null }], ["zero", { auth_version: 0 }], ["negativo", { auth_version: -1 }],
  ["decimal", { auth_version: 1.5 }], ["NaN", { auth_version: NaN }], ["Infinity", { auth_version: Infinity }],
  ["acima INT4", { auth_version: 2147483648 }], ["nao safe", { auth_version: Number.MAX_SAFE_INTEGER + 1 }],
  ["array", { auth_version: [] }], ["objeto", { auth_version: {} }], ["boolean", { auth_version: true }],
];
for (const [label, fields] of INVALID) {
  test(`emissor recusa versao ${label} antes de assinar`, (t) => {
    const { generate, sign } = fixture(t);
    assert.throws(() => generate({ id: 7, perfil: "usuario", ...fields }), /versão de autenticação inválida/);
    assert.equal(sign.mock.callCount(), 0);
  });
}

test("claim herdado nao satisfaz o contrato obrigatorio do emissor", (t) => {
  const { generate, sign } = fixture(t);
  assert.throws(() => generate(Object.assign(Object.create({ auth_version: 1 }), { id: 7, perfil: "usuario" })), /versão/);
  assert.equal(sign.mock.callCount(), 0);
});

for (const fields of [{ id: 0 }, { id: 1.5 }, { id: "invalid" }, { perfil: "" }, { perfil: "gestor" }]) {
  test(`id/perfil invalidos continuam recusados: ${JSON.stringify(fields)}`, (t) => {
    const { generate, sign } = fixture(t);
    assert.throws(() => generate({ id: 7, perfil: "usuario", auth_version: 1, ...fields }), /inválido/);
    assert.equal(sign.mock.callCount(), 0);
  });
}

test("secret ficticio ausente continua impedindo assinatura", (t) => {
  const { generate, sign } = fixture(t, { JWT_SECRET: undefined });
  assert.throws(() => generate({ id: 7, perfil: "usuario", auth_version: 1 }), /indisponível/);
  assert.equal(sign.mock.callCount(), 0);
});

test("rollback criptografico ignora claim extra e preserva leitura legada sub/perfil", (t) => {
  const { generate } = fixture(t);
  const token = generate({ id: 7, perfil: "administrador", auth_version: 2 });
  const legacyDecoded = jwt.verify(token, SECRET, { issuer: ENV.JWT_ISSUER, audience: ENV.JWT_AUDIENCE });
  const legacyIdentity = { id: Number(legacyDecoded.sub), perfil: legacyDecoded.perfil };
  assert.deepEqual(legacyIdentity, { id: 7, perfil: "administrador" });
  assert.equal(legacyDecoded.auth_version, 2);
});
