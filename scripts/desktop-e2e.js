#!/usr/bin/env node
"use strict";

const { runElectronLogHarness } = require("./lib/electron-log-harness");

const timeoutMs = Number(process.env.DESKTOP_E2E_TIMEOUT_MS || 30000);
const runtimeKey = String(process.env.RUNTIME_SQLITE_KEY || "").trim();
const mode = String(process.argv[2] || "startup").trim().toLowerCase();
const MODE_CONFIG = {
  startup: {
    envFlag: null,
    passSeenKey: null,
    passMessage: "startup emitted encryption-config, sqlite-ready, and app-ready.",
  },
  flow: {
    envFlag: "DESKTOP_E2E_FLOW",
    passSeenKey: "flowPass",
    passEvent: "desktop-e2e-flow-pass",
    failEvent: "desktop-e2e-flow-fail",
    failFallbackMessage: "desktop runtime flow failed.",
    passMessage: "flow emitted startup signals and desktop-e2e-flow-pass.",
  },
  renderer: {
    envFlag: "DESKTOP_E2E_RENDERER_FLOW",
    passSeenKey: "rendererPass",
    passEvent: "desktop-e2e-renderer-flow-pass",
    failEvent: "desktop-e2e-renderer-flow-fail",
    failFallbackMessage: "desktop renderer flow failed.",
    passMessage: "renderer flow emitted startup signals and desktop-e2e-renderer-flow-pass.",
  },
  ui: {
    envFlag: "DESKTOP_E2E_UI_FLOW",
    passSeenKey: "uiPass",
    passEvent: "desktop-e2e-ui-pass",
    failEvent: "desktop-e2e-ui-fail",
    failFallbackMessage: "desktop UI flow failed.",
    passMessage: "ui flow emitted startup signals and desktop-e2e-ui-pass.",
  },
};
const modeConfig = MODE_CONFIG[mode];

if (!modeConfig) {
  const usageModes = Object.keys(MODE_CONFIG).join("|");
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

const seen = {
  encryptionConfig: false,
  sqliteReady: false,
  appReady: false,
  flowPass: false,
  rendererPass: false,
  uiPass: false,
};

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

