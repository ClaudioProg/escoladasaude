"use strict";
// Transactional MODEL only. Does not execute PostgreSQL or prove physical locking.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { createReauthenticationService } = require("./authReauthenticationService");
const START = "2026-10-15T12:00:00.000000Z";
const SID = "14000000-0000-4000-8000-000000000001";
const OTHER_SID = "14000000-0000-4000-8000-000000000002";
const COOKIE = Buffer.alloc(32, 41).toString("base64url");
const OTHER_COOKIE = Buffer.alloc(32, 42).toString("base64url");
const hash = token => crypto.createHash("sha256").update(token).digest();
const micros = value => BigInt(Date.parse(value)) * 1000n + BigInt(value.slice(23, 26));
function stamp(value) {
  const ms = value / 1000n, remainder = value % 1000n;
  return new Date(Number(ms)).toISOString().replace(/(\d{3})Z$/, (_, digits) => digits + String(remainder).padStart(3, "0") + "Z");
}
function fixture(options = {}) {
  const start = micros(START);
  let clock = start, serial = Promise.resolve();
  const session = (id, token) => ({ id, usuario_id: 7, token_hash: hash(token), revogada_em: null,
    criada_em: START, ultimo_uso_em: START, expira_em: stamp(start + 1800000000n), limite_absoluto_em: null });
  const f = { calls: [], fail: null, onQuery: null, failAudit: false, failCommit: false,
    policy: { windowMs: 900000, maxAccount: 3 },
    state: { user: { id: 7, senha: "stored-hash", auth_version: 1, email_version: 1, deleted_at: null,
      credential_revision: "100" }, profiles: ["usuario"],
      sessions: { [SID]: session(SID, COOKIE), [OTHER_SID]: session(OTHER_SID, OTHER_COOKIE) },
      proofs: {}, attempts: [], audits: [], operation: null },
    at(seconds, extra = 0n) { clock = start + BigInt(seconds) * 1000000n + extra; },
    now: () => stamp(clock),
    critical(fields) {
      Object.assign(f.state.user, fields);
      f.state.user.credential_revision = String(Number(f.state.user.credential_revision) + 1);
      f.state.proofs = {}; // Models NEW trigger; source/real DB proof remains separate.
    },
    revoke(sid = SID) {
      f.state.sessions[sid].revogada_em = stamp(clock);
      for (const [key, proof] of Object.entries(f.state.proofs)) if (proof.sessao_id === sid) delete f.state.proofs[key];
    },
  };
  const valid = s => s && s.usuario_id === 7 && s.revogada_em === null &&
    micros(s.criada_em) <= clock && micros(s.ultimo_uso_em) <= clock && micros(s.expira_em) > clock &&
    (s.limite_absoluto_em === null || micros(s.limite_absoluto_em) > clock);
  f.db = { async tx(action) {
    const before = serial; let unlock;
    serial = new Promise(resolve => { unlock = resolve; });
    await before;
    let staged = structuredClone(f.state), saved;
    const raw = { async query(sql, params = []) {
      const tag = sql.match(/reauth:([\w-]+)/)?.[1] ?? sql;
      f.calls.push({ tag, sql, params });
      if (f.onQuery) await f.onQuery(tag, params, staged);
      if (f.fail === tag) throw new Error("SECRET_DB password=synthetic token=synthetic SQL");
      const out = (rows = []) => ({ rows: structuredClone(rows), rowCount: rows.length });
      if (sql.startsWith("SET ")) return out();
      if (sql.startsWith("SAVEPOINT")) { saved = structuredClone(staged); return out(); }
      if (sql.startsWith("ROLLBACK TO")) { staged = saved; return out(); }
      if (sql.startsWith("RELEASE SAVEPOINT")) { saved = null; return out(); }
      if (tag === "transaction") return out([{ isolamento: "read committed", somente_leitura: "off" }]);
      if (tag === "hint") return out(Object.values(staged.sessions)
        .filter(s => Buffer.from(s.token_hash).equals(params[0])).map(s => ({ id: s.id, usuario_id: s.usuario_id })));
      if (tag === "user") return out(staged.user && staged.user.id === params[0] ? [staged.user] : []);
      if (tag === "profiles") return out(staged.profiles.map(perfil_codigo => ({ perfil_codigo })));
      if (tag === "session") {
        const s = staged.sessions[params[0]];
        return out(s && s.usuario_id === params[1] && Buffer.from(s.token_hash).equals(params[2]) ? [s] : []);
      }
      if (tag === "valid") return out([{ valid: valid(staged.sessions[params[0]]) }]);
      if (tag === "reserve") {
        const recent = staged.attempts.filter(a => a.usuario_id === params[1] && micros(a.registrada_em) > clock - BigInt(params[2]) * 1000n);
        if (recent.length >= params[3]) return out();
        staged.attempts.push({ id: params[0], usuario_id: params[1], registrada_em: stamp(clock) });
        return out([{ id: params[0] }]);
      }
      if (tag === "issue") {
        const s = staged.sessions[params[2]], u = staged.user;
        if (!valid(s) || u.deleted_at !== null || u.id !== params[3] || u.auth_version !== params[5] ||
            !Buffer.from(s.token_hash).equals(params[4])) return out();
        const key = params[0].toString("hex");
        if (staged.proofs[key]) throw new Error("UNIQUE_VIOLATION");
        staged.proofs[key] = { token_hash: params[0], sessao_id: s.id, usuario_id: u.id,
          auth_version_esperada: u.auth_version, finalidade: params[1], criada_em: stamp(clock),
          expira_em: stamp(clock + 300000000n), consumida_em: null };
        return out([{ expira_em: staged.proofs[key].expira_em }]);
      }
      if (tag === "proof") {
        const p = staged.proofs[params[0].toString("hex")];
        return out(p && p.sessao_id === params[1] && p.usuario_id === params[2] && p.finalidade === params[3] ? [p] : []);
      }
      if (tag === "consume") {
        const p = staged.proofs[params[0].toString("hex")], s = staged.sessions[params[2]], u = staged.user;
        if (!p || p.finalidade !== params[1] || p.sessao_id !== params[2] || p.usuario_id !== params[3] ||
            p.auth_version_esperada !== u.auth_version || u.auth_version !== params[5] || u.deleted_at !== null ||
            !valid(s) || !Buffer.from(s.token_hash).equals(params[4]) || p.consumida_em !== null ||
            micros(p.criada_em) > clock || micros(p.expira_em) <= clock || micros(p.expira_em) !== micros(p.criada_em) + 300000000n) return out();
        p.consumida_em = stamp(clock);
        return out([{ finalidade: p.finalidade }]);
      }
      throw new Error("UNMODELLED_REAUTH_QUERY: " + tag);
    } };
    const executor = { raw, client: raw, query: () => assert.fail("Sensitive params cannot use logging facade"),
      model: { get state() { return staged; } } };
    try {
      const result = await action(executor);
      if (f.failCommit) throw new Error("SECRET_COMMIT");
      f.state = staged; return result;
    } finally { unlock(); }
  } };
  f.audit = async (args, executor) => {
    if (f.failAudit) throw new Error("SECRET_AUDIT");
    assert.equal(args.critica, true);
    executor.model.state.audits.push(args);
    return { ok: true };
  };
  f.passwords = options.passwords ?? { verifyPassword: async () => ({ authenticated: true, requiresPasswordChange: false }) };
  f.service = createReauthenticationService({ db: f.db, registrarAuditoria: f.audit, passwords: f.passwords,
    attemptPolicy: f.policy, ...options });
  f.issue = (args = {}) => f.service.issue({ cookieToken: COOKIE, password: "synthetic-password", purpose: "trocar_senha", ...args });
  f.consume = (proof, args = {}) => f.db.tx(executor => f.service.consume(executor,
    { cookieToken: COOKIE, proof, purpose: "trocar_senha", ...args }));
  return f;
}
module.exports = { fixture, COOKIE, OTHER_COOKIE, SID, OTHER_SID, START, micros, stamp, hash };
