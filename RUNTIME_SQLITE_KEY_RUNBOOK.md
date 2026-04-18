# Runtime SQLite Key Runbook

This runbook covers **SQLCipher key rotation** and **rollback** for the runtime DB:
`app.getPath("userData")/runtime-sessions.sqlite`.

## Scope

- Applies to encrypted runtime DB startup (`start:encrypted`).
- Uses app-level APIs already implemented in `runtime-sqlite-persistence`.
- Assumes Windows PowerShell examples.

## Preconditions

- Confirm DB is already encrypted and app can start with:
  - `$env:RUNTIME_SQLITE_KEY="<current-key>"`
  - `npm --prefix F:\AI\project\apps\desktop run start:encrypted`
- Stop all running Electron processes before maintenance.
- Prepare secure storage for both old/new keys.

## Rotation Procedure (minimum safe flow)

1. **Stop app**
   - Ensure no running `electron.exe`.
2. **Backup DB files**
   - Backup `runtime-sessions.sqlite` and optional sidecars:
     - `runtime-sessions.sqlite-wal`
     - `runtime-sessions.sqlite-shm`
3. **Run key rotation**
   - Invoke `rotateRuntimeSqliteKey(oldKey, newKey)` in the maintenance window from app code path / controlled script.
4. **Restart with new key**
   - `$env:RUNTIME_SQLITE_KEY="<new-key>"`
   - `npm --prefix F:\AI\project\apps\desktop run start:encrypted`
5. **Verify logs**
   - Confirm startup log contains `runtime-sqlite-ready` with:
     - `encryption.enabled = true`
     - `encryption.mode = "sqlcipher"`

## Failure Signals

- Startup with wrong key should fail with stable prefix:
  - `runtime sqlite init failed: ...`
- Main log event to inspect:
  - `runtime-sqlite-init-failed`

## Rollback

1. Stop app.
2. Restore DB backup files (`.sqlite` + sidecars if present).
3. Start app with previous key:
   - `$env:RUNTIME_SQLITE_KEY="<old-key>"`
   - `npm --prefix F:\AI\project\apps\desktop run start:encrypted`
4. Verify `runtime-sqlite-ready` event in logs.

## Operational Notes

- Do not keep migration flags enabled after migration:
  - `RUNTIME_SQLITE_MIGRATE_TO_SQLCIPHER`
- Keep rotation key handling out of shell history when possible.
- Prefer a short maintenance window with explicit backup timestamp.
- Production key governance:
  - Avoid long-lived plaintext key values directly in process env when possible.
  - Prefer secret manager based injection with access control and audit trail.
  - Rotate keys on a defined cadence and after security incidents.
  - Startup now emits `runtime-sqlite-key-governance-warning` in production when key source is direct env.

