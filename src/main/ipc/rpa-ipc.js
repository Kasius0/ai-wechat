const { ipcMain } = require("electron");
const { defineHandler } = require("./ipc-utils");
const { IPC_ERROR_CODES } = require("./error-codes");
const { getWechatWindowContext } = require("../modules/wechat-status/get-wechat-window-context");
const { mouseMoveScreen, mouseClick } = require("../modules/rpa/mouse");
const { keyboardKeyTap, typeText } = require("../modules/rpa/keyboard");

function registerRpaIpcHandlers() {
  ipcMain.handle(
    "rpa:mouse-move",
    defineHandler(
      async (_event, payload) => {
        const { x, y, coordinateMode } = payload || {};

        if (coordinateMode === "wechat-relative") {
          const ctx = getWechatWindowContext();
          if (!ctx?.ok) {
            return ctx;
          }
          const rect = ctx?.data?.window?.rect;
          if (!rect) {
            throw new Error("wechat window rect missing");
          }
          return mouseMoveScreen({ x: rect.left + Number(x || 0), y: rect.top + Number(y || 0) });
        }

        return mouseMoveScreen({ x, y });
      },
      {
        defaultErrorCode: IPC_ERROR_CODES.RPA_MOUSE_MOVE_FAILED,
      }
    )
  );

  ipcMain.handle(
    "rpa:mouse-click",
    defineHandler(
      async (_event, payload) => {
        const { button } = payload || {};
        return mouseClick({ button });
      },
      {
        defaultErrorCode: IPC_ERROR_CODES.RPA_MOUSE_CLICK_FAILED,
      }
    )
  );

  ipcMain.handle(
    "rpa:keyboard-key",
    defineHandler(
      async (_event, payload) => {
        const { keyCode } = payload || {};
        return keyboardKeyTap({ keyCode });
      },
      {
        defaultErrorCode: IPC_ERROR_CODES.RPA_KEYBOARD_KEY_FAILED,
      }
    )
  );

  ipcMain.handle(
    "rpa:type-text",
    defineHandler(
      async (_event, payload) => {
        const { text, delayMs } = payload || {};
        return typeText({ text, delayMs });
      },
      {
        defaultErrorCode: IPC_ERROR_CODES.RPA_TYPE_TEXT_FAILED,
      }
    )
  );
}

module.exports = {
  registerRpaIpcHandlers,
};

