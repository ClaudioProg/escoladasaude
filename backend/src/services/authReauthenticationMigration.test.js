"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { validateMigrationSql } = require("../../scripts/run-migration");
const sql = fs.readFileSync(path.join(__dirname, "../../db/migrations/2026-10-15-auth-reautenticacao-expand.sql"), "utf8");
test("new reauthentication DDL passes official runner parser without execution", () => {
  assert.doesNotThrow(() => validateMigrationSql(sql));
  assert.doesNotMatch(sql, /\b(?:BEGIN TRANSACTION|COMMIT|ROLLBACK|TRUNCATE|DROP TABLE|ALTER TABLE)\b/i);
});
test("DDL constrains hash, purpose, finite exact lifetime, one-use timestamp and immediate FKs", () => {
  for (const expression of [/octet_length\(token_hash\) = 32/, /PRIMARY KEY \(token_hash\)/,
    /expira_em = criada_em \+ interval '5 minutes'/, /consumida_em < expira_em/,
    /isfinite\(criada_em\)/, /isfinite\(expira_em\)/, /NOT DEFERRABLE INITIALLY IMMEDIATE/,
    /'trocar_senha', 'alterar_email', 'encerrar_conta', 'conceder_perfil'/]) assert.match(sql, expression);
  assert.doesNotMatch(sql, /\b(?:password|senha|token)\s+(?:text|varchar|bytea)\b/i);
});
test("new triggers cover legacy credential writers/revocation and delete only recent-password proofs", () => {
  for (const field of ["senha", "email", "auth_version", "email_version", "deleted_at"]) {
    assert.ok(sql.includes(`NEW.${field} IS DISTINCT FROM OLD.${field}`));
  }
  assert.match(sql, /AFTER UPDATE OF revogada_em, token_hash, usuario_id, criada_em ON public\.auth_sessao/);
  const deletes = sql.match(/DELETE FROM [^;]+;/g);
  assert.equal(deletes.length, 2); assert.ok(deletes.every(value => value.startsWith("DELETE FROM public.auth_reautenticacao_prova")));
  assert.doesNotMatch(sql, /(?:CREATE|REPLACE|ALTER) (?:FUNCTION|TRIGGER).*auth_contexto_restrito/);
});
test("only new route is mounted; protected D2 allowlist remains unchanged", () => {
  const index = fs.readFileSync(path.join(__dirname, "../routes/index.js"), "utf8");
  assert.match(index, /mount\("\/auth", authReauthenticationRoute, "authReauthenticationRoute"\)/);
  const d2 = fs.readFileSync(path.join(__dirname, "../auth/authRestrictedMiddleware.js"), "utf8");
  assert.doesNotMatch(d2, /reautenticacao|reauth/);
});
