#!/usr/bin/env node
"use strict";

const { spawn } = require("node:child_process");
const os = require("node:os");

const timeoutMs = Number(process.env.DESKTOP_E2E_TIMEOUT_MS || 30000);
const runtimeKey = String(process.env.RUNTIME_SQLITE_KEY || "").trim();
const mode = String(process.argv[2] || "startup").trim().toLowerCase();

if (!["startup", "flow", "renderer", "ui"].includes(mode)) {
  console.error("[desktop-e2e] usage: node scripts/desktop-e2e.js <startup|flow|renderer|ui>");
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

const child = spawn("npm", ["run", "start"], {
  shell: true,
  stdio: ["ignore", "pipe", "pipe"],
  env,
});

let settled = false;
const seen = {
  encryptionConfig: false,
  sqliteReady: false,
  appReady: false,
  flowPass: false,
  rendererPass: false,
  uiPass: false,
};

function finish(ok, message) {
  if (settled) {
    return;
  }
  settled = true;
  clearTimeout(timer);
  stopProcessTree(child, () => {
    if (ok) {
      console.log(`[desktop-e2e] PASS: ${message}`);
      process.exit(0);
      return;
    }
    console.error(`[desktop-e2e] FAIL: ${message}`);
    process.exit(1);
  });
}

function onLogLine(rawLine) {
  const line = String(rawLine || "").trim();
  if (!line.startsWith("{") || !line.endsWith("}")) {
    return;
  }
  let payload;
  try {
    payload = JSON.parse(line);
  } catch {
    return;
  }
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

let buffer = "";
function onChunk(chunk) {
  buffer += String(chunk);
  const lines = buffer.split(/\r?\n/);
  buffer = lines.pop() || "";
  for (const line of lines) {
    onLogLine(line);
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
    finish(false, `electron exited before success criteria (code=${code == null ? "null" : String(code)}).`);
  }
});

const timer = setTimeout(() => {
  finish(false, `timeout after ${timeoutMs}ms.`);
}, timeoutMs);

