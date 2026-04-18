const { describe, test } = require("node:test");
const assert = require("node:assert/strict");

const {
  readPositionalArg,
  readEnvString,
  readEnvNumber,
  formatModesUsage,
} = require("../scripts/lib/script-cli");

describe("script-cli", () => {
  test("readPositionalArg trims and falls back", () => {
    assert.equal(readPositionalArg(["node", "x", "  ui  "], 2, "startup"), "ui");
    assert.equal(readPositionalArg(["node", "x"], 2, "startup"), "startup");
  });

  test("readEnvString trims and falls back", () => {
    assert.equal(readEnvString({ K: "  abc  " }, "K", "z"), "abc");
    assert.equal(readEnvString({}, "K", "z"), "z");
  });

  test("readEnvNumber parses valid numbers and falls back for invalid", () => {
    assert.equal(readEnvNumber({ T: "4500" }, "T", 30000), 4500);
    assert.equal(readEnvNumber({ T: "bad" }, "T", 30000), 30000);
    assert.equal(readEnvNumber({}, "T", 30000), 30000);
  });

  test("formatModesUsage joins modes", () => {
    assert.equal(formatModesUsage(["a", "b", "c"]), "a|b|c");
    assert.equal(formatModesUsage([]), "");
  });
});

