const { execFileSync } = require("node:child_process");
const { evaluateWechatStatus } = require("./status-evaluator");

function readWechatWindowContextViaPowerShell() {
  const psScript = `
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)

Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class Win32 {
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
  }

  [DllImport("user32.dll", SetLastError=true)]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);

  [DllImport("user32.dll")]
  public static extern bool IsIconic(IntPtr hWnd);
}
"@

$candidateNames = @('Weixin', 'WeChat')
$processes = Get-Process |
  Where-Object { $candidateNames -contains $_.ProcessName -and $_.MainWindowHandle -ne 0 } |
  Select-Object Id, ProcessName, MainWindowTitle, MainWindowHandle

$process = $processes |
  Sort-Object -Property @{ Expression = { [string]::IsNullOrWhiteSpace($_.MainWindowTitle) } }, @{ Expression = { $_.Id } } |
  Select-Object -First 1

if ($null -eq $process) {
  @{
    ok = $false
    code = 'WECHAT_NOT_FOUND'
    message = 'No active WeChat window found'
    data = @{
      triedProcessNames = $candidateNames
    }
  } |
    ConvertTo-Json -Compress -Depth 6
  exit 0
}

$hwnd = [IntPtr] $process.MainWindowHandle
$rect = New-Object Win32+RECT
$gotRect = [Win32]::GetWindowRect($hwnd, [ref]$rect)
$isMinimized = [Win32]::IsIconic($hwnd)

$window = @{
  processId = $process.Id
  processName = $process.ProcessName
  title = $process.MainWindowTitle
  handle = [int64]$process.MainWindowHandle
  rect = if ($gotRect) {
    @{
      left = $rect.Left
      top = $rect.Top
      right = $rect.Right
      bottom = $rect.Bottom
      width = ($rect.Right - $rect.Left)
      height = ($rect.Bottom - $rect.Top)
    }
  } else { $null }
  isMinimized = [bool]$isMinimized
  isOutOfBounds = $false
  isTinyWindow = $false
  isTitleEmpty = [string]::IsNullOrWhiteSpace($process.MainWindowTitle)
}

@{
  ok = $true
  code = 'OK'
  message = 'wechat window context succeeded'
  data = @{
    status = 'normal'
    errorCode = 'WECHAT_STATUS_OK'
    window = $window
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

function getWechatWindowContext() {
  const result = readWechatWindowContextViaPowerShell();
  if (!result?.ok) {
    return result;
  }

  const windowInfo = result?.data?.window;
  const detail = evaluateWechatStatus(windowInfo);

  return {
    ...result,
    data: {
      ...result.data,
      status: detail.status,
      errorCode: detail.errorCode,
      reasons: detail.reasons,
      window: {
        ...windowInfo,
        isOutOfBounds: detail.reasons.includes("out-of-bounds"),
        isTinyWindow: detail.reasons.includes("tiny-window"),
      },
    },
  };
}

module.exports = {
  getWechatWindowContext,
};

