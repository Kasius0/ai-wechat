"use strict";

function evaluateRuntimeSqliteVerifyLog(payload, context) {
  const { mode } = context;
  const event = payload?.event;

  if (mode === "encrypted-start") {
    if (
      event === "runtime-sqlite-ready" &&
      payload?.encryption?.enabled === true &&
      payload?.encryption?.mode === "sqlcipher"
    ) {
      return { status: "pass", message: "encrypted startup is ready with sqlcipher." };
    }
    if (event === "runtime-sqlite-init-failed") {
      return { status: "fail", message: payload?.message || "unexpected init failure." };
    }
    return { status: "continue" };
  }

  if (event === "runtime-sqlite-init-failed") {
    const message = String(payload?.message || "");
    if (/runtime sqlite init failed:/i.test(message)) {
      return { status: "pass", message: "wrong-key failure signal is stable." };
    }
    return { status: "fail", message: `init failed without stable prefix: ${message}` };
  }

  if (
    event === "runtime-sqlite-ready" &&
    payload?.encryption?.enabled === true &&
    payload?.encryption?.mode === "sqlcipher"
  ) {
    return {
      status: "fail",
      message: "startup succeeded; RUNTIME_SQLITE_KEY is not a wrong key for current DB.",
    };
  }

  return { status: "continue" };
}

module.exports = {
  evaluateRuntimeSqliteVerifyLog,
};

