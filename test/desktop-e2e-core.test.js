const { describe, test } = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveDesktopE2EContext,
  createDesktopE2ELogHandler,
} = require("../scripts/lib/desktop-e2e-core");

describe("desktop-e2e-core", () => {
  test("returns usage modes for invalid mode", () => {
    const result = resolveDesktopE2EContext({
      mode: "bad-mode",
      runtimeKey: "",
      baseEnv: {},
    });
    assert.equal(result.ok, false);
    assert.deepEqual(result.usageModes, ["startup", "flow", "renderer", "ui"]);
  });

  test("builds context env and passes on completed startup mode", () => {
    const context = resolveDesktopE2EContext({
      mode: "startup",
      runtimeKey: "k1",
      baseEnv: { FOO: "bar" },
    });
    assert.equal(context.ok, true);
    assert.equal(context.env.FOO, "bar");
    assert.equal(context.env.RUNTIME_SQLITE_KEY, "k1");

    const onLogLine = createDesktopE2ELogHandler(context);
    const outcomes = [];
    const finish = (ok, message) => outcomes.push({ ok, message });
    onLogLine({ event: "runtime-sqlite-encryption-config" }, finish);
    onLogLine({ event: "runtime-sqlite-ready", encryption: { enabled: true, mode: "sqlcipher" } }, finish);
    onLogLine({ event: "app-ready" }, finish);
    assert.equal(outcomes.length, 1);
    assert.equal(outcomes[0].ok, true);
    assert.match(outcomes[0].message, /startup/i);
  });
});

