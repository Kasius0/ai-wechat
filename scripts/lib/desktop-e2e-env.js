"use strict";

function buildDesktopE2EEnv(baseEnv, options) {
  const { runtimeKey, modeConfig } = options || {};
  const env = { ...(baseEnv || {}) };

  // GitHub Actions / many Linux containers: Chromium SUID sandbox is misconfigured (see chrome-sandbox 4755).
  // Must be set before Electron spawns zygote; complements main.js appendSwitch("no-sandbox").
  if (/^(1|true|yes)$/i.test(String(env.GITHUB_ACTIONS || ""))) {
    env.ELECTRON_DISABLE_SANDBOX = "1";
  }

  if (runtimeKey) {
    env.RUNTIME_SQLITE_ENCRYPTION = "1";
    env.RUNTIME_SQLITE_ENCRYPTION_MODE = "sqlcipher";
    env.RUNTIME_SQLITE_KEY = runtimeKey;
  }

  if (modeConfig?.envFlag) {
    env[modeConfig.envFlag] = "1";
  }

  return env;
}

module.exports = {
  buildDesktopE2EEnv,
};

