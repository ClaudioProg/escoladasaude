"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { inspect } = require("node:util");

// Somente dados sintéticos; módulos externos não são carregados pelo sandbox.
const PASSWORD = "SenhaSuperSecreta123!";
const BCRYPT = "$2b$12$abcdefghijklmnopqrstuv123456789012345678901234567890";
const ARGON2 = "$argon2id$v=19$m=19456,t=2,p=1$SALT$HASH";
const EMAIL = "claudio.teste@example.invalid";
const CPF = "123.456.789-09";
const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature";
const TOKEN = "v3SecretToken_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const SENTINELS = [PASSWORD, BCRYPT, ARGON2, EMAIL, CPF, JWT, TOKEN, "a@b.co", "12345678909",
  "11999998888", "22/11/2025", "22-11-2025", "2025-11-22", "Bearer abcdefghijklmnopqrstuvwxyz0123456789",
  "cpf_12345678909", "celular_11999998888", "nascimento_22/11/2025", "(11) 99999-8888",
  "cpf_12345678909_unique", "usuario-secreto", "C:\\Users\\", "/home/usuario-secreto/",
  "22_11_2025", "nascimento_22_11_2025", "nascimento_22_11_2025_check", "data_05_10_2026_idx"];
const captured = [];

function load(t, relativePath, dependencies, env = {}, extras = {}) {
  const logs = [];
  const consoleMock = Object.fromEntries(["log", "info", "warn", "error"].map((level) => [level,
    t.mock.fn((...args) => { logs.push({ level, args }); captured.push(inspect(args, { depth: null })); }),
  ]));
  const filename = path.resolve(__dirname, "..", relativePath);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    module, exports: module.exports, console: consoleMock, Buffer, Date, setTimeout,
    process: { env: { NODE_ENV: "production", ...env } },
    require(request) {
      if (Object.hasOwn(dependencies, request)) return dependencies[request];
      throw new Error(`Dependência externa proibida no teste: ${request}`);
    },
    ...extras,
  }, { filename });
  return { api: module.exports, logs };
}

function cleanLogs(logs) {
  assert.ok(logs.length > 0, "O teste precisa observar logs reais do módulo.");
  const output = inspect(logs, { depth: null });
  for (const sentinel of SENTINELS) assert.equal(output.includes(sentinel), false, "Sentinela vazou em log capturado.");
}

function dbFixture(t, query = async () => ({ rows: [], rowCount: 2 }), client = null) {
  const handlers = {};
  const pool = {
    query: t.mock.fn(query), on: t.mock.fn((event, handler) => { handlers[event] = handler; }),
    connect: t.mock.fn(async () => { assert.ok(client, "Conexão não autorizada nem simulada."); return client; }),
  };
  let tick = 0;
  class Clock extends Date { static now() { return tick++ * 1000; } }
  const loaded = load(t, "src/db/index.js", { pg: { Pool: function () { return pool; } } }, {
    DATABASE_URL: "postgresql://fake.invalid/test", LOG_SQL: "true", LOG_SLOW_SQL: "true", LOG_SLOW_SQL_MS: "1",
  }, { Date: Clock });
  return { ...loaded, pool, handlers };
}

test("DB: redaction genérica protege PII, hashes, JWT, bearer e tokens sem mudar parâmetros", async (t) => {
  const { api, logs, pool } = dbFixture(t);
  const values = [EMAIL, "a@b.co", CPF, "12345678909", 12345678909, BCRYPT,
    BCRYPT.replace("$2b$", "$2a$"), BCRYPT.replace("$2b$", "$2y$"), ARGON2,
    JWT, `Bearer ${JWT}`, TOKEN, "a".repeat(64), "operacao_comum", 7, null,
    { senha: PASSWORD, cookie: TOKEN, csrf: TOKEN, mfa: TOKEN, outbox: PASSWORD,
      email: "x", cpf: "x", celular: "x", data_nascimento: "x", authorization: JWT },
  ];
  await api.query("SELECT $1", values);
  assert.equal(pool.query.mock.calls[0].arguments[1], values);
  assert.equal(pool.connect.mock.callCount(), 0);
  assert.equal(logs.length, 2, "SQL e slow SQL exercitados.");
  for (const { args } of logs) {
    assert.ok(args[1].params.slice(0, 13).every((value) => String(value).startsWith("[REDACTED")));
    assert.equal(args[1].params[13], "operacao_comum");
    assert.equal(args[1].params[14], 7);
    assert.equal(args[1].params[15], null);
    assert.ok(Object.values(args[1].params[16]).every((value) => value === "[REDACTED]"));
  }
  cleanLogs(logs);
});

test("DB: JWT embutido e PII em chaves de objeto também são redigidos", async (t) => {
  const { api, logs } = dbFixture(t);
  await api.query("SELECT $1", [`prefixo ${JWT}`, { [EMAIL]: EMAIL, [TOKEN]: TOKEN }]);
  cleanLogs(logs);
});

