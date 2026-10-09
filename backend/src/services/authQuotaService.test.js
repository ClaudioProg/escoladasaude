"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { inspect } = require("node:util");
const { createAuthQuotaService, QUOTA_LOCK_NAMESPACE } = require("./authQuotaService");
const { createQuotaIpHasher, subjectLockKey } = require("./authQuotaIp");

const NOW = "2026-10-09T12:00:00.123456Z";
const SECOND = 1000000n;
const MINUTE = 60n * SECOND;
const HOUR = 60n * MINUTE;
const DAY = 24n * HOUR;
const DENIED = { status: "negada" };
const cfg = () => ({ activeKeyId: "k1", keys: [{ keyId: "k1", secret: Buffer.alloc(32, 7) }] });
const id = (n = 1) => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
const args = (n = 1, extra = {}) => ({ emissaoId: id(n), finalidade: "confirmacao", usuarioId: 7, ...extra });
function micros(value) { return BigInt(Date.parse(value)) * 1000n + BigInt(value.slice(23, 26)); }
function instant(value) {
  const base = new Date(Number(value / 1000n)).toISOString();
  return base.slice(0, 20) + String(value % SECOND).padStart(6, "0") + "Z";
}
const ago = duration => instant(micros(NOW) - duration);
function event(n, duration, extra = {}) {
  return { emissao_id: id(n), finalidade: "recuperacao", usuario_id: 7,
    ip_hmac: null, ip_hmac_key_id: null, registrada_em: ago(duration), ...extra };
}
function ipEvent(n, duration, config = cfg(), extra = {}) {
  const { current } = createQuotaIpHasher(config).identify("192.0.2.1");
  return event(n, duration, { usuario_id: null, ip_hmac: current.digest,
    ip_hmac_key_id: current.keyId, ...extra });
}

// Modelo somente em memoria. Nao e parser/servidor PostgreSQL nem prova de locks reais.
function fixture(initial = [], options = {}) {
  const calls = []; const committed = [...initial]; let pending = []; let snapshot = [];
  let failed = false; let clock = options.clock || NOW;
  const client = { async query(sql, params = []) {
    const tag = sql.match(/quota:([a-z]+)/)?.[1] || sql;
    calls.push({ tag, sql, params });
    if (options.failureAt === tag && (!failed || options.failAlways)) {
      failed = true; throw options.error || Object.assign(new Error("synthetic critical failure"), { code: "40P01" });
    }
    if (options.override?.[tag]) return options.override[tag];
    if (tag === "SAVEPOINT auth_quota_guard") {
      if (options.active === false) throw Object.assign(new Error("outside transaction"), { code: "25P01" });
      snapshot = [...pending]; return { rows: [] };
    }
    if (tag === "ROLLBACK TO SAVEPOINT auth_quota_guard") { pending = [...snapshot]; return { rows: [] }; }
    if (tag === "RELEASE SAVEPOINT auth_quota_guard") return { rows: [] };
    if (tag === "transaction") return { rows: [{ isolamento: options.isolation || "read committed", somente_leitura: options.readOnly || "off" }] };
    if (tag === "user") return { rows: options.missingUser ? [] : [{ id: params[0] }] };
    if (tag === "lock") { if (options.onLock) await options.onLock(params, () => { clock = options.afterLockClock; }); return { rows: [{}] }; }
    if (tag === "clock") return { rows: [{ instante: clock }] };
    const records = [...committed, ...pending];
    if (tag === "keys") return { rows: [{ desconhecida: records.some(e => e.ip_hmac !== null &&
      micros(e.registrada_em) > micros(params[0]) - 15n * MINUTE && !params[1].includes(e.ip_hmac_key_id)) }] };
    if (tag === "replay") return { rows: records.filter(e => e.emissao_id === params[0]) };
    if (tag === "account") {
      const time = micros(params[1]);
      const recent = records.filter(e => e.usuario_id === params[0] && micros(e.registrada_em) > time - DAY);
      const count = window => recent.filter(e => micros(e.registrada_em) > time - window && micros(e.registrada_em) <= time).length;
      return { rows: [{ minuto: count(MINUTE), hora: count(HOUR), dia: count(DAY), futura: recent.some(e => micros(e.registrada_em) > time) }] };
    }
    if (tag === "ip") {
      const time = micros(params[0]);
      const recent = records.filter(e => params[1].some((key, n) => key === e.ip_hmac_key_id &&
        Buffer.isBuffer(e.ip_hmac) && e.ip_hmac.equals(params[2][n])) && micros(e.registrada_em) > time - 15n * MINUTE);
      return { rows: [{ quantidade: recent.filter(e => micros(e.registrada_em) <= time).length,
        futura: recent.some(e => micros(e.registrada_em) > time) }] };
    }
    if (tag === "insert") {
      assert.equal(records.some(e => e.emissao_id === params[0]), false);
      pending.push({ emissao_id: params[0], finalidade: params[1], usuario_id: params[2],
        ip_hmac: params[3], ip_hmac_key_id: params[4], registrada_em: params[5] });
      if (options.badInsert) return { rows: [], rowCount: 0 };
      return { rows: [{ emissao_id: params[0] }], rowCount: 1 };
    }
    assert.fail("SQL inesperado no executor simulado");
  } };
  const tx = { raw: client, client, query() { assert.fail("Facade com logging nao pode ser usada."); } };
  return { tx, calls, committed, pending: () => pending, commit() { committed.push(...pending); pending = []; }, rollback() { pending = []; } };
}
const service = (config = cfg()) => createAuthQuotaService({ hmacConfig: config });
async function decide(initial, request = args(), options) {
  const db = fixture(initial, options);
  const result = await service().registrarEmissao(db.tx, request);
  return { ...db, result };
}

