const btn = document.getElementById("btnPing");
const btnInfo = document.getElementById("btnInfo");
const btnWechatContext = document.getElementById("btnWechatContext");
const btnWechatStatusDetail = document.getElementById("btnWechatStatusDetail");
const btnWechatStatusSim = document.getElementById("btnWechatStatusSim");
const btnWechatStatusTiny = document.getElementById("btnWechatStatusTiny");
const btnWechatStatusOut = document.getElementById("btnWechatStatusOut");
const btnWechatStatusTitleEmpty = document.getElementById("btnWechatStatusTitleEmpty");
const btnWechatFocus = document.getElementById("btnWechatFocus");
const btnWechatCapture = document.getElementById("btnWechatCapture");
const btnWechatCaptureSave = document.getElementById("btnWechatCaptureSave");
const btnWechatListCaptures = document.getElementById("btnWechatListCaptures");
const cleanupKeepLatest = document.getElementById("cleanupKeepLatest");
const cleanupOlderThanHours = document.getElementById("cleanupOlderThanHours");
const btnWechatCleanupCaptures = document.getElementById("btnWechatCleanupCaptures");
const btnWechatCaptureSimMin = document.getElementById("btnWechatCaptureSimMin");
const mouseX = document.getElementById("mouseX");
const mouseY = document.getElementById("mouseY");
const mouseMode = document.getElementById("mouseMode");
const btnMouseMove = document.getElementById("btnMouseMove");
const btnMouseClick = document.getElementById("btnMouseClick");
const typeTextValue = document.getElementById("typeTextValue");
const typeDelayMs = document.getElementById("typeDelayMs");
const btnTypeText = document.getElementById("btnTypeText");
const btnEnter = document.getElementById("btnEnter");
const btnQuickSend = document.getElementById("btnQuickSend");
const btnQuickSendDryRun = document.getElementById("btnQuickSendDryRun");
const btnQuickSendDryRunRetry = document.getElementById("btnQuickSendDryRunRetry");
const btnQuickSendDryRunInjectFail = document.getElementById("btnQuickSendDryRunInjectFail");
const traceIdValue = document.getElementById("traceIdValue");
const btnCopyTraceId = document.getElementById("btnCopyTraceId");
const btnCopyTraceSearchCmd = document.getElementById("btnCopyTraceSearchCmd");
const traceSearchCmdValue = document.getElementById("traceSearchCmdValue");
const output = document.getElementById("output");
let currentTraceId = "";