test("DB: PII prefixada/sufixada e telefone formatado são redigidos; valores operacionais preservados", async (t) => {
  const result = { rows: [{ id: 7 }], rowCount: 1 };
  const { api, logs, pool } = dbFixture(t, async () => result);
  const pii = ["12345678909", CPF, "cpf_12345678909", "x12345678909y",
    "11999998888", "(11) 99999-8888", "celular_11999998888", "telefone:11999998888",
    "22/11/2025", "22-11-2025", "nascimento_22/11/2025", "nascimento_2025-11-22",
    "Bearer abcdefghijklmnopqrstuvwxyz0123456789"];
  const operational = [7, 503, "tentativa_3", "porta_5432", "lote_12345"];
  const params = [...pii, ...operational, { cpf_12345678909: "privado", celular_11999998888: "privado" }];
  assert.equal(await api.query("SELECT $1", params), result);
  assert.equal(pool.query.mock.calls[0].arguments[0], "SELECT $1");
  assert.equal(pool.query.mock.calls[0].arguments[1], params);
  assert.equal(logs.length, 2, "Log normal e lento.");
  for (const { args } of logs) {
    assert.ok(args[1].params.slice(0, pii.length).every((value) => value.startsWith("[REDACTED")));
    assert.deepEqual(Array.from(args[1].params.slice(pii.length, pii.length + operational.length)), operational);
  }
  cleanLogs(logs);
});

test("DB: identificadores PostgreSQL com PII são redigidos sem alterar throw/SQL/params", async (t) => {
  for (const value of ["cpf_12345678909_unique", "pessoa_11999998888", "x12345678909y", "nascimento_22/11/2025", "(11) 99999-8888"]) {
    const original = Object.assign(new Error(PASSWORD), { code: "23505", constraint: value, table: value, column: value,
      detail: EMAIL, hint: TOKEN });
    const { api, logs, pool } = dbFixture(t, async () => { throw original; });
    const params = [value, 7];
    await assert.rejects(api.query("SELECT $1", params), (error) => error === original);
    assert.equal(pool.query.mock.calls[0].arguments[0], "SELECT $1");
    assert.equal(pool.query.mock.calls[0].arguments[1], params);
    const metadata = logs.at(-1).args[1];
    for (const field of ["constraint", "table", "column"]) {
      assert.ok(metadata[field] === null || metadata[field].startsWith("[REDACTED"));
    }
    assert.equal(metadata.code, "23505");
    cleanLogs(logs);
  }
});

test("DB: datas completas com underscore são redigidas genericamente sem mascarar identificadores operacionais", async (t) => {
  const result = { rows: [{ id: 7 }], rowCount: 1 };
  const { api, logs, pool } = dbFixture(t, async () => result);
  const sensitive = ["22_11_2025", "nascimento_22_11_2025", "nascimento_22_11_2025_check",
    "data_05_10_2026_idx", "22/11/2025", "22-11-2025"];
  const controls = ["versao_2_1_0", "migration_2026_10", "indice_1_2_3", "auth_sessao_usuario_fkey",
    "data_99_99_2025", "data_00_10_2026", "data_31_13_2026", "data_131_12_2026", "data_31_12_20266"];
  const params = [...sensitive, ...controls, { valor: "nascimento_22_11_2025_check" }];
  assert.equal(await api.query("SELECT $1", params), result);
  assert.equal(pool.query.mock.calls[0].arguments[0], "SELECT $1");
  assert.equal(pool.query.mock.calls[0].arguments[1], params);
  assert.equal(logs.length, 2, "Log normal e lento.");
  for (const { args } of logs) {
    assert.ok(args[1].params.slice(0, sensitive.length).every((value) => value === "[REDACTED_DATE]"));
    assert.deepEqual(Array.from(args[1].params.slice(sensitive.length, sensitive.length + controls.length)), controls);
    assert.equal(args[1].params.at(-1).valor, "[REDACTED_DATE]");
  }
  assert.equal(params.at(-1).valor, "nascimento_22_11_2025_check", "Dado original preservado.");
  cleanLogs(logs);
});

test("DB: constraint/table/column redigem datas com underscore e preservam metadados técnicos", async (t) => {
  for (const value of ["22_11_2025", "nascimento_22_11_2025_check", "data_05_10_2026_idx",
    "cpf_12345678909_unique", "celular_11999998888_idx", "auth_sessao_usuario_fkey",
    "versao_2_1_0", "migration_2026_10", "indice_1_2_3"]) {
    const original = Object.assign(new Error(PASSWORD), { code: "23505", constraint: value, table: value, column: value,
      detail: EMAIL, hint: TOKEN });
    const { api, logs, pool } = dbFixture(t, async () => { throw original; });
    const params = [value, 7];
    await assert.rejects(api.query("SELECT $1", params), (error) => error === original);
    assert.equal(pool.query.mock.calls[0].arguments[0], "SELECT $1");
    assert.equal(pool.query.mock.calls[0].arguments[1], params);
    const expected = value === "22_11_2025" ? null // Identificador iniciado por dígito já é omitido.
      : value.startsWith("cpf_") || value.startsWith("celular_") ? "[REDACTED_PERSONAL_NUMBER]"
      : ["nascimento_22_11_2025_check", "data_05_10_2026_idx"].includes(value) ? "[REDACTED_DATE]" : value;
    const metadata = logs.at(-1).args[1];
    for (const field of ["constraint", "table", "column"]) assert.equal(metadata[field], expected);
    for (const field of ["message", "detail", "hint"]) assert.equal(Object.hasOwn(metadata, field), false);
    assert.equal(metadata.code, "23505");
    assert.equal(original.constraint, value, "Erro original preservado.");
    cleanLogs(logs);
  }
});

