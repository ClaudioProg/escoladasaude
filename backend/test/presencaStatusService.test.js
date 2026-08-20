"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  classificarStatusEncontro,
} = require("../src/services/presencaStatusService");

const inicio = "2026-08-20T14:00:00.000";
const fim = "2026-08-20T16:00:00.000";

test("encontro futuro aguarda o evento", () => {
  assert.equal(
    classificarStatusEncontro({
      presente: false,
      agora: "2026-08-20T13:00:00.000",
      inicio,
      fim,
    }),
    "aguardando_evento",
  );
});

test("encontro em andamento aguarda confirmação inclusive no limite final", () => {
  for (const agora of ["2026-08-20T15:00:00.000", fim]) {
    assert.equal(
      classificarStatusEncontro({ presente: false, agora, inicio, fim }),
      "aguardando_confirmacao",
    );
  }
});

test("presença confirmada prevalece durante ou depois do encontro", () => {
  assert.equal(
    classificarStatusEncontro({
      presente: true,
      agora: "2026-08-20T17:00:00.000",
      inicio,
      fim,
    }),
    "presenca_confirmada",
  );
});

test("falta só existe depois do fim sem presença", () => {
  assert.equal(
    classificarStatusEncontro({
      presente: false,
      agora: "2026-08-20T16:00:00.001",
      inicio,
      fim,
    }),
    "falta",
  );
});

test("cada encontro de um evento com vários dias é classificado isoladamente", () => {
  const agora = "2026-08-21T12:00:00.000";
  assert.deepEqual(
    [
      classificarStatusEncontro({
        presente: false,
        agora,
        inicio: "2026-08-20T14:00:00.000",
        fim: "2026-08-20T16:00:00.000",
      }),
      classificarStatusEncontro({
        presente: false,
        agora,
        inicio: "2026-08-22T14:00:00.000",
        fim: "2026-08-22T16:00:00.000",
      }),
    ],
    ["falta", "aguardando_evento"],
  );
});
