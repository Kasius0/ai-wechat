# WeChat Automation Quick Start

This project includes a reusable WeChat automation flow with retry and checks, plus mock/real E2E commands.

## Prerequisites

- Windows PowerShell
- Node.js and npm

## Commands

### 0) ESLint

```powershell
npm --prefix F:\AI\project\apps\desktop run lint
npm --prefix F:\AI\project\apps\desktop run lint:fix
```

### App startup scripts

```powershell
npm --prefix F:\AI\project\apps\desktop run start
# legacy alias:
npm --prefix F:\AI\project\apps\desktop run dev:electron
# normal startup for encrypted runtime DB:
$env:RUNTIME_SQLITE_KEY="REPLACE_WITH_STRONG_KEY"
npm --prefix F:\AI\project\apps\desktop run start:encrypted
# one-time encryption migration startup:
$env:RUNTIME_SQLITE_MIGRATE_KEY="REPLACE_WITH_STRONG_KEY"
npm --prefix F:\AI\project\apps\desktop run start:migrate
# startup verification (expects encrypted DB + key):
$env:RUNTIME_SQLITE_KEY="REPLACE_WITH_STRONG_KEY"
npm --prefix F:\AI\project\apps\desktop run verify:encrypted-start
# wrong-key failure verification (intentionally set a wrong key):
$env:RUNTIME_SQLITE_KEY="INTENTIONALLY_WRONG_KEY"
npm --prefix F:\AI\project\apps\desktop run verify:wrong-key-fail
```

Flat config: `eslint.config.js`. CI runs `npm run lint` before unit tests. Repo also includes **`.editorconfig`** and **`.vscode/`** (recommended extensions: ESLint, EditorConfig; `eslint.useFlatConfig` enabled).

If **`npm install` / `npm ci` fails with `EBUSY`** on `electron/dist/icudtl.dat`, close running Electron apps (including the desktop dev app) and retry.

### ABI note (`better-sqlite3`)

- CI / Node unit tests: use `npm ci`, then `npm run lint` and `npm test`.
- Electron runtime: run `npm --prefix F:\AI\project\apps\desktop run rebuild:electron` before `npm --prefix F:\AI\project\apps\desktop run dev:electron` when needed.
- Do **not** force `electron-rebuild` in `postinstall`; it can rebuild native modules for Electron ABI and break Node test ABI in the same environment.

### Runtime SQLite encryption migration (minimal)

- This app now supports a **startup-time plaintext -> SQLCipher migration** behind env flags.
- Set `RUNTIME_SQLITE_MIGRATE_TO_SQLCIPHER=1` and provide a non-empty key via `RUNTIME_SQLITE_MIGRATE_KEY` (or fallback `RUNTIME_SQLITE_KEY`).
- Migration target is `app.getPath("userData")/runtime-sessions.sqlite`; `:memory:` is not supported.
- Production tip: enable migration flags only for a controlled one-time window; after success, remove `RUNTIME_SQLITE_MIGRATE_TO_SQLCIPHER` (and temporary migrate key env) to avoid repeated migration attempts.
- On migration failure, runtime keeps plaintext mode for that run and logs `runtime-sqlite-encryption-migrate-failed`.
- Existing encrypted DB key rotation is available in code via `rotateRuntimeSqliteKey(oldKey, newKey)` (`runtime-sqlite-persistence`).
- Key rotation + rollback operations are documented in `RUNTIME_SQLITE_KEY_RUNBOOK.md`.

### 1) Mock E2E (recommended default)

Runs full flow in one command:

- auto free `127.0.0.1:8787` if occupied
- start mock API
- execute send flow
- validate precheck/echo/send result

```powershell
npm --prefix F:\AI\project\apps\desktop run test:wechat-e2e -- "测试消息"
```

### 2) Real E2E (connect real API only)

Does not start mock server. Your real API must already be running.

```powershell
$env:WECHAT_AUTOMATION_BASE_URL="http://127.0.0.1:8787"
$env:WECHAT_AUTOMATION_API_PREFIX="api/wechat"   # optional
npm --prefix F:\AI\project\apps\desktop run test:wechat-e2e:real -- "测试消息"
```

### 3) Desktop startup E2E (minimum 2B slice)

```powershell
# plaintext / default startup
npm --prefix F:\AI\project\apps\desktop run test:desktop-e2e

# if local runtime DB is encrypted
$env:RUNTIME_SQLITE_KEY="REPLACE_WITH_STRONG_KEY"
npm --prefix F:\AI\project\apps\desktop run test:desktop-e2e
```

Checks startup logs for `runtime-sqlite-encryption-config`, `runtime-sqlite-ready`, and `app-ready`, then exits automatically.

Flow-level runtime orchestration check:

```powershell
$env:RUNTIME_SQLITE_KEY="REPLACE_WITH_STRONG_KEY"   # optional when encrypted
npm --prefix F:\AI\project\apps\desktop run test:desktop-e2e:flow
```

