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
const { act, useLayoutEffect, useState } = ReactModule;
const { createRoot } = await import("react-dom/client");
const { executePreTesteOperation, usePreTesteEnrollmentSubmission } =
  await import("./preTesteFlowState.js");

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

function singleChoicePreTest() {
  return {
    versao_id: 403,
    perguntas: [
      {
        id: 505,
        tipo: "multipla_escolha",
        modo_resposta: "resposta_unica",
        enunciado: "Pergunta local",
        alternativas: [
          { id: 611, texto: "Alternativa A" },
          { id: 616, texto: "Alternativa B" },
        ],
      },
    ],
  };
}

async function mountSubmission(onSubmit) {
  let harness = null;

  function Harness() {
    const [answers, setAnswers] = useState({});
    const submission = usePreTesteEnrollmentSubmission({
      preTeste: singleChoicePreTest(),
      answers,
      onSubmit,
    });

    useLayoutEffect(() => {
      harness = { ...submission, setAnswers };
    }, [answers, submission]);

    return null;
  }

  const root = createRoot(createContainer());
  await act(async () => root.render(React.createElement(Harness)));

  return {
    get harness() {
      return harness;
    },
    async unmount() {
      await act(async () => root.unmount());
    },
  };
}

test("admin salva, refaz a leitura e publica exatamente o rascunho persistido", async () => {
  const bancoLocal = {
    publicada: {
      id: 402,
      perguntas: [{ id: 503, alternativas: [{ id: 606, texto: "A" }] }],
    },
    rascunho: {
      id: 403,
      perguntas: [{ id: 505, alternativas: [{ id: 611, texto: "A" }] }],
    },
  };
  let adminRefetch = null;

  await executePreTesteOperation(
    async () => {
      bancoLocal.rascunho.perguntas[0].alternativas.push({
        id: 616,
        texto: "3ª opção",
      });
    },
    async () => {
      adminRefetch = structuredClone(bancoLocal.rascunho);
      return adminRefetch;
    },
  );

  assert.equal(adminRefetch.perguntas[0].alternativas.at(-1).texto, "3ª opção");
  assert.equal(bancoLocal.publicada.id, 402);

  await executePreTesteOperation(
    async () => {
      bancoLocal.publicada = structuredClone(bancoLocal.rascunho);
      bancoLocal.rascunho = null;
    },
    async () => structuredClone(bancoLocal),
  );

  const participante = structuredClone(bancoLocal.publicada);
  assert.equal(participante.id, 403);
  assert.equal(participante.perguntas[0].alternativas.at(-1).texto, "3ª opção");
});

test("resposta única envia payload escalar e conclui a inscrição", async () => {
  let payloadRecebido = null;
  let inscrito = false;
  const mounted = await mountSubmission(async (payload) => {
    payloadRecebido = payload;
    inscrito = true;
  });

  try {
    await act(async () =>
      mounted.harness.setAnswers({ 505: { alternativa_id: 616 } }),
    );
    let sucesso = false;
    await act(async () => {
      sucesso = await mounted.harness.submit();
    });

    assert.equal(sucesso, true);
    assert.equal(inscrito, true);
    assert.deepEqual(payloadRecebido, {
      versao_id: 403,
      respostas: [{ pergunta_id: 505, alternativa_id: 616 }],
    });
    assert.equal(mounted.harness.submitting, false);
    assert.equal(mounted.harness.error, "");
  } finally {
    await mounted.unmount();
  }
});

test("falha da inscrição exibe erro e libera nova tentativa", async () => {
  const mounted = await mountSubmission(async () => {
    const error = new Error("falha técnica");
    error.data = { message: "Inscrição local rejeitada." };
    throw error;
  });

  try {
    await act(async () =>
      mounted.harness.setAnswers({ 505: { alternativa_id: 616 } }),
    );
    let sucesso = true;
    await act(async () => {
      sucesso = await mounted.harness.submit();
    });

    assert.equal(sucesso, false);
    assert.equal(mounted.harness.error, "Inscrição local rejeitada.");
    assert.equal(mounted.harness.submitting, false);
  } finally {
    await mounted.unmount();
  }
});

test("validação incompleta não emite request nem trava o botão", async () => {
  let chamadas = 0;
  const mounted = await mountSubmission(async () => {
    chamadas += 1;
  });

  try {
    let sucesso = true;
    await act(async () => {
      sucesso = await mounted.harness.submit();
    });

    assert.equal(sucesso, false);
    assert.equal(chamadas, 0);
    assert.equal(
      mounted.harness.error,
      "Responda todas as perguntas antes de continuar.",
    );
    assert.equal(mounted.harness.submitting, false);
  } finally {
    await mounted.unmount();
  }
});