for (const finalidade of ["confirmacao", "alteracao", "recuperacao"]) {
  test("quota: primeira emissao aceita e conta - " + finalidade, async () => {
    const db = await decide([], args(1, { finalidade, ip: "192.0.2.1" }));
    assert.deepEqual(db.result, { status: "aceita", repetida: false, registradaEm: NOW });
    assert.equal(db.pending().length, 1); assert.equal(db.committed.length, 0);
    assert.equal(db.pending()[0].finalidade, finalidade);
    db.commit(); assert.equal(db.committed.length, 1);
  });
}
for (const [label, request, hasAccount, hasIp] of [
  ["conta", args(), true, false],
  ["IP", args(1, { usuarioId: null, ip: "192.0.2.1" }), false, true],
  ["conta e IP", args(1, { ip: "192.0.2.1" }), true, true],
]) test("quota: sujeitos " + label, async () => {
  const db = await decide([], request);
  assert.equal(db.pending().length, 1);
  assert.equal(db.calls.some(c => c.tag === "account"), hasAccount);
  assert.equal(db.calls.some(c => c.tag === "ip"), hasIp);
  assert.equal(db.pending()[0].usuario_id, hasAccount ? 7 : null);
  assert.equal(db.pending()[0].ip_hmac === null, !hasIp);
});

