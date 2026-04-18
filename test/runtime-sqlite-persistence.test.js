const { describe, test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const {
  initRuntimeSqlitePersistence,
  closeRuntimeSqlitePersistence,
  isPersistenceEnabled,
  getRuntimeSqliteEncryptionStatus,
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

  test("encryption skeleton keeps plaintext when config is incomplete", () => {
    closeRuntimeSqlitePersistence();
    initRuntimeSqlitePersistence(":memory:", {
      encryption: {
        enabled: true,
        mode: "sqlcipher",
        keySource: "env:RUNTIME_SQLITE_KEY",
      },
    });
    const s = getRuntimeSqliteEncryptionStatus();
    assert.equal(s.enabled, false);
    assert.equal(s.mode, "sqlcipher");
    assert.equal(s.keySource, "env:RUNTIME_SQLITE_KEY");
    assert.match(s.reason, /missing encryption key|running plaintext/i);
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
