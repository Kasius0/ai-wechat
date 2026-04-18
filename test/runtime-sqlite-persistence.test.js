const { describe, test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  initRuntimeSqlitePersistence,
  closeRuntimeSqlitePersistence,
  isPersistenceEnabled,
  getRuntimeSqliteEncryptionStatus,
  rotateRuntimeSqliteKey,
  migrateRuntimeSqliteToSqlcipher,
  getRuntimeSqliteSchemaVersion,
  RUNTIME_SQLITE_SCHEMA_VERSION,
  loadSessionRow,
  persistSession,
  flushAllPendingWrites,
  purgeRuntimeSession,
  clearAllSessions,
  PERSIST_DEBOUNCE_MS,
} = require("../src/main/modules/runtime/runtime-sqlite-persistence");

describe("runtime-sqlite-persistence", () => {
  beforeEach(() => {
    closeRuntimeSqlitePersistence();
    initRuntimeSqlitePersistence(":memory:");
  });

  afterEach(() => {
    closeRuntimeSqlitePersistence();
  });

  test("isPersistenceEnabled after init", () => {
    assert.equal(isPersistenceEnabled(), true);
  });

  test("encryption status defaults to disabled plaintext", () => {
    const s = getRuntimeSqliteEncryptionStatus();
    assert.equal(s.enabled, false);
    assert.equal(s.mode, "off");
    assert.match(s.reason, /disabled/i);
  });

  test("sqlcipher mode requires key by default (fail-fast)", () => {
    closeRuntimeSqlitePersistence();
    assert.throws(() => initRuntimeSqlitePersistence(":memory:", {
      encryption: {
        enabled: true,
        mode: "sqlcipher",
        keySource: "env:RUNTIME_SQLITE_KEY",
      },
    }), /missing encryption key/i);
  });

  test("sqlcipher mode can fallback to plaintext when configured", () => {
    closeRuntimeSqlitePersistence();
    initRuntimeSqlitePersistence(":memory:", {
      encryption: {
        enabled: true,
        mode: "sqlcipher",
        keySource: "env:RUNTIME_SQLITE_KEY",
        fallbackToPlaintext: true,
      },
    });
    const s = getRuntimeSqliteEncryptionStatus();
    assert.equal(s.enabled, false);
    assert.equal(s.mode, "sqlcipher");
    assert.equal(s.keySource, "env:RUNTIME_SQLITE_KEY");
    assert.match(s.reason, /fallback to plaintext/i);
  });

  test("rotateRuntimeSqliteKey rejects when sqlcipher is not active", () => {
    assert.throws(
      () => rotateRuntimeSqliteKey("old", "new"),
      /sqlcipher mode is not active/i
    );
  });

  test("rotateRuntimeSqliteKey rotates key in sqlcipher mode", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "runtime-sqlcipher-rekey-"));
    const dbPath = path.join(tmpDir, "runtime.db");
    try {
      closeRuntimeSqlitePersistence();
      initRuntimeSqlitePersistence(dbPath, {
        encryption: {
          enabled: true,
          mode: "sqlcipher",
          key: "old-key",
          keySource: "inline",
        },
      });
      const r = rotateRuntimeSqliteKey("old-key", "new-key");
      assert.equal(r.ok, true);
      const s = getRuntimeSqliteEncryptionStatus();
      assert.equal(s.enabled, true);
      assert.equal(s.mode, "sqlcipher");
      assert.equal(s.keySource, "rotated");
      assert.match(s.reason, /rotated/i);
    } finally {
      closeRuntimeSqlitePersistence();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("migrateRuntimeSqliteToSqlcipher rejects in-memory database", () => {
    assert.throws(
      () => migrateRuntimeSqliteToSqlcipher("new-key"),
      /file-backed database is required/i
    );
  });

  test("migrateRuntimeSqliteToSqlcipher upgrades plaintext file db", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "runtime-sqlcipher-migrate-"));
    const dbPath = path.join(tmpDir, "runtime.db");
    try {
      closeRuntimeSqlitePersistence();
      initRuntimeSqlitePersistence(dbPath);
      persistSession("s-plain", {
        state: "awaiting_context",
        lastTraceId: "trace-1",
        lastError: null,
        history: [{ ts: 1, event: "session_start", from: "idle", to: "awaiting_context", traceId: "trace-1" }],
      });
      flushAllPendingWrites();

      const r = migrateRuntimeSqliteToSqlcipher("migrate-key");
      assert.equal(r.ok, true);
      const status = getRuntimeSqliteEncryptionStatus();
      assert.equal(status.enabled, true);
      assert.equal(status.mode, "sqlcipher");
      assert.equal(status.keySource, "migrated");
      assert.match(status.reason, /migrated/i);

      const row = loadSessionRow("s-plain");
      assert.ok(row);
      assert.equal(row.lastTraceId, "trace-1");

      closeRuntimeSqlitePersistence();
      initRuntimeSqlitePersistence(dbPath, {
        encryption: {
          enabled: true,
          mode: "sqlcipher",
          key: "migrate-key",
          keySource: "inline",
        },
      });
      const rowAfterReopen = loadSessionRow("s-plain");
      assert.ok(rowAfterReopen);
      assert.equal(rowAfterReopen.state, "awaiting_context");
    } finally {
      closeRuntimeSqlitePersistence();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("opening encrypted db with wrong key fails with stable init error prefix", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "runtime-sqlcipher-wrong-key-"));
    const dbPath = path.join(tmpDir, "runtime.db");
    try {
      closeRuntimeSqlitePersistence();
      initRuntimeSqlitePersistence(dbPath);
      persistSession("s-encrypted", {
        state: "idle",
        lastTraceId: null,
        lastError: null,
        history: [],
      });
      flushAllPendingWrites();
      migrateRuntimeSqliteToSqlcipher("correct-key");
      closeRuntimeSqlitePersistence();

      assert.throws(
        () => initRuntimeSqlitePersistence(dbPath, {
          encryption: {
            enabled: true,
            mode: "sqlcipher",
            key: "wrong-key",
            keySource: "inline",
          },
        }),
        /runtime sqlite init failed:/i
      );
    } finally {
      closeRuntimeSqlitePersistence();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("init applies migrations (user_version)", () => {
    assert.equal(getRuntimeSqliteSchemaVersion(), RUNTIME_SQLITE_SCHEMA_VERSION);
  });

  test("persist + load roundtrip", () => {
    persistSession("s1", {
      state: "awaiting_context",
      lastTraceId: "t-1",
      lastError: null,
      history: [{ ts: 1, event: "session_start", from: "idle", to: "awaiting_context", traceId: "t-1" }],
    });
    const row = loadSessionRow("s1");
    assert.ok(row);
    assert.equal(row.state, "awaiting_context");
    assert.equal(row.lastTraceId, "t-1");
    assert.equal(row.history.length, 1);
  });

  test("clearAllSessions removes rows", () => {
    persistSession("a", {
      state: "idle",
      lastTraceId: null,
      lastError: null,
      history: [],
    });
    clearAllSessions();
    assert.equal(loadSessionRow("a"), null);
  });

  test("debounced: rapid persists coalesce (flush on load)", () => {
    persistSession("s", {
      state: "idle",
      lastTraceId: null,
      lastError: null,
      history: [],
    });
    persistSession("s", {
      state: "awaiting_context",
      lastTraceId: "t2",
      lastError: null,
      history: [{ ts: 1, event: "session_start", from: "idle", to: "awaiting_context", traceId: "t2" }],
    });
    const row = loadSessionRow("s");
    assert.ok(row);
    assert.equal(row.state, "awaiting_context");
    assert.equal(row.lastTraceId, "t2");
  });

  test("flushAllPendingWrites persists without loadSessionRow", () => {
    persistSession("x", {
      state: "cooldown",
      lastTraceId: "tx",
      lastError: null,
      history: [],
    });
    flushAllPendingWrites();
    const row = loadSessionRow("x");
    assert.ok(row);
    assert.equal(row.state, "cooldown");
  });

  test("debounce timer eventually writes to disk", async () => {
    persistSession("timer", {
      state: "idle",
      lastTraceId: null,
      lastError: null,
      history: [],
    });
    await new Promise((r) => setTimeout(r, PERSIST_DEBOUNCE_MS + 120));
    const row = loadSessionRow("timer");
    assert.ok(row);
    assert.equal(row.state, "idle");
  });

  test("purgeRuntimeSession cancels pending debounce and deletes row", () => {
    persistSession("wc-99", {
      state: "awaiting_context",
      lastTraceId: "t",
      lastError: null,
      history: [],
    });
    purgeRuntimeSession("wc-99");
    assert.equal(loadSessionRow("wc-99"), null);
  });

  test("purgeRuntimeSession removes persisted row without pending", () => {
    persistSession("wc-100", {
      state: "idle",
      lastTraceId: null,
      lastError: null,
      history: [],
    });
    flushAllPendingWrites();
    purgeRuntimeSession("wc-100");
    assert.equal(loadSessionRow("wc-100"), null);
  });
});
