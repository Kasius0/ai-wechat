# 微信自动化（团队速用版）

## 30 秒上手（只用这 3 条）

### 1）日常回归（Mock 一键跑通）

```powershell
npm --prefix F:\AI\project\apps\desktop run test:wechat-e2e -- "测试消息"
```

### 2）端口冲突（8787 被占用时）

```powershell
npm --prefix F:\AI\project\apps\desktop run wechat-api:restart
```

### 3）联调真实服务（真实 API 已启动）

```powershell
$env:WECHAT_AUTOMATION_BASE_URL="http://127.0.0.1:8787"; $env:WECHAT_AUTOMATION_API_PREFIX="api/wechat"; npm --prefix F:\AI\project\apps\desktop run test:wechat-e2e:real -- "测试消息"
```

## 一、最常用命令

### 0）代码检查（ESLint）

```powershell
npm --prefix F:\AI\project\apps\desktop run lint
npm --prefix F:\AI\project\apps\desktop run lint:fix
```

### 启动桌面应用

```powershell
npm --prefix F:\AI\project\apps\desktop run start
# 兼容别名：
npm --prefix F:\AI\project\apps\desktop run dev:electron
# 加密库的日常启动：
$env:RUNTIME_SQLITE_KEY="REPLACE_WITH_STRONG_KEY"
npm --prefix F:\AI\project\apps\desktop run start:encrypted
# 一次性加密迁移启动：
$env:RUNTIME_SQLITE_MIGRATE_KEY="REPLACE_WITH_STRONG_KEY"
npm --prefix F:\AI\project\apps\desktop run start:migrate
# 启动验收（要求库已加密且 key 正确）：
$env:RUNTIME_SQLITE_KEY="REPLACE_WITH_STRONG_KEY"
npm --prefix F:\AI\project\apps\desktop run verify:encrypted-start
# wrong-key 失败信号验收（故意设置错误 key）：
$env:RUNTIME_SQLITE_KEY="INTENTIONALLY_WRONG_KEY"
npm --prefix F:\AI\project\apps\desktop run verify:wrong-key-fail
```

配置：`eslint.config.js`（flat config）；`src/main` / `preload` / `scripts` / `test` 为 Node，`src/renderer` 为浏览器脚本。CI 在单元测试前执行 `npm run lint`。根目录 **`.editorconfig`**；**`.vscode/`** 推荐安装 ESLint、EditorConfig 扩展，并启用 flat config（`eslint.useFlatConfig`）。

### 1）一键 Mock 回归（推荐日常使用）

```powershell
npm --prefix F:\AI\project\apps\desktop run test:wechat-e2e -- "测试消息"
```

说明：自动清理 8787 占用、启动 mock 服务、执行发送、完成校验。

### 2）真实服务回归（需要真实 API 已启动）

```powershell
$env:WECHAT_AUTOMATION_BASE_URL="http://127.0.0.1:8787"
$env:WECHAT_AUTOMATION_API_PREFIX="api/wechat"   # 可选
npm --prefix F:\AI\project\apps\desktop run test:wechat-e2e:real -- "测试消息"
```

### 3）桌面启动 E2E（2B 最小切片）

```powershell
# 明文 / 默认启动
npm --prefix F:\AI\project\apps\desktop run test:desktop-e2e

# 若本地 runtime 库已加密
$env:RUNTIME_SQLITE_KEY="REPLACE_WITH_STRONG_KEY"
npm --prefix F:\AI\project\apps\desktop run test:desktop-e2e
```

脚本会检查启动日志中的 `runtime-sqlite-encryption-config`、`runtime-sqlite-ready`、`app-ready`，随后自动退出。

流程级 runtime 编排验收：

```powershell
$env:RUNTIME_SQLITE_KEY="REPLACE_WITH_STRONG_KEY"   # 加密库时需要
npm --prefix F:\AI\project\apps\desktop run test:desktop-e2e:flow
```

`test:desktop-e2e:flow` 会在桌面主进程内执行固定 runtime 事件链（`reset -> session_start -> wechat_normal -> trigger_send -> send_ok -> cooldown_done`），并要求出现 `desktop-e2e-flow-pass` 日志。

