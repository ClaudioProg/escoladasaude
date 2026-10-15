"use strict";
// Modelo transacional para a Etapa 13; nao emula PostgreSQL nem comprova locks reais.
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { createRestrictedContextService } = require("./authRestrictedContextService");
const START = "2026-10-15T15:00:00.000000Z";
const SID = "00000000-0000-4000-8000-000000000013";
const TOKEN = Buffer.alloc(32, 13).toString("base64url");
const stamp = value => new Date(Number(value / 1000n)).toISOString().slice(0, 20) +
  String(value % 1000000n).padStart(6, "0") + "Z";
const micros = value => BigInt(Date.parse(value)) * 1000n + BigInt(value.slice(23, 26));
function fixture() {
  const start = micros(START);
  let clock = start, serial = Promise.resolve();
  const calls = [];
  const f = { calls, sessionWrites: 0, fail: null, onQuery: null, profiles: ["usuario"], token: TOKEN,
    state: {
      user: { id: 7, auth_version: 1, deleted_at: null, email_confirmado_em: null,
        cadastro_pendente_expira_em: null, cargo_id: 1, unidade_id: 2, data_nascimento: "1990-01-01",
        escolaridade_id: 3, deficiencia_id: 4 },
      session: { id: SID, usuario_id: 7, criada_em: START, ultimo_uso_em: START, revogada_em: null,
        expira_em: stamp(start + 21600000000n), limite_absoluto_em: null },
      context: { auth_version_esperada: 1, iniciada_em: START, ultimo_uso_em: START,
        expira_em: stamp(start + 1800000000n), limite_absoluto_em: stamp(start + 7200000000n) },
    },
    at(seconds, extraMicros = 0n) { clock = start + BigInt(seconds) * 1000000n + extraMicros; },
    now: () => stamp(clock),
  };
  f.db = { async tx(action) {
    let unlock;
    const before = serial;
    serial = new Promise(resolve => { unlock = resolve; });
    await before;
    const staged = structuredClone(f.state);
    let sessionWrites = 0;
    const order = [];
    const raw = { async query(sql, params = []) {
      const tag = sql.match(/restricted:([\w-]+)/)?.[1] ?? sql;
      calls.push({ tag, sql, params });
      if (f.onQuery) await f.onQuery(tag, params, staged);
      if (tag === f.fail) throw new Error("SECRET token=synthetic cpf=11111111111 email=synthetic@example.invalid");
      const out = (rows = []) => ({ rows: structuredClone(rows), rowCount: rows.length });
      if (sql.startsWith("SET ")) return out();
      if (tag === "hint") return out(params[0].equals(createHash("sha256").update(TOKEN).digest()) && staged.session ?
        [{ id: staged.session.id, usuario_id: staged.session.usuario_id }] : []);
      if (tag === "user") { order.push("user"); return out(staged.user?.id === params[0] ? [staged.user] : []); }
      if (tag === "profiles") return out(f.profiles.map(perfil_codigo => ({ perfil_codigo })));
      if (tag === "session") { order.push("session"); return out(staged.session ? [staged.session] : []); }
      if (tag === "context") { order.push("context"); return out(staged.context ? [staged.context] : []); }
      if (tag === "clock") return out([{ instante: stamp(clock) }]);
      if (tag === "touch") {
        assert.deepEqual(order, ["user", "session", "context"]);
        const c = staged.context, s = staged.session;
        if (micros(c.expira_em) <= clock || micros(c.limite_absoluto_em) <= clock ||
            micros(s.expira_em) <= clock || s.revogada_em !== null || staged.user.deleted_at !== null ||
            staged.user.auth_version !== c.auth_version_esperada || micros(c.ultimo_uso_em) > clock) return out();
        const absolute = c.limite_absoluto_em;
        c.ultimo_uso_em = stamp(clock);
        c.expira_em = stamp(clock + 1800000000n < micros(absolute) ? clock + 1800000000n : micros(absolute));
        assert.equal(c.limite_absoluto_em, absolute);
        return out([{ ...c }]);
      }
      if (tag === "touch-session") {
        const s = staged.session, use = micros(params[1]);
        const valid = micros(s.expira_em) > use && s.revogada_em === null &&
          (s.limite_absoluto_em === null || micros(s.limite_absoluto_em) > use) &&
          micros(s.ultimo_uso_em) <= use;
        const throttled = sql.includes("AS valid");
        const due = !throttled || use - micros(s.ultimo_uso_em) >= BigInt(params[3]) * 1000n;
        if (valid && due) {
          sessionWrites++;
          s.ultimo_uso_em = params[1];
          const candidate = use + BigInt(throttled ? params[2] : 1800000) * 1000n;
          s.expira_em = stamp(s.limite_absoluto_em !== null && micros(s.limite_absoluto_em) < candidate ?
            micros(s.limite_absoluto_em) : candidate);
        }
        return throttled ? out([{ valid, written: valid && due }]) : out(valid ? [{ id: s.id }] : []);
      }
      if (tag === "revoke") { staged.session.revogada_em = stamp(clock); return out([{ id: staged.session.id }]); }
      throw new Error("UNMODELLED_RESTRICTED_QUERY");
    } };
    try {
      const result = await action({ raw, client: raw, query: () => assert.fail("facade cannot receive sensitive hash") });
      if (f.fail === "commit") throw new Error("SECRET_COMMIT_FIXTURE");
      f.state = staged;
      f.sessionWrites += sessionWrites;
      return result;
    } finally { unlock(); }
  } };
  f.service = createRestrictedContextService({ db: f.db });
  f.access = options => f.service.access({ cookieToken: TOKEN, allowedOperation: true, ...options });
  return f;
}
module.exports = { fixture, START, SID, TOKEN, stamp, micros };
