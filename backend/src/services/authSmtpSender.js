"use strict";

const { fork } = require("node:child_process");
const path = require("node:path");
const MAX_DURATION_MS = 120000;
const TERMINATE_AT_MS = 115000; // Margem de 5s para observar encerramento efetivo.
const KINDS = ["accepted", "temporary", "permanent", "indeterminate"];
function controlled(value) {
  const kind = KINDS.includes(value?.kind) ? value.kind : "indeterminate";
  const smtpStatus = ["temporary", "permanent"].includes(kind) && Number.isInteger(value?.smtpStatus) &&
    value.smtpStatus >= 400 && value.smtpStatus <= 599 ? value.smtpStatus : null;
  return Object.freeze({ kind, smtpStatus });
}
function validConfig(c) {
  return c && typeof c.host === "string" && c.host && Number.isInteger(c.port) && c.port > 0 && c.port <= 65535 &&
    typeof c.secure === "boolean" && c.smtpUser && c.smtpPass && typeof c.fromAddr === "string" &&
    /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(c.fromAddr);
}
function createAuthSmtpSender({ getConfig, isEnabled }) {
  const active = new Set();
  let closed = false;
  function ready() { return !closed && isEnabled() === true && validConfig(getConfig()); }
  async function send(payload) {
    if (!ready()) return { kind: "dry-run" }; // Sem fork, sockets ou envio.
    const config = { ...getConfig() };
    if (!validConfig(config) || !payload || typeof payload.to !== "string" ||
        !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(payload.to) ||
        typeof payload.subject !== "string" || !payload.subject || /[\r\n]/.test(payload.subject) ||
        typeof payload.text !== "string" || !payload.text || Object.keys(payload).some(k => !["to", "subject", "text"].includes(k))) {
      return { kind: "indeterminate" };
    }
    return new Promise(resolve => {
      let child, timer, outcome = controlled(null), finished = false, cancelled = false;
      // Nao compartilhar credenciais de banco/JWT/crypto nem NODE_OPTIONS com o subprocesso SMTP.
      const childEnv = Object.fromEntries(["PATH", "SystemRoot", "WINDIR", "TEMP", "TMP"].filter(k => process.env[k]).map(k => [k, process.env[k]]));
      const finish = () => {
        if (finished) return;
        finished = true; clearTimeout(timer); active.delete(operation); resolve(outcome);
      };
      const operation = { done: null, cancel: () => {
        // SIGKILL encerra o processo e seus sockets; nao e apenas Promise.race.
        if (!finished && child) {
          // Invalidar antes do kill: IPC pendente nao pode confirmar envio cancelado.
          cancelled = true; outcome = controlled(null);
          try {
            if (child.kill("SIGKILL") !== true) { closed = true; outcome = controlled(null); }
          } catch { closed = true; outcome = controlled(null); }
          // Falha de terminacao bloqueia novos envios; aguardar exit, sem ack presumido.
        }
      } };
      operation.done = new Promise(done => { operation.exited = done; });
      try {
        child = fork(path.join(__dirname, "authSmtpProcess.js"), [], {
          execArgv: [], env: childEnv, windowsHide: true, stdio: ["ignore", "ignore", "ignore", "ipc"],
        });
        active.add(operation);
        child.on("message", value => { if (!finished && !cancelled) outcome = controlled(value); });
        child.once("error", () => { outcome = controlled(null); operation.cancel();
          // Erro de spawn nao possui processo a encerrar.
          if (!child.pid) { finish(); operation.exited(); }
        });
        child.once("exit", (code, signal) => {
          if (code !== 0 || signal) outcome = controlled(null);
          finish(); operation.exited();
        });
        timer = setTimeout(operation.cancel, TERMINATE_AT_MS);
        child.send({ config, payload }, error => { if (error) { outcome = controlled(null); operation.cancel(); } });
      } catch {
        outcome = controlled(null);
        if (child?.pid) operation.cancel();
        else { finish(); operation.exited(); }
      }
    });
  }
  async function cancel() {
    closed = true;
    const pending = [...active];
    for (const operation of pending) operation.cancel();
    await Promise.all(pending.map(operation => operation.done));
  }
  return Object.freeze({ send, ready, cancel, maxDurationMs: MAX_DURATION_MS });
}
module.exports = { createAuthSmtpSender, controlled, validConfig, MAX_DURATION_MS };
