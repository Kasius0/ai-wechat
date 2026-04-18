const path = require("node:path");
const { app, BrowserWindow } = require("electron");

const { registerIpcHandlers } = require("./ipc");
const { LOG_FILE_PATH, logMain } = require("./logging/main-logger");
const {
  initRuntimeSqlitePersistence,
  closeRuntimeSqlitePersistence,
  getRuntimeSqliteEncryptionStatus,
} = require("./modules/runtime/runtime-sqlite-persistence");
const { dropRuntimeSessionForWebContents } = require("./modules/runtime/session-state-machine");

let mainWindow = null;

app.on("web-contents-created", (_event, webContents) => {
  webContents.once("destroyed", () => {
    dropRuntimeSessionForWebContents(webContents.id);
  });
});

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 980,
    height: 720,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "index.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  registerIpcHandlers();

  mainWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"));

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  const runtimeDbPath = path.join(app.getPath("userData"), "runtime-sessions.sqlite");
  const runtimeEncryptionEnabled = /^(1|true|yes)$/i.test(String(process.env.RUNTIME_SQLITE_ENCRYPTION || ""));
  const runtimeEncryptionMode = runtimeEncryptionEnabled
    ? String(process.env.RUNTIME_SQLITE_ENCRYPTION_MODE || "sqlcipher").trim().toLowerCase()
    : "off";
  const runtimeEncryptionKey = String(process.env.RUNTIME_SQLITE_KEY || "");
  try {
    initRuntimeSqlitePersistence(runtimeDbPath, {
      encryption: {
        enabled: runtimeEncryptionEnabled,
        mode: runtimeEncryptionMode,
        key: runtimeEncryptionKey,
        keySource: runtimeEncryptionKey ? "env:RUNTIME_SQLITE_KEY" : "none",
      },
    });
    const encryption = getRuntimeSqliteEncryptionStatus();
    logMain({
      module: "main",
      event: "runtime-sqlite-ready",
      dbPath: runtimeDbPath,
      encryption,
    });
  } catch (error) {
    logMain({
      module: "main",
      event: "runtime-sqlite-init-failed",
      message: error?.message || String(error),
      name: error?.name,
    });
  }

  logMain({
    module: "main",
    event: "app-ready",
    logFilePath: LOG_FILE_PATH,
    pid: process.pid,
  });
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  // Flushes debounced runtime writes then closes the DB (see runtime-sqlite-persistence).
  closeRuntimeSqlitePersistence();
});