## 二、常见问题速查

### 报错：`npm install` / `npm ci` 出现 `EBUSY`、`electron\dist\icudtl.dat`

原因：本机 **`electron` 目录被占用**（例如正在运行 `dev:electron`、其它 Electron 应用锁住了文件）。  
解决：先**退出**正在运行的桌面 Dev 应用与其它 Electron 进程，再执行 `npm install` / `npm ci`；必要时在任务管理器中结束 `electron.exe` 后重试。

### ABI 约定（`better-sqlite3`）

- CI / Node 单测：使用 `npm ci`，然后 `npm run lint`、`npm test`。
- 运行 Electron 桌面进程前（按需）：执行 `npm --prefix F:\AI\project\apps\desktop run rebuild:electron`，再执行 `npm --prefix F:\AI\project\apps\desktop run dev:electron`。
- 不要在 `postinstall` 强制 `electron-rebuild`，否则可能把原生模块重编到 Electron ABI，影响同环境下 Node 单测 ABI。

### Runtime SQLite 加密迁移（最小可用）

- 现已支持通过环境变量在启动时执行 **明文库 -> SQLCipher** 迁移（默认关闭）。
- 设置 `RUNTIME_SQLITE_MIGRATE_TO_SQLCIPHER=1`，并提供 `RUNTIME_SQLITE_MIGRATE_KEY`（未提供时回退读取 `RUNTIME_SQLITE_KEY`）。
- 迁移目标是 `app.getPath("userData")/runtime-sessions.sqlite`；不支持 `:memory:`。
- 生产建议：仅在可控迁移窗口启用这些变量，迁移成功后立即移除 `RUNTIME_SQLITE_MIGRATE_TO_SQLCIPHER`（及临时迁移密钥变量），避免重复尝试。
- 若迁移失败，当次运行会保留明文模式，并记录 `runtime-sqlite-encryption-migrate-failed` 日志。
- 已加密库的换钥可用代码接口 `rotateRuntimeSqliteKey(oldKey, newKey)`（`runtime-sqlite-persistence`）。
- 密钥轮换与回滚操作文档见 `RUNTIME_SQLITE_KEY_RUNBOOK.md`。

### 报错：`ENOENT ... package.json`

原因：在错误目录执行了 `npm run`。  
解决：使用 `npm --prefix F:\AI\project\apps\desktop ...`，或先 `cd` 到项目目录。

### 报错：`EADDRINUSE 127.0.0.1:8787`

原因：8787 端口已被占用。  
解决：

```powershell
npm --prefix F:\AI\project\apps\desktop run wechat-api:restart
```

或手动清理：

```powershell
$pidToKill = (netstat -ano | Select-String "127.0.0.1:8787.*LISTENING" | ForEach-Object { ($_ -split "\s+")[-1] } | Select-Object -First 1)
if ($pidToKill) { taskkill /PID $pidToKill /F }
```

### 报错：`ECONNREFUSED`

原因：目标服务未启动或地址/端口不对。  
解决：
- 用 mock：直接跑 `test:wechat-e2e`
- 用 real：先启动真实服务，再检查环境变量和端口监听

```powershell
echo $env:WECHAT_AUTOMATION_BASE_URL
echo $env:WECHAT_AUTOMATION_API_PREFIX
netstat -ano | Select-String "127.0.0.1:8787.*LISTENING"
```

## 三、成功判定

结果里出现以下字段即表示通过：
- `code: "SERVER_READY"`（mock 模式）
- `code: "OK"`
- `echoChecked: true`
- `sendVerified: true`

## 四、IPC 开发约定（Week1 收口）

### 1）命名规范

- 统一使用：`<domain>:<action>`
- 当前域：
  - `app:*`（应用信息与连通）
  - `wechat:*`（微信窗口与编排）
  - `rpa:*`（键鼠输入）

### 2）统一返回结构

- 成功：
  - `ok: true`
  - `code: "OK"`
  - `message: string`
  - `data: object`
- 失败：
  - `ok: false`
  - `code: <错误码常量>`
  - `message: string`
  - `data: object`

### 3）错误码统一管理