for (const [label, age, accepted] of [["antes", MINUTE - 1n, false], ["igual", MINUTE, true], ["depois", MINUTE + 1n, true]]) {
  test("quota: fronteira de 60s com microssegundo " + label, async () => {
    const db = await decide([event(99, age)]);
    assert.equal(db.result.status, accepted ? "aceita" : "negada");
  });
}
for (const [windowName, window, limit, ip] of [["1h", HOUR, 5, false], ["24h", DAY, 10, false], ["15min", 15n * MINUTE, 10, true]]) {
  for (const [label, age, accepted] of [["antes", window - 1n, false], ["igual", window, true], ["depois", window + 1n, true]]) {
    test("quota: fronteira " + windowName + " com microssegundo " + label, async () => {
      const records = Array.from({ length: limit }, (_, n) => (ip ? ipEvent : event)(100 + n, age + BigInt(n) * MINUTE,
        ...(ip ? [] : [{ finalidade: ["confirmacao", "alteracao", "recuperacao"][n % 3] }])));
      // limit-1 dentro da janela, separados por >=60s e fora da janela menor.
      for (let n = 1; n < limit; n++) records[n].registrada_em = ago(ip ? MINUTE * BigInt(n) : (window === DAY ? 2n * HOUR : MINUTE * BigInt(n + 1)));
      const db = await decide(records, args(1, ip ? { usuarioId: null, ip: "192.0.2.1" } : {}));
      assert.equal(db.result.status, accepted ? "aceita" : "negada");
      assert.equal(db.pending().length, accepted ? 1 : 0);
    });
  }
}
for (const [label, records, request, expected] of [
  ["quinta por conta", Array.from({ length: 4 }, (_, n) => event(100 + n, BigInt(n + 2) * MINUTE)), args(), "aceita"],
  ["sexta por conta", Array.from({ length: 5 }, (_, n) => event(100 + n, BigInt(n + 2) * MINUTE)), args(), "negada"],
  ["decima por conta", Array.from({ length: 9 }, (_, n) => event(100 + n, 2n * HOUR)), args(), "aceita"],
  ["decima primeira por conta", Array.from({ length: 10 }, (_, n) => event(100 + n, 2n * HOUR)), args(), "negada"],
  ["decima por IP", Array.from({ length: 9 }, (_, n) => ipEvent(100 + n, 2n * MINUTE)), args(1, { usuarioId: null, ip: "192.0.2.1" }), "aceita"],
  ["decima primeira por IP", Array.from({ length: 10 }, (_, n) => ipEvent(100 + n, 2n * MINUTE)), args(1, { usuarioId: null, ip: "192.0.2.1" }), "negada"],
]) test("quota: " + label, async () => assert.equal((await decide(records, request)).result.status, expected));

test("quota: finalidades misturadas compartilham conta e IP", async () => {
  for (const finalidade of ["confirmacao", "alteracao", "recuperacao"]) {
    const account = Array.from({ length: 5 }, (_, n) => event(100 + n, BigInt(n + 2) * MINUTE,
      { finalidade: ["confirmacao", "alteracao", "recuperacao"][n % 3] }));
    assert.deepEqual((await decide(account, args(1, { finalidade }))).result, DENIED);
    const address = Array.from({ length: 10 }, (_, n) => ipEvent(100 + n, 2n * MINUTE, cfg(),
      { finalidade: ["confirmacao", "alteracao", "recuperacao"][n % 3] }));
    assert.deepEqual((await decide(address, args(1, { finalidade, usuarioId: null, ip: "192.0.2.1" }))).result, DENIED);
  }
});

test("quota: sujeito diferente nao consome quota; ambos devem aprovar", async () => {
  assert.equal((await decide([event(99, 1n, { usuario_id: 8 })])).result.status, "aceita");
  const fullIp = Array.from({ length: 10 }, (_, n) => ipEvent(100 + n, MINUTE));
  const db = await decide(fullIp, args(1, { ip: "192.0.2.1" }));
  assert.deepEqual(db.result, DENIED); assert.equal(db.pending().length, 0);
  assert.equal((await decide([event(99, 1n)], args(1, { ip: "192.0.2.1" }))).result.status, "negada");
  assert.equal((await decide(fullIp, args(1, { usuarioId: null, ip: "192.0.2.2" }))).result.status, "aceita");
});

test("quota: usuario inexistente e limite negado tem mesmo resultado sem identificadores", async () => {
  const absent = await decide([], args(), { missingUser: true });
  const limited = await decide([event(99, 1n)]);
  assert.deepEqual(absent.result, DENIED); assert.deepEqual(limited.result, DENIED);
  for (const db of [absent, limited]) {
    assert.equal(db.calls.some(c => c.tag === "insert"), false);
    assert.ok(db.calls.some(c => c.tag.startsWith("ROLLBACK TO")));
  }
});

