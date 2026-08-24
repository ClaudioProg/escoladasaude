// 📁 scripts/run-migration.js — v2.0
/* eslint-disable no-console */
"use strict";

/**
 * Plataforma Escola da Saúde
 * Runner oficial de migrações SQL PostgreSQL
 *
 * Uso:
 *   node scripts/run-migration.js --file db/migrations/2026-05-11-ajuste.sql
 *   node scripts/run-migration.js --dir db/migrations --pattern "2026-*.sql"
 *   node scripts/run-migration.js --file x.sql --dry-run
 *
 * Flags:
 *   --file, -f       Caminho para um .sql. Pode repetir.
 *   --dir, -d        Pasta com arquivos .sql.
 *   --pattern, -p    Glob simples aplicado ao nome do arquivo dentro de --dir.
 *   --timeout, -t    statement_timeout em ms. Default: 60000.
 *   --ssl            Força SSL relaxed.
 *   --no-ssl         Desativa SSL.
 *   --verbose, -v    Logs detalhados.
 *   --dry-run        Mostra o plano sem conectar e sem executar.
 *   --expect-host    Hostname PostgreSQL esperado para execução real.
 *   --expect-database Database PostgreSQL esperada para execução real.
 *
 * Contrato operacional:
 *   - Sem fallback legado.
 *   - Sem alias de caminho antigo.
 *   - Sem execução implícita.
 *   - Toda migração aplicada é registrada em public.sistema_migracao.
 */

const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { Pool } = require("pg");

const DEFAULT_TIMEOUT_MS = 60000;
const MIGRATION_TABLE = "sistema_migracao";
const MIGRATION_LEDGER_APPLIED_AT_INDEX =
  "idx_sistema_migracao_aplicada_em";
const DEFAULT_POSTGRES_PORT = "5432";
const MIGRATION_RUNNER_ADVISORY_LOCK_KEY_1 = 1163082829;
const MIGRATION_RUNNER_ADVISORY_LOCK_KEY_2 = 1381320274;
const MIGRATION_RUNNER_ADVISORY_LOCK_SQL =
  "SELECT pg_try_advisory_lock($1, $2) AS acquired;";
const MIGRATION_RUNNER_ADVISORY_UNLOCK_SQL =
  "SELECT pg_advisory_unlock($1, $2) AS released;";
const BACKEND_ROOT = path.resolve(__dirname, "..");
const OFFICIAL_MIGRATIONS_ROOT = path.join(BACKEND_ROOT, "db", "migrations");
const FORBIDDEN_TARGET_QUERY_PARAMS = new Set(["host", "port", "options"]);
const MIGRATION_LEDGER_COLUMN_CONTRACT = Object.freeze([
  Object.freeze({
    name: "id",
    formattedType: "bigint",
    defaultKind: "owned_sequence",
  }),
  Object.freeze({
    name: "arquivo",
    formattedType: "text",
    defaultKind: "none",
  }),
  Object.freeze({
    name: "sha256",
    formattedType: "text",
    defaultKind: "none",
  }),
  Object.freeze({
    name: "aplicada_em",
    formattedType: "timestamp without time zone",
    defaultKind: "current_timestamp",
  }),
  Object.freeze({
    name: "tempo_ms",
    formattedType: "integer",
    defaultKind: "zero",
  }),
]);
const TARGET_DIAGNOSTIC_SQL = `
  SELECT
    current_database() AS database_name,
    current_schema() AS schema_name,
    current_setting('server_version') AS server_version;
`;

async function main(options = {}) {
  const startedAt = Date.now();
  const argv = options.argv ?? process.argv.slice(2);
  const env = options.env ?? process.env;
  const PoolClass = options.PoolClass ?? Pool;
  const output = options.output ?? console;
  const ensureMigrationTableFn =
    options.ensureMigrationTableFn ?? ensureMigrationTable;
  const applyFileFn = options.applyFileFn ?? applyFile;
  const setProcessExitCode = options.setProcessExitCode !== false;
  let sensitiveValues = [];

  try {
    const args = parseArgs(argv);
    const log = makeLogger(args.verbose, output);

    const files = await resolveFiles(args, log);

    if (files.length === 0) {
      fail(
        "Nenhum arquivo .sql encontrado. Use --file caminho.sql ou --dir db/migrations.",
      );
    }

    banner(output);

    output.log("🗂️  Arquivos encontrados:", files.length);
    files.forEach((migration, index) => {
      output.log(
        `   ${String(index + 1).padStart(2, "0")} • ` +
          migration.canonicalMigrationId,
      );
    });

    if (args.dryRun) {
      for (const migration of files) {
        const inspected = await inspectMigrationFile(migration);
        output.log(
          `   ${inspected.canonicalMigrationId} sha256=${inspected.sha256}`,
        );
      }

      output.log("\n💡 Modo dry-run: nada será aplicado ao banco.");
      output.log("✅ Plano validado com sucesso.");
      return { ok: true, dryRun: true };
    }

    const expectedTarget = validateExpectedTarget(args);
    const connectionString = getRequiredConnectionString(env);
    const validatedTarget = parseAndValidateTarget(
      connectionString,
      expectedTarget,
    );
    sensitiveValues = validatedTarget.sensitiveValues;

    output.log("target_host_match=true");
    output.log("target_database_match=true");

    const ssl = decideSSL(connectionString, args, env);
    const timeout = toInt(args.timeout, DEFAULT_TIMEOUT_MS);

    output.log("🔒 SSL:", ssl ? "on (relaxed)" : "off");
    output.log("⏳ statement_timeout:", `${timeout}ms`);
    output.log("🧾 Registro:", `public.${MIGRATION_TABLE}`);

    let pool;

    try {
      pool = new PoolClass({
        connectionString,
        ssl,
        max: 1,
        idleTimeoutMillis: 5000,
        connectionTimeoutMillis: 15000,
      });
    } catch {
      fail("Falha segura ao criar o pool PostgreSQL esperado.");
    }

    let client;

    try {
      client = await pool.connect();
    } catch {
      await pool.end().catch(() => {});
      fail("Falha segura ao conectar ao alvo PostgreSQL esperado.");
    }

    let primaryError;

    try {
      try {
      const diagnostic = await validateConnectedTarget(
        client,
        expectedTarget.database,
      );

      output.log("connected_database_match=true");
      output.log(
        `schema=${sanitizeText(diagnostic.schemaName, sensitiveValues)}`,
      );
      output.log(
        `server_version=${sanitizeText(
          diagnostic.serverVersion,
          sensitiveValues,
        )}`,
      );

      await client.query(
        "SELECT set_config('statement_timeout', $1, false);",
        [`${timeout}ms`],
      );

      await acquireMigrationRunnerAdvisoryLock(client);
      let executionError;

      try {
        await ensureMigrationTableFn(client);

        await applyFilesSequentially(
          client,
          files,
          {
            log,
            output,
            sensitiveValues,
          },
          applyFileFn,
        );

        output.log("\n✅ Todas as migrações concluídas sem erros.");

        const secs = ((Date.now() - startedAt) / 1000).toFixed(2);
        output.log(`⏱️  Tempo total: ${secs}s`);
      } catch (err) {
        executionError = err;
        throw err;
      } finally {
        try {
          await releaseMigrationRunnerAdvisoryLock(client);
        } catch (unlockError) {
          if (executionError) {
            output.error(
              `Diagnóstico: falha ao liberar advisory lock: ${sanitizeText(
                unlockError.message,
                sensitiveValues,
              )}`,
            );
          } else {
            throw unlockError;
          }
        }
      }
      } catch (err) {
        primaryError = err;
        throw err;
      }
    } finally {
      const cleanupError = await cleanupRunnerResources(client, pool, {
        output,
        sensitiveValues,
        primaryError,
      });

      if (!primaryError && cleanupError) {
        throw cleanupError;
      }
    }

    return { ok: true, dryRun: false };
  } catch (err) {
    output.error("\n❌ Falha na migração:");
    prettyPgError(err, { output, sensitiveValues });

    if (setProcessExitCode) {
      process.exitCode = 1;
    }

    return { ok: false, error: err };
  }
}

