const path = require("node:path");

function getWechatCapturesDir() {
  return path.resolve(__dirname, "../../../../../../runtime/captures");
}

module.exports = {
  getWechatCapturesDir,
};
