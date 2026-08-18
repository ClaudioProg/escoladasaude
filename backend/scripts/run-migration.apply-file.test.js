"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");

const {
  TARGET_DIAGNOSTIC_SQL,
  applyFile,
  applyFilesSequentially,
  main,
} = require("./run-migration");

const MIGRATION_FILE = path.resolve(
  __dirname,
  "../db/migrations/2026-08-07-auth-perfis-independentes-expand.sql",
);
const EXPECTED_HOST = "ep-target.neon.tech";
const EXPECTED_DATABASE = "saude_test";
const DATABASE_URL =
  `postgresql://runner_user:runner_password@${EXPECTED_HOST}:5432/` +
  `${EXPECTED_DATABASE}?sslmode=require`;
const STATEMENT_TIMEOUT_SQL =
  "SELECT set_config('statement_timeout', $1, false);";

function captureOutput() {
  const entries = [];

  return {
    output: {
      log: (...args) => entries.push(args.map(String).join(" ")),
      error: (...args) => entries.push(args.map(String).join(" ")),
    },
    text: () => entries.join("\n"),
  };
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function isLedgerLookup(sql) {
  return sql.includes("SELECT id, arquivo, sha256, aplicada_em, tempo_ms");
}

function isLedgerRegistration(sql) {
  return sql.includes("INSERT INTO public.sistema_migracao");
}

function assertLedgerLookupSql(sql) {
  assert.match(
    sql,
    /FROM public\.sistema_migracao\s+WHERE arquivo = \$1\s+AND sha256 = \$2/s,
  );
}

function assertLedgerRegistrationSql(sql) {
  assert.match(
    sql,
    /INSERT INTO public\.sistema_migracao\s*\(\s*arquivo,\s*sha256,\s*tempo_ms\s*\)\s*VALUES \(\$1, \$2, \$3\)/s,
  );
  assert.doesNotMatch(sql, /ON CONFLICT|DO UPDATE/i);
}

function stages(events) {
  return events.map((event) => event.stage);
}

function makeApplyHarness(options = {}) {
  const source =
    options.source ??
    "SET TRANSACTION ISOLATION LEVEL READ COMMITTED;\nSELECT 42;";
  const fullPath = options.fullPath ?? "/virtual/001-managed.sql";
  const failures = options.failures ?? {};
  const times = [...(options.times ?? [1000, 1027])];
  const events = [];
  const output = captureOutput();
  let clockCalls = 0;

  const client = {
    async query(sql, params) {
      if (isLedgerLookup(sql)) {
        assertLedgerLookupSql(sql);
        events.push({ stage: "lookup", sql, params });
        return { rows: options.alreadyApplied ? [options.alreadyApplied] : [] };
      }

      if (isLedgerRegistration(sql)) {
        assertLedgerRegistrationSql(sql);
        events.push({ stage: "ledger", sql, params });

        if (failures.ledger) {
          throw failures.ledger;
        }

        return { rows: [] };
      }

      if (sql === "BEGIN") {
        events.push({ stage: "begin", sql, params });

        if (failures.begin) {
          throw failures.begin;
        }

        return { rows: [] };
      }

      if (sql === "COMMIT") {
        events.push({ stage: "commit", sql, params });

        if (failures.commit) {
          throw failures.commit;
        }

        return { rows: [] };
      }

      if (sql === "ROLLBACK") {
        events.push({ stage: "rollback", sql, params });

        if (failures.rollback) {
          throw failures.rollback;
        }

        return { rows: [] };
      }

      events.push({ stage: "sql", sql, params });

      if (failures.sql) {
        throw failures.sql;
      }

      return { rows: [] };
    },
  };

  return {
    client,
    events,
    output,
    source,
    get clockCalls() {
      return clockCalls;
    },
    run() {
      return applyFile(
        client,
        fullPath,
        {
          output: output.output,
          sensitiveValues: options.sensitiveValues ?? [],
        },
        {
          readFile: async (receivedPath, encoding) => {
            assert.equal(receivedPath, fullPath);
            assert.equal(encoding, "utf8");
            return source;
          },
          now: () => {
            const value = times[clockCalls];
            clockCalls += 1;
            return value;
          },
        },
      );
    },
  };
}

test("caminho gerenciado confirma SQL e INSERT do ledger na mesma transacao", async () => {
  const harness = makeApplyHarness();

  await harness.run();

  assert.deepEqual(stages(harness.events), [
    "lookup",
    "begin",
    "sql",
    "ledger",
    "commit",
  ]);
  assert.equal(harness.events[2].sql, harness.source);
  assert.deepEqual(harness.events[0].params, [
    "001-managed.sql",
    sha256(harness.source),
  ]);
  assert.deepEqual(harness.events[3].params, [
    "001-managed.sql",
    sha256(harness.source),
    27,
  ]);
  assert.equal(harness.clockCalls, 2);
  assert.match(harness.output.text(), /OK \(27ms\)/);
});

test("migration ja aplicada e ignorada sem reexecucao", async () => {
  const harness = makeApplyHarness({
    fullPath: "/virtual/002-applied.sql",
    alreadyApplied: {
      id: 10,
      arquivo: "002-applied.sql",
      sha256: "hash-ja-aplicado",
      aplicada_em: "2026-08-18T10:00:00.000Z",
      tempo_ms: 5,
    },
  });

  await harness.run();

  assert.deepEqual(stages(harness.events), ["lookup"]);
  assert.equal(harness.clockCalls, 0);
  assert.doesNotMatch(harness.output.text(), /OK/);
  assert.match(harness.output.text(), /Ignorada: já aplicada/);
  assert.doesNotMatch(harness.output.text(), /force/i);
});

test("erro de SQL faz rollback sem ledger ou commit", async () => {
  const executionError = new Error("falha controlada na migration");
  const harness = makeApplyHarness({ failures: { sql: executionError } });

  await assert.rejects(
    harness.run(),
    (error) => error === executionError,
  );

  assert.deepEqual(stages(harness.events), [
    "lookup",
    "begin",
    "sql",
    "rollback",
  ]);
  assert.doesNotMatch(harness.output.text(), /OK/);
});

test("erro do INSERT no ledger faz rollback sem commit", async () => {
  const ledgerError = new Error("falha controlada no ledger");
  const harness = makeApplyHarness({ failures: { ledger: ledgerError } });

  await assert.rejects(harness.run(), (error) => error === ledgerError);

  assert.deepEqual(stages(harness.events), [
    "lookup",
    "begin",
    "sql",
    "ledger",
    "rollback",
  ]);
  assert.doesNotMatch(harness.output.text(), /OK/);
});

test("erro de BEGIN nao tenta SQL, ledger, commit ou rollback", async () => {
  const beginError = new Error("falha controlada no BEGIN");
  const harness = makeApplyHarness({ failures: { begin: beginError } });

  await assert.rejects(harness.run(), (error) => error === beginError);

  assert.deepEqual(stages(harness.events), ["lookup", "begin"]);
  assert.doesNotMatch(harness.output.text(), /OK/);
});

test("erro de COMMIT tenta rollback e preserva o erro de commit", async () => {
  const commitError = new Error("falha controlada no COMMIT");
  const harness = makeApplyHarness({ failures: { commit: commitError } });

  await assert.rejects(harness.run(), (error) => error === commitError);

  assert.deepEqual(stages(harness.events), [
    "lookup",
    "begin",
    "sql",
    "ledger",
    "commit",
    "rollback",
  ]);
  assert.doesNotMatch(harness.output.text(), /OK/);
});

test("erro de rollback apos falha de SQL preserva o erro de SQL", async () => {
  const sqlError = new Error("erro primario do SQL");
  const rollbackError = new Error("erro secundario segredo-rollback");
  const harness = makeApplyHarness({
    failures: { sql: sqlError, rollback: rollbackError },
    sensitiveValues: ["segredo-rollback"],
  });

  await assert.rejects(harness.run(), (error) => error === sqlError);

  assert.deepEqual(stages(harness.events), [
    "lookup",
    "begin",
    "sql",
    "rollback",
  ]);
  assert.match(harness.output.text(), /Falha ao executar ROLLBACK/);
  assert.doesNotMatch(harness.output.text(), /segredo-rollback/);
  assert.doesNotMatch(harness.output.text(), /OK/);
});

test("erro de rollback apos falha de ledger preserva o erro do ledger", async () => {
  const ledgerError = new Error("erro primario do ledger");
  const rollbackError = new Error("erro secundario do rollback");
  const harness = makeApplyHarness({
    failures: { ledger: ledgerError, rollback: rollbackError },
  });

  await assert.rejects(harness.run(), (error) => error === ledgerError);

  assert.deepEqual(stages(harness.events), [
    "lookup",
    "begin",
    "sql",
    "ledger",
    "rollback",
  ]);
  assert.doesNotMatch(harness.output.text(), /OK/);
});

test("SQL com transacao propria e rejeitado antes de qualquer query", async () => {
  const source = "BEGIN;\nSELECT 7;\nCOMMIT;";
  const harness = makeApplyHarness({
    source,
    fullPath: "/virtual/005-own-transaction.sql",
  });

  await assert.rejects(
    harness.run(),
    /comando proibido BEGIN.*processo excepcional separado/,
  );

  assert.deepEqual(harness.events, []);
  assert.equal(harness.clockCalls, 0);
  assert.doesNotMatch(harness.output.text(), /OK/);
});

test("SQL lexicalmente invalido e rejeitado antes de qualquer query", async () => {
  const source = "SELECT 'segredo-sem-fechamento;";
  const harness = makeApplyHarness({
    source,
    fullPath: "/virtual/006-lexically-invalid.sql",
  });

  await assert.rejects(
    harness.run(),
    /SQL lexicalmente inválido.*string SQL não terminada/,
  );

  assert.deepEqual(harness.events, []);
  assert.equal(harness.clockCalls, 0);
  assert.doesNotMatch(harness.output.text(), /segredo-sem-fechamento|OK/);
});

test("multiplos arquivos permanecem estritamente sequenciais", async () => {
  const events = [];

  await applyFilesSequentially(
    {},
    ["first.sql", "second.sql"],
    {},
    async (_client, fullPath, options) => {
      events.push(`start:${fullPath}`);
      assert.deepEqual(options, {});
      await Promise.resolve();
      events.push(`end:${fullPath}`);
    },
  );

  assert.deepEqual(events, [
    "start:first.sql",
    "end:first.sql",
    "start:second.sql",
    "end:second.sql",
  ]);
});

test("arquivos confirmam por unidade e param apos rollback do segundo", async () => {
  const files = [
    "/virtual/101-first.sql",
    "/virtual/102-second.sql",
    "/virtual/103-third.sql",
  ];
  const sources = new Map([
    [files[0], "SELECT 'first';"],
    [files[1], "SELECT 'second';"],
    [files[2], "SELECT 'third';"],
  ]);
  const secondError = new Error("falha controlada no segundo arquivo");
  const events = [];
  const times = [5000, 5010, 5020];
  let currentName;

  const client = {
    async query(sql, params) {
      if (isLedgerLookup(sql)) {
        assertLedgerLookupSql(sql);
        events.push(`lookup:${params[0]}`);
        return { rows: [] };
      }

      if (isLedgerRegistration(sql)) {
        assertLedgerRegistrationSql(sql);
        events.push(`ledger:${params[0]}`);
        return { rows: [] };
      }

      if (sql === "BEGIN") {
        events.push(`begin:${currentName}`);
        return { rows: [] };
      }

      if (sql === "COMMIT") {
        events.push(`commit:${currentName}`);
        return { rows: [] };
      }

      if (sql === "ROLLBACK") {
        events.push(`rollback:${currentName}`);
        return { rows: [] };
      }

      events.push(`sql:${currentName}`);

      if (currentName === "102-second.sql") {
        throw secondError;
      }

      return { rows: [] };
    },
  };

  await assert.rejects(
    applyFilesSequentially(
      client,
      files,
      { output: captureOutput().output },
      (receivedClient, fullPath, options) =>
        applyFile(receivedClient, fullPath, options, {
          readFile: async (receivedPath, encoding) => {
            assert.equal(encoding, "utf8");
            currentName = path.basename(receivedPath);
            return sources.get(receivedPath);
          },
          now: () => times.shift(),
        }),
    ),
    (error) => error === secondError,
  );

  assert.deepEqual(events, [
    "lookup:101-first.sql",
    "begin:101-first.sql",
    "sql:101-first.sql",
    "ledger:101-first.sql",
    "commit:101-first.sql",
    "lookup:102-second.sql",
    "begin:102-second.sql",
    "sql:102-second.sql",
    "rollback:102-second.sql",
  ]);
});

test("falha na aplicacao interrompe o fluxo e mantem cleanup", async () => {
  const events = [];
  const applicationError = new Error("falha controlada em applyFile");
  const output = captureOutput();
  const client = {
    async query(sql, params) {
      if (sql === TARGET_DIAGNOSTIC_SQL) {
        events.push("diagnostic");
        return {
          rows: [
            {
              database_name: EXPECTED_DATABASE,
              schema_name: "public",
              server_version: "16.14",
            },
          ],
        };
      }

      assert.equal(sql, STATEMENT_TIMEOUT_SQL);
      assert.deepEqual(params, ["60000ms"]);
      events.push("set_config");
      return { rows: [] };
    },
    release() {
      events.push("release");
    },
  };
  class FakePool {
    constructor(config) {
      events.push("pool");
      assert.equal(config.connectionString, DATABASE_URL);
      assert.equal(config.max, 1);
    }

    async connect() {
      events.push("connect");
      return client;
    }

    async end() {
      events.push("end");
    }
  }

  const result = await main({
    argv: [
      "--file",
      MIGRATION_FILE,
      "--expect-host",
      EXPECTED_HOST,
      "--expect-database",
      EXPECTED_DATABASE,
    ],
    env: { DATABASE_URL },
    PoolClass: FakePool,
    output: output.output,
    setProcessExitCode: false,
    ensureMigrationTableFn: async () => events.push("ensure"),
    applyFileFn: async () => {
      events.push("apply");
      throw applicationError;
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, applicationError);
  assert.deepEqual(events, [
    "pool",
    "connect",
    "diagnostic",
    "set_config",
    "ensure",
    "apply",
    "release",
    "end",
  ]);
});
