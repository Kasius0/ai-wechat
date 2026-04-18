const { describe, test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const {
  dispatchRuntimeEvent,
  getRuntimeSnapshot,
  RUNTIME_STATES,
  resetRuntimeStoresForTests,
} = require("../src/main/modules/runtime/session-state-machine");
const {
  syncRuntimeFromWechatStatusLikeResult,
  syncRuntimeAbnormalIfAwaitingContext,
  syncRuntimeWechatNormalAfterCaptureOk,
} = require("../src/main/modules/runtime/single-step-wechat-runtime-sync");

describe("single-step-wechat-runtime-sync", () => {
  beforeEach(() => {
    resetRuntimeStoresForTests();
    dispatchRuntimeEvent("reset", { traceId: "single-step-reset" });
  });

  test("status-like normal → wechat_normal only in awaiting_context", () => {
    dispatchRuntimeEvent("session_start", { traceId: "t" });
    syncRuntimeFromWechatStatusLikeResult(
      { ok: true, data: { status: "normal" } },
      "t",
      "test"
    );
    assert.equal(getRuntimeSnapshot().state, RUNTIME_STATES.READY_TO_REPLY);
  });

  test("status-like not normal → wechat_abnormal", () => {
    dispatchRuntimeEvent("session_start", { traceId: "t" });
    syncRuntimeFromWechatStatusLikeResult(
      { ok: true, data: { status: "degraded" } },
      "t",
      "test"
    );
    assert.equal(getRuntimeSnapshot().state, RUNTIME_STATES.ERROR);
  });

  test("no-op when idle", () => {
    syncRuntimeFromWechatStatusLikeResult(
      { ok: true, data: { status: "normal" } },
      "t",
      "test"
    );
    assert.equal(getRuntimeSnapshot().state, RUNTIME_STATES.IDLE);
  });

  test("syncRuntimeAbnormalIfAwaitingContext", () => {
    dispatchRuntimeEvent("session_start", { traceId: "t" });
    syncRuntimeAbnormalIfAwaitingContext("t", "fail");
    assert.equal(getRuntimeSnapshot().state, RUNTIME_STATES.ERROR);
  });

  test("syncRuntimeWechatNormalAfterCaptureOk", () => {
    dispatchRuntimeEvent("session_start", { traceId: "t" });
    syncRuntimeWechatNormalAfterCaptureOk("t", "cap");
    assert.equal(getRuntimeSnapshot().state, RUNTIME_STATES.READY_TO_REPLY);
  });
});
