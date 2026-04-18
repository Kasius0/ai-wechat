"use strict";

const { spawn } = require("node:child_process");
const os = require("node:os");

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

function runElectronLogHarness(options) {
  const {
    env = process.env,
    timeoutMs = 30000,
    name = "electron-log-harness",
    command = "npm",
    args = ["run", "start"],
    onJsonLogLine,
    onProcessExit,
  } = options || {};

  if (typeof onJsonLogLine !== "function") {
    throw new TypeError("runElectronLogHarness requires onJsonLogLine callback.");
  }

  const child = spawn(command, args, {
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
    env,
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
      const prefix = `[${name}]`;
      if (ok) {
        console.log(`${prefix} PASS: ${message}`);
        process.exit(0);
        return;
      }
      console.error(`${prefix} FAIL: ${message}`);
      process.exit(1);
    });
  }

  function emitJsonLine(line) {
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
    onJsonLogLine(payload, finish);
  }

  function onChunk(chunk) {
    buffer += String(chunk);
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";
    for (const line of lines) {
      emitJsonLine(line);
      if (settled) {
        return;
      }
    }
  }

  child.stdout.on("data", onChunk);
  child.stderr.on("data", onChunk);
  child.on("error", (error) => finish(false, error?.message || String(error)));
  child.on("exit", (code) => {
    if (settled) {
      return;
    }
    if (typeof onProcessExit === "function") {
      onProcessExit(code, finish);
      return;
    }
    finish(false, `process exited before verification (code=${code == null ? "null" : String(code)}).`);
  });

  const timer = setTimeout(() => {
    finish(false, `timeout after ${timeoutMs}ms.`);
  }, timeoutMs);
}

module.exports = {
  runElectronLogHarness,
};

