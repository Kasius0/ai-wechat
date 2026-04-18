const { dispatchRuntimeEvent, DEFAULT_RUNTIME_SESSION_ID } = require("./session-state-machine");
const { logMain } = require("../../logging/main-logger");

function logDispatchMismatch(traceId, label, result) {
  if (result?.ok) {
    return;
  }
  logMain({
    module: "runtime:quick-send-bridge",
    traceId,
    event: "dispatch-mismatch",
    label,
    code: result?.code,
    message: result?.message,
    data: result?.data,
  });
}

function quickSendRuntimeBegin(traceId, sessionId = DEFAULT_RUNTIME_SESSION_ID) {
  let r = dispatchRuntimeEvent("reset", { traceId, sessionId });
  logDispatchMismatch(traceId, "reset", r);
  r = dispatchRuntimeEvent("session_start", { traceId, sessionId });
  logDispatchMismatch(traceId, "session_start", r);
}

function quickSendRuntimeWechatAbnormal(traceId, sessionId = DEFAULT_RUNTIME_SESSION_ID) {
  const r = dispatchRuntimeEvent("wechat_abnormal", { traceId, sessionId });
  logDispatchMismatch(traceId, "wechat_abnormal", r);
  return r;
}

function quickSendRuntimeWechatNormal(traceId, sessionId = DEFAULT_RUNTIME_SESSION_ID) {
  const r = dispatchRuntimeEvent("wechat_normal", { traceId, sessionId });
  logDispatchMismatch(traceId, "wechat_normal", r);
  return r;
}

function quickSendRuntimeTriggerSend(traceId, sessionId = DEFAULT_RUNTIME_SESSION_ID) {
  const r = dispatchRuntimeEvent("trigger_send", { traceId, sessionId });
  logDispatchMismatch(traceId, "trigger_send", r);
  return r;
}

function quickSendRuntimeSendFail(traceId, sessionId = DEFAULT_RUNTIME_SESSION_ID) {
  const r = dispatchRuntimeEvent("send_fail", { traceId, sessionId });
  logDispatchMismatch(traceId, "send_fail", r);
  return r;
}

function quickSendRuntimeSendComplete(traceId, sessionId = DEFAULT_RUNTIME_SESSION_ID) {
  let r = dispatchRuntimeEvent("send_ok", { traceId, sessionId });
  logDispatchMismatch(traceId, "send_ok", r);
  r = dispatchRuntimeEvent("cooldown_done", { traceId, sessionId });
  logDispatchMismatch(traceId, "cooldown_done", r);
}

module.exports = {
  quickSendRuntimeBegin,
  quickSendRuntimeWechatAbnormal,
  quickSendRuntimeWechatNormal,
  quickSendRuntimeTriggerSend,
  quickSendRuntimeSendFail,
  quickSendRuntimeSendComplete,
};