- 错误码常量文件：`src/main/ipc/error-codes.js`
- Handler 统一通过 `defineHandler` 包装，避免裸抛出导致渲染层无结构化错误

### 3.1）`defineHandler` 与 `attachRuntimeOnError`

- 选项 **`attachRuntimeOnError: true`**（可选，默认 `false`）：`try` 外未捕获异常时，除原有 `data.name` 等字段外，用 **`enrich-wechat-ipc-result`** 合并当前 **`getRuntimeSnapshot()`** 到 **`data.runtime`**。
- **所有 `wechat:*`** 的 `defineHandler` 已开启；`app` / `rpa` / `runtime` 域保持默认（不附带，避免无关依赖）。
- 纯函数实现：`src/main/modules/runtime/enrich-wechat-ipc-result.js`；单测：`test/enrich-wechat-ipc-result.test.js`、`test/ipc-define-handler-runtime.test.js`。

### 4）IPC 文件落点

- 聚合入口：`src/main/ipc/index.js`
- 分模块注册：
  - `src/main/ipc/app-ipc.js`
  - `src/main/ipc/wechat-ipc.js`
  - `src/main/ipc/rpa-ipc.js`
- 工具与规范：
  - `src/main/ipc/ipc-utils.js`
  - `src/main/ipc/error-codes.js`

## 五、状态判定测试矩阵（Week2）

### 1）真实状态读取

- 按钮：`微信状态详情`
- 目标：读取真实窗口状态（正常使用应为 `normal`）

### 2）模拟状态按钮

- `状态详情（模拟最小化）`
  - 预期：`status = minimized`
  - 预期错误码：`WECHAT_MINIMIZED`
- `状态详情（模拟小窗）`
  - 预期：`status = tiny_window`
  - 预期错误码：`WECHAT_TINY_WINDOW`
- `状态详情（模拟越界）`
  - 预期：`status = out_of_bounds`
  - 预期错误码：`WECHAT_OUT_OF_BOUNDS`
- `状态详情（模拟空标题）`
  - 预期：`status = title_empty`
  - 预期错误码：`WECHAT_TITLE_EMPTY`

### 3）判定优先级（当前实现）

- `minimized` 优先级最高
- 其次 `out_of_bounds`
- 其次 `tiny_window`
- 其次 `title_empty`
- 无异常则 `normal`

### 4）一致性要求

- `微信窗口上下文` 与 `微信状态详情` 共用同一判定函数
- 两个接口的 `status/errorCode/reasons` 必须保持一致

## 六、Quick Send 参数收口（Week4）

`wechat:quick-send` 的高级参数统一收口到 `options` 字段，便于后续扩展。

示例请求：

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

字段说明：

- `options.dryRun`：只执行聚焦/移动/点击，不输入、不回车
- `options.retry.maxRetries`：步骤级重试次数（0-3）
- `options.retry.delayMs`：重试间隔毫秒
- `options.injectFailure`：开发态失败注入，用于验证重试路径
- `options.traceId`：可选；与主进程 JSON 日志、`data.traceId` 对齐（不传则自动生成）
- 向后兼容：历史顶层 `retry` / `injectFailure` 仍可使用

## 七、Week 4 收尾：主进程日志与终端检索

- **日志文件（仓库根下）：** `F:\AI\project\runtime\logs\desktop-main.log`（`wechat:quick-send` 成功/失败返回里也有 `data.logFilePath`）。
- **轮转：** 单文件超过 **5 MiB** 时自动改名为 `desktop-main.<时间戳>.log` 并新建当前文件；默认最多保留 **5** 个归档。可用环境变量覆盖：`DESKTOP_MAIN_LOG_MAX_BYTES`、`DESKTOP_MAIN_LOG_KEEP`。
- **PowerShell 注意：** 双引号路径里 `\r` 会被当成回车，**不要**写 `"F:\AI\project\runtime\..."` 去跑 `rg`。请用**单引号**或 **正斜杠路径**：

```powershell
rg -F 'dryrun-xxxx' 'F:\AI\project\runtime\logs\desktop-main.log'
# 或
rg -F 'dryrun-xxxx' 'F:/AI/project/runtime/logs/desktop-main.log'
```

