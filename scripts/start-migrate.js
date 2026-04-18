#!/usr/bin/env node
"use strict";

const { spawn } = require("node:child_process");

const migrateKey = String(
  process.env.RUNTIME_SQLITE_MIGRATE_KEY || process.env.RUNTIME_SQLITE_KEY || ""
).trim();

if (!migrateKey) {
  console.error(
    "[start:migrate] missing key: set RUNTIME_SQLITE_MIGRATE_KEY or RUNTIME_SQLITE_KEY before running."
  );
  process.exit(1);
}

const env = {
  ...process.env,
  RUNTIME_SQLITE_MIGRATE_TO_SQLCIPHER: "1",
  RUNTIME_SQLITE_MIGRATE_KEY: migrateKey,
};

const child = spawn("npm", ["run", "start"], {
  stdio: "inherit",
  shell: true,
  env,
});

child.on("exit", (code) => {
  if (code === 0) {
    console.log(
      "[start:migrate] done. For regular encrypted startup, use: npm run start:encrypted (with RUNTIME_SQLITE_KEY)."
    );
  }
  process.exit(code == null ? 1 : code);
});

