const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const {
  getRuntimeHighlightBlock,
} = require("../src/renderer/get-runtime-highlight-block.js");

describe("get-runtime-highlight-block", () => {
  test("null / non-object data → null", () => {
    assert.strictEqual(getRuntimeHighlightBlock(null), null);
    assert.strictEqual(getRuntimeHighlightBlock({}), null);
    assert.strictEqual(getRuntimeHighlightBlock({ data: null }), null);
    assert.strictEqual(getRuntimeHighlightBlock({ data: "x" }), null);
  });

  test("data.runtime object wins", () => {
    const rt = { state: "idle", allowedEvents: ["session_start"] };
    const out = getRuntimeHighlightBlock({
      ok: true,
      data: { runtime: rt, traceId: "t1" },
    });
    assert.deepEqual(out, { label: "data.runtime", payload: rt });
  });

  test("runtime:state shaped → 运行时快照", () => {
    const out = getRuntimeHighlightBlock({
      ok: true,
      code: "OK",
      data: {
        state: "awaiting_context",
        allowedEvents: ["wechat_normal"],
        lastTraceId: "x",
        lastError: null,
        history: [],
      },
    });
    assert.equal(out.label, "运行时快照");
    assert.equal(out.payload.state, "awaiting_context");
    assert.deepEqual(out.payload.allowedEvents, ["wechat_normal"]);
    assert.equal(out.payload.lastTraceId, "x");
    assert.equal(out.payload.lastError, null);
  });

  test("does not treat wechat-quick-send as 运行时快照", () => {
    const out = getRuntimeHighlightBlock({
      ok: true,
      data: {
        state: "idle",
        allowedEvents: ["session_start", "reset"],
        action: "wechat-quick-send",
      },
    });
    assert.strictEqual(out, null);
  });

  test("wechat with data.runtime still uses data.runtime branch", () => {
    const out = getRuntimeHighlightBlock({
      ok: true,
      data: {
        action: "wechat-quick-send",
        runtime: { state: "idle", allowedEvents: ["a"] },
      },
    });
    assert.equal(out.label, "data.runtime");
    assert.equal(out.payload.state, "idle");
  });

  test("runtime:event invalid transition", () => {
    const out = getRuntimeHighlightBlock({
      ok: false,
      code: "RUNTIME_INVALID_TRANSITION",
      data: {
        state: "awaiting_context",
        event: "session_start",
        allowedEvents: ["wechat_normal"],
      },
    });
    assert.equal(out.label, "运行时快照");
    assert.equal(out.payload.event, "session_start");
    assert.equal(out.payload.from, undefined);
  });
});
