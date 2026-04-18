const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { defineHandler } = require("../src/main/ipc/ipc-utils");
const {
  dispatchRuntimeEvent,
  resetRuntimeStoresForTests,
} = require("../src/main/modules/runtime/session-state-machine");

beforeEach(() => {
  resetRuntimeStoresForTests();
  dispatchRuntimeEvent("reset", { traceId: "ipc-utils-test" });
});

test("defineHandler: attachRuntimeOnError merges snapshot into fail().data", async () => {
  const h = defineHandler(async () => {
    throw new Error("boom");
  }, {
    defaultErrorCode: "TEST_HANDLER_ERR",
    attachRuntimeOnError: true,
  });
  const r = await h();
  assert.equal(r.ok, false);
  assert.equal(r.code, "TEST_HANDLER_ERR");
  assert.ok(r.data && typeof r.data === "object");
  assert.ok(r.data.runtime);
  assert.equal(typeof r.data.runtime.state, "string");
  assert.ok(Array.isArray(r.data.runtime.allowedEvents));
  assert.equal(r.data.name, "Error");
});

test("defineHandler: default does not attach runtime", async () => {
  const h = defineHandler(async () => {
    throw new Error("boom");
  }, {
    defaultErrorCode: "TEST_NO_RUNTIME",
  });
  const r = await h();
  assert.equal(r.ok, false);
  assert.equal(r.data.runtime, undefined);
});
