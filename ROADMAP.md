# Desktop app roadmap

This file tracks **known boundaries** and **planned follow-ups** that are **not** part of the current delivery. Product and CI details stay in [README.md](README.md) / [README.zh-CN.md](README.zh-CN.md).

**Current track:** **2A** — runtime state machine **persistence / multi-session** (not 2B desktop E2E for now).  
**当前方向：** **2A** — 运行时状态机 **持久化 / 多会话**（暂不做 2B 一键桌面 E2E）。

### Runtime `sessionId`（内存内多会话，已定稿）

Resolution order for **`runtime:*`** and **`wechat:*`** IPC (see `src/main/modules/runtime/runtime-session-id.js`):

1. **`payload.sessionId`** or **`payload.options.sessionId`** if non-empty after trim (max 128 chars).
2. Else **`wc-<webContents.id>`** from the invoke sender (one bucket per renderer / Dev window by default).
3. Else **`__default__`** (Node unit tests and any main-only caller with no `sessionId` and no sender).

`traceId` remains **log correlation only**, not the state-machine key. **SQLite persistence** (Electron): `app.getPath("userData")/runtime-sessions.sqlite` — see `runtime-sqlite-persistence.js`; **hydrate** on first access per `sessionId`; **debounced upsert** after successful `dispatchRuntimeEvent` (including `reset`), with **flush** on read, clear, and app quit. If `initRuntimeSqlitePersistence` throws, the app keeps **memory-only** for that run (see `main.js` log `runtime-sqlite-init-failed`). Unit tests use `:memory:` or leave persistence off.

**ABI policy:** keep Node test ABI and Electron ABI separated — use `npm ci` for CI/Node tests; run **`npm run rebuild:electron`** only when preparing Electron runtime (`dev:electron`), not in `postinstall`.

**`wc-*` cleanup:** `app.on("web-contents-created")` → each `webContents.once("destroyed")` calls **`dropRuntimeSessionForWebContents(id)`** (memory + `purgeRuntimeSession` so debounced rows are not written back). Explicit non-`wc-*` `sessionId`s are untouched.

**中文版：** **`traceId` 仅用于日志**。**磁盘持久化**：`userData/runtime-sessions.sqlite`；成功 `dispatch` 后 **防抖写盘**（每会话 200ms），**读库 / 清空 / 退出** 前会 **flush**；**`webContents` 销毁** 时删 **`wc-<id>`** 内存与库行（见 `main.js` / `purgeRuntimeSession`）。非 `wc-*` 的显式 `sessionId` 不自动删。初始化失败则当次纯内存。

**ABI 策略：** `npm ci` 用于 CI / Node 单测；仅在运行 Electron 前按需执行 **`npm run rebuild:electron`**，避免在 `postinstall` 强制重编导致 Node/Electron ABI 相互污染。

---

## Out of current scope (known gaps)

1. **Runtime state machine** uses a **per-`sessionId` memory map** plus **SQLite** when init succeeds (see above). Writes are **debounced** (200ms per session) and **flushed** on `loadSessionRow`, `clearAllSessions`, and **`before-quit`** via `closeRuntimeSqlitePersistence`. **`wc-*` cleanup**: on `webContents` **`destroyed`**, `dropRuntimeSessionForWebContents` removes memory + cancels debounced work + deletes the SQLite row (`main.js` + `purgeRuntimeSession`). **Migrations**: `runtime-sqlite-migrations.js` drives **`PRAGMA user_version`** (current app schema **`RUNTIME_SQLITE_SCHEMA_VERSION = 1`**); extend with chained `if (current < N)` steps when the row shape changes. **Not yet**: encrypting the DB file.
2. **HTTP E2E** (`test:wechat-e2e`, etc.) and **desktop Electron** (IPC + Dev window) are **two separate paths**: the former uses network scripts only; there is **no** single packaged “desktop E2E” that launches Electron and drives IPC/UI in one command.
3. **`npm audit` remediation**, **husky / lint-staged**, and **installers / auto-update** (e.g. `electron-builder`, Squirrel) are **not** in the current milestone.
4. **Git repository layout**: if the repo root or `apps/desktop` path differs from what [`.github/workflows/desktop-ci.yml`](../../../.github/workflows/desktop-ci.yml) assumes, update **`paths`**, **`working-directory`**, **`node-version-file`**, **`cache-dependency-path`**, and similar so CI points at the real desktop app directory.

---

## 已知边界与后续方向（未纳入当前交付）

1. **运行时状态机**：内存分桶 + **SQLite**（见上文，含防抖、quit flush、**`wc-*` 清理**）。**迁移骨架**：`runtime-sqlite-migrations.js` + **`PRAGMA user_version`**（当前版本常量 **`RUNTIME_SQLITE_SCHEMA_VERSION`**）。尚未做：库文件加密等。
2. **HTTP E2E**（`test:wechat-e2e` 等）与 **桌面 Electron**（IPC + Dev 窗体）是**两条线**：前者只走网络脚本；**没有**「一条命令自动起 Electron + 驱动 UI + 断言 IPC」的一键桌面 E2E 封装。
3. **`npm audit` 修复**、**husky / lint-staged**、**安装包 / 自动更新**（如 `electron-builder`、Squirrel 等）**未纳入**当前进度。
4. **Git 仓库根目录**若与 workflow 假设的目录不一致，需调整 **`.github/workflows/desktop-ci.yml`** 中的 **`paths`**、**`working-directory`**、**`node-version-file`**、**`cache-dependency-path`** 等，使之指向实际的 desktop 应用路径。

---

## Suggested next steps（建议的下一步）

Order is **pragmatic**, not a commitment—reorder after you pick a release theme.

1. **Confirm repo layout vs CI** — Ensure [`.github/workflows/desktop-ci.yml`](../../../.github/workflows/desktop-ci.yml) `paths` / `working-directory` match where this app actually lives in Git; run a no-op PR touching `project/apps/desktop` to verify the workflow triggers and passes. Workflow runs **`npm ci` → `npm run lint` → `npm test`** on **ubuntu-latest** (see file). **Local Windows:** close every **Electron** process (including this app) before **`npm ci`** / **`npm install`**, or **`EBUSY`** on `electron/dist/icudtl.dat` can leave `node_modules` half-installed.
2. **Product slice (chosen: 2A)** — **SQLite persistence** (debounced + quit flush + **`wc-*` lifecycle purge**) + **`user_version` migration skeleton** + **sessionId** + **preload** are in place. **Next** for 2A: add **`migrationV1ToV2`** (etc.) when columns/tables change, and **encryption-at-rest** if required. **2B** desktop E2E stays **deferred**.
3. **Developer hygiene (when ready)** — `npm audit` triage, then optional **husky / lint-staged** if the team wants pre-commit gates.
4. **Shipping** — Installers and auto-update (**electron-builder** / Squirrel / etc.) only when you have a named release channel and signing story.

---

## Maintenance

When scope changes, update this file first; keep README cross-links one line if you only need a pointer.
