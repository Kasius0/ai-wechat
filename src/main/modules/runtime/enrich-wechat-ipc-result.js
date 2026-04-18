/**
 * 将 runtime 快照合并进类 IPC 返回值的 data（纯函数，便于单测）。
 * @param {object} result 含可选 data 字段的 IPC 结果
 * @param {object} runtime 与 getRuntimeSnapshot() 同形
 * @returns {object}
 */
function enrichWechatIpcResultWithRuntime(result, runtime) {
  if (!result || typeof result !== "object") {
    return result;
  }
  if (!runtime || typeof runtime !== "object") {
    return result;
  }
  const baseData =
    result.data != null && typeof result.data === "object" && !Array.isArray(result.data)
      ? { ...result.data }
      : {};
  if (Object.prototype.hasOwnProperty.call(baseData, "runtime")) {
    return result;
  }
  return { ...result, data: { ...baseData, runtime } };
}

module.exports = {
  enrichWechatIpcResultWithRuntime,
};
