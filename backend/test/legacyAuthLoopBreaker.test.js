"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");

const express = require("express");

const {
  LEGACY_AUTH_LOOP_BREAKER_CONFIG,
  createLegacyAuthLoopBreakerMiddleware,
  decideWithPostgres,
  hashToken,
  isLegacyAuthLoopBreakerEnabled,
} = require("../src/services/legacyAuthLoopBreaker");

const MODERN_BUILD = "escoladasaude::2.0.4::1787259923000";

function createAtomicStore() {
  const rows = new Map();
  let nowMs = Date.parse("2026-08-31T12:00:00.000Z");
  let lock = Promise.resolve();
  let calls = 0;

  async function decide({ tokenHash }) {
    calls += 1;
    const run = lock.then(() => {
      const key = tokenHash.toString("hex");
      const config = LEGACY_AUTH_LOOP_BREAKER_CONFIG;
      let row = rows.get(key);
      let shouldTrigger = false;

      if (!row || row.expiresAt <= nowMs) {
        row = {
          requestCount: 1,
          windowStartedAt: nowMs,
          oneShotConsumed: false,
          expiresAt: nowMs + config.stateTtlMs,
        };
      } else if (row.oneShotConsumed) {
        // Cooldown consumido é fixo: tráfego posterior não renova o TTL.
      } else if (nowMs - row.windowStartedAt >= config.windowMs) {
        row.requestCount = 1;
        row.windowStartedAt = nowMs;
        row.expiresAt = nowMs + config.stateTtlMs;
      } else {
        row.requestCount += 1;
        row.expiresAt = nowMs + config.stateTtlMs;

        if (row.requestCount >= config.threshold) {
          row.oneShotConsumed = true;
          shouldTrigger = true;
        }
      }

      rows.set(key, row);

      return {
        shouldTrigger,
        requestCount: row.requestCount,
        windowStartedAt: new Date(row.windowStartedAt).toISOString(),
        expiresAt: new Date(row.expiresAt).toISOString(),
      };
    });

    lock = run.catch(() => {});
    return run;
  }

  return {
    decide,
    advance(ms) {
      nowMs += ms;
    },
    get calls() {
      return calls;
    },
    get size() {
      return rows.size;
    },
  };
}

