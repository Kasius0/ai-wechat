/**
 * Runtime SQLite schema migrations (PRAGMA user_version).
 *
 * Rules:
 * - Bump {@link RUNTIME_SQLITE_SCHEMA_VERSION} when adding a new step.
 * - Add `if (current < N) { ...; writeUserVersion(database, N); current = N; }` in order.
 * - Never decrement user_version in shipped migrations.
 */

const RUNTIME_SQLITE_SCHEMA_VERSION = 1;

/**
 * @param {import("better-sqlite3").Database} database
 */
function readUserVersion(database) {
  const v = database.pragma("user_version", { simple: true });
  if (v == null || v === "") {
    return 0;
  }
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

/**
 * @param {import("better-sqlite3").Database} database
 * @param {number} version
 */
function writeUserVersion(database, version) {
  const v = Math.trunc(Number(version));
  if (!Number.isFinite(v) || v < 0) {
    throw new Error(`runtime sqlite: invalid user_version ${version}`);
  }
  database.pragma(`user_version = ${v}`);
}

/**
 * @param {import("better-sqlite3").Database} database
 */
function migrationV0ToV1(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS runtime_sessions (
      session_id TEXT PRIMARY KEY NOT NULL,
      state TEXT NOT NULL,
      last_trace_id TEXT,
      last_error_json TEXT,
      history_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
}

/*
 * Placeholder for the next schema bump (V1 -> V2).
 *
 * Trigger V2 only when row shape actually changes, e.g.:
 * - add/remove/rename columns in `runtime_sessions`
 * - split runtime data into additional tables
 * - add indexes that should be created for all existing databases
 *
 * Keep migrations idempotent and forward-only:
 * function migrationV1ToV2(database) {
 *   database.exec(`...`);
 * }
 */

/**
 * Apply sequential migrations until {@link RUNTIME_SQLITE_SCHEMA_VERSION}.
 * @param {import("better-sqlite3").Database} database
 */
function migrateRuntimeSqliteSchema(database) {
  let current = readUserVersion(database);

  if (current > RUNTIME_SQLITE_SCHEMA_VERSION) {
    throw new Error(
      `runtime sqlite: database user_version (${current}) is newer than this app (${RUNTIME_SQLITE_SCHEMA_VERSION}); upgrade the application`
    );
  }

  if (current < 1) {
    migrationV0ToV1(database);
    current = 1;
    writeUserVersion(database, 1);
  }

  // if (current < 2) {
  //   migrationV1ToV2(database);
  //   current = 2;
  //   writeUserVersion(database, 2);
  // }

  if (current !== RUNTIME_SQLITE_SCHEMA_VERSION) {
    throw new Error(
      `runtime sqlite: migration stopped at user_version ${current}, expected ${RUNTIME_SQLITE_SCHEMA_VERSION}`
    );
  }
}

module.exports = {
  RUNTIME_SQLITE_SCHEMA_VERSION,
  migrateRuntimeSqliteSchema,
  readUserVersion,
};
