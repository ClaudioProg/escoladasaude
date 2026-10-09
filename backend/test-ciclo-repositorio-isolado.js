"use strict";
if (process.env.DATABASE_URL !== "postgresql://postgres@127.0.0.1:55432/escolatest" ||
    process.env.NODE_ENV !== "test") {
  throw new Error("Teste permitido somente no banco PostgreSQL local escolatest.");
}
const assert = require("node:assert/strict");
const db = require("./src/db");
const trabalho = require("./src/controllers/trabalhoController");
const sub = require("./src/controllers/submissaoController");

async function invoke(fn, userId = 2) {
  const req = {
    db, params: {}, body: {}, query: {},
    user: { id: userId, perfil: "usuario" },
    method: "GET", headers: {},
  };
  const res = {
    status(n) { this.code = n; return this; },
    json(x) { this.data = x; return this; },
    setHeader() { return this; },
  };
  let err;
  await fn(req, res, (e) => { err = e; });
  if (err) throw err;
  return res.data.data;
}
(async () => {
  const rows = await invoke(trabalho.listarRepositorio);
  assert.ok(rows.length >= 2);
  const allowed = new Set([
    "aprovado_exposicao", "aprovado_oral", "aprovada_exposicao",
    "aprovada_oral", "aprovada",
  ]);
  assert.ok(rows.every((row) => allowed.has(row.status) ||
    ["aprovada_exposicao", "aprovada_oral", "aprovada"].includes(row.status)));
  const hidden = rows.filter((row) => row.nota_escrita == null);
  assert.ok(hidden.length >= 1, "Deve ocultar ao menos uma nota não publicada");
  const visible = rows.filter((row) => row.nota_final != null);
  assert.ok(visible.length >= 1, "Deve exibir uma nota autorizada");
  const restricted = await db.many(
    "SELECT id FROM trabalhos_submissoes WHERE status IN ('rascunho','em_avaliacao','reprovado','reprovada')",
  );
  for (const id of restricted.map((x) => Number(x.id))) {
    assert.ok(!rows.some((row) => Number(row.id) === id));
  }
  console.log("4/4 VERIFICAÇÕES DO REPOSITÓRIO PASSARAM.");
})()
  .then(() => db.shutdown())
  .catch(async (error) => {
    console.error(error.stack || error);
    await db.shutdown();
    process.exitCode = 1;
  });
