"use strict";
// SERIAL TRANSACTION MODEL ONLY. No SQL engine, physical locks or PostgreSQL triggers.
// Existing-trigger effects are modeled on every password UPDATE, without bypass.
const assert = require("node:assert/strict");
const Module = require("node:module");
const passwords = require("./passwordService");
const { createLoginHashService } = require("./authLoginHashService");
const controllerPath = require.resolve("../controllers/loginController");
const auditPath = require.resolve("./auditoriaService");
const originalLoad = Module._load, cachedAudit = require.cache[auditPath];
let audit;
try {
  Module._load = function(name, parent, main) {
    if (parent?.filename === auditPath && name === "../db") return { query: () => assert.fail("No global pool") };
    return originalLoad.call(this, name, parent, main);
  };
  delete require.cache[auditPath]; audit = require(auditPath).registrarAuditoria;
} finally {
  Module._load = originalLoad; delete require.cache[auditPath];
  if (cachedAudit) require.cache[auditPath] = cachedAudit;
}
function fixture(hash) {
  let serial = Promise.resolve(), revision = 100, auditId = 1;
  const f = { calls: [], jwt: [], logs: [], active: 0, recoveries: 0, preparations: 0,
    fail: null, failCommit: false, onPrepared: null, onQuery: null, onVerify: null,
    state: { user: { id: 7, nome: "Pessoa Sintetica", email: "synthetic@example.invalid", cpf: "12345678901",
      perfil: "usuario", auth_version: 3, senha: hash, deleted_at: null, credential_revision: "100", imagem_base64: null },
      history: [{ id: "1", senha_hash: "UNCHANGED_HISTORY" }],
      sessions: [{ id: "old-session", usuario_id: 7, revogada_em: null, expira_em: new Date("2099-01-01"),
        limite_absoluto_em: null, criada_em: new Date("2026-01-01"), area_ativa: "usuario" }],
      contexts: [], proofs: [], audits: [] },
    bump(fields) {
      const invalidates = ["senha","auth_version","deleted_at","email","email_version"].some(k => k in fields && fields[k] !== f.state.user[k]);
      Object.assign(f.state.user, fields, { credential_revision: String(++revision) });
      if (invalidates) {
        f.state.contexts = f.state.contexts.filter(c => !f.state.sessions.some(s => s.id === c.sessao_id && s.usuario_id === 7));
        f.state.proofs = f.state.proofs.filter(p => p.usuario_id !== 7);
      }
    },
  };
  const out = (rows = [], count = rows.length) => ({ rows: structuredClone(rows), rowCount: count });
  f.db = {
    async query(sql, params = []) {
      if (/FROM usuarios u/.test(sql)) return out(f.state.user ? [f.state.user] : []);
      if (/UPDATE public.auth_sessao/.test(sql)) {
        const s = f.state.sessions.find(s => s.id === params[0] && s.usuario_id === params[1]);
        if (s) { s.revogada_em = params[2]; s.motivo_revogacao = params[3]; }
        return out(s ? [{ id: s.id }] : []);
      }
      assert.fail("Unmodeled outside query");
    },
    async tx(action) {
      const before = serial; let unlock;
      serial = new Promise(resolve => { unlock = resolve; });
      await before; f.active++;
      let staged = structuredClone(f.state);
      const raw = { query: (sql, params) => query(sql, params, false) };
      const tx = { raw, client: raw, query: (sql, params) => query(sql, params, true),
        model: { get state() { return staged; } } };
      async function query(sql, params = [], facade = false) {
        const tag = sql.match(/login-hash:([\w-]+)/)?.[1] ||
          (sql.startsWith("SET ") ? "set" : sql.includes("SELECT id, auth_version FROM public.usuarios") ? "session-user" :
            sql.includes("SELECT perfil_codigo") ? "profiles" : sql.includes("SELECT ultima_area_ativa") ? "area" :
              sql.includes("ORDER BY criada_em") ? "active" : sql.includes("INSERT INTO public.auth_sessao") ? "session-insert" :
                sql.includes("motivo_revogacao = 'session_limit'") ? "session-limit" :
                  sql.includes("restricted:initialize") ? "initialize-context" : sql.includes("INSERT INTO auditoria_eventos") ? "audit" : sql);
        f.calls.push({ tag, sql, params: structuredClone(params), facade, tx });
        if (f.onQuery) await f.onQuery(tag, staged, params);
        if (f.fail === tag) throw new Error("CANARY_DB raw credentials/hash/SQL");
        if (tag === "set") return out();
        if (tag === "mode") return out([{ isolation: "read committed", read_only: "off" }]);
        if (tag === "session-user") return out(staged.user?.id === params[0] && staged.user.deleted_at === null ?
          [{ id: staged.user.id, auth_version: staged.user.auth_version }] : []);
        if (tag === "user") return out(staged.user?.id === params[0] ? [staged.user] : []);
        if (tag === "sessions") return out(staged.sessions.filter(s => s.usuario_id === params[0]).map(s => ({ id: s.id })));
        if (tag === "security") return out([{ has_context: staged.contexts.some(c =>
          staged.sessions.some(s => s.id === c.sessao_id && s.usuario_id === params[0])),
          has_proof: staged.proofs.some(p => p.usuario_id === params[0]) }]);
        if (tag === "update") {
          const u = staged.user;
          assert.equal(facade, false);
          if (u.id !== params[1] || u.senha !== params[2] || u.auth_version !== params[3] ||
              u.credential_revision !== params[4] || u.deleted_at !== null || u.perfil !== params[5]) return out();
          u.senha = params[0]; u.credential_revision = String(++revision);
          // Both ORIGINAL triggers execute on all hash updates, including technical ones.
          staged.contexts = staged.contexts.filter(c => !staged.sessions.some(s => s.id === c.sessao_id && s.usuario_id === u.id));
          staged.proofs = staged.proofs.filter(p => p.usuario_id !== u.id);
          return out([{ id: u.id, auth_version: u.auth_version, credential_revision: u.credential_revision }]);
        }
        if (tag === "audit") {
          const details = structuredClone(params[10]);
          const id = auditId++;
          staged.audits.push({ id, usuario_id: params[0], acao: params[2], modulo: params[3],
            entidade: params[4], entidade_id: params[5], sucesso: params[6], details,
            revision: staged.user.credential_revision, params: structuredClone(params) });
          return out([{ id }]);
        }
        if (tag === "provenance") return out([{ proven: staged.audits.some(a =>
          a.usuario_id === params[0] && a.acao === "alterar" && a.modulo === "auth" && a.entidade === "usuarios" &&
          a.entidade_id === String(params[0]) && a.sucesso && a.details.origem === "rehash_tecnico_login" &&
          ["upgraded_bcrypt", "rehashed_argon2id"].includes(a.details.tipo) &&
          a.details.revisao_anterior === params[1] && a.details.revisao_nova === params[2] &&
          String(a.details.auth_version) === String(params[3]) && a.revision === params[2]) }]);
        if (tag === "profiles") return out([{ perfil_codigo: "usuario" }]);
        if (tag === "area") return out([{ ultima_area_ativa: "usuario" }]);
        if (tag === "active") return out(staged.sessions.filter(s => s.usuario_id === params[0] &&
          !s.revogada_em && s.expira_em > params[1]).map(s => ({ id: s.id })));
        if (tag === "session-limit") {
          const s = staged.sessions.find(s => s.id === params[0]); if (s) s.revogada_em = params[1]; return out();
        }
        if (tag === "session-insert") {
          staged.sessions.push({ id: params[0], usuario_id: params[1], token_hash: params[2], criada_em: params[3],
            ultimo_uso_em: params[3], expira_em: params[4], limite_absoluto_em: params[5], revogada_em: null, area_ativa: params[7] });
          return out([], 1);
        }
        if (tag === "initialize-context") {
          staged.contexts.push({ sessao_id: params[0], auth_version_esperada: params[2] });
          return out([{ sessao_id: params[0] }]);
        }
        assert.fail("UNMODELED_LOGIN_HASH_QUERY: " + tag);
      }
      try {
        const result = await action(tx);
        if (f.failCommit) throw new Error("CANARY_COMMIT");
        f.state = staged; return result;
      } finally { f.active--; unlock(); }
    },
  };
  f.passwords = {
    ...passwords,
    async verifyPassword(...args) {
      assert.equal(f.active, 0, "Crypto must run outside locks");
      if (f.onVerify) await f.onVerify(...args);
      return passwords.verifyPassword(...args);
    },
    async upgradeLegacyPasswordHash(...args) { assert.equal(f.active, 0); return passwords.upgradeLegacyPasswordHash(...args); },
    async rehashAuthenticatedPassword(...args) { assert.equal(f.active, 0); return passwords.rehashAuthenticatedPassword(...args); },
  };
  f.audit = audit;
  f.hashService = createLoginHashService({ db: f.db, registrarAuditoria: audit, passwords: f.passwords });
  const cachedController = require.cache[controllerPath], loader = Module._load;
  try {
    Module._load = function(name, parent, main) {
      if (parent?.filename === controllerPath) {
        if (name === "../db") return f.db;
        if (name === "../services/passwordService") return f.passwords;
        if (name === "../services/auditoriaService") return { registrarAuditoria: audit };
        if (name === "../auth/generateToken") return (claims, expires) => {
          f.jwt.push({ claims, expires }); return "synthetic.jwt." + f.jwt.length;
        };
        if (name === "./notificacaoController") return { gerarNotificacaoDeAvaliacao: async () => {} };
        if (name === "../services/authLoginHashService") return { createLoginHashService: () => ({
          async prepare(...args) { f.preparations++; const guard = await f.hashService.prepare(...args);
            if (f.onPrepared) await f.onPrepared(f.preparations); return guard; },
          async recover(...args) { f.recoveries++; return f.hashService.recover(...args); },
        }) };
      }
      return loader.call(this, name, parent, main);
    };
    delete require.cache[controllerPath]; f.login = require(controllerPath).loginUsuario;
  } finally {
    Module._load = loader; delete require.cache[controllerPath];
    if (cachedController) require.cache[controllerPath] = cachedController;
  }
  f.run = async (password, { body = {}, jsonError = null, cookieError = null } = {}) => {
    const response = { statusCode: null, body: null, cookies: [], headers: {}, error: null };
    response.set = (name, value) => { response.headers[name] = value; return response; };
    response.status = code => { response.statusCode = code; return response; };
    response.json = value => { if (jsonError) throw jsonError; response.body = value; return response; };
    response.cookie = (...args) => { if (cookieError) throw cookieError; response.cookies.push(args); return response; };
    await f.login({ db: f.db, body: { cpf: "12345678901", senha: password, ...body }, ip: "203.0.113.9",
      headers: { "user-agent": "model-test" } }, response, error => { response.error = error; });
    return response;
  };
  f.issue = kind => f.db.tx(async tx => {
    if (kind === "context") tx.model.state.contexts.push({ sessao_id: "old-session", marker: "must-survive" });
    else tx.model.state.proofs.push({ sessao_id: "old-session", usuario_id: 7, marker: "must-survive" });
  });
  return f;
}
module.exports = { fixture };