if (require.main === module) {
  void main();
}

/* ─────────────────────────────────────────
   Argumentos
───────────────────────────────────────── */

function parseArgs(argv) {
  const out = {
    file: [],
    dir: null,
    pattern: "*",
    timeout: undefined,
    verbose: false,
    dryRun: false,
    ssl: false,
    noSsl: false,
    expectHost: null,
    expectDatabase: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    const readNext = (flag) => {
      const value = argv[i + 1];

      if (!value || /^-.+/.test(value)) {
        fail(`A flag ${flag} exige um valor.`);
      }

      i += 1;
      return value;
    };

    if (arg === "--file" || arg === "-f") {
      out.file.push(readNext(arg));
    } else if (arg === "--dir" || arg === "-d") {
      out.dir = readNext(arg);
    } else if (arg === "--pattern" || arg === "-p") {
      out.pattern = readNext(arg);
    } else if (arg === "--timeout" || arg === "-t") {
      out.timeout = readNext(arg);
    } else if (arg === "--ssl") {
      out.ssl = true;
    } else if (arg === "--no-ssl") {
      out.noSsl = true;
    } else if (arg === "--verbose" || arg === "-v") {
      out.verbose = true;
    } else if (arg === "--dry-run") {
      out.dryRun = true;
    } else if (arg === "--force") {
      fail(
        "--force não é suportado. Migrations são imutáveis e forward-only; " +
          "crie uma nova migration.",
      );
    } else if (arg === "--expect-host") {
      if (out.expectHost !== null) {
        fail("A flag --expect-host não pode ser repetida.");
      }

      out.expectHost = readNext(arg);
    } else if (arg === "--expect-database") {
      if (out.expectDatabase !== null) {
        fail("A flag --expect-database não pode ser repetida.");
      }

      out.expectDatabase = readNext(arg);
    } else if (/^-.+/.test(arg)) {
      fail(`Flag desconhecida: ${arg}`);
    } else {
      out.file.push(arg);
    }
  }

  if (out.ssl && out.noSsl) {
    fail("Use apenas uma opção: --ssl ou --no-ssl.");
  }

  return out;
}

function toInt(value, fallback) {
  const n = Number.parseInt(value, 10);

  if (!Number.isFinite(n) || n <= 0) {
    return fallback;
  }

  return n;
}

function makeLogger(verbose, output = console) {
  return {
    debug: (...args) => {
      if (verbose) {
        output.log("[debug]", ...args);
      }
    },
  };
}

/* ─────────────────────────────────────────
   Arquivos
───────────────────────────────────────── */

async function resolveFiles(args, log, dependencies = {}) {
  const cwd = dependencies.cwd ?? process.cwd();
  const realpath = dependencies.realpath ?? fsp.realpath;
  const stat = dependencies.stat ?? fsp.stat;
  const readdir = dependencies.readdir ?? fsp.readdir;
  let officialRootReal;

  try {
    officialRootReal = await realpath(OFFICIAL_MIGRATIONS_ROOT);
  } catch {
    fail("A árvore oficial db/migrations não foi encontrada ou está inacessível.");
  }

  const files = new Map();

  for (const file of args.file || []) {
    if (!file) continue;

    const migration = await resolveOfficialMigrationFile(file, {
      cwd,
      officialRootReal,
      realpath,
      stat,
    });

    files.set(migration.canonicalMigrationId, migration);
  }

  if (args.dir) {
    const requestedDir = path.resolve(cwd, args.dir);
    let dir;
    let dirStat;

    try {
      dir = await realpath(requestedDir);
      dirStat = await stat(dir);
    } catch {
      fail(
        `Diretório de migrations não encontrado ou inacessível: ${safePathLabel(
          args.dir,
        )}.`,
      );
    }

    if (!dirStat.isDirectory()) {
      fail(`O caminho de --dir não é diretório: ${safePathLabel(args.dir)}.`);
    }

    if (!isPathInsideRoot(officialRootReal, dir, { allowRoot: true })) {
      fail("--dir deve apontar para a árvore oficial db/migrations.");
    }

    let list;

    try {
      list = await readdir(dir);
    } catch {
      fail("Não foi possível listar a árvore oficial de migrations.");
    }

    const regex = globToRegex(args.pattern || "*");

    const matchedNames = list
      .filter((name) => regex.test(name))
      .filter((name) => name.toLowerCase().endsWith(".sql"))
      .sort((a, b) => a.localeCompare(b, "pt-BR"));

    for (const name of matchedNames) {
      const migration = await resolveOfficialMigrationFile(
        path.join(dir, name),
        {
          cwd,
          officialRootReal,
          realpath,
          stat,
        },
      );

      files.set(migration.canonicalMigrationId, migration);
    }

    log.debug(
      "arquivos encontrados no diretório:",
      Array.from(files.values(), (migration) => migration.canonicalMigrationId),
    );
  }

  return Array.from(files.values());
}

async function resolveOfficialMigrationFile(requestedPath, dependencies) {
  const { cwd, officialRootReal, realpath, stat } = dependencies;
  const requestedAbsolute = path.resolve(cwd, requestedPath);
  let fullPath;
  let fileStat;

  try {
    fullPath = await realpath(requestedAbsolute);
    fileStat = await stat(fullPath);
  } catch {
    fail(
      `Arquivo de migration não encontrado ou inacessível: ${safePathLabel(
        requestedPath,
      )}.`,
    );
  }

  if (!fileStat.isFile()) {
    fail(
      `O caminho de migration não é arquivo regular: ${safePathLabel(
        requestedPath,
      )}.`,
    );
  }

  if (!fullPath.toLowerCase().endsWith(".sql")) {
    fail(
      `O arquivo de migration precisa ter extensão .sql: ${safePathLabel(
        requestedPath,
      )}.`,
    );
  }

  if (!isPathInsideRoot(officialRootReal, fullPath)) {
    fail("A migration deve permanecer dentro da árvore oficial db/migrations.");
  }

  const relativePath = path.relative(officialRootReal, fullPath);

  if (path.sep === "/" && relativePath.includes("\\")) {
    fail(
      "O nome da migration contém separador incompatível com a identidade canônica.",
    );
  }

  return {
    fullPath,
    canonicalMigrationId: buildCanonicalMigrationId(relativePath),
  };
}

