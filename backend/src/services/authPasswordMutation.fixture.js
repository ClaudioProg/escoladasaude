"use strict";
// Transactional MODEL: serial scheduling and staged state, not a PostgreSQL emulator.
// Trigger effects below are modeled invariants; real constraints/locks remain unproved.
const assert = require("node:assert/strict");
const Module = require("node:module");
const { createPasswordMutationService } = require("./authPasswordMutationService");
const passwordService = require("./passwordService");
const auditPath = require.resolve("./auditoriaService");
const originalLoad = Module._load, cachedAudit = require.cache[auditPath];
let canonicalAudit;
try {
  Module._load = function(request, parent, isMain) {
    if (parent?.filename === auditPath && request === "../db") return { query: () => assert.fail("No global audit pool") };
    return originalLoad.call(this, request, parent, isMain);
  };
  delete require.cache[auditPath];
  canonicalAudit = require("./auditoriaService").registrarAuditoria;
} finally {
  Module._load = originalLoad;
  delete require.cache[auditPath];
  if (cachedAudit) require.cache[auditPath] = cachedAudit;
}
function fixture(hash, options = {}) {
  let serial = Promise.resolve(), sequence = 30n, revision = 100n, auditSequence = 1;
  const f = { calls: [], decisions: [], active: 0, transactions: 0, fail: null, failCommit: false,
    mode: { isolation: "read committed", read_only: "off" }, onQuery: null,
    allowPrepare: true, allowMutate: true, auditResult: null,
    state: { user: { id: 7, senha: hash, auth_version: 3, deleted_at: null, nome: "Pessoa Exemplo",
      cpf: "12345678909", email: "pessoa@example.invalid", celular: "11987654321",
      data_nascimento: "1985-04-23", credential_revision: "100" },
    history: [], sessions: [{ id: "session-a", usuario_id: 7, revogada_em: null },
      { id: "session-b", usuario_id: 7, revogada_em: null }, { id: "session-c", usuario_id: 8, revogada_em: null }],
    contexts: [{ usuario_id: 7 }, { usuario_id: 8 }], proofs: [{ usuario_id: 7 }, { usuario_id: 8 }],
    audits: [], operation: null },
    bump(fields) { Object.assign(f.state.user, fields, { credential_revision: String(++revision) }); },
    addHistory(h) { f.state.history.unshift({ id: String(++sequence), senha_hash: h, history_revision: String(++revision) }); },
  };
  f.db = { async tx(action) {
    f.transactions++;
    const prior = serial; let release;
    serial = new Promise(resolve => { release = resolve; });
    await prior;
    f.active++;
    let staged = structuredClone(f.state), saved;
    async function query(sql, params = [], facade = false) {
      let tag = sql.match(/password-mutation:([\w-]+)/)?.[1];
      if (!tag) tag = sql.startsWith("SET ") ? "set" : sql.startsWith("SAVEPOINT") ? "savepoint" :
        sql.startsWith("ROLLBACK TO") ? "rollback-savepoint" : sql.startsWith("RELEASE") ? "release" :
        /UPDATE public.auth_sessao/.test(sql) ? "revoke" : /INSERT INTO auditoria_eventos/.test(sql) ? "audit" : sql;
      f.calls.push({ tag, sql, params: structuredClone(params), executor, facade });
      if (facade && !["revoke", "audit"].includes(tag)) assert.fail("Sensitive queries cannot use the logging facade");
      if (f.onQuery) await f.onQuery(tag, staged, params);
      if (f.fail === tag) throw new Error("CANARY_DB raw SQL password/hash/cookie");
      const out = (rows = [], rowCount = rows.length) => ({ rows: structuredClone(rows), rowCount });
      if (tag === "set") return out();
      if (tag === "savepoint") { saved = structuredClone(staged); return out(); }
      if (tag === "rollback-savepoint") { staged = structuredClone(saved); return out(); }
      if (tag === "release") { saved = null; return out(); }
      if (tag === "transaction") return out([f.mode]);
      if (tag === "user") return out(staged.user?.id === params[0] ? [staged.user] : []);
      if (tag === "history") return out([...staged.history].sort((a, b) => BigInt(a.id) > BigInt(b.id) ? -1 : 1).slice(0, 5));
      if (tag === "update") {
        const u = staged.user;
        if (u.id !== params[1] || u.auth_version !== params[2] || u.senha !== params[3] ||
            u.credential_revision !== params[4] || u.deleted_at !== null || u.auth_version >= 2147483647) return out();
        u.senha = params[0]; u.auth_version++; u.credential_revision = String(++revision);
        staged.contexts = staged.contexts.filter(c => c.usuario_id !== u.id);
        staged.proofs = staged.proofs.filter(p => p.usuario_id !== u.id);
        return out([{ id: u.id, auth_version: u.auth_version }]);
      }
      if (tag === "revoke") {
        assert.equal(params[3], null);
        let count = 0;
        for (const session of staged.sessions) if (session.usuario_id === params[0] && session.revogada_em === null) {
          session.revogada_em = params[1]; session.motivo_revogacao = params[2]; count++;
        }
        return out([], count);
      }
      if (tag === "archive") {
        const h = { id: String(++sequence), senha_hash: params[1], history_revision: String(++revision) };
        staged.history.unshift(h); return out([{ id: h.id }]);
      }
      if (tag === "prune") {
        const count = Math.max(0, staged.history.length - 4);
        staged.history = [...staged.history].sort((a, b) => BigInt(a.id) > BigInt(b.id) ? -1 : 1).slice(0, 4);
        return out([], count);
      }
      if (tag === "audit") {
        const id = auditSequence++;
        staged.audits.push({ params: structuredClone(params) });
        return out([{ id }]);
      }
      throw new Error("UNMODELED_MUTATION_QUERY: " + tag);
    }
    const raw = { query: (sql, params) => query(sql, params) };
    const executor = { raw, client: raw, query: (sql, params) => query(sql, params, true),
      model: { get state() { return staged; } } };
    try {
      const result = await action(executor);
      if (f.failCommit) throw new Error("CANARY_COMMIT");
      f.state = staged;
      return result;
    } finally { f.active--; release(); }
  } };
  const passwords = options.passwords || {
    async createNewPasswordHash(...args) { assert.equal(f.active, 0); return passwordService.createNewPasswordHash(...args); },
    async verifyPassword(...args) { assert.equal(f.active, 0); return passwordService.verifyPassword(...args); },
  };
  f.service = createPasswordMutationService({ db: f.db, passwords,
    authorize: options.authorize || (async (decision, executor) => {
      assert.ok(executor.raw); f.decisions.push(decision);
      return decision.phase === "prepare" ? f.allowPrepare : f.allowMutate;
    }),
    registrarAuditoria: async (params, executor) => {
      f.auditArgs = params; f.auditExecutor = executor;
      if (f.auditResult) return f.auditResult;
      return canonicalAudit(params, executor);
    },
  });
  f.args = password => ({ usuarioId: 7, expectedAuthVersion: f.state.user?.auth_version ?? 3, newPassword: password });
  return f;
}
module.exports = { fixture, canonicalAudit };
