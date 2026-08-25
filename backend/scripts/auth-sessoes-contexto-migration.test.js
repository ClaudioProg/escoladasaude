"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { validateMigrationSql } = require("./run-migration");

const migrationPath = path.resolve(
  __dirname,
  "../db/migrations/2026-08-25-auth-sessoes-contexto-expand.sql",
);
const sql = fs.readFileSync(migrationPath, "utf8");

test("migration de sessoes usa somente os nomes singulares aprovados", () => {
  assert.match(sql, /CREATE TABLE public\.auth_sessao \(/);
  assert.match(sql, /CREATE TABLE public\.auth_usuario_contexto \(/);
  assert.doesNotMatch(sql, /auth_sessoes/);
  assert.doesNotMatch(sql, /CREATE (?:TABLE|INDEX)[^;]*IF NOT EXISTS/);
});

test("auth_sessao preserva o contrato fisico, FKs simples e checks", () => {
  assert.match(sql, /id uuid NOT NULL,/);
  assert.doesNotMatch(sql, /DEFAULT\s+(?:gen_random_uuid|uuid_generate|random_uuid)/i);
  assert.match(sql, /usuario_id integer NOT NULL,/);
  assert.match(sql, /token_hash bytea NOT NULL,/);
  assert.match(sql, /CHECK \(octet_length\(token_hash\) = 32\)/);
  assert.match(sql, /criada_em timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,/);
  assert.match(sql, /ultimo_uso_em timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,/);
  assert.match(sql, /expira_em timestamptz NOT NULL,/);
  assert.match(sql, /limite_absoluto_em timestamptz NULL,/);
  assert.match(sql, /revogada_em timestamptz NULL,/);
  assert.match(sql, /ip_criacao inet NULL,/);
  assert.match(sql, /ultimo_ip inet NULL,/);
  assert.match(sql, /FOREIGN KEY \(usuario_id\)\s+REFERENCES public\.usuarios \(id\)\s+ON DELETE RESTRICT\s+NOT DEFERRABLE INITIALLY IMMEDIATE/);
  assert.match(sql, /FOREIGN KEY \(area_ativa\)\s+REFERENCES public\.auth_perfis \(codigo\)\s+ON DELETE RESTRICT\s+NOT DEFERRABLE INITIALLY IMMEDIATE/);
  assert.doesNotMatch(sql, /FOREIGN KEY \(usuario_id,\s*area_ativa\)/);
  for (const constraint of [
    "auth_sessao_ultimo_uso_criada_check",
    "auth_sessao_expira_criada_check",
    "auth_sessao_ultimo_uso_expira_check",
    "auth_sessao_revogada_criada_check",
    "auth_sessao_limite_sem_manter_check",
    "auth_sessao_limite_com_manter_check",
    "auth_sessao_expira_limite_absoluto_check",
    "auth_sessao_revogacao_preenchimento_check",
    "auth_sessao_motivo_revogacao_codigo_check",
  ]) {
    assert.match(sql, new RegExp(`CONSTRAINT ${constraint}`));
  }
  assert.match(sql, /motivo_revogacao ~ '\^\[a-z0-9_\]\+\$'/);
});

test("migration cria somente os indices de sessao aprovados e contexto sem backfill", () => {
  assert.match(sql, /USING btree \(usuario_id, criada_em, id\)\s+WHERE revogada_em IS NULL/);
  assert.match(sql, /USING brin \(expira_em\)\s+WHERE revogada_em IS NULL/);
  assert.match(sql, /USING btree \(revogada_em\)\s+WHERE revogada_em IS NOT NULL/);
  for (const forbiddenIndexColumn of [
    "area_ativa",
    "ultimo_uso_em",
    "ip_criacao",
    "ultimo_ip",
    "user_agent",
    "manter_conectado",
    "limite_absoluto_em",
  ]) {
    assert.doesNotMatch(
      sql,
      new RegExp(`CREATE INDEX[^;]*\\(${forbiddenIndexColumn}`),
    );
  }
  assert.match(sql, /ultima_area_ativa text NOT NULL DEFAULT 'usuario',/);
  assert.match(sql, /atualizado_em timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,/);
  assert.doesNotMatch(sql, /INSERT INTO public\.auth_usuario_contexto/);
});

test("migration permanece compativel com o scanner transacional do runner", () => {
  assert.doesNotThrow(() =>
    validateMigrationSql(sql, {
      fileName: "db/migrations/2026-08-25-auth-sessoes-contexto-expand.sql",
    }),
  );
});