function isPathInsideRoot(rootPath, candidatePath, options = {}) {
  const pathApi = options.pathApi ?? path;
  const relative = pathApi.relative(rootPath, candidatePath);

  if (relative === "") return options.allowRoot === true;

  return (
    !pathApi.isAbsolute(relative) &&
    relative !== ".." &&
    !relative.startsWith(`..${pathApi.sep}`)
  );
}

function buildCanonicalMigrationId(relativePath) {
  const posixRelative = String(relativePath ?? "").replace(/\\/g, "/");
  const normalized = path.posix.normalize(posixRelative);

  if (
    !posixRelative ||
    normalized !== posixRelative ||
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    path.posix.isAbsolute(normalized)
  ) {
    fail("Não foi possível produzir identidade canônica segura da migration.");
  }

  const canonicalMigrationId = `db/migrations/${normalized}`;

  if (!isCanonicalMigrationId(canonicalMigrationId)) {
    fail("Não foi possível produzir identidade canônica segura da migration.");
  }

  return canonicalMigrationId;
}

function isCanonicalMigrationId(value) {
  if (typeof value !== "string" || value.includes("\\")) return false;
  if (!value.startsWith("db/migrations/")) return false;

  const relative = value.slice("db/migrations/".length);

  return (
    relative.length > 0 &&
    !relative.includes(":") &&
    !/[\u0000-\u001f\u007f]/.test(relative) &&
    relative.toLowerCase().endsWith(".sql") &&
    path.posix.normalize(relative) === relative &&
    !path.posix.isAbsolute(relative) &&
    relative !== ".." &&
    !relative.startsWith("../")
  );
}

function safePathLabel(value) {
  const normalized = toSingleLine(value).replace(/\\/g, "/");
  const basename = path.posix
    .basename(normalized)
    .replace(/[\u0000-\u001f\u007f]/g, "?");

  return basename || "caminho informado";
}

function globToRegex(glob) {
  const safe = String(glob || "*")
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");

  return new RegExp(`^${safe}$`, "i");
}

/* ─────────────────────────────────────────
   Banco
───────────────────────────────────────── */

function validateExpectedTarget(args) {
  const expectedHost = args.expectHost;
  const expectedDatabase = args.expectDatabase;

  if (!expectedHost) {
    fail("A flag --expect-host é obrigatória em execuções reais.");
  }

  if (!expectedDatabase) {
    fail("A flag --expect-database é obrigatória em execuções reais.");
  }

  if (expectedHost !== expectedHost.trim()) {
    fail("O valor de --expect-host deve ser um hostname canônico.");
  }

  if (expectedHost !== expectedHost.toLowerCase()) {
    fail("O valor de --expect-host deve estar em lowercase.");
  }

  if (expectedHost.endsWith(".")) {
    fail("O valor de --expect-host não pode terminar com ponto.");
  }

  const hostnamePattern =
    /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

  if (!hostnamePattern.test(expectedHost)) {
    fail(
      "O valor de --expect-host deve conter somente um hostname, sem protocolo, porta, path, query ou credenciais.",
    );
  }

  if (
    expectedDatabase !== expectedDatabase.trim() ||
    /[\u0000-\u001f\u007f]/.test(expectedDatabase)
  ) {
    fail("O valor de --expect-database deve ser um database não vazio válido.");
  }

  return {
    host: expectedHost,
    database: expectedDatabase,
  };
}

function getRequiredConnectionString(env = process.env) {
  const connectionString = env.DATABASE_URL;

  if (
    typeof connectionString !== "string" ||
    connectionString.trim().length === 0
  ) {
    fail(
      "DATABASE_URL não encontrada no ambiente. Defina DATABASE_URL antes de executar migrações.",
    );
  }

  if (connectionString !== connectionString.trim()) {
    fail("DATABASE_URL inválida.");
  }

  return connectionString;
}

function parseAndValidateTarget(connectionString, expectedTarget) {
  let parsed;

  try {
    parsed = new URL(connectionString);
  } catch {
    fail("DATABASE_URL inválida.");
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    fail("DATABASE_URL deve usar protocolo PostgreSQL.");
  }

  if (!parsed.hostname) {
    fail("DATABASE_URL deve conter hostname.");
  }

  if (parsed.hash) {
    fail("DATABASE_URL não pode conter fragmento.");
  }

  for (const key of parsed.searchParams.keys()) {
    if (FORBIDDEN_TARGET_QUERY_PARAMS.has(key.toLowerCase())) {
      fail(
        "DATABASE_URL contém parâmetro de query capaz de alterar o alvo PostgreSQL.",
      );
    }
  }

  const effectivePort = parsed.port || DEFAULT_POSTGRES_PORT;

  if (effectivePort !== DEFAULT_POSTGRES_PORT) {
    fail("DATABASE_URL deve usar a porta PostgreSQL 5432.");
  }

  const encodedPath = parsed.pathname;

  if (!encodedPath || encodedPath === "/") {
    fail("DATABASE_URL deve conter database.");
  }

  const encodedDatabase = encodedPath.slice(1);

  if (!encodedDatabase || encodedDatabase.includes("/")) {
    fail("DATABASE_URL deve identificar o database em um único segmento.");
  }

  let database;

  try {
    database = decodeURIComponent(encodedDatabase);
  } catch {
    fail("DATABASE_URL contém database inválido.");
  }

  if (
    !database ||
    database.includes("/") ||
    /[\u0000-\u001f\u007f]/.test(database)
  ) {
    fail("DATABASE_URL deve identificar o database em um único segmento.");
  }

  if (parsed.hostname !== expectedTarget.host) {
    fail("Hostname PostgreSQL diferente do alvo explicitamente esperado.");
  }

  if (database !== expectedTarget.database) {
    fail("Database PostgreSQL diferente do alvo explicitamente esperado.");
  }

  return {
    host: parsed.hostname,
    database,
    sensitiveValues: collectSensitiveValues(connectionString, parsed),
  };
}

function decideSSL(connectionString, args, env = process.env) {
  if (args.ssl) {
    return { rejectUnauthorized: false };
  }

  if (args.noSsl) {
    return false;
  }

  const envSSL =
    String(env.DATABASE_SSL || "").toLowerCase() === "true";

  const urlRequiresSSL =
    /sslmode=require/i.test(connectionString) ||
    /render\.com/i.test(connectionString) ||
    /neon\.tech/i.test(connectionString);

  return envSSL || urlRequiresSSL ? { rejectUnauthorized: false } : false;
}

async function acquireMigrationRunnerAdvisoryLock(client) {
  const result = await client.query(MIGRATION_RUNNER_ADVISORY_LOCK_SQL, [
    MIGRATION_RUNNER_ADVISORY_LOCK_KEY_1,
    MIGRATION_RUNNER_ADVISORY_LOCK_KEY_2,
  ]);

  if (result.rows?.[0]?.acquired !== true) {
    fail("Outro runner de migrations ja esta em execucao.");
  }
}

