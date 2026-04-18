const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const {
  enrichWechatIpcResultWithRuntime,
} = require("../src/main/modules/runtime/enrich-wechat-ipc-result");

const snap = { state: "idle", allowedEvents: ["reset"], lastTraceId: null, lastError: null };

describe("enrich-wechat-ipc-result (pure)", () => {
  test("passes through null / non-object result", () => {
    assert.strictEqual(enrichWechatIpcResultWithRuntime(null, snap), null);
    assert.strictEqual(enrichWechatIpcResultWithRuntime(undefined, snap), undefined);
    assert.strictEqual(enrichWechatIpcResultWithRuntime("x", snap), "x");
  });

  test("passes through when runtime missing or non-object", () => {
    const r = { ok: true, data: { a: 1 } };
    assert.deepEqual(enrichWechatIpcResultWithRuntime(r, null), r);
    assert.deepEqual(enrichWechatIpcResultWithRuntime(r, undefined), r);
    assert.deepEqual(enrichWechatIpcResultWithRuntime(r, "bad"), r);
  });

  test("merges runtime into plain data", () => {
    const r = { ok: true, code: "OK", message: "m", data: { x: 1 } };
    const out = enrichWechatIpcResultWithRuntime(r, snap);
    assert.equal(out.ok, true);
    assert.equal(out.data.x, 1);
    assert.deepEqual(out.data.runtime, snap);
    assert.equal(r.data.runtime, undefined, "does not mutate input");
  });

  test("creates data when absent", () => {
    const r = { ok: false, code: "E", message: "m" };
    const out = enrichWechatIpcResultWithRuntime(r, snap);
    assert.deepEqual(out.data, { runtime: snap });
  });

  test("does not overwrite existing data.runtime", () => {
    const existing = { state: "custom" };
    const r = { ok: true, data: { runtime: existing } };
    const out = enrichWechatIpcResultWithRuntime(r, snap);
    assert.strictEqual(out.data.runtime, existing);
  });

  test("treats array data like non-object merge target", () => {
    const r = { ok: true, data: [1, 2] };
    const out = enrichWechatIpcResultWithRuntime(r, snap);
    assert.deepEqual(out.data, { runtime: snap });
  });
});
