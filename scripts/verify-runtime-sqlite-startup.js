#!/usr/bin/env node
"use strict";

const { spawn } = require("node:child_process");
const os = require("node:os");

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

function stopProcessTree(child, done) {
  if (!child || child.killed) {
    done();
    return;
  }
  if (os.platform() === "win32" && child.pid) {
    const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      shell: true,
    });
    killer.on("exit", () => done());
    killer.on("error", () => done());
    return;
  }
  try {
    child.kill("SIGTERM");
  } catch {
    // ignore
  }
  done();
}

const env = {
  ...process.env,
  RUNTIME_SQLITE_ENCRYPTION: "1",
  RUNTIME_SQLITE_ENCRYPTION_MODE: "sqlcipher",
  RUNTIME_SQLITE_KEY: runtimeKey,
};

const child = spawn("npm", ["run", "start"], {
  env,
  shell: true,
  stdio: ["ignore", "pipe", "pipe"],
});

let buffer = "";
let settled = false;

function finish(ok, message) {
  if (settled) {
    return;
  }
  settled = true;
  clearTimeout(timer);
  stopProcessTree(child, () => {
    if (ok) {
      console.log(`[verify-runtime-sqlite-startup] PASS: ${message}`);
      process.exit(0);
    }
    console.error(`[verify-runtime-sqlite-startup] FAIL: ${message}`);
    process.exit(1);
  });
}

function tryHandleLine(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return;
  }
  let payload = null;
  try {
    payload = JSON.parse(trimmed);
  } catch {
    return;
  }
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

function onChunk(chunk) {
  buffer += String(chunk);
  const lines = buffer.split(/\r?\n/);
  buffer = lines.pop() || "";
  for (const line of lines) {
    tryHandleLine(line);
    if (settled) {
      return;
    }
  }
}

child.stdout.on("data", onChunk);
child.stderr.on("data", onChunk);
child.on("error", (error) => finish(false, error?.message || String(error)));
child.on("exit", (code) => {
  if (!settled) {
    finish(false, `process exited before verification (code=${code == null ? "null" : String(code)}).`);
  }
});

const timer = setTimeout(() => {
  finish(false, `timeout after ${timeoutMs}ms.`);
}, timeoutMs);

