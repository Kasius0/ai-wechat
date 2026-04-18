"use strict";

const path = require("node:path");
const { spawn } = require("node:child_process");
const os = require("node:os");

/** `scripts/lib` → desktop package root (where `package.json` + `electron` live). */
const DESKTOP_APP_ROOT = path.join(__dirname, "..", "..");

function resolveDefaultElectronSpawn() {
  let electronExe;
  try {
    electronExe = require("electron");
  } catch {
    return null;
  }
  return {
    command: electronExe,
    args: ["."],
    cwd: DESKTOP_APP_ROOT,
    shell: false,
  };
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

function runElectronLogHarness(options) {
  const opts = options || {};
  const defaults = resolveDefaultElectronSpawn();
  const command = opts.command ?? defaults?.command;
  const args = opts.args ?? defaults?.args;
  const cwd = opts.cwd ?? defaults?.cwd ?? DESKTOP_APP_ROOT;
  let useShell = opts.shell;
  if (typeof useShell !== "boolean") {
    // npm.cmd / npx need a shell on Windows; spawning `electron` directly must use shell:false so stdout pipes work.
    const cmd = command == null ? "" : String(command);
    useShell = cmd === "npm" || cmd === "npx" || cmd.endsWith("npm.cmd");
  }
  const {
    env = process.env,
    timeoutMs = 30000,
    name = "electron-log-harness",
    onJsonLogLine,
    onProcessExit,
  } = opts;

  if (typeof onJsonLogLine !== "function") {
    throw new TypeError("runElectronLogHarness requires onJsonLogLine callback.");
  }

  if (!command || !Array.isArray(args)) {
    throw new TypeError(
      "electron-log-harness: pass `command` and `args`, or install `electron` next to this package's package.json."
    );
  }

  const child = spawn(command, args, {
    cwd,
    shell: useShell,
    stdio: ["ignore", "pipe", "pipe"],
    env,
  });

  let buffer = "";
  /** Last bytes of stderr for post-mortem (Chromium/Electron errors rarely use stdout JSON). */
  let stderrTail = "";
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
      if (stderrTail.trim()) {
        console.error(`${prefix} stderr (tail):\n${stderrTail.trimEnd()}`);
      }
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
  child.stderr.on("data", (chunk) => {
    const s = String(chunk);
    stderrTail = (stderrTail + s).slice(-12000);
    onChunk(chunk);
  });
  child.on("error", (error) => finish(false, error?.message || String(error)));
  child.on("exit", (code, signal) => {
    if (settled) {
      return;
    }
    if (typeof onProcessExit === "function") {
      onProcessExit(code, signal, finish);
      return;
    }
    const sigText = signal ? ` signal=${signal}` : "";
    finish(
      false,
      `process exited before verification (code=${code == null ? "null" : String(code)}${sigText}).`
    );
  });

  const timer = setTimeout(() => {
    finish(false, `timeout after ${timeoutMs}ms.`);
  }, timeoutMs);
}

module.exports = {
  runElectronLogHarness,
};

