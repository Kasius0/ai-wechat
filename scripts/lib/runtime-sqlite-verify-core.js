"use strict";

const { evaluateRuntimeSqliteVerifyLog } = require("./runtime-sqlite-verify-evaluator");

const VERIFY_MODES = ["encrypted-start", "wrong-key-fail"];

function resolveRuntimeSqliteVerifyContext(options) {
  const { mode, runtimeKey, baseEnv } = options || {};
  const normalizedMode = String(mode || "").trim();
  const normalizedRuntimeKey = String(runtimeKey || "").trim();

  if (!VERIFY_MODES.includes(normalizedMode)) {
    return {
      ok: false,
      usageModes: VERIFY_MODES,
      message: "invalid verify mode",
    };
  }
  if (!normalizedRuntimeKey) {
    return {
      ok: false,
      usageModes: VERIFY_MODES,
      message: "missing RUNTIME_SQLITE_KEY.",
    };
  }

  const env = {
    ...(baseEnv || {}),
    RUNTIME_SQLITE_ENCRYPTION: "1",
    RUNTIME_SQLITE_ENCRYPTION_MODE: "sqlcipher",
    RUNTIME_SQLITE_KEY: normalizedRuntimeKey,
  };

  return {
    ok: true,
    mode: normalizedMode,
    runtimeKey: normalizedRuntimeKey,
    env,
  };
}

function createRuntimeSqliteVerifyLogHandler(context) {
  return function onJsonLogLine(payload, finish) {
    const result = evaluateRuntimeSqliteVerifyLog(payload, context);
    if (result.status === "fail") {
      finish(false, result.message);
      return;
    }
    if (result.status === "pass") {
      finish(true, result.message);
    }
  };
}

module.exports = {
  VERIFY_MODES,
  resolveRuntimeSqliteVerifyContext,
  createRuntimeSqliteVerifyLogHandler,
};