- **不用 rg 时：**

```powershell
Select-String -LiteralPath 'F:\AI\project\runtime\logs\desktop-main.log' -Pattern 'dryrun-xxxx'
```

## 八、运行时状态机（Week5-1 / Week5-2 / Week5-3，内存版）

- **IPC：** `runtime:state`（查询）、`runtime:event`（投递事件，body 含 `event`、`traceId` 可选）。
- **状态：** `idle` → `awaiting_context` → `ready_to_reply` → `sending` → `cooldown` → `idle`；异常进 `error`，仅 `reset` 回 `idle`。
- **事件：** `session_start`、`wechat_normal`、`wechat_abnormal`、`trigger_send`、`send_ok`、`send_fail`、`cooldown_done`、`reset`。
- **preload：** `window.runtime.state()`、`window.runtime.event(payload)`。
- **Dev 界面：** 「运行时状态机（Week5-1 / Week5-2）」分组按钮；标题旁展示 **当前状态**（与 `allowedEvents` 同步刷新）；推荐顺序：开始会话 → 模拟微信正常 → 模拟触发发送 → 模拟发送成功 → 模拟冷却结束 → 查看运行时状态。

### Week5-2：按 allowedEvents 同步按钮

- **数据来源：** `runtime:state` 与每次 `runtime:event` 的响应体均包含 `data.allowedEvents`（当前状态下合法的事件名列表）；非法跳转时错误响应里同样带有当前状态的 `allowedEvents`。
- **行为：** 每个模拟按钮对应一个事件名；仅当该事件出现在 `allowedEvents` 中时为 **启用**，否则 **禁用**（减少重复点击导致的 `RUNTIME_INVALID_TRANSITION`）。「查看运行时状态」始终启用，不参与按事件禁用。
- **刷新时机：** 页面加载时拉取一次 `runtime:state` 初始化按钮；每次点击任意 `runtime:event` 按钮并在输出区更新 JSON 后，用响应中的 `allowedEvents` 更新 UI；若响应未带列表则再请求 `runtime:state` 兜底。
- **高亮：** 当前允许点击的按钮增加描边样式（`runtime-btn-allowed`），禁用按钮降低透明度（`runtime-btn-blocked`）；样式与逻辑见 `src/renderer/renderer.css`、`src/renderer/renderer.js`。
- **状态摘要：** 分组标题旁 `#runtimeStateSummary` 展示 `data.state`；与按钮同步，在非法跳转时展示的是 **跳转前** 状态（与 `allowedEvents` 一致）。

### Week5-3：`wechat:quick-send` 自动 dispatch

- **入口：** 主进程 `wechat:quick-send`（`src/main/ipc/wechat-ipc.js`）在记录 `start` 日志后，通过 `src/main/modules/runtime/quick-send-runtime-bridge.js` 调用 `dispatchRuntimeEvent`，与 Dev 手动按钮共用同一套内存状态机。
- **会话起点：** 每次 quick-send 先 **`reset`** 再 **`session_start`**，避免与上一次 Dev 演练残留状态冲突；`traceId` 与本次 quick-send 一致，便于日志关联。
- **阶段映射：**
  - 焦点 / 鼠标移动 / 点击 任一失败 → **`wechat_abnormal`**（仍处在 `awaiting_context` 时的前置失败统一记为异常路径）。
  - 点击成功后 **`getWechatStatusDetail`**：`status !== normal` → **`wechat_abnormal`** 并返回失败；否则 **`wechat_normal`**。
  - **DryRun：** 仅到 **`wechat_normal`** 为止，不进入 `trigger_send` / `send_*` / `cooldown_done`，状态停在 `ready_to_reply`。
  - **非 DryRun：** 输入前 **`trigger_send`**；`type-text` / `keyboard-enter` 失败 → **`send_fail`**；整条发送成功 → **`send_ok`** 并立即 **`cooldown_done`** 回到 `idle`。
