"use strict";
// Teste manual: SOMENTE banco PostgreSQL local do ensaio.
// Nunca executar com dados institucionais reais.
if (!/^postgres(?:ql)?:\/\/postgres@127\.0\.0\.1:55432\/escolatest$/.test(process.env.DATABASE_URL || "")) {
  throw new Error("Este teste exige o banco LOCAL postgresql://postgres@127.0.0.1:55432/escolatest.");
}
const assert = require("node:assert/strict");
const db = require("./src/db");
const sub = require("./src/controllers/submissaoController");

async function call(fn, options = {}) {
  const req = {
    db, params: options.params || {}, body: options.body || {},
    user: { id: options.id || 1, perfil: options.role || "administrador" },
    method: "POST", headers: {}, query: {},
  };
  const res = {
    status(n) { this.code = n; return this; },
    json(data) { this.data = data; return this; },
    setHeader() { return this; },
  };
  let error;
  await fn(req, res, (err) => { error = err; });
  if (error) throw error;
  return res.data?.data;
}
(async () => {
  const work = await db.one(
    "SELECT id, chamada_id FROM trabalhos_submissoes WHERE status='aprovada_exposicao' ORDER BY id DESC LIMIT 1",
  );
  const criterion = await db.one(
    "SELECT id FROM trabalhos_chamada_criterios_orais WHERE chamada_id=$1 ORDER BY id LIMIT 1",
    [work.chamada_id],
  );
  const assigned = await call(sub.incluirAvaliadores, {
    params: { id: work.id }, body: { itens: [{ avaliador_id: 3, tipo: "oral" }] },
  });
  assert.equal(assigned.inseridos, 1);

  const oral = await call(sub.avaliarOral, {
    id: 3, role: "organizador", params: { id: work.id },
    body: {
      status_resultado: "aprovado",
      itens: [{ criterio_id: criterion.id, nota: 3, comentarios: "Teste oral" }],
    },
  });
  assert.equal(oral.notas.nota_oral, 3);

  const rank = await call(sub.consolidarClassificacao, {
    params: { chamadaId: work.chamada_id },
  });
  assert.ok(rank.some((item) => Number(item.id) === work.id));

  await call(sub.definirNotaVisivel, {
    params: { id: work.id }, body: { visivel: true },
  });
  const minhas = await call(sub.listarMinhas, {
    id: 2, role: "usuario",
  });
  const own = minhas.find((item) => Number(item.id) === work.id);
  assert.equal(Number(own.nota_oral), 3);

  await call(sub.revogarAvaliador, {
    params: { id: work.id }, body: { avaliador_id: 3, tipo: "oral" },
  });
  await call(sub.restaurarAvaliador, {
    params: { id: work.id }, body: { avaliador_id: 3, tipo: "oral" },
  });

  console.log("6/6 TESTES ORAIS E DE CLASSIFICAÇÃO PASSARAM.");
})()
  .then(() => db.shutdown())
  .catch(async (error) => {
    console.error(error.stack || error);
    await db.shutdown();
    process.exitCode = 1;
  });
