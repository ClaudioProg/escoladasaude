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
const { createMemoryRouter, RouterProvider, useBlocker, useLocation } =
  await import("react-router-dom");
const { confirmBlockedNavigation, settleBlockedNavigation } =
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

async function mountRouter({ initialEntries, initialIndex }) {
  let harness;

  function BlockerHarness() {
    const [dirty, setDirty] = useState(true);
    const blocker = useBlocker(() => dirty);
    const location = useLocation();

    useLayoutEffect(() => {
      harness = { blocker, dirty, location, setDirty };
    }, [blocker, dirty, location, setDirty]);

    return null;
  }

  const router = createMemoryRouter(
    [{ path: "*", element: React.createElement(BlockerHarness) }],
    { initialEntries, initialIndex },
  );
  const root = createRoot(createContainer());

  await act(async () => {
    root.render(React.createElement(RouterProvider, { router }));
  });

  return {
    get harness() {
      return harness;
    },
    router,
    async unmount() {
      await act(async () => root.unmount());
    },
  };
}

test("RouterProvider bloqueia PUSH dirty, cancela e confirma uma única vez", async () => {
  const mounted = await mountRouter({ initialEntries: ["/editor"] });

  try {
    await act(async () => mounted.router.navigate("/painel"));
    assert.equal(mounted.harness.location.pathname, "/editor");
    assert.equal(mounted.harness.blocker.state, "blocked");

    await act(async () =>
      settleBlockedNavigation(mounted.harness.blocker, "cancel"),
    );
    assert.equal(mounted.harness.location.pathname, "/editor");
    assert.equal(mounted.harness.blocker.state, "unblocked");

    await act(async () => mounted.router.navigate("/painel"));
    assert.equal(mounted.harness.blocker.state, "blocked");
    await act(async () => {
      assert.equal(confirmBlockedNavigation(mounted.harness.blocker), false);
    });
    assert.equal(mounted.harness.location.pathname, "/painel");
    assert.equal(mounted.harness.blocker.state, "unblocked");
  } finally {
    await mounted.unmount();
  }
});

test("RouterProvider bloqueia POP/back, cancela e confirma sem reblock", async () => {
  const mounted = await mountRouter({
    initialEntries: ["/painel", "/editor"],
    initialIndex: 1,
  });

  try {
    await act(async () => mounted.router.navigate(-1));
    assert.equal(mounted.harness.location.pathname, "/editor");
    assert.equal(mounted.harness.blocker.state, "blocked");

    await act(async () =>
      settleBlockedNavigation(mounted.harness.blocker, "cancel"),
    );
    assert.equal(mounted.harness.location.pathname, "/editor");
    assert.equal(mounted.harness.blocker.state, "unblocked");

    await act(async () => mounted.router.navigate(-1));
    assert.equal(mounted.harness.blocker.state, "blocked");
    await act(async () => {
      confirmBlockedNavigation(mounted.harness.blocker);
    });
    assert.equal(mounted.harness.location.pathname, "/painel");
    assert.equal(mounted.harness.blocker.state, "unblocked");
  } finally {
    await mounted.unmount();
  }
});

test("RouterProvider navega sem blocker quando dirty=false", async () => {
  const mounted = await mountRouter({ initialEntries: ["/editor"] });

  try {
    await act(async () => mounted.harness.setDirty(false));
    await act(async () => mounted.router.navigate("/painel"));
    assert.equal(mounted.harness.location.pathname, "/painel");
    assert.equal(mounted.harness.blocker.state, "unblocked");
  } finally {
    await mounted.unmount();
  }
});
