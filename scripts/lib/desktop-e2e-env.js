"use strict";

function buildDesktopE2EEnv(baseEnv, options) {
  const { runtimeKey, modeConfig } = options || {};
  const env = { ...(baseEnv || {}) };

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

