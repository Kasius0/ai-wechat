const { registerAppIpcHandlers } = require("./app-ipc");
const { registerWechatIpcHandlers } = require("./wechat-ipc");
const { registerRpaIpcHandlers } = require("./rpa-ipc");
const { registerRuntimeIpcHandlers } = require("./runtime-ipc");

function registerIpcHandlers() {
  registerAppIpcHandlers();
  registerRuntimeIpcHandlers();
  registerWechatIpcHandlers();
  registerRpaIpcHandlers();
}

module.exports = {
  registerIpcHandlers,
};
