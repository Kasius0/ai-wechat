const fs = require("node:fs/promises");
const path = require("node:path");
const { getWechatCapturesDir } = require("./capture-paths");

const PNG_EXT = ".png";

function toPositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    return fallback;
  }
  return Math.trunc(n);
}

async function readCaptureFiles(capturesDir) {
  let entries = [];
  try {
    entries = await fs.readdir(capturesDir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const names = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(PNG_EXT))
    .map((entry) => entry.name);

  return await Promise.all(
    names.map(async (name) => {
      const fullPath = path.join(capturesDir, name);
      const stat = await fs.stat(fullPath);
      return {
        name,
        path: fullPath,
        size: stat.size,
        mtimeMs: stat.mtimeMs,
      };
    })
  );
}

async function cleanupWechatCaptures({ keepLatest, olderThanHours } = {}) {
  const capturesDir = getWechatCapturesDir();
  const keepCount = toPositiveInt(keepLatest, 20);
  const oldHours = toPositiveInt(olderThanHours, 0);
  const now = Date.now();
  const thresholdMs = oldHours > 0 ? now - oldHours * 60 * 60 * 1000 : null;

  const files = await readCaptureFiles(capturesDir);
  const sorted = files.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const keepSet = new Set(sorted.slice(0, keepCount).map((item) => item.path));

  const toDelete = sorted.filter((item) => {
    const byCount = !keepSet.has(item.path);
    const byAge = thresholdMs !== null && item.mtimeMs < thresholdMs;
    return byCount || byAge;
  });

  let deletedCount = 0;
  let freedBytes = 0;
  for (const item of toDelete) {
    try {
      await fs.unlink(item.path);
      deletedCount += 1;
      freedBytes += item.size;
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
    }
  }

  return {
    ok: true,
    code: "OK",
    message: "wechat capture cleanup succeeded",
    data: {
      dir: capturesDir,
      scanned: sorted.length,
      deleted: deletedCount,
      freedBytes,
      keepLatest: keepCount,
      olderThanHours: oldHours,
    },
  };
}

module.exports = {
  cleanupWechatCaptures,
};
