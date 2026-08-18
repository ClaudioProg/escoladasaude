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

async function applyFilesSequentially(
  client,
  files,
  options = {},
  applyFileFn = applyFile,
) {
  for (const fullPath of files) {
    await applyFileFn(client, fullPath, { ...options });
  }
}

function validateMigrationSql(sql, options = {}) {
  const fileName = sanitizeText(
    path.basename(String(options.fileName ?? "migration.sql")),
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

async function applyFile(client, fullPath, options = {}, dependencies = {}) {
  const output = options.output ?? console;
  const sensitiveValues = options.sensitiveValues ?? [];
  const readFile = dependencies.readFile ?? fsp.readFile;
  const now = dependencies.now ?? Date.now;
  const name = path.basename(fullPath);

  const sql = await readFile(fullPath, "utf8");
  const trimmed = sql.trim();

  if (!trimmed) {
    fail(`Arquivo SQL vazio: ${fullPath}`);
  }

  validateMigrationSql(trimmed, { fileName: name, sensitiveValues });

  const sha256 = crypto.createHash("sha256").update(sql).digest("hex");
  const shortHash = sha256.slice(0, 12);

  output.log(`\n▶️  Migração: ${name}`);
  output.log(`   sha256: ${shortHash}`);

  const alreadyApplied = await findAppliedMigration(client, {
    arquivo: name,
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
    const elapsedMs = await applyRunnerManagedMigration(client, trimmed, {
      arquivo: name,
      sha256,
      startedAt,
      now,
      output,
      sensitiveValues,
    });

    output.log(`✅ OK (${elapsedMs}ms)`);
  } catch (err) {
    output.error(`❌ Erro em ${name}`);
    prettyPgError(err, { output, sensitiveValues });
    throw err;
  }
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
  applyFile,
  applyFilesSequentially,
  ensureMigrationTable,
  findAppliedMigration,
  getRequiredConnectionString,
  main,
  parseAndValidateTarget,
  parseArgs,
  prettyPgError,
  registerAppliedMigration,
  sanitizeText,
  validateMigrationSql,
  validateConnectedTarget,
  validateExpectedTarget,
};