test("DB: SQL de identidade/auth mascara todos os parâmetros no log normal e lento", async (t) => {
  const { api, logs, pool } = dbFixture(t);
  for (const table of ["usuarios", "public.usuarios", 'public."usuarios"', "auth_recuperacao_senha",
    "auth_email_confirmacao", "auth_sessao", "auth_senha_historico", "auth_usuario_perfis", "auditoria_eventos"]) {
    const sql = `SELECT * FROM ${table} WHERE id = $1`;
    const params = [PASSWORD, "curta", 7];
    await api.query(sql, params);
    assert.equal(pool.query.mock.calls.at(-1).arguments[0], sql);
    assert.equal(pool.query.mock.calls.at(-1).arguments[1], params);
  }
  for (const column of ["senha", "cpf", "email", "celular", "data_nascimento", "token_hash", "auth_version", "email_version"]) {
    await api.query(`SELECT ${column} FROM outra_tabela WHERE id = $1`, [PASSWORD]);
  }
  for (const { args } of logs) assert.equal(args[1].params, "[REDACTED_SENSITIVE_PARAMS]");
  cleanLogs(logs);
});

test("DB: literais e comentários não expõem input no texto SQL do log", async (t) => {
  const { api, logs, pool } = dbFixture(t);
  for (const sql of [`SELECT '${PASSWORD}'`, `SELECT 1 -- ${TOKEN}`, `SELECT 1 /* ${EMAIL} */`, `SELECT $$${JWT}$$`, "SELECT 12345678909", "SELECT cpf_12345678909_unique"]) {
    await api.query(sql);
    assert.equal(pool.query.mock.calls.at(-1).arguments[0], sql);
  }
  for (const { args } of logs) assert.equal(args[1].text, "[REDACTED_SQL_TEXT]");
  cleanLogs(logs);
});

test("DB: error omite message/detail/hint, mantém metadados seguros e relança o mesmo erro", async (t) => {
  const original = Object.assign(new Error(`${EMAIL} ${PASSWORD}`), {
    code: "23505", detail: `Key (email,cpf)=(${EMAIL},${CPF})`, hint: TOKEN,
    constraint: "usuarios_email_key", table: "usuarios", column: "email",
  });
  const { api, logs } = dbFixture(t, async () => { throw original; });
  await assert.rejects(api.query("INSERT INTO usuarios VALUES ($1)", [PASSWORD]), (error) => error === original);
  const errorLog = logs.find(({ level }) => level === "error").args[1];
  assert.equal(errorLog.code, "23505");
  assert.equal(errorLog.constraint, "usuarios_email_key");
  assert.equal(errorLog.table, "usuarios");
  assert.equal(errorLog.column, "email");
  assert.equal(errorLog.params, "[REDACTED_SENSITIVE_PARAMS]");
  for (const field of ["message", "detail", "hint"]) assert.equal(Object.hasOwn(errorLog, field), false);
  cleanLogs(logs);
});

test("DB: metadados externos, pool e falha de rollback não ecoam segredos", async (t) => {
  const original = Object.assign(new Error(PASSWORD), { code: EMAIL, constraint: EMAIL, table: CPF, column: TOKEN });
  const client = { query: t.mock.fn(async (sql) => { if (sql === "ROLLBACK") throw original; }), release: t.mock.fn() };
  const { api, logs, handlers } = dbFixture(t, async () => { throw original; }, client);
  await assert.rejects(api.query("SELECT $1", [EMAIL]), (error) => error === original);
  const errorLog = logs.find(({ level }) => level === "error").args[1];
  assert.equal(errorLog.code, null);
  assert.equal(errorLog.constraint, null);
  assert.equal(errorLog.table, null);
  assert.equal(errorLog.column, null);
  handlers.error(original);
  await assert.rejects(api.tx(async () => { throw original; }), (error) => error === original);
  assert.equal(client.release.mock.callCount(), 1);
  cleanLogs(logs);
});

function mailFixture(t, overrides = {}, sendError = null, verifyError = null) {
  const info = { messageId: `<${EMAIL}>`, accepted: [EMAIL], rejected: [EMAIL], response: EMAIL };
  const transport = {
    sendMail: t.mock.fn(async () => { if (sendError) throw sendError; return info; }),
    verify: t.mock.fn(async () => { if (verifyError) throw verifyError; return true; }),
  };
  const createTransport = t.mock.fn(() => transport);
  return { ...load(t, "src/services/mailer.js", { nodemailer: { createTransport } }, {
    LOG_EMAIL: "true", EMAIL_ENABLED: "true", EMAIL_DRY_RUN: "false", EMAIL_SMTP_HOST: "smtp.example.invalid",
    EMAIL_SMTP_USER: EMAIL, EMAIL_SMTP_PASS: PASSWORD, EMAIL_FROM_NAME: CPF,
    EMAIL_FROM_ADDR: EMAIL, EMAIL_REPLY_TO: EMAIL, ...overrides,
  }), transport, info, createTransport };
}

