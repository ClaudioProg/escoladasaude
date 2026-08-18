"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
  BACKEND_ROOT,
  OFFICIAL_MIGRATIONS_ROOT,
  buildCanonicalMigrationId,
  ensureMigrationTable,
  inspectMigrationFile,
  isPathInsideRoot,
  main,
  resolveFiles,
} = require("./run-migration");

const MIGRATION_2026 = path.join(
  OFFICIAL_MIGRATIONS_ROOT,
  "2026-08-07-auth-perfis-independentes-expand.sql",
);
const LEGACY_2025 = path.join(
  BACKEND_ROOT,
  "db",
  "migration-legacy",
  "2025-08-27-inscricoes-multipla-congresso.sql",
);
const CANONICAL_2026 =
  "db/migrations/2026-08-07-auth-perfis-independentes-expand.sql";
const SHA_2026 =
  "0086dae4d66ba9f80663f31eb06d7517f78d5e72c6c8415ebf8e4e6f33ebd1d9";

function quietLogger() {
  return { debug() {} };
}

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

function resolutionArgs(overrides = {}) {
  return {
    file: [],
    dir: null,
    pattern: "*",
    ...overrides,
  };
}

function requiredLedgerColumns() {
  return [
    { column_name: "arquivo", data_type: "text", is_nullable: "NO" },
    { column_name: "sha256", data_type: "text", is_nullable: "NO" },
    {
      column_name: "aplicada_em",
      data_type: "timestamp without time zone",
      is_nullable: "NO",
    },
    { column_name: "tempo_ms", data_type: "integer", is_nullable: "NO" },
  ];
}

function uniqueIndex(columns) {
  return {
    index_name: "ledger_unique_test",
    columns,
    is_valid: true,
    is_ready: true,
    is_unconditional: true,
    is_plain: true,
  };
}

function makeExistingLedgerClient({
  columns = requiredLedgerColumns(),
  uniqueIndexes = [uniqueIndex(["arquivo"])],
  records = [],
} = {}) {
  const queries = [];

  return {
    queries,
    client: {
      async query(sql) {
        queries.push(sql);

        if (sql.includes("to_regclass")) {
          return { rows: [{ table_exists: true }] };
        }

        if (sql.includes("information_schema.columns")) {
          return { rows: columns };
        }

        if (sql.includes("FROM pg_index")) {
          return { rows: uniqueIndexes };
        }

        if (sql.includes("SELECT arquivo, sha256")) {
          return { rows: records };
        }

        throw new Error("query inesperada no teste de ledger existente");
      },
    },
  };
}

test("arquivo oficial produz identidade canonica e SHA esperados", async () => {
  const [migration] = await resolveFiles(
    resolutionArgs({ file: [MIGRATION_2026] }),
    quietLogger(),
  );
  const inspected = await inspectMigrationFile(migration);

  assert.equal(migration.canonicalMigrationId, CANONICAL_2026);
  assert.notEqual(migration.canonicalMigrationId, path.basename(MIGRATION_2026));
  assert.equal(inspected.sha256, SHA_2026);
});

test("identidade canonica nao depende do CWD", async () => {
  const cwdFromBackend = BACKEND_ROOT;
  const cwdFromScripts = path.join(BACKEND_ROOT, "scripts");
  const [fromBackend] = await resolveFiles(
    resolutionArgs({ file: [path.relative(cwdFromBackend, MIGRATION_2026)] }),
    quietLogger(),
    { cwd: cwdFromBackend },
  );
  const [fromScripts] = await resolveFiles(
    resolutionArgs({ file: [path.relative(cwdFromScripts, MIGRATION_2026)] }),
    quietLogger(),
    { cwd: cwdFromScripts },
  );

  assert.equal(fromBackend.canonicalMigrationId, CANONICAL_2026);
  assert.equal(fromScripts.canonicalMigrationId, CANONICAL_2026);
});

test("identidade converte representacao Windows para separador POSIX", () => {
  assert.equal(
    buildCanonicalMigrationId("subdiretorio\\001-exemplo.sql"),
    "db/migrations/subdiretorio/001-exemplo.sql",
  );
  assert.equal(
    isPathInsideRoot(
      "C:\\repo\\backend\\db\\migrations",
      "C:\\repo\\backend\\outside\\escape.sql",
      { pathApi: path.win32 },
    ),
    false,
  );
});

