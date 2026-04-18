#!/usr/bin/env node
"use strict";

const { runElectronLogHarness } = require("./lib/electron-log-harness");

const mode = String(process.argv[2] || "").trim();
const runtimeKey = String(process.env.RUNTIME_SQLITE_KEY || "").trim();
const timeoutMs = Number(process.env.RUNTIME_SQLITE_VERIFY_TIMEOUT_MS || 30000);

if (!mode || !["encrypted-start", "wrong-key-fail"].includes(mode)) {
  console.error(
    "[verify-runtime-sqlite-startup] usage: node scripts/verify-runtime-sqlite-startup.js <encrypted-start|wrong-key-fail>"
  );
  process.exit(1);
}

if (!runtimeKey) {
  console.error("[verify-runtime-sqlite-startup] missing RUNTIME_SQLITE_KEY.");
  process.exit(1);
}

const env = {
  ...process.env,
  RUNTIME_SQLITE_ENCRYPTION: "1",
  RUNTIME_SQLITE_ENCRYPTION_MODE: "sqlcipher",
  RUNTIME_SQLITE_KEY: runtimeKey,
};

function tryHandleLine(payload, finish) {
  const event = payload && payload.event;
  if (mode === "encrypted-start") {
    if (
      event === "runtime-sqlite-ready" &&
      payload?.encryption?.enabled === true &&
      payload?.encryption?.mode === "sqlcipher"
    ) {
      finish(true, "encrypted startup is ready with sqlcipher.");
    }
    if (event === "runtime-sqlite-init-failed") {
      finish(false, payload?.message || "unexpected init failure.");
    }
    return;
  }
  if (event === "runtime-sqlite-init-failed") {
    const message = String(payload?.message || "");
    if (/runtime sqlite init failed:/i.test(message)) {
      finish(true, "wrong-key failure signal is stable.");
      return;
    }
    finish(false, `init failed without stable prefix: ${message}`);
    return;
  }
  if (
    event === "runtime-sqlite-ready" &&
    payload?.encryption?.enabled === true &&
    payload?.encryption?.mode === "sqlcipher"
  ) {
    finish(false, "startup succeeded; RUNTIME_SQLITE_KEY is not a wrong key for current DB.");
  }
}

runElectronLogHarness({
  name: "verify-runtime-sqlite-startup",
  env,
  timeoutMs,
  onJsonLogLine: tryHandleLine,
  onProcessExit: (code, finish) => {
    finish(false, `process exited before verification (code=${code == null ? "null" : String(code)}).`);
  },
});

