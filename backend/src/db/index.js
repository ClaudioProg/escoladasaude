// 📁 src/db/index.js — v2.0
/* eslint-disable no-console */
"use strict";

/**
 * Plataforma Escola da Saúde
 * Camada oficial de acesso ao PostgreSQL
 *
 * Contrato oficial:
 *   const db = require("../db");
 *
 * Uso:
 *   await db.query(sql, params)
 *   await db.many(sql, params)
 *   await db.one(sql, params)
 *   await db.oneOrNone(sql, params)
 *   await db.none(sql, params)
 *   await db.result(sql, params)
 *   await db.tx(async (tx) => { ... })
 *   const client = await db.getClient()
 *
 * Não usar:
 *   db.any
 *   db.manyOrNone
 *   db.connect
 *   module.exports.db
 *   exports duplicados
 *   adapters pg-promise-like
 */

const { Pool } = require("pg");

/* ──────────────────────────────────────────────────────────────
   Dotenv apenas fora de produção
────────────────────────────────────────────────────────────── */

if (process.env.NODE_ENV !== "production") {
  // eslint-disable-next-line global-require
  require("dotenv").config();
}

/* ──────────────────────────────────────────────────────────────
   Ambiente / Configuração
────────────────────────────────────────────────────────────── */

const IS_PROD = process.env.NODE_ENV === "production";
const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();

if (!DATABASE_URL) {
  throw new Error("[db] DATABASE_URL não está definida no ambiente.");
}

const DEFAULT_POOL_MAX = 10;
const DEFAULT_IDLE_TIMEOUT_MS = 30000;
const DEFAULT_CONNECTION_TIMEOUT_MS = 10000;
const DEFAULT_SLOW_SQL_MS = 700;

