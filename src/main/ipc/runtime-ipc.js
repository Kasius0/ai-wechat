const { ipcMain } = require("electron");
const { defineHandler } = require("./ipc-utils");
const { IPC_ERROR_CODES } = require("./error-codes");
const { dispatchRuntimeEvent, getSessionRuntimeState } = require("../modules/runtime/session-state-machine");
const { resolveRuntimeSessionIdFromIpc } = require("../modules/runtime/runtime-session-id");

function registerRuntimeIpcHandlers() {
  ipcMain.handle(
    "runtime:state",
    defineHandler(async (event, payload) => {
      const sessionId = resolveRuntimeSessionIdFromIpc(event, payload || {});
      return getSessionRuntimeState(sessionId);
    }, {
      defaultErrorCode: IPC_ERROR_CODES.RUNTIME_STATE_FAILED,
    })
  );

  ipcMain.handle(
    "runtime:event",
    defineHandler(async (event, payload) => {
      const sessionId = resolveRuntimeSessionIdFromIpc(event, payload || {});
      const result = dispatchRuntimeEvent(payload?.event, {
        traceId: payload?.traceId,
        sessionId,
      });
      return result;
    }, {
      defaultErrorCode: IPC_ERROR_CODES.RUNTIME_EVENT_FAILED,
    })
  );
}

module.exports = {
  registerRuntimeIpcHandlers,
};
