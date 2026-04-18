#!/usr/bin/env node
"use strict";

const { runElectronLogHarness } = require("./lib/electron-log-harness");
const {
  VERIFY_MODES,
  resolveRuntimeSqliteVerifyContext,
  createRuntimeSqliteVerifyLogHandler,
} = require("./lib/runtime-sqlite-verify-core");

const mode = String(process.argv[2] || "").trim();
const runtimeKey = String(process.env.RUNTIME_SQLITE_KEY || "").trim();
const timeoutMs = Number(process.env.RUNTIME_SQLITE_VERIFY_TIMEOUT_MS || 30000);
const context = resolveRuntimeSqliteVerifyContext({
  mode,
  runtimeKey,
  baseEnv: process.env,
});

if (!context.ok && context.message === "invalid verify mode") {
  console.error(
    `[verify-runtime-sqlite-startup] usage: node scripts/verify-runtime-sqlite-startup.js <${VERIFY_MODES.join("|")}>`
  );
  process.exit(1);
}
if (!context.ok && context.message === "missing RUNTIME_SQLITE_KEY.") {
  console.error("[verify-runtime-sqlite-startup] missing RUNTIME_SQLITE_KEY.");
  process.exit(1);
}
const tryHandleLine = createRuntimeSqliteVerifyLogHandler(context);

runElectronLogHarness({
  name: "verify-runtime-sqlite-startup",
  env: context.env,
  timeoutMs,
  onJsonLogLine: tryHandleLine,
  onProcessExit: (code, finish) => {
    finish(false, `process exited before verification (code=${code == null ? "null" : String(code)}).`);
  },
});

