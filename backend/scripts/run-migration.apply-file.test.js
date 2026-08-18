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
    /ON CONFLICT \(arquivo, sha256\)\s+DO UPDATE SET\s+aplicada_em = now\(\),\s+tempo_ms = EXCLUDED\.tempo_ms/s,
  );
}

test("migration nao aplicada executa SQL antes de registrar no ledger", async () => {
  const source = "SELECT 42;\n";
  const migrationHash = sha256(source);
  const events = [];
  const times = [1000, 1027];
  const client = {
    async query(sql, params) {
      if (isLedgerLookup(sql)) {
        assertLedgerLookupSql(sql);
        events.push({ stage: "lookup", params });
        return { rows: [] };
      }

      if (isLedgerRegistration(sql)) {
        assertLedgerRegistrationSql(sql);
        events.push({ stage: "ledger", params });
        return { rows: [] };
      }

      events.push({ stage: "execute", sql, params });
      return { rows: [] };
    },
  };

  await applyFile(
    client,
    "/virtual/001-current.sql",
    { output: captureOutput().output },
    {
      readFile: async (fullPath, encoding) => {
        assert.equal(fullPath, "/virtual/001-current.sql");
        assert.equal(encoding, "utf8");
        return source;
      },
      now: () => times.shift(),
    },
  );

  assert.deepEqual(events, [
    {
      stage: "lookup",
      params: ["001-current.sql", migrationHash],
    },
    {
      stage: "execute",
      sql: "BEGIN;\nSELECT 42;\nCOMMIT;",
      params: undefined,
    },
    {
      stage: "ledger",
      params: ["001-current.sql", migrationHash, 27],
    },
  ]);
  assert.deepEqual(times, []);
});

test("migration ja aplicada sem --force e ignorada", async () => {
  const source = "SELECT 1;";
  const migrationHash = sha256(source);
  const events = [];
  const client = {
    async query(sql, params) {
      assert.equal(isLedgerLookup(sql), true);
      assertLedgerLookupSql(sql);
      events.push({ stage: "lookup", params });
      return {
        rows: [
          {
            id: 10,
            arquivo: "002-applied.sql",
            sha256: migrationHash,
            aplicada_em: "2026-08-18T10:00:00.000Z",
            tempo_ms: 5,
          },
        ],
      };
    },
  };

  await applyFile(
    client,
    "/virtual/002-applied.sql",
    { output: captureOutput().output },
    {
      readFile: async () => source,
      now: () => {
        throw new Error("migration ignorada nao deve consultar o relogio");
      },
    },
  );

  assert.deepEqual(events, [
    {
      stage: "lookup",
      params: ["002-applied.sql", migrationHash],
    },
  ]);
});

test("--force preserva reexecucao e registro atual no ledger", async () => {
  const source = "SELECT 'force';";
  const migrationHash = sha256(source);
  const events = [];
  const times = [2000, 2045];
  const client = {
    async query(sql, params) {
      if (isLedgerLookup(sql)) {
        assertLedgerLookupSql(sql);
        events.push({ stage: "lookup", params });
        return {
          rows: [
            {
              id: 11,
              arquivo: "003-force.sql",
              sha256: migrationHash,
              aplicada_em: "2026-08-18T10:00:00.000Z",
              tempo_ms: 5,
            },
          ],
        };
      }

      if (isLedgerRegistration(sql)) {
        assertLedgerRegistrationSql(sql);
        events.push({ stage: "ledger", params });
        return { rows: [] };
      }

      events.push({ stage: "execute", sql });
      return { rows: [] };
    },
  };

  await applyFile(
    client,
    "/virtual/003-force.sql",
    { force: true, output: captureOutput().output },
    {
      readFile: async () => source,
      now: () => times.shift(),
    },
  );

  assert.deepEqual(events, [
    {
      stage: "lookup",
      params: ["003-force.sql", migrationHash],
    },
    {
      stage: "execute",
      sql: "BEGIN;\nSELECT 'force';\nCOMMIT;",
    },
    {
      stage: "ledger",
      params: ["003-force.sql", migrationHash, 45],
    },
  ]);
});

test("erro de execucao interrompe antes do registro no ledger", async () => {
  const executionError = new Error("falha controlada na migration");
  const events = [];
  const client = {
    async query(sql) {
      if (isLedgerLookup(sql)) {
        events.push("lookup");
        return { rows: [] };
      }

      if (isLedgerRegistration(sql)) {
        events.push("ledger");
        return { rows: [] };
      }

      events.push("execute");
      throw executionError;
    },
  };

  await assert.rejects(
    applyFile(
      client,
      "/virtual/004-failure.sql",
      { output: captureOutput().output },
      {
        readFile: async () => "SELECT broken;",
        now: () => 3000,
      },
    ),
    (error) => error === executionError,
  );

  assert.deepEqual(events, ["lookup", "execute"]);
});

test("SQL com transacao propria preserva o texto executado", async () => {
  const source = "BEGIN;\nSELECT 7;\nCOMMIT;";
  let executedSql;
  const client = {
    async query(sql) {
      if (isLedgerLookup(sql)) {
        return { rows: [] };
      }

      if (isLedgerRegistration(sql)) {
        return { rows: [] };
      }

      executedSql = sql;
      return { rows: [] };
    },
  };

  await applyFile(
    client,
    "/virtual/005-own-transaction.sql",
    { output: captureOutput().output },
    {
      readFile: async () => source,
      now: () => 4000,
    },
  );

  assert.equal(executedSql, source);
});

test("multiplos arquivos permanecem estritamente sequenciais", async () => {
  const events = [];

  await applyFilesSequentially(
    {},
    ["first.sql", "second.sql"],
    { force: true },
    async (_client, fullPath, options) => {
      events.push(`start:${fullPath}`);
      assert.equal(options.force, true);
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