async function releaseMigrationRunnerAdvisoryLock(client) {
  let result;

  try {
    result = await client.query(MIGRATION_RUNNER_ADVISORY_UNLOCK_SQL, [
      MIGRATION_RUNNER_ADVISORY_LOCK_KEY_1,
      MIGRATION_RUNNER_ADVISORY_LOCK_KEY_2,
    ]);
  } catch {
    fail("Falha operacional ao liberar advisory lock do runner.");
  }

  if (result.rows?.[0]?.released !== true) {
    fail("Inconsistencia: advisory lock do runner nao estava adquirido.");
  }
}

async function cleanupRunnerResources(
  client,
  pool,
  { output, sensitiveValues, primaryError },
) {
  const cleanupFailures = [];

  try {
    client.release();
  } catch {
    cleanupFailures.push("client.release");
  }

  try {
    await pool.end();
  } catch {
    cleanupFailures.push("pool.end");
  }

  for (const stage of cleanupFailures) {
    output.error(
      `Diagnostico: falha no cleanup ${sanitizeText(
        stage,
        sensitiveValues,
      )}.`,
    );
  }

  if (primaryError || cleanupFailures.length === 0) {
    return null;
  }

  const cleanupError = new Error(
    `Falha operacional durante cleanup do runner: ${cleanupFailures[0]}.`,
  );
  cleanupError.isOperational = true;
  return cleanupError;
}

async function validateConnectedTarget(client, expectedDatabase) {
  let result;

  try {
    result = await client.query(TARGET_DIAGNOSTIC_SQL);
  } catch {
    fail("Falha segura ao executar o diagnóstico PostgreSQL inicial.");
  }

  if (!Array.isArray(result?.rows) || result.rows.length !== 1) {
    fail("O diagnóstico PostgreSQL inicial deve retornar exatamente uma linha.");
  }

  const diagnostic = result.rows[0];
  const databaseName = diagnostic?.database_name;
  const schemaName = diagnostic?.schema_name;
  const serverVersion = diagnostic?.server_version;

  if (
    typeof databaseName !== "string" ||
    databaseName.length === 0 ||
    typeof schemaName !== "string" ||
    schemaName.length === 0 ||
    typeof serverVersion !== "string" ||
    serverVersion.length === 0
  ) {
    fail("O diagnóstico PostgreSQL inicial retornou dados inválidos.");
  }

  if (databaseName !== expectedDatabase) {
    fail("O database conectado não corresponde ao alvo esperado.");
  }

  return {
    databaseName,
    schemaName: toSingleLine(schemaName),
    serverVersion: toSingleLine(serverVersion),
  };
}

async function ensureMigrationTable(client) {
  const existenceResult = await client.query(`
    SELECT to_regclass('public.${MIGRATION_TABLE}') IS NOT NULL AS table_exists;
  `);
  const existenceRows = existenceResult?.rows;

  if (!Array.isArray(existenceRows) || existenceRows.length !== 1) {
    failLegacyMigrationLedger("não foi possível determinar a existência da tabela");
  }

  if (existenceRows[0].table_exists !== true) {
    await client.query(`
      CREATE TABLE public.${MIGRATION_TABLE} (
        id BIGSERIAL PRIMARY KEY,
        arquivo TEXT NOT NULL,
        sha256 TEXT NOT NULL,
        aplicada_em TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
        tempo_ms INTEGER NOT NULL DEFAULT 0,
        CONSTRAINT ${MIGRATION_TABLE}_arquivo_key UNIQUE (arquivo)
      );
    `);

    await client.query(`
      CREATE INDEX idx_${MIGRATION_TABLE}_aplicada_em
        ON public.${MIGRATION_TABLE} (aplicada_em DESC);
    `);
    return;
  }

  const columnsResult = await client.query(`
    SELECT
      column_definition.attname AS column_name,
      format_type(
        column_definition.atttypid,
        column_definition.atttypmod
      ) AS formatted_type,
      column_definition.attnotnull AS not_null,
      column_definition.attisdropped AS is_dropped,
      column_definition.attidentity AS identity_kind,
      column_definition.attgenerated AS generated_kind,
      pg_get_expr(
        default_definition.adbin,
        default_definition.adrelid,
        true
      ) AS default_expression,
      EXISTS (
        SELECT 1
        FROM pg_depend AS default_dependency
        JOIN pg_class AS sequence_class
          ON sequence_class.oid = default_dependency.refobjid
         AND default_dependency.refclassid = 'pg_class'::regclass
         AND sequence_class.relkind = 'S'
        JOIN pg_sequence AS sequence_definition
          ON sequence_definition.seqrelid = sequence_class.oid
         AND sequence_definition.seqtypid = 'bigint'::regtype
        JOIN pg_depend AS ownership_dependency
          ON ownership_dependency.classid = 'pg_class'::regclass
         AND ownership_dependency.objid = sequence_class.oid
         AND ownership_dependency.objsubid = 0
         AND ownership_dependency.refclassid = 'pg_class'::regclass
         AND ownership_dependency.refobjid = table_class.oid
         AND ownership_dependency.refobjsubid = column_definition.attnum
         AND ownership_dependency.deptype = 'a'
        WHERE default_dependency.classid = 'pg_attrdef'::regclass
          AND default_dependency.objid = default_definition.oid
          AND default_dependency.objsubid = 0
          AND default_dependency.deptype = 'n'
      ) AS default_uses_owned_bigint_sequence
    FROM pg_attribute AS column_definition
    JOIN pg_class AS table_class
      ON table_class.oid = column_definition.attrelid
    JOIN pg_namespace AS table_namespace
      ON table_namespace.oid = table_class.relnamespace
    LEFT JOIN pg_attrdef AS default_definition
      ON default_definition.adrelid = column_definition.attrelid
     AND default_definition.adnum = column_definition.attnum
    WHERE table_namespace.nspname = 'public'
      AND table_class.relname = '${MIGRATION_TABLE}'
      AND column_definition.attnum > 0
    ORDER BY column_definition.attnum;
  `);
  validateMigrationLedgerColumns(columnsResult?.rows);

  const primaryKeysResult = await client.query(`
    SELECT
      constraint_definition.conname AS constraint_name,
      ARRAY(
        SELECT pg_get_indexdef(
          index_definition.indexrelid,
          indexed_position.position,
          true
        )
        FROM generate_series(1, index_definition.indnkeyatts)
          AS indexed_position(position)
        ORDER BY indexed_position.position
      ) AS columns,
      constraint_definition.convalidated AS is_validated,
      constraint_definition.condeferrable AS is_deferrable,
      constraint_definition.condeferred AS is_deferred,
      index_definition.indisprimary AS is_primary,
      index_definition.indisunique AS is_unique,
      index_definition.indimmediate AS is_immediate,
      index_definition.indisvalid AS is_valid,
      index_definition.indisready AS is_ready,
      index_definition.indislive AS is_live,
      index_definition.indpred IS NULL AS is_unconditional,
      index_definition.indexprs IS NULL AS is_plain
    FROM pg_constraint AS constraint_definition
    JOIN pg_class AS table_class
      ON table_class.oid = constraint_definition.conrelid
    JOIN pg_namespace AS table_namespace
      ON table_namespace.oid = table_class.relnamespace
    JOIN pg_index AS index_definition
      ON index_definition.indexrelid = constraint_definition.conindid
     AND index_definition.indrelid = table_class.oid
    WHERE table_namespace.nspname = 'public'
      AND table_class.relname = '${MIGRATION_TABLE}'
      AND constraint_definition.contype = 'p'
    ORDER BY constraint_definition.conname;
  `);
  validateMigrationLedgerPrimaryKey(primaryKeysResult?.rows);

  const uniqueIndexesResult = await client.query(`
    SELECT
      index_class.relname AS index_name,
      ARRAY(
        SELECT pg_get_indexdef(
          index_definition.indexrelid,
          indexed_position.position,
          true
        )
        FROM generate_series(1, index_definition.indnkeyatts)
          AS indexed_position(position)
        ORDER BY indexed_position.position
      ) AS columns,
      index_definition.indimmediate AS is_immediate,
      index_definition.indisvalid AS is_valid,
      index_definition.indisready AS is_ready,
      index_definition.indislive AS is_live,
      index_definition.indpred IS NULL AS is_unconditional,
      index_definition.indexprs IS NULL AS is_plain
    FROM pg_index AS index_definition
    JOIN pg_class AS table_class
      ON table_class.oid = index_definition.indrelid
    JOIN pg_namespace AS table_namespace
      ON table_namespace.oid = table_class.relnamespace
    JOIN pg_class AS index_class
      ON index_class.oid = index_definition.indexrelid
    WHERE table_namespace.nspname = 'public'
      AND table_class.relname = '${MIGRATION_TABLE}'
      AND index_definition.indisunique
      AND NOT index_definition.indisprimary
    ORDER BY index_class.relname;
  `);
  validateMigrationLedgerUniqueness(uniqueIndexesResult?.rows);

  const appliedAtIndexesResult = await client.query(`
    SELECT
      index_class.relname AS index_name,
      access_method.amname AS access_method,
      ARRAY(
        SELECT pg_get_indexdef(
          index_definition.indexrelid,
          indexed_position.position,
          true
        )
        FROM generate_series(1, index_definition.indnkeyatts)
          AS indexed_position(position)
        ORDER BY indexed_position.position
      ) AS columns,
      index_definition.indisunique AS is_unique,
      index_definition.indisvalid AS is_valid,
      index_definition.indisready AS is_ready,
      index_definition.indislive AS is_live,
      index_definition.indpred IS NULL AS is_unconditional,
      index_definition.indexprs IS NULL AS is_plain
    FROM pg_index AS index_definition
    JOIN pg_class AS table_class
      ON table_class.oid = index_definition.indrelid
    JOIN pg_namespace AS table_namespace
      ON table_namespace.oid = table_class.relnamespace
    JOIN pg_class AS index_class
      ON index_class.oid = index_definition.indexrelid
    JOIN pg_am AS access_method
      ON access_method.oid = index_class.relam
    WHERE table_namespace.nspname = 'public'
      AND table_class.relname = '${MIGRATION_TABLE}'
      AND index_class.relname = '${MIGRATION_LEDGER_APPLIED_AT_INDEX}'
    ORDER BY index_class.relname;
  `);
  validateMigrationLedgerAppliedAtIndex(appliedAtIndexesResult?.rows);

  const recordsResult = await client.query(`
    SELECT arquivo, sha256
    FROM public.${MIGRATION_TABLE}
    ORDER BY arquivo, sha256;
  `);
  validateMigrationLedgerRecords(recordsResult?.rows);
}

