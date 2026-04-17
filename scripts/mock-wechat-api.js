const http = require("node:http");

const PORT = Number(process.env.WECHAT_AUTOMATION_PORT || 8787);
const HOST = process.env.WECHAT_AUTOMATION_HOST || "127.0.0.1";
const API_PREFIX = (process.env.WECHAT_AUTOMATION_API_PREFIX || "api/wechat").replace(/^\/+|\/+$/g, "");

const state = {
  focused: false,
  inputFocused: false,
  inputText: "",
  lastSentMessage: "",
  handle: 3016628,
  processId: 14000,
};

function json(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(payload));
}

function parsePathname(pathname) {
  if (!pathname) {
    return "";
  }
  const clean = pathname.replace(/^\/+|\/+$/g, "");
  if (clean.startsWith(`${API_PREFIX}/`)) {
    return clean.slice(API_PREFIX.length + 1);
  }
  return clean;
}

function ok(message, data = {}) {
  return { ok: true, code: "OK", message, data };
}

function collectBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk.toString("utf8");
    });
    req.on("end", () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error(`invalid JSON body: ${error.message}`));
      }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method !== "POST") {
    json(res, 405, { ok: false, code: "METHOD_NOT_ALLOWED", message: "Use POST" });
    return;
  }

  const action = parsePathname(new URL(req.url, `http://${req.headers.host}`).pathname);
  let body;
  try {
    body = await collectBody(req);
  } catch (error) {
    json(res, 400, { ok: false, code: "BAD_JSON", message: error.message });
    return;
  }

  switch (action) {
    case "wechat-window-context":
      json(
        res,
        200,
        ok("wechat window context succeeded", {
          status: "normal",
          errorCode: "WECHAT_STATUS_OK",
          window: {
            processId: state.processId,
            processName: "Weixin",
            title: "微信",
            handle: state.handle,
            rect: {
              left: 1273,
              top: 0,
              right: 2567,
              bottom: 703,
              width: 1294,
              height: 703,
            },
            placementShowCmd: 1,
            isMinimized: false,
            isOutOfBounds: false,
            isTinyWindow: false,
            isTitleEmpty: false,
          },
        })
      );
      return;

    case "focus-wechat-window":
      state.focused = true;
      json(
        res,
        200,
        ok("focus wechat window succeeded", {
          focused: true,
          handle: state.handle,
        })
      );
      return;

    case "mouse-move":
      json(
        res,
        200,
        ok("mouse move succeeded", {
          action: "mouse-move",
          x: body.x ?? 0,
          y: body.y ?? 0,
          coordinateMode: body.coordinateMode || "wechat-relative",
          focusedWechat: state.focused,
        })
      );
      return;

    case "mouse-button":
      state.inputFocused = state.focused;
      json(
        res,
        200,
        ok("mouse button succeeded", {
          action: "mouse-button",
          button: body.button || "left",
          operation: body.operation || "click",
          focusedWechat: state.focused,
        })
      );
      return;

    case "check-input-focus":
      json(res, 200, ok("check input focus succeeded", { inputFocused: state.inputFocused }));
      return;

    case "type-text":
      if (!state.inputFocused) {
        json(res, 200, { ok: false, code: "INPUT_NOT_FOCUSED", message: "input is not focused", data: {} });
        return;
      }
      state.inputText = String(body.text || "");
      json(
        res,
        200,
        ok("type text succeeded", {
          length: state.inputText.length,
          delayMs: Number(body.delayMs || 20),
          focusedWechat: state.focused,
        })
      );
      return;

    case "read-input-text":
      json(res, 200, ok("read input text succeeded", { value: state.inputText }));
      return;

    case "keyboard-key":
      if (Number(body.keyCode) === 13 && state.inputText) {
        state.lastSentMessage = state.inputText;
        state.inputText = "";
      }
      json(
        res,
        200,
        ok("keyboard key succeeded", {
          keyCode: Number(body.keyCode || 0),
          operation: body.operation || "tap",
          focusedWechat: state.focused,
        })
      );
      return;

    case "verify-last-send":
      json(
        res,
        200,
        ok("verify last send succeeded", {
          sent: Boolean(state.lastSentMessage),
          lastMessage: state.lastSentMessage,
        })
      );
      return;

    default:
      json(res, 404, { ok: false, code: "NOT_FOUND", message: `Unknown action: ${action}` });
  }
});

server.listen(PORT, HOST, () => {
  console.log(
    JSON.stringify(
      {
        ok: true,
        code: "SERVER_READY",
        message: "mock wechat automation api started",
        data: {
          host: HOST,
          port: PORT,
          baseUrl: `http://${HOST}:${PORT}`,
          apiPrefix: API_PREFIX,
          routePattern: `/${API_PREFIX}/:action or /:action`,
        },
      },
      null,
      2
    )
  );
});