function buildTraceSearchCmd(traceId) {
  // PowerShell: 双引号路径里 \r 会被当成回车，勿用 "...\runtime\..."。
  // 使用 -F 固定字符串 + 正斜杠路径，粘贴到 PS 里最稳。
  return `rg -F '${traceId}' 'F:/AI/project/runtime/logs/desktop-main.log'`;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setOutput(value) {
  const str = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  let parsed = null;
  let traceId = "";
  try {
    parsed = JSON.parse(str);
    traceId = parsed?.data?.traceId || "";
  } catch (_err) {
    output.innerHTML = `<pre class="output-json-body">${escapeHtml(str)}</pre>`;
    currentTraceId = "";
    traceIdValue.textContent = "-";
    btnCopyTraceId.disabled = true;
    btnCopyTraceSearchCmd.disabled = true;
    traceSearchCmdValue.textContent = "# 先触发一次 quick-send 生成 traceId";
    return;
  }

  currentTraceId = traceId;
  traceIdValue.textContent = traceId || "-";
  btnCopyTraceId.disabled = !traceId;
  btnCopyTraceSearchCmd.disabled = !traceId;
  traceSearchCmdValue.textContent = traceId
    ? buildTraceSearchCmd(traceId)
    : "# 先触发一次 quick-send 生成 traceId";

  const block = globalThis.getRuntimeHighlightBlock(parsed);
  if (block) {
    const runtimeJson = JSON.stringify(block.payload, null, 2);
    output.innerHTML =
      `<pre class="output-json-body">${escapeHtml(str)}</pre>` +
      '<div class="output-runtime-panel">' +
      `<span class="output-runtime-label">${escapeHtml(block.label)}</span>` +
      `<pre class="output-json-body output-runtime-body">${escapeHtml(runtimeJson)}</pre>` +
      "</div>";
  } else {
    output.innerHTML = `<pre class="output-json-body">${escapeHtml(str)}</pre>`;
  }
}

function createTraceId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

btnCopyTraceId.addEventListener("click", async () => {
  try {
    if (!currentTraceId) {
      return;
    }
    await navigator.clipboard.writeText(currentTraceId);
    const previous = output.textContent;
    output.textContent = `已复制 traceId: ${currentTraceId}\n\n${previous}`;
  } catch (err) {
    setOutput(`复制 traceId 失败: ${err?.message || String(err)}`);
  }
});

btnCopyTraceSearchCmd.addEventListener("click", async () => {
  try {
    if (!currentTraceId) {
      return;
    }
    const cmd = buildTraceSearchCmd(currentTraceId);
    await navigator.clipboard.writeText(cmd);
    const previous = output.textContent;
    output.textContent = `已复制检索命令:\n${cmd}\n\n${previous}`;
  } catch (err) {
    setOutput(`复制检索命令失败: ${err?.message || String(err)}`);
  }
});

btn.addEventListener("click", async () => {
  try {
    if (!window.app?.ping) {
      setOutput("preload 未注入 window.app.ping（请检查 preload/index.js）");
      return;
    }

    const res = await window.app.ping();
    setOutput(JSON.stringify(res, null, 2));
  } catch (err) {
    setOutput(`调用失败: ${err?.message || String(err)}`);
  }
});

btnInfo.addEventListener("click", async () => {
  try {
    if (!window.app?.info) {
      setOutput("preload 未注入 window.app.info（请检查 preload/index.js）");
      return;
    }

    const res = await window.app.info();
    setOutput(JSON.stringify(res, null, 2));
  } catch (err) {
    setOutput(`调用失败: ${err?.message || String(err)}`);
  }
});

btnWechatContext.addEventListener("click", async () => {
  try {
    if (!window.wechat?.windowContext) {
      setOutput("preload 未注入 window.wechat.windowContext（请检查 preload/index.js）");
      return;
    }

    const res = await window.wechat.windowContext();
    setOutput(JSON.stringify(res, null, 2));
  } catch (err) {
    setOutput(`调用失败: ${err?.message || String(err)}`);
  } finally {
    void refreshRuntimeUi();
  }
});

btnWechatStatusDetail.addEventListener("click", async () => {
  try {
    if (!window.wechat?.statusDetail) {
      setOutput("preload 未注入 window.wechat.statusDetail（请检查 preload/index.js）");
      return;
    }

    const res = await window.wechat.statusDetail();
    setOutput(JSON.stringify(res, null, 2));
  } catch (err) {
    setOutput(`调用失败: ${err?.message || String(err)}`);
  } finally {
    void refreshRuntimeUi();
  }
});

btnWechatStatusSim.addEventListener("click", async () => {
  try {
    if (!window.wechat?.statusDetailSimulate) {
      setOutput("preload 未注入 window.wechat.statusDetailSimulate（请检查 preload/index.js）");
      return;
    }

    const res = await window.wechat.statusDetailSimulate({
      simulate: {
        isMinimized: true,
      },
    });
    setOutput(JSON.stringify(res, null, 2));
  } catch (err) {
    setOutput(`调用失败: ${err?.message || String(err)}`);
  } finally {
    void refreshRuntimeUi();
  }
});

btnWechatStatusTiny.addEventListener("click", async () => {
  try {
    if (!window.wechat?.statusDetailSimulate) {
      setOutput("preload 未注入 window.wechat.statusDetailSimulate（请检查 preload/index.js）");
      return;
    }

    const res = await window.wechat.statusDetailSimulate({
      simulate: {
        rect: { width: 200, height: 120 },
      },
    });
    setOutput(JSON.stringify(res, null, 2));
  } catch (err) {
    setOutput(`调用失败: ${err?.message || String(err)}`);
  } finally {
    void refreshRuntimeUi();
  }
});

btnWechatStatusOut.addEventListener("click", async () => {
  try {
    if (!window.wechat?.statusDetailSimulate) {
      setOutput("preload 未注入 window.wechat.statusDetailSimulate（请检查 preload/index.js）");
      return;
    }

    const res = await window.wechat.statusDetailSimulate({
      simulate: {
        rect: {
          left: 100000,
          top: 100000,
          right: 100200,
          bottom: 100120,
          width: 200,
          height: 120,
        },
      },
    });
    setOutput(JSON.stringify(res, null, 2));
  } catch (err) {
    setOutput(`调用失败: ${err?.message || String(err)}`);
  } finally {
    void refreshRuntimeUi();
  }
});

btnWechatStatusTitleEmpty.addEventListener("click", async () => {
  try {
    if (!window.wechat?.statusDetailSimulate) {
      setOutput("preload 未注入 window.wechat.statusDetailSimulate（请检查 preload/index.js）");
      return;
    }

    const res = await window.wechat.statusDetailSimulate({
      simulate: {
        title: "",
        isTitleEmpty: true,
      },
    });
    setOutput(JSON.stringify(res, null, 2));
  } catch (err) {
    setOutput(`调用失败: ${err?.message || String(err)}`);
  } finally {
    void refreshRuntimeUi();
  }
});

btnWechatFocus.addEventListener("click", async () => {
  try {
    if (!window.wechat?.focusWindow) {
      setOutput("preload 未注入 window.wechat.focusWindow（请检查 preload/index.js）");
      return;
    }

    const res = await window.wechat.focusWindow();
    setOutput(JSON.stringify(res, null, 2));
  } catch (err) {
    setOutput(`调用失败: ${err?.message || String(err)}`);
  } finally {
    void refreshRuntimeUi();
  }
});

btnWechatCapture.addEventListener("click", async () => {
  try {
    if (!window.wechat?.captureWindowIfNormal) {
      setOutput("preload 未注入 window.wechat.captureWindowIfNormal（请检查 preload/index.js）");
      return;
    }

    const res = await window.wechat.captureWindowIfNormal();
    if (res?.ok && res?.data?.base64) {
      const { base64, ...rest } = res.data;
      setOutput(
        JSON.stringify(
          {
            ...res,
            data: {
              ...rest,
              base64Length: base64.length,
            },
          },
          null,
          2
        )
      );
      return;
    }

    setOutput(JSON.stringify(res, null, 2));
  } catch (err) {
    setOutput(`调用失败: ${err?.message || String(err)}`);
  } finally {
    void refreshRuntimeUi();
  }
});

btnWechatCaptureSave.addEventListener("click", async () => {
  try {
    if (!window.wechat?.captureWindowIfNormal) {
      setOutput("preload 未注入 window.wechat.captureWindowIfNormal（请检查 preload/index.js）");
      return;
    }

    const res = await window.wechat.captureWindowIfNormal({ saveToFile: true });
    if (res?.ok && res?.data?.base64) {
      const { base64, ...rest } = res.data;
      setOutput(
        JSON.stringify(
          {
            ...res,
            data: {
              ...rest,
              base64Length: base64.length,
            },
          },
          null,
          2
        )
      );
      return;
    }

    setOutput(JSON.stringify(res, null, 2));
  } catch (err) {
    setOutput(`调用失败: ${err?.message || String(err)}`);
  } finally {
    void refreshRuntimeUi();
  }
});

btnWechatListCaptures.addEventListener("click", async () => {
  try {
    if (!window.wechat?.listCaptures) {
      setOutput("preload 未注入 window.wechat.listCaptures（请检查 preload/index.js）");
      return;
    }

    const res = await window.wechat.listCaptures({ limit: 10 });
    setOutput(JSON.stringify(res, null, 2));
  } catch (err) {
    setOutput(`调用失败: ${err?.message || String(err)}`);
  } finally {
    void refreshRuntimeUi();
  }
});

btnWechatCleanupCaptures.addEventListener("click", async () => {
  try {
    if (!window.wechat?.cleanupCaptures) {
      setOutput("preload 未注入 window.wechat.cleanupCaptures（请检查 preload/index.js）");
      return;
    }

    const keepLatest = Number(cleanupKeepLatest?.value || 10);
    const olderThanHours = Number(cleanupOlderThanHours?.value || 24);
    const res = await window.wechat.cleanupCaptures({ keepLatest, olderThanHours });
    setOutput(JSON.stringify(res, null, 2));
  } catch (err) {
    setOutput(`调用失败: ${err?.message || String(err)}`);
  } finally {
    void refreshRuntimeUi();
  }
});

btnWechatCaptureSimMin.addEventListener("click", async () => {
  try {
    if (!window.wechat?.captureWindowWithSimulate) {
      setOutput("preload 未注入 window.wechat.captureWindowWithSimulate（请检查 preload/index.js）");
      return;
    }

    const res = await window.wechat.captureWindowWithSimulate({
      simulate: { isMinimized: true },
    });
    setOutput(JSON.stringify(res, null, 2));
  } catch (err) {
    setOutput(`调用失败: ${err?.message || String(err)}`);
  } finally {
    void refreshRuntimeUi();
  }
});

btnMouseMove.addEventListener("click", async () => {
  try {
    if (!window.rpa?.mouseMove) {
      setOutput("preload 未注入 window.rpa.mouseMove（请检查 preload/index.js）");
      return;
    }

    const payload = {
      x: Number(mouseX.value),
      y: Number(mouseY.value),
      coordinateMode: mouseMode.value,
    };
    const res = await window.rpa.mouseMove(payload);
    setOutput(JSON.stringify(res, null, 2));
  } catch (err) {
    setOutput(`调用失败: ${err?.message || String(err)}`);
  }
});

btnMouseClick.addEventListener("click", async () => {
  try {
    if (!window.rpa?.mouseClick) {
      setOutput("preload 未注入 window.rpa.mouseClick（请检查 preload/index.js）");
      return;
    }
    const res = await window.rpa.mouseClick({ button: "left" });
    setOutput(JSON.stringify(res, null, 2));
  } catch (err) {
    setOutput(`调用失败: ${err?.message || String(err)}`);
  }
});

btnTypeText.addEventListener("click", async () => {
  try {
    if (!window.rpa?.typeText) {
      setOutput("preload 未注入 window.rpa.typeText（请检查 preload/index.js）");
      return;
    }

    const payload = {
      text: typeTextValue.value,
      delayMs: Number(typeDelayMs.value),
    };
    const res = await window.rpa.typeText(payload);
    setOutput(JSON.stringify(res, null, 2));
  } catch (err) {
    setOutput(`调用失败: ${err?.message || String(err)}`);
  }
});

btnEnter.addEventListener("click", async () => {
  try {
    if (!window.rpa?.keyboardKey) {
      setOutput("preload 未注入 window.rpa.keyboardKey（请检查 preload/index.js）");
      return;
    }
    const res = await window.rpa.keyboardKey({ keyCode: 13 });
    setOutput(JSON.stringify(res, null, 2));
  } catch (err) {
    setOutput(`调用失败: ${err?.message || String(err)}`);
  }
});

btnQuickSend.addEventListener("click", async () => {
  try {
    if (!window.wechat?.quickSend) {
      setOutput("preload 未注入 window.wechat.quickSend（请检查 preload/index.js）");
      return;
    }

    const payload = {
      text: typeTextValue.value,
      delayMs: Number(typeDelayMs.value),
      inputX: Number(mouseX.value),
      inputY: Number(mouseY.value),
      options: {
        dryRun: false,
        traceId: createTraceId("quicksend"),
      },
    };
    const res = await window.wechat.quickSend(payload);
    setOutput(JSON.stringify(res, null, 2));
  } catch (err) {
    setOutput(`调用失败: ${err?.message || String(err)}`);
  } finally {
    void refreshRuntimeUi();
  }
});

btnQuickSendDryRun.addEventListener("click", async () => {
  try {
    if (!window.wechat?.quickSend) {
      setOutput("preload 未注入 window.wechat.quickSend（请检查 preload/index.js）");
      return;
    }

    const payload = {
      text: typeTextValue.value,
      delayMs: Number(typeDelayMs.value),
      inputX: Number(mouseX.value),
      inputY: Number(mouseY.value),
      options: {
        dryRun: true,
        traceId: createTraceId("dryrun"),
      },
    };
    const res = await window.wechat.quickSend(payload);
    setOutput(JSON.stringify(res, null, 2));
  } catch (err) {
    setOutput(`调用失败: ${err?.message || String(err)}`);
  } finally {
    void refreshRuntimeUi();
  }
});

btnQuickSendDryRunRetry.addEventListener("click", async () => {
  try {
    if (!window.wechat?.quickSend) {
      setOutput("preload 未注入 window.wechat.quickSend（请检查 preload/index.js）");
      return;
    }

    const payload = {
      text: typeTextValue.value,
      delayMs: Number(typeDelayMs.value),
      inputX: Number(mouseX.value),
      inputY: Number(mouseY.value),
      options: {
        dryRun: true,
        traceId: createTraceId("dryrun-retry"),
        retry: {
          maxRetries: 2,
          delayMs: 120,
        },
      },
    };
    const res = await window.wechat.quickSend(payload);
    setOutput(JSON.stringify(res, null, 2));
  } catch (err) {
    setOutput(`调用失败: ${err?.message || String(err)}`);
  } finally {
    void refreshRuntimeUi();
  }
});

btnQuickSendDryRunInjectFail.addEventListener("click", async () => {
  try {
    if (!window.wechat?.quickSend) {
      setOutput("preload 未注入 window.wechat.quickSend（请检查 preload/index.js）");
      return;
    }

    const payload = {
      text: typeTextValue.value,
      delayMs: Number(typeDelayMs.value),
      inputX: Number(mouseX.value),
      inputY: Number(mouseY.value),
      options: {
        dryRun: true,
        traceId: createTraceId("dryrun-inject"),
        retry: {
          maxRetries: 2,
          delayMs: 120,
        },
        injectFailure: {
          step: "mouse-move",
          times: 1,
        },
      },
    };
    const res = await window.wechat.quickSend(payload);
    setOutput(JSON.stringify(res, null, 2));
  } catch (err) {
    setOutput(`调用失败: ${err?.message || String(err)}`);
  } finally {
    void refreshRuntimeUi();
  }
});

const btnRuntimeState = document.getElementById("btnRuntimeState");
const btnRuntimeSessionStart = document.getElementById("btnRuntimeSessionStart");
const btnRuntimeWechatNormal = document.getElementById("btnRuntimeWechatNormal");
const btnRuntimeWechatAbnormal = document.getElementById("btnRuntimeWechatAbnormal");
const btnRuntimeTriggerSend = document.getElementById("btnRuntimeTriggerSend");
const btnRuntimeSendOk = document.getElementById("btnRuntimeSendOk");
const btnRuntimeSendFail = document.getElementById("btnRuntimeSendFail");
const btnRuntimeCooldownDone = document.getElementById("btnRuntimeCooldownDone");
const btnRuntimeReset = document.getElementById("btnRuntimeReset");
const elRuntimeStateSummary = document.getElementById("runtimeStateSummary");

function getRuntimeEventButtonMap() {
  return {
    session_start: btnRuntimeSessionStart,
    wechat_normal: btnRuntimeWechatNormal,
    wechat_abnormal: btnRuntimeWechatAbnormal,
    trigger_send: btnRuntimeTriggerSend,
    send_ok: btnRuntimeSendOk,
    send_fail: btnRuntimeSendFail,
    cooldown_done: btnRuntimeCooldownDone,
    reset: btnRuntimeReset,
  };
}

function applyRuntimeButtonUi(allowedEvents) {
  const allowed = new Set(allowedEvents || []);
  const map = getRuntimeEventButtonMap();
  for (const [eventName, btn] of Object.entries(map)) {
    if (!btn) {
      continue;
    }
    const isAllowed = allowed.has(eventName);
    btn.disabled = !isAllowed;
    btn.classList.toggle("runtime-btn-allowed", isAllowed);
    btn.classList.toggle("runtime-btn-blocked", !isAllowed);
  }
  if (btnRuntimeState) {
    btnRuntimeState.disabled = false;
    btnRuntimeState.classList.remove("runtime-btn-allowed", "runtime-btn-blocked");
  }
}

function applyAllowedFromRuntimeResponse(res) {
  const state = res?.data?.state;
  if (typeof state === "string" && elRuntimeStateSummary) {
    elRuntimeStateSummary.textContent = `当前状态: ${state}`;
  }
  const list = res?.data?.allowedEvents;
  if (Array.isArray(list)) {
    applyRuntimeButtonUi(list);
    return true;
  }
  return false;
}

async function refreshRuntimeUi() {
  if (!window.runtime?.state) {
    return;
  }
  try {
    const res = await window.runtime.state();
    applyAllowedFromRuntimeResponse(res);
  } catch (_err) {
    /* ignore */
  }
}

async function invokeRuntimeEvent(event) {
  if (!window.runtime?.event) {
    setOutput("preload 未注入 window.runtime.event（请检查 preload/index.js）");
    return;
  }
  const res = await window.runtime.event({
    event,
    traceId: createTraceId("runtime"),
  });
  setOutput(JSON.stringify(res, null, 2));
  if (!applyAllowedFromRuntimeResponse(res)) {
    await refreshRuntimeUi();
  }
}

btnRuntimeState.addEventListener("click", async () => {
  try {
    if (!window.runtime?.state) {
      setOutput("preload 未注入 window.runtime.state（请检查 preload/index.js）");
      return;
    }
    const res = await window.runtime.state();
    setOutput(JSON.stringify(res, null, 2));
    applyAllowedFromRuntimeResponse(res);
  } catch (err) {
    setOutput(`调用失败: ${err?.message || String(err)}`);
  }
});

btnRuntimeSessionStart.addEventListener("click", async () => {
  try {
    await invokeRuntimeEvent("session_start");
  } catch (err) {
    setOutput(`调用失败: ${err?.message || String(err)}`);
  }
});

btnRuntimeWechatNormal.addEventListener("click", async () => {
  try {
    await invokeRuntimeEvent("wechat_normal");
  } catch (err) {
    setOutput(`调用失败: ${err?.message || String(err)}`);
  }
});

btnRuntimeWechatAbnormal.addEventListener("click", async () => {
  try {
    await invokeRuntimeEvent("wechat_abnormal");
  } catch (err) {
    setOutput(`调用失败: ${err?.message || String(err)}`);
  }
});

btnRuntimeTriggerSend.addEventListener("click", async () => {
  try {
    await invokeRuntimeEvent("trigger_send");
  } catch (err) {
    setOutput(`调用失败: ${err?.message || String(err)}`);
  }
});

btnRuntimeSendOk.addEventListener("click", async () => {
  try {
    await invokeRuntimeEvent("send_ok");
  } catch (err) {
    setOutput(`调用失败: ${err?.message || String(err)}`);
  }
});

btnRuntimeSendFail.addEventListener("click", async () => {
  try {
    await invokeRuntimeEvent("send_fail");
  } catch (err) {
    setOutput(`调用失败: ${err?.message || String(err)}`);
  }
});

btnRuntimeCooldownDone.addEventListener("click", async () => {
  try {
    await invokeRuntimeEvent("cooldown_done");
  } catch (err) {
    setOutput(`调用失败: ${err?.message || String(err)}`);
  }
});

btnRuntimeReset.addEventListener("click", async () => {
  try {
    await invokeRuntimeEvent("reset");
  } catch (err) {
    setOutput(`调用失败: ${err?.message || String(err)}`);
  }
});

refreshRuntimeUi();
