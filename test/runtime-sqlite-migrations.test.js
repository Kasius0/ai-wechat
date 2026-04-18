const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
const {
  RUNTIME_SQLITE_SCHEMA_VERSION,
  migrateRuntimeSqliteSchema,
  readUserVersion,
} = require("../src/main/modules/runtime/runtime-sqlite-migrations");

describe("runtime-sqlite-migrations", () => {
  test("fresh database migrates to RUNTIME_SQLITE_SCHEMA_VERSION", () => {
    const d = new Database(":memory:");
    assert.equal(readUserVersion(d), 0);
    migrateRuntimeSqliteSchema(d);
    assert.equal(readUserVersion(d), RUNTIME_SQLITE_SCHEMA_VERSION);
    const row = d.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='runtime_sessions'").get();
    assert.ok(row);
    d.close();
  });

  test("migrate twice is idempotent", () => {
    const d = new Database(":memory:");
    migrateRuntimeSqliteSchema(d);
    migrateRuntimeSqliteSchema(d);
    assert.equal(readUserVersion(d), RUNTIME_SQLITE_SCHEMA_VERSION);
    d.close();
  });

  test("rejects database newer than app schema with stable message", () => {
    const d = new Database(":memory:");
    d.pragma("user_version = 99");
    assert.throws(() => migrateRuntimeSqliteSchema(d), (error) => {
      assert.match(String(error?.message || ""), /database user_version \(99\) is newer than this app/i);
      assert.match(String(error?.message || ""), new RegExp(`\\(${RUNTIME_SQLITE_SCHEMA_VERSION}\\)`));
      return true;
    });
    d.close();
  });
});
