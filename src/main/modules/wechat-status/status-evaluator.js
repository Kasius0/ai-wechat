const { screen } = require("electron");

function evaluateWechatStatus(windowInfo) {
  if (!windowInfo) {
    return { status: "not_found", errorCode: "WECHAT_NOT_FOUND", reasons: ["window-missing"] };
  }

  const reasons = [];
  const rect = windowInfo.rect;
  const displayBounds = screen.getPrimaryDisplay().bounds;

  if (windowInfo.isMinimized) {
    reasons.push("minimized");
  }
  if (windowInfo.isTitleEmpty) {
    reasons.push("title-empty");
  }
  if (!rect || rect.width <= 0 || rect.height <= 0) {
    reasons.push("invalid-rect");
  } else {
    if (rect.width < 280 || rect.height < 200) {
      reasons.push("tiny-window");
    }
    const isOutOfBounds =
      rect.right <= displayBounds.x ||
      rect.left >= displayBounds.x + displayBounds.width ||
      rect.bottom <= displayBounds.y ||
      rect.top >= displayBounds.y + displayBounds.height;
    if (isOutOfBounds) {
      reasons.push("out-of-bounds");
    }
  }

  if (reasons.length === 0) {
    return { status: "normal", errorCode: "WECHAT_STATUS_OK", reasons: [] };
  }
  if (reasons.includes("minimized")) {
    return { status: "minimized", errorCode: "WECHAT_MINIMIZED", reasons };
  }
  if (reasons.includes("out-of-bounds")) {
    return { status: "out_of_bounds", errorCode: "WECHAT_OUT_OF_BOUNDS", reasons };
  }
  if (reasons.includes("tiny-window")) {
    return { status: "tiny_window", errorCode: "WECHAT_TINY_WINDOW", reasons };
  }
  if (reasons.includes("title-empty")) {
    return { status: "title_empty", errorCode: "WECHAT_TITLE_EMPTY", reasons };
  }
  return { status: "abnormal", errorCode: "WECHAT_STATUS_ABNORMAL", reasons };
}

module.exports = {
  evaluateWechatStatus,
};

