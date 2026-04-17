const { createWechatApiClient, sendWechatMessage } = require("./wechat-send-template");

async function main() {
  const text = process.argv.slice(2).join(" ").trim() || "测试消息";
  const baseUrl = process.env.WECHAT_AUTOMATION_BASE_URL;
  const apiPrefix = process.env.WECHAT_AUTOMATION_API_PREFIX || "";

  if (!baseUrl) {
    throw new Error(
      'missing WECHAT_AUTOMATION_BASE_URL. Example: $env:WECHAT_AUTOMATION_BASE_URL="http://127.0.0.1:8787"'
    );
  }

  const call = await createWechatApiClient(baseUrl, apiPrefix);
  const result = await sendWechatMessage({ text, call });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        code: "E2E_REAL_FAILED",
        message: error.message,
        hint:
          'Set env first. PowerShell: $env:WECHAT_AUTOMATION_BASE_URL="http://127.0.0.1:8787"; optional: $env:WECHAT_AUTOMATION_API_PREFIX="api/wechat"',
      },
      null,
      2
    )
  );
  process.exit(1);
});
