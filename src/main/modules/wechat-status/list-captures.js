const fs = require("node:fs/promises");
const path = require("node:path");
const { getWechatCapturesDir } = require("./capture-paths");

const PNG_EXT = ".png";

function normalizeLimit(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    return 20;
  }
  return Math.min(Math.trunc(n), 200);
}

async function listWechatCaptures({ limit } = {}) {
  const capturesDir = getWechatCapturesDir();
  const maxItems = normalizeLimit(limit);

  let entries = [];
  try {
    entries = await fs.readdir(capturesDir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        ok: true,
        code: "OK",
        message: "wechat capture list succeeded",
        data: {
          dir: capturesDir,
          total: 0,
          items: [],
        },
      };
    }
    throw error;
  }

  const files = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(PNG_EXT))
    .map((entry) => entry.name);

  const stats = await Promise.all(
    files.map(async (name) => {
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

  const items = stats
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, maxItems)
    .map((item) => ({
      ...item,
      mtime: new Date(item.mtimeMs).toISOString(),
    }));

  return {
    ok: true,
    code: "OK",
    message: "wechat capture list succeeded",
    data: {
      dir: capturesDir,
      total: stats.length,
      items,
    },
  };
}

module.exports = {
  listWechatCaptures,
};
