"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  TARGET_DIAGNOSTIC_SQL,
  getRequiredConnectionString,
  main,
  parseAndValidateTarget,
  parseArgs,
  prettyPgError,
  validateConnectedTarget,
  validateExpectedTarget,
} = require("./run-migration");

const MIGRATION_FILE = path.resolve(
  __dirname,
  "../db/migrations/2026-08-07-auth-perfis-independentes-expand.sql",
);
const EXPECTED_HOST = "ep-target.neon.tech";
const EXPECTED_DATABASE = "saude_test";
const SENTINEL_USER = "sentinel_user_91";
const SENTINEL_PASSWORD = "sentinel_password_82";
const SENTINEL_QUERY = "sentinel_query_73";
const VALID_DATABASE_URL =
  `postgresql://${SENTINEL_USER}:${SENTINEL_PASSWORD}` +
  `@${EXPECTED_HOST}:5432/saude%5Ftest?sslmode=require&token=${SENTINEL_QUERY}`;
const STATEMENT_TIMEOUT_SQL =
  "SELECT set_config('statement_timeout', $1, false);";

function executionArgv(extra = []) {
  return [
    "--file",
    MIGRATION_FILE,
    "--expect-host",
    EXPECTED_HOST,
    "--expect-database",
    EXPECTED_DATABASE,
    ...extra,
  ];
}

