const { execFileSync } = require("node:child_process");

function readWechatWindowTitle() {
  const psScript = `
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$process = Get-Process |
  Where-Object { $_.ProcessName -eq 'Weixin' -and $_.MainWindowHandle -ne 0 } |
  Select-Object -First 1 Id, ProcessName, MainWindowTitle, MainWindowHandle

if ($null -eq $process) {
  @{ ok = $false; code = 'WECHAT_NOT_FOUND'; message = 'No active Weixin window found' } |
    ConvertTo-Json -Compress
  exit 0
}

@{
  ok = $true
  code = 'OK'
  processId = $process.Id
  processName = $process.ProcessName
  title = $process.MainWindowTitle
  handle = $process.MainWindowHandle
} | ConvertTo-Json -Compress
`.trim();

  const output = execFileSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", psScript],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );

  return JSON.parse(output.trim());
}

try {
  const result = readWechatWindowTitle();
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        code: "READ_FAILED",
        message: error.message,
      },
      null,
      2
    )
  );
  process.exitCode = 1;
}
