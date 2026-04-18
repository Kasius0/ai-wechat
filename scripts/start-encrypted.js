#!/usr/bin/env node
"use strict";

const { spawn } = require("node:child_process");

const runtimeKey = String(process.env.RUNTIME_SQLITE_KEY || "").trim();

if (!runtimeKey) {
  console.error("[start:encrypted] missing key: set RUNTIME_SQLITE_KEY before running.");
  process.exit(1);
}

const env = {
  ...process.env,
  RUNTIME_SQLITE_ENCRYPTION: "1",
  RUNTIME_SQLITE_ENCRYPTION_MODE: "sqlcipher",
  RUNTIME_SQLITE_KEY: runtimeKey,
};

const child = spawn("npm", ["run", "start"], {
  stdio: "inherit",
  shell: true,
  env,
});

child.on("exit", (code) => {
  process.exit(code == null ? 1 : code);
});

