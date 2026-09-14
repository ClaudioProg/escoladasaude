import assert from "node:assert/strict";
import test from "node:test";

import {
  eventoCanonicalUrl,
  eventoPath,
  estadoInscricaoEvento,
  filtrarEventosVitrine,
  inscricoesDoEvento,
  mensagemElegibilidade,
  ocupacaoEvento,
} from "./eventosVitrineState.js";

test("listagem mantém eventos válidos com vagas, lotados e restritos", () => {
  const eventos = [
    { id: 1, publicado: true, evento_visivel_vitrine: true },
    {
      id: 2,
      publicado: true,
      evento_visivel_vitrine: true,
      vagas_esgotadas: true,
    },
    {
      id: 3,
      publicado: true,
      evento_visivel_vitrine: true,
      pode_se_inscrever: false,
    },
  ];

  assert.deepEqual(
    filtrarEventosVitrine(eventos).map((evento) => evento.id),
    [1, 2, 3],
  );
});

test("listagem exclui evento encerrado, após 25% ou não publicado conforme flag do backend", () => {
  const eventos = [
    { id: 1, publicado: true, evento_visivel_vitrine: false },
    { id: 2, publicado: true, evento_visivel_vitrine: false },
    { id: 3, publicado: false, evento_visivel_vitrine: true },
  ];

  assert.deepEqual(filtrarEventosVitrine(eventos), []);
});

test("ocupação usa totais canônicos e identifica vagas esgotadas", () => {
  assert.deepEqual(ocupacaoEvento({ vagas_total: 40, vagas_preenchidas: 32 }), {
    vagasTotal: 40,
    vagasPreenchidas: 32,
    vagasDisponiveis: 8,
    percentual: 80,
    esgotadas: false,
  });
  assert.equal(
    ocupacaoEvento({ vagas_total: 40, vagas_preenchidas: 40 }).esgotadas,
    true,
  );
});

test("URL canônica contém somente origem e identificador do evento", () => {
  assert.equal(eventoPath(123), "/eventos/123");
  const url = eventoCanonicalUrl("https://app.exemplo.test/", 123);
  assert.equal(url, "https://app.exemplo.test/eventos/123");
  assert.doesNotMatch(url, /token|cpf|usuario|@/i);
});

test("estado individual localiza inscrições e preserva público-alvo real", () => {
  assert.equal(
    inscricoesDoEvento(
      [
        { evento_id: 8, turma_id: 2 },
        { evento_id: 9, turma_id: 3 },
      ],
      8,
    ).length,
    1,
  );
  assert.equal(
    mensagemElegibilidade({
      pode_se_inscrever: false,
      motivo_bloqueio: "Inscrição disponível apenas para Enfermeiros.",
    }),
    "Inscrição disponível apenas para Enfermeiros.",
  );
});

test("página dedicada distingue disponível, inelegível, lotado e inscrito", () => {
  assert.equal(
    estadoInscricaoEvento({ pode_se_inscrever: true }, []),
    "disponivel",
  );
  assert.equal(
    estadoInscricaoEvento({ elegivel_publico_alvo: false }, []),
    "inelegivel",
  );
  assert.equal(estadoInscricaoEvento({ vagas_esgotadas: true }, []), "lotado");
  assert.equal(
    estadoInscricaoEvento({ pode_se_inscrever: false }, [{ turma_id: 1 }]),
    "inscrito",
  );
});
