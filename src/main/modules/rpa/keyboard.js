const { execFileSync } = require("node:child_process");

function escapePsSingleQuoted(str) {
  return String(str).replace(/'/g, "''");
}

function runPowerShell(script) {
  const output = execFileSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );
  return JSON.parse(output.trim());
}

function buildKeyboardKeyScript({ keyCode }) {
  return `
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)

Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait([char]${keyCode})

@{
  ok = $true
  code = 'OK'
  message = 'keyboard key succeeded'
  data = @{
    ok = $true
    action = 'keyboard-key'
    keyCode = ${keyCode}
    operation = 'tap'
  }
} | ConvertTo-Json -Compress -Depth 6
`.trim();
}

function buildTypeTextScript({ text, delayMs }) {
  const escaped = escapePsSingleQuoted(text);
  return `
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)

Add-Type -AssemblyName System.Windows.Forms

$text = '${escaped}'
$delay = ${delayMs}
foreach ($c in $text.ToCharArray()) {
  [System.Windows.Forms.SendKeys]::SendWait($c)
  Start-Sleep -Milliseconds $delay
}

@{
  ok = $true
  code = 'OK'
  message = 'type text succeeded'
  data = @{
    ok = $true
    action = 'type-text'
    length = $text.Length
    delayMs = $delay
  }
} | ConvertTo-Json -Compress -Depth 6
`.trim();
}

function keyboardKeyTap({ keyCode }) {
  const code = Number(keyCode);
  if (!Number.isFinite(code)) {
    throw new Error("invalid keyCode");
  }
  return runPowerShell(buildKeyboardKeyScript({ keyCode: Math.trunc(code) }));
}

function typeText({ text, delayMs = 20 }) {
  if (!text || !String(text).trim()) {
    throw new Error("text is empty");
  }
  const delay = Number(delayMs);
  if (!Number.isFinite(delay) || delay < 0) {
    throw new Error("invalid delayMs");
  }
  return runPowerShell(
    buildTypeTextScript({
      text: String(text),
      delayMs: Math.trunc(delay),
    })
  );
}

module.exports = {
  keyboardKeyTap,
  typeText,
};

