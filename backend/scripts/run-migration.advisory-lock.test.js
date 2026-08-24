"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
  MIGRATION_RUNNER_ADVISORY_LOCK_KEY_1,
  MIGRATION_RUNNER_ADVISORY_LOCK_KEY_2,
  MIGRATION_RUNNER_ADVISORY_LOCK_SQL,
  MIGRATION_RUNNER_ADVISORY_UNLOCK_SQL,
  TARGET_DIAGNOSTIC_SQL,
  main,
} = require("./run-migration");

const MIGRATION_FILE = path.resolve(
  __dirname,
  "../db/migrations/2026-08-07-auth-perfis-independentes-expand.sql",
);
const SECOND_MIGRATION_FILE = path.resolve(
  __dirname,
  "../db/migrations/2026-08-20-pre-teste-evento.sql",
);
const DATABASE_URL = "postgresql://runner:secret@ep-target.neon.tech:5432/saude_test";
const ARGV = [
  "--file",
  MIGRATION_FILE,
  "--expect-host",
  "ep-target.neon.tech",
  "--expect-database",
  "saude_test",
];

function makeHarness(options = {}) {
  const events = [];
  const queries = [];
  const output = [];
  const client = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (sql === TARGET_DIAGNOSTIC_SQL) {
        events.push("diagnostic");
        return {
          rows: [
            {
              database_name: "saude_test",
              schema_name: "public",
              server_version: "17.5",
            },
          ],
        };
      }

      if (sql === "SELECT set_config('statement_timeout', $1, false);") {
        events.push("timeout");
        if (options.timeoutError) throw options.timeoutError;
        return { rows: [] };
      }

      if (sql === MIGRATION_RUNNER_ADVISORY_LOCK_SQL) {
        events.push("lock");
        if (options.lockError) throw options.lockError;
        return { rows: [{ acquired: options.lockAcquired ?? true }] };
      }

      if (sql === MIGRATION_RUNNER_ADVISORY_UNLOCK_SQL) {
        events.push("unlock");
        if (options.unlockError) throw options.unlockError;
        return { rows: [{ released: options.unlockReleased ?? true }] };
      }

      throw new Error(`Query inesperada: ${sql}`);
    },
    release() {
      events.push("release");
      if (options.releaseError) throw options.releaseError;
    },
  };

  class FakePool {
    async connect() {
      events.push("connect");
      return client;
    }

    async end() {
      events.push("end");
      if (options.endError) throw options.endError;
    }
  }

  return {
    events,
    queries,
    output: output.join.bind(output, "\n"),
    run(overrides = {}) {
      return main({
        argv: ARGV,
        env: { DATABASE_URL },
        PoolClass: FakePool,
        output: {
          log: (...args) => output.push(args.join(" ")),
          error: (...args) => output.push(args.join(" ")),
        },
        setProcessExitCode: false,
        ensureMigrationTableFn: async () => events.push("ensure"),
        applyFileFn: async () => events.push("apply"),
        ...overrides,
      });
    },
  };
}

