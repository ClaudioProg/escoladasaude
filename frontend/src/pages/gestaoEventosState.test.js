import assert from "node:assert/strict";
import test from "node:test";

import {
  attachBeforeUnloadGuard,
  confirmBlockedNavigation,
  createCanonicalEditorSnapshot,
  createPersistedEditorSnapshot,
  isEditorDirty,
  settleBlockedNavigation,
  shouldBlockEditorNavigation,
} from "./gestaoEventosState.js";

function eventPayload(overrides = {}) {
  return {
    titulo: "Evento",
    descricao: "Descrição",
    local: "Auditório",
    tipo: "Curso",
    unidade_id: "12",
    publico_alvo: "Servidores",
    conteudo_programatico: null,
    termo_ativo: false,
    turmas: [
      {
        id: "5",
        nome: "Turma A",
        vagas_total: "20",
        carga_horaria: 8,
        datas: [
          {
            data: "2026-09-12T03:00:00.000Z",
            horario_inicio: "08:00:00",
            horario_fim: "12:00:00",
          },
        ],
        organizadores: [9, "3"],
        palestrantes: [{ nome: "Ana", usuario_id: "7" }],
        assinantes: [17, 2474],
      },
    ],
    restrito: true,
    restrito_modo: "cargos",
    cargos_permitidos: [4, "2"],
    ...overrides,
  };
}

test("dirty acompanha carga, edição, desfazer, save, passos e nova edição", () => {
  const carregado = eventPayload();
  let atual = createCanonicalEditorSnapshot(carregado);
  let salvo = atual;

  assert.equal(isEditorDirty(atual, salvo), false);

  const editado = eventPayload({ titulo: "Evento editado" });
  atual = createCanonicalEditorSnapshot(editado);
  assert.equal(isEditorDirty(atual, salvo), true);

  atual = createCanonicalEditorSnapshot(carregado);
  assert.equal(isEditorDirty(atual, salvo), false);

  atual = createCanonicalEditorSnapshot(editado);
  salvo = createPersistedEditorSnapshot(editado);
  assert.equal(isEditorDirty(atual, salvo), false);

  const etapaAtual = 1;
  const outraEtapa = 4;
  assert.notEqual(etapaAtual, outraEtapa);
  assert.equal(isEditorDirty(atual, salvo), false);

  atual = createCanonicalEditorSnapshot({ ...editado, local: "Sala 2" });
  assert.equal(isEditorDirty(atual, salvo), true);
});

test("snapshot normaliza conjuntos, IDs, vazios, datas e preserva ordens funcionais", () => {
  const a = eventPayload();
  const b = eventPayload({
    unidade_id: 12,
    conteudo_programatico: "",
    cargos_permitidos: [2, 4, 2],
    turmas: [
      {
        ...a.turmas[0],
        id: 5,
        organizadores: [3, 9, 3],
        datas: [
          {
            data: "2026-09-12",
            horario_inicio: "08:00",
            horario_fim: "12:00",
          },
        ],
      },
    ],
  });

  assert.equal(
    createCanonicalEditorSnapshot(a),
    createCanonicalEditorSnapshot(b),
  );

  const signersReordered = eventPayload({
    turmas: [{ ...a.turmas[0], assinantes: [2474, 17] }],
  });
  assert.notEqual(
    createCanonicalEditorSnapshot(a),
    createCanonicalEditorSnapshot(signersReordered),
  );
});

test("arquivos distintos com metadados iguais mantêm identidades distintas e leves", () => {
  const fileA = { name: "folder.png", size: 100, lastModified: 1 };
  const fileB = { name: "folder.png", size: 100, lastModified: 1 };

  assert.equal(
    createCanonicalEditorSnapshot(eventPayload({ folderFile: fileA })),
    createCanonicalEditorSnapshot(eventPayload({ folderFile: fileA })),
  );
  assert.notEqual(
    createCanonicalEditorSnapshot(eventPayload({ folderFile: fileA })),
    createCanonicalEditorSnapshot(eventPayload({ folderFile: fileB })),
  );
});

test("navegação SPA livre ou bloqueada preserva a transição original", () => {
  assert.equal(shouldBlockEditorNavigation({ dirty: false }), false);
  assert.equal(shouldBlockEditorNavigation({ dirty: true }), true);
  assert.equal(
    shouldBlockEditorNavigation({ dirty: true, allowNavigation: true }),
    false,
  );

  const calls = [];
  const blocker = {
    state: "blocked",
    reset: () => calls.push("cancel:editor-preservado"),
    proceed: () => calls.push("confirm:destino-original"),
  };
  assert.equal(settleBlockedNavigation(blocker, "cancel"), true);
  assert.deepEqual(calls, ["cancel:editor-preservado"]);
  assert.equal(settleBlockedNavigation(blocker, "confirm"), true);
  assert.deepEqual(calls, [
    "cancel:editor-preservado",
    "confirm:destino-original",
  ]);
  assert.equal(confirmBlockedNavigation(blocker), false);
  assert.deepEqual(calls, [
    "cancel:editor-preservado",
    "confirm:destino-original",
    "confirm:destino-original",
  ]);

  const etapa = { numero: 2, dadosPendentes: "mantidos" };
  const proximaEtapa = { ...etapa, numero: 5 };
  assert.equal(proximaEtapa.dadosPendentes, "mantidos");
  assert.deepEqual(calls, [
    "cancel:editor-preservado",
    "confirm:destino-original",
    "confirm:destino-original",
  ]);
});

test("beforeunload é instalado e removido pelo ciclo dirty", () => {
  const listeners = new Map();
  const target = {
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    removeEventListener(type, handler) {
      if (listeners.get(type) === handler) {
        listeners.delete(type);
      }
    },
  };

  assert.equal(listeners.has("beforeunload"), false);
  const cleanup = attachBeforeUnloadGuard(target);
  assert.equal(listeners.has("beforeunload"), true);
  const event = {
    prevented: false,
    returnValue: null,
    preventDefault() {
      this.prevented = true;
    },
  };
  listeners.get("beforeunload")(event);
  assert.equal(event.prevented, true);
  assert.equal(event.returnValue, "");
  cleanup();
  assert.equal(listeners.has("beforeunload"), false);
});