- **不一致时：** 若顺序与主进程预期不符，`dispatchRuntimeEvent` 会返回 `RUNTIME_INVALID_TRANSITION`；桥接层会写主日志 `runtime:quick-send-bridge` / `dispatch-mismatch`（含 `allowedEvents`），便于排查。
- **Dev 联动（Week5-2 延续）：** 「快捷发送」四类按钮以及 **其它微信 Dev 按钮**（窗口上下文、状态详情/模拟、聚焦、截图/列表/清理等）在每次 `click` 的 `finally` 中调用 `refreshRuntimeUi()`，在 IPC 返回后拉取 `runtime:state`，刷新 **当前状态** 与按 `allowedEvents` 启停的按钮。实现见 `src/renderer/renderer.js`。
- **返回体 `data.runtime`：** **所有 `wechat:*` IPC** 在成功、业务失败及 **`defineHandler` 捕获的异常** 路径下，均会在 `data` 内合并 **`runtime`** 快照（`state`、`allowedEvents`、`lastTraceId`、`lastError`）。成功/业务失败由 `enrich-wechat-ipc-result` 在 `wechat-ipc.js` 返回前合并（`quick-send` 仍走 `quickSendData`）；异常路径由 **`defineHandler(..., { attachRuntimeOnError: true })`** 合并；若 `data` 已含 `runtime` 则不再覆盖。
- **其它 `wechat:*` 单步 IPC：** `src/main/modules/runtime/single-step-wechat-runtime-sync.js`；仅在当前状态为 **`awaiting_context`** 时才会根据结果 `dispatch`（避免误伤 idle / `ready_to_reply` 等）。约定如下（`traceId` 可选，缺省自动生成；preload 对 `windowContext` / `statusDetail` / `focusWindow` 已支持传入 `{ traceId }`）：
  - **`wechat:window-context`**、**`wechat:focus-window`**：仅当返回 **`!ok`** 时 → **`wechat_abnormal`**。
  - **`wechat:status-detail`**、**`wechat:status-detail-simulate`**：与 quick-send 状态判定一致 → **`wechat_normal`** 或 **`wechat_abnormal`**。
  - **`wechat:capture-window-if-normal`**、**`wechat:capture-window-with-simulate`**：status 失败或非 normal → 按 status-like 同步；截图失败 → **`wechat_abnormal`**；截图成功且仍在 **`awaiting_context`** → **`wechat_normal`**。
  - **`wechat:list-captures`**、**`wechat:cleanup-captures`**：不改动状态机。
  - 非法跳转时主日志 **`runtime:wechat-single-step`** / **`dispatch-mismatch`**（与 quick-send 桥接类似）。
- **单元测试：** `npm --prefix F:\AI\project\apps\desktop test`（`scripts/run-unit-tests.js` 自动跑 `test/*.test.js`）；含 `get-runtime-highlight-block`（Dev 输出区摘要纯函数）、`enrich-wechat-ipc-result`、`ipc-define-handler-runtime`、`session-state-machine`、`quick-send-runtime-bridge`、`single-step-wechat-runtime-sync`。
- **CI：** 仓库根目录 `.github/workflows/desktop-ci.yml`，在 `project/apps/desktop` 下执行 **`npm ci` → `npm run lint` → `npm test`**（`push`/`pull_request` 且变更命中 desktop 或该 workflow 时触发）；Node 版本与 **`project/apps/desktop/.nvmrc`**（当前为 20）及 **`package.json` 的 `engines.node`**（`>=20`）一致。
- **Dev 输出区：** 当 IPC 返回 JSON 且含 **`data.runtime`**（对象）时，主区域仍为完整 JSON，下方增加紫色边框摘要块；**`runtime:state` / `runtime:event`** 等返回中带 **`state` + `allowedEvents`**（且无 `data.runtime`、非 quick-send 的 `data.action`）时，下方显示 **「运行时快照」**。摘要逻辑为纯函数 **`getRuntimeHighlightBlock`**：`src/renderer/get-runtime-highlight-block.js`（先于 `renderer.js` 加载），`setOutput` 见 `renderer.js`，样式见 `renderer.css`；单测 `test/get-runtime-highlight-block.test.js`。

## 九、已知边界与后续方向（未纳入当前交付）

详见 **[ROADMAP.md](ROADMAP.md)**（中英文合订，单独维护）。
