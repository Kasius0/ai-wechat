const { describe, test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const {
  dispatchRuntimeEvent,
  getRuntimeSnapshot,
  RUNTIME_STATES,
  resetRuntimeStoresForTests,
} = require("../src/main/modules/runtime/session-state-machine");
const {
  quickSendRuntimeBegin,
  quickSendRuntimeWechatAbnormal,
  quickSendRuntimeWechatNormal,
  quickSendRuntimeTriggerSend,
  quickSendRuntimeSendFail,
  quickSendRuntimeSendComplete,
} = require("../src/main/modules/runtime/quick-send-runtime-bridge");

describe("quick-send-runtime-bridge", () => {
  beforeEach(() => {
    resetRuntimeStoresForTests();
    dispatchRuntimeEvent("reset", { traceId: "bridge-test-reset" });
  });

  test("begin matches quick-send entry: awaiting_context", () => {
    quickSendRuntimeBegin("qs-1");
    const s = getRuntimeSnapshot();
    assert.equal(s.state, RUNTIME_STATES.AWAITING_CONTEXT);
    assert.ok(s.allowedEvents.includes("wechat_normal"));
  });

  test("after wechat_normal: ready_to_reply (dry-run end state)", () => {
    quickSendRuntimeBegin("qs-2");
    quickSendRuntimeWechatNormal("qs-2");
    assert.equal(getRuntimeSnapshot().state, RUNTIME_STATES.READY_TO_REPLY);
  });

  test("full send path returns to idle", () => {
    quickSendRuntimeBegin("qs-3");
    quickSendRuntimeWechatNormal("qs-3");
    quickSendRuntimeTriggerSend("qs-3");
    quickSendRuntimeSendComplete("qs-3");
    assert.equal(getRuntimeSnapshot().state, RUNTIME_STATES.IDLE);
  });

  test("send_fail lands in error with only reset", () => {
    quickSendRuntimeBegin("qs-4");
    quickSendRuntimeWechatNormal("qs-4");
    quickSendRuntimeTriggerSend("qs-4");
    quickSendRuntimeSendFail("qs-4");
    assert.equal(getRuntimeSnapshot().state, RUNTIME_STATES.ERROR);
    assert.deepEqual(getRuntimeSnapshot().allowedEvents, ["reset"]);
  });

  test("wechat_abnormal from awaiting_context", () => {
    quickSendRuntimeBegin("qs-5");
    quickSendRuntimeWechatAbnormal("qs-5");
    assert.equal(getRuntimeSnapshot().state, RUNTIME_STATES.ERROR);
  });
});