function validateMigrationLedgerColumns(columns) {
  if (!Array.isArray(columns)) {
    failLegacyMigrationLedger("catálogo de colunas retornou estrutura inválida");
  }

  const liveColumns = columns.filter((column) => column?.is_dropped === false);
  const columnsByName = new Map(
    liveColumns.map((column) => [column.column_name, column]),
  );

  if (
    liveColumns.length !== MIGRATION_LEDGER_COLUMN_CONTRACT.length ||
    columnsByName.size !== MIGRATION_LEDGER_COLUMN_CONTRACT.length
  ) {
    failLegacyMigrationLedger("conjunto de colunas incompatível");
  }

  for (const contract of MIGRATION_LEDGER_COLUMN_CONTRACT) {
    const column = columnsByName.get(contract.name);

    if (
      column?.formatted_type !== contract.formattedType ||
      column?.not_null !== true ||
      column?.identity_kind !== "" ||
      column?.generated_kind !== ""
    ) {
      failLegacyMigrationLedger(
        `coluna obrigatória incompatível: ${contract.name}`,
      );
    }

    validateMigrationLedgerColumnDefault(contract.name, column, contract);
  }
}

function validateMigrationLedgerColumnDefault(columnName, column, contract) {
  const expression = normalizeCatalogExpression(column.default_expression);
  let isCompatible = false;

  if (contract.defaultKind === "none") {
    isCompatible = column.default_expression == null;
  } else if (contract.defaultKind === "owned_sequence") {
    isCompatible =
      column.default_uses_owned_bigint_sequence === true &&
      /^nextval\(.+::regclass\)$/.test(expression);
  } else if (contract.defaultKind === "current_timestamp") {
    isCompatible = isCurrentTimestampDefault(expression);
  } else if (contract.defaultKind === "zero") {
    isCompatible = isZeroIntegerDefault(expression);
  }

  if (!isCompatible) {
    failLegacyMigrationLedger(`default incompatível: ${columnName}`);
  }
}

function normalizeCatalogExpression(expression) {
  if (typeof expression !== "string") return "";

  return expression
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\s*::\s*/g, "::")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")");
}

function isCurrentTimestampDefault(expression) {
  return (
    /^(?:now\(\)|current_timestamp)$/.test(expression) ||
    /^\((?:now\(\)|current_timestamp)\)::timestamp without time zone$/.test(
      expression,
    ) ||
    /^(?:now\(\)|current_timestamp)::timestamp without time zone$/.test(
      expression,
    )
  );
}

function isZeroIntegerDefault(expression) {
  return /^(?:0|\(0\)|0::integer|\(0\)::integer|'0'::integer)$/.test(
    expression,
  );
}

function validateMigrationLedgerPrimaryKey(primaryKeys) {
  if (!Array.isArray(primaryKeys)) {
    failLegacyMigrationLedger(
      "catálogo de primary key retornou estrutura inválida",
    );
  }

  const primaryKey = primaryKeys[0];
  const isCompatible =
    primaryKeys.length === 1 &&
    Array.isArray(primaryKey?.columns) &&
    primaryKey.columns.length === 1 &&
    primaryKey.columns[0] === "id" &&
    primaryKey.is_validated === true &&
    primaryKey.is_deferrable === false &&
    primaryKey.is_deferred === false &&
    primaryKey.is_primary === true &&
    primaryKey.is_unique === true &&
    primaryKey.is_immediate === true &&
    primaryKey.is_valid === true &&
    primaryKey.is_ready === true &&
    primaryKey.is_live === true &&
    primaryKey.is_unconditional === true &&
    primaryKey.is_plain === true;

  if (!isCompatible) {
    failLegacyMigrationLedger("PRIMARY KEY simples e válida sobre id ausente");
  }
}

