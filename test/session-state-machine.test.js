const { describe, test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const {
  dispatchRuntimeEvent,
  getRuntimeSnapshot,
  RUNTIME_STATES,
  resetRuntimeStoresForTests,
  evictRuntimeSessionFromMemoryForTests,
  dropRuntimeSessionForWebContents,
} = require("../src/main/modules/runtime/session-state-machine");
const {
  initRuntimeSqlitePersistence,
  closeRuntimeSqlitePersistence,
} = require("../src/main/modules/runtime/runtime-sqlite-persistence");

describe("session-state-machine", () => {
  beforeEach(() => {
    resetRuntimeStoresForTests();
    dispatchRuntimeEvent("reset", { traceId: "unit-test" });
  });

  test("getRuntimeSnapshot after reset: idle + allowedEvents", () => {
    const s = getRuntimeSnapshot();
    assert.equal(s.state, RUNTIME_STATES.IDLE);
    assert.ok(Array.isArray(s.allowedEvents));
    assert.deepEqual(new Set(s.allowedEvents), new Set(["session_start", "reset"]));
  });

  test("happy path: awaiting → ready → sending → cooldown → idle", () => {
    dispatchRuntimeEvent("session_start", { traceId: "t" });
    assert.equal(getRuntimeSnapshot().state, RUNTIME_STATES.AWAITING_CONTEXT);
    dispatchRuntimeEvent("wechat_normal", { traceId: "t" });
    assert.equal(getRuntimeSnapshot().state, RUNTIME_STATES.READY_TO_REPLY);
    dispatchRuntimeEvent("trigger_send", { traceId: "t" });
    assert.equal(getRuntimeSnapshot().state, RUNTIME_STATES.SENDING);
    dispatchRuntimeEvent("send_ok", { traceId: "t" });
    assert.equal(getRuntimeSnapshot().state, RUNTIME_STATES.COOLDOWN);
    dispatchRuntimeEvent("cooldown_done", { traceId: "t" });
    assert.equal(getRuntimeSnapshot().state, RUNTIME_STATES.IDLE);
  });

  test("after wechat_normal: ready_to_reply allows trigger_send", () => {
    dispatchRuntimeEvent("session_start", { traceId: "t" });
    dispatchRuntimeEvent("wechat_normal", { traceId: "t" });
    assert.equal(getRuntimeSnapshot().state, RUNTIME_STATES.READY_TO_REPLY);
    assert.ok(getRuntimeSnapshot().allowedEvents.includes("trigger_send"));
  });

  test("invalid transition: ok false and data.allowedEvents", () => {
    dispatchRuntimeEvent("session_start", { traceId: "t" });
    const r = dispatchRuntimeEvent("session_start", { traceId: "t" });
    assert.equal(r.ok, false);
    assert.ok(Array.isArray(r.data.allowedEvents));
    assert.ok(!r.data.allowedEvents.includes("session_start"));
  });

  test("multi-session: buckets are isolated by sessionId", () => {
    dispatchRuntimeEvent("session_start", { traceId: "a", sessionId: "win-a" });
    dispatchRuntimeEvent("reset", { traceId: "b", sessionId: "win-b" });
    assert.equal(getRuntimeSnapshot("win-a").state, RUNTIME_STATES.AWAITING_CONTEXT);
    assert.equal(getRuntimeSnapshot("win-b").state, RUNTIME_STATES.IDLE);
    dispatchRuntimeEvent("wechat_normal", { traceId: "a", sessionId: "win-a" });
    assert.equal(getRuntimeSnapshot("win-a").state, RUNTIME_STATES.READY_TO_REPLY);
    assert.equal(getRuntimeSnapshot("win-b").state, RUNTIME_STATES.IDLE);
  });
});

describe("session-state-machine + SQLite", () => {
  beforeEach(() => {
    closeRuntimeSqlitePersistence();
    initRuntimeSqlitePersistence(":memory:");
    resetRuntimeStoresForTests();
  });

  afterEach(() => {
    closeRuntimeSqlitePersistence();
  });

  test("reloads from SQLite after memory eviction", () => {
    dispatchRuntimeEvent("session_start", { traceId: "t", sessionId: "persist-reload" });
    assert.equal(getRuntimeSnapshot("persist-reload").state, RUNTIME_STATES.AWAITING_CONTEXT);
    evictRuntimeSessionFromMemoryForTests("persist-reload");
    const again = getRuntimeSnapshot("persist-reload");
    assert.equal(again.state, RUNTIME_STATES.AWAITING_CONTEXT);
    assert.ok(again.allowedEvents.includes("wechat_normal"));
  });

  test("dropRuntimeSessionForWebContents clears wc-* memory and SQLite", () => {
    dispatchRuntimeEvent("session_start", { traceId: "t", sessionId: "wc-501" });
    assert.equal(getRuntimeSnapshot("wc-501").state, RUNTIME_STATES.AWAITING_CONTEXT);
    dropRuntimeSessionForWebContents(501);
    const fresh = getRuntimeSnapshot("wc-501");
    assert.equal(fresh.state, RUNTIME_STATES.IDLE);
    assert.ok(fresh.allowedEvents.includes("session_start"));
  });
});
