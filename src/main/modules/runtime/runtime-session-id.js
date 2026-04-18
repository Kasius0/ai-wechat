const { DEFAULT_RUNTIME_SESSION_ID } = require("./session-state-machine");

const MAX_SESSION_ID_LEN = 128;

/**
 * Resolves which runtime state-machine bucket an IPC call uses.
 *
 * Order: (1) explicit `payload.sessionId` / `payload.options.sessionId`
 *         (2) `webContents.id` from the invoke sender → `wc-<id>`
 *         (3) {@link DEFAULT_RUNTIME_SESSION_ID} (unit tests / main-only callers)
 */
function resolveRuntimeSessionIdFromIpc(ipcMainEvent, payload = {}) {
  const explicit =
    (payload && (payload.sessionId || payload.options?.sessionId)) ||
    (typeof payload === "object" && payload !== null ? payload.sessionId : null);
  const trimmed = explicit != null ? String(explicit).trim() : "";
  if (trimmed) {
    return trimmed.slice(0, MAX_SESSION_ID_LEN);
  }
  const sender = ipcMainEvent && ipcMainEvent.sender;
  const wcId = sender && typeof sender.id === "number" ? sender.id : null;
  if (wcId != null) {
    return `wc-${wcId}`;
  }
  return DEFAULT_RUNTIME_SESSION_ID;
}

module.exports = {
  resolveRuntimeSessionIdFromIpc,
};
