"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

function carregarService(poolMock) {
  const servicePath = path.resolve(__dirname, "auditoriaService.js");
  const originalLoad = Module._load;
  const originalCache = require.cache[servicePath];
  Module._load = function loadControlado(request, parent, isMain) {
    if (parent?.filename === servicePath && request === "../db") return poolMock;
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    delete require.cache[servicePath];
    return require(servicePath);
  } finally {
    Module._load = originalLoad;
    delete require.cache[servicePath];
    if (originalCache) require.cache[servicePath] = originalCache;
  }
}

const paramsValidos = { acao: "alterar", modulo: "auth" };
const falhaRegistro = {
  ok: false,
  data: null,
  message: "Não foi possível registrar o evento de auditoria.",
  code: "AUDITORIA_FALHA_REGISTRO",
  adminHint: "A falha de auditoria foi controlada e não interrompeu o fluxo principal.",
};

test("chamada antiga sem executor usa pool e preserva INSERT e retorno", async (t) => {
  const row = { id: 41, acao: "alterar", modulo: "auth" };
  const pool = {
    query: t.mock.fn(async function (sql, values) {
      assert.equal(this, pool);
      assert.match(sql, /INSERT INTO auditoria_eventos/);
      assert.match(sql, /RETURNING/);
      assert.equal(values.length, 18);
      assert.deepEqual(values.slice(0, 8), [7, "usuario", "alterar", "auth", "usuarios", "7", true, "info"]);
      return { rows: [row] };
    }),
  };
  const { registrarAuditoria } = carregarService(pool);
  const result = await registrarAuditoria({
    ...paramsValidos,
    req: { user: { id: 7, perfil: "usuario" } },
    entidade: "usuarios",
    entidade_id: 7,
  });
  assert.deepEqual(result, {
    ok: true, data: row,
    message: "Evento de auditoria registrado com sucesso.", code: "AUDITORIA_REGISTRADA",
  });
  assert.equal(result.data, row);
  assert.equal(pool.query.mock.callCount(), 1);
});

test("executor somente query recebe INSERT sem pool, tx, commit ou rollback", async (t) => {
  const pool = { query: t.mock.fn(async () => { throw new Error("Pool global proibido."); }) };
  const { registrarAuditoria } = carregarService(pool);
  const row = { id: 42 };
  let executor;
  const query = t.mock.fn(async function (sql, values) {
    assert.equal(this, executor);
    assert.match(sql, /^\s*INSERT INTO auditoria_eventos/);
    assert.deepEqual(values.slice(2, 4), ["alterar", "auth"]);
    return { rows: [row] };
  });
  executor = new Proxy({ query }, {
    get(target, key) {
      assert.equal(key, "query", `Dependência indevida de executor.${String(key)}`);
      return target.query;
    },
  });
  const result = await registrarAuditoria({ ...paramsValidos, critica: true }, executor);
  assert.equal(result.ok, true);
  assert.equal(result.data, row);
  assert.equal(query.mock.callCount(), 1);
  assert.equal(pool.query.mock.callCount(), 0);
});

test("pool normal tambem pode ser informado como executor explicito", async (t) => {
  const row = { id: 43 };
  const pool = { query: t.mock.fn(async () => ({ rows: [row] })) };
  const { registrarAuditoria } = carregarService(pool);
  assert.equal((await registrarAuditoria(paramsValidos, pool)).data, row);
  assert.equal(pool.query.mock.callCount(), 1);
});

test("erro do executor nao critico retorna falha controlada sem fallback", async (t) => {
  t.mock.method(console, "error", () => {});
  const pool = { query: t.mock.fn() };
  const { registrarAuditoria } = carregarService(pool);
  const original = new Error("Falha simulada.");
  const executor = { query: t.mock.fn(async () => { throw original; }) };
  assert.deepEqual(await registrarAuditoria(paramsValidos, executor), falhaRegistro);
  assert.equal(executor.query.mock.callCount(), 1);
  assert.equal(pool.query.mock.callCount(), 0);
});

test("erro do executor critico chega ao chamador com a mesma identidade", async (t) => {
  t.mock.method(console, "error", () => {});
  const pool = { query: t.mock.fn() };
  const { registrarAuditoria } = carregarService(pool);
  const original = Object.assign(new Error("Falha simulada."), { code: "ERRO_SIMULADO" });
  const executor = { query: t.mock.fn(async () => { throw original; }) };
  await assert.rejects(registrarAuditoria({ ...paramsValidos, critica: true }, executor), (error) => error === original);
  assert.equal(executor.query.mock.callCount(), 1);
  assert.equal(pool.query.mock.callCount(), 0);
});

test("executor explicitamente invalido nunca faz fallback para pool", async (t) => {
  const log = t.mock.method(console, "error", () => {});
  const pool = { query: t.mock.fn() };
  const { registrarAuditoria } = carregarService(pool);
  for (const [name, executor] of [
    ["undefined explicito", undefined], ["null", null], ["objeto sem query", {}],
    ["query nao funcional", { query: "invalida", segredo: "NAO_LOGAR_EXECUTOR" }],
    ["boolean", false], ["numero", 0],
  ]) {
    await t.test(name, async () => {
      assert.deepEqual(await registrarAuditoria(paramsValidos, executor), falhaRegistro);
      await assert.rejects(registrarAuditoria({ ...paramsValidos, critica: true }, executor), {
        code: "AUDITORIA_EXECUTOR_INVALIDO", message: "Executor de auditoria inválido.",
      });
    });
  }
  assert.equal(pool.query.mock.callCount(), 0);
  assert.equal(JSON.stringify(log.mock.calls).includes("NAO_LOGAR_EXECUTOR"), false);
});

test("contrato invalido nao chama executor nem pool e preserva codigos", async (t) => {
  t.mock.method(console, "error", () => {});
  const pool = { query: t.mock.fn() };
  const executor = { query: t.mock.fn() };
  const { registrarAuditoria } = carregarService(pool);
  for (const [params, code] of [
    [{ ...paramsValidos, acao: "" }, "AUDITORIA_ACAO_INVALIDA"],
    [{ ...paramsValidos, modulo: "x" }, "AUDITORIA_MODULO_INVALIDO"],
  ]) {
    assert.equal((await registrarAuditoria(params, executor)).code, code);
    await assert.rejects(registrarAuditoria({ ...params, critica: true }, executor), { code });
  }
  assert.equal((await registrarAuditoria()).code, "AUDITORIA_ACAO_INVALIDA");
  assert.equal(pool.query.mock.callCount(), 0);
  assert.equal(executor.query.mock.callCount(), 0);
});

test("falhas de chamadas antigas no pool preservam semantica critica", async (t) => {
  t.mock.method(console, "error", () => {});
  const original = new Error("Falha simulada do pool.");
  const pool = { query: t.mock.fn(async () => { throw original; }) };
  const { registrarAuditoria } = carregarService(pool);
  assert.deepEqual(await registrarAuditoria(paramsValidos), falhaRegistro);
  await assert.rejects(registrarAuditoria({ ...paramsValidos, critica: true }), (error) => error === original);
  assert.equal(pool.query.mock.callCount(), 2);
});
