"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { Pool, Client } = require("pg");
const { BACKEND_ROOT, resolveFiles, inspectMigrationFile, validateMigrationSql, main, applyFile } = require("./run-migration");

const CANONICAL_ID = "db/migrations/2026-10-13-auth-outbox-expand.sql";
const migrationPath = path.resolve(BACKEND_ROOT, CANONICAL_ID);
const bytes = fs.readFileSync(migrationPath);
const sql = bytes.toString("utf8");
const ddl = sql.match(/CREATE TABLE public\.auth_outbox \(([\s\S]*?)\n\);/)[1];
const guard = sql.match(/AS \$auth_outbox_proteger_update\$([\s\S]*?)\$auth_outbox_proteger_update\$;/)[1];
const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
const indexes = ["auth_outbox_confirmacao_uq", "auth_outbox_recuperacao_uq", "auth_outbox_key_nonce_uq",
  "auth_outbox_pendente_idx", "auth_outbox_lease_idx", "auth_outbox_terminal_idx"];

test.beforeEach((t) => {
  for (const Driver of [Pool, Client]) {
    for (const method of ["connect", "query"]) {
      t.mock.method(Driver.prototype, method, () => assert.fail("PostgreSQL real proibido nestes testes."));
    }
  }
});

function captureOutput() {
  const entries = [];
  return { output: Object.fromEntries(["log", "error"].map(method =>
    [method, (...args) => entries.push(args.map(String).join(" "))])), text: () => entries.join("\n") };
}

async function descriptor(cwd = BACKEND_ROOT) {
  const files = await resolveFiles({ file: [path.relative(cwd, migrationPath)], dir: null, pattern: "*" },
    { debug() {} }, { cwd });
  assert.equal(files.length, 1);
  return files[0];
}

test("outbox: mensagem UUID e exatamente as colunas do expand, sem gerador ou plaintext", () => {
  assert.deepEqual(Array.from(ddl.matchAll(/^  ([a-z_]+) (uuid|text|bytea|integer|smallint|timestamptz)\b/gm), m => m[1]), [
    "id", "confirmacao_id", "recuperacao_id", "email_destino", "conteudo_cifrado", "nonce", "auth_tag", "key_id",
    "status", "tentativas", "criada_em", "proxima_tentativa_em", "ultima_tentativa_em", "lease_id",
    "lease_adquirida_em", "lease_expira_em", "finalizada_em", "ultimo_erro_codigo", "ultimo_erro_smtp_status",
  ]);
  assert.match(ddl, /id uuid NOT NULL,/);
  assert.match(ddl, /PRIMARY KEY \(id\)/);
  assert.doesNotMatch(ddl, /gen_random_uuid|uuid_generate|jsonb|\b(?:token|secret|segredo|html|mensagem|subject|password)\s/);
});

test("outbox: exatamente um desafio e duas FKs UUID imediatas sem sujeito redundante", () => {
  assert.match(ddl, /CHECK \(\(confirmacao_id IS NOT NULL\) <> \(recuperacao_id IS NOT NULL\)\)/);
  for (const [column, table] of [["confirmacao_id", "auth_email_confirmacao"], ["recuperacao_id", "auth_recuperacao_senha"]]) {
    assert.ok(ddl.includes(`FOREIGN KEY (${column}) REFERENCES public.${table} (id)\n    ON UPDATE RESTRICT ON DELETE CASCADE NOT DEFERRABLE INITIALLY IMMEDIATE`));
  }
  assert.equal(Array.from(ddl.matchAll(/FOREIGN KEY/g)).length, 2);
  assert.doesNotMatch(ddl, /^  (?:usuario_id|finalidade|desafio_id) /m);
  assert.ok(sql.includes("finalidade confirmacao/alteracao e conta derivam de auth_email_confirmacao"));
  assert.ok(sql.includes("finalidade recuperacao e conta derivam de auth_recuperacao_senha"));
});

test("outbox: uma mensagem por desafio, com unicidade parcial e indexacao das FKs", () => {
  for (const column of ["confirmacao_id", "recuperacao_id"]) {
    assert.ok(sql.includes(`ON public.auth_outbox USING btree (${column}) WHERE ${column} IS NOT NULL;`));
  }
  assert.equal(Array.from(sql.matchAll(/CREATE UNIQUE INDEX/g)).length, 3);
  assert.doesNotMatch(sql, /UNIQUE \(email_destino\)/);
});