function expectedTarget() {
  return {
    host: EXPECTED_HOST,
    database: EXPECTED_DATABASE,
  };
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

function diagnosticRows(database = EXPECTED_DATABASE, schema = "public") {
  return [
    {
      database_name: database,
      schema_name: schema,
      server_version: "17.5",
    },
  ];
}

function makePoolClass(options = {}) {
  const {
    client,
    connectError,
    events = [],
    onConfig = () => {},
    onEnd = () => {},
  } = options;

  return class FakePool {
    constructor(config) {
      events.push("pool");
      onConfig(config);
    }

    async connect() {
      events.push("connect");

      if (connectError) {
        throw connectError;
      }

      return client;
    }

    async end() {
      events.push("end");
      onEnd();
    }
  };
}

function mainOptions(overrides = {}) {
  return {
    argv: executionArgv(),
    env: { DATABASE_URL: VALID_DATABASE_URL },
    output: captureOutput().output,
    setProcessExitCode: false,
    ensureMigrationTableFn: async () => {},
    applyFileFn: async () => {},
    ...overrides,
  };
}

test("runner não contém SET parametrizado inválido", () => {
  const runnerSource = fs.readFileSync(
    require.resolve("./run-migration"),
    "utf8",
  );
  const invalidQuery = ["SET statement_timeout", "= $1"].join(" ");

  assert.equal(runnerSource.includes(invalidQuery), false);
  assert.equal(runnerSource.includes(STATEMENT_TIMEOUT_SQL), true);
});

test("dry-run não exige conexão nem identificação do alvo", async () => {
  let poolConstructed = false;
  const env = new Proxy(
    {},
    {
      get() {
        throw new Error("o dry-run tentou ler o ambiente");
      },
    },
  );

  class ForbiddenPool {
    constructor() {
      poolConstructed = true;
      throw new Error("o dry-run tentou construir Pool");
    }
  }

  const result = await main({
    argv: ["--file", MIGRATION_FILE, "--dry-run"],
    env,
    PoolClass: ForbiddenPool,
    output: captureOutput().output,
    setProcessExitCode: false,
  });

  assert.equal(result.ok, true);
  assert.equal(result.dryRun, true);
  assert.equal(poolConstructed, false);
});

test("--force é rejeitado antes de ambiente, Pool, ensure e migration", async () => {
  const secret = "sentinela-force-nao-expor";
  const capture = captureOutput();
  let environmentRead = false;
  let poolConstructed = false;
  let ensureCalled = false;
  let migrationCalled = false;
  const env = new Proxy(
    {},
    {
      get() {
        environmentRead = true;
        throw new Error("--force tentou ler o ambiente");
      },
    },
  );

  class ForbiddenPool {
    constructor() {
      poolConstructed = true;
      throw new Error("--force tentou construir Pool");
    }
  }

  const result = await main({
    argv: ["--force", secret],
    env,
    PoolClass: ForbiddenPool,
    output: capture.output,
    setProcessExitCode: false,
    ensureMigrationTableFn: async () => {
      ensureCalled = true;
    },
    applyFileFn: async () => {
      migrationCalled = true;
    },
  });

  assert.equal(result.ok, false);
  assert.match(
    result.error.message,
    /--force não é suportado.*imutáveis e forward-only.*nova migration/,
  );
  assert.equal(environmentRead, false);
  assert.equal(poolConstructed, false);
  assert.equal(ensureCalled, false);
  assert.equal(migrationCalled, false);
  assert.doesNotMatch(capture.text(), new RegExp(secret));
});

test("parser preserva opções legítimas sem propriedade force", () => {
  const args = parseArgs([
    "--file",
    "001.sql",
    "--dir",
    "db/migrations",
    "--pattern",
    "2026-*.sql",
    "--timeout",
    "45000",
    "--ssl",
    "--verbose",
    "--dry-run",
    "--expect-host",
    EXPECTED_HOST,
    "--expect-database",
    EXPECTED_DATABASE,
  ]);

  assert.deepEqual(args, {
    file: ["001.sql"],
    dir: "db/migrations",
    pattern: "2026-*.sql",
    timeout: "45000",
    verbose: true,
    dryRun: true,
    ssl: true,
    noSsl: false,
    expectHost: EXPECTED_HOST,
    expectDatabase: EXPECTED_DATABASE,
  });
  assert.equal(Object.hasOwn(args, "force"), false);
});

test("execução real exige exclusivamente DATABASE_URL", async (t) => {
  for (const [name, env] of [
    ["sem variável", {}],
    ["somente RENDER_EXTERNAL_DATABASE_URL", {
      RENDER_EXTERNAL_DATABASE_URL: VALID_DATABASE_URL,
    }],
    ["somente POSTGRES_URL", { POSTGRES_URL: VALID_DATABASE_URL }],
  ]) {
    await t.test(name, async () => {
      let poolConstructed = false;

      class ForbiddenPool {
        constructor() {
          poolConstructed = true;
        }
      }

      const result = await main(
        mainOptions({ env, PoolClass: ForbiddenPool }),
      );

      assert.equal(result.ok, false);
      assert.match(result.error.message, /DATABASE_URL não encontrada/);
      assert.equal(poolConstructed, false);
    });
  }
});

test("DATABASE_URL é lida uma única vez e a mesma string chega ao Pool", async () => {
  let reads = 0;
  let receivedConnectionString;
  const events = [];
  const env = {
    get DATABASE_URL() {
      reads += 1;
      return VALID_DATABASE_URL;
    },
    DATABASE_SSL: "false",
  };
  const client = {
    async query(sql) {
      if (sql === TARGET_DIAGNOSTIC_SQL) {
        events.push("diagnostic");
        return { rows: diagnosticRows() };
      }

      events.push("set");
      return { rows: [] };
    },
    release() {
      events.push("release");
    },
  };
  const PoolClass = makePoolClass({
    client,
    events,
    onConfig: (config) => {
      receivedConnectionString = config.connectionString;
    },
  });

  const result = await main(
    mainOptions({
      env,
      PoolClass,
      ensureMigrationTableFn: async () => events.push("ensure"),
      applyFileFn: async () => events.push("apply"),
    }),
  );

  assert.equal(result.ok, true);
  assert.equal(reads, 1);
  assert.equal(receivedConnectionString, VALID_DATABASE_URL);
});

test("flags de alvo são obrigatórias em execução real", () => {
  assert.throws(
    () => validateExpectedTarget(parseArgs([])),
    /--expect-host é obrigatória/,
  );
  assert.throws(
    () =>
      validateExpectedTarget(
        parseArgs(["--expect-host", EXPECTED_HOST]),
      ),
    /--expect-database é obrigatória/,
  );
});

test("flags de alvo repetidas são rejeitadas", () => {
  assert.throws(
    () =>
      parseArgs([
        "--expect-host",
        EXPECTED_HOST,
        "--expect-host",
        EXPECTED_HOST,
      ]),
    /--expect-host não pode ser repetida/,
  );
  assert.throws(
    () =>
      parseArgs([
        "--expect-database",
        EXPECTED_DATABASE,
        "--expect-database",
        EXPECTED_DATABASE,
      ]),
    /--expect-database não pode ser repetida/,
  );
});

test("flags de alvo sem valor são rejeitadas", () => {
  assert.throws(() => parseArgs(["--expect-host"]), /exige um valor/);
  assert.throws(() => parseArgs(["--expect-database"]), /exige um valor/);
});

test("--expect-host aceita somente hostname canônico lowercase", () => {
  for (const invalidHost of [
    "postgresql://ep-target.neon.tech",
    "ep-target.neon.tech:5432",
    "ep-target.neon.tech/path",
    "ep-target.neon.tech?x=1",
    "user@ep-target.neon.tech",
    "EP-TARGET.NEON.TECH",
    "ep-target.neon.tech.",
  ]) {
    assert.throws(() =>
      validateExpectedTarget({
        expectHost: invalidHost,
        expectDatabase: EXPECTED_DATABASE,
      }),
    );
  }
});

test("--expect-database não aceita valor vazio ou whitespace", () => {
  for (const invalidDatabase of ["", " ", " saude_test", "saude_test "]) {
    assert.throws(() =>
      validateExpectedTarget({
        expectHost: EXPECTED_HOST,
        expectDatabase: invalidDatabase,
      }),
    );
  }
});

test("validação estática rejeita URL inválida", () => {
  assert.throws(
    () => parseAndValidateTarget("não-é-url", expectedTarget()),
    /DATABASE_URL inválida/,
  );
});

test("validação estática rejeita protocolo inválido", () => {
  assert.throws(
    () =>
      parseAndValidateTarget(
        `https://${EXPECTED_HOST}/${EXPECTED_DATABASE}`,
        expectedTarget(),
      ),
    /protocolo PostgreSQL/,
  );
});

test("validação estática rejeita hostname ausente", () => {
  assert.throws(
    () =>
      parseAndValidateTarget(
        `postgresql:/${EXPECTED_DATABASE}`,
        expectedTarget(),
      ),
    /hostname/,
  );
});

test("validação estática rejeita database ausente", () => {
  assert.throws(
    () =>
      parseAndValidateTarget(`postgresql://${EXPECTED_HOST}`, expectedTarget()),
    /conter database/,
  );
});

test("validação estática rejeita database em múltiplos segmentos", () => {
  assert.throws(
    () =>
      parseAndValidateTarget(
        `postgresql://${EXPECTED_HOST}/saude/test`,
        expectedTarget(),
      ),
    /único segmento/,
  );
  assert.throws(
    () =>
      parseAndValidateTarget(
        `postgresql://${EXPECTED_HOST}/saude%2Ftest`,
        expectedTarget(),
      ),
    /único segmento/,
  );
});

test("validação estática rejeita fragmento", () => {
  assert.throws(
    () =>
      parseAndValidateTarget(
        `postgresql://${EXPECTED_HOST}/${EXPECTED_DATABASE}#fragmento`,
        expectedTarget(),
      ),
    /fragmento/,
  );
});

test("validação estática rejeita query capaz de alterar o alvo", () => {
  for (const query of [
    "host=outro.neon.tech",
    "port=5433",
    "options=endpoint%3Dep-outro",
  ]) {
    assert.throws(
      () =>
        parseAndValidateTarget(
          `postgresql://${EXPECTED_HOST}/${EXPECTED_DATABASE}?${query}`,
          expectedTarget(),
        ),
      /parâmetro de query capaz de alterar o alvo/,
    );
  }
});

test("validação estática rejeita porta diferente de 5432", () => {
  assert.throws(
    () =>
      parseAndValidateTarget(
        `postgresql://${EXPECTED_HOST}:5433/${EXPECTED_DATABASE}`,
        expectedTarget(),
      ),
    /porta PostgreSQL 5432/,
  );
});

test("hostname exige igualdade exata e não aceita suffix match", () => {
  assert.throws(
    () =>
      parseAndValidateTarget(
        `postgresql://outro.neon.tech/${EXPECTED_DATABASE}`,
        expectedTarget(),
      ),
    /Hostname PostgreSQL diferente/,
  );
  assert.throws(
    () =>
      parseAndValidateTarget(
        `postgresql://evil.${EXPECTED_HOST}/${EXPECTED_DATABASE}`,
        expectedTarget(),
      ),
    /Hostname PostgreSQL diferente/,
  );
});

test("database exige igualdade exata e case-sensitive", () => {
  assert.throws(
    () =>
      parseAndValidateTarget(
        `postgresql://${EXPECTED_HOST}/outro_database`,
        expectedTarget(),
      ),
    /Database PostgreSQL diferente/,
  );
  assert.throws(
    () =>
      parseAndValidateTarget(
        `postgresql://${EXPECTED_HOST}/SAUDE_TEST`,
        expectedTarget(),
      ),
    /Database PostgreSQL diferente/,
  );
});

test("database percent-decoded é comparado corretamente", () => {
  const target = parseAndValidateTarget(
    `postgresql://${EXPECTED_HOST}/saude%5Ftest`,
    expectedTarget(),
  );

  assert.equal(target.database, EXPECTED_DATABASE);
});

test("target válido preserva hostname e database esperados", () => {
  const target = parseAndValidateTarget(VALID_DATABASE_URL, expectedTarget());

  assert.equal(target.host, EXPECTED_HOST);
  assert.equal(target.database, EXPECTED_DATABASE);
  assert.ok(target.sensitiveValues.includes(VALID_DATABASE_URL));
  assert.ok(target.sensitiveValues.includes(SENTINEL_USER));
  assert.ok(target.sensitiveValues.includes(SENTINEL_PASSWORD));
  assert.ok(target.sensitiveValues.includes(SENTINEL_QUERY));
});

test("nenhum Pool é construído quando a validação estática falha", async () => {
  let poolConstructed = false;

  class ForbiddenPool {
    constructor() {
      poolConstructed = true;
    }
  }

  const result = await main(
    mainOptions({
      env: {
        DATABASE_URL: `postgresql://outro.neon.tech/${EXPECTED_DATABASE}`,
      },
      PoolClass: ForbiddenPool,
    }),
  );

  assert.equal(result.ok, false);
  assert.equal(poolConstructed, false);
});

test("diagnóstico conectado aceita database correto", async () => {
  let receivedSql;
  const diagnostic = await validateConnectedTarget(
    {
      async query(sql) {
        receivedSql = sql;
        return { rows: diagnosticRows() };
      },
    },
    EXPECTED_DATABASE,
  );

  assert.equal(receivedSql, TARGET_DIAGNOSTIC_SQL);
  assert.deepEqual(diagnostic, {
    databaseName: EXPECTED_DATABASE,
    schemaName: "public",
    serverVersion: "17.5",
  });
});

test("diagnóstico conectado rejeita database divergente", async () => {
  await assert.rejects(
    validateConnectedTarget(
      {
        async query() {
          return { rows: diagnosticRows("outro_database") };
        },
      },
      EXPECTED_DATABASE,
    ),
    /database conectado não corresponde/,
  );
});

test("diagnóstico exige exatamente uma linha", async () => {
  for (const rows of [[], diagnosticRows().concat(diagnosticRows())]) {
    await assert.rejects(
      validateConnectedTarget(
        {
          async query() {
            return { rows };
          },
        },
        EXPECTED_DATABASE,
      ),
      /exatamente uma linha/,
    );
  }
});

test("diagnóstico aprovado configura timeout antes de ensureMigrationTable", async () => {
  const events = [];
  const client = {
    async query(sql, params) {
      if (sql === TARGET_DIAGNOSTIC_SQL) {
        events.push("diagnostic");
        return { rows: diagnosticRows(EXPECTED_DATABASE, "custom_schema") };
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
  const PoolClass = makePoolClass({ client, events });

  const result = await main(
    mainOptions({
      PoolClass,
      ensureMigrationTableFn: async () => events.push("ensure"),
      applyFileFn: async () => events.push("apply"),
    }),
  );

  assert.equal(result.ok, true);
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

test("--timeout customizado é enviado ao set_config em milissegundos", async () => {
  const timeoutCalls = [];
  const client = {
    async query(sql, params) {
      if (sql === TARGET_DIAGNOSTIC_SQL) {
        return { rows: diagnosticRows() };
      }

      timeoutCalls.push({ sql, params });
      return { rows: [] };
    },
    release() {},
  };

  const result = await main(
    mainOptions({
      argv: executionArgv(["--timeout", "45000"]),
      PoolClass: makePoolClass({ client }),
    }),
  );

  assert.equal(result.ok, true);
  assert.deepEqual(timeoutCalls, [
    { sql: STATEMENT_TIMEOUT_SQL, params: ["45000ms"] },
  ]);
});

test("falha ao configurar timeout impede ensure, migration e mantém cleanup", async () => {
  const events = [];
  const timeoutError = new Error("falha controlada no set_config");
  const client = {
    async query(sql, params) {
      if (sql === TARGET_DIAGNOSTIC_SQL) {
        events.push("diagnostic");
        return { rows: diagnosticRows() };
      }

      assert.equal(sql, STATEMENT_TIMEOUT_SQL);
      assert.deepEqual(params, ["60000ms"]);
      events.push("set_config");
      throw timeoutError;
    },
    release() {
      events.push("release");
    },
  };

  const result = await main(
    mainOptions({
      PoolClass: makePoolClass({ client, events }),
      ensureMigrationTableFn: async () => events.push("ensure"),
      applyFileFn: async () => events.push("apply"),
    }),
  );

  assert.equal(result.ok, false);
  assert.equal(result.error, timeoutError);
  assert.deepEqual(events, [
    "pool",
    "connect",
    "diagnostic",
    "set_config",
    "release",
    "end",
  ]);
});

test("saída de sucesso não contém URL, usuário, senha ou query", async () => {
  const capture = captureOutput();
  const client = {
    async query(sql) {
      if (sql === TARGET_DIAGNOSTIC_SQL) {
        return { rows: diagnosticRows() };
      }

      return { rows: [] };
    },
    release() {},
  };

  const result = await main(
    mainOptions({
      output: capture.output,
      PoolClass: makePoolClass({ client }),
    }),
  );
  const visible = capture.text();

  assert.equal(result.ok, true);
  assert.match(visible, /target_host_match=true/);
  assert.match(visible, /target_database_match=true/);
  assert.match(visible, /connected_database_match=true/);
  assert.doesNotMatch(visible, new RegExp(SENTINEL_USER));
  assert.doesNotMatch(visible, new RegExp(SENTINEL_PASSWORD));
  assert.doesNotMatch(visible, new RegExp(SENTINEL_QUERY));
  assert.equal(visible.includes(VALID_DATABASE_URL), false);
});

test("erro de conexão bruto não expõe sentinelas", async () => {
  const capture = captureOutput();
  let poolEnded = false;
  const rawError = new Error(
    `falha ${VALID_DATABASE_URL} ${SENTINEL_USER} ${SENTINEL_PASSWORD} ${SENTINEL_QUERY}`,
  );
  const PoolClass = makePoolClass({
    connectError: rawError,
    onEnd: () => {
      poolEnded = true;
    },
  });

  const result = await main(
    mainOptions({ output: capture.output, PoolClass }),
  );
  const visible = capture.text();

  assert.equal(result.ok, false);
  assert.equal(poolEnded, true);
  assert.match(visible, /Falha segura ao conectar/);
  assert.doesNotMatch(visible, new RegExp(SENTINEL_USER));
  assert.doesNotMatch(visible, new RegExp(SENTINEL_PASSWORD));
  assert.doesNotMatch(visible, new RegExp(SENTINEL_QUERY));
  assert.equal(visible.includes(VALID_DATABASE_URL), false);
});

test("formatador remove todos os valores sensíveis conhecidos", () => {
  const capture = captureOutput();
  const target = parseAndValidateTarget(VALID_DATABASE_URL, expectedTarget());
  const error = new Error(
    `${VALID_DATABASE_URL} ${SENTINEL_USER} ${SENTINEL_PASSWORD} ${SENTINEL_QUERY}`,
  );
  error.detail = `${SENTINEL_QUERY} ${SENTINEL_PASSWORD}`;
  error.hint = `${SENTINEL_USER}`;

  prettyPgError(error, {
    output: capture.output,
    sensitiveValues: target.sensitiveValues,
  });

  const visible = capture.text();
  assert.doesNotMatch(visible, new RegExp(SENTINEL_USER));
  assert.doesNotMatch(visible, new RegExp(SENTINEL_PASSWORD));
  assert.doesNotMatch(visible, new RegExp(SENTINEL_QUERY));
  assert.equal(visible.includes(VALID_DATABASE_URL), false);
  assert.match(visible, /\[REDACTED\]/);
});

test("recursos são liberados após falha no diagnóstico", async () => {
  const events = [];
  const client = {
    async query(sql) {
      assert.equal(sql, TARGET_DIAGNOSTIC_SQL);
      events.push("diagnostic");
      throw new Error(
        `${VALID_DATABASE_URL} ${SENTINEL_USER} ${SENTINEL_PASSWORD}`,
      );
    },
    release() {
      events.push("release");
    },
  };
  const capture = captureOutput();
  const result = await main(
    mainOptions({
      output: capture.output,
      PoolClass: makePoolClass({ client, events }),
      ensureMigrationTableFn: async () => events.push("ensure"),
    }),
  );

  assert.equal(result.ok, false);
  assert.deepEqual(events, [
    "pool",
    "connect",
    "diagnostic",
    "release",
    "end",
  ]);
  assert.doesNotMatch(capture.text(), new RegExp(SENTINEL_USER));
  assert.doesNotMatch(capture.text(), new RegExp(SENTINEL_PASSWORD));
  assert.equal(capture.text().includes(VALID_DATABASE_URL), false);
});

test("getRequiredConnectionString rejeita vazio e preserva a string validada", () => {
  assert.throws(() => getRequiredConnectionString({}), /DATABASE_URL/);
  assert.throws(
    () => getRequiredConnectionString({ DATABASE_URL: "   " }),
    /DATABASE_URL/,
  );
  assert.equal(
    getRequiredConnectionString({ DATABASE_URL: VALID_DATABASE_URL }),
    VALID_DATABASE_URL,
  );
});
