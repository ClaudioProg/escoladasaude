"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");
const { BACKEND_ROOT, resolveFiles, inspectMigrationFile, validateMigrationSql, main, applyFile } = require("./run-migration");

const CANONICAL_ID = "db/migrations/2026-10-09-auth-quotas-expand.sql";
const migrationPath = path.resolve(BACKEND_ROOT, CANONICAL_ID);
const bytes = fs.readFileSync(migrationPath);
const sql = bytes.toString("utf8");
const ddl = sql.match(/CREATE TABLE public\.auth_quota_evento \(([\s\S]*?)\n\);/)[1];
const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
const indexes = [
  "auth_quota_evento_usuario_registrada_idx",
  "auth_quota_evento_ip_registrada_idx",
  "auth_quota_evento_registrada_emissao_idx",
];

test.beforeEach((t) => {
  for (const method of ["connect", "query"]) {
    t.mock.method(Pool.prototype, method, () => assert.fail("PostgreSQL real proibido nestes testes."));
  }
});

function captureOutput() {
  const entries = [];
  return { output: Object.fromEntries(["log", "error"].map(method =>
    [method, (...args) => entries.push(args.map(String).join(" "))])),
  text: () => entries.join("\n") };
}

async function descriptor(cwd = BACKEND_ROOT) {
  const files = await resolveFiles(
    { file: [path.relative(cwd, migrationPath)], dir: null, pattern: "*" },
    { debug() {} }, { cwd },
  );
  assert.equal(files.length, 1);
  return files[0];
}

test("quota: uma linha por emissao com exatamente seis colunas e UUID fornecido pela aplicacao", () => {
  const columns = Array.from(ddl.matchAll(/^  ([a-z_]+) (uuid|text|integer|bytea|timestamptz)\b/gm),
    match => [match[1], match[2]]);
  assert.deepEqual(columns, [
    ["emissao_id", "uuid"], ["finalidade", "text"], ["usuario_id", "integer"],
    ["ip_hmac", "bytea"], ["ip_hmac_key_id", "text"], ["registrada_em", "timestamptz"],
  ]);
  assert.match(ddl, /emissao_id uuid NOT NULL,/);
  assert.match(ddl, /PRIMARY KEY \(emissao_id\)/);
  assert.match(ddl, /usuario_id integer NULL,/);
  assert.match(ddl, /ip_hmac bytea NULL,/);
  assert.match(ddl, /ip_hmac_key_id text NULL,/);
  assert.doesNotMatch(ddl, /tipo_sujeito|DEFAULT\s+(?:gen_random_uuid|uuid_generate)/i);
});

test("quota: finalidade obrigatoria registra fatos sem politica de composicao", () => {
  assert.match(ddl, /finalidade text NOT NULL,/);
  assert.match(ddl, /CHECK \(finalidade IN \('confirmacao', 'alteracao', 'recuperacao'\)\)/);
  assert.doesNotMatch(ddl, /escopo|quota_grupo|limite|contador|janela|expira_em/);
});