function validateMigrationLedgerUniqueness(uniqueIndexes) {
  if (Array.isArray(uniqueIndexes) && uniqueIndexes.length > 1) {
    failLegacyMigrationLedger(
      "estrutura de unicidade por arquivo canônico incompatível",
    );
  }
  if (!Array.isArray(uniqueIndexes)) {
    failLegacyMigrationLedger("catálogo de índices retornou estrutura inválida");
  }

  const canonicalUniqueIndexes = uniqueIndexes.filter(
    (index) =>
      Array.isArray(index.columns) &&
      index.columns.length === 1 &&
      index.columns[0] === "arquivo",
  );

  if (canonicalUniqueIndexes.length === 0) {
    failLegacyMigrationLedger("unicidade por arquivo canônico ausente");
  }

  const hasIncompatibleCanonicalUniqueness = canonicalUniqueIndexes.some(
    (index) =>
      index.is_immediate !== true ||
      index.is_valid !== true ||
      index.is_ready !== true ||
      index.is_live !== true ||
      index.is_unconditional !== true ||
      index.is_plain !== true,
  );

  if (hasIncompatibleCanonicalUniqueness) {
    failLegacyMigrationLedger(
      "estrutura de unicidade por arquivo canônico incompatível",
    );
  }
}

function validateMigrationLedgerAppliedAtIndex(indexes) {
  if (!Array.isArray(indexes)) {
    failLegacyMigrationLedger("catalogo do indice aplicada_em retornou estrutura invalida");
  }

  const index = indexes[0];
  const isCompatible =
    indexes.length === 1 &&
    index?.index_name === MIGRATION_LEDGER_APPLIED_AT_INDEX &&
    index.access_method === "btree" &&
    Array.isArray(index.columns) &&
    index.columns.length === 1 &&
    index.columns[0] === "aplicada_em DESC" &&
    index.is_unique === false &&
    index.is_valid === true &&
    index.is_ready === true &&
    index.is_live === true &&
    index.is_unconditional === true &&
    index.is_plain === true;

  if (!isCompatible) {
    failLegacyMigrationLedger("indice aplicada_em incompativel");
  }
}

function validateMigrationLedgerRecords(records) {
  if (!Array.isArray(records)) {
    failLegacyMigrationLedger("consulta de registros retornou estrutura inválida");
  }

  const seenFiles = new Set();

  for (const record of records) {
    if (
      !isCanonicalMigrationId(record?.arquivo) ||
      typeof record?.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(record.sha256)
    ) {
      failLegacyMigrationLedger("registro em identidade legada ou inválida");
    }

    if (seenFiles.has(record.arquivo)) {
      failLegacyMigrationLedger("mais de um registro para a mesma migration");
    }

    seenFiles.add(record.arquivo);
  }
}

function failLegacyMigrationLedger(reason) {
  fail(
    `Ledger public.${MIGRATION_TABLE} legado/incompatível: ${reason}. ` +
      "Faça a adequação por processo operacional separado antes de executar migrations.",
  );
}

/* ─────────────────────────────────────────
   Aplicação
───────────────────────────────────────── */

async function applyFilesSequentially(
  client,
  files,
  options = {},
  applyFileFn = applyFile,
) {
  for (const migration of files) {
    await applyFileFn(client, migration, { ...options });
  }
}

function validateMigrationSql(sql, options = {}) {
  const suppliedFileName = String(options.fileName ?? "migration.sql");
  const fileName = sanitizeText(
    isCanonicalMigrationId(suppliedFileName)
      ? suppliedFileName
      : path.basename(suppliedFileName),
    options.sensitiveValues ?? [],
  );
  let statements;

  try {
    statements = collectTopLevelStatementTokens(sql);
  } catch (error) {
    if (!(error instanceof MigrationSqlLexicalError)) throw error;

    fail(
      `Migration ${fileName} rejeitada: SQL lexicalmente inválido ` +
        `(${error.category}).`,
    );
  }

  for (const tokens of statements) {
    const violation = classifyProhibitedStatement(tokens);

    if (!violation) continue;

    fail(
      `Migration ${fileName} rejeitada: comando proibido ${violation.command} ` +
        `(${violation.category}). Execute-o por processo excepcional separado.`,
    );
  }
}

class MigrationSqlLexicalError extends Error {
  constructor(category) {
    super(category);
    this.name = "MigrationSqlLexicalError";
    this.category = category;
  }
}

function collectTopLevelStatementTokens(sql) {
  const source = String(sql ?? "");
  const statements = [];
  let tokens = [];
  let index = 0;

  const finishStatement = () => {
    if (tokens.length > 0) {
      statements.push(tokens);
      tokens = [];
    }
  };

  while (index < source.length) {
    const current = source[index];
    const next = source[index + 1];

    if (current === "-" && next === "-") {
      index = skipLineComment(source, index + 2);
      continue;
    }

    if (current === "/" && next === "*") {
      const commentEnd = skipBlockComment(source, index + 2);

      if (commentEnd === -1) {
        throw new MigrationSqlLexicalError(
          "comentário de bloco não terminado",
        );
      }

      index = commentEnd;
      continue;
    }

    if (current === "'") {
      const quotedValueEnd = skipQuotedValue(
        source,
        index + 1,
        "'",
        hasEscapeStringPrefix(source, index),
      );

      if (quotedValueEnd === -1) {
        throw new MigrationSqlLexicalError("string SQL não terminada");
      }

      index = quotedValueEnd;
      continue;
    }

    if (current === '"') {
      const quotedValueEnd = skipQuotedValue(
        source,
        index + 1,
        '"',
        hasUnicodeQuotedPrefix(source, index),
      );

      if (quotedValueEnd === -1) {
        throw new MigrationSqlLexicalError(
          "identificador quoted não terminado",
        );
      }

      index = quotedValueEnd;
      continue;
    }

    if (current === "$") {
      const delimiter = readDollarQuoteDelimiter(source, index);

      if (delimiter) {
        const closingIndex = source.indexOf(
          delimiter,
          index + delimiter.length,
        );

        if (closingIndex === -1) {
          throw new MigrationSqlLexicalError("dollar quote não terminado");
        }

        index = closingIndex + delimiter.length;
        continue;
      }
    }

    if (current === ";") {
      finishStatement();
      index += 1;
      continue;
    }

    if (current === "(" || current === ")") {
      tokens.push(current);
      index += 1;
      continue;
    }

    if (isSqlWordStart(current)) {
      let end = index + 1;

      while (end < source.length && isSqlWordPart(source[end])) {
        end += 1;
      }

      tokens.push(source.slice(index, end).toUpperCase());
      index = end;
      continue;
    }

    index += 1;
  }

  finishStatement();
  return statements;
}

