"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {validateMigrationSql}=require("./run-migration");
const sql=fs.readFileSync(path.join(__dirname,"../db/migrations/2026-10-15-auth-contexto-restrito-expand.sql"),"utf8");
test("D2 forward-only migration respects official runner transaction",()=>{
 assert.doesNotThrow(()=>validateMigrationSql(sql));
 assert.match(sql,/SET TRANSACTION ISOLATION LEVEL READ COMMITTED/);
 assert.doesNotMatch(sql,/^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/mi);
 assert.doesNotMatch(sql,/CREATE (?:TABLE|INDEX)[^;]*IF NOT EXISTS|CREATE INDEX CONCURRENTLY|ALTER TABLE|INSERT INTO/i);
 assert.equal((sql.match(/CREATE TABLE/g)||[]).length,1);
});
test("minimal session FK and strict finite D2 time constraints without progress fiction",()=>{
 assert.match(sql,/PRIMARY KEY \(sessao_id\)/);
 assert.match(sql,/REFERENCES public\.auth_sessao \(id\) ON DELETE RESTRICT/);
 assert.match(sql,/auth_version_esperada integer NOT NULL/);
 assert.match(sql,/limite_absoluto_em = iniciada_em \+ interval '120 minutes'/);
 assert.match(sql,/expira_em > ultimo_uso_em AND expira_em <= ultimo_uso_em \+ interval '30 minutes'/);
 assert.match(sql,/expira_em <= limite_absoluto_em/);
 assert.equal((sql.match(/isfinite\(/g)||[]).length,4);
 assert.doesNotMatch(sql.replace(/--[^\n]*/g,""),/ultima_area_ativa|token_hash|usuario_id\s+integer|politica|progresso/);
});

test("critical legacy writes invalidate only D2, even without version increment",()=>{
 assert.match(sql,/AFTER UPDATE OF senha, email, auth_version, email_version, deleted_at ON public\.usuarios/);
 for(const field of ["senha","email","auth_version","email_version","deleted_at"])
  assert.ok(sql.includes("NEW."+field+" IS DISTINCT FROM OLD."+field));
 assert.match(sql,/DELETE FROM public\.auth_contexto_restrito c\s+USING public\.auth_sessao s\s+WHERE c\.sessao_id = s\.id AND s\.usuario_id = NEW\.id/);
 assert.doesNotMatch(sql,/UPDATE (?:public\.)?(?:usuarios|auth_sessao)\s+SET|DELETE FROM public\.(usuarios|auth_sessao)\b/i);
 assert.doesNotMatch(sql,/SECURITY DEFINER/i);
});
