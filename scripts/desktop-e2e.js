#!/usr/bin/env node
"use strict";

const { runElectronLogHarness } = require("./lib/electron-log-harness");
const {
  listDesktopE2EModes,
  getDesktopE2EModeConfig,
  createDesktopE2ESeenState,
} = require("./lib/desktop-e2e-mode-config");

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
  const event = payload?.event;

  if (event === "runtime-sqlite-init-failed") {
    finish(false, payload?.message || "runtime sqlite init failed.");
    return;
  }
  if (event === "runtime-sqlite-encryption-config") {
    seen.encryptionConfig = true;
  }
  if (event === "runtime-sqlite-ready") {
    if (runtimeKey) {
      if (!(payload?.encryption?.enabled === true && payload?.encryption?.mode === "sqlcipher")) {
        finish(false, "encrypted mode expected but runtime-sqlite-ready is not sqlcipher.");
        return;
      }
    }
    seen.sqliteReady = true;
  }
  if (event === "app-ready") {
    seen.appReady = true;
  }

  if (modeConfig.passSeenKey && event === modeConfig.passEvent) {
    seen[modeConfig.passSeenKey] = true;
  }
  if (modeConfig.failEvent && event === modeConfig.failEvent) {
    finish(false, payload?.reason || payload?.message || modeConfig.failFallbackMessage);
    return;
  }

  const startupReady = seen.encryptionConfig && seen.sqliteReady && seen.appReady;
  const modeReady = !modeConfig.passSeenKey || seen[modeConfig.passSeenKey];
  if (startupReady && modeReady) {
    finish(true, modeConfig.passMessage);
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

