const { contextBridge, ipcRenderer } = require("electron");

/**
 * Optional runtime session key (shared across tabs / windows when set explicitly).
 * Pass on IPC payloads as either `{ sessionId: "my-lab" }` or `{ options: { sessionId: "my-lab" } }`.
 * If omitted, main process uses `wc-<webContents.id>` (per window) or `__default__`.
 * @typedef {{ sessionId?: string, options?: { sessionId?: string } }} RuntimeSessionPayload
 */

contextBridge.exposeInMainWorld("app", {
  ping: () => ipcRenderer.invoke("app:ping"),
  info: () => ipcRenderer.invoke("app:info"),
});

contextBridge.exposeInMainWorld("runtime", {
  /** @param {RuntimeSessionPayload} [payload] */
  state: (payload) => ipcRenderer.invoke("runtime:state", payload),
  /** @param {{ event: string, traceId?: string } & RuntimeSessionPayload} payload */
  event: (payload) => ipcRenderer.invoke("runtime:event", payload),
});

contextBridge.exposeInMainWorld("wechat", {
  /** @param {RuntimeSessionPayload & Record<string, unknown>} [payload] */
  windowContext: (payload) => ipcRenderer.invoke("wechat:window-context", payload),
  /** @param {RuntimeSessionPayload & Record<string, unknown>} [payload] */
  statusDetail: (payload) => ipcRenderer.invoke("wechat:status-detail", payload),
  /** @param {RuntimeSessionPayload & Record<string, unknown>} [payload] */
  statusDetailSimulate: (payload) => ipcRenderer.invoke("wechat:status-detail-simulate", payload),
  /** @param {RuntimeSessionPayload & Record<string, unknown>} [payload] */
  focusWindow: (payload) => ipcRenderer.invoke("wechat:focus-window", payload),
  /** @param {RuntimeSessionPayload & Record<string, unknown>} [payload] */
  quickSend: (payload) => ipcRenderer.invoke("wechat:quick-send", payload),
  /** @param {RuntimeSessionPayload & Record<string, unknown>} [payload] */
  captureWindowIfNormal: (payload) => ipcRenderer.invoke("wechat:capture-window-if-normal", payload),
  /** @param {RuntimeSessionPayload & Record<string, unknown>} [payload] */
  listCaptures: (payload) => ipcRenderer.invoke("wechat:list-captures", payload),
  /** @param {RuntimeSessionPayload & Record<string, unknown>} [payload] */
  cleanupCaptures: (payload) => ipcRenderer.invoke("wechat:cleanup-captures", payload),
  /** @param {RuntimeSessionPayload & Record<string, unknown>} [payload] */
  captureWindowWithSimulate: (payload) => ipcRenderer.invoke("wechat:capture-window-with-simulate", payload),
});

contextBridge.exposeInMainWorld("rpa", {
  mouseMove: (payload) => ipcRenderer.invoke("rpa:mouse-move", payload),
  mouseClick: (payload) => ipcRenderer.invoke("rpa:mouse-click", payload),
  keyboardKey: (payload) => ipcRenderer.invoke("rpa:keyboard-key", payload),
  typeText: (payload) => ipcRenderer.invoke("rpa:type-text", payload),
});
