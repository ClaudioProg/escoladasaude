"use strict";

const { createAuthOutboxWorker } = require("../services/authOutboxWorker");
const POLL_MS = 30000;
// Nenhum consumidor de token opaco V3 esta integrado no HEAD desta etapa.
// Este gate nao pode ser substituido por AUTH_*_READY ou por uma URL legada.
const V3_CONSUMER = null;
function cryptoConfigFromEnv(env) {
  const entries = JSON.parse(env.AUTH_OUTBOX_CRYPTO_KEYS_JSON || "null");
  if (!Array.isArray(entries)) throw new Error("AUTH_OUTBOX_CONFIG_INVALID");
  return { activeKeyId: env.AUTH_OUTBOX_CRYPTO_ACTIVE_KEY_ID, keys: entries.map(entry => {
    if (!entry || typeof entry.secret !== "string" || !/^[A-Za-z0-9+/]{43}=$/.test(entry.secret)) throw new Error("AUTH_OUTBOX_CONFIG_INVALID");
    return { keyId: entry.keyId, secret: Buffer.from(entry.secret, "base64") };
  }) };
}
function createAuthOutboxJob({ db, env = process.env, consumer = V3_CONSUMER, createWorker, log = code => console.info("[auth-outbox]", { code }),
  timers = { setInterval, clearInterval } } = {}) {
  let timer = null, worker = null, running = null, stopping = null;
  const factory = createWorker || (() => createAuthOutboxWorker({ db, enabled: true, consumer,
    cryptoConfig: cryptoConfigFromEnv(env), transport: require("../services/mailer").createAuthEmailSender() }));
  function tick() {
    if (!worker || running || stopping) return running;
    const current = worker;
    running = Promise.resolve().then(() => current.runOnce()).catch(() => {
      log("AUTH_OUTBOX_WORKER_FAILURE");
    }).finally(() => { running = null; });
    return running;
  }
  function start() {
    if (timer !== null || stopping) return { status: stopping ? "stopping" : "running" };
    if (env.AUTH_OUTBOX_WORKER_ENABLED !== "true") return { status: "disabled" };
    if (env.AUTH_OUTBOX_WORKER_DRY_RUN === "true") return { status: "dry-run" };
    if (consumer?.ready !== true || typeof consumer.buildMail !== "function") {
      log("AUTH_OUTBOX_V3_CONSUMER_UNAVAILABLE"); return { status: "blocked-consumer" };
    }
    try {
      worker = factory();
      if (worker.readiness() !== "ready") { worker = null; log("AUTH_OUTBOX_CONFIG_INVALID"); return { status: "blocked-config" }; }
    } catch { worker = null; log("AUTH_OUTBOX_CONFIG_INVALID"); return { status: "blocked-config" }; }
    timer = timers.setInterval(tick, POLL_MS);
    timer.unref?.(); tick();
    return { status: "running" };
  }
  function stop() {
    if (stopping) return stopping;
    if (timer !== null) { timers.clearInterval(timer); timer = null; }
    const current = worker; worker = null;
    stopping = Promise.resolve().then(() => current?.stop()).catch(() => log("AUTH_OUTBOX_STOP_FAILURE"))
      .then(() => running).finally(() => { stopping = null; });
    return stopping;
  }
  return Object.freeze({ start, stop });
}
module.exports = { createAuthOutboxJob, cryptoConfigFromEnv, POLL_MS };
