const fs = require("node:fs");
const path = require("node:path");

// __dirname = apps/desktop/src/main/logging → five levels up = repo root (F:\AI\project)
const LOG_FILE_PATH = path.resolve(__dirname, "../../../../../runtime/logs/desktop-main.log");

const MAX_LOG_BYTES = Math.max(
  1024 * 1024,
  Number(process.env.DESKTOP_MAIN_LOG_MAX_BYTES) || 5 * 1024 * 1024
);
const MAX_ROTATED_FILES = Math.max(1, Number(process.env.DESKTOP_MAIN_LOG_KEEP) || 5);

function ensureLogDir() {
  fs.mkdirSync(path.dirname(LOG_FILE_PATH), { recursive: true });
}

function pruneOldRotated() {
  const dir = path.dirname(LOG_FILE_PATH);
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return;
  }
  const rotated = names
    .filter((name) => /^desktop-main\..+\.log$/.test(name))
    .map((name) => {
      const full = path.join(dir, name);
      return { name, full, mtimeMs: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  for (let i = MAX_ROTATED_FILES; i < rotated.length; i += 1) {
    try {
      fs.unlinkSync(rotated[i].full);
    } catch {
      /* ignore */
    }
  }
}

function rotateIfNeeded() {
  ensureLogDir();
  let stat;
  try {
    stat = fs.statSync(LOG_FILE_PATH);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return;
    }
    throw error;
  }
  if (stat.size < MAX_LOG_BYTES) {
    return;
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const rotatedPath = path.join(path.dirname(LOG_FILE_PATH), `desktop-main.${stamp}.log`);
  fs.renameSync(LOG_FILE_PATH, rotatedPath);
  pruneOldRotated();
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      module: "main-logger",
      event: "log-rotated",
      from: LOG_FILE_PATH,
      archivedAs: rotatedPath,
      maxBytes: MAX_LOG_BYTES,
    })
  );
}

function writeMainLog(record) {
  const line = `${JSON.stringify(record)}\n`;
  rotateIfNeeded();
  ensureLogDir();
  fs.appendFileSync(LOG_FILE_PATH, line, { encoding: "utf8" });
}

function logMain(record) {
  const payload = {
    ts: new Date().toISOString(),
    ...record,
  };
  writeMainLog(payload);
  console.log(JSON.stringify(payload));
}

module.exports = {
  LOG_FILE_PATH,
  MAX_LOG_BYTES,
  MAX_ROTATED_FILES,
  logMain,
};