test("quota: usuario primeiro; subjects/UUID ordenados e namespace separado", async () => {
  const db = await decide([], args(1, { ip: "192.0.2.1" }));
  const locks = db.calls.filter(c => c.tag === "lock");
  assert.equal(locks.length, 3);
  const keys = locks.map(c => c.params[1]);
  assert.deepEqual(keys, [...keys].sort((a, b) => a - b));
  assert.ok(keys.includes(subjectLockKey("usuario:7")));
  assert.ok(keys.includes(subjectLockKey("emissao:" + id())));
  assert.ok(keys.includes(createQuotaIpHasher(cfg()).identify("192.0.2.1").lockKey));
  assert.ok(locks.every(c => c.params[0] === QUOTA_LOCK_NAMESPACE && /pg_advisory_xact_lock/.test(c.sql)));
  assert.notEqual(QUOTA_LOCK_NAMESPACE, 1163082829);
  const tags = db.calls.map(c => c.tag);
  assert.ok(tags.indexOf("user") < tags.indexOf("lock"));
  assert.ok(tags.lastIndexOf("lock") < tags.indexOf("clock"));
  assert.equal(tags.filter(t => t === "clock").length, 1);
});

test("quota: captura clock somente depois de espera simulada e preserva microssegundos", async () => {
  const after = "2026-10-09T12:01:00.123457Z";
  const db = await decide([event(99, 0n)], args(1, { ip: "192.0.2.1" }), {
    afterLockClock: after, onLock: async (_params, advance) => { await Promise.resolve(); advance(); },
  });
  assert.equal(db.result.status, "aceita");
  assert.equal(db.result.registradaEm, after);
  for (const call of db.calls.filter(c => ["keys", "account", "ip", "insert"].includes(c.tag))) assert.ok(call.params.includes(after));
});