test("outbox: destinatario unico e snapshot protegido mesmo em UPDATE completo", () => {
  assert.match(ddl, /email_destino text NOT NULL,/);
  assert.ok(ddl.includes("btrim(email_destino) <> '' AND email_destino !~ '[[:space:][:cntrl:],;<>]'"));
  assert.match(guard, /ROW\(NEW\.id, NEW\.confirmacao_id, NEW\.recuperacao_id, NEW\.email_destino, NEW\.criada_em\)\s+IS DISTINCT FROM\s+ROW\(OLD\.id, OLD\.confirmacao_id, OLD\.recuperacao_id, OLD\.email_destino, OLD\.criada_em\)/);
  assert.match(sql, /BEFORE UPDATE ON public\.auth_outbox\s+FOR EACH ROW EXECUTE FUNCTION public\.auth_outbox_proteger_update\(\)/);
  assert.match(sql, /SET search_path = pg_catalog/);
  assert.doesNotMatch(sql, /SECURITY DEFINER|CREATE OR REPLACE/i);
});

test("outbox: envelope completo ou totalmente removido apenas em terminal", () => {
  for (const column of ["conteudo_cifrado", "nonce", "auth_tag", "key_id"]) {
    assert.ok(ddl.includes(`${column} IS NOT NULL`));
    assert.ok(ddl.includes(`${column} IS NULL`));
  }
  assert.match(ddl, /octet_length\(conteudo_cifrado\) > 0/);
  assert.match(ddl, /octet_length\(nonce\) = 12 AND octet_length\(auth_tag\) = 16/);
  assert.match(ddl, /octet_length\(key_id\) BETWEEN 1 AND 64/);
  assert.ok(ddl.includes("key_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'"));
  assert.match(ddl, /auth_tag IS NULL AND key_id IS NULL AND status IN \('sent', 'failed'\)/);
  assert.match(sql, /ON public\.auth_outbox USING btree \(key_id, nonce\) WHERE key_id IS NOT NULL;/);
  assert.match(guard, /AND NOT \(NEW\.status IN \('sent', 'failed'\) AND NEW\.conteudo_cifrado IS NULL/);
});

test("outbox: quatro estados, pendencia inicial e contador nao negativo", () => {
  assert.match(ddl, /status text NOT NULL DEFAULT 'pending'/);
  assert.match(ddl, /CHECK \(status IN \('pending', 'processing', 'sent', 'failed'\)\)/);
  assert.match(ddl, /tentativas integer NOT NULL DEFAULT 0/);
  assert.match(ddl, /tentativas >= 0/);
  assert.match(ddl, /tentativas = 0 AND ultima_tentativa_em IS NULL/);
  assert.match(ddl, /tentativas > 0 AND ultima_tentativa_em IS NOT NULL/);
  assert.match(guard, /IF NEW\.tentativas < OLD\.tentativas THEN/);
});

for (const state of ["pending", "processing", "sent", "failed"]) {
  test("outbox: agendamento e finalizacao consistentes para " + state, () => {
    const schedule = ddl.match(/CONSTRAINT auth_outbox_agendamento_check([\s\S]*?)CONSTRAINT auth_outbox_lease_check/)[1];
    if (state === "pending") {
      assert.match(schedule, /status = 'pending' AND proxima_tentativa_em IS NOT NULL\s+AND finalizada_em IS NULL/);
    } else if (state === "processing") {
      assert.match(schedule, /status = 'processing' AND proxima_tentativa_em IS NULL\s+AND finalizada_em IS NULL AND tentativas > 0/);
    } else {
      assert.match(schedule, /status IN \('sent', 'failed'\) AND proxima_tentativa_em IS NULL\s+AND finalizada_em IS NOT NULL/);
    }
  });
}

test("outbox: lease completo exclusivo do processamento, sem duracao imposta", () => {
  assert.match(ddl, /status = 'processing' AND lease_id IS NOT NULL/);
  assert.match(ddl, /lease_adquirida_em IS NOT NULL AND lease_expira_em IS NOT NULL/);
  assert.match(ddl, /lease_adquirida_em = ultima_tentativa_em/);
  assert.match(ddl, /lease_expira_em > lease_adquirida_em/);
  assert.match(ddl, /status <> 'processing' AND lease_id IS NULL\s+AND lease_adquirida_em IS NULL AND lease_expira_em IS NULL/);
  assert.doesNotMatch(ddl, /INTERVAL|tentativas <=|DEFAULT.*lease/);
});

for (const column of ["criada_em", "proxima_tentativa_em", "ultima_tentativa_em", "finalizada_em", "lease_adquirida_em", "lease_expira_em"]) {
  test("outbox: timestamp finito para " + column, () => assert.ok(ddl.includes(`isfinite(${column})`)));
}

test("outbox: sucesso limpa envelope e diagnostico; terminais nao reabrem", () => {
  assert.match(ddl, /status <> 'sent' OR\s+\(tentativas > 0 AND conteudo_cifrado IS NULL AND ultimo_erro_codigo IS NULL\s+AND ultimo_erro_smtp_status IS NULL\)/);
  assert.match(guard, /IF OLD\.status IN \('sent', 'failed'\) AND ROW\(NEW\.status/);
  assert.match(guard, /estado terminal imutavel/);
});

test("outbox: falha persistida em categorias sem texto SMTP, permanente e esgotamento terminais", () => {
  assert.match(ddl, /ultimo_erro_codigo IN \(\s+'SMTP_TRANSIENT', 'SMTP_PERMANENT', 'RETRY_EXHAUSTED'/);
  assert.match(ddl, /status <> 'failed' OR ultimo_erro_codigo IS NOT NULL/);
  for (const code of ["SMTP_PERMANENT", "RETRY_EXHAUSTED"]) {
    assert.ok(ddl.includes(`ultimo_erro_codigo IS DISTINCT FROM '${code}' OR status = 'failed'`));
  }
  assert.match(ddl, /ultimo_erro_smtp_status BETWEEN 400 AND 599\s+AND ultimo_erro_codigo IS NOT NULL/);
  assert.doesNotMatch(ddl, /\b(?:erro_mensagem|response|stack|detail|metadata)\b/);
  assert.doesNotMatch(guard, /RAISE[^;]*(?:NEW\.|OLD\.)/);
});

test("outbox: seis indices apoiam unicidade, candidatos e leases sem claim operacional", () => {
  assert.deepEqual(Array.from(sql.matchAll(/CREATE (?:UNIQUE )?INDEX ([a-z_]+)/g), m => m[1]), indexes);
  assert.match(sql, /\(proxima_tentativa_em, id\) WHERE status = 'pending';/);
  assert.match(sql, /\(lease_expira_em, id\) WHERE status = 'processing';/);
  assert.match(sql, /\(finalizada_em, id\) WHERE status IN \('sent', 'failed'\);/);
  assert.doesNotMatch(sql, /CONCURRENTLY|WHERE[^;]*(?:now\(|CURRENT_TIMESTAMP|clock_timestamp\()/i);
  assert.doesNotMatch(guard, /SELECT|INSERT|UPDATE|DELETE|FOR UPDATE|SKIP LOCKED/i);
});

test("outbox: preflight dos dois desafios, PKs e colisoes antes de DDL", () => {
  const preflight = sql.slice(0, sql.indexOf("CREATE TABLE"));
  for (const table of ["auth_email_confirmacao", "auth_recuperacao_senha"]) assert.ok(preflight.includes(`'public.${table}'`));
  assert.match(preflight, /to_regclass\(v_tabela\)/);
  assert.match(preflight, /a\.atttypid = 'pg_catalog\.uuid'::regtype/);
  assert.match(preflight, /array_length\(c\.conkey, 1\) = 1 AND c\.conkey\[1\] = v_id_attnum/);
  assert.match(preflight, /i\.indisvalid AND i\.indisready AND i\.indislive/);
  assert.match(preflight, /i\.indisunique AND i\.indimmediate/);
  assert.match(preflight, /NOT c\.condeferrable AND NOT c\.condeferred/);
  assert.match(preflight, /auth_email_confirmacao_finalidade_check/);
  for (const name of ["auth_outbox", "auth_outbox_pkey", ...indexes, "auth_outbox_proteger_update"]) assert.ok(preflight.includes(`'${name}'`));
  assert.doesNotMatch(sql, /CREATE\s+(?:TABLE|(?:UNIQUE\s+)?INDEX)[^;]*\bIF NOT EXISTS|CREATE OR REPLACE/i);
});

test("outbox: apenas objetos novos, nenhum DML, backfill ou alteracao do legado", () => {
  const executable = sql.replace(/--[^\n]*/g, "");
  assert.deepEqual(Array.from(executable.matchAll(/CREATE TABLE ([a-z_.]+)/g), m => m[1]), ["public.auth_outbox"]);
  assert.deepEqual(Array.from(executable.matchAll(/CREATE FUNCTION ([a-z_.]+)/g), m => m[1]), ["public.auth_outbox_proteger_update"]);
  assert.doesNotMatch(executable, /\b(?:ALTER|DROP|INSERT INTO|UPDATE public\.|DELETE FROM|TRUNCATE|GRANT|REVOKE|CREATE EXTENSION)\b/i);
  assert.doesNotMatch(executable, /notificacoes|pg_cron|pg_notify|pg_sleep|CREATE TABLE IF NOT EXISTS/i);
  assert.ok(Array.from(executable.matchAll(/COMMENT ON (?:TABLE|COLUMN) ([a-z_.]+)/g), m => m[1]).every(n => n.startsWith("public.auth_outbox")));
});

test("outbox: contrato lexical/transacional do runner e bytes LF", () => {
  assert.doesNotThrow(() => validateMigrationSql(sql, { fileName: CANONICAL_ID }));
  assert.match(sql, /SET TRANSACTION ISOLATION LEVEL READ COMMITTED;/);
  assert.equal(bytes.includes(Buffer.from("\r\n")), false);
});

test("outbox: identidade canonica e checksum fisico independentes do CWD", async () => {
  for (const cwd of [BACKEND_ROOT, path.join(BACKEND_ROOT, "scripts")]) {
    const migration = await descriptor(cwd);
    const inspected = await inspectMigrationFile(migration);
    assert.equal(migration.canonicalMigrationId, CANONICAL_ID);
    assert.equal(inspected.sha256, sha256);
    assert.equal(inspected.sql, sql);
  }
});

test("outbox: dry-run oficial de um arquivo sem pool, query ou ledger", async () => {
  const captured = captureOutput();
  const result = await main({ argv: ["--file", migrationPath, "--dry-run"], env: {},
    PoolClass: class { constructor() { assert.fail("Pool proibido no dry-run"); } },
    ensureMigrationTableFn: assert.fail, applyFileFn: assert.fail,
    output: captured.output, setProcessExitCode: false });
  assert.deepEqual(result, { ok: true, dryRun: true });
  assert.equal(captured.text().split("sha256=").length - 1, 1);
  assert.ok(captured.text().includes(CANONICAL_ID + " sha256=" + sha256));
});

// Simula apenas o protocolo do runner; nao executa DDL, trigger ou locks PostgreSQL.
for (const scenario of ["apply", "same-sha", "different-sha", "ddl-failure", "ledger-failure"]) {
  test("outbox: protocolo do runner simulado - " + scenario, async () => {
    const migration = await descriptor();
    const events = [];
    const error = new Error("synthetic outbox failure");
    const client = { async query(statement, params) {
      if (statement.includes("SELECT id, arquivo, sha256")) {
        events.push("lookup");
        assert.deepEqual(params, [CANONICAL_ID]);
        return { rows: scenario.endsWith("-sha") ? [{ id: 1, arquivo: CANONICAL_ID,
          sha256: scenario === "same-sha" ? sha256 : "0".repeat(64), aplicada_em: new Date(0) }] : [] };
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
      assert.deepEqual(events, scenario === "ddl-failure" ? ["lookup", "BEGIN", "ddl", "ROLLBACK"]
        : ["lookup", "BEGIN", "ddl", "ledger", "ROLLBACK"]);
    } else {
      await execute();
      assert.deepEqual(events, scenario === "same-sha" ? ["lookup"] : ["lookup", "BEGIN", "ddl", "ledger", "COMMIT"]);
    }
  });
}
