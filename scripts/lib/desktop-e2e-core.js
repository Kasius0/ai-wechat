"use strict";

const {
  listDesktopE2EModes,
  getDesktopE2EModeConfig,
  createDesktopE2ESeenState,
} = require("./desktop-e2e-mode-config");
const { buildDesktopE2EEnv } = require("./desktop-e2e-env");
const { evaluateDesktopE2ELog } = require("./desktop-e2e-log-evaluator");

function resolveDesktopE2EContext(options) {
  const { mode, runtimeKey, baseEnv } = options || {};
  const modeConfig = getDesktopE2EModeConfig(mode);
  if (!modeConfig) {
    return {
      ok: false,
      usageModes: listDesktopE2EModes(),
      message: "invalid desktop e2e mode",
    };
  }
  const seen = createDesktopE2ESeenState();
  const env = buildDesktopE2EEnv(baseEnv, { runtimeKey, modeConfig });
  return {
    ok: true,
    mode: String(mode || "").trim().toLowerCase(),
    runtimeKey: String(runtimeKey || ""),
    modeConfig,
    seen,
    env,
  };
}

function createDesktopE2ELogHandler(context) {
  return function onJsonLogLine(payload, finish) {
    const result = evaluateDesktopE2ELog(payload, {
      seen: context.seen,
      modeConfig: context.modeConfig,
      runtimeKey: context.runtimeKey,
    });
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
  resolveDesktopE2EContext,
  createDesktopE2ELogHandler,
};

