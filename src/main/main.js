const path = require("node:path");
const { app, BrowserWindow } = require("electron");

const { registerIpcHandlers } = require("./ipc");
const { LOG_FILE_PATH, logMain } = require("./logging/main-logger");
const {
  initRuntimeSqlitePersistence,
  closeRuntimeSqlitePersistence,
  getRuntimeSqliteEncryptionStatus,
  migrateRuntimeSqliteToSqlcipher,
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
  const runtimeMigrateToSqlcipher = /^(1|true|yes)$/i.test(
    String(process.env.RUNTIME_SQLITE_MIGRATE_TO_SQLCIPHER || "")
  );
  const runtimeMigrateKey = String(
    process.env.RUNTIME_SQLITE_MIGRATE_KEY || process.env.RUNTIME_SQLITE_KEY || ""
  );
  try {
    initRuntimeSqlitePersistence(runtimeDbPath, {
      encryption: {
        enabled: runtimeEncryptionEnabled,
        mode: runtimeEncryptionMode,
        key: runtimeEncryptionKey,
        keySource: runtimeEncryptionKey ? "env:RUNTIME_SQLITE_KEY" : "none",
      },
    });
    let encryption = getRuntimeSqliteEncryptionStatus();
    if (runtimeMigrateToSqlcipher) {
      if (encryption.enabled && encryption.mode === "sqlcipher") {
        logMain({
          module: "main",
          event: "runtime-sqlite-encryption-migrate-skipped",
          dbPath: runtimeDbPath,
          reason: "database already encrypted",
          encryption,
        });
      } else if (!runtimeMigrateKey.trim()) {
        logMain({
          module: "main",
          event: "runtime-sqlite-encryption-migrate-skipped",
          dbPath: runtimeDbPath,
          reason: "missing migration key",
        });
      } else {
        try {
          migrateRuntimeSqliteToSqlcipher(runtimeMigrateKey);
          encryption = getRuntimeSqliteEncryptionStatus();
          logMain({
            module: "main",
            event: "runtime-sqlite-encryption-migrated",
            dbPath: runtimeDbPath,
            encryption,
          });
        } catch (migrationError) {
          logMain({
            module: "main",
            event: "runtime-sqlite-encryption-migrate-failed",
            dbPath: runtimeDbPath,
            message: migrationError?.message || String(migrationError),
            name: migrationError?.name,
          });
        }
      }
    }
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