function parseBoolEnv(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();

  if (["true", "1", "yes", "y", "sim", "s"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no", "n", "nao", "não"].includes(normalized)) {
    return false;
  }

  return fallback;
}

function parsePositiveIntEnv(value, fallback) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

const DATABASE_SSL =
  process.env.DATABASE_SSL !== undefined
    ? parseBoolEnv(process.env.DATABASE_SSL, false)
    : inferSslFromEnvironment(DATABASE_URL, IS_PROD);

const SSL_OPTION = DATABASE_SSL ? { rejectUnauthorized: false } : false;

const POOL_MAX = parsePositiveIntEnv(process.env.DB_POOL_MAX, DEFAULT_POOL_MAX);
const IDLE_TIMEOUT_MS = parsePositiveIntEnv(
  process.env.DB_IDLE_TIMEOUT_MS,
  DEFAULT_IDLE_TIMEOUT_MS,
);
const CONNECTION_TIMEOUT_MS = parsePositiveIntEnv(
  process.env.DB_CONNECTION_TIMEOUT_MS,
  DEFAULT_CONNECTION_TIMEOUT_MS,
);

const APPLICATION_NAME = String(
  process.env.DB_APPLICATION_NAME || "escola-saude-api",
).trim();

function inferSslFromEnvironment(connectionString, isProd) {
  const urlRequiresSSL =
    /sslmode=require/i.test(connectionString) ||
    /render\.com/i.test(connectionString) ||
    /neon\.tech/i.test(connectionString);

  return isProd || urlRequiresSSL;
}

/* ──────────────────────────────────────────────────────────────
   Logs / Redação
────────────────────────────────────────────────────────────── */

function shouldLogSql() {
  return parseBoolEnv(process.env.LOG_SQL, false);
}

function shouldLogSlowSql() {
  return parseBoolEnv(process.env.LOG_SLOW_SQL, true);
}

function getSlowSqlThresholdMs() {
  return parsePositiveIntEnv(process.env.LOG_SLOW_SQL_MS, DEFAULT_SLOW_SQL_MS);
}

function shrinkWhitespace(sql) {
  return String(sql || "")
    .replace(/\s+/g, " ")
    .trim();
}

function sensitiveSql(sql) {
  // Conservador: consultas de identidade/auth nunca expõem parâmetros.
  return /\b(?:auth_[a-z0-9_]+|usuarios|auditoria_eventos|senha|password|cpf|email|email_version|celular|data_nascimento|token|token_hash|authorization|cookie|csrf|mfa|outbox)\b/i.test(sql);
}

function sqlForLog(sql) {
  // Não imprimir literais, comentários ou SQL dollar-quoted que possam conter input.
  if (/["']|--|\/\*|\$(?:[a-z_][a-z0-9_]*)?\$|(?<!\d)\d{10,13}(?!\d)/i.test(sql)) return "[REDACTED_SQL_TEXT]";
  return shrinkWhitespace(sql);
}

function postgresCodeForLog(code) {
  return typeof code === "string" && /^[0-9A-Z]{5}$/.test(code) ? code : null;
}

function identifierForLog(value) {
  return typeof value === "string" && /^[a-z_][a-z0-9_]{0,62}$/.test(value)
    ? redactValue(value) : null;
}

function redactValue(value, depth = 0) {
  if (value === null || value === undefined) {
    return value;
  }

  if (depth > 3) {
    return "[REDACTED_DEEP_OBJECT]";
  }

  if (Buffer.isBuffer(value)) {
    return `[BUFFER ${value.length} bytes]`;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    const text = value.trim();

    if (!text) {
      return text;
    }

    if (/^data:.*;base64,/i.test(text)) {
      return "[REDACTED_DATA_URL]";
    }

    if (text.length > 120) return "[REDACTED_LONG_STRING]";
    if (/\$2[aby]\$|\$argon2(?:id|i|d)\$/i.test(text)) return "[REDACTED_HASH]";
    if (/[^\s@]+@[^\s@]+/.test(text)) return "[REDACTED_EMAIL]";
    // Underscore/letras não delimitam PII; apenas dígitos adjacentes limitam o padrão.
    if (/(?<!\d)(?:\d{3}\.\d{3}\.\d{3}-\d{2}|\d{10,13})(?!\d)/.test(text)
      || /(?<!\d)(?:\+?55[ .-]?)?\(?\d{2}\)?[ .-]?\d{4,5}[ .-]\d{4}(?!\d)/.test(text)) return "[REDACTED_PERSONAL_NUMBER]";
    // Datas com underscore exigem dia/mês plausíveis, sem validar o calendário completo.
    if (/(?<!\d)(?:\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}|\d{2}-\d{2}-\d{4}|(?:0[1-9]|[12]\d|3[01])_(?:0[1-9]|1[0-2])_\d{4})(?!\d)/.test(text)) return "[REDACTED_DATE]";

    if (/eyJ[A-Za-z0-9_\-]+=*\.[A-Za-z0-9_-]+=*\.[A-Za-z0-9_-]+/.test(text)) {
      return "[REDACTED_TOKEN]";
    }

    if (/bearer\s+[a-z0-9._\-]+/i.test(text)) {
      return "[REDACTED_BEARER_TOKEN]";
    }

    if (/[A-Za-z0-9_-]{32,}/.test(text)) return "[REDACTED_OPAQUE_TOKEN]";

    return text;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, depth + 1));
  }

  if (typeof value === "object") {
    const safe = {};

    for (const [key, item] of Object.entries(value)) {
      const normalizedKey = String(key).toLowerCase();
      const safeKey = redactValue(key, depth + 1);

      if (
        normalizedKey.includes("senha") ||
        normalizedKey.includes("password") ||
        normalizedKey.includes("token") ||
        normalizedKey.includes("authorization") ||
        normalizedKey.includes("cookie") ||
        normalizedKey.includes("secret") ||
        normalizedKey.includes("segredo") ||
        normalizedKey.includes("csrf") ||
        normalizedKey.includes("mfa") ||
        normalizedKey.includes("outbox") ||
        normalizedKey.includes("cpf") ||
        normalizedKey.includes("email") ||
        normalizedKey.includes("celular") ||
        normalizedKey.includes("phone") ||
        normalizedKey.includes("nascimento") ||
        normalizedKey.includes("birth") ||
        normalizedKey.includes("assinatura") ||
        normalizedKey.includes("base64")
      ) {
        safe[safeKey] = "[REDACTED]";
      } else {
        safe[safeKey] = redactValue(item, depth + 1);
      }
    }

    return safe;
  }

  if (typeof value === "number" && Number.isInteger(value) && /^\d{10,13}$/.test(String(value))) {
    return "[REDACTED_PERSONAL_NUMBER]";
  }
  return value;
}

function redactParams(params, sql) {
  if (sensitiveSql(sql)) return "[REDACTED_SENSITIVE_PARAMS]";
  if (!Array.isArray(params)) {
    return params;
  }

  try {
    return params.map((item) => redactValue(item));
  } catch {
    return "[REDACTED_PARAMS]";
  }
}

function makeDbError(message, extra = {}) {
  const error = new Error(message);
  Object.assign(error, extra);
  return error;
}

/* ──────────────────────────────────────────────────────────────
   Pool oficial
────────────────────────────────────────────────────────────── */

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: SSL_OPTION,
  max: POOL_MAX,
  idleTimeoutMillis: IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
  application_name: APPLICATION_NAME,
});

pool.on("error", (err) => {
  console.error("🔴 [db] Erro inesperado no pool:", {
    code: postgresCodeForLog(err?.code),
  });
});