`test:desktop-e2e:flow` runs a deterministic runtime event chain (`reset -> session_start -> wechat_normal -> trigger_send -> send_ok -> cooldown_done`) in desktop main process and expects `desktop-e2e-flow-pass`.

Renderer-driven IPC flow check:

```powershell
$env:RUNTIME_SQLITE_KEY="REPLACE_WITH_STRONG_KEY"   # optional when encrypted
npm --prefix F:\AI\project\apps\desktop run test:desktop-e2e:renderer
```

`test:desktop-e2e:renderer` runs from renderer context via preload APIs (`window.runtime.*`, `window.wechat.listCaptures`) and expects `desktop-e2e-renderer-flow-pass`.

Real UI click/type flow check:

```powershell
$env:RUNTIME_SQLITE_KEY="REPLACE_WITH_STRONG_KEY"   # optional when encrypted
npm --prefix F:\AI\project\apps\desktop run test:desktop-e2e:ui
```

`test:desktop-e2e:ui` drives real renderer controls (`click`/`type`) against the loaded page, then expects `desktop-e2e-ui-pass`.

### Script architecture (shared helpers)

To keep script behavior consistent, new desktop scripts should reuse shared helpers in `scripts/lib/`:

- `electron-log-harness.js`: process lifecycle + JSON log stream + timeout + cleanup.
- `desktop-e2e-core.js`: mode resolution, env building, and desktop E2E log handler wiring.
- `desktop-e2e-mode-config.js`: declarative desktop E2E mode map.
- `desktop-e2e-env.js`: desktop E2E env construction.
- `desktop-e2e-log-evaluator.js`: pure pass/fail/continue evaluation for desktop E2E logs.
- `runtime-sqlite-verify-core.js`: verify startup mode resolution + env + handler wiring.
- `runtime-sqlite-verify-evaluator.js`: pure pass/fail/continue evaluation for verify logs.
- `script-cli.js`: shared CLI arg/env parsing for entry scripts.

Entry scripts should stay thin:

- parse CLI/env via `script-cli.js`
- build context via core module
- run with `electron-log-harness.js`

## Other Useful Commands

Start mock API only:

```powershell
npm --prefix F:\AI\project\apps\desktop run wechat-api:dev
```

Restart mock API with auto-clean on port 8787:

```powershell
npm --prefix F:\AI\project\apps\desktop run wechat-api:restart
```

Run send flow only (requires running API):

```powershell
$env:WECHAT_AUTOMATION_BASE_URL="http://127.0.0.1:8787"
$env:WECHAT_AUTOMATION_API_PREFIX="api/wechat"   # optional
npm --prefix F:\AI\project\apps\desktop run test:wechat-send -- "测试消息"
```

## Common Errors and Fixes

### `ENOENT: ... C:\Users\Administrator\package.json`

Cause:
- Running `npm run ...` outside project directory.

Fix:
- Use `npm --prefix F:\AI\project\apps\desktop ...`, or `cd` into project first.

### `EADDRINUSE: 127.0.0.1:8787`

Cause:
- Port `8787` already occupied by another process.

Fix:
- Use `wechat-api:restart`, or kill PID then restart:

```powershell
$pidToKill = (netstat -ano | Select-String "127.0.0.1:8787.*LISTENING" | ForEach-Object { ($_ -split "\s+")[-1] } | Select-Object -First 1)
if ($pidToKill) { taskkill /PID $pidToKill /F }
```

### `ECONNREFUSED`

Cause:
- Target API not running or wrong host/port.

Fix:
- For mock path, run `test:wechat-e2e`.
- For real path, start real API first and verify env vars:

```powershell
echo $env:WECHAT_AUTOMATION_BASE_URL
echo $env:WECHAT_AUTOMATION_API_PREFIX
netstat -ano | Select-String "127.0.0.1:8787.*LISTENING"
```

## Expected Success Output

Look for:

- `code: "SERVER_READY"` (mock mode)
- `code: "OK"`
- `echoChecked: true`
- `sendVerified: true`

## Quick Send Options (Week4)

`wechat:quick-send` now supports an `options` object to keep advanced controls grouped.

Example request payload:

```json
{
  "text": "你好，这是自动化发送测试",
  "inputX": 20,
  "inputY": 140,
  "delayMs": 20,
  "options": {
    "dryRun": true,
    "retry": {
      "maxRetries": 2,
      "delayMs": 120
    },
    "injectFailure": {
      "step": "mouse-move",
      "times": 1
    },
    "traceId": "optional-custom-id"
  }
}
```

Notes:

- `options.dryRun`: run focus/move/click only, skip type/enter
- `options.retry.maxRetries`: step retry count (0-3)
- `options.retry.delayMs`: delay between retries
- `options.injectFailure`: dev-only failure injection for retry verification
- `options.traceId`: optional; correlates main-process JSON log lines with IPC responses (auto-generated if omitted)
- Backward compatibility: legacy top-level `retry`/`injectFailure` is still accepted

## Week 4 wrap-up: main log file and terminal search

