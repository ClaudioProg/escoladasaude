"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");
const { inspect } = require("node:util");
const authVersion = require("../auth/authVersion");
const SECRET = "synthetic-etapa07-reset-secret";
const PASSWORD = "SinteticaNova123!";
const HASH = "synthetic-bcrypt-hash-sensitive";
const INVALID = { ok: false, code: "AUTH-400-TOKEN-INVALIDO-EXPIRADO", message: "Token inválido ou expirado." };
const OPERATIONAL = { ok: false, code: "AUTH-500-REDEFINICAO-SENHA",
  message: "Não foi possível atualizar a senha. Tente novamente mais tarde." };
const SUCCESS = { ok: true, code: "AUTH-200-SENHA-REDEFINIDA", message: "Senha atualizada com sucesso." };
const GENERIC = { ok: true, code: "AUTH-200-RECUPERACAO-SOLICITADA",
  message: "Se o e-mail estiver cadastrado, enviaremos as instruções." };
const BAD_VERSIONS = [undefined, null, "1", 0, -1, 1.5, 2147483648, NaN, Infinity, {}, [], true];

function fixture(t, { row = { id: 7, auth_version: 1, deleted_at: null },
  fail, errorName, zeroUpdate = false, active = 2, beforeCommit, env = {}, verify } = {}) {
  let state = { row, senha: "old-synthetic-hash", active, audits: [] };
  const calls = [];
  const events = [];
  const logs = [];
  const sends = [];
  const error = Object.assign(new Error(PASSWORD + " " + HASH + " private@example.invalid raw-stack SELECT segredo"),
    { code: "23505" });
  if (errorName) error.name = errorName;
  const db = {
    async query(sql, params) {
      calls.push({ scope: "pool", sql, params });
      if (fail === "recovery") throw error;
      return { rows: state.row ? [{ ...state.row }] : [] };
    },
    async tx(fn) {
      events.push("begin");
      if (fail === "begin") throw error;
      const pending = structuredClone(state);
      const executor = { async query(sql, params) {
        calls.push({ scope: "tx", sql, params, executor });
        if (sql.includes("SELECT id, auth_version, deleted_at")) {
          events.push("lock");
          if (fail === "lock") throw error;
          return { rows: pending.row ? [{ ...pending.row }] : [] };
        }
        if (sql.includes("UPDATE public.usuarios")) {
          events.push("update");
          if (fail === "update") throw error;
          if (zeroUpdate) return { rowCount: 0, rows: [] };
          pending.senha = params[0];
          pending.row.auth_version += 1;
          return { rowCount: 1, rows: [{ id: pending.row.id }] };
        }
        if (sql.includes("UPDATE public.auth_sessao")) {
          events.push("revoke");
          if (fail === "revoke") throw error;
          const count = pending.active;
          pending.active = 0;
          return { rowCount: count, rows: [] };
        }
        if (sql.includes("INSERT INTO auditoria_eventos")) {
          events.push("audit");
          if (fail === "audit") throw error;
          pending.audits.push(params);
          return { rows: [{ id: 41 }] };
        }
        assert.fail("Unexpected SQL");
      } };
      try {
        await fn(executor);
        if (beforeCommit) await beforeCommit();
        if (fail === "commit") throw error;
        state = pending;
        events.push("commit");
      } catch (failure) { events.push("rollback"); throw failure; }
    },
  };
  function load(name, dependencies) {
    const module = { exports: {} };
    const filename = path.resolve(__dirname, name);
    vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
      module, exports: module.exports, process: { env: { JWT_SECRET: SECRET,
        JWT_ISSUER: "synthetic-issuer", JWT_AUDIENCE: "synthetic-audience",
        FRONTEND_URL: "https://example.invalid", NODE_ENV: "test", ...env } },
      console: Object.fromEntries(["log", "warn", "error"].map(level => [level, (...args) => logs.push(args)])),
      require(request) {
        if (Object.hasOwn(dependencies, request)) return dependencies[request];
        throw new Error("Unexpected dependency");
      },
    }, { filename });
    return module.exports;
  }
  const sessions = load("../services/authSessionService.js", {
    "node:crypto": crypto, "../auth/authVersion": authVersion,
  });
  const audit = load("../services/auditoriaService.js", { "../db": db });
  const auditCall = t.mock.fn((...args) => audit.registrarAuditoria(...args));
  const hash = t.mock.fn(async () => { events.push("hash"); if (fail === "hash") throw error; return HASH; });
  const api = load("authUsuarioController.js", {
    bcrypt: { hash }, jsonwebtoken: verify ? { ...jwt, verify } : jwt,
    "../db": db, "../services/mailer": { sendEmail: async args => { sends.push(args); } },
    "../auth/authVersion": authVersion, "../services/authSessionService": sessions,
    "../services/auditoriaService": { ...audit, registrarAuditoria: auditCall },
  });
  function sign(fields = {}, options = {}, secret = SECRET) {
    return jwt.sign({ sub: "7", typ: "pwd-reset", auth_version: 1, ...fields }, secret,
      { issuer: "synthetic-issuer", audience: "synthetic-audience", expiresIn: "1h", ...options });
  }
  function raw(fields) {
    const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
    const head = encode({ alg: "HS256", typ: "JWT" });
    const body = encode({ sub: "7", typ: "pwd-reset", auth_version: 1,
      iss: "synthetic-issuer", aud: "synthetic-audience", exp: Math.floor(Date.now()/1000)+3600, ...fields });
    const input = head + "." + body;
    return input + "." + crypto.createHmac("sha256", SECRET).update(input).digest("base64url");
  }
  function response() {
    return { statusCode: null, body: null, status(code) { this.statusCode = code; return this; },
      json(body) { events.push("response"); this.body = body; return this; } };
  }
  async function reset(token = sign(), novaSenha = PASSWORD) {
    const res = response();
    await api.redefinirSenha({ body: { token, novaSenha }, originalUrl: "/reset?token=private", headers: {} }, res);
    return res;
  }
  async function recover() {
    const res = response();
    await api.recuperarSenha({ body: { email: "private@example.invalid" }, headers: {} }, res);
    return res;
  }
  return { api, db, calls, events, logs, sends, hash, auditCall, sign, raw, reset, recover, response, get state() { return state; } };
}
function body(res, status, expected) {
  assert.equal(res.statusCode, status);
  assert.deepEqual(JSON.parse(JSON.stringify(res.body)), expected);
}
function unchanged(f, before) { assert.deepEqual(structuredClone(f.state), before); }
function safe(f, tokens = []) {
  const output = inspect(f.logs, { depth: null });
  for (const sentinel of [PASSWORD, HASH, SECRET, "private@example.invalid", "raw-stack", "SELECT segredo",
    "2000000001", "2000000002", ...tokens]) assert.equal(output.includes(sentinel), false);
}