function skipLineComment(sql, start) {
  let index = start;

  while (index < sql.length && sql[index] !== "\n" && sql[index] !== "\r") {
    index += 1;
  }

  return index;
}

function skipBlockComment(sql, start) {
  let depth = 1;
  let index = start;

  while (index < sql.length && depth > 0) {
    if (sql[index] === "/" && sql[index + 1] === "*") {
      depth += 1;
      index += 2;
    } else if (sql[index] === "*" && sql[index + 1] === "/") {
      depth -= 1;
      index += 2;
    } else {
      index += 1;
    }
  }

  return depth === 0 ? index : -1;
}

function skipQuotedValue(sql, start, quote, supportsBackslashEscapes) {
  let index = start;

  while (index < sql.length) {
    if (supportsBackslashEscapes && sql[index] === "\\") {
      index += 2;
      continue;
    }

    if (sql[index] === quote && sql[index + 1] === quote) {
      index += 2;
      continue;
    }

    if (sql[index] === quote) {
      return index + 1;
    }

    index += 1;
  }

  return -1;
}

function hasEscapeStringPrefix(sql, quoteIndex) {
  const previous = sql[quoteIndex - 1];
  const beforePrevious = sql[quoteIndex - 2];

  if (
    (previous === "E" || previous === "e") &&
    !isSqlWordPart(beforePrevious)
  ) {
    return true;
  }

  return hasUnicodeQuotedPrefix(sql, quoteIndex);
}

function hasUnicodeQuotedPrefix(sql, quoteIndex) {
  const prefixStart = quoteIndex - 2;

  if (prefixStart < 0) return false;

  return (
    (sql[prefixStart] === "U" || sql[prefixStart] === "u") &&
    sql[prefixStart + 1] === "&" &&
    !isSqlWordPart(sql[prefixStart - 1])
  );
}

function readDollarQuoteDelimiter(sql, start) {
  let index = start + 1;

  if (sql[index] === "$") {
    return "$$";
  }

  if (!isSqlWordStart(sql[index])) {
    return null;
  }

  index += 1;

  while (index < sql.length && isDollarTagPart(sql[index])) {
    index += 1;
  }

  if (sql[index] !== "$") {
    return null;
  }

  return sql.slice(start, index + 1);
}

function isSqlWordStart(value) {
  return typeof value === "string" && /^[A-Za-z_]$/.test(value);
}

function isSqlWordPart(value) {
  return typeof value === "string" && /^[A-Za-z0-9_$]$/.test(value);
}

function isDollarTagPart(value) {
  return typeof value === "string" && /^[A-Za-z0-9_]$/.test(value);
}

function classifyProhibitedStatement(tokens) {
  const words = tokens.filter(
    (token) => token !== "(" && token !== ")",
  );
  const first = words[0];
  const second = words[1];

  if (
    first === "BEGIN" ||
    first === "COMMIT" ||
    first === "END" ||
    first === "ROLLBACK" ||
    first === "ABORT" ||
    first === "SAVEPOINT" ||
    first === "RELEASE" ||
    (first === "START" && second === "TRANSACTION") ||
    (first === "PREPARE" && second === "TRANSACTION")
  ) {
    return {
      category: "controle transacional próprio",
      command: transactionCommandLabel(words),
    };
  }

  if (first === "CREATE" && second === "DATABASE") {
    return nonTransactionalViolation("CREATE DATABASE");
  }

  if (first === "DROP" && second === "DATABASE") {
    return nonTransactionalViolation("DROP DATABASE");
  }

  if (first === "VACUUM") {
    return nonTransactionalViolation("VACUUM");
  }

  if (first === "CALL") {
    return nonTransactionalViolation("CALL");
  }

  let indexWord = 1;

  if (first === "CREATE" && words[indexWord] === "UNIQUE") {
    indexWord += 1;
  }

  if (
    first === "CREATE" &&
    words[indexWord] === "INDEX" &&
    words[indexWord + 1] === "CONCURRENTLY"
  ) {
    return nonTransactionalViolation("CREATE INDEX CONCURRENTLY");
  }

  if (
    first === "DROP" &&
    second === "INDEX" &&
    words[2] === "CONCURRENTLY"
  ) {
    return nonTransactionalViolation("DROP INDEX CONCURRENTLY");
  }

  if (first === "REINDEX") {
    const targetIndex = findReindexTargetIndex(tokens);

    if (targetIndex !== -1 && tokens[targetIndex + 1] === "CONCURRENTLY") {
      return nonTransactionalViolation("REINDEX ... CONCURRENTLY");
    }
  }

  return null;
}

function findReindexTargetIndex(tokens) {
  let index = 1;

  if (tokens[index] === "(") {
    let depth = 1;
    index += 1;

    while (index < tokens.length && depth > 0) {
      if (tokens[index] === "(") {
        depth += 1;
      } else if (tokens[index] === ")") {
        depth -= 1;
      }

      index += 1;
    }

    if (depth !== 0) return -1;
  }

  return ["INDEX", "TABLE", "SCHEMA", "DATABASE", "SYSTEM"].includes(
    tokens[index],
  )
    ? index
    : -1;
}

function transactionCommandLabel(words) {
  const first = words[0];
  const second = words[1];

  if (["START", "PREPARE"].includes(first)) {
    return `${first} ${second}`;
  }

  if (first === "END" && ["TRANSACTION", "WORK"].includes(second)) {
    return `${first} ${second}`;
  }

  if (first === "RELEASE" && second === "SAVEPOINT") {
    return "RELEASE SAVEPOINT";
  }

  return first;
}

function nonTransactionalViolation(command) {
  return {
    category: "incompatível com transação gerenciada",
    command,
  };
}

async function applyFile(client, migration, options = {}, dependencies = {}) {
  const output = options.output ?? console;
  const sensitiveValues = options.sensitiveValues ?? [];
  const now = dependencies.now ?? Date.now;
  const inspected = await inspectMigrationFile(migration, {
    readFile: dependencies.readFile,
    sensitiveValues,
  });
  const { canonicalMigrationId, sha256, trimmedSql } = inspected;
  const shortHash = sha256.slice(0, 12);

  output.log(`\n▶️  Migração: ${canonicalMigrationId}`);
  output.log(`   sha256: ${shortHash}`);

  const alreadyApplied = await findAppliedMigration(client, {
    arquivo: canonicalMigrationId,
    sha256,
  });

  if (alreadyApplied) {
    output.log(
      `⏭️  Ignorada: já aplicada em ${formatDateTime(
        alreadyApplied.aplicada_em,
      )}.`,
    );
    return;
  }

  const startedAt = now();

  try {
    const elapsedMs = await applyRunnerManagedMigration(client, trimmedSql, {
      arquivo: canonicalMigrationId,
      sha256,
      startedAt,
      now,
      output,
      sensitiveValues,
    });

    output.log(`✅ OK (${elapsedMs}ms)`);
  } catch (err) {
    output.error(`❌ Erro em ${canonicalMigrationId}`);
    prettyPgError(err, { output, sensitiveValues });
    throw err;
  }
}

