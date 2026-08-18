"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { validateMigrationSql } = require("./run-migration");

const MIGRATION_2026 = path.resolve(
  __dirname,
  "../db/migrations/2026-08-07-auth-perfis-independentes-expand.sql",
);
const MIGRATION_LEGACY_2025 = path.resolve(
  __dirname,
  "../db/migration-legacy/2025-08-27-inscricoes-multipla-congresso.sql",
);

function assertAccepted(sql, fileName = "accepted.sql") {
  assert.doesNotThrow(() => validateMigrationSql(sql, { fileName }));
}

function assertRejected(sql, command, fileName = "rejected.sql") {
  assert.throws(
    () => validateMigrationSql(sql, { fileName }),
    (error) => {
      assert.match(error.message, new RegExp(fileName.replace(".", "\\.")));
      assert.equal(error.message.includes(command), true);
      assert.match(error.message, /processo excepcional separado/);
      assert.equal(error.message.includes(sql), false);
      return true;
    },
  );
}

test("aceita SQL simples compatível com transacao", () => {
  assertAccepted(`
    CREATE TABLE public.contract_test (id integer PRIMARY KEY);
    INSERT INTO public.contract_test (id) VALUES (1);
  `);
});

test("aceita SET TRANSACTION", () => {
  assertAccepted("SET TRANSACTION ISOLATION LEVEL READ COMMITTED;");
});

test("rejeita BEGIN de topo", () => {
  assertRejected("BEGIN; SELECT 1; COMMIT;", "BEGIN");
});

test("rejeita START TRANSACTION", () => {
  assertRejected("START /* comentário */ TRANSACTION;", "START TRANSACTION");
});

test("rejeita COMMIT em qualquer statement de topo", () => {
  assertRejected("SELECT 1; COMMIT;", "COMMIT");
});

test("rejeita ROLLBACK", () => {
  assertRejected("ROLLBACK;", "ROLLBACK");
});

test("rejeita ABORT", () => {
  assertRejected("ABORT WORK;", "ABORT");
});

test("rejeita variantes adicionais de controle transacional", async (t) => {
  for (const [sql, command] of [
    ["END;", "END"],
    ["END WORK;", "END WORK"],
    ["END TRANSACTION;", "END TRANSACTION"],
    ["SAVEPOINT runner_test;", "SAVEPOINT"],
    ["RELEASE SAVEPOINT runner_test;", "RELEASE SAVEPOINT"],
    ["PREPARE TRANSACTION 'runner-test';", "PREPARE TRANSACTION"],
  ]) {
    await t.test(command, () => assertRejected(sql, command));
  }
});

test("aceita BEGIN e END dentro de DO com dollar quote", () => {
  assertAccepted(`
    DO $$
    BEGIN
      PERFORM 1;
    END
    $$;
  `);
});

test("aceita BEGIN e END em funcao PL/pgSQL com dollar tag", () => {
  assertAccepted(`
    CREATE OR REPLACE FUNCTION public.contract_function()
    RETURNS void
    LANGUAGE plpgsql
    AS $function_body$
    BEGIN
      PERFORM 1;
    END;
    $function_body$;
  `);
});

test("ignora transaction control em comentarios lineares e aninhados", () => {
  assertAccepted(`
    -- BEGIN; COMMIT;
    /* ROLLBACK;
       /* START TRANSACTION; */
       ABORT;
    */
    SELECT 1;
  `);
});

test("ignora transaction control em strings com aspas simples", () => {
  assertAccepted("SELECT 'BEGIN; ''COMMIT''; ROLLBACK; ABORT';");
});

test("identificadores quoted não geram falso positivo", () => {
  assertAccepted('CREATE TABLE "BEGIN" ("COMMIT" text, "CALL" text);');
});

test("rejeita CREATE INDEX CONCURRENTLY", () => {
  assertRejected(
    "CREATE INDEX CONCURRENTLY idx_contract ON public.contract_test (id);",
    "CREATE INDEX CONCURRENTLY",
  );
});

test("rejeita CREATE UNIQUE INDEX CONCURRENTLY", () => {
  assertRejected(
    "CREATE UNIQUE INDEX CONCURRENTLY idx_contract ON public.contract_test (id);",
    "CREATE INDEX CONCURRENTLY",
  );
});

test("rejeita DROP INDEX CONCURRENTLY", () => {
  assertRejected(
    "DROP INDEX CONCURRENTLY IF EXISTS public.idx_contract;",
    "DROP INDEX CONCURRENTLY",
  );
});

test("rejeita REINDEX CONCURRENTLY na posicao sintatica valida", () => {
  assertRejected(
    "REINDEX (VERBOSE) INDEX CONCURRENTLY public.idx_contract;",
    "REINDEX ... CONCURRENTLY",
  );
});

test("rejeita VACUUM", () => {
  assertRejected("VACUUM (ANALYZE) public.contract_test;", "VACUUM");
});

test("rejeita CREATE DATABASE", () => {
  assertRejected("CREATE DATABASE contract_database;", "CREATE DATABASE");
});

test("rejeita DROP DATABASE", () => {
  assertRejected("DROP DATABASE IF EXISTS contract_database;", "DROP DATABASE");
});

test("rejeita CALL sem expor argumentos", () => {
  const sql = "CALL public.contract_procedure('segredo-do-argumento');";

  assertRejected(sql, "CALL", "call.sql");

  assert.throws(
    () => validateMigrationSql(sql, { fileName: "call.sql" }),
    (error) => {
      assert.equal(error.message.includes("segredo-do-argumento"), false);
      return true;
    },
  );
});

test("migration executavel de 2026 passa no contrato estrito", () => {
  const sql = fs.readFileSync(MIGRATION_2026, "utf8");

  assertAccepted(sql, path.basename(MIGRATION_2026));
});

test("migration legacy de 2025 e rejeitada por BEGIN de topo", () => {
  const sql = fs.readFileSync(MIGRATION_LEGACY_2025, "utf8");

  assertRejected(sql, "BEGIN", path.basename(MIGRATION_LEGACY_2025));
});
