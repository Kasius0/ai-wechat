const { execFileSync } = require("node:child_process");

function focusWechatWindowViaPowerShell() {
  const psScript = `
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)

Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class Win32 {
  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
}
"@

$process = Get-Process |
  Where-Object { $_.ProcessName -eq 'Weixin' -and $_.MainWindowHandle -ne 0 } |
  Select-Object -First 1 Id, ProcessName, MainWindowTitle, MainWindowHandle

if ($null -eq $process) {
  @{
    ok = $false
    code = 'WECHAT_NOT_FOUND'
    message = 'No active Weixin window found'
  } | ConvertTo-Json -Compress -Depth 6
  exit 0
}

$hwnd = [IntPtr] $process.MainWindowHandle

# 先尝试恢复显示（ShowWindowAsync: 9 = SW_RESTORE）
[void][Win32]::ShowWindowAsync($hwnd, 9)
$focused = [Win32]::SetForegroundWindow($hwnd)

@{
  ok = $true
  code = 'OK'
  message = 'focus wechat window succeeded'
  data = @{
    ok = $true
    action = 'focus-wechat-window'
    handle = [int64]$process.MainWindowHandle
    focused = [bool]$focused
    window = @{
      processId = $process.Id
      processName = $process.ProcessName
      title = $process.MainWindowTitle
      handle = [int64]$process.MainWindowHandle
    }
  }
} | ConvertTo-Json -Compress -Depth 6
`.trim();

  const output = execFileSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", psScript],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );

  return JSON.parse(output.trim());
}

function focusWechatWindow() {
  return focusWechatWindowViaPowerShell();
}

module.exports = {
  focusWechatWindow,
};

