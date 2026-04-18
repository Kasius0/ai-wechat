"use strict";

function readPositionalArg(argv, index, fallback = "") {
  const list = Array.isArray(argv) ? argv : [];
  return String(list[index] == null ? fallback : list[index]).trim();
}

function readEnvString(env, key, fallback = "") {
  const source = env && typeof env === "object" ? env : process.env;
  return String(source[key] == null ? fallback : source[key]).trim();
}

function readEnvNumber(env, key, fallback) {
  const raw = readEnvString(env, key, "");
  if (!raw) {
    return Number(fallback);
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : Number(fallback);
}

function formatModesUsage(modes) {
  const list = Array.isArray(modes) ? modes : [];
  return list.join("|");
}

module.exports = {
  readPositionalArg,
  readEnvString,
  readEnvNumber,
  formatModesUsage,
};