function mailPayload() {
  return { to: EMAIL, cc: EMAIL, bcc: EMAIL, subject: PASSWORD, html: `<p>${JWT}</p>`, text: TOKEN,
    attachments: [{ filename: CPF, content: BCRYPT }], replyTo: EMAIL, headers: { authorization: JWT } };
}

test("MAILER: dry-run mantém contrato, sem destinatários/conteúdo nos logs e sem envio", async (t) => {
  for (const overrides of [{ EMAIL_ENABLED: "false" }, { EMAIL_DRY_RUN: "true" }]) {
    const { api, logs, transport, createTransport } = mailFixture(t, overrides);
    const result = await api.sendEmail(mailPayload());
    assert.equal(result.dryRun, true);
    assert.equal(result.accepted.length, 0);
    assert.equal(result.rejected.length, 0);
    assert.match(result.messageId, /^dry-run-/);
    assert.equal(result.envelope.to, EMAIL);
    assert.equal(result.envelope.cc, EMAIL);
    assert.equal(result.envelope.bcc, "[HIDDEN]");
    assert.equal(transport.sendMail.mock.callCount(), 0);
    assert.equal(createTransport.mock.callCount(), 0);
    const summary = logs[0].args[1];
    assert.equal(Object.hasOwn(summary, "recipientCount"), false);
    assert.equal(summary.hasTo, true);
    assert.equal(summary.hasCc, true);
    assert.equal(summary.hasBcc, true);
    assert.equal(summary.attachmentCount, 1);
    cleanLogs(logs);
  }
});

test("MAILER: nome com vírgula mantém destinatários/payload e logs usam somente flags", async (t) => {
  for (const dryRun of [false, true]) {
    const { api, logs, transport, info } = mailFixture(t, { EMAIL_DRY_RUN: String(dryRun) });
    const payload = { ...mailPayload(), to: `"Silva, João" <${EMAIL}>`, cc: "", bcc: "" };
    const result = await api.sendEmail(payload);
    assert.equal(transport.sendMail.mock.callCount(), dryRun ? 0 : 1);
    if (dryRun) {
      assert.equal(result.dryRun, true);
      assert.equal(result.envelope.to, payload.to);
    } else {
      assert.equal(result, info);
      const options = transport.sendMail.mock.calls[0].arguments[0];
      for (const key of ["to", "subject", "html", "text", "replyTo", "attachments", "headers"]) {
        assert.equal(options[key], payload[key]);
      }
    }
    const summary = logs.at(-1).args[1];
    assert.equal(Object.hasOwn(summary, "recipientCount"), false);
    assert.equal(summary.hasTo, true);
    assert.equal(summary.hasCc, false);
    assert.equal(summary.hasBcc, false);
    assert.equal(summary.attachmentCount, 1);
    cleanLogs(logs);
  }
});

test("MAILER: config e envio simulado preservam opções/retorno sem PII no console", async (t) => {
  const { api, logs, transport, info, createTransport } = mailFixture(t, { NODE_ENV: "development" });
  assert.equal(await api.sendEmail(mailPayload()), info);
  assert.equal(transport.sendMail.mock.callCount(), 1);
  const options = transport.sendMail.mock.calls[0].arguments[0];
  assert.equal(options.to, EMAIL);
  assert.equal(options.subject, PASSWORD);
  assert.equal(options.html, `<p>${JWT}</p>`);
  assert.equal(options.text, TOKEN);
  assert.equal(options.cc, EMAIL);
  assert.equal(options.bcc, EMAIL);
  assert.equal(options.replyTo, EMAIL);
  assert.equal(options.attachments[0].content, BCRYPT);
  assert.equal(options.headers.authorization, JWT);
  assert.ok(options.from.includes(EMAIL));
  assert.equal(options.sender, EMAIL);
  const config = createTransport.mock.calls[0].arguments[0];
  assert.equal(config.auth.user, EMAIL);
  assert.equal(config.auth.pass, PASSWORD);
  const preview = logs.find(({ args }) => args[0] === "[email] config").args[1];
  assert.equal(preview.smtpUserConfigured, true);
  assert.equal(preview.smtpPassConfigured, true);
  assert.equal(preview.fromAddrConfigured, true);
  assert.equal(preview.replyToConfigured, true);
  assert.equal(preview.port, 465);
  assert.equal(preview.secure, true);
  const sent = logs.find(({ args }) => args[0].includes("E-mail enviado")).args[1];
  for (const key of ["to", "cc", "bcc", "subject", "messageId", "accepted", "rejected", "response"]) assert.equal(Object.hasOwn(sent, key), false);
  cleanLogs(logs);
});