test("arquivo SQL fora da arvore oficial e rejeitado", async () => {
  const outside = path.join(BACKEND_ROOT, "outside", "externa.sql");

  await assert.rejects(
    resolveFiles(
      resolutionArgs({ file: [outside] }),
      quietLogger(),
      {
        realpath: async (receivedPath) => path.resolve(receivedPath),
        stat: async () => ({ isFile: () => true, isDirectory: () => false }),
      },
    ),
    /dentro da árvore oficial db\/migrations/,
  );
});

test("migration legacy e rejeitada antes de ambiente ou Pool", async () => {
  const capture = captureOutput();
  let environmentRead = false;
  let poolConstructed = false;
  const env = new Proxy(
    {},
    {
      get() {
        environmentRead = true;
        throw new Error("migration legacy tentou ler ambiente");
      },
    },
  );

  class ForbiddenPool {
    constructor() {
      poolConstructed = true;
      throw new Error("migration legacy tentou construir Pool");
    }
  }

  const result = await main({
    argv: ["--file", LEGACY_2025, "--dry-run"],
    env,
    PoolClass: ForbiddenPool,
    output: capture.output,
    setProcessExitCode: false,
  });

  assert.equal(result.ok, false);
  assert.match(result.error.message, /árvore oficial db\/migrations/);
  assert.equal(environmentRead, false);
  assert.equal(poolConstructed, false);
  assert.equal(capture.text().includes(BACKEND_ROOT), false);
  assert.doesNotMatch(capture.text(), /comando proibido BEGIN/);
});

test("traversal para migration legacy e rejeitado", async () => {
  const traversal = path.join(
    "..",
    "migration-legacy",
    path.basename(LEGACY_2025),
  );

  await assert.rejects(
    resolveFiles(
      resolutionArgs({ file: [traversal] }),
      quietLogger(),
      { cwd: OFFICIAL_MIGRATIONS_ROOT },
    ),
    /árvore oficial db\/migrations/,
  );
});

test("escape por symlink e rejeitado pelo realpath resolvido", async () => {
  const apparentPath = path.join(OFFICIAL_MIGRATIONS_ROOT, "escape.sql");
  const outsideRealPath = path.join(BACKEND_ROOT, "outside", "escape.sql");

  await assert.rejects(
    resolveFiles(
      resolutionArgs({ file: [apparentPath] }),
      quietLogger(),
      {
        realpath: async (receivedPath) => {
          const resolved = path.resolve(receivedPath);

          if (resolved === path.resolve(OFFICIAL_MIGRATIONS_ROOT)) {
            return path.resolve(OFFICIAL_MIGRATIONS_ROOT);
          }

          return outsideRealPath;
        },
        stat: async () => ({ isFile: () => true, isDirectory: () => false }),
      },
    ),
    /dentro da árvore oficial db\/migrations/,
  );
});

test("extensao diferente de SQL e rejeitada", async () => {
  const requested = path.join(OFFICIAL_MIGRATIONS_ROOT, "invalida.txt");

  await assert.rejects(
    resolveFiles(
      resolutionArgs({ file: [requested] }),
      quietLogger(),
      {
        realpath: async (receivedPath) => path.resolve(receivedPath),
        stat: async () => ({ isFile: () => true, isDirectory: () => false }),
      },
    ),
    /extensão \.sql/,
  );
});

test("caminho nao regular e rejeitado", async () => {
  const requested = path.join(OFFICIAL_MIGRATIONS_ROOT, "diretorio.sql");

  await assert.rejects(
    resolveFiles(
      resolutionArgs({ file: [requested] }),
      quietLogger(),
      {
        realpath: async (receivedPath) => path.resolve(receivedPath),
        stat: async () => ({ isFile: () => false, isDirectory: () => true }),
      },
    ),
    /não é arquivo regular/,
  );
});

