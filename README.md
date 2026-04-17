# WeChat Automation Quick Start

This project includes a reusable WeChat automation flow with retry and checks, plus mock/real E2E commands.

## Prerequisites

- Windows PowerShell
- Node.js and npm

## Commands

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
