/**
 * 从 IPC JSON 解析结果中取出用于 Dev 输出区底部高亮的块（纯函数，无 DOM）。
 * @param {object|null|undefined} parsed JSON.parse 后的对象
 * @returns {{ label: string, payload: object } | null}
 */
function getRuntimeHighlightBlock(parsed) {
  const d = parsed?.data;
  if (!d || typeof d !== "object") {
    return null;
  }
  if (d.runtime != null && typeof d.runtime === "object" && !Array.isArray(d.runtime)) {
    return { label: "data.runtime", payload: d.runtime };
  }
  if (
    typeof d.state === "string" &&
    Array.isArray(d.allowedEvents) &&
    d.runtime === undefined &&
    d.action !== "wechat-quick-send"
  ) {
    const payload = {
      state: d.state,
      allowedEvents: d.allowedEvents,
    };
    if ("lastTraceId" in d) {
      payload.lastTraceId = d.lastTraceId;
    }
    if ("lastError" in d) {
      payload.lastError = d.lastError;
    }
    if ("from" in d) {
      payload.from = d.from;
    }
    if ("event" in d) {
      payload.event = d.event;
    }
    if ("sessionId" in d) {
      payload.sessionId = d.sessionId;
    }
    return { label: "运行时快照", payload };
  }
  return null;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { getRuntimeHighlightBlock };
}

if (typeof globalThis !== "undefined") {
  globalThis.getRuntimeHighlightBlock = getRuntimeHighlightBlock;
}