test("quota: HMAC e identificador sao um par opcional completo", () => {
  assert.match(ddl, /CHECK \(\(ip_hmac IS NULL\) = \(ip_hmac_key_id IS NULL\)\)/);
  assert.match(ddl, /CHECK \(ip_hmac IS NULL OR octet_length\(ip_hmac\) = 32\)/);
  assert.match(ddl, /ip_hmac_key_id IS NULL OR \(/);
  assert.match(ddl, /octet_length\(ip_hmac_key_id\) BETWEEN 1 AND 64/);
  assert.ok(ddl.includes("ip_hmac_key_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'"));
  assert.doesNotMatch(ddl, /\b(?:inet|cidr|cpf|email|token|segredo|secret|metadata|jsonb)\b/i);
});

test("quota: conta e IP juntos ou isolados; nenhum evento anonimo", () => {
  assert.match(ddl, /CHECK \(usuario_id IS NOT NULL OR ip_hmac IS NOT NULL\)/);
  assert.doesNotMatch(ddl, /CHECK \(\(usuario_id IS NULL\) =|CHECK \(usuario_id IS NOT NULL AND ip_hmac/);
});

test("quota: FK de usuario e imediata com RESTRICT", () => {
  assert.match(ddl, /FOREIGN KEY \(usuario_id\) REFERENCES public\.usuarios \(id\)\s+ON UPDATE RESTRICT ON DELETE RESTRICT NOT DEFERRABLE INITIALLY IMMEDIATE/);
  assert.equal(Array.from(ddl.matchAll(/FOREIGN KEY/g)).length, 1);
  assert.equal(Array.from(ddl.matchAll(/CONSTRAINT /g)).length, 8);
});

test("quota: horario do banco finito sem TTL automatico", () => {
  assert.match(ddl, /registrada_em timestamptz NOT NULL DEFAULT clock_timestamp\(\),/);
  assert.match(ddl, /CHECK \(isfinite\(registrada_em\)\)/);
  assert.doesNotMatch(ddl, /CURRENT_TIMESTAMP|now\(\)|expira_em|INTERVAL/i);
});

test("quota: tres B-trees apoiam sujeitos, janelas e limpeza sem predicado temporal", () => {
  assert.deepEqual(Array.from(sql.matchAll(/CREATE INDEX ([a-z_]+)/g), match => match[1]), indexes);
  assert.match(sql, /USING btree \(usuario_id, registrada_em, finalidade\)\s+WHERE usuario_id IS NOT NULL;/);
  assert.match(sql, /USING btree \(ip_hmac_key_id, ip_hmac, registrada_em, finalidade\)\s+WHERE ip_hmac IS NOT NULL;/);
  assert.match(sql, /USING btree \(registrada_em, emissao_id\);/);
  assert.doesNotMatch(sql, /CREATE UNIQUE INDEX|CONCURRENTLY|WHERE[^;]*(?:now\(|clock_timestamp|CURRENT_TIMESTAMP)/i);
});

test("quota: preflight valida usuarios e rejeita colisao antes do DDL", () => {
  const preflight = sql.slice(0, sql.indexOf("CREATE TABLE"));
  assert.match(preflight, /to_regclass\('public\.usuarios'\) IS NULL/);
  assert.match(preflight, /c\.relkind IN \('r', 'p'\)/);
  assert.match(preflight, /a\.atttypid = 'pg_catalog\.int4'::regtype AND a\.atttypmod = -1/);
  assert.match(preflight, /a\.attnotnull/);
  assert.match(preflight, /c\.contype = 'p'/);
  assert.match(preflight, /NOT c\.condeferrable AND NOT c\.condeferred/);
  assert.match(preflight, /i\.indisvalid AND i\.indisready AND i\.indislive/);
  assert.match(preflight, /i\.indisunique AND i\.indimmediate/);
  for (const name of ["auth_quota_evento", "auth_quota_evento_pkey", ...indexes]) {
    assert.ok(preflight.includes("'" + name + "'"), name);
  }
  assert.match(preflight, /n\.nspname = 'public' AND c\.relname = v_nome/);
  assert.match(preflight, /RAISE EXCEPTION/);
  assert.doesNotMatch(sql, /CREATE\s+(?:TABLE|(?:UNIQUE\s+)?INDEX)[^;]*\bIF NOT EXISTS/i);
});

test("quota: expand altera somente objetos novos e nao escreve dados existentes", () => {
  const executable = sql.replace(/--[^\n]*/g, "");
  assert.deepEqual(Array.from(executable.matchAll(/CREATE TABLE ([a-z_.]+)/g), match => match[1]),
    ["public.auth_quota_evento"]);
  assert.doesNotMatch(executable, /\b(?:ALTER|DROP|INSERT|UPDATE|DELETE|TRUNCATE|GRANT|REVOKE|CALL)\s+(?:TABLE|INTO|FROM|ON|public\.)/i);
  assert.doesNotMatch(executable, /CREATE (?:FUNCTION|TRIGGER|EXTENSION)|cron\.|pg_cron|pg_notify/i);
  const comments = Array.from(executable.matchAll(/COMMENT ON (?:TABLE|COLUMN) ([a-z_.]+)/g), match => match[1]);
  assert.ok(comments.length > 0);
  assert.ok(comments.every(name => name === "public.auth_quota_evento" || name.startsWith("public.auth_quota_evento.")));
});

test("quota: SQL aceito pelo contrato transacional do runner oficial", () => {
  assert.doesNotThrow(() => validateMigrationSql(sql, { fileName: CANONICAL_ID }));
  assert.match(sql, /SET TRANSACTION ISOLATION LEVEL READ COMMITTED;/);
});

test("quota: identidade canonica, SHA fisico e LF independem do CWD", async () => {
  assert.equal(bytes.includes(Buffer.from("\r\n")), false);
  for (const cwd of [BACKEND_ROOT, path.join(BACKEND_ROOT, "scripts")]) {
    const migration = await descriptor(cwd);
    const inspected = await inspectMigrationFile(migration);
    assert.equal(migration.canonicalMigrationId, CANONICAL_ID);
    assert.equal(inspected.sha256, sha256);
    assert.equal(inspected.sql, sql);
  }
});

test("quota: plano dry-run seleciona somente o arquivo sem pool, SQL ou ledger", async () => {
  const captured = captureOutput();
  const result = await main({
    argv: ["--file", migrationPath, "--dry-run"], env: {},
    PoolClass: class { constructor() { assert.fail("Dry-run nao pode criar pool."); } },
    ensureMigrationTableFn: assert.fail, applyFileFn: assert.fail,
    output: captured.output, setProcessExitCode: false,
  });
  assert.deepEqual(result, { ok: true, dryRun: true });
  assert.equal(captured.text().split("sha256=").length - 1, 1);
  assert.ok(captured.text().includes(CANONICAL_ID + " sha256=" + sha256));
  for (const other of ["2026-08-07", "2026-08-20", "2026-08-25", "2026-10-02"]) {
    assert.equal(captured.text().includes(other), false);
  }
});

// Executor inteiramente simulado: nenhum SQL abaixo e enviado a PostgreSQL.
// Comprova o protocolo do runner com o arquivo real, nao a execucao do DDL.
for (const scenario of ["apply", "same-sha", "different-sha", "ddl-failure", "ledger-failure"]) {
  test("quota: protocolo do runner com executor simulado - " + scenario, async () => {
    const migration = await descriptor();
    const events = [];
    const error = new Error("synthetic quota validation failure");
    const client = { async query(statement, params) {
      if (statement.includes("SELECT id, arquivo, sha256")) {
        events.push("lookup");
        assert.deepEqual(params, [CANONICAL_ID]);
        return { rows: scenario.endsWith("-sha") ? [{
          id: 1, arquivo: CANONICAL_ID,
          sha256: scenario === "same-sha" ? sha256 : "0".repeat(64), aplicada_em: new Date(0),
        }] : [] };
      }
      if (statement === sql.trim()) {
        events.push("ddl");
        if (scenario === "ddl-failure") throw error;
      } else if (statement.includes("INSERT INTO public.sistema_migracao")) {
        events.push("ledger");
        assert.equal(params[0], CANONICAL_ID);
        assert.equal(params[1], sha256);
        if (scenario === "ledger-failure") throw error;
      } else {
        assert.ok(["BEGIN", "COMMIT", "ROLLBACK"].includes(statement), statement);
        events.push(statement);
      }
      return { rows: [] };
    } };
    const execute = () => applyFile(client, migration, { output: captureOutput().output });
    if (scenario === "different-sha") {
      await assert.rejects(execute(), /conte.do diferente/);
      assert.deepEqual(events, ["lookup"]);
    } else if (scenario.endsWith("-failure")) {
      await assert.rejects(execute(), failure => failure === error);
      assert.deepEqual(events, scenario === "ddl-failure"
        ? ["lookup", "BEGIN", "ddl", "ROLLBACK"]
        : ["lookup", "BEGIN", "ddl", "ledger", "ROLLBACK"]);
    } else {
      await execute();
      assert.deepEqual(events, scenario === "same-sha"
        ? ["lookup"] : ["lookup", "BEGIN", "ddl", "ledger", "COMMIT"]);
    }
  });
}
