#!/usr/bin/env node
"use strict";

const { runElectronLogHarness } = require("./lib/electron-log-harness");
const { resolveDesktopE2EContext, createDesktopE2ELogHandler } = require("./lib/desktop-e2e-core");
const { readPositionalArg, readEnvString, readEnvNumber, formatModesUsage } = require("./lib/script-cli");

const timeoutMs = readEnvNumber(process.env, "DESKTOP_E2E_TIMEOUT_MS", 30000);
const runtimeKey = readEnvString(process.env, "RUNTIME_SQLITE_KEY", "");
const mode = readPositionalArg(process.argv, 2, "startup").toLowerCase();
const context = resolveDesktopE2EContext({ mode, runtimeKey, baseEnv: process.env });

if (!context.ok) {
  const usageModes = formatModesUsage(context.usageModes);
  console.error(`[desktop-e2e] usage: node scripts/desktop-e2e.js <${usageModes}>`);
  process.exit(1);
}
const onLogLine = createDesktopE2ELogHandler(context);

runElectronLogHarness({
  name: "desktop-e2e",
  env: context.env,
  timeoutMs,
  onJsonLogLine: onLogLine,
  onProcessExit: (code, signal, finish) => {
    const sig = signal ? ` signal=${signal}` : "";
    finish(
      false,
      `electron exited before success criteria (code=${code == null ? "null" : String(code)}${sig}).`
    );
  },
});

