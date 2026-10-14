"use strict";

// Mesmas representacoes reconhecidas pelo mailer institucional; sem coercao
// de valores desconhecidos para autorizar envio no caminho V3.
function parseAuthOutboxFlag(value) {
  if (typeof value === "boolean") return value;
  if (value === 0 || value === 1) return value === 1;
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "sim", "s", "yes", "y", "on"].includes(normalized)) return true;
  if (["false", "0", "nao", "não", "n", "no", "off"].includes(normalized)) return false;
  return null;
}
function authOutboxMode(env) {
  try {
    const values = [env.AUTH_OUTBOX_WORKER_ENABLED, env.EMAIL_ENABLED,
      env.AUTH_OUTBOX_WORKER_DRY_RUN, env.EMAIL_DRY_RUN];
    // Ausencia nao habilita: enabled=false; dry-run=true ate falso explicito.
    const parsed = values.map((value, index) => value === undefined ? index >= 2 : parseAuthOutboxFlag(value));
    if (parsed.includes(null)) return "blocked-config";
    if (parsed[0] !== true || parsed[1] !== true) return "disabled";
    if (parsed[2] === true || parsed[3] === true) return "dry-run";
    return "ready";
  } catch { return "blocked-config"; }
}
module.exports = { parseAuthOutboxFlag, authOutboxMode };
