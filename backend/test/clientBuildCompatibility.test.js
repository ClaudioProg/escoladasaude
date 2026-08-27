"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const express = require("express");

const {
  createClientBuildCompatibilityMiddleware,
  isBuildProvablyOlder,
} = require("../src/middlewares/clientBuildCompatibility");

const MINIMUM = "escoladasaude::2.0.4::1787259921688";
const CURRENT = "escoladasaude::2.0.4::1787259923000";

async function startApp(policy) {
  const app = express();
  app.use(
    "/api",
    createClientBuildCompatibilityMiddleware({ getPolicy: () => policy }),
  );
  app.get("/api/rota-oficial", (_req, res) => res.json({ ok: true }));

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  return {
    url: `http://127.0.0.1:${server.address().port}`,
    stop: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function request(url, build) {
  const response = await fetch(`${url}/api/rota-oficial`, {
    headers: build ? { "X-Client-Build": build } : {},
  });

  return { response, body: await response.json() };
}

test("builds sem header continuam compatíveis na fase de transição", async () => {
  const app = await startApp({ minimumBuild: MINIMUM, currentBuild: CURRENT });

  try {
    const result = await request(app.url);
    assert.equal(result.response.status, 200);
    assert.deepEqual(result.body, { ok: true });
  } finally {
    await app.stop();
  }
});

test("build moderno abaixo do mínimo recebe APP_UPDATE_REQUIRED sem cache", async () => {
  const app = await startApp({ minimumBuild: MINIMUM, currentBuild: CURRENT });

  try {
    const result = await request(app.url, "escoladasaude::2.0.3::1787250000000");
    assert.equal(result.response.status, 426);
    assert.equal(result.body.code, "APP_UPDATE_REQUIRED");
    assert.equal(result.body.data, null);
    assert.equal(result.response.headers.get("cache-control"), "no-store");
    assert.equal(result.response.headers.get("x-client-build-minimum"), MINIMUM);
    assert.equal(result.response.headers.get("x-client-build-current"), CURRENT);
    assert.match(result.response.headers.get("vary") || "", /X-Client-Build/);
  } finally {
    await app.stop();
  }
});

test("mínimo, atual e assinatura não classificável não sofrem falso bloqueio", async () => {
  const app = await startApp({ minimumBuild: MINIMUM, currentBuild: CURRENT });

  try {
    for (const build of [MINIMUM, CURRENT, "escoladasaude::2.0.4::deploy-a"]) {
      const result = await request(app.url, build);
      assert.equal(result.response.status, 200, build);
    }
  } finally {
    await app.stop();
  }
});

test("comparação só bloqueia quando a antiguidade é comprovável", () => {
  assert.equal(
    isBuildProvablyOlder("escoladasaude::2.0.4::1787250000000", MINIMUM),
    true,
  );
  assert.equal(
    isBuildProvablyOlder("outra-app::1.0.0::1", MINIMUM),
    false,
  );
  assert.equal(
    isBuildProvablyOlder("escoladasaude::2.0.4::deploy-a", MINIMUM),
    false,
  );
});