for (const version of [1, 2, 2147483647]) {
  test("recuperacao emite JWT real versionado: " + version, async t => {
    const f = fixture(t, { row: { id: 7, auth_version: version, deleted_at: null } });
    body(await f.recover(), 200, GENERIC);
    assert.equal(f.sends.length, 1);
    const token = f.sends[0].text.match(/redefinir-senha\/([A-Za-z0-9._-]+)/)[1];
    const decoded = jwt.verify(token, SECRET, { issuer: "synthetic-issuer", audience: "synthetic-audience" });
    assert.equal(decoded.sub, "7");
    assert.equal(decoded.typ, "pwd-reset");
    assert.equal(decoded.auth_version, version);
    assert.equal(decoded.exp - decoded.iat, 3600);
    assert.match(f.calls[0].sql, /SELECT id, auth_version/);
    safe(f, [token]);
  });
}
for (const version of BAD_VERSIONS) {
  test("recuperacao DB invalido preserva resposta generica: " + String(version), async t => {
    const f = fixture(t, { row: { id: 7, auth_version: version, deleted_at: null } });
    body(await f.recover(), 200, GENERIC);
    assert.equal(f.sends.length, 0);
    safe(f);
  });
}
test("recuperacao inexistente e falha DB nao enumeram conta", async t => {
  for (const options of [{ row: null }, { fail: "recovery" }]) {
    const f = fixture(t, options);
    body(await f.recover(), 200, GENERIC);
    assert.equal(f.sends.length, 0);
    safe(f);
  }
});
for (const version of [1, 2, 2147483646]) {
  test("reset atomico incrementa uma vez e compartilha executor: " + version, async t => {
    const f = fixture(t, { row: { id: 7, auth_version: version, deleted_at: null } });
    body(await f.reset(f.sign({ auth_version: version })), 200, SUCCESS);
    assert.equal(f.state.row.auth_version, version + 1);
    assert.equal(f.state.senha, HASH);
    assert.equal(f.state.active, 0);
    assert.equal(f.state.audits.length, 1);
    assert.deepEqual(Array.from(f.hash.mock.calls[0].arguments), [PASSWORD, 10]);
    assert.deepEqual(f.events, ["hash", "begin", "lock", "update", "revoke", "audit", "commit", "response"]);
    const calls = f.calls.filter(c => c.scope === "tx");
    assert.equal(calls.length, 4);
    assert.ok(calls.every(c => c.executor === calls[0].executor));
    assert.equal(f.auditCall.mock.calls[0].arguments[0].critica, true);
    assert.equal(f.auditCall.mock.calls[0].arguments[1], calls[0].executor);
    for (const key of ["req", "body", "senha", "hash", "token", "auth_version", "email"]) {
      assert.equal(Object.hasOwn(f.auditCall.mock.calls[0].arguments[0], key), false);
    }
    assert.match(calls[0].sql, /FOR UPDATE/);
    assert.match(calls[1].sql, /senha = \$1, auth_version = auth_version \+ 1/);
    assert.match(calls[1].sql, /auth_version = \$3[\s\S]*auth_version < 2147483647/);
    assert.deepEqual(Array.from(calls[1].params), [HASH, 7, version]);
    assert.deepEqual(Array.from(calls[2].params).filter((_, i) => i !== 1), [7, "password_changed", null]);
    const auditParams = calls[3].params;
    assert.deepEqual(Array.from(auditParams).slice(2, 8), ["alterar", "auth", "usuarios", "7", true, "info"]);
    assert.equal(auditParams[8], null);
    assert.equal(auditParams[9], null);
    assert.deepEqual(JSON.parse(JSON.stringify(auditParams[10])), { origem: "recuperacao_legada_protegida" });
    assert.equal(auditParams[15], null, "Nenhuma URL/query recebida e persistida.");
    safe(f);
  });
}
for (const [label, fields] of [
  ["typ", { typ: "access" }], ["sub ausente", { sub: undefined }], ["sub numero", { sub: 7 }],
  ["sub zero", { sub: "0" }], ["sub overflow", { sub: "2147483648" }], ["sub decimal", { sub: "7.5" }],
  ["sub espaco", { sub: " 7" }], ["sub array", { sub: [] }],
  ...BAD_VERSIONS.map(v => ["claim " + String(v), { auth_version: v }]),
]) {
  test("consumo invalido antes de hash/tx: " + label, async t => {
    const f = fixture(t);
    const token = f.raw(fields);
    body(await f.reset(token), 400, INVALID);
    assert.equal(f.hash.mock.callCount(), 0);
    assert.equal(f.events.includes("begin"), false);
    safe(f, [token]);
  });
}
test("assinatura, expiracao, issuer e audience invalidos sao 400", async t => {
  const f = fixture(t);
  for (const token of [f.sign({}, {}, "other-synthetic-secret"), f.sign({}, { expiresIn: -1 }),
    f.sign({}, { issuer: "other" }), f.sign({}, { audience: "other" }), "invalid.jwt"]) {
    body(await f.reset(token), 400, INVALID);
    safe(f, [token]);
  }
  assert.equal(f.hash.mock.callCount(), 0);
});
for (const options of [{ row: null }, { row: { id: 7, auth_version: 1, deleted_at: "2026-10-08" } },
  { row: { id: 7, auth_version: 2, deleted_at: null } }]) {
  test("estado ausente/excluido/divergente retorna 400 e rollback", async t => {
    const f = fixture(t, options);
    const before = structuredClone(f.state);
    body(await f.reset(), 400, INVALID);
    unchanged(f, before);
    assert.deepEqual(f.events, ["hash", "begin", "lock", "rollback", "response"]);
  });
}
for (const version of BAD_VERSIONS) {
  test("versao DB invalida e operacional: " + String(version), async t => {
    const f = fixture(t, { row: { id: 7, auth_version: version, deleted_at: null } });
    const before = structuredClone(f.state);
    body(await f.reset(), 500, OPERATIONAL);
    unchanged(f, before);
    safe(f);
  });
}
test("maximo falha fechado sem UPDATE", async t => {
  const f = fixture(t, { row: { id: 7, auth_version: 2147483647, deleted_at: null } });
  const before = structuredClone(f.state);
  body(await f.reset(f.sign({ auth_version: 2147483647 })), 500, OPERATIONAL);
  unchanged(f, before);
  assert.deepEqual(f.events, ["hash", "begin", "lock", "rollback", "response"]);
});
for (const fail of ["hash", "begin", "lock", "update", "revoke", "audit", "commit"]) {
  test("falha critica " + fail + " preserva estado e retorna 500", async t => {
    const f = fixture(t, { fail });
    const before = structuredClone(f.state);
    body(await f.reset(), 500, OPERATIONAL);
    unchanged(f, before);
    if (!["hash", "begin"].includes(fail)) assert.ok(f.events.includes("rollback"));
    safe(f);
  });
}
test("UPDATE zero falha operacional; zero sessoes revogadas e valido", async t => {
  const failed = fixture(t, { zeroUpdate: true });
  const before = structuredClone(failed.state);
  body(await failed.reset(), 500, OPERATIONAL);
  unchanged(failed, before);
  assert.equal(failed.events.includes("revoke"), false);
  const empty = fixture(t, { active: 0 });
  body(await empty.reset(), 200, SUCCESS);
  assert.equal(empty.state.audits.length, 1);
});
test("sucesso so e publicado depois de concluir transacao", async t => {
  let release;
  let reached;
  const gate = new Promise(resolve => { release = resolve; });
  const ready = new Promise(resolve => { reached = resolve; });
  const f = fixture(t, { beforeCommit: async () => { reached(); await gate; } });
  const res = f.response();
  const running = f.api.redefinirSenha({ body: { token: f.sign(), novaSenha: PASSWORD } }, res);
  await ready;
  assert.equal(res.body, null);
  assert.equal(f.state.row.auth_version, 1);
  release();
  await running;
  body(res, 200, SUCCESS);
  assert.equal(f.state.row.auth_version, 2);
});
test("replay do mesmo JWT e de outro JWT em N nao altera estado", async t => {
  const f = fixture(t);
  const first = f.sign({ jti: "first" });
  const second = f.sign({ jti: "second" });
  assert.notEqual(first, second);
  body(await f.reset(first), 200, SUCCESS);
  const before = structuredClone(f.state);
  for (const token of [first, second]) {
    body(await f.reset(token), 400, INVALID);
    unchanged(f, before);
    safe(f, [token]);
  }
});
test("secret ausente e erro inesperado de verificacao sao operacionais", async t => {
  const missing = fixture(t, { env: { JWT_SECRET: undefined } });
  body(await missing.reset(), 500, OPERATIONAL);
  const unexpected = fixture(t, { verify() { throw new Error("private@example.invalid"); } });
  body(await unexpected.reset(), 500, OPERATIONAL);
  safe(unexpected);
});
test("politica legada mantem 422 sem hash ou transacao", async t => {
  const f = fixture(t);
  const res = await f.reset(f.sign(), "curta");
  assert.equal(res.statusCode, 422);
  assert.equal(res.body.code, "AUTH-422-REDEFINICAO-VALIDACAO");
  assert.equal(f.hash.mock.callCount(), 0);
});

test("erro operacional com nome JWT nao vira erro de token", async t => {
  const f = fixture(t, { fail: "revoke", errorName: "TokenExpiredError" });
  const before = structuredClone(f.state);
  body(await f.reset(), 500, OPERATIONAL);
  unchanged(f, before);
});
