const { app, ipcMain } = require("electron");
const { defineHandler, ok } = require("./ipc-utils");
const { IPC_ERROR_CODES } = require("./error-codes");

function registerAppIpcHandlers() {
  ipcMain.handle(
    "app:ping",
    defineHandler(async () => ok("pong", { ts: Date.now() }), {
      defaultErrorCode: IPC_ERROR_CODES.APP_PING_FAILED,
    })
  );

  ipcMain.handle(
    "app:info",
    defineHandler(
      async () =>
        ok("app info succeeded", {
          version: app.getVersion(),
          platform: process.platform,
          arch: process.arch,
        }),
      {
        defaultErrorCode: IPC_ERROR_CODES.APP_INFO_FAILED,
      }
    )
  );
}

module.exports = {
  registerAppIpcHandlers,
};

