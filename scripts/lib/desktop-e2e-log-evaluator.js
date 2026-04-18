"use strict";

function evaluateDesktopE2ELog(payload, context) {
  const { seen, modeConfig, runtimeKey } = context;
  const event = payload?.event;

  if (event === "runtime-sqlite-init-failed") {
    return {
      status: "fail",
      message: payload?.message || "runtime sqlite init failed.",
    };
  }

  if (event === "runtime-sqlite-encryption-config") {
    seen.encryptionConfig = true;
  }

  if (event === "runtime-sqlite-ready") {
    if (runtimeKey) {
      const encryptionOk = payload?.encryption?.enabled === true && payload?.encryption?.mode === "sqlcipher";
      if (!encryptionOk) {
        return {
          status: "fail",
          message: "encrypted mode expected but runtime-sqlite-ready is not sqlcipher.",
        };
      }
    }
    seen.sqliteReady = true;
  }

  if (event === "app-ready") {
    seen.appReady = true;
  }

  if (modeConfig.passSeenKey && event === modeConfig.passEvent) {
    seen[modeConfig.passSeenKey] = true;
  }

  if (modeConfig.failEvent && event === modeConfig.failEvent) {
    return {
      status: "fail",
      message: payload?.reason || payload?.message || modeConfig.failFallbackMessage,
    };
  }

  const startupReady = seen.encryptionConfig && seen.sqliteReady && seen.appReady;
  const modeReady = !modeConfig.passSeenKey || seen[modeConfig.passSeenKey];
  if (startupReady && modeReady) {
    return {
      status: "pass",
      message: modeConfig.passMessage,
    };
  }

  return { status: "continue" };
}

module.exports = {
  evaluateDesktopE2ELog,
};

