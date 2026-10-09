"use strict";
if (process.env.DATABASE_URL !== "postgresql://postgres@127.0.0.1:55432/escolatest" ||
    process.env.NODE_ENV !== "test") {
  throw new Error("Teste exclusivamente no banco local escolatest.");
}
const assert = require("node:assert/strict");
const db = require("./src/db");
const trabalho = require("./src/controllers/trabalhoController");
const sub = require("./src/controllers/submissaoController");
async function call(fn, id, role, userId, errorExpected = false) {
  const req = {
    db, params: { id }, body: {}, query: {},
    user: { id: userId, perfil: role },
    method: "GET", headers: {},
  };
  const res = {
    status(n) { this.code = n; return this; },
    json(x) { this.data = x; return this; },
    setHeader() { return this; },
  };
  let error;
  await fn(req, res, (e) => { error = e; });
  if (errorExpected) {
    assert.ok(error);
    return { error, data: res.data?.data };
  }
  if (error) throw error;
  return { data: res.data?.data };
}
(async () => {
  const notVisible = await db.one(
    "SELECT id FROM trabalhos_submissoes WHERE nota_visivel=false AND nota_escrita IS NOT NULL ORDER BY id LIMIT 1",
  );
  const id = notVisible.id;
  const author = (await call(trabalho.obter, id, "usuario", 2)).data;
  assert.equal(author.nota_escrita, null);
  assert.equal(author.nota_final, null);
  assert.equal(author.observacoes_admin, null);

  const admin = (await call(trabalho.obter, id, "administrador", 1)).data;
  assert.ok(admin.nota_escrita !== null);
  const detail = (await call(sub.obterSubmissao, id, "usuario", 2)).data;
  assert.equal(detail.nota_final, null);

  const blocked = await call(sub.listarAvaliacaoDaSubmissao, id, "usuario", 2, true);
  assert.equal(blocked.error.status, 403);

  const adminAssessment = (await call(sub.listarAvaliacaoDaSubmissao, id, "administrador", 1)).data;
  assert.ok(adminAssessment.itens.length > 0);

  const noDeletion = await call(trabalho.remover, id, "administrador", 1, true);
  assert.equal(noDeletion.error.status, 409);

  assert.ok((await db.one(
    "SELECT count(*)::int AS n FROM trabalhos_submissoes WHERE id=$1",
    [id],
  )).n === 1);
  console.log("7/7 TESTES DE VISIBILIDADE E HISTÓRICO PASSARAM.");
})()
  .then(() => db.shutdown())
  .catch(async (e) => {
    console.error(e.stack || e);
    await db.shutdown();
    process.exitCode = 1;
  });
