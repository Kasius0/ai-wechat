const { getWechatWindowContext } = require("./get-wechat-window-context");

function getWechatStatusDetail() {
  const ctx = getWechatWindowContext();
  if (!ctx?.ok) {
    return {
      ok: false,
      code: ctx?.code || "WECHAT_NOT_FOUND",
      message: ctx?.message || "No active Weixin window found",
      data: {
        status: "not_found",
        errorCode: ctx?.code || "WECHAT_NOT_FOUND",
        reasons: ["window-missing"],
      },
    };
  }

  const windowInfo = ctx?.data?.window;

  return {
    ok: true,
    code: "OK",
    message: "wechat status detail succeeded",
    data: {
      status: ctx?.data?.status,
      errorCode: ctx?.data?.errorCode,
      reasons: ctx?.data?.reasons || [],
      window: windowInfo,
    },
  };
}

module.exports = {
  getWechatStatusDetail,
};