test("--dir aceita somente a arvore oficial", async () => {
  const official = await resolveFiles(
    resolutionArgs({ dir: OFFICIAL_MIGRATIONS_ROOT, pattern: "2026-*.sql" }),
    quietLogger(),
  );

  assert.deepEqual(
    official.map((migration) => migration.canonicalMigrationId),
    [CANONICAL_2026],
  );

  await assert.rejects(
    resolveFiles(
      resolutionArgs({ dir: path.dirname(LEGACY_2025), pattern: "*.sql" }),
      quietLogger(),
    ),
    /--dir deve apontar para a árvore oficial/,
  );
});

test("dry-run mostra somente identidade canonica e SHA sem acessar ambiente", async () => {
  const capture = captureOutput();
  let environmentRead = false;
  const env = new Proxy(
    {},
    {
      get() {
        environmentRead = true;
        throw new Error("dry-run tentou ler ambiente");
      },
    },
  );

  class ForbiddenPool {
    constructor() {
      throw new Error("dry-run tentou construir Pool");
    }
  }

  const result = await main({
    argv: ["--file", MIGRATION_2026, "--dry-run"],
    env,
    PoolClass: ForbiddenPool,
    output: capture.output,
    setProcessExitCode: false,
  });

  assert.equal(result.ok, true);
  assert.equal(environmentRead, false);
  assert.match(capture.text(), new RegExp(CANONICAL_2026));
  assert.match(capture.text(), new RegExp(SHA_2026));
  assert.equal(capture.text().includes(BACKEND_ROOT), false);
});

test("ledger novo cria UNIQUE por arquivo e nunca por arquivo mais SHA", async () => {
  const queries = [];
  const client = {
    async query(sql) {
      queries.push(sql);

      if (sql.includes("to_regclass")) {
        return { rows: [{ table_exists: false }] };
      }

      return { rows: [] };
    },
  };

  await ensureMigrationTable(client);

  assert.equal(queries.length, 3);
  assert.match(
    queries[1],
    /CONSTRAINT sistema_migracao_arquivo_key UNIQUE \(arquivo\)/,
  );
  assert.doesNotMatch(queries[1], /UNIQUE \(arquivo,\s*sha256\)/);
  assert.doesNotMatch(queries[1], /IF NOT EXISTS/);
});

test("ledger legado com UNIQUE arquivo mais SHA falha sem mutacao", async () => {
  const harness = makeExistingLedgerClient({
    uniqueIndexes: [uniqueIndex(["arquivo", "sha256"])],
  });

  await assert.rejects(
    ensureMigrationTable(harness.client),
    /ledger.*legado\/incompatível.*unicidade por arquivo canônico ausente/i,
  );

  assert.equal(
    harness.queries.every((sql) => /^\s*SELECT\b/i.test(sql)),
    true,
  );
});

test("ledger com coluna obrigatoria ausente falha antes de consultas dependentes", async () => {
  const harness = makeExistingLedgerClient({
    columns: [
      { column_name: "arquivo", data_type: "text", is_nullable: "NO" },
    ],
  });

  await assert.rejects(
    ensureMigrationTable(harness.client),
    /ledger.*legado\/incompatível.*coluna obrigatória incompatível: sha256/i,
  );

  assert.equal(harness.queries.length, 2);
  assert.equal(
    harness.queries.every((sql) => /^\s*SELECT\b/i.test(sql)),
    true,
  );
});

test("registro basename legado falha sem reexecucao ou mutacao", async () => {
  const harness = makeExistingLedgerClient({
    records: [
      {
        arquivo: path.basename(MIGRATION_2026),
        sha256: SHA_2026,
      },
    ],
  });

  await assert.rejects(
    ensureMigrationTable(harness.client),
    /ledger.*legado\/incompatível.*identidade legada ou inválida/i,
  );

  assert.equal(
    harness.queries.every((sql) => /^\s*SELECT\b/i.test(sql)),
    true,
  );
});

test("ledger canonico existente e aceito sem mutacao", async () => {
  const harness = makeExistingLedgerClient({
    records: [{ arquivo: CANONICAL_2026, sha256: SHA_2026 }],
  });

  await ensureMigrationTable(harness.client);

  assert.equal(
    harness.queries.every((sql) => /^\s*SELECT\b/i.test(sql)),
    true,
  );
});