test("quota: SQL usa janelas (t-W,t], sem filtro de finalidade ou horario JS", async () => {
  const db = await decide([], args(1, { ip: "192.0.2.1" }));
  const account = db.calls.find(c => c.tag === "account").sql;
  for (const interval of ["60 seconds", "1 hour", "24 hours"]) assert.ok(account.includes("- interval '" + interval + "'"));
  assert.match(account, /registrada_em > \$2::timestamptz/);
  assert.match(account, /registrada_em <= \$2::timestamptz/);
  assert.match(db.calls.find(c => c.tag === "ip").sql, /registrada_em > \$1::timestamptz - interval '15 minutes'/);
  assert.match(db.calls.find(c => c.tag === "ip").sql, /registrada_em <= \$1::timestamptz/);
  for (const call of db.calls.filter(c => ["account", "ip"].includes(c.tag))) assert.doesNotMatch(call.sql, /finalidade|now\(|clock_timestamp/);
});

for (const ip of [false, true]) test("quota: evento no futuro nega sem escrita - " + (ip ? "IP" : "conta"), async () => {
  const db = await decide([ip ? ipEvent(99, -1n) : event(99, -1n)], args(1, ip ? { usuarioId: null, ip: "192.0.2.1" } : {}));
  assert.deepEqual(db.result, DENIED); assert.equal(db.pending().length, 0);
});

test("quota: rollback externo desfaz aceita; servico nao confirma transacao", async () => {
  const db = await decide([], args());
  assert.equal(db.pending().length, 1); db.rollback();
  assert.equal(db.pending().length, 0); assert.equal(db.committed.length, 0);
  assert.ok(db.calls.every(c => !["BEGIN", "COMMIT", "ROLLBACK"].includes(c.sql)));
});

test("quota: replay identico inclusive IPv4-mapped nao conta outra emissao", async () => {
  const old = ipEvent(1, DAY, cfg(), { usuario_id: 7, finalidade: "confirmacao" });
  const db = await decide([old], args(1, { ip: "::ffff:192.0.2.1" }));
  assert.deepEqual(db.result, { status: "aceita", repetida: true, registradaEm: old.registrada_em });
  assert.equal(db.pending().length, 0);
  assert.ok(db.calls.every(c => !["account", "ip", "insert"].includes(c.tag)));
});

test("quota: UUID uppercase representa a mesma emissao", async () => {
  const request = { ...args(), emissaoId: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA" };
  const db = await decide([], request);
  assert.equal(db.pending()[0].emissao_id, request.emissaoId.toLowerCase());
});
for (const [label, patch] of [["finalidade", { finalidade: "alteracao" }], ["conta", { usuarioId: 8 }],
  ["IP", { ip: "192.0.2.2" }], ["sujeito adicional", { usuarioId: null }], ["IP removido", { ip: null }]]) {
  test("quota: UUID divergente rejeitado - " + label, async () => {
    const db = fixture([ipEvent(1, HOUR, cfg(), { usuario_id: 7, finalidade: "confirmacao" })]);
    await assert.rejects(service().registrarEmissao(db.tx, args(1, { ip: "192.0.2.1", ...patch })), { code: "AUTH_QUOTA_EMISSAO_DIVERGENTE" });
    assert.equal(db.pending().length, 0);
  });
}

test("quota: versoes HMAC somadas sem reinicio; grava somente ativa", async () => {
  const config = { activeKeyId: "k2", keys: [...cfg().keys, { keyId: "k2", secret: Buffer.alloc(32, 9) }] };
  const db = fixture(Array.from({ length: 10 }, (_, n) => ipEvent(100 + n, MINUTE, n % 2 ? config : cfg())));
  assert.deepEqual(await service(config).registrarEmissao(db.tx, args(1, { usuarioId: null, ip: "192.0.2.1" })), DENIED);
  const fresh = fixture();
  await service(config).registrarEmissao(fresh.tx, args(1, { usuarioId: null, ip: "192.0.2.1" }));
  assert.equal(fresh.pending()[0].ip_hmac_key_id, "k2"); assert.equal(fresh.pending().length, 1);
  const old = fixture([ipEvent(1, MINUTE, cfg(), { usuario_id: 7, finalidade: "confirmacao" })]);
  assert.equal((await service(config).registrarEmissao(old.tx, args(1, { ip: "192.0.2.1" }))).repetida, true);
});

test("quota: versao ativa desconhecida na janela impede omissao silenciosa", async () => {
  const other = { activeKeyId: "k2", keys: [{ keyId: "k2", secret: Buffer.alloc(32, 9) }] };
  const db = fixture([ipEvent(99, MINUTE, other)]);
  await assert.rejects(service().registrarEmissao(db.tx, args(1, { usuarioId: null, ip: "192.0.2.1" })), { code: "AUTH_QUOTA_HMAC_VERSAO_AUSENTE" });
  assert.equal(db.pending().length, 0);
  assert.equal((await decide([ipEvent(99, 15n * MINUTE, other)], args(1, { usuarioId: null, ip: "192.0.2.1" }))).result.status, "aceita");
});

for (const [label, request] of [["ausente", undefined], ["null", null], ["array", []],
  ["UUID invalido", args(1, { emissaoId: "bad" })], ["UUID espaco", args(1, { emissaoId: id() + " " })],
  ["finalidade invalida", args(1, { finalidade: "CONFIRMACAO" })], ["sujeitos vazios", args(1, { usuarioId: null })],
  ["conta string", args(1, { usuarioId: "7" })], ["conta zero", args(1, { usuarioId: 0 })],
  ["conta fracao", args(1, { usuarioId: 1.5 })], ["conta overflow", args(1, { usuarioId: 2147483648 })],
  ["conta NaN", args(1, { usuarioId: NaN })], ["campo extra", args(1, { email: "unused" })]]) {
  test("quota: argumento estrito " + label, async () => {
    const db = fixture();
    await assert.rejects(service().registrarEmissao(db.tx, request), { code: "AUTH_QUOTA_ARGUMENTO_INVALIDO" });
    assert.equal(db.calls.length, 0);
  });
}
for (const executor of [null, undefined, {}, { query() {} }, { query() {}, raw: { query() {} }, client: {} }]) {
  test("quota: executor explicito obrigatorio " + inspect(executor), async () =>
    assert.rejects(service().registrarEmissao(executor, args()), { code: "AUTH_QUOTA_EXECUTOR_INVALIDO" }));
}

test("quota: nao le ambiente nem usa segredo default; conta isolada dispensa HMAC", async () => {
  const s = createAuthQuotaService(); const db = fixture();
  await assert.rejects(s.registrarEmissao(db.tx, args(1, { ip: "192.0.2.1" })), { code: "AUTH_QUOTA_HMAC_CONFIG_AUSENTE" });
  assert.equal(db.calls.length, 0);
  assert.equal((await s.registrarEmissao(db.tx, args())).status, "aceita");
  assert.throws(() => createAuthQuotaService({ fallback: true }), { code: "AUTH_QUOTA_CONFIG_INVALIDA" });
});

for (const [label, options] of [["autocommit", { active: false }], ["repeatable read", { isolation: "repeatable read" }],
  ["serializable", { isolation: "serializable" }], ["read only", { readOnly: "on" }]]) {
  test("quota: rejeita modo de transacao " + label, async () => {
    const db = fixture([], options);
    await assert.rejects(service().registrarEmissao(db.tx, args()), { code: options.active === false ? "AUTH_QUOTA_DB_FALHOU" : "AUTH_QUOTA_TRANSACAO_INVALIDA" });
    assert.equal(db.pending().length, 0); assert.ok(db.calls.every(c => c.tag !== "lock"));
  });
}

test("quota: proibe segunda emissao/concorrencia no mesmo executor para preservar ordem global", async () => {
  const db = fixture(); const s = service();
  const first = s.registrarEmissao(db.tx, args());
  await assert.rejects(s.registrarEmissao(db.tx, args(2)), { code: "AUTH_QUOTA_EXECUTOR_REUTILIZADO" });
  await first;
  await assert.rejects(service().registrarEmissao(db.tx, args(3)), { code: "AUTH_QUOTA_EXECUTOR_REUTILIZADO" });
  assert.equal(db.pending().length, 1);
});

for (const tag of ["transaction", "user", "lock", "clock", "keys", "replay", "account", "ip", "insert", "RELEASE SAVEPOINT auth_quota_guard"]) {
  test("quota: falha PostgreSQL sanitizada sem retry - " + tag, async () => {
    const sensitive = "synthetic-secret-IP-digest-token";
    const db = fixture([], { failureAt: tag, error: Object.assign(new Error(sensitive), { code: "40P01", detail: sensitive }) });
    await assert.rejects(service().registrarEmissao(db.tx, args(1, { ip: "192.0.2.1" })), error => {
      assert.equal(error.code, "AUTH_QUOTA_DB_FALHOU");
      assert.equal(inspect(error).includes(sensitive), false); assert.equal(error.cause, undefined);
      return true;
    });
    assert.equal(db.pending().length, 0); assert.equal(db.committed.length, 0);
    assert.equal(db.calls.filter(c => c.tag === tag).length, tag.startsWith("RELEASE") ? 2 : 1);
  });
}

test("quota: rollback do proprio INSERT diante de resposta invalida", async () => {
  const db = fixture([], { badInsert: true });
  await assert.rejects(service().registrarEmissao(db.tx, args()), { code: "AUTH_QUOTA_DB_RESULTADO_INVALIDO" });
  assert.equal(db.pending().length, 0);
});

test("quota: falha no rollback e critica, sem sucesso/fallback", async () => {
  const db = fixture([event(99, 1n)], { failureAt: "ROLLBACK TO SAVEPOINT auth_quota_guard", failAlways: true });
  await assert.rejects(service().registrarEmissao(db.tx, args()), { code: "AUTH_QUOTA_ROLLBACK_FALHOU" });
});

for (const [tag, override] of [["clock", { rows: [{ instante: "Infinity" }] }], ["clock", { rows: [] }],
  ["user", { rows: [{ id: 8 }] }], ["keys", { rows: [{ desconhecida: "false" }] }],
  ["account", { rows: [{ minuto: -1, hora: 0, dia: 0, futura: false }] }],
  ["ip", { rows: [{ quantidade: "0", futura: false }] }], ["replay", { rows: null }]]) {
  test("quota: resposta PostgreSQL invalida " + tag + inspect(override), async () => {
    const db = fixture([], { override: { [tag]: override } });
    await assert.rejects(service().registrarEmissao(db.tx, args(1, { ip: "192.0.2.1" })), { code: "AUTH_QUOTA_DB_RESULTADO_INVALIDO" });
    assert.equal(db.pending().length, 0);
  });
}

test("quota: modulos isolados sem HTTP, db global, SMTP, logs, segredos env ou limpeza", () => {
  for (const name of ["authQuotaService.js", "authQuotaIp.js"]) {
    const source = fs.readFileSync(require.resolve("./" + name), "utf8");
    assert.doesNotMatch(source, /console\.|process\.env|x-forwarded-for|req\.|nodemailer|require\(["'](?:\.\.\/db|express)/i);
    assert.doesNotMatch(source, /DELETE FROM|UPDATE public\.|BEGIN["']|COMMIT["']/);
  }
  for (const name of ["../routes/authPublicRoute.js", "../controllers/authUsuarioController.js", "../server.js"]) {
    assert.doesNotMatch(fs.readFileSync(require.resolve(name), "utf8"), /require\([^\n]*authQuota/);
  }
});


test("quota: UUID rejeita terminador final antes de consultar", async () => {
  const db = fixture();
  await assert.rejects(service().registrarEmissao(db.tx, args(1, { emissaoId: id() + "\n" })), { code: "AUTH_QUOTA_ARGUMENTO_INVALIDO" });
  assert.equal(db.calls.length, 0);
});

test("quota: primeira emissao confirmada bloqueia proxima na mesma conta", async () => {
  const first = await decide([], args()); first.commit();
  const next = await decide(first.committed, args(2, { finalidade: "recuperacao" }));
  assert.deepEqual(next.result, DENIED); assert.equal(next.pending().length, 0);
});

// db.tx real, mas pg/pool/cliente inteiramente simulados e nenhum import do db global.
function actualDbWithFakeClient(db, failure = null) {
  const vm = require("node:vm");
  const commands = []; const logs = []; const query = db.tx.raw.query.bind(db.tx.raw);
  const client = { async query(sql, params) {
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) {
      commands.push(sql);
      if (sql === "COMMIT" && failure === "commit") throw new Error("synthetic commit failure");
      if (sql === "COMMIT") db.commit();
      if (sql === "ROLLBACK") db.rollback();
      return { rows: [] };
    }
    return query(sql, params);
  }, release() { commands.push("release"); } };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve("../db"), "utf8"), {
    module, exports: module.exports, URL, Buffer, Date,
    process: { env: { NODE_ENV: "production", DATABASE_URL: "postgresql://dummy:dummy@127.0.0.1:1/etapa09_dummy", LOG_SQL: "true" } },
    console: Object.fromEntries(["log", "warn", "error"].map(level => [level, (...args) => logs.push(args)])),
    require(name) {
      assert.equal(name, "pg");
      return { Pool: class { on() {} async connect() { return client; } query() { assert.fail("Pool global proibido."); } } };
    },
  });
  return { api: module.exports, commands, logs };
}

for (const outcome of ["accept", "denied", "caller-failure", "commit-failure"]) {
  test("quota: contrato com db.tx real e cliente simulado - " + outcome, async () => {
    const db = fixture(outcome === "denied" ? [event(99, 1n)] : []);
    const actual = actualDbWithFakeClient(db, outcome === "commit-failure" ? "commit" : null);
    const run = () => actual.api.tx(async tx => {
      const result = await service().registrarEmissao(tx, args(1, { ip: "192.0.2.1" }));
      if (outcome === "caller-failure") throw new Error("synthetic challenge/outbox failure");
      return result;
    });
    if (outcome.endsWith("failure")) {
      await assert.rejects(run());
      assert.equal(db.committed.length, 0); assert.equal(db.pending().length, 0);
      assert.deepEqual(actual.commands, outcome === "commit-failure"
        ? ["BEGIN", "COMMIT", "ROLLBACK", "release"] : ["BEGIN", "ROLLBACK", "release"]);
    } else {
      const result = await run();
      assert.equal(result.status, outcome === "accept" ? "aceita" : "negada");
      assert.equal(db.committed.length, outcome === "accept" ? 1 : 1);
      assert.equal(db.pending().length, 0);
      assert.deepEqual(actual.commands, ["BEGIN", "COMMIT", "release"]);
    }
    assert.equal(actual.logs.length, 0, "Nem logging de parametros da facade.");
  });
}
