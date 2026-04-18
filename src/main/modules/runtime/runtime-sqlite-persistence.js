const { migrateRuntimeSqliteSchema, readUserVersion, RUNTIME_SQLITE_SCHEMA_VERSION } = require("./runtime-sqlite-migrations");

/** @type {InstanceType<typeof import("better-sqlite3")> | null} */
let db = null;

let upsertStmt = null;
let selectStmt = null;
let deleteAllStmt = null;
let deleteOneStmt = null;

/** Coalesce rapid writes per session; quit / flush forces disk. */
const PERSIST_DEBOUNCE_MS = 200;

/** @type {Map<string, ReturnType<typeof setTimeout>>} */
const pendingTimers = new Map();

/** @type {Map<string, { state: string, lastTraceId: string | null, lastError: object | null, history: object[] }>} */
const pendingSnapshots = new Map();

function cloneStoreSnapshot(store) {
  return {
    state: store.state,
    lastTraceId: store.lastTraceId,
    lastError: store.lastError == null ? null : { ...store.lastError },
    history: Array.isArray(store.history) ? store.history.map((e) => ({ ...e })) : [],
  };
}

function executeUpsert(sessionId, store) {
  if (!upsertStmt || !store) {
    return;
  }
  const historyJson = JSON.stringify(Array.isArray(store.history) ? store.history : []);
  const lastErrJson =
    store.lastError != null && typeof store.lastError === "object"
      ? JSON.stringify(store.lastError)
      : null;
  upsertStmt.run({
    session_id: sessionId,
    state: store.state,
    last_trace_id: store.lastTraceId != null ? String(store.lastTraceId) : null,
    last_error_json: lastErrJson,
    history_json: historyJson,
    updated_at: Date.now(),
  });
}

function initRuntimeSqlitePersistence(dbPath) {
  if (db) {
    return;
  }
  if (!dbPath || typeof dbPath !== "string") {
    throw new Error("runtime sqlite: dbPath is required");
  }
  const BetterSqlite3 = require("better-sqlite3");
  db = new BetterSqlite3(dbPath);
  db.pragma("journal_mode = WAL");
  migrateRuntimeSqliteSchema(db);
  upsertStmt = db.prepare(`
    INSERT INTO runtime_sessions (session_id, state, last_trace_id, last_error_json, history_json, updated_at)
    VALUES (@session_id, @state, @last_trace_id, @last_error_json, @history_json, @updated_at)
    ON CONFLICT(session_id) DO UPDATE SET
      state = excluded.state,
      last_trace_id = excluded.last_trace_id,
      last_error_json = excluded.last_error_json,
      history_json = excluded.history_json,
      updated_at = excluded.updated_at;
  `);
  selectStmt = db.prepare(
    `SELECT session_id, state, last_trace_id, last_error_json, history_json FROM runtime_sessions WHERE session_id = ?`
  );
  deleteAllStmt = db.prepare(`DELETE FROM runtime_sessions`);
  deleteOneStmt = db.prepare(`DELETE FROM runtime_sessions WHERE session_id = ?`);
}

function isPersistenceEnabled() {
  return db != null;
}

/** @returns {number | null} Current PRAGMA user_version, or null if DB not open. */
function getRuntimeSqliteSchemaVersion() {
  if (!db) {
    return null;
  }
  return readUserVersion(db);
}

/**
 * Writes any debounced rows immediately (e.g. before `clearAllSessions`, tests, or DB close).
 */
function flushAllPendingWrites() {
  for (const t of pendingTimers.values()) {
    clearTimeout(t);
  }
  pendingTimers.clear();
  if (!upsertStmt) {
    pendingSnapshots.clear();
    return;
  }
  for (const [sessionId, snap] of pendingSnapshots) {
    executeUpsert(sessionId, snap);
  }
  pendingSnapshots.clear();
}

/**
 * @returns {{ state: string, lastTraceId: string | null, lastError: object | null, history: object[] } | null}
 */
function loadSessionRow(sessionId) {
  flushAllPendingWrites();
  if (!selectStmt) {
    return null;
  }
  const row = selectStmt.get(sessionId);
  if (!row) {
    return null;
  }
  let history = [];
  try {
    const parsed = JSON.parse(row.history_json);
    history = Array.isArray(parsed) ? parsed : [];
  } catch {
    history = [];
  }
  let lastError = null;
  if (row.last_error_json != null && row.last_error_json !== "") {
    try {
      lastError = JSON.parse(row.last_error_json);
    } catch {
      lastError = null;
    }
  }
  return {
    state: row.state,
    lastTraceId: row.last_trace_id != null ? String(row.last_trace_id) : null,
    lastError,
    history,
  };
}

/**
 * Debounced upsert: coalesces bursts per `sessionId`. Call {@link flushAllPendingWrites} before quit
 * or whenever disk must reflect the latest state (e.g. tests simulating restart).
 * @param {string} sessionId
 * @param {{ state: string, lastTraceId: string | null, lastError: object | null, history: object[] }} store
 */
function persistSession(sessionId, store) {
  if (!upsertStmt || !store) {
    return;
  }
  pendingSnapshots.set(sessionId, cloneStoreSnapshot(store));
  const prev = pendingTimers.get(sessionId);
  if (prev) {
    clearTimeout(prev);
  }
  const timer = setTimeout(() => {
    pendingTimers.delete(sessionId);
    const snap = pendingSnapshots.get(sessionId);
    if (!snap || !upsertStmt) {
      return;
    }
    executeUpsert(sessionId, snap);
    pendingSnapshots.delete(sessionId);
  }, PERSIST_DEBOUNCE_MS);
  pendingTimers.set(sessionId, timer);
}

/**
 * Drop debounced work for one session without writing it (e.g. ephemeral `wc-*` window closed).
 * @param {string} sessionId
 */
function cancelPendingForSession(sessionId) {
  if (!sessionId || typeof sessionId !== "string") {
    return;
  }
  const t = pendingTimers.get(sessionId);
  if (t) {
    clearTimeout(t);
    pendingTimers.delete(sessionId);
  }
  pendingSnapshots.delete(sessionId);
}

/**
 * Cancel pending writes for `sessionId`, then remove its row from SQLite (if DB is open).
 * @param {string} sessionId
 */
function purgeRuntimeSession(sessionId) {
  cancelPendingForSession(sessionId);
  if (deleteOneStmt) {
    deleteOneStmt.run(sessionId);
  }
}

function clearAllSessions() {
  flushAllPendingWrites();
  if (deleteAllStmt) {
    deleteAllStmt.run();
  }
}

function closeRuntimeSqlitePersistence() {
  flushAllPendingWrites();
  if (db) {
    try {
      db.close();
    } catch {
      // ignore
    }
  }
  db = null;
  upsertStmt = null;
  selectStmt = null;
  deleteAllStmt = null;
  deleteOneStmt = null;
  pendingTimers.clear();
  pendingSnapshots.clear();
}

module.exports = {
  initRuntimeSqlitePersistence,
  isPersistenceEnabled,
  getRuntimeSqliteSchemaVersion,
  RUNTIME_SQLITE_SCHEMA_VERSION,
  loadSessionRow,
  persistSession,
  flushAllPendingWrites,
  cancelPendingForSession,
  purgeRuntimeSession,
  clearAllSessions,
  closeRuntimeSqlitePersistence,
  PERSIST_DEBOUNCE_MS,
};
