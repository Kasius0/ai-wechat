const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const testDir = path.join(root, "test");
const files = fs.readdirSync(testDir).filter((f) => f.endsWith(".test.js")).sort();
if (files.length === 0) {
  console.error("run-unit-tests: no *.test.js in test/");
  process.exit(1);
}
const args = ["--test", ...files.map((f) => path.join(testDir, f))];
const r = spawnSync(process.execPath, args, { stdio: "inherit", cwd: root });
process.exit(r.status === 0 ? 0 : r.status || 1);
