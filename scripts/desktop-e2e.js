#!/usr/bin/env node
"use strict";

const { runElectronLogHarness } = require("./lib/electron-log-harness");

const timeoutMs = Number(process.env.DESKTOP_E2E_TIMEOUT_MS || 30000);
const runtimeKey = String(process.env.RUNTIME_SQLITE_KEY || "").trim();
const mode = String(process.argv[2] || "startup").trim().toLowerCase();

if (!["startup", "flow", "renderer", "ui"].includes(mode)) {
  console.error("[desktop-e2e] usage: node scripts/desktop-e2e.js <startup|flow|renderer|ui>");
  process.exit(1);
}

const env = { ...process.env };
if (runtimeKey) {
  env.RUNTIME_SQLITE_ENCRYPTION = "1";
  env.RUNTIME_SQLITE_ENCRYPTION_MODE = "sqlcipher";
  env.RUNTIME_SQLITE_KEY = runtimeKey;
}
if (mode === "flow") {
  env.DESKTOP_E2E_FLOW = "1";
}
if (mode === "renderer") {
  env.DESKTOP_E2E_RENDERER_FLOW = "1";
}
if (mode === "ui") {
  env.DESKTOP_E2E_UI_FLOW = "1";
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
  if (event === "desktop-e2e-flow-pass") {
    seen.flowPass = true;
  }
  if (event === "desktop-e2e-renderer-flow-pass") {
    seen.rendererPass = true;
  }
  if (event === "desktop-e2e-ui-pass") {
    seen.uiPass = true;
  }
  if (event === "desktop-e2e-flow-fail") {
    finish(false, payload?.reason || payload?.message || "desktop runtime flow failed.");
    return;
  }
  if (event === "desktop-e2e-renderer-flow-fail") {
    finish(false, payload?.reason || payload?.message || "desktop renderer flow failed.");
    return;
  }
  if (event === "desktop-e2e-ui-fail") {
    finish(false, payload?.reason || payload?.message || "desktop UI flow failed.");
    return;
  }

  if (mode === "startup" && seen.encryptionConfig && seen.sqliteReady && seen.appReady) {
    finish(true, "startup emitted encryption-config, sqlite-ready, and app-ready.");
    return;
  }
  if (mode === "flow" && seen.encryptionConfig && seen.sqliteReady && seen.appReady && seen.flowPass) {
    finish(true, "flow emitted startup signals and desktop-e2e-flow-pass.");
    return;
  }
  if (mode === "renderer" && seen.encryptionConfig && seen.sqliteReady && seen.appReady && seen.rendererPass) {
    finish(true, "renderer flow emitted startup signals and desktop-e2e-renderer-flow-pass.");
    return;
  }
  if (mode === "ui" && seen.encryptionConfig && seen.sqliteReady && seen.appReady && seen.uiPass) {
    finish(true, "ui flow emitted startup signals and desktop-e2e-ui-pass.");
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

