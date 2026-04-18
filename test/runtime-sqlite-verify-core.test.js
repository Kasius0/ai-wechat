const { describe, test } = require("node:test");
const assert = require("node:assert/strict");

const {
  VERIFY_MODES,
  resolveRuntimeSqliteVerifyContext,
  createRuntimeSqliteVerifyLogHandler,
} = require("../scripts/lib/runtime-sqlite-verify-core");

describe("runtime-sqlite-verify-core", () => {
  test("returns usage modes on invalid mode", () => {
    const context = resolveRuntimeSqliteVerifyContext({
      mode: "bad",
      runtimeKey: "k1",
      baseEnv: {},
    });
    assert.equal(context.ok, false);
    assert.deepEqual(context.usageModes, VERIFY_MODES);
  });

  test("requires runtime key", () => {
    const context = resolveRuntimeSqliteVerifyContext({
      mode: "encrypted-start",
      runtimeKey: "",
      baseEnv: {},
    });
    assert.equal(context.ok, false);
    assert.equal(context.message, "missing RUNTIME_SQLITE_KEY.");
  });

  test("passes encrypted-start when sqlcipher ready event arrives", () => {
    const context = resolveRuntimeSqliteVerifyContext({
      mode: "encrypted-start",
      runtimeKey: "k1",
      baseEnv: {},
    });
    assert.equal(context.ok, true);
    const outcomes = [];
    const finish = (ok, message) => outcomes.push({ ok, message });
    const onLogLine = createRuntimeSqliteVerifyLogHandler(context);
    onLogLine({ event: "runtime-sqlite-ready", encryption: { enabled: true, mode: "sqlcipher" } }, finish);
    assert.equal(outcomes.length, 1);
    assert.equal(outcomes[0].ok, true);
  });

  test("passes wrong-key-fail on stable init-failed prefix", () => {
    const context = resolveRuntimeSqliteVerifyContext({
      mode: "wrong-key-fail",
      runtimeKey: "k1",
      baseEnv: {},
    });
    const outcomes = [];
    const finish = (ok, message) => outcomes.push({ ok, message });
    const onLogLine = createRuntimeSqliteVerifyLogHandler(context);
    onLogLine({ event: "runtime-sqlite-init-failed", message: "runtime sqlite init failed: file is not a database" }, finish);
    assert.equal(outcomes.length, 1);
    assert.equal(outcomes[0].ok, true);
  });
});

