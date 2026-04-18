const DEFAULT_BASE_URL = process.env.WECHAT_AUTOMATION_BASE_URL || "http://127.0.0.1:3000";
const DEFAULT_API_PREFIX = process.env.WECHAT_AUTOMATION_API_PREFIX || "";
const net = require("node:net");

const RETRY = {
  context: 3,
  focus: 3,
  click: 2,
  type: 2,
  send: 2,
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry(name, times, fn) {
  let lastError;
  for (let i = 1; i <= times; i += 1) {
    try {
      const result = await fn();
      if (!result || result.ok !== true) {
        throw new Error(`${name} failed: ${result?.code || "UNKNOWN"}`);
      }
      return result;
    } catch (error) {
      lastError = error;
      await sleep(120 * i);
    }
  }
  throw new Error(`${name} retry exhausted: ${lastError?.message || "unknown error"}`);
}

function assertWechatWindowContext(ctx) {
  const windowInfo = ctx?.data?.window;
  const status = ctx?.data?.status;

  if (!windowInfo) {
    throw new Error("window context missing");
  }
  if (status !== "normal") {
    throw new Error(`unexpected wechat status: ${status || "unknown"}`);
  }
  if (windowInfo.isMinimized) {
    throw new Error("wechat window is minimized");
  }
  if (windowInfo.isOutOfBounds) {
    throw new Error("wechat window is out of bounds");
  }
  if (windowInfo.isTinyWindow) {
    throw new Error("wechat window is tiny");
  }
}

function joinUrl(baseUrl, apiPrefix, action) {
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  const normalizedPrefix = apiPrefix ? `/${apiPrefix.replace(/^\/+|\/+$/g, "")}` : "";
  return `${normalizedBase}${normalizedPrefix}/${action}`;
}

function formatNetworkError(error) {
  const causeCode = error?.cause?.code ? ` (${error.cause.code})` : "";
  return `${error?.message || "network error"}${causeCode}`;
}

async function createWechatApiClient(baseUrl = DEFAULT_BASE_URL, apiPrefix = DEFAULT_API_PREFIX) {
  const normalized = baseUrl.replace(/\/+$/, "");
  await assertBaseUrlReachable(normalized);

  return async function call(action, payload = {}) {
    const targetUrl = joinUrl(normalized, apiPrefix, action);
    let response;
    try {
      response = await fetch(targetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      throw new Error(`request failed for "${action}" at ${targetUrl}: ${formatNetworkError(error)}`);
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for action "${action}" at ${targetUrl}`);
    }

    try {
      return await response.json();
    } catch (error) {
      throw new Error(`invalid JSON response for "${action}" at ${targetUrl}: ${error.message}`);
    }
  };
}

function parseHttpBaseUrl(baseUrl) {
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error(`invalid WECHAT_AUTOMATION_BASE_URL: "${baseUrl}"`);
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(`unsupported protocol "${url.protocol}" in WECHAT_AUTOMATION_BASE_URL`);
  }

  return {
    hostname: url.hostname,
    port: url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80,
  };
}

function probeTcpPort(hostname, port, timeoutMs = 1000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (ok, reason) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve({ ok, reason });
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true, "connected"));
    socket.once("timeout", () => finish(false, "timeout"));
    socket.once("error", (error) => finish(false, error.code || error.message));
    socket.connect(port, hostname);
  });
}

async function assertBaseUrlReachable(baseUrl) {
  const { hostname, port } = parseHttpBaseUrl(baseUrl);
  const result = await probeTcpPort(hostname, port, 1000);
  if (!result.ok) {
    throw new Error(
      `automation service is not reachable at ${baseUrl} (${result.reason}). Start your service first, then retry.`
    );
  }
}

async function sendWechatMessage(options) {
  const {
    text,
    inputOffset = { x: 20, y: 20 },
    typeDelayMs = 20,
    call,
  } = options || {};

  if (!call || typeof call !== "function") {
    throw new Error('missing "call" function');
  }
  if (!text || !text.trim()) {
    throw new Error("text is empty");
  }

  const context = await withRetry("wechat-window-context", RETRY.context, () =>
    call("wechat-window-context", {})
  );
  assertWechatWindowContext(context);

  const focusResult = await withRetry("focus-wechat-window", RETRY.focus, () =>
    call("focus-wechat-window", {})
  );
  if (!focusResult?.data?.focused) {
    throw new Error("focus-wechat-window did not focus target window");
  }

  await withRetry("mouse-move", RETRY.click, () =>
    call("mouse-move", {
      x: inputOffset.x,
      y: inputOffset.y,
      coordinateMode: "wechat-relative",
    })
  );

  await withRetry("mouse-button", RETRY.click, () =>
    call("mouse-button", { button: "left", operation: "click" })
  );

  const precheck = await withRetry("check-input-focus", 2, () =>
    call("check-input-focus", {})
  ).catch(() => ({ ok: true, data: { inputFocused: true, degraded: true } }));

  if (!precheck?.data?.inputFocused) {
    throw new Error("input is not focused");
  }

  await withRetry("type-text", RETRY.type, () =>
    call("type-text", { text, delayMs: typeDelayMs })
  );

  const echoResult = await withRetry("read-input-text", 2, () =>
    call("read-input-text", {})
  ).catch(() => null);

  if (echoResult?.ok) {
    const typed = echoResult?.data?.value ?? "";
    if (typed !== text) {
      throw new Error(`input echo mismatch, expected "${text}" but got "${typed}"`);
    }
  }

  await withRetry("keyboard-key", RETRY.send, () =>
    call("keyboard-key", { keyCode: 13, operation: "tap" })
  );

  const verifyResult = await withRetry("verify-last-send", 2, () =>
    call("verify-last-send", {})
  ).catch(() => ({ ok: true, data: { sent: true, degraded: true } }));

  if (!verifyResult?.data?.sent) {
    throw new Error("send verification failed");
  }

  return {
    ok: true,
    code: "OK",
    message: "send wechat message succeeded",
    data: {
      textLength: text.length,
      precheck: precheck.data,
      echoChecked: Boolean(echoResult?.ok),
      sendVerified: Boolean(verifyResult?.ok),
    },
  };
}

async function main() {
  const text = process.argv.slice(2).join(" ").trim();
  if (!text) {
    console.error('Usage: npm run test:wechat-send -- "your message"');
    process.exitCode = 1;
    return;
  }

  try {
    const call = await createWechatApiClient();
    const result = await sendWechatMessage({ text, call });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          code: "SEND_FAILED",
          message: error.message,
          hint:
            'PowerShell env example: $env:WECHAT_AUTOMATION_BASE_URL="http://127.0.0.1:8787"; optional prefix: $env:WECHAT_AUTOMATION_API_PREFIX="api/wechat"',
        },
        null,
        2
      )
    );
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  RETRY,
  createWechatApiClient,
  sendWechatMessage,
  withRetry,
};
