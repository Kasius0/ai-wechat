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

## 二、常见问题速查

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
