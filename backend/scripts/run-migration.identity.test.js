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

function ledgerColumn(columnName, formattedType, overrides = {}) {
  return {
    column_name: columnName,
    formatted_type: formattedType,
    not_null: true,
    is_dropped: false,
    identity_kind: "",
    generated_kind: "",
    default_expression: null,
    default_uses_owned_bigint_sequence: false,
    ...overrides,
  };
}

function completeLedgerColumns() {
  return [
    ledgerColumn("id", "bigint", {
      default_expression:
        "nextval('public.sistema_migracao_id_seq'::regclass)",
      default_uses_owned_bigint_sequence: true,
    }),
    ledgerColumn("arquivo", "text"),
    ledgerColumn("sha256", "text"),
    ledgerColumn("aplicada_em", "timestamp without time zone", {
      default_expression: "now()",
    }),
    ledgerColumn("tempo_ms", "integer", { default_expression: "0" }),
  ];
}

function primaryKey(columns = ["id"], overrides = {}) {
  return {
    constraint_name: "sistema_migracao_pkey",
    columns,
    is_validated: true,
    is_deferrable: false,
    is_deferred: false,
    is_primary: true,
    is_unique: true,
    is_immediate: true,
    is_valid: true,
    is_ready: true,
    is_live: true,
    is_unconditional: true,
    is_plain: true,
    ...overrides,
  };
}

function uniqueIndex(columns, overrides = {}) {
  return {
    index_name: "ledger_unique_test",
    columns,
    is_immediate: true,
    is_valid: true,
    is_ready: true,
    is_live: true,
    is_unconditional: true,
    is_plain: true,
    ...overrides,
  };
}