test("MAILER: falha SMTP preserva erro e apenas códigos/comandos seguros", async (t) => {
  for (const operational of [true, false]) {
    const original = Object.assign(new Error(`${EMAIL} ${PASSWORD}`), {
      code: operational ? "EAUTH" : TOKEN, command: operational ? "AUTH PLAIN" : `RCPT TO ${EMAIL}`,
      responseCode: operational ? 535 : EMAIL, response: `${JWT} ${CPF}`, to: EMAIL, subject: PASSWORD,
    });
    const { api, logs, transport } = mailFixture(t, {}, original);
    await assert.rejects(api.sendEmail(mailPayload()), (error) => error === original);
    assert.equal(transport.sendMail.mock.callCount(), 1);
    const logged = logs.at(-1).args[1];
    assert.equal(logged.code, operational ? "EAUTH" : "SMTP_FAILURE");
    assert.equal(logged.command, operational ? "AUTH PLAIN" : null);
    assert.equal(logged.responseCode, operational ? 535 : null);
    cleanLogs(logs);
  }
});

test("MAILER: verify e configuração incompleta não expõem dados e mantêm contratos", async (t) => {
  const original = Object.assign(new Error(EMAIL), { code: "EAUTH", command: PASSWORD, response: TOKEN });
  const { api, logs, transport } = mailFixture(t, {}, null, original);
  assert.equal(await api.verifyTransporter(true), false);
  assert.equal(transport.verify.mock.callCount(), 1);
  cleanLogs(logs);
  const missing = mailFixture(t, { EMAIL_SMTP_PASS: "" });
  assert.equal(await missing.api.verifyTransporter(), false);
  await assert.rejects(missing.api.sendEmail(mailPayload()), (error) => error.code === "EMAIL_NOT_CONFIGURED");
  assert.equal(missing.transport.sendMail.mock.callCount(), 0);
});

function response() {
  return { locals: {}, statusCode: null, body: null, headers: {}, cookies: [],
    set(name, value) { this.headers[name] = value; return this; },
    setHeader(name, value) { this.headers[name] = value; }, getHeader(name) { return this.headers[name]; },
    status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; },
    cookie(...args) { this.cookies.push(args); },
  };
}

function sensitiveRequest() {
  return { body: { cpf: "12345678909", senha: PASSWORD, email: EMAIL, token: JWT, novaSenha: PASSWORD, credential: JWT },
    originalUrl: `/auth/${TOKEN}?email=${EMAIL}`, url: `/auth/${TOKEN}`, ip: EMAIL, requestId: TOKEN,
    headers: { authorization: `Bearer ${JWT}`, cookie: TOKEN, "user-agent": PASSWORD, origin: EMAIL },
    method: "POST", get(name) { return this.headers[name]; } };
}

test("AUTH LOGIN: erro externo e notificação não vazam; resposta/token e next preservados", async (t) => {
  const original = Object.assign(new Error(SENTINELS.join(" ")), { code: TOKEN });
  const user = { id: 7, email: EMAIL, cpf: "12345678909", senha: BCRYPT, perfil: "usuario" };
  const dependencies = {
    bcrypt: { compare: async () => true }, "../db": { query: async () => ({ rows: [user] }) },
    "../auth/generateToken": () => JWT, "./notificacaoController": { gerarNotificacaoDeAvaliacao: async () => { throw original; } },
    "../services/authSessionService": { createAuthSessionService: () => ({ createSession: async () => ({ token: TOKEN, session: { id: "s1" } }) }) },
    "../auth/authSessionMiddleware": { sessionCookieName: () => "session", sessionCookieOptions: () => ({ httpOnly: true }) },
  };
  const success = load(t, "src/controllers/loginController.js", dependencies, { NODE_ENV: "development" });
  const res = response();
  await success.api.loginUsuario(sensitiveRequest(), res, assert.fail);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.token, JWT);
  assert.equal(res.cookies[0][1], TOKEN);
  cleanLogs(success.logs);
  const failure = load(t, "src/controllers/loginController.js", { ...dependencies,
    "../auth/generateToken": () => { throw original; },
  }, { NODE_ENV: "development" });
  let forwarded;
  await failure.api.loginUsuario(sensitiveRequest(), response(), (error) => { forwarded = error; });
  assert.equal(forwarded, original);
  cleanLogs(failure.logs);
});

test("AUTH GOOGLE: e-mail em sucesso/rejeições e erro de provedor ficam fora dos logs", async (t) => {
  for (const scenario of ["unverified", "missing", "deleted", "invalid_profile", "success", "error"]) {
    let handler;
    const router = { post(route, callback) { assert.equal(route, "/google"); handler = callback; } };
    const original = new Error(SENTINELS.join(" "));
    const user = { id: 7, email: EMAIL, cpf: CPF, perfil: scenario === "invalid_profile" ? TOKEN : "usuario",
      deleted_at: scenario === "deleted" ? new Date() : null };
    const { logs } = load(t, "src/auth/authGoogle.js", {
      express: { Router: () => router }, "../db": { query: async () => ({ rows: scenario === "missing" ? [] : [user] }) },
      "./generateToken": () => JWT, "google-auth-library": { OAuth2Client: class {
        async verifyIdToken() { if (scenario === "error") throw original;
          return { getPayload: () => ({ email: EMAIL, email_verified: scenario !== "unverified" }) }; }
      } },
    }, { NODE_ENV: "development", GOOGLE_CLIENT_ID: "synthetic-client" });
    const res = response();
    await handler(sensitiveRequest(), res);
    assert.equal(res.statusCode, scenario === "success" ? 200 : ["unverified", "error"].includes(scenario) ? 401 : 403);
    if (scenario === "success") assert.equal(res.body.token, JWT);
    cleanLogs(logs);
  }
});

