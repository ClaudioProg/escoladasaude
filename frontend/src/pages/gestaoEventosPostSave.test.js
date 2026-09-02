import assert from "node:assert/strict";
import test from "node:test";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const fakeWindow = {
  event: undefined,
  addEventListener() {},
  removeEventListener() {},
  getSelection() {
    return null;
  },
  HTMLIFrameElement: function HTMLIFrameElement() {},
  HTMLElement: function HTMLElement() {},
  Node: function Node() {},
};
const fakeDocument = {
  nodeType: 9,
  defaultView: fakeWindow,
  addEventListener() {},
  removeEventListener() {},
  documentElement: { namespaceURI: "http://www.w3.org/1999/xhtml" },
};
fakeWindow.document = fakeDocument;
globalThis.window = fakeWindow;
globalThis.document = fakeDocument;

const ReactModule = await import("react");
const React = ReactModule.default;
const { act, startTransition, useLayoutEffect, useMemo, useRef, useState } =
  ReactModule;
const { createRoot } = await import("react-dom/client");
const { createCanonicalEditorSnapshot, isEditorDirty, useEditorSavedSnapshot } =
  await import("./gestaoEventosState.js");

function createContainer() {
  return {
    nodeType: 1,
    tagName: "DIV",
    ownerDocument: fakeDocument,
    addEventListener() {},
    removeEventListener() {},
    appendChild() {},
    removeChild() {},
    insertBefore() {},
    firstChild: null,
    lastChild: null,
  };
}

function eventPayload(title) {
  return {
    id: 101,
    titulo: title,
    descricao: "Evento artificial",
    local: "Sala local",
    tipo: "Congresso",
    unidade_id: 1,
    publico_alvo: "Participantes locais",
    conteudo_programatico: "Conteúdo local",
    termo_ativo: false,
    turmas: [
      {
        id: 201,
        nome: "Turma local",
        vagas_total: 30,
        carga_horaria: 4,
        datas: [
          {
            data: "2026-09-15",
            horario_inicio: "08:00",
            horario_fim: "12:00",
          },
        ],
        organizadores: [17],
        palestrantes: [],
        assinantes: [17],
      },
    ],
    restrito: false,
    restrito_modo: null,
  };
}

async function mountEditorLifecycle() {
  let harness;

  function EditorLifecycleHarness() {
    const [payload, setPayload] = useState(null);
    const [step, setStep] = useState(1);
    const currentSnapshot = useMemo(
      () => (payload === null ? null : createCanonicalEditorSnapshot(payload)),
      [payload],
    );
    const currentSnapshotRef = useRef(null);
    currentSnapshotRef.current = currentSnapshot;
    const { markEditorHydrated, savedSnapshot } =
      useEditorSavedSnapshot(currentSnapshotRef);
    const dirty = isEditorDirty(currentSnapshot, savedSnapshot);

    useLayoutEffect(() => {
      harness = {
        currentSnapshot,
        dirty,
        hydrate(nextPayload) {
          startTransition(() => {
            setPayload(nextPayload);
            markEditorHydrated();
          });
        },
        savedSnapshot,
        setPayload,
        setStep,
        step,
      };
    }, [currentSnapshot, dirty, markEditorHydrated, savedSnapshot, step]);

    return null;
  }

  const root = createRoot(createContainer());
  await act(async () => {
    root.render(React.createElement(EditorLifecycleHarness));
  });

  return {
    get harness() {
      return harness;
    },
    async unmount() {
      await act(async () => root.unmount());
    },
  };
}

test("save, refetch e reidratação convergem baseline mesmo quando o snapshot não muda", async () => {
  const mounted = await mountEditorLifecycle();
  const original = eventPayload("Evento original");
  const edited = eventPayload("Evento salvo");

  try {
    await act(async () => mounted.harness.hydrate(original));
    assert.equal(mounted.harness.dirty, false);

    await act(async () => mounted.harness.setPayload(edited));
    assert.equal(mounted.harness.dirty, true);
    assert.equal(
      JSON.parse(mounted.harness.savedSnapshot).titulo,
      "Evento original",
    );
    assert.equal(
      JSON.parse(mounted.harness.currentSnapshot).titulo,
      "Evento salvo",
    );

    // O refetch persistido devolve os mesmos dados que já estão no formulário.
    // A revisão de hidratação precisa atualizar o baseline mesmo sem alterar o
    // valor de currentSnapshot.
    await act(async () => mounted.harness.hydrate({ ...edited }));
    assert.equal(mounted.harness.dirty, false);
    assert.equal(
      mounted.harness.currentSnapshot,
      mounted.harness.savedSnapshot,
    );

    await act(async () => mounted.harness.setStep(4));
    assert.equal(mounted.harness.dirty, false);

    await act(async () =>
      mounted.harness.setPayload({ ...edited, local: "Outra sala" }),
    );
    assert.equal(mounted.harness.dirty, true);
  } finally {
    await mounted.unmount();
  }
});
