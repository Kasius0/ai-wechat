const { describe, test } = require("node:test");
const assert = require("node:assert/strict");

const {
  getDesktopE2EModeConfig,
  createDesktopE2ESeenState,
} = require("../scripts/lib/desktop-e2e-mode-config");
const { evaluateDesktopE2ELog } = require("../scripts/lib/desktop-e2e-log-evaluator");

describe("desktop-e2e-log-evaluator", () => {
  test("fails immediately on sqlite init failure event", () => {
    const seen = createDesktopE2ESeenState();
    const modeConfig = getDesktopE2EModeConfig("startup");
    const result = evaluateDesktopE2ELog(
      { event: "runtime-sqlite-init-failed", message: "boom" },
      { seen, modeConfig, runtimeKey: "" }
    );
    assert.equal(result.status, "fail");
    assert.equal(result.message, "boom");
  });

  test("enforces encrypted startup check when runtimeKey is present", () => {
    const seen = createDesktopE2ESeenState();
    const modeConfig = getDesktopE2EModeConfig("startup");
    const result = evaluateDesktopE2ELog(
      { event: "runtime-sqlite-ready", encryption: { enabled: false, mode: "off" } },
      { seen, modeConfig, runtimeKey: "k" }
    );
    assert.equal(result.status, "fail");
    assert.match(result.message, /sqlcipher/i);
  });

  test("returns pass when startup signals and mode pass event are complete", () => {
    const seen = createDesktopE2ESeenState();
    const modeConfig = getDesktopE2EModeConfig("flow");
    let result = evaluateDesktopE2ELog({ event: "runtime-sqlite-encryption-config" }, { seen, modeConfig, runtimeKey: "" });
    assert.equal(result.status, "continue");
    result = evaluateDesktopE2ELog(
      { event: "runtime-sqlite-ready", encryption: { enabled: false, mode: "off" } },
      { seen, modeConfig, runtimeKey: "" }
    );
    assert.equal(result.status, "continue");
    result = evaluateDesktopE2ELog({ event: "app-ready" }, { seen, modeConfig, runtimeKey: "" });
    assert.equal(result.status, "continue");
    result = evaluateDesktopE2ELog({ event: "desktop-e2e-flow-pass" }, { seen, modeConfig, runtimeKey: "" });
    assert.equal(result.status, "pass");
    assert.match(result.message, /desktop-e2e-flow-pass/);
  });
});

