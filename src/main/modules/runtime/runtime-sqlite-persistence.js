const { migrateRuntimeSqliteSchema, readUserVersion, RUNTIME_SQLITE_SCHEMA_VERSION } = require("./runtime-sqlite-migrations");

/** @type {InstanceType<typeof import("better-sqlite3")> | null} */
let db = null;
let encryptionStatus = {
  enabled: false,
  mode: "off",
  keySource: "none",
  reason: "encryption disabled",
};

let upsertStmt = null;
let selectStmt = null;
let deleteAllStmt = null;
let deleteOneStmt = null;
let dbPathValue = null;

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

/**
 * @typedef {{
 *   enabled?: boolean,
 *   mode?: "off" | "sqlcipher",
 *   key?: string,
 *   keySource?: string,
 *   fallbackToPlaintext?: boolean,
 * }} RuntimeSqliteEncryptionConfig
 */

/**
 * @typedef {{ encryption?: RuntimeSqliteEncryptionConfig }} RuntimeSqlitePersistenceOptions
 */

function escapeSqlitePragmaString(raw) {
  return String(raw).replace(/'/g, "''");
}

/**
 * Resolve effective encryption status for observability.
 * @param {RuntimeSqlitePersistenceOptions | undefined} options
 */
function resolveEncryptionStatus(options) {
  const cfg = options?.encryption || {};
  const enabled = cfg.enabled === true;
  const mode = cfg.mode || "off";
  const keySource = cfg.keySource || (cfg.key ? "inline" : "none");
  if (!enabled) {
    return { enabled: false, mode: "off", keySource: "none", reason: "encryption disabled" };
  }
  if (mode !== "sqlcipher") {
    return {
      enabled: false,
      mode,
      keySource,
      reason: "unsupported encryption mode",
    };
  }
  if (!cfg.key || !String(cfg.key).trim()) {
    return {
      enabled: false,
      mode,
      keySource,
      reason: "missing encryption key",
    };
  }
  return {
    enabled: true,
    mode,
    keySource,
    reason: "sqlcipher enabled",
  };
}

function loadSqliteDriver(mode) {
  if (mode === "sqlcipher") {
    return require("better-sqlite3-multiple-ciphers");
  }
  return require("better-sqlite3");
}

function openPlaintextDb(dbPath) {
  const BetterSqlite3 = loadSqliteDriver("off");
  return new BetterSqlite3(dbPath);
}

function bindRuntimeStatements(database) {
  upsertStmt = database.prepare(`
    INSERT INTO runtime_sessions (session_id, state, last_trace_id, last_error_json, history_json, updated_at)
    VALUES (@session_id, @state, @last_trace_id, @last_error_json, @history_json, @updated_at)
    ON CONFLICT(session_id) DO UPDATE SET
      state = excluded.state,
      last_trace_id = excluded.last_trace_id,
      last_error_json = excluded.last_error_json,
      history_json = excluded.history_json,
      updated_at = excluded.updated_at;
  `);
  selectStmt = database.prepare(
    `SELECT session_id, state, last_trace_id, last_error_json, history_json FROM runtime_sessions WHERE session_id = ?`
  );
  deleteAllStmt = database.prepare(`DELETE FROM runtime_sessions`);
  deleteOneStmt = database.prepare(`DELETE FROM runtime_sessions WHERE session_id = ?`);
}

function initRuntimeSqlitePersistence(dbPath, options = undefined) {
  if (db) {
    return;
  }
  if (!dbPath || typeof dbPath !== "string") {
    throw new Error("runtime sqlite: dbPath is required");
  }
  dbPathValue = dbPath;

  const cfg = options?.encryption || {};
  const fallbackToPlaintext = cfg.fallbackToPlaintext === true;
  const status = resolveEncryptionStatus(options);

  if (cfg.enabled === true && status.enabled === false && !fallbackToPlaintext) {
    throw new Error(`runtime sqlite encryption config invalid: ${status.reason}`);
  }

  try {
    if (status.enabled) {
      const SqlcipherDriver = loadSqliteDriver("sqlcipher");
      db = new SqlcipherDriver(dbPath);
      const escapedKey = escapeSqlitePragmaString(cfg.key);
      db.pragma(`key='${escapedKey}'`);
      db.prepare("SELECT count(*) AS c FROM sqlite_master").get();
      encryptionStatus = status;
    } else {
      db = openPlaintextDb(dbPath);
      encryptionStatus = status.enabled
        ? status
        : {
            enabled: false,
            mode: status.mode,
            keySource: status.keySource,
            reason: fallbackToPlaintext && cfg.enabled === true
              ? `${status.reason}; fallback to plaintext`
              : status.reason,
          };
    }
  } catch (error) {
    if (!fallbackToPlaintext) {
      throw new Error(`runtime sqlite init failed: ${error?.message || String(error)}`);
    }
    if (db) {
      try {
        db.close();
      } catch {
        // ignore
      }
    }
    db = openPlaintextDb(dbPath);
    encryptionStatus = {
      enabled: false,
      mode: status.mode,
      keySource: status.keySource,
      reason: `encryption init failed; fallback to plaintext: ${error?.message || String(error)}`,
    };
  }

  db.pragma("journal_mode = WAL");
  migrateRuntimeSqliteSchema(db);
  bindRuntimeStatements(db);
}

function isPersistenceEnabled() {
  return db != null;
}

function getRuntimeSqliteEncryptionStatus() {
  return { ...encryptionStatus };
}

/**
 * Rotate SQLCipher key for the currently opened runtime database.
 * Requires runtime DB initialized in `sqlcipher` mode.
 * @param {string} oldKey
 * @param {string} newKey
 * @returns {{ ok: true, mode: "sqlcipher", reason: string }}
 */
function rotateRuntimeSqliteKey(oldKey, newKey) {
  if (!db) {
    throw new Error("runtime sqlite rotate key failed: database is not initialized");
  }
  if (encryptionStatus.mode !== "sqlcipher" || encryptionStatus.enabled !== true) {
    throw new Error("runtime sqlite rotate key failed: sqlcipher mode is not active");
  }
  const oldTrim = String(oldKey || "").trim();
  const newTrim = String(newKey || "").trim();
  if (!oldTrim) {
    throw new Error("runtime sqlite rotate key failed: oldKey is required");
  }
  if (!newTrim) {
    throw new Error("runtime sqlite rotate key failed: newKey is required");
  }
  if (oldTrim === newTrim) {
    throw new Error("runtime sqlite rotate key failed: oldKey and newKey must differ");
  }
  flushAllPendingWrites();
  const previousJournalMode = String(db.pragma("journal_mode", { simple: true }) || "").toUpperCase();
  try {
    if (previousJournalMode === "WAL") {
      db.pragma("journal_mode = DELETE");
    }
    db.pragma(`key='${escapeSqlitePragmaString(oldTrim)}'`);
    db.prepare("SELECT count(*) AS c FROM sqlite_master").get();
    db.pragma(`rekey='${escapeSqlitePragmaString(newTrim)}'`);
    db.prepare("SELECT count(*) AS c FROM sqlite_master").get();
    encryptionStatus = {
      enabled: true,
      mode: "sqlcipher",
      keySource: "rotated",
      reason: "sqlcipher key rotated",
    };
    return { ok: true, mode: "sqlcipher", reason: "sqlcipher key rotated" };
  } catch (error) {
    throw new Error(`runtime sqlite rotate key failed: ${error?.message || String(error)}`);
  } finally {
    if (previousJournalMode === "WAL") {
      db.pragma("journal_mode = WAL");
    }
  }
}

/**
 * Migrate currently-open plaintext runtime DB to SQLCipher.
 * Keeps the same DB file path and re-binds prepared statements.
 * @param {string} newKey
 * @returns {{ ok: true, mode: "sqlcipher", reason: string }}
 */
function migrateRuntimeSqliteToSqlcipher(newKey) {
  if (!db) {
    throw new Error("runtime sqlite migrate encryption failed: database is not initialized");
  }
  if (encryptionStatus.enabled === true) {
    throw new Error("runtime sqlite migrate encryption failed: database is already encrypted");
  }
  const nextKey = String(newKey || "").trim();
  if (!nextKey) {
    throw new Error("runtime sqlite migrate encryption failed: newKey is required");
  }
  if (!dbPathValue || dbPathValue === ":memory:") {
    throw new Error("runtime sqlite migrate encryption failed: file-backed database is required");
  }
  flushAllPendingWrites();
  const previousDbPath = dbPathValue;
  const previousStatus = { ...encryptionStatus };
  const previousDb = db;
  let migratedDb = null;
  try {
    previousDb.close();
    db = null;
    upsertStmt = null;
    selectStmt = null;
    deleteAllStmt = null;
    deleteOneStmt = null;
    const SqlcipherDriver = loadSqliteDriver("sqlcipher");
    migratedDb = new SqlcipherDriver(previousDbPath);
    const previousJournalMode = String(
      migratedDb.pragma("journal_mode", { simple: true }) || ""
    ).toUpperCase();
    if (previousJournalMode === "WAL") {
      migratedDb.pragma("journal_mode = DELETE");
    }
    migratedDb.prepare("SELECT count(*) AS c FROM sqlite_master").get();
    migratedDb.pragma(`rekey='${escapeSqlitePragmaString(nextKey)}'`);
    migratedDb.pragma(`key='${escapeSqlitePragmaString(nextKey)}'`);
    migratedDb.prepare("SELECT count(*) AS c FROM sqlite_master").get();
    migratedDb.pragma("journal_mode = WAL");
    db = migratedDb;
    bindRuntimeStatements(db);
    encryptionStatus = {
      enabled: true,
      mode: "sqlcipher",
      keySource: "migrated",
      reason: "plaintext migrated to sqlcipher",
    };
    return { ok: true, mode: "sqlcipher", reason: "plaintext migrated to sqlcipher" };
  } catch (error) {
    if (migratedDb) {
      try {
        migratedDb.close();
      } catch {
        // ignore
      }
    }
    db = openPlaintextDb(previousDbPath);
    bindRuntimeStatements(db);
    encryptionStatus = { ...previousStatus };
    throw new Error(`runtime sqlite migrate encryption failed: ${error?.message || String(error)}`);
  }
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
  dbPathValue = null;
  encryptionStatus = {
    enabled: false,
    mode: "off",
    keySource: "none",
    reason: "encryption disabled",
  };
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
  getRuntimeSqliteEncryptionStatus,
  rotateRuntimeSqliteKey,
  migrateRuntimeSqliteToSqlcipher,
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
