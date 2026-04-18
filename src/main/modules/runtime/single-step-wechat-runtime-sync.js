const {
  dispatchRuntimeEvent,
  getRuntimeSnapshot,
  RUNTIME_STATES,
  DEFAULT_RUNTIME_SESSION_ID,
} = require("./session-state-machine");
const { logMain } = require("../../logging/main-logger");

function logDispatchMismatch(traceId, label, result) {
  if (result?.ok) {
    return;
  }
  logMain({
    module: "runtime:wechat-single-step",
    traceId,
    event: "dispatch-mismatch",
    label,
    code: result?.code,
    message: result?.message,
    data: result?.data,
  });
}

function normalizeTraceIdForWechatIpc(payload, fallbackPrefix) {
  const raw = payload && (payload.traceId || payload.options?.traceId);
  const t = String(raw || "").trim();
  if (t) {
    return t;
  }
  return `${fallbackPrefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function isAwaitingContext(sessionId = DEFAULT_RUNTIME_SESSION_ID) {
  return getRuntimeSnapshot(sessionId).state === RUNTIME_STATES.AWAITING_CONTEXT;
}

/**
 * 与 quick-send 点击后 `getWechatStatusDetail` 一致：仅在 awaiting_context 时，
 * 根据 status-like 结果派发 wechat_normal / wechat_abnormal。
 */
function syncRuntimeFromWechatStatusLikeResult(
  result,
  traceId,
  label,
  sessionId = DEFAULT_RUNTIME_SESSION_ID
) {
  if (!isAwaitingContext(sessionId)) {
    return;
  }
  const isNormal = result?.ok === true && result?.data?.status === "normal";
  const event = isNormal ? "wechat_normal" : "wechat_abnormal";
  const r = dispatchRuntimeEvent(event, { traceId, sessionId });
  logDispatchMismatch(traceId, `${label}:${event}`, r);
}

function syncRuntimeAbnormalIfAwaitingContext(
  traceId,
  label,
  sessionId = DEFAULT_RUNTIME_SESSION_ID
) {
  if (!isAwaitingContext(sessionId)) {
    return;
  }
  const r = dispatchRuntimeEvent("wechat_abnormal", { traceId, sessionId });
  logDispatchMismatch(traceId, `${label}:wechat_abnormal`, r);
}

/** 已确认可截图（normal）且截图成功：从 awaiting_context 进入 ready_to_reply。 */
function syncRuntimeWechatNormalAfterCaptureOk(
  traceId,
  label,
  sessionId = DEFAULT_RUNTIME_SESSION_ID
) {
  if (!isAwaitingContext(sessionId)) {
    return;
  }
  const r = dispatchRuntimeEvent("wechat_normal", { traceId, sessionId });
  logDispatchMismatch(traceId, `${label}:wechat_normal`, r);
}

module.exports = {
  normalizeTraceIdForWechatIpc,
  syncRuntimeFromWechatStatusLikeResult,
  syncRuntimeAbnormalIfAwaitingContext,
  syncRuntimeWechatNormalAfterCaptureOk,
};