test("AUTH MIDDLEWARE: URL/headers/claims/erro externo não aparecem nos logs", async (t) => {
  for (const scenario of ["missing", "invalid_payload", "blocked", "error", "admin_denied"]) {
    const original = Object.assign(new Error(SENTINELS.join(" ")), { code: TOKEN, constraint: EMAIL });
    const { api, logs } = load(t, "src/auth/authMiddleware.js", {
      jsonwebtoken: { verify: () => scenario === "invalid_payload" ? { [EMAIL]: TOKEN } : { sub: "7", perfil: "usuario" } },
      "../db": { query: async () => { if (scenario === "error") throw original;
        return { rows: scenario === "blocked" ? [] : [{ id: 7, perfil: "usuario" }] }; } },
    }, { NODE_ENV: "development", JWT_SECRET: "synthetic-secret" });
    const req = sensitiveRequest();
    if (scenario === "missing") delete req.headers.authorization;
    const res = response();
    if (scenario === "admin_denied") await api.authAdmin(req, res, assert.fail);
    else await api.authenticateRequest(req, res);
    assert.equal(res.statusCode, scenario === "error" ? 500 : scenario === "admin_denied" ? 403 : 401);
    cleanLogs(logs);
  }
});

test("AUTH USUARIO: recuperação e redefinição mantêm respostas sem previews e erros brutos", async (t) => {
  for (const scenario of ["missing", "sent", "mail_error", "db_error", "reset_error", "invalid_type", "reset_missing", "reset_ok"]) {
    const original = Object.assign(new Error(SENTINELS.join(" ")), { code: "23505", detail: EMAIL, constraint: CPF });
    const { api, logs } = load(t, "src/controllers/authUsuarioController.js", {
      bcrypt: { hash: async () => BCRYPT },
      jsonwebtoken: { sign: () => JWT, verify: () => { if (scenario === "reset_error") throw original;
        return { sub: "7", typ: scenario === "invalid_type" ? TOKEN : "pwd-reset" }; } },
      "../db": { query: async () => { if (scenario === "db_error") throw original;
        return { rows: ["missing", "reset_missing"].includes(scenario) ? [] : [{ id: 7 }] }; } },
      "../services/mailer": { sendEmail: async () => { if (scenario === "mail_error") throw original; } },
    }, { NODE_ENV: "development", JWT_SECRET: "synthetic-secret", FRONTEND_URL: "https://example.invalid" });
    const res = response();
    const reset = scenario.startsWith("reset_") || scenario === "invalid_type";
    await api[reset ? "redefinirSenha" : "recuperarSenha"](sensitiveRequest(), res);
    assert.equal(res.statusCode, reset && scenario !== "reset_ok" ? 400 : 200);
    cleanLogs(logs);
  }
});

test("AUTH CADASTRO: erro de INSERT mantém resposta sem PII/detail no log", async (t) => {
  const original = Object.assign(new Error(SENTINELS.join(" ")), { code: "23505", detail: EMAIL, constraint: "usuarios_email_key" });
  const query = t.mock.fn(async (sql) => {
    if (sql.includes("SELECT 1 FROM")) return { rowCount: 1, rows: [{}] };
    if (sql.includes("INSERT INTO")) throw original;
    return { rows: [] };
  });
  const { api, logs } = load(t, "src/controllers/authUsuarioController.js", {
    bcrypt: { hash: async () => BCRYPT }, jsonwebtoken: {}, "../db": { query }, "../services/mailer": {},
  });
  const req = sensitiveRequest();
  req.body = { ...req.body, nome: "Teste sintético", celular: "11987654321", data_nascimento: "1990-01-01",
    unidade_id: 1, cargo_id: 1, escolaridade_id: 1, deficiencia_id: 1 };
  const res = response();
  await api.cadastrar(req, res);
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.message, "E-mail já cadastrado.");
  assert.equal(query.mock.calls.at(-1).arguments[1][4], BCRYPT);
  cleanLogs(logs);
});

