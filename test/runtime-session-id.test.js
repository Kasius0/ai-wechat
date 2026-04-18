const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const { resolveRuntimeSessionIdFromIpc } = require("../src/main/modules/runtime/runtime-session-id");
const { DEFAULT_RUNTIME_SESSION_ID } = require("../src/main/modules/runtime/session-state-machine");

describe("runtime-session-id", () => {
  test("explicit payload.sessionId wins (trimmed, max length)", () => {
    assert.equal(resolveRuntimeSessionIdFromIpc(null, { sessionId: "  lab  " }), "lab");
  });

  test("explicit options.sessionId", () => {
    assert.equal(resolveRuntimeSessionIdFromIpc(null, { options: { sessionId: "opt-s" } }), "opt-s");
  });

  test("webContents id when no explicit sessionId", () => {
    assert.equal(resolveRuntimeSessionIdFromIpc({ sender: { id: 42 } }, {}), "wc-42");
  });

  test("default when no sender and no explicit", () => {
    assert.equal(resolveRuntimeSessionIdFromIpc(null, {}), DEFAULT_RUNTIME_SESSION_ID);
  });

  test("explicit wins over sender", () => {
    assert.equal(
      resolveRuntimeSessionIdFromIpc({ sender: { id: 1 } }, { sessionId: "custom" }),
      "custom"
    );
  });
});
