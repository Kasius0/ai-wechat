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
  const e2eRendererFlow = /^(1|true|yes)$/i.test(String(process.env.DESKTOP_E2E_RENDERER_FLOW || ""));
  const e2eUiFlow = /^(1|true|yes)$/i.test(String(process.env.DESKTOP_E2E_UI_FLOW || ""));
  mainWindow = new BrowserWindow({
    width: 980,
    height: 720,
    show: !(e2eRendererFlow || e2eUiFlow),
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

async function runDesktopE2EUiFlow() {
  const sessionId = String(process.env.DESKTOP_E2E_SESSION || "__desktop_e2e_ui__").trim() || "__desktop_e2e_ui__";
  logMain({
    module: "main",
    event: "desktop-e2e-ui-start",
    sessionId,
  });
  if (!mainWindow || mainWindow.isDestroyed()) {
    logMain({
      module: "main",
      event: "desktop-e2e-ui-fail",
      reason: "mainWindow is unavailable",
      sessionId,
    });
    return;
  }
  try {
    const result = await mainWindow.webContents.executeJavaScript(
      `(async () => {
        const sid = ${JSON.stringify(sessionId)};
        function sleep(ms) {
          return new Promise((resolve) => setTimeout(resolve, ms));
        }
        function mustGet(id) {
          const el = document.getElementById(id);
          if (!el) {
            throw new Error("missing element: " + id);
          }
          return el;
        }
        async function click(id) {
          const el = mustGet(id);
          el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
          await sleep(100);
        }
        async function typeInto(id, text) {
          const el = mustGet(id);
          el.focus();
          el.value = "";
          for (const ch of String(text)) {
            el.dispatchEvent(new KeyboardEvent("keydown", { key: ch, bubbles: true }));
            el.value += ch;
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new KeyboardEvent("keyup", { key: ch, bubbles: true }));
            await sleep(10);
          }
          el.dispatchEvent(new Event("change", { bubbles: true }));
          await sleep(50);
        }
        // Force the renderer handlers to use one deterministic session across all UI clicks.
        const originalRuntimeState = window.runtime?.state;
        const originalRuntimeEvent = window.runtime?.event;
        const originalWechatList = window.wechat?.listCaptures;
        if (!originalRuntimeState || !originalRuntimeEvent || !originalWechatList) {
          throw new Error("required preload APIs unavailable");
        }
        window.runtime.state = (payload = {}) => originalRuntimeState({ ...payload, sessionId: sid });
        window.runtime.event = (payload = {}) => originalRuntimeEvent({ ...payload, sessionId: sid });
        window.wechat.listCaptures = (payload = {}) => originalWechatList({ ...payload, sessionId: sid });

        await click("btnRuntimeReset");
        await click("btnRuntimeSessionStart");
        await click("btnRuntimeWechatNormal");
        await click("btnRuntimeTriggerSend");
        await click("btnRuntimeSendOk");
        await click("btnRuntimeCooldownDone");
        await typeInto("typeTextValue", "desktop-e2e-ui-typed");
        await click("btnWechatListCaptures");
        await click("btnRuntimeState");

        const outputText = String(mustGet("output")?.textContent || "");
        const finalSnapshot = await window.runtime.state({ sessionId: sid });
        return {
          ok: finalSnapshot?.ok === true && finalSnapshot?.data?.state === "idle",
          sessionId: sid,
          finalState: finalSnapshot?.data?.state || null,
          typedText: mustGet("typeTextValue").value,
          outputLength: outputText.length,
        };
      })()`,
      true
    );
    if (!result?.ok) {
      logMain({
        module: "main",
        event: "desktop-e2e-ui-fail",
        sessionId,
        result,
      });
      return;
    }
    logMain({
      module: "main",
      event: "desktop-e2e-ui-pass",
      sessionId,
      finalState: result?.finalState,
      typedText: result?.typedText,
    });
  } catch (error) {
    logMain({
      module: "main",
      event: "desktop-e2e-ui-fail",
      sessionId,
      message: error?.message || String(error),
      name: error?.name,
    });
  }
}

async function runDesktopE2ERendererFlow() {
  const sessionId = String(process.env.DESKTOP_E2E_SESSION || "__desktop_e2e_renderer__").trim()
    || "__desktop_e2e_renderer__";
  logMain({
    module: "main",
    event: "desktop-e2e-renderer-flow-start",
    sessionId,
  });
  if (!mainWindow || mainWindow.isDestroyed()) {
    logMain({
      module: "main",
      event: "desktop-e2e-renderer-flow-fail",
      reason: "mainWindow is unavailable",
      sessionId,
    });
    return;
  }
  try {
    const result = await mainWindow.webContents.executeJavaScript(
      `(async () => {
        const sid = ${JSON.stringify(sessionId)};
        const steps = [];
        async function run(name, fn) {
          const res = await fn();
          steps.push({ name, ok: !!res?.ok, code: res?.code || null, state: res?.data?.state || null });
          return res;
        }
        const state0 = await run("runtime.state", () => window.runtime.state({ sessionId: sid }));
        const reset = await run("runtime.reset", () => window.runtime.event({ sessionId: sid, event: "reset" }));
        const s1 = await run("runtime.session_start", () => window.runtime.event({ sessionId: sid, event: "session_start" }));
        const s2 = await run("runtime.wechat_normal", () => window.runtime.event({ sessionId: sid, event: "wechat_normal" }));
        const s3 = await run("runtime.trigger_send", () => window.runtime.event({ sessionId: sid, event: "trigger_send" }));
        const s4 = await run("runtime.send_ok", () => window.runtime.event({ sessionId: sid, event: "send_ok" }));
        const s5 = await run("runtime.cooldown_done", () => window.runtime.event({ sessionId: sid, event: "cooldown_done" }));
        const wechatList = await run("wechat.list_captures", () => window.wechat.listCaptures({ sessionId: sid, limit: 1 }));
        const finalState = await run("runtime.state.final", () => window.runtime.state({ sessionId: sid }));
        const allOk = [state0, reset, s1, s2, s3, s4, s5, wechatList, finalState].every((r) => r && r.ok === true);
        const finalIdle = finalState?.data?.state === "idle";
        const wechatHasRuntime = !!wechatList?.data?.runtime;
        return {
          ok: allOk && finalIdle && wechatHasRuntime,
          allOk,
          finalIdle,
          wechatHasRuntime,
          sessionId: sid,
          finalState: finalState?.data?.state || null,
          steps,
        };
      })()`,
      true
    );
    if (!result?.ok) {
      logMain({
        module: "main",
        event: "desktop-e2e-renderer-flow-fail",
        sessionId,
        result,
      });
      return;
    }
    logMain({
      module: "main",
      event: "desktop-e2e-renderer-flow-pass",
      sessionId,
      finalState: result?.finalState,
      stepCount: Array.isArray(result?.steps) ? result.steps.length : 0,
    });
  } catch (error) {
    logMain({
      module: "main",
      event: "desktop-e2e-renderer-flow-fail",
      sessionId,
      message: error?.message || String(error),
      name: error?.name,
    });
  }
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
  if (
    runtimeEncryptionEnabled &&
    runtimeEncryptionConfig.keySource === "env:RUNTIME_SQLITE_KEY" &&
    String(process.env.NODE_ENV || "").trim().toLowerCase() === "production"
  ) {
    logMain({
      module: "main",
      event: "runtime-sqlite-key-governance-warning",
      dbPath: runtimeDbPath,
      severity: "warning",
      reason: "production runtime key is sourced directly from process env",
      advisory:
        "for production, prefer secret manager injection with rotation controls instead of long-lived plain env values",
    });
  }

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

  if (/^(1|true|yes)$/i.test(String(process.env.DESKTOP_E2E_RENDERER_FLOW || ""))) {
    mainWindow.webContents.once("did-finish-load", async () => {
      await runDesktopE2ERendererFlow();
      app.quit();
    });
    return;
  }
  if (/^(1|true|yes)$/i.test(String(process.env.DESKTOP_E2E_UI_FLOW || ""))) {
    mainWindow.webContents.once("did-finish-load", async () => {
      await runDesktopE2EUiFlow();
      app.quit();
    });
    return;
  }

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
