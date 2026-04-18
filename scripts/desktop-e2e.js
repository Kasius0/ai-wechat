#!/usr/bin/env node
"use strict";

const { runElectronLogHarness } = require("./lib/electron-log-harness");
const {
  listDesktopE2EModes,
  getDesktopE2EModeConfig,
  createDesktopE2ESeenState,
} = require("./lib/desktop-e2e-mode-config");
const { evaluateDesktopE2ELog } = require("./lib/desktop-e2e-log-evaluator");

const timeoutMs = Number(process.env.DESKTOP_E2E_TIMEOUT_MS || 30000);
const runtimeKey = String(process.env.RUNTIME_SQLITE_KEY || "").trim();
const mode = String(process.argv[2] || "startup").trim().toLowerCase();
const modeConfig = getDesktopE2EModeConfig(mode);

if (!modeConfig) {
  const usageModes = listDesktopE2EModes().join("|");
  console.error(`[desktop-e2e] usage: node scripts/desktop-e2e.js <${usageModes}>`);
  process.exit(1);
}

const env = { ...process.env };
if (runtimeKey) {
  env.RUNTIME_SQLITE_ENCRYPTION = "1";
  env.RUNTIME_SQLITE_ENCRYPTION_MODE = "sqlcipher";
  env.RUNTIME_SQLITE_KEY = runtimeKey;
}
if (modeConfig.envFlag) {
  env[modeConfig.envFlag] = "1";
}

const seen = createDesktopE2ESeenState();

function onLogLine(payload, finish) {
  const result = evaluateDesktopE2ELog(payload, {
    seen,
    modeConfig,
    runtimeKey,
  });
  if (result.status === "fail") {
    finish(false, result.message);
    return;
  }
  if (result.status === "pass") {
    finish(true, result.message);
  }
}

runElectronLogHarness({
  name: "desktop-e2e",
  env,
  timeoutMs,
  onJsonLogLine: onLogLine,
  onProcessExit: (code, finish) => {
    finish(false, `electron exited before success criteria (code=${code == null ? "null" : String(code)}).`);
  },
});

