const { IPC_ERROR_CODES } = require("./error-codes");
const {
  getRuntimeSnapshot,
  DEFAULT_RUNTIME_SESSION_ID,
} = require("../modules/runtime/session-state-machine");
const { enrichWechatIpcResultWithRuntime } = require("../modules/runtime/enrich-wechat-ipc-result");

function ok(message, data = {}) {
  return {
    ok: true,
    code: "OK",
    message,
    data,
  };
}

function fail(code, message, data = {}) {
  return {
    ok: false,
    code,
    message,
    data,
  };
}

function defineHandler(
  fn,
  {
    defaultErrorCode = IPC_ERROR_CODES.IPC_HANDLER_FAILED,
    attachRuntimeOnError = false,
    resolveRuntimeSessionId = null,
  } = {}
) {
  return async (...args) => {
    try {
      const result = await fn(...args);
      return result;
    } catch (error) {
      const base = fail(defaultErrorCode, error?.message || "unknown error", {
        name: error?.name,
      });
      if (!attachRuntimeOnError) {
        return base;
      }
      const sessionId = resolveRuntimeSessionId
        ? resolveRuntimeSessionId(args)
        : DEFAULT_RUNTIME_SESSION_ID;
      return enrichWechatIpcResultWithRuntime(base, getRuntimeSnapshot(sessionId));
    }
  };
}

module.exports = {
  ok,
  fail,
  defineHandler,
};
