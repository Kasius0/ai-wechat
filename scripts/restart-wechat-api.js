const { execSync, spawn } = require("node:child_process");
const path = require("node:path");

const host = process.env.WECHAT_AUTOMATION_HOST || "127.0.0.1";
const port = Number(process.env.WECHAT_AUTOMATION_PORT || 8787);

function getListeningPid(targetHost, targetPort) {
  const output = execSync("netstat -ano -p tcp", {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  const lines = output.split(/\r?\n/);
  for (const line of lines) {
    if (!line.includes("LISTENING")) {
      continue;
    }
    const compact = line.trim().split(/\s+/);
    // Expected: TCP localAddr foreignAddr LISTENING pid
    if (compact.length < 5) {
      continue;
    }
    const localAddr = compact[1];
    const pid = compact[4];
    if (localAddr === `${targetHost}:${targetPort}`) {
      return Number(pid);
    }
  }
  return null;
}

function killPid(pid) {
  execSync(`taskkill /PID ${pid} /F`, {
    stdio: ["ignore", "inherit", "inherit"],
  });
}

function startMockServer() {
  const scriptPath = path.join(__dirname, "mock-wechat-api.js");
  const child = spawn(process.execPath, [scriptPath], {
    stdio: "inherit",
    env: process.env,
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

try {
  const pid = getListeningPid(host, port);
  if (pid) {
    console.log(`[wechat-api:restart] port ${port} in use, killing PID ${pid}...`);
    killPid(pid);
  } else {
    console.log(`[wechat-api:restart] port ${port} is free.`);
  }

  console.log(`[wechat-api:restart] starting mock server on ${host}:${port}...`);
  startMockServer();
} catch (error) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        code: "RESTART_FAILED",
        message: error.message,
      },
      null,
      2
    )
  );
  process.exit(1);
}