async function inspectMigrationFile(migration, dependencies = {}) {
  if (
    !migration ||
    typeof migration !== "object" ||
    typeof migration.fullPath !== "string" ||
    !isCanonicalMigrationId(migration.canonicalMigrationId)
  ) {
    fail("Descritor de migration oficial inválido.");
  }

  const readFile = dependencies.readFile ?? fsp.readFile;
  const sensitiveValues = dependencies.sensitiveValues ?? [];
  let sql;

  try {
    sql = await readFile(migration.fullPath, "utf8");
  } catch {
    fail(
      `Não foi possível ler a migration oficial ${migration.canonicalMigrationId}.`,
    );
  }

  const trimmedSql = sql.trim();

  if (!trimmedSql) {
    fail(`Arquivo SQL vazio: ${migration.canonicalMigrationId}.`);
  }

  validateMigrationSql(trimmedSql, {
    fileName: migration.canonicalMigrationId,
    sensitiveValues,
  });

  return {
    ...migration,
    sha256: crypto.createHash("sha256").update(sql).digest("hex"),
    sql,
    trimmedSql,
  };
}

async function applyRunnerManagedMigration(
  client,
  sql,
  { arquivo, sha256, startedAt, now, output, sensitiveValues },
) {
  let transactionStarted = false;

  try {
    await client.query("BEGIN");
    transactionStarted = true;

    await client.query(sql);

    const elapsedMs = now() - startedAt;

    await registerAppliedMigration(client, {
      arquivo,
      sha256,
      tempo_ms: elapsedMs,
    });

    await client.query("COMMIT");
    transactionStarted = false;

    return elapsedMs;
  } catch (err) {
    if (transactionStarted) {
      await rollbackBestEffort(client, { output, sensitiveValues });
    }

    throw err;
  }
}

async function rollbackBestEffort(client, { output, sensitiveValues }) {
  try {
    await client.query("ROLLBACK");
  } catch (rollbackError) {
    try {
      output.error("⚠️ Falha ao executar ROLLBACK.");
      prettyPgError(rollbackError, { output, sensitiveValues });
    } catch {
      // A observabilidade do rollback nunca pode mascarar o erro primário.
    }
  }
}

async function findAppliedMigration(client, { arquivo, sha256 }) {
  const { rows } = await client.query(
    `
      SELECT id, arquivo, sha256, aplicada_em, tempo_ms
      FROM public.${MIGRATION_TABLE}
      WHERE arquivo = $1
    `,
    [arquivo],
  );

  if (!Array.isArray(rows)) {
    failLegacyMigrationLedger("lookup retornou estrutura inválida");
  }

  if (rows.length > 1) {
    failLegacyMigrationLedger("mais de um registro para a mesma migration");
  }

  if (rows.length === 0) return null;

  const applied = rows[0];

  if (applied.sha256 !== sha256) {
    fail(
      `Migration ${arquivo} já registrada com conteúdo diferente. ` +
        "Restaure o arquivo original ou crie uma nova migration forward-only.",
    );
  }

  return applied;
}

async function registerAppliedMigration(client, { arquivo, sha256, tempo_ms }) {
  await client.query(
    `
      INSERT INTO public.${MIGRATION_TABLE} (
        arquivo,
        sha256,
        tempo_ms
      )
      VALUES ($1, $2, $3)
    `,
    [arquivo, sha256, tempo_ms],
  );
}

/* ─────────────────────────────────────────
   Saída / diagnóstico
───────────────────────────────────────── */

function collectSensitiveValues(connectionString, parsed) {
  const values = new Set();

  const add = (value) => {
    if (typeof value === "string" && value.length > 0) {
      values.add(value);
    }
  };

  const addEncodedAndDecoded = (value) => {
    add(value);

    try {
      add(decodeURIComponent(value));
    } catch {
      // O valor original ainda é protegido quando não for percent-decodificável.
    }
  };

  add(connectionString);
  addEncodedAndDecoded(parsed.username);
  addEncodedAndDecoded(parsed.password);
  addEncodedAndDecoded(parsed.search);
  addEncodedAndDecoded(parsed.search.slice(1));

  for (const value of parsed.searchParams.values()) {
    addEncodedAndDecoded(value);
  }

  return Array.from(values).sort((a, b) => b.length - a.length);
}

function sanitizeText(value, sensitiveValues = []) {
  let text = String(value ?? "");

  for (const sensitiveValue of sensitiveValues) {
    if (!sensitiveValue) continue;
    text = text.split(sensitiveValue).join("[REDACTED]");
  }

  return toSingleLine(text);
}

function toSingleLine(value) {
  return String(value ?? "").replace(/[\r\n\t]/g, " ");
}

function prettyPgError(err, options = {}) {
  const output = options.output ?? console;
  const sensitiveValues = options.sensitiveValues ?? [];
  const safe = (value) => sanitizeText(value, sensitiveValues);
  const status = err?.code ? `code: ${safe(err.code)}\n` : "";
  const message = err?.message
    ? `${safe(err.message)}\n`
    : `${safe(String(err))}\n`;
  const position = err?.position
    ? `position: ${safe(err.position)}\n`
    : "";
  const detail = err?.detail ? `detail: ${safe(err.detail)}\n` : "";
  const hint = err?.hint ? `hint: ${safe(err.hint)}\n` : "";
  const constraint = err?.constraint
    ? `constraint: ${safe(err.constraint)}\n`
    : "";
  const table = err?.table ? `table: ${safe(err.table)}\n` : "";
  const column = err?.column ? `column: ${safe(err.column)}\n` : "";

  output.error(
    message + status + table + column + constraint + position + detail + hint,
  );
}

function formatDateTime(value) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toISOString();
}

function banner(output = console) {
  output.log(
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
      "   🛠️  Runner Oficial de Migração SQL — Escola da Saúde       \n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  );
}

function fail(message) {
  const error = new Error(message);
  error.isOperational = true;
  throw error;
}

module.exports = {
  BACKEND_ROOT,
  MIGRATION_RUNNER_ADVISORY_LOCK_KEY_1,
  MIGRATION_RUNNER_ADVISORY_LOCK_KEY_2,
  MIGRATION_RUNNER_ADVISORY_LOCK_SQL,
  MIGRATION_RUNNER_ADVISORY_UNLOCK_SQL,
  OFFICIAL_MIGRATIONS_ROOT,
  TARGET_DIAGNOSTIC_SQL,
  acquireMigrationRunnerAdvisoryLock,
  applyFile,
  applyFilesSequentially,
  buildCanonicalMigrationId,
  ensureMigrationTable,
  findAppliedMigration,
  getRequiredConnectionString,
  inspectMigrationFile,
  isPathInsideRoot,
  main,
  parseAndValidateTarget,
  parseArgs,
  prettyPgError,
  registerAppliedMigration,
  resolveFiles,
  releaseMigrationRunnerAdvisoryLock,
  sanitizeText,
  validateMigrationSql,
  validateConnectedTarget,
  validateExpectedTarget,
};