- **Log path (repo root):** `F:\AI\project\runtime\logs\desktop-main.log` (also returned as `data.logFilePath` on `wechat:quick-send`).
- **Rotation:** when the file reaches **5 MiB** (override with env `DESKTOP_MAIN_LOG_MAX_BYTES`), it is renamed to `desktop-main.<timestamp>.log` and a new file is started. Up to **5** archives are kept (override with `DESKTOP_MAIN_LOG_KEEP`).
- **Search with ripgrep:** in PowerShell, do **not** wrap a Windows path in double quotes if it contains `\r` (e.g. `\runtime`); use single quotes or forward slashes:

```powershell
rg -F 'dryrun-xxxx' 'F:\AI\project\runtime\logs\desktop-main.log'
# or
rg -F 'dryrun-xxxx' 'F:/AI/project/runtime/logs/desktop-main.log'
```

- **Without ripgrep:**

```powershell
Select-String -LiteralPath 'F:\AI\project\runtime\logs\desktop-main.log' -Pattern 'dryrun-xxxx'
```

## Week 5: in-process runtime state machine (desktop main)

The Electron main process keeps an **in-memory session state machine** (idle → awaiting_context → ready_to_reply → sending → cooldown → idle, plus `error` / `reset`). Dev tooling and `wechat:*` IPC stay aligned via `dispatchRuntimeEvent`.

### IPC

| Channel | Role |
|--------|------|
| `runtime:state` | Read full state, `allowedEvents`, history |
| `runtime:event` | Apply named events (`session_start`, `wechat_normal`, …) |

Preload exposes `window.runtime.state()` and `window.runtime.event(payload)`.

### `data.runtime` on `wechat:*` responses

Almost every **`wechat:*`** handler merges a **`runtime`** snapshot into **`data`**: `state`, `allowedEvents`, `lastTraceId`, `lastError` (same shape as `getRuntimeSnapshot()`). Pure merge helper: `src/main/modules/runtime/enrich-wechat-ipc-result.js`.

- **`wechat:quick-send`** attaches it via the existing `quickSendData` path.
- **Uncaught errors** inside `wechat:*` handlers use **`defineHandler(..., { attachRuntimeOnError: true })`** so structured failures still include `data.runtime`. Other domains (`app`, `rpa`, `runtime`) keep the default (`false`).

### Single-step `wechat:*` and the state machine

When the session is in **`awaiting_context`**, several IPCs call `dispatchRuntimeEvent` (e.g. status-like results → `wechat_normal` / `wechat_abnormal`). See `src/main/modules/runtime/single-step-wechat-runtime-sync.js`. **`wechat:quick-send`** uses `quick-send-runtime-bridge.js` (starts with `reset` + `session_start`).

### Unit tests

```powershell
npm --prefix F:\AI\project\apps\desktop test
```

Runs `node scripts/run-unit-tests.js` (all `test/*.test.js`), including `get-runtime-highlight-block` (renderer output highlight), state machine, quick-send bridge, single-step sync, `enrich-wechat-ipc-result`, and `defineHandler` runtime-on-error behavior.

Pure logic lives in `src/renderer/get-runtime-highlight-block.js` (loaded before `renderer.js` in `index.html`; Node tests can `require` it).

### CI

GitHub Actions workflow: **`.github/workflows/desktop-ci.yml`** (repo root). On push/PR when files under `project/apps/desktop/` change, it runs **`npm ci` → `npm run lint` → `npm test`** in that directory (Ubuntu). Node version follows **`project/apps/desktop/.nvmrc`** (currently **20**), matching `package.json` **`engines.node`** (`>=20`).

### CI troubleshooting (desktop E2E)

If `desktop-e2e` fails in CI:

- Open the failed workflow run, then open job `desktop-e2e`.
- Download artifact `desktop-runtime-logs-<run_id>` (uploaded on failure).
- Inspect:
  - `runtime/logs/desktop-main.log`
  - `runtime/logs/desktop-main.<timestamp>.log`
- Match failure events first:
  - `runtime-sqlite-init-failed`
  - `desktop-e2e-flow-fail`
  - `desktop-e2e-renderer-flow-fail`
  - `desktop-e2e-ui-fail`
- If failure is transient, workflow already retries each E2E slice once; treat repeated failures as real regressions.

### Dev output: runtime highlight panel

When the returned JSON includes **`data.runtime`** as an object, the renderer shows the full response in the main `<pre>` and adds a highlighted block below (purple border), labeled **`data.runtime`**.

For **`runtime:state`** / **`runtime:event`**-shaped payloads (top-level `data.state` + `data.allowedEvents`, no embedded `data.runtime`, not `wechat-quick-send`), a **「运行时快照」** panel shows a compact `{ state, allowedEvents, lastTraceId, lastError, from?, event? }` extract. Implemented in **`src/renderer/get-runtime-highlight-block.js`**.

### Full detail (Chinese)

See **`README.zh-CN.md`** §八 and IPC §四 for Dev UI, `allowedEvents` button sync, and logging conventions.

### Known limits & follow-ups (not in current scope)

See **[ROADMAP.md](ROADMAP.md)** (English + Chinese, maintained there).
