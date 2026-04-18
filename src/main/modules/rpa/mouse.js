const { execFileSync } = require("node:child_process");

function toInt(value, name) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`invalid ${name}`);
  }
  return Math.trunc(n);
}

function buildMouseMoveScript({ x, y }) {
  return `
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)

Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class Win32 {
  [DllImport("user32.dll")]
  public static extern bool SetCursorPos(int X, int Y);
}
"@

$ok = [Win32]::SetCursorPos(${x}, ${y})
@{
  ok = [bool]$ok
  code = if ($ok) { 'OK' } else { 'RPA_MOUSE_MOVE_FAILED' }
  message = if ($ok) { 'mouse move succeeded' } else { 'mouse move failed' }
  data = @{
    ok = [bool]$ok
    action = 'mouse-move'
    x = ${x}
    y = ${y}
    coordinateMode = 'screen'
  }
} | ConvertTo-Json -Compress -Depth 6
`.trim();
}

function buildMouseClickScript({ button }) {
  const btn = button === "right" ? "right" : "left";
  const downFlag = btn === "right" ? 0x0008 : 0x0002; // RIGHTDOWN : LEFTDOWN
  const upFlag = btn === "right" ? 0x0010 : 0x0004; // RIGHTUP : LEFTUP

  return `
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)

Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class Win32 {
  [DllImport("user32.dll")]
  public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);
}
"@

[Win32]::mouse_event(${downFlag}, 0, 0, 0, 0)
[Win32]::mouse_event(${upFlag}, 0, 0, 0, 0)

@{
  ok = $true
  code = 'OK'
  message = 'mouse click succeeded'
  data = @{
    ok = $true
    action = 'mouse-button'
    button = '${btn}'
    operation = 'click'
  }
} | ConvertTo-Json -Compress -Depth 6
`.trim();
}

function runPowerShell(script) {
  const output = execFileSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );
  return JSON.parse(output.trim());
}

function mouseMoveScreen({ x, y }) {
  const xx = toInt(x, "x");
  const yy = toInt(y, "y");
  return runPowerShell(buildMouseMoveScript({ x: xx, y: yy }));
}

function mouseClick({ button = "left" } = {}) {
  return runPowerShell(buildMouseClickScript({ button }));
}

module.exports = {
  mouseMoveScreen,
  mouseClick,
};

