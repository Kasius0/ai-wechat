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
const {
  dropRuntimeSessionForWebContents,
  dispatchRuntimeEvent,
  getSessionRuntimeState,
} = require("./modules/runtime/session-state-machine");

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

function runDesktopE2EFlow() {
  const sessionId = String(process.env.DESKTOP_E2E_SESSION || "__desktop_e2e__").trim() || "__desktop_e2e__";
  const steps = ["reset", "session_start", "wechat_normal", "trigger_send", "send_ok", "cooldown_done"];
  logMain({
    module: "main",
    event: "desktop-e2e-flow-start",
    sessionId,
    steps,
  });
  for (const event of steps) {
    const traceId = `desktop-e2e-${event}-${Date.now()}`;
    const result = dispatchRuntimeEvent(event, {
      sessionId,
      traceId,
    });
    if (!result?.ok) {
      logMain({
        module: "main",
        event: "desktop-e2e-flow-fail",
        sessionId,
        step: event,
        result,
      });
      return;
    }
    logMain({
      module: "main",
      event: "desktop-e2e-flow-step",
      sessionId,
      step: event,
      state: result?.data?.state,
      allowedEvents: result?.data?.allowedEvents,
    });
  }
  const snapshot = getSessionRuntimeState(sessionId);
  if (snapshot?.data?.state !== "idle") {
    logMain({
      module: "main",
      event: "desktop-e2e-flow-fail",
      sessionId,
      reason: "final state mismatch",
      expectedState: "idle",
      snapshot,
    });
    return;
  }
  logMain({
    module: "main",
    event: "desktop-e2e-flow-pass",
    sessionId,
    state: snapshot?.data?.state,
    historySize: Array.isArray(snapshot?.data?.history) ? snapshot.data.history.length : 0,
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
  const runtimeEncryptionConfig = {
    enabled: runtimeEncryptionEnabled,
    mode: runtimeEncryptionMode,
    keySource: runtimeEncryptionKey ? "env:RUNTIME_SQLITE_KEY" : "none",
    migrationRequested: runtimeMigrateToSqlcipher,
    migrationKeySource: process.env.RUNTIME_SQLITE_MIGRATE_KEY
      ? "env:RUNTIME_SQLITE_MIGRATE_KEY"
      : (runtimeEncryptionKey ? "env:RUNTIME_SQLITE_KEY" : "none"),
  };

  logMain({
    module: "main",
    event: "runtime-sqlite-encryption-config",
    dbPath: runtimeDbPath,
    config: runtimeEncryptionConfig,
    advisory:
      runtimeMigrateToSqlcipher
        ? "migration mode enabled; disable RUNTIME_SQLITE_MIGRATE_TO_SQLCIPHER after one successful run"
        : "normal startup mode",
  });

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
      dbPath: runtimeDbPath,
      config: runtimeEncryptionConfig,
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

  if (/^(1|true|yes)$/i.test(String(process.env.DESKTOP_E2E_FLOW || ""))) {
    runDesktopE2EFlow();
    app.quit();
    return;
  }

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