function serverFixture(t) {
  const source = fs.readFileSync(path.resolve(__dirname, "../src/server.js"), "utf8");
  const start = source.indexOf("function isAuthLogRequest(req)");
  const end = source.indexOf("   Rate limiters", start);
  assert.ok(start > 0 && end > start);
  const loggerSource = source.slice(start, source.lastIndexOf("/*", end));
  const errorStart = source.indexOf("app.use((err, req, res, _next) => {");
  const errorEnd = source.indexOf("\n});", errorStart) + 4;
  assert.ok(errorStart > 0 && errorEnd > errorStart);
  const tokens = {};
  let format;
  const morgan = (value) => { format = value; return () => {}; };
  morgan.token = (name, fn) => { tokens[name] = fn; };
  const middleware = [];
  const logs = [];
  const emit = (...args) => { logs.push(args); captured.push(inspect(args, { depth: null })); };
  const context = vm.createContext({
    morgan, app: { use: (fn) => { middleware.push(fn); } }, IS_DEV: true,
    safeBooleanEnv: () => true, getClientIp: (req) => req.ip, process: { env: {} },
    console: { log: t.mock.fn(emit), error: t.mock.fn(emit) },
    sendEnvelopeError(res, payload) { res.statusCode = payload.status; res.body = payload; return res; },
  });
  vm.runInContext(loggerSource, context);
  vm.runInContext(source.slice(errorStart, errorEnd), context);
  assert.ok(format.includes(":safe-url") && format.includes(":safe-method"));
  const processHandlers = {};
  context.process.on = (name, fn) => { processHandlers[name] = fn; };
  const globalStart = source.indexOf('process.on("unhandledRejection"');
  assert.ok(globalStart > 0);
  vm.runInContext(source.slice(globalStart), context);
  const realMorgan = require("morgan");
  const compile = realMorgan.compile(format);
  return { tokens, middleware, logs, context, processHandlers,
    access(req, res) { const output = compile(Object.assign(Object.create(realMorgan), tokens), req, res); emit("[ACCESS]", output); return output; } };
}

test("SERVER: caminho interpretado classifica auth com query/fragmento coerentemente em Morgan/DEV/error", (t) => {
  const { tokens, middleware, logs, context, access } = serverFixture(t);
  const pathGetter = Object.getOwnPropertyDescriptor(require("express").request, "path").get;
  const original = Object.assign(new Error(PASSWORD), { code: TOKEN, details: EMAIL });
  for (const route of ["/api/login", "/api/auth", "/api/auth/google", "/api/auth/esqueci-senha",
    "/api/auth/redefinir-senha", "/api/perfil", "/api/perfil/me", "/api/conta/exclusao"]) {
    for (const suffix of ["", `?token=${TOKEN}`, `#${TOKEN}`, `?x=1#${TOKEN}`, `/${TOKEN}`]) {
      for (const mode of ["express", "fallback", "absolute", "path_only", "url_only"]) {
        const raw = `${route}${suffix}`;
        const req = { ...sensitiveRequest(), originalUrl: raw, url: raw, user: { id: EMAIL, perfil: TOKEN } };
        if (mode === "express") Object.defineProperty(req, "path", { get: pathGetter });
        if (mode === "absolute") req.originalUrl = req.url = `http://example.invalid${raw}`;
        if (mode === "path_only") { req.path = route; req.originalUrl = req.url = `/api/evento?token=${TOKEN}`; }
        if (mode === "url_only") delete req.originalUrl;
        const unchanged = { url: req.url, originalUrl: req.originalUrl };
        assert.equal(context.isAuthLogRequest(req), true);
        assert.equal(tokens.rid(req), "-");
        assert.equal(tokens.ip(req), "-");
        assert.equal(tokens.uid(req), "-");
        assert.equal(tokens["safe-url"](req), "[AUTH_ROUTE]");
        assert.equal(tokens["safe-method"](req), "POST");
        const res = response();
        assert.ok(access(req, res).includes("[AUTH_ROUTE]"));
        let nextCount = 0;
        middleware[1](req, res, () => { nextCount++; });
        assert.equal(nextCount, 1);
        assert.equal(logs.at(-1)[1].scope, "auth");
        middleware[2](original, req, res, () => {});
        assert.equal(logs.at(-1)[1].scope, "auth");
        assert.equal(res.statusCode, 500);
        assert.equal(res.body.message, PASSWORD, "Resposta de desenvolvimento preservada.");
        assert.equal(res.body.code, TOKEN);
        assert.equal(req.url, unchanged.url);
        assert.equal(req.originalUrl, unchanged.originalUrl);
      }
    }
  }
  for (const route of ["/api/evento", "/api/login-extra", "/api/authentic", "/api/perfil-extra"]) {
    const normal = { originalUrl: route, url: route, method: "GET", ip: "127.0.0.1", requestId: "normal", headers: {} };
    Object.defineProperty(normal, "path", { get: pathGetter });
    assert.equal(context.isAuthLogRequest(normal), false);
    assert.equal(tokens["safe-url"](normal), route);
    assert.equal(tokens.rid(normal), normal.requestId);
    assert.equal(tokens.ip(normal), normal.ip);
    assert.ok(access(normal, response()).includes(route));
    middleware[1](normal, response(), () => {});
    assert.equal(logs.at(-1)[1].url, route);
    middleware[2](original, normal, response(), () => {});
    assert.equal(logs.at(-1)[1].scope, "request");
  }
  const { AuthSessionError } = require("../src/services/authSessionService");
  const sessionError = new AuthSessionError("AUTH_SESSION_INVALID");
  sessionError.message = PASSWORD;
  middleware[2](sessionError, { originalUrl: "/api/evento", user: {} }, response(), () => {});
  assert.equal(logs.at(-1)[1].scope, "auth");
  cleanLogs(logs);
});

