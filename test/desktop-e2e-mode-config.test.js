const { describe, test } = require("node:test");
const assert = require("node:assert/strict");

const {
  DESKTOP_E2E_MODE_CONFIG,
  listDesktopE2EModes,
  getDesktopE2EModeConfig,
  createDesktopE2ESeenState,
} = require("../scripts/lib/desktop-e2e-mode-config");

describe("desktop-e2e-mode-config", () => {
  test("lists supported modes and resolves case-insensitively", () => {
    const modes = listDesktopE2EModes();
    assert.deepEqual(modes, ["startup", "flow", "renderer", "ui"]);
    assert.equal(getDesktopE2EModeConfig("FLOW")?.envFlag, "DESKTOP_E2E_FLOW");
    assert.equal(getDesktopE2EModeConfig("unknown"), null);
  });

  test("creates seen state with startup flags and all configured pass keys", () => {
    const seen = createDesktopE2ESeenState();
    assert.equal(seen.encryptionConfig, false);
    assert.equal(seen.sqliteReady, false);
    assert.equal(seen.appReady, false);

    for (const modeName of listDesktopE2EModes()) {
      const passSeenKey = DESKTOP_E2E_MODE_CONFIG[modeName]?.passSeenKey;
      if (passSeenKey) {
        assert.equal(seen[passSeenKey], false);
      }
    }
  });
});

