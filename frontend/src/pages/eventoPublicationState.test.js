import assert from "node:assert/strict";
import test from "node:test";

import {
  cancelDespublicationConfirmation,
  confirmDespublication,
  openDespublicationConfirmation,
  publicationControlAriaLabel,
} from "./eventoPublicationState.js";

test("controle de publicação mantém estado visual e expõe a ação no nome", () => {
  assert.equal(
    publicationControlAriaLabel({ publicado: true, titulo: "Saúde Mental" }),
    "Despublicar evento Saúde Mental",
  );
  assert.equal(
    publicationControlAriaLabel({ publicado: false, titulo: "Vacinação" }),
    "Publicar evento Vacinação",
  );
});

test("cancelar despublicação fecha sem request; confirmar chama exatamente uma vez", async () => {
  const evento = { id: 42, publicado: true, titulo: "Evento" };
  const requests = [];
  let selecionado = openDespublicationConfirmation(evento);
  assert.equal(selecionado, evento);

  selecionado = cancelDespublicationConfirmation();
  assert.equal(selecionado, null);
  assert.equal(requests.length, 0);

  selecionado = openDespublicationConfirmation(evento);
  assert.equal(
    await confirmDespublication(selecionado, async (id) => requests.push(id)),
    true,
  );
  assert.deepEqual(requests, [42]);
});

test("falha ao despublicar não produz sucesso nem altera o estado publicado", async () => {
  const evento = { id: 42, publicado: true, titulo: "Evento" };
  let sucesso = false;

  await assert.rejects(
    confirmDespublication(evento, async () => {
      throw new Error("API indisponível");
    }).then(() => {
      sucesso = true;
    }),
    /API indisponível/,
  );

  assert.equal(sucesso, false);
  assert.equal(evento.publicado, true);
});