function makeExistingLedgerClient({
  columns = completeLedgerColumns(),
  primaryKeys = [primaryKey()],
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

        if (sql.includes("FROM pg_attribute")) {
          return { rows: columns };
        }

        if (sql.includes("FROM pg_constraint")) {
          return { rows: primaryKeys };
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

function withColumnOverride(columns, columnName, overrides) {
  return columns.map((column) =>
    column.column_name === columnName ? { ...column, ...overrides } : column,
  );
}

function withoutColumn(columns, columnName) {
  return columns.filter((column) => column.column_name !== columnName);
}

function assertOnlyReadOnlyCatalogQueries(queries) {
  assert.equal(
    queries.every((sql) => /^\s*SELECT\b/i.test(sql)),
    true,
  );
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

test("ledger ausente cria o shape fisico novo completo", async () => {
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
  assert.match(queries[1], /id BIGSERIAL PRIMARY KEY/);
  assert.match(queries[1], /arquivo TEXT NOT NULL/);
  assert.match(queries[1], /sha256 TEXT NOT NULL/);
  assert.match(
    queries[1],
    /aplicada_em TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now\(\)/,
  );
  assert.match(queries[1], /tempo_ms INTEGER NOT NULL DEFAULT 0/);
  assert.match(
    queries[1],
    /CONSTRAINT sistema_migracao_arquivo_key UNIQUE \(arquivo\)/,
  );
  assert.doesNotMatch(queries[1], /UNIQUE \(arquivo,\s*sha256\)/);
  assert.doesNotMatch(queries[1], /IF NOT EXISTS/);
});

test("ledger exatamente novo e aceito sem mutacao", async () => {
  const harness = makeExistingLedgerClient({
    records: [{ arquivo: CANONICAL_2026, sha256: SHA_2026 }],
  });

  await ensureMigrationTable(harness.client);

  assert.equal(harness.queries.length, 5);
  assert.match(harness.queries[1], /format_type\(/);
  assert.match(harness.queries[1], /pg_get_expr\(/);
  assert.match(harness.queries[1], /attidentity AS identity_kind/);
  assert.match(harness.queries[1], /attgenerated AS generated_kind/);
  assert.match(harness.queries[1], /FROM pg_depend AS default_dependency/);
  assert.match(harness.queries[1], /FROM pg_attribute AS column_definition/);
  assert.match(harness.queries[2], /FROM pg_constraint AS constraint_definition/);
  assert.match(harness.queries[2], /constraint_definition\.contype = 'p'/);
  assert.match(harness.queries[2], /indimmediate AS is_immediate/);
  assert.match(harness.queries[2], /index_definition\.indislive AS is_live/);
  assert.match(harness.queries[3], /FROM pg_index AS index_definition/);
  assertOnlyReadOnlyCatalogQueries(harness.queries);
});

test("defaults equivalentes normalmente deparseados pelo PostgreSQL sao aceitos", async () => {
  let columns = completeLedgerColumns();
  columns = withColumnOverride(columns, "aplicada_em", {
    default_expression:
      " ( CURRENT_TIMESTAMP ) :: timestamp without time zone ",
  });
  columns = withColumnOverride(columns, "tempo_ms", {
    default_expression: "(0)::integer",
  });
  const harness = makeExistingLedgerClient({
    columns,
  });

  await ensureMigrationTable(harness.client);
  assertOnlyReadOnlyCatalogQueries(harness.queries);
});

test("shapes parciais ou colunas fisicamente incompativeis falham fechados", async (t) => {
  const cases = [
    {
      name: "id ausente",
      columns: withoutColumn(completeLedgerColumns(), "id"),
      error: /conjunto de colunas incompatível/i,
    },
    {
      name: "shape parcial anteriormente aceito",
      columns: completeLedgerColumns().filter((column) => column.column_name !== "id"),
      error: /conjunto de colunas incompatível/i,
    },
    {
      name: "id com tipo errado",
      columns: withColumnOverride(completeLedgerColumns(), "id", {
        formatted_type: "integer",
      }),
      error: /coluna obrigatória incompatível: id/i,
    },
    {
      name: "id nullable",
      columns: withColumnOverride(completeLedgerColumns(), "id", {
        not_null: false,
      }),
      error: /coluna obrigatória incompatível: id/i,
    },
    {
      name: "id descartada",
      columns: withColumnOverride(completeLedgerColumns(), "id", {
        is_dropped: true,
      }),
      error: /conjunto de colunas incompatível/i,
    },
    {
      name: "id declarada como identity em vez de BIGSERIAL",
      columns: withColumnOverride(completeLedgerColumns(), "id", {
        identity_kind: "d",
      }),
      error: /coluna obrigatória incompatível: id/i,
    },
    {
      name: "id sem default de sequence",
      columns: withColumnOverride(completeLedgerColumns(), "id", {
        default_expression: null,
        default_uses_owned_bigint_sequence: false,
      }),
      error: /default incompatível: id/i,
    },
    {
      name: "id com sequence nao pertencente",
      columns: withColumnOverride(completeLedgerColumns(), "id", {
        default_uses_owned_bigint_sequence: false,
      }),
      error: /default incompatível: id/i,
    },
    {
      name: "arquivo nullable",
      columns: withColumnOverride(completeLedgerColumns(), "arquivo", {
        not_null: false,
      }),
      error: /coluna obrigatória incompatível: arquivo/i,
    },
    {
      name: "arquivo com tipo errado",
      columns: withColumnOverride(completeLedgerColumns(), "arquivo", {
        formatted_type: "character varying",
      }),
      error: /coluna obrigatória incompatível: arquivo/i,
    },
    {
      name: "arquivo com default nao previsto",
      columns: withColumnOverride(completeLedgerColumns(), "arquivo", {
        default_expression: "'legado'::text",
      }),
      error: /default incompatível: arquivo/i,
    },
    {
      name: "sha256 nullable",
      columns: withColumnOverride(completeLedgerColumns(), "sha256", {
        not_null: false,
      }),
      error: /coluna obrigatória incompatível: sha256/i,
    },
    {
      name: "sha256 com tipo errado",
      columns: withColumnOverride(completeLedgerColumns(), "sha256", {
        formatted_type: "character varying",
      }),
      error: /coluna obrigatória incompatível: sha256/i,
    },
    {
      name: "aplicada_em com tipo errado",
      columns: withColumnOverride(completeLedgerColumns(), "aplicada_em", {
        formatted_type: "timestamp with time zone",
      }),
      error: /coluna obrigatória incompatível: aplicada_em/i,
    },
    {
      name: "aplicada_em nullable",
      columns: withColumnOverride(completeLedgerColumns(), "aplicada_em", {
        not_null: false,
      }),
      error: /coluna obrigatória incompatível: aplicada_em/i,
    },
    {
      name: "aplicada_em sem default",
      columns: withColumnOverride(completeLedgerColumns(), "aplicada_em", {
        default_expression: null,
      }),
      error: /default incompatível: aplicada_em/i,
    },
    {
      name: "aplicada_em com default incompatível",
      columns: withColumnOverride(completeLedgerColumns(), "aplicada_em", {
        default_expression: "statement_timestamp()",
      }),
      error: /default incompatível: aplicada_em/i,
    },
    {
      name: "tempo_ms com tipo errado",
      columns: withColumnOverride(completeLedgerColumns(), "tempo_ms", {
        formatted_type: "bigint",
      }),
      error: /coluna obrigatória incompatível: tempo_ms/i,
    },
    {
      name: "tempo_ms nullable",
      columns: withColumnOverride(completeLedgerColumns(), "tempo_ms", {
        not_null: false,
      }),
      error: /coluna obrigatória incompatível: tempo_ms/i,
    },
    {
      name: "tempo_ms sem default",
      columns: withColumnOverride(completeLedgerColumns(), "tempo_ms", {
        default_expression: null,
      }),
      error: /default incompatível: tempo_ms/i,
    },
    {
      name: "tempo_ms com default diferente de zero",
      columns: withColumnOverride(completeLedgerColumns(), "tempo_ms", {
        default_expression: "1",
      }),
      error: /default incompatível: tempo_ms/i,
    },
    {
      name: "tempo_ms como coluna gerada",
      columns: withColumnOverride(completeLedgerColumns(), "tempo_ms", {
        generated_kind: "s",
      }),
      error: /coluna obrigatória incompatível: tempo_ms/i,
    },
    {
      name: "coluna adicional nao criada pelo runner",
      columns: [
        ...completeLedgerColumns(),
        ledgerColumn("extra", "text", { not_null: false }),
      ],
      error: /conjunto de colunas incompatível/i,
    },
  ];

  for (const testCase of cases) {
    await t.test(testCase.name, async () => {
      const harness = makeExistingLedgerClient({ columns: testCase.columns });

      await assert.rejects(ensureMigrationTable(harness.client), testCase.error);
      assert.equal(harness.queries.length, 2);
      assertOnlyReadOnlyCatalogQueries(harness.queries);
    });
  }
});

test("PRIMARY KEY de id ausente, composta ou inadequada falha fechada", async (t) => {
  const cases = [
    { name: "id sem PK", primaryKeys: [] },
    { name: "PK composta", primaryKeys: [primaryKey(["id", "arquivo"])] },
    {
      name: "PK em outra coluna",
      primaryKeys: [primaryKey(["arquivo"])],
    },
    {
      name: "PK nao validada",
      primaryKeys: [primaryKey(["id"], { is_validated: false })],
    },
    {
      name: "PK deferrable",
      primaryKeys: [primaryKey(["id"], { is_deferrable: true })],
    },
    {
      name: "PK inicialmente deferred",
      primaryKeys: [primaryKey(["id"], { is_deferred: true })],
    },
    {
      name: "indice da PK invalido",
      primaryKeys: [primaryKey(["id"], { is_valid: false })],
    },
    {
      name: "indice da PK nao imediato",
      primaryKeys: [primaryKey(["id"], { is_immediate: false })],
    },
    {
      name: "indice da PK nao ready",
      primaryKeys: [primaryKey(["id"], { is_ready: false })],
    },
    {
      name: "indice da PK nao live",
      primaryKeys: [primaryKey(["id"], { is_live: false })],
    },
    {
      name: "PK parcial",
      primaryKeys: [primaryKey(["id"], { is_unconditional: false })],
    },
    {
      name: "PK por expressao",
      primaryKeys: [primaryKey(["id"], { is_plain: false })],
    },
    {
      name: "mais de uma estrutura de PK",
      primaryKeys: [primaryKey(), primaryKey(["arquivo"])],
    },
  ];

  for (const testCase of cases) {
    await t.test(testCase.name, async () => {
      const harness = makeExistingLedgerClient({
        primaryKeys: testCase.primaryKeys,
      });

      await assert.rejects(
        ensureMigrationTable(harness.client),
        /PRIMARY KEY simples e válida sobre id ausente/i,
      );
      assert.equal(harness.queries.length, 3);
      assertOnlyReadOnlyCatalogQueries(harness.queries);
    });
  }
});

test("UNIQUE simples de arquivo ausente ou inadequada falha fechada", async (t) => {
  const cases = [
    { name: "arquivo sem UNIQUE", uniqueIndexes: [] },
    {
      name: "UNIQUE composto legado",
      uniqueIndexes: [uniqueIndex(["arquivo", "sha256"])],
    },
    {
      name: "UNIQUE invalido",
      uniqueIndexes: [uniqueIndex(["arquivo"], { is_valid: false })],
    },
    {
      name: "UNIQUE nao imediato",
      uniqueIndexes: [uniqueIndex(["arquivo"], { is_immediate: false })],
    },
    {
      name: "UNIQUE nao ready",
      uniqueIndexes: [uniqueIndex(["arquivo"], { is_ready: false })],
    },
    {
      name: "UNIQUE nao live",
      uniqueIndexes: [uniqueIndex(["arquivo"], { is_live: false })],
    },
    {
      name: "UNIQUE parcial",
      uniqueIndexes: [
        uniqueIndex(["arquivo"], { is_unconditional: false }),
      ],
    },
    {
      name: "UNIQUE por expressao",
      uniqueIndexes: [uniqueIndex(["arquivo"], { is_plain: false })],
    },
  ];

  for (const testCase of cases) {
    await t.test(testCase.name, async () => {
      const harness = makeExistingLedgerClient({
        uniqueIndexes: testCase.uniqueIndexes,
      });

      await assert.rejects(
        ensureMigrationTable(harness.client),
        /unicidade por arquivo canônico (?:ausente|incompatível)/i,
      );
      assert.equal(harness.queries.length, 4);
      assertOnlyReadOnlyCatalogQueries(harness.queries);
    });
  }
});

test("estruturas UNIQUE simples conflitantes sao rejeitadas", async () => {
  const harness = makeExistingLedgerClient({
    uniqueIndexes: [
      uniqueIndex(["arquivo"], { index_name: "primeiro" }),
      uniqueIndex(["arquivo"], {
        index_name: "segundo_invalido",
        is_valid: false,
      }),
    ],
  });

  await assert.rejects(
    ensureMigrationTable(harness.client),
    /estrutura de unicidade por arquivo canônico incompatível/i,
  );
  assertOnlyReadOnlyCatalogQueries(harness.queries);
});

test("ledger legado com UNIQUE arquivo mais SHA falha sem mutacao", async () => {
  const harness = makeExistingLedgerClient({
    uniqueIndexes: [uniqueIndex(["arquivo", "sha256"])],
  });

  await assert.rejects(
    ensureMigrationTable(harness.client),
    /ledger.*legado\/incompatível.*unicidade por arquivo canônico ausente/i,
  );

  assertOnlyReadOnlyCatalogQueries(harness.queries);
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

  assertOnlyReadOnlyCatalogQueries(harness.queries);
});

test("identidades legadas adicionais e duplicidades logicas falham fechadas", async (t) => {
  const cases = [
    {
      name: "caminho absoluto",
      records: [{ arquivo: "/tmp/001.sql", sha256: SHA_2026 }],
    },
    {
      name: "barra invertida",
      records: [
        { arquivo: "db\\migrations\\001.sql", sha256: SHA_2026 },
      ],
    },
    {
      name: "fora de db/migrations",
      records: [{ arquivo: "db/outside/001.sql", sha256: SHA_2026 }],
    },
    {
      name: "SHA invalido",
      records: [{ arquivo: CANONICAL_2026, sha256: "invalido" }],
    },
    {
      name: "identidade duplicada",
      records: [
        { arquivo: CANONICAL_2026, sha256: SHA_2026 },
        { arquivo: CANONICAL_2026, sha256: SHA_2026 },
      ],
      error: /mais de um registro para a mesma migration/i,
    },
  ];

  for (const testCase of cases) {
    await t.test(testCase.name, async () => {
      const harness = makeExistingLedgerClient({ records: testCase.records });

      await assert.rejects(
        ensureMigrationTable(harness.client),
        testCase.error ?? /identidade legada ou inválida/i,
      );
      assertOnlyReadOnlyCatalogQueries(harness.queries);
    });
  }
});
