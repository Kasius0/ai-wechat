const { execSync, spawn } = require("node:child_process");
const path = require("node:path");
const { createWechatApiClient, sendWechatMessage } = require("./wechat-send-template");

const host = process.env.WECHAT_AUTOMATION_HOST || "127.0.0.1";
const port = Number(process.env.WECHAT_AUTOMATION_PORT || 8787);
const apiPrefix = process.env.WECHAT_AUTOMATION_API_PREFIX || "api/wechat";
const baseUrl = process.env.WECHAT_AUTOMATION_BASE_URL || `http://${host}:${port}`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
    const cols = line.trim().split(/\s+/);
    if (cols.length < 5) {
      continue;
    }
    if (cols[1] === `${targetHost}:${targetPort}`) {
      return Number(cols[4]);
    }
  }
  return null;
}

function killPid(pid) {
  execSync(`taskkill /PID ${pid} /F`, {
    stdio: ["ignore", "inherit", "inherit"],
  });
}

async function waitForServerReady(getOutput, timeoutMs = 5000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    await sleep(100);
    const buffer = getOutput();
    if (buffer.includes("SERVER_READY")) {
      return;
    }
  }

  throw new Error(
    `mock server did not become ready within ${timeoutMs}ms. Output: ${getOutput()}`
  );
}

async function main() {
  const text = process.argv.slice(2).join(" ").trim() || "测试消息";
  const existingPid = getListeningPid(host, port);
  if (existingPid) {
    console.log(`[wechat-e2e] port ${port} in use, killing PID ${existingPid}...`);
    killPid(existingPid);
  }

  const mockPath = path.join(__dirname, "mock-wechat-api.js");
  const child = spawn(process.execPath, [mockPath], {
    env: {
      ...process.env,
      WECHAT_AUTOMATION_HOST: host,
      WECHAT_AUTOMATION_PORT: String(port),
      WECHAT_AUTOMATION_API_PREFIX: apiPrefix,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let outputBuffer = "";
  child.stdout.on("data", (chunk) => {
    const textChunk = chunk.toString();
    outputBuffer += textChunk;
    process.stdout.write(textChunk);
  });
  child.stderr.on("data", (chunk) => {
    const textChunk = chunk.toString();
    outputBuffer += textChunk;
    process.stderr.write(textChunk);
  });

  try {
    await waitForServerReady(() => outputBuffer, 6000);

    const call = await createWechatApiClient(baseUrl, apiPrefix);
    const result = await sendWechatMessage({ text, call });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    if (!child.killed) {
      child.kill();
    }
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        code: "E2E_FAILED",
        message: error.message,
      },
      null,
      2
    )
  );
  process.exit(1);
});
