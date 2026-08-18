// 📁 scripts/run-migration.js — v2.0
/* eslint-disable no-console */
"use strict";

/**
 * Plataforma Escola da Saúde
 * Runner oficial de migrações SQL PostgreSQL
 *
 * Uso:
 *   node scripts/run-migration.js --file db/migration/2026-05-11-ajuste.sql
 *   node scripts/run-migration.js --dir db/migration --pattern "2026-*.sql"
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
 *   --force          Executa mesmo se a migração já estiver registrada.
 *   --expect-host    Hostname PostgreSQL esperado para execução real.
 *   --expect-database Database PostgreSQL esperada para execução real.
 *
 * Contrato operacional:
 *   - Sem fallback legado.
 *   - Sem alias de caminho antigo.
 *   - Sem execução implícita.
 *   - Toda migração aplicada é registrada em public.sistema_migracao.
 */

const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { Pool } = require("pg");

const DEFAULT_TIMEOUT_MS = 60000;
const MIGRATION_TABLE = "sistema_migracao";
const DEFAULT_POSTGRES_PORT = "5432";
const FORBIDDEN_TARGET_QUERY_PARAMS = new Set(["host", "port", "options"]);
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
        "Nenhum arquivo .sql encontrado. Use --file caminho.sql ou --dir db/migration.",
      );
    }

    banner(output);

    output.log("🗂️  Arquivos encontrados:", files.length);
    files.forEach((file, index) => {
      output.log(`   ${String(index + 1).padStart(2, "0")} • ${file}`);
    });

    if (args.dryRun) {
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
    output.log("⚙️  Force:", args.force ? "sim" : "não");

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

      await ensureMigrationTableFn(client);

      for (const fullPath of files) {
        await applyFileFn(client, fullPath, {
          force: args.force,
          log,
          output,
          sensitiveValues,
        });
      }

      output.log("\n✅ Todas as migrações concluídas sem erros.");

      const secs = ((Date.now() - startedAt) / 1000).toFixed(2);
      output.log(`⏱️  Tempo total: ${secs}s`);
    } finally {
      client.release();
      await pool.end().catch(() => {});
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
    force: false,
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
      out.force = true;
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

async function resolveFiles(args, log) {
  const files = new Set();

  for (const file of args.file || []) {
    if (!file) continue;

    const fullPath = path.resolve(process.cwd(), file);

    if (!(await exists(fullPath))) {
      fail(`Arquivo não encontrado: ${fullPath}`);
    }

    if (!(await isFile(fullPath))) {
      fail(`O caminho informado não é arquivo: ${fullPath}`);
    }

    if (!fullPath.toLowerCase().endsWith(".sql")) {
      fail(`O arquivo precisa ter extensão .sql: ${fullPath}`);
    }

    files.add(fullPath);
  }

  if (args.dir) {
    const dir = path.resolve(process.cwd(), args.dir);

    if (!(await exists(dir))) {
      fail(`Diretório não encontrado: ${dir}`);
    }

    if (!(await isDirectory(dir))) {
      fail(`O caminho informado não é diretório: ${dir}`);
    }

    const list = await fsp.readdir(dir);
    const regex = globToRegex(args.pattern || "*");

    const matched = list
      .filter((name) => regex.test(name))
      .filter((name) => name.toLowerCase().endsWith(".sql"))
      .sort((a, b) => a.localeCompare(b, "pt-BR"))
      .map((name) => path.join(dir, name));

    log.debug("arquivos encontrados no diretório:", matched);

    matched.forEach((file) => files.add(file));
  }

  return Array.from(files);
}

function globToRegex(glob) {
  const safe = String(glob || "*")
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");

  return new RegExp(`^${safe}$`, "i");
}

async function exists(filePath) {
  try {
    await fsp.access(filePath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function isFile(filePath) {
  const stat = await fsp.stat(filePath);
  return stat.isFile();
}

async function isDirectory(filePath) {
  const stat = await fsp.stat(filePath);
  return stat.isDirectory();
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
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.${MIGRATION_TABLE} (
      id BIGSERIAL PRIMARY KEY,
      arquivo TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      aplicada_em TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
      tempo_ms INTEGER NOT NULL DEFAULT 0,
      CONSTRAINT ${MIGRATION_TABLE}_arquivo_sha256_key UNIQUE (arquivo, sha256)
    );
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_${MIGRATION_TABLE}_arquivo
      ON public.${MIGRATION_TABLE} (arquivo);
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_${MIGRATION_TABLE}_aplicada_em
      ON public.${MIGRATION_TABLE} (aplicada_em DESC);
  `);
}

/* ─────────────────────────────────────────
   Aplicação
───────────────────────────────────────── */

async function applyFile(client, fullPath, options = {}) {
  const force = Boolean(options.force);
  const output = options.output ?? console;
  const sensitiveValues = options.sensitiveValues ?? [];
  const name = path.basename(fullPath);

  const sql = await fsp.readFile(fullPath, "utf8");
  const trimmed = sql.trim();

  if (!trimmed) {
    fail(`Arquivo SQL vazio: ${fullPath}`);
  }

  const sha256 = crypto.createHash("sha256").update(sql).digest("hex");
  const shortHash = sha256.slice(0, 12);

  output.log(`\n▶️  Migração: ${name}`);
  output.log(`   sha256: ${shortHash}`);

  const alreadyApplied = await findAppliedMigration(client, {
    arquivo: name,
    sha256,
  });

  if (alreadyApplied && !force) {
    output.log(
      `⏭️  Ignorada: já aplicada em ${formatDateTime(
        alreadyApplied.aplicada_em,
      )}. Use --force para executar novamente.`,
    );
    return;
  }

  const hasTransaction = sqlHasOwnTransaction(trimmed);
  const sqlToRun = hasTransaction ? trimmed : `BEGIN;\n${trimmed}\nCOMMIT;`;

  const startedAt = Date.now();

  try {
    await client.query(sqlToRun);

    const elapsedMs = Date.now() - startedAt;

    await registerAppliedMigration(client, {
      arquivo: name,
      sha256,
      tempo_ms: elapsedMs,
    });

    output.log(`✅ OK (${elapsedMs}ms)`);
  } catch (err) {
    output.error(`❌ Erro em ${name}`);
    prettyPgError(err, { output, sensitiveValues });
    throw err;
  }
}

function sqlHasOwnTransaction(sql) {
  const hasBegin = /^\s*BEGIN\b/i.test(sql);
  const hasCommit = /\bCOMMIT\s*;?\s*$/i.test(sql);

  return hasBegin && hasCommit;
}

async function findAppliedMigration(client, { arquivo, sha256 }) {
  const { rows } = await client.query(
    `
      SELECT id, arquivo, sha256, aplicada_em, tempo_ms
      FROM public.${MIGRATION_TABLE}
      WHERE arquivo = $1
        AND sha256 = $2
      ORDER BY aplicada_em DESC
      LIMIT 1
    `,
    [arquivo, sha256],
  );

  return rows?.[0] || null;
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
      ON CONFLICT (arquivo, sha256)
      DO UPDATE SET
        aplicada_em = now(),
        tempo_ms = EXCLUDED.tempo_ms
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
  TARGET_DIAGNOSTIC_SQL,
  getRequiredConnectionString,
  main,
  parseAndValidateTarget,
  parseArgs,
  prettyPgError,
  sanitizeText,
  validateConnectedTarget,
  validateExpectedTarget,
};