/* ──────────────────────────────────────────────────────────────
   Executor oficial
────────────────────────────────────────────────────────────── */

function assertSqlText(text) {
  const sql = String(text || "").trim();

  if (!sql) {
    throw makeDbError("SQL vazio informado ao executor do banco.", {
      code: "DB_EMPTY_SQL",
    });
  }

  return sql;
}

function normalizeParams(params) {
  if (params === undefined || params === null) {
    return [];
  }

  if (!Array.isArray(params)) {
    throw makeDbError("Parâmetros SQL devem ser um array.", {
      code: "DB_INVALID_PARAMS",
    });
  }

  return params;
}

async function executeQuery(clientOrPool, text, params = []) {
  const sql = assertSqlText(text);
  const normalizedParams = normalizeParams(params);
  const startedAt = Date.now();

  const runner =
    clientOrPool?.query && typeof clientOrPool.query === "function"
      ? clientOrPool.query.bind(clientOrPool)
      : pool.query.bind(pool);

  try {
    if (shouldLogSql()) {
      console.log("🔎 [db][sql]", {
        text: sqlForLog(sql),
        params: redactParams(normalizedParams, sql),
      });
    }

    const result = await runner(sql, normalizedParams);
    const elapsed = Date.now() - startedAt;

    if (shouldLogSlowSql() && elapsed >= getSlowSqlThresholdMs()) {
      console.warn(`🐢 [db][slow ${elapsed}ms]`, {
        text: sqlForLog(sql),
        params: redactParams(normalizedParams, sql),
        rowCount: result?.rowCount ?? null,
      });
    }

    return result;
  } catch (err) {
    const elapsed = Date.now() - startedAt;

    console.error("🔴 [db][query-error]", {
      ms: elapsed,
      code: postgresCodeForLog(err?.code),
      constraint: identifierForLog(err?.constraint),
      table: identifierForLog(err?.table),
      column: identifierForLog(err?.column),
      text: sqlForLog(sql),
      params: redactParams(normalizedParams, sql),
    });

    throw err;
  }
}

/* ──────────────────────────────────────────────────────────────
   Facade oficial
────────────────────────────────────────────────────────────── */

function createExecutor(clientOrPool) {
  const query = (text, params = []) => executeQuery(clientOrPool, text, params);

  async function many(text, params = []) {
    const { rows } = await query(text, params);
    return rows || [];
  }

  async function one(text, params = []) {
    const { rows } = await query(text, params);
    const count = rows?.length || 0;

    if (count !== 1) {
      throw makeDbError(`Expected one row, got ${count}.`, {
        code: "DB_EXPECTED_ONE",
        rowCount: count,
      });
    }

    return rows[0];
  }

  async function oneOrNone(text, params = []) {
    const { rows } = await query(text, params);
    const count = rows?.length || 0;

    if (count === 0) {
      return null;
    }

    if (count > 1) {
      throw makeDbError(`Expected at most one row, got ${count}.`, {
        code: "DB_EXPECTED_ONE_OR_NONE",
        rowCount: count,
      });
    }

    return rows[0];
  }

  async function none(text, params = []) {
    await query(text, params);
    return null;
  }

  function result(text, params = []) {
    return query(text, params);
  }

  return {
    query,
    many,
    one,
    oneOrNone,
    none,
    result,
  };
}

/* ──────────────────────────────────────────────────────────────
   Cliente e transação
────────────────────────────────────────────────────────────── */

async function getClient() {
  return pool.connect();
}

async function tx(callback) {
  if (typeof callback !== "function") {
    throw makeDbError("db.tx requer um callback.", {
      code: "DB_TX_CALLBACK_REQUIRED",
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const transaction = {
      ...createExecutor(client),
      raw: client,
      client,
    };

    const output = await callback(transaction);

    await client.query("COMMIT");

    return output;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackErr) {
      console.error("🔴 [db] Falha no ROLLBACK:", {
        code: postgresCodeForLog(rollbackErr?.code),
      });
    }

    throw err;
  } finally {
    client.release();
  }
}

async function shutdown() {
  return pool.end();
}

/* ──────────────────────────────────────────────────────────────
   Diagnóstico administrativo
────────────────────────────────────────────────────────────── */

function getPoolInfo() {
  return {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
    max: POOL_MAX,
    idleTimeoutMillis: IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    ssl: Boolean(SSL_OPTION),
    applicationName: APPLICATION_NAME,
  };
}

/* ──────────────────────────────────────────────────────────────
   Export único oficial
────────────────────────────────────────────────────────────── */

const db = {
  ...createExecutor(pool),

  pool,
  getClient,
  tx,
  shutdown,
  getPoolInfo,
};

module.exports = db;