async function startApp({ enabled = true, store, decide, logger } = {}) {
  const app = express();
  const decisionStore = store || createAtomicStore();
  const breaker = createLegacyAuthLoopBreakerMiddleware({
    getEnabled: () => enabled,
    decide: decide || decisionStore.decide,
    getToken: (req) =>
      String(req.headers.authorization || "").replace(/^Bearer\s+/i, ""),
    logger: logger || { info() {}, error() {} },
  });

  app.get(
    "/api/auth/me",
    (req, res, next) => {
      const authorization = String(req.headers.authorization || "");

      if (!/^Bearer token-[a-z0-9-]+$/i.test(authorization)) {
        return res.status(401).json({ autenticado: false });
      }

      req.user = { id: 701 };
      return next();
    },
    breaker,
    (_req, res) => res.status(200).json({ autenticado: true }),
  );

  // O middleware não é montado no outro alias legado.
  app.get("/api/dashboard-usuario", (_req, res) =>
    res.status(200).json({ ok: true }),
  );

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  return {
    store: decisionStore,
    url: `http://127.0.0.1:${server.address().port}`,
    stop: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function request(app, token = "token-a", build) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  if (build) headers["X-Client-Build"] = build;

  const response = await fetch(`${app.url}/api/auth/me`, { headers });
  return { response, body: await response.json() };
}

test("feature flag ausente/false preserva o contrato e não consulta estado", async () => {
  assert.equal(isLegacyAuthLoopBreakerEnabled({}), false);
  assert.equal(
    isLegacyAuthLoopBreakerEnabled({ LEGACY_AUTH_LOOP_BREAKER_ENABLED: "false" }),
    false,
  );
  assert.equal(
    isLegacyAuthLoopBreakerEnabled({ LEGACY_AUTH_LOOP_BREAKER_ENABLED: "true" }),
    true,
  );

  const store = createAtomicStore();
  const app = await startApp({ enabled: false, store });

  try {
    const results = await Promise.all(
      Array.from({ length: 25 }, () => request(app)),
    );
    assert.ok(results.every(({ response }) => response.status === 200));
    assert.equal(store.calls, 0);
  } finally {
    await app.stop();
  }
});

test("assinatura moderna válida fica totalmente isenta", async () => {
  const store = createAtomicStore();
  const app = await startApp({ store });

  try {
    const results = await Promise.all(
      Array.from({ length: 25 }, () => request(app, "token-a", MODERN_BUILD)),
    );
    assert.ok(results.every(({ response }) => response.status === 200));
    assert.equal(store.calls, 0);
  } finally {
    await app.stop();
  }
});

test("legacy abaixo de 20 chamadas em 2 segundos permanece em 200", async () => {
  const app = await startApp();

  try {
    const results = await Promise.all(
      Array.from({ length: 19 }, () => request(app)),
    );
    assert.ok(results.every(({ response }) => response.status === 200));
  } finally {
    await app.stop();
  }
});

test("a 20a chamada recebe um único 426 e chamadas posteriores voltam a 200", async () => {
  const app = await startApp();

  try {
    const results = [];
    for (let index = 0; index < 22; index += 1) {
      results.push(await request(app));
    }

    assert.equal(results.filter(({ response }) => response.status === 426).length, 1);
    assert.equal(results[19].response.status, 426);
    assert.equal(results[19].body.code, "APP_UPDATE_REQUIRED");
    assert.equal(results[20].response.status, 200);
    assert.equal(results[21].response.status, 200);
  } finally {
    await app.stop();
  }
});

test("tokens diferentes mantêm contadores e one-shot isolados", async () => {
  const app = await startApp();

  try {
    for (let index = 0; index < 19; index += 1) {
      assert.equal((await request(app, "token-a")).response.status, 200);
    }

    assert.equal((await request(app, "token-b")).response.status, 200);
    assert.equal((await request(app, "token-a")).response.status, 426);
    assert.equal((await request(app, "token-b")).response.status, 200);
  } finally {
    await app.stop();
  }
});

test("20 requests concorrentes elegem exatamente um vencedor do one-shot", async () => {
  const app = await startApp();

  try {
    const results = await Promise.all(
      Array.from({ length: 20 }, () => request(app)),
    );
    assert.equal(results.filter(({ response }) => response.status === 426).length, 1);
    assert.equal(results.filter(({ response }) => response.status === 200).length, 19);
  } finally {
    await app.stop();
  }
});

test("Bearer inválido conserva 401 e não cria estado", async () => {
  const store = createAtomicStore();
  const app = await startApp({ store });

  try {
    const result = await request(app, "invalido");
    assert.equal(result.response.status, 401);
    assert.equal(store.calls, 0);
    assert.equal(store.size, 0);
  } finally {
    await app.stop();
  }
});

test("requests espaçadas pela janela não acumulam threshold", async () => {
  const store = createAtomicStore();
  const app = await startApp({ store });

  try {
    for (let index = 0; index < 25; index += 1) {
      assert.equal((await request(app)).response.status, 200);
      store.advance(LEGACY_AUTH_LOOP_BREAKER_CONFIG.windowMs);
    }
  } finally {
    await app.stop();
  }
});

test("estado expirado não afeta uma sessão futura do mesmo token", async () => {
  const store = createAtomicStore();
  const app = await startApp({ store });

  try {
    for (let index = 0; index < 19; index += 1) {
      assert.equal((await request(app)).response.status, 200);
    }

    store.advance(LEGACY_AUTH_LOOP_BREAKER_CONFIG.stateTtlMs + 1);
    assert.equal((await request(app)).response.status, 200);
  } finally {
    await app.stop();
  }
});

test("426 perdido não renova cooldown e o mesmo token rearma outro episódio", async () => {
  const store = createAtomicStore();
  const app = await startApp({ store });

  try {
    const firstEpisode = [];
    for (let index = 0; index < 20; index += 1) {
      firstEpisode.push(await request(app));
    }
    assert.equal(
      firstEpisode.filter(({ response }) => response.status === 426).length,
      1,
    );

    // Simula o cliente ignorando/perdendo o 426 e continuando o auth loop.
    for (let second = 1; second <= 9; second += 1) {
      store.advance(1_000);
      assert.equal((await request(app)).response.status, 200);
    }

    store.advance(1_001);
    const secondEpisode = [await request(app)];
    for (let index = 1; index < 20; index += 1) {
      secondEpisode.push(await request(app));
    }

    assert.equal(
      secondEpisode.filter(({ response }) => response.status === 426).length,
      1,
    );
    assert.equal(secondEpisode[19].response.status, 426);
  } finally {
    await app.stop();
  }
});

test("concorrência após rearm elege novamente um único vencedor", async () => {
  const store = createAtomicStore();
  const app = await startApp({ store });

  try {
    const firstEpisode = await Promise.all(
      Array.from({ length: 20 }, () => request(app)),
    );
    assert.equal(
      firstEpisode.filter(({ response }) => response.status === 426).length,
      1,
    );

    store.advance(LEGACY_AUTH_LOOP_BREAKER_CONFIG.stateTtlMs + 1);

    const secondEpisode = await Promise.all(
      Array.from({ length: 20 }, () => request(app)),
    );
    assert.equal(
      secondEpisode.filter(({ response }) => response.status === 426).length,
      1,
    );
  } finally {
    await app.stop();
  }
});

test("falha do estado distribuído é fail-open sem expor o token no log", async () => {
  const errors = [];
  const app = await startApp({
    decide: async () => {
      const error = new Error("database unavailable");
      error.code = "DB_DOWN";
      throw error;
    },
    logger: { info() {}, error(...args) { errors.push(args); } },
  });

  try {
    const result = await request(app, "token-super-secreto");
    assert.equal(result.response.status, 200);
    assert.equal(errors.length, 1);
    assert.doesNotMatch(JSON.stringify(errors), /token-super-secreto/);
    assert.match(JSON.stringify(errors), /"hashPrefix":"[a-f0-9]{12}"/);
  } finally {
    await app.stop();
  }
});

test("somente SHA-256 completo chega ao repositório e a migration garante atomicidade", () => {
  const rawToken = "token-que-nao-pode-ser-persistido";
  const digest = hashToken(rawToken);
  assert.equal(Buffer.isBuffer(digest), true);
  assert.equal(digest.length, 32);
  assert.doesNotMatch(digest.toString("hex"), /token/);

  const migration = fs.readFileSync(
    path.resolve(
      __dirname,
      "../db/migrations/2026-08-31-legacy-auth-loop-breaker.sql",
    ),
    "utf8",
  );

  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /get_byte\(p_token_hash, 0\)/);
  assert.match(migration, /get_byte\(p_token_hash, 7\)/);
  assert.match(
    migration,
    /pg_advisory_xact_lock\(v_token_lock_key_1, v_token_lock_key_2\)/,
  );
  assert.match(migration, /pg_advisory_xact_lock\(1684231091::bigint\)/);
  assert.match(migration, /FOR UPDATE/);
  assert.match(migration, /FOR UPDATE SKIP LOCKED/);
  assert.match(migration, /octet_length\(token_hash\) = 32/);
  assert.match(migration, /expires_at <= v_now/);
  assert.match(migration, /v_total_rows >= p_max_rows/);
  assert.doesNotMatch(migration, /v_total_rows - p_max_rows \+ 1/);
  assert.doesNotMatch(migration, /authorization\s+bearer/i);

  const capacityBranch = migration.match(
    /IF v_total_rows >= p_max_rows THEN([\s\S]*?)END IF/,
  );
  assert.ok(capacityBranch);
  assert.doesNotMatch(capacityBranch[1], /DELETE FROM/);

  const consumedBranch = migration.match(
    /IF v_state\.one_shot_consumed THEN([\s\S]*?)ELSIF/,
  );
  assert.ok(consumedBranch);
  assert.doesNotMatch(consumedBranch[1], /expires_at\s*:=/);

  const authRoute = fs.readFileSync(
    path.resolve(__dirname, "../src/routes/authLegacyCompatRoute.js"),
    "utf8",
  );
  assert.ok(authRoute.indexOf("requireAuth,") < authRoute.indexOf("legacyAuthLoopBreaker,"));

  const dashboardRoute = fs.readFileSync(
    path.resolve(__dirname, "../src/routes/dashboardLegacyCompatRoute.js"),
    "utf8",
  );
  assert.doesNotMatch(dashboardRoute, /legacyAuthLoopBreaker/);
});

test("repositório envia apenas hash e constantes centralizadas à função SQL", async () => {
  const servicePath = path.resolve(
    __dirname,
    "../src/services/legacyAuthLoopBreaker.js",
  );
  const originalLoad = Module._load;
  let captured;

  Module._load = function loadWithFakeDb(requestName, parent, isMain) {
    if (requestName === "../db" && parent?.filename === servicePath) {
      return {
        async one(sql, params) {
          captured = { sql, params };
          return { shouldTrigger: false, requestCount: 1 };
        },
      };
    }

    return originalLoad.call(this, requestName, parent, isMain);
  };

  try {
    const tokenHash = hashToken("token-repository-test");
    await decideWithPostgres({ tokenHash });

    assert.match(captured.sql, /legacy_auth_loop_breaker_decide/);
    assert.equal(captured.params[0], tokenHash);
    assert.deepEqual(captured.params.slice(1), [20, 2_000, 10_000, 4_096]);
  } finally {
    Module._load = originalLoad;
  }
});