test("adquire antes do ledger, usa uma sessao para varios arquivos e libera antes do cleanup", async () => {
  const harness = makeHarness();
  const result = await harness.run({
    argv: [...ARGV, "--file", SECOND_MIGRATION_FILE],
    applyFileFn: async (_client, migration) =>
      harness.events.push(`apply:${migration.canonicalMigrationId}`),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(harness.events, [
    "connect",
    "diagnostic",
    "timeout",
    "lock",
    "ensure",
    "apply:db/migrations/2026-08-07-auth-perfis-independentes-expand.sql",
    "apply:db/migrations/2026-08-20-pre-teste-evento.sql",
    "unlock",
    "release",
    "end",
  ]);
  assert.equal(MIGRATION_RUNNER_ADVISORY_LOCK_SQL.includes("xact"), false);
  assert.match(MIGRATION_RUNNER_ADVISORY_LOCK_SQL, /pg_try_advisory_lock/);
  const lockQuery = harness.queries.find(
    ({ sql }) => sql === MIGRATION_RUNNER_ADVISORY_LOCK_SQL,
  );
  const unlockQuery = harness.queries.find(
    ({ sql }) => sql === MIGRATION_RUNNER_ADVISORY_UNLOCK_SQL,
  );
  assert.deepEqual(lockQuery.params, unlockQuery.params);
  assert.deepEqual(
    [MIGRATION_RUNNER_ADVISORY_LOCK_KEY_1, MIGRATION_RUNNER_ADVISORY_LOCK_KEY_2],
    [1163082829, 1381320274],
  );
});

test("contencao fail-fast nao alcanca ledger ou migrations", async () => {
  const harness = makeHarness({ lockAcquired: false });
  const result = await harness.run();

  assert.equal(result.ok, false);
  assert.match(result.error.message, /Outro runner de migrations/);
  assert.deepEqual(harness.events, [
    "connect",
    "diagnostic",
    "timeout",
    "lock",
    "release",
    "end",
  ]);
});

test("falha apos aquisicao sempre tenta unlock e preserva erro principal", async () => {
  const primaryError = new Error("falha principal");
  const unlockError = new Error("secret");
  const harness = makeHarness({ unlockError });
  const result = await harness.run({
    ensureMigrationTableFn: async () => {
      harness.events.push("ensure");
      throw primaryError;
    },
  });

  assert.equal(result.error, primaryError);
  assert.deepEqual(harness.events, [
    "connect",
    "diagnostic",
    "timeout",
    "lock",
    "ensure",
    "unlock",
    "release",
    "end",
  ]);
  assert.match(harness.output(), /falha ao liberar advisory lock/);
});

test("unlock false ou erro sem falha anterior gera falha operacional", async (t) => {
  for (const options of [
    { unlockReleased: false },
    { unlockError: new Error("falha no unlock") },
  ]) {
    await t.test(JSON.stringify(options.unlockReleased ?? "erro"), async () => {
      const harness = makeHarness(options);
      const result = await harness.run();

      assert.equal(result.ok, false);
      assert.equal(result.error.isOperational, true);
      assert.deepEqual(harness.events.slice(-3), ["unlock", "release", "end"]);
    });
  }
});

test("erro de aquisicao nao tenta unlock e lock e unlock compartilham chaves", async () => {
  const harness = makeHarness({ lockError: new Error("falha no lock") });
  const result = await harness.run();

  assert.equal(result.ok, false);
  assert.deepEqual(harness.events, [
    "connect",
    "diagnostic",
    "timeout",
    "lock",
    "release",
    "end",
  ]);
  assert.equal(MIGRATION_RUNNER_ADVISORY_LOCK_KEY_1, 1163082829);
  assert.equal(MIGRATION_RUNNER_ADVISORY_LOCK_KEY_2, 1381320274);
  assert.match(MIGRATION_RUNNER_ADVISORY_UNLOCK_SQL, /pg_advisory_unlock/);
});

test("release falha apos erro principal, preserva a causa e ainda encerra o pool", async () => {
  const primaryError = new Error("falha principal");
  const harness = makeHarness({ releaseError: new Error("falha release") });
  const result = await harness.run({
    ensureMigrationTableFn: async () => {
      harness.events.push("ensure");
      throw primaryError;
    },
  });

  assert.equal(result.error, primaryError);
  assert.deepEqual(harness.events.slice(-3), ["unlock", "release", "end"]);
  assert.match(harness.output(), /falha no cleanup client\.release/);
});

test("release e pool.end falhos sem erro principal retornam falha operacional deterministica", async () => {
  const harness = makeHarness({
    releaseError: new Error("falha release"),
    endError: new Error("falha end"),
  });
  const result = await harness.run();

  assert.equal(result.ok, false);
  assert.equal(result.error.isOperational, true);
  assert.match(result.error.message, /client\.release/);
  assert.deepEqual(harness.events.slice(-3), ["unlock", "release", "end"]);
  assert.match(harness.output(), /falha no cleanup client\.release/);
  assert.match(harness.output(), /falha no cleanup pool\.end/);
});

test("pool.end falho sem erro anterior retorna falha operacional", async () => {
  const harness = makeHarness({ endError: new Error("falha end") });
  const result = await harness.run();

  assert.equal(result.ok, false);
  assert.equal(result.error.isOperational, true);
  assert.match(result.error.message, /pool\.end/);
  assert.deepEqual(harness.events.slice(-3), ["unlock", "release", "end"]);
});

test("unlock e cleanup falhos nao mascaram erro principal", async () => {
  const primaryError = new Error("falha principal");
  const harness = makeHarness({
    unlockError: new Error("falha unlock"),
    releaseError: new Error("falha release"),
    endError: new Error("falha end"),
  });
  const result = await harness.run({
    ensureMigrationTableFn: async () => {
      harness.events.push("ensure");
      throw primaryError;
    },
  });

  assert.equal(result.error, primaryError);
  assert.deepEqual(harness.events.slice(-3), ["unlock", "release", "end"]);
  assert.match(harness.output(), /falha ao liberar advisory lock/);
  assert.match(harness.output(), /falha no cleanup client\.release/);
  assert.match(harness.output(), /falha no cleanup pool\.end/);
});

test("dry-run, target guard e falha de timeout nao adquirem lock", async () => {
  const dryRun = makeHarness();
  const dryRunResult = await main({
    argv: ["--file", MIGRATION_FILE, "--dry-run"],
    env: new Proxy({}, { get: () => { throw new Error("ambiente lido"); } }),
    PoolClass: class ForbiddenPool {
      constructor() {
        throw new Error("Pool construido");
      }
    },
    output: { log: () => {}, error: () => {} },
    setProcessExitCode: false,
  });
  assert.equal(dryRunResult.ok, true);
  assert.deepEqual(dryRun.events, []);

  const targetGuard = makeHarness();
  const targetResult = await targetGuard.run({ argv: ["--file", MIGRATION_FILE] });
  assert.equal(targetResult.ok, false);
  assert.deepEqual(targetGuard.events, []);

  const timeout = makeHarness({ timeoutError: new Error("timeout falhou") });
  const timeoutResult = await timeout.run();
  assert.equal(timeoutResult.ok, false);
  assert.deepEqual(timeout.events, ["connect", "diagnostic", "timeout", "release", "end"]);
});
