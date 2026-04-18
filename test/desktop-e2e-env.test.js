const { describe, test } = require("node:test");
const assert = require("node:assert/strict");

const { getDesktopE2EModeConfig } = require("../scripts/lib/desktop-e2e-mode-config");
const { buildDesktopE2EEnv } = require("../scripts/lib/desktop-e2e-env");

describe("desktop-e2e-env", () => {
  test("returns cloned base env when no runtime key and no mode flag", () => {
    const baseEnv = { FOO: "bar" };
    const modeConfig = getDesktopE2EModeConfig("startup");
    const env = buildDesktopE2EEnv(baseEnv, { runtimeKey: "", modeConfig });
    assert.notEqual(env, baseEnv);
    assert.equal(env.FOO, "bar");
    assert.equal(env.RUNTIME_SQLITE_KEY, undefined);
  });

  test("injects encrypted runtime env when runtimeKey is provided", () => {
    const modeConfig = getDesktopE2EModeConfig("startup");
    const env = buildDesktopE2EEnv({}, { runtimeKey: "k1", modeConfig });
    assert.equal(env.RUNTIME_SQLITE_ENCRYPTION, "1");
    assert.equal(env.RUNTIME_SQLITE_ENCRYPTION_MODE, "sqlcipher");
    assert.equal(env.RUNTIME_SQLITE_KEY, "k1");
  });

  test("sets mode-specific env flag when configured", () => {
    const modeConfig = getDesktopE2EModeConfig("renderer");
    const env = buildDesktopE2EEnv({}, { runtimeKey: "", modeConfig });
    assert.equal(env.DESKTOP_E2E_RENDERER_FLOW, "1");
    assert.equal(env.DESKTOP_E2E_FLOW, undefined);
  });
});

