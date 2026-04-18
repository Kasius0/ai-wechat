const crypto = require("node:crypto");
const path = require("node:path");
const fs = require("node:fs/promises");
const screenshot = require("screenshot-desktop");
const sharp = require("sharp");
const { getWechatCapturesDir } = require("./capture-paths");

function sha256Hex(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

async function captureWechatWindowPng({ rect }) {
  const fullPng = await screenshot({ format: "png" });

  const image = sharp(fullPng);
  const meta = await image.metadata();
  const imgW = meta.width || 0;
  const imgH = meta.height || 0;
  if (imgW <= 0 || imgH <= 0) {
    throw new Error("invalid screenshot dimensions");
  }

  const left = clamp(Math.trunc(rect.left), 0, imgW - 1);
  const top = clamp(Math.trunc(rect.top), 0, imgH - 1);
  const right = clamp(Math.trunc(rect.right), left + 1, imgW);
  const bottom = clamp(Math.trunc(rect.bottom), top + 1, imgH);

  const width = right - left;
  const height = bottom - top;

  const croppedPng = await image
    .extract({ left, top, width, height })
    .png()
    .toBuffer();

  return {
    pngBuffer: croppedPng,
    cropRect: { left, top, right, bottom, width, height },
    screenshotSize: { width: imgW, height: imgH },
  };
}

async function captureWechatWindowIfNormal({ statusDetail }) {
  const rect = statusDetail?.data?.window?.rect;
  if (!rect) {
    return {
      ok: false,
      code: "WECHAT_RECT_MISSING",
      message: "wechat window rect missing",
      data: {
        capture_reason: "INVALID_RECT",
        status: statusDetail?.data?.status,
        errorCode: statusDetail?.data?.errorCode,
        reasons: statusDetail?.data?.reasons || [],
      },
    };
  }

  let captured;
  try {
    captured = await captureWechatWindowPng({ rect });
  } catch (error) {
    return {
      ok: false,
      code: "WECHAT_CAPTURE_WINDOW_FAILED",
      message: error?.message || "capture failed",
      data: {
        capture_reason: "SCREENSHOT_OR_CROP_FAILED",
        status: statusDetail?.data?.status,
        errorCode: statusDetail?.data?.errorCode,
        reasons: statusDetail?.data?.reasons || [],
      },
    };
  }
  const { pngBuffer, cropRect, screenshotSize } = captured;
  const sha256 = sha256Hex(pngBuffer);

  let savedPath = null;
  if (statusDetail?.data?.saveToFile) {
    const capturesDir = getWechatCapturesDir();
    await fs.mkdir(capturesDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `wechat-window-${ts}-${sha256.slice(0, 8)}.png`;
    const outPath = path.join(capturesDir, fileName);
    await fs.writeFile(outPath, pngBuffer);
    savedPath = outPath;
  }

  return {
    ok: true,
    code: "OK",
    message: "wechat capture window succeeded",
    data: {
      format: "png",
      sha256,
      byteLength: pngBuffer.length,
      base64: pngBuffer.toString("base64"),
      rect: cropRect,
      screenshotSize,
      savedPath,
    },
  };
}

module.exports = {
  captureWechatWindowIfNormal,
};