test("SERVER: erros globais/centrais recuperam name/code/localização seguros sem message/stack/path", (t) => {
  const { middleware, logs, processHandlers } = serverFixture(t);
  const requestId = "6b9862de-57ca-48ad-831b-823187846a45";
  for (const file of ["C:\\Users\\usuario-secreto\\projeto\\server.js:807:15", "/home/usuario-secreto/projeto/server.js:807:15"]) {
    const original = Object.assign(new TypeError(PASSWORD), { code: "23505", status: 503,
      stack: `TypeError: ${PASSWORD} ${TOKEN}\n    at executar (${file})\n    at ${TOKEN}`,
      cause: EMAIL, details: CPF });
    for (const [event, handler] of Object.entries(processHandlers)) {
      handler(original);
      const metadata = logs.at(-1)[1];
      assert.equal(metadata.event, event === "unhandledRejection" ? "UNHANDLED_REJECTION" : "UNCAUGHT_EXCEPTION");
      assert.equal(metadata.name, "TypeError");
      assert.equal(metadata.code, "23505");
      assert.equal(metadata.location, "server.js:807:15");
      assert.equal(metadata.requestId, null);
      for (const field of ["message", "stack", "cause", "body", "headers", "url"]) assert.equal(Object.hasOwn(metadata, field), false);
    }
    const res = response();
    middleware[2](original, { originalUrl: `/api/login#${TOKEN}`, requestId }, res, () => {});
    const metadata = logs.at(-1)[1];
    assert.equal(metadata.name, "TypeError");
    assert.equal(metadata.code, "23505");
    assert.equal(metadata.location, "server.js:807:15");
    assert.equal(metadata.requestId, requestId);
    assert.equal(metadata.status, 503);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.message, original.message);
    assert.equal(res.body.details.stack, original.stack);
  }
  for (const code of ["22P02", "ERR_TEST", "ECONNRESET"]) {
    processHandlers.uncaughtException({ name: "RangeError", code });
    assert.equal(logs.at(-1)[1].code, code);
    assert.equal(logs.at(-1)[1].name, "RangeError");
    assert.equal(logs.at(-1)[1].location, null);
  }
  for (const code of [TOKEN, EMAIL, PASSWORD, "cpf_12345678909", "CPF_12345678909", "11999998888", "ERR\nINJECTED", "A".repeat(65)]) {
    const malicious = { name: TOKEN, code, message: PASSWORD, stack: `Erro ${TOKEN}\n    at /home/usuario-secreto/${TOKEN}.js:1:2` };
    processHandlers.unhandledRejection(malicious);
    assert.equal(logs.at(-1)[1].name, null);
    assert.equal(logs.at(-1)[1].code, null);
    assert.equal(logs.at(-1)[1].location, null);
    middleware[2](malicious, { originalUrl: "/api/evento", requestId: TOKEN }, response(), () => {});
    assert.equal(logs.at(-1)[1].requestId, null);
  }
  processHandlers.unhandledRejection(PASSWORD);
  assert.equal(logs.at(-1)[1].code, null);
  assert.equal(logs.at(-1)[1].location, null);
  cleanLogs(logs);
});

test("AUDITORIA: logs de falha/contrato não vazam metadados; contrato crítico intacto", async (t) => {
  const original = Object.assign(new Error(SENTINELS.join(" ")), { code: TOKEN });
  const { api, logs } = load(t, "src/services/auditoriaService.js", { "../db": { query: async () => { throw original; } } });
  await api.registrarAuditoria({ acao: "", modulo: EMAIL });
  const params = { acao: EMAIL, modulo: TOKEN, entidade: EMAIL, entidade_id: CPF,
    req: { requestId: TOKEN }, detalhes: { senha: PASSWORD } };
  const result = await api.registrarAuditoria(params);
  assert.equal(result.code, "AUDITORIA_FALHA_REGISTRO");
  await assert.rejects(api.registrarAuditoria({ ...params, critica: true }), (error) => error === original);
  cleanLogs(logs);
});

test("CADASTRO MIDDLEWARE: logs de headers/SQL seguros mantêm next e diagnóstico", async (t) => {
  const original = new Error(SENTINELS.join(" "));
  for (const failQuery of [true, false]) {
    const { api, logs } = load(t, "src/auth/forcarAtualizacaoCadastro.js", {
      "../db": { query: async () => { if (failQuery) throw original; return { rows: [{ id: 7 }] }; } },
    }, { NODE_ENV: "development" });
    const req = { ...sensitiveRequest(), userId: 7 };
    const res = response();
    res.setHeader = () => { throw original; };
    let nextCount = 0;
    await api(req, res, () => { nextCount++; });
    assert.equal(nextCount, 1);
    if (!failQuery) assert.equal(req.perfilIncompleto, true);
    cleanLogs(logs);
  }
});

test.after(() => {
  assert.ok(captured.length > 40, "Scanner deve cobrir os caminhos exercitados.");
  const output = captured.join("\n");
  for (const sentinel of SENTINELS) assert.equal(output.includes(sentinel), false, "Sentinela encontrada no scanner final.");
});
