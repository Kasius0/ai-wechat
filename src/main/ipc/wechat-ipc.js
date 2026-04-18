const { ipcMain } = require("electron");
const { defineHandler } = require("./ipc-utils");
const { IPC_ERROR_CODES } = require("./error-codes");
const { getWechatWindowContext } = require("../modules/wechat-status/get-wechat-window-context");
const { getWechatStatusDetail } = require("../modules/wechat-status/get-wechat-status-detail");
const { focusWechatWindow } = require("../modules/wechat-status/focus-wechat-window");
const { evaluateWechatStatus } = require("../modules/wechat-status/status-evaluator");
const { mouseMoveScreen, mouseClick } = require("../modules/rpa/mouse");
const { keyboardKeyTap, typeText } = require("../modules/rpa/keyboard");
const { captureWechatWindowIfNormal } = require("../modules/wechat-status/capture-wechat-window-if-normal");
const { listWechatCaptures } = require("../modules/wechat-status/list-captures");
const { cleanupWechatCaptures } = require("../modules/wechat-status/cleanup-captures");
const { LOG_FILE_PATH, logMain } = require("../logging/main-logger");
const {
  quickSendRuntimeBegin,
  quickSendRuntimeWechatAbnormal,
  quickSendRuntimeWechatNormal,
  quickSendRuntimeTriggerSend,
  quickSendRuntimeSendFail,
  quickSendRuntimeSendComplete,
} = require("../modules/runtime/quick-send-runtime-bridge");
const { getRuntimeSnapshot } = require("../modules/runtime/session-state-machine");
const { enrichWechatIpcResultWithRuntime: mergeRuntimeIntoWechatResult } = require("../modules/runtime/enrich-wechat-ipc-result");
const {
  normalizeTraceIdForWechatIpc,
  syncRuntimeFromWechatStatusLikeResult,
  syncRuntimeAbnormalIfAwaitingContext,
  syncRuntimeWechatNormalAfterCaptureOk,
} = require("../modules/runtime/single-step-wechat-runtime-sync");
const { resolveRuntimeSessionIdFromIpc } = require("../modules/runtime/runtime-session-id");

const wechatRuntimeIpcOpts = {
  resolveRuntimeSessionId: (args) => resolveRuntimeSessionIdFromIpc(args[0], args[1] || {}),
};

function enrichWechatIpcResultWithRuntime(result, sessionId) {
  return mergeRuntimeIntoWechatResult(result, getRuntimeSnapshot(sessionId));
}

function registerWechatIpcHandlers() {
  function buildSimulatedStatus(simulate) {
    const base = getWechatWindowContext();
    if (!base?.ok) {
      return base;
    }
    const windowInfo = {
      ...base.data.window,
      ...(simulate || {}),
      rect: simulate?.rect ? { ...base.data.window.rect, ...simulate.rect } : base.data.window.rect,
    };
    const detail = evaluateWechatStatus(windowInfo);
    return {
      ok: true,
      code: "OK",
      message: "wechat status detail simulation succeeded",
      data: {
        status: detail.status,
        errorCode: detail.errorCode,
        reasons: detail.reasons,
        window: {
          ...windowInfo,
          isOutOfBounds: detail.reasons.includes("out-of-bounds"),
          isTinyWindow: detail.reasons.includes("tiny-window"),
        },
        simulate: simulate || {},
      },
    };
  }

  ipcMain.handle(
    "wechat:window-context",
    defineHandler(
      async (event, payload) => {
        const sessionId = resolveRuntimeSessionIdFromIpc(event, payload || {});
        const traceId = normalizeTraceIdForWechatIpc(payload, "wx-ctx");
        const res = getWechatWindowContext();
        if (!res?.ok) {
          syncRuntimeAbnormalIfAwaitingContext(traceId, "wechat:window-context", sessionId);
        }
        return enrichWechatIpcResultWithRuntime(res, sessionId);
      },
      {
        defaultErrorCode: IPC_ERROR_CODES.WECHAT_WINDOW_CONTEXT_FAILED,
        attachRuntimeOnError: true,
        ...wechatRuntimeIpcOpts,
      }
    )
  );

  ipcMain.handle(
    "wechat:focus-window",
    defineHandler(
      async (event, payload) => {
        const sessionId = resolveRuntimeSessionIdFromIpc(event, payload || {});
        const traceId = normalizeTraceIdForWechatIpc(payload, "wx-focus");
        const res = focusWechatWindow();
        if (!res?.ok) {
          syncRuntimeAbnormalIfAwaitingContext(traceId, "wechat:focus-window", sessionId);
        }
        return enrichWechatIpcResultWithRuntime(res, sessionId);
      },
      {
        defaultErrorCode: IPC_ERROR_CODES.WECHAT_FOCUS_WINDOW_FAILED,
        attachRuntimeOnError: true,
        ...wechatRuntimeIpcOpts,
      }
    )
  );

  ipcMain.handle(
    "wechat:status-detail",
    defineHandler(
      async (event, payload) => {
        const sessionId = resolveRuntimeSessionIdFromIpc(event, payload || {});
        const traceId = normalizeTraceIdForWechatIpc(payload, "wx-status");
        const res = getWechatStatusDetail();
        syncRuntimeFromWechatStatusLikeResult(res, traceId, "wechat:status-detail", sessionId);
        return enrichWechatIpcResultWithRuntime(res, sessionId);
      },
      {
        defaultErrorCode: IPC_ERROR_CODES.WECHAT_STATUS_DETAIL_FAILED,
        attachRuntimeOnError: true,
        ...wechatRuntimeIpcOpts,
      }
    )
  );

  ipcMain.handle(
    "wechat:status-detail-simulate",
    defineHandler(
      async (event, payload) => {
        const sessionId = resolveRuntimeSessionIdFromIpc(event, payload || {});
        const traceId = normalizeTraceIdForWechatIpc(payload, "wx-status-sim");
        const res = buildSimulatedStatus(payload?.simulate || {});
        syncRuntimeFromWechatStatusLikeResult(res, traceId, "wechat:status-detail-simulate", sessionId);
        return enrichWechatIpcResultWithRuntime(res, sessionId);
      },
      {
        defaultErrorCode: IPC_ERROR_CODES.WECHAT_STATUS_DETAIL_FAILED,
        attachRuntimeOnError: true,
        ...wechatRuntimeIpcOpts,
      }
    )
  );

  ipcMain.handle(
    "wechat:quick-send",
    defineHandler(
      async (event, payload) => {
        const sessionId = resolveRuntimeSessionIdFromIpc(event, payload || {});
        const options = payload?.options || {};
        const {
          text,
          inputX = 20,
          inputY = 140,
          delayMs = 20,
          // Backward compatible: top-level fields still work.
          dryRun = options?.dryRun ?? false,
          retry = options?.retry || payload?.retry || {},
          injectFailure = options?.injectFailure || payload?.injectFailure || {},
        } = payload || {};
        const traceId =
          String(options?.traceId || "").trim() ||
          `qs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

        if (!text || !String(text).trim()) {
          throw new Error("text is empty");
        }

        const steps = [];
        const flowStart = Date.now();
        const maxRetries = Math.max(0, Math.min(Number(retry?.maxRetries ?? 0) || 0, 3));
        const retryDelayMs = Math.max(0, Number(retry?.delayMs ?? 120) || 0);
        let retriesUsed = 0;
        const failureStep = String(injectFailure?.step || "");
        const failureTimes = Math.max(0, Number(injectFailure?.times ?? 0) || 0);
        const failureState = new Map();
        const log = (event, extra = {}) => {
          logMain({
            module: "wechat:quick-send",
            traceId,
            event,
            ...extra,
          });
        };

        log("start", {
          textLength: String(text).length,
          inputX: Number(inputX),
          inputY: Number(inputY),
          delayMs: Number(delayMs),
          dryRun: Boolean(dryRun),
          retry: { maxRetries, delayMs: retryDelayMs },
          injectFailure: failureStep ? { step: failureStep, times: failureTimes } : null,
        });

        const quickSendData = (data) => ({
          ...data,
          runtime: getRuntimeSnapshot(sessionId),
        });

        quickSendRuntimeBegin(traceId, sessionId);

        const sleep = (ms) => {
          if (ms <= 0) {
            return;
          }
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
        };

        const runStep = (name, runner) => {
          let lastResult = null;
          for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
            const startedAt = Date.now();
            let result;
            try {
              if (failureStep && failureTimes > 0 && failureStep === name) {
                const used = failureState.get(name) || 0;
                if (used < failureTimes) {
                  failureState.set(name, used + 1);
                  throw new Error(`injected failure for ${name} (${used + 1}/${failureTimes})`);
                }
              }
              result = runner();
            } catch (error) {
              result = {
                ok: false,
                code: IPC_ERROR_CODES.WECHAT_QUICK_SEND_FAILED,
                message: error?.message || `${name} failed`,
              };
            }
            const durationMs = Date.now() - startedAt;
            const ok = result?.ok === true;
            steps.push({ step: name, ok, durationMs, attempt });
            log("step", {
              step: name,
              attempt,
              ok,
              durationMs,
              code: result?.code || null,
              message: result?.message || null,
            });
            lastResult = result;
            if (ok) {
              return { ok: true, result, attempt };
            }
            if (attempt <= maxRetries) {
              retriesUsed += 1;
              log("retry", {
                step: name,
                nextAttempt: attempt + 1,
                retryDelayMs,
                retriesUsed,
              });
              sleep(retryDelayMs);
            }
          }
          return { ok: false, result: lastResult, attempt: maxRetries + 1 };
        };

        const focusStep = runStep("focus-wechat-window", () => focusWechatWindow());
        if (!focusStep.ok) {
          quickSendRuntimeWechatAbnormal(traceId, sessionId);
          log("failed", {
            failedStep: "focus-wechat-window",
            retriesUsed,
            elapsedMs: Date.now() - flowStart,
          });
          return {
            ...focusStep.result,
            data: quickSendData({
              ...(focusStep.result?.data || {}),
              traceId,
              failedStep: "focus-wechat-window",
              steps,
              retriesUsed,
              dryRun: Boolean(dryRun),
              elapsedMs: Date.now() - flowStart,
              logFilePath: LOG_FILE_PATH,
            }),
          };
        }

        const moveStep = runStep("mouse-move", () => {
          const ctx = getWechatWindowContext();
          if (!ctx?.ok) {
            return ctx;
          }
          const rect = ctx?.data?.window?.rect;
          if (!rect) {
            throw new Error("wechat window rect missing");
          }
          return mouseMoveScreen({
            x: rect.left + Number(inputX),
            y: rect.top + Number(inputY),
          });
        });
        if (!moveStep.ok) {
          quickSendRuntimeWechatAbnormal(traceId, sessionId);
          log("failed", {
            failedStep: "mouse-move",
            retriesUsed,
            elapsedMs: Date.now() - flowStart,
          });
          return {
            ...moveStep.result,
            data: quickSendData({
              ...(moveStep.result?.data || {}),
              traceId,
              failedStep: "mouse-move",
              steps,
              retriesUsed,
              dryRun: Boolean(dryRun),
              elapsedMs: Date.now() - flowStart,
              logFilePath: LOG_FILE_PATH,
            }),
          };
        }

        const clickStep = runStep("mouse-click", () => mouseClick({ button: "left" }));
        if (!clickStep.ok) {
          quickSendRuntimeWechatAbnormal(traceId, sessionId);
          log("failed", {
            failedStep: "mouse-click",
            retriesUsed,
            elapsedMs: Date.now() - flowStart,
          });
          return {
            ...clickStep.result,
            data: quickSendData({
              ...(clickStep.result?.data || {}),
              traceId,
              failedStep: "mouse-click",
              steps,
              retriesUsed,
              dryRun: Boolean(dryRun),
              elapsedMs: Date.now() - flowStart,
              logFilePath: LOG_FILE_PATH,
            }),
          };
        }

        const statusAfterClick = getWechatStatusDetail();
        const statusIsNormal = statusAfterClick?.ok === true && statusAfterClick?.data?.status === "normal";
        if (!statusIsNormal) {
          quickSendRuntimeWechatAbnormal(traceId, sessionId);
          log("failed", {
            failedStep: "wechat-status",
            retriesUsed,
            elapsedMs: Date.now() - flowStart,
          });
          return {
            ok: false,
            code:
              statusAfterClick?.ok === false
                ? statusAfterClick.code || IPC_ERROR_CODES.WECHAT_QUICK_SEND_FAILED
                : IPC_ERROR_CODES.WECHAT_STATUS_NOT_NORMAL,
            message:
              statusAfterClick?.ok === false
                ? statusAfterClick.message || "wechat status detail failed"
                : "wechat status is not normal",
            data: quickSendData({
              ...(statusAfterClick?.data || {}),
              traceId,
              failedStep: "wechat-status",
              steps,
              retriesUsed,
              dryRun: Boolean(dryRun),
              elapsedMs: Date.now() - flowStart,
              logFilePath: LOG_FILE_PATH,
            }),
          };
        }

        quickSendRuntimeWechatNormal(traceId, sessionId);

        if (!dryRun) {
          quickSendRuntimeTriggerSend(traceId, sessionId);
          const typeStep = runStep("type-text", () =>
            typeText({ text: String(text), delayMs: Number(delayMs) })
          );
          if (!typeStep.ok) {
            quickSendRuntimeSendFail(traceId, sessionId);
            log("failed", {
              failedStep: "type-text",
              retriesUsed,
              elapsedMs: Date.now() - flowStart,
            });
            return {
              ...typeStep.result,
              data: quickSendData({
                ...(typeStep.result?.data || {}),
                traceId,
                failedStep: "type-text",
                steps,
                retriesUsed,
                dryRun: false,
                elapsedMs: Date.now() - flowStart,
                logFilePath: LOG_FILE_PATH,
              }),
            };
          }

          const enterStep = runStep("keyboard-enter", () => keyboardKeyTap({ keyCode: 13 }));
          if (!enterStep.ok) {
            quickSendRuntimeSendFail(traceId, sessionId);
            log("failed", {
              failedStep: "keyboard-enter",
              retriesUsed,
              elapsedMs: Date.now() - flowStart,
            });
            return {
              ...enterStep.result,
              data: quickSendData({
                ...(enterStep.result?.data || {}),
                traceId,
                failedStep: "keyboard-enter",
                steps,
                retriesUsed,
                dryRun: false,
                elapsedMs: Date.now() - flowStart,
                logFilePath: LOG_FILE_PATH,
              }),
            };
          }
          quickSendRuntimeSendComplete(traceId, sessionId);
        }

        const elapsedMs = Date.now() - flowStart;
        log("success", {
          dryRun: Boolean(dryRun),
          retriesUsed,
          stepCount: steps.length,
          elapsedMs,
        });
        return {
          ok: true,
          code: "OK",
          message: dryRun ? "wechat quick send dry-run succeeded" : "wechat quick send succeeded",
          data: quickSendData({
            traceId,
            action: "wechat-quick-send",
            textLength: String(text).length,
            delayMs: Number(delayMs),
            dryRun: Boolean(dryRun),
            retry: { maxRetries, delayMs: retryDelayMs },
            injectFailure: failureStep
              ? { step: failureStep, times: failureTimes }
              : { step: "", times: 0 },
            retriesUsed,
            inputOffset: { x: Number(inputX), y: Number(inputY) },
            steps,
            elapsedMs,
            logFilePath: LOG_FILE_PATH,
          }),
        };
      },
      {
        defaultErrorCode: IPC_ERROR_CODES.WECHAT_QUICK_SEND_FAILED,
        attachRuntimeOnError: true,
        ...wechatRuntimeIpcOpts,
      }
    )
  );

  ipcMain.handle(
    "wechat:capture-window-if-normal",
    defineHandler(
      async (event, payload) => {
        const sessionId = resolveRuntimeSessionIdFromIpc(event, payload || {});
        const traceId = normalizeTraceIdForWechatIpc(payload || {}, "wx-cap");
        const saveToFile = Boolean(payload?.saveToFile);
        const status = getWechatStatusDetail();
        if (!status?.ok) {
          syncRuntimeFromWechatStatusLikeResult(status, traceId, "wechat:capture-window-if-normal", sessionId);
          return enrichWechatIpcResultWithRuntime(status, sessionId);
        }
        if (status?.data?.status !== "normal") {
          syncRuntimeFromWechatStatusLikeResult(status, traceId, "wechat:capture-window-if-normal", sessionId);
          return enrichWechatIpcResultWithRuntime({
            ok: false,
            code: IPC_ERROR_CODES.WECHAT_STATUS_NOT_NORMAL,
            message: "wechat status is not normal",
            data: {
              capture_reason: "STATUS_NOT_NORMAL",
              status: status?.data?.status,
              errorCode: status?.data?.errorCode,
              reasons: status?.data?.reasons || [],
              saveToFile,
            },
          }, sessionId);
        }
        const cap = await captureWechatWindowIfNormal({
          statusDetail: {
            ...status,
            data: {
              ...status.data,
              saveToFile,
            },
          },
        });
        if (!cap?.ok) {
          syncRuntimeAbnormalIfAwaitingContext(traceId, "wechat:capture-window-if-normal:failed", sessionId);
          return enrichWechatIpcResultWithRuntime(cap, sessionId);
        }
        syncRuntimeWechatNormalAfterCaptureOk(traceId, "wechat:capture-window-if-normal", sessionId);
        return enrichWechatIpcResultWithRuntime(cap, sessionId);
      },
      {
        defaultErrorCode: IPC_ERROR_CODES.WECHAT_CAPTURE_WINDOW_FAILED,
        attachRuntimeOnError: true,
        ...wechatRuntimeIpcOpts,
      }
    )
  );

  ipcMain.handle(
    "wechat:list-captures",
    defineHandler(
      async (event, payload) => {
        const sessionId = resolveRuntimeSessionIdFromIpc(event, payload || {});
        return enrichWechatIpcResultWithRuntime(
          await listWechatCaptures({ limit: payload?.limit }),
          sessionId
        );
      },
      {
        defaultErrorCode: IPC_ERROR_CODES.WECHAT_LIST_CAPTURES_FAILED,
        attachRuntimeOnError: true,
        ...wechatRuntimeIpcOpts,
      }
    )
  );

  ipcMain.handle(
    "wechat:cleanup-captures",
    defineHandler(
      async (event, payload) => {
        const sessionId = resolveRuntimeSessionIdFromIpc(event, payload || {});
        return enrichWechatIpcResultWithRuntime(
          await cleanupWechatCaptures({
            keepLatest: payload?.keepLatest,
            olderThanHours: payload?.olderThanHours,
          }),
          sessionId
        );
      },
      {
        defaultErrorCode: IPC_ERROR_CODES.WECHAT_CLEANUP_CAPTURES_FAILED,
        attachRuntimeOnError: true,
        ...wechatRuntimeIpcOpts,
      }
    )
  );

  ipcMain.handle(
    "wechat:capture-window-with-simulate",
    defineHandler(
      async (event, payload) => {
        const sessionId = resolveRuntimeSessionIdFromIpc(event, payload || {});
        const traceId = normalizeTraceIdForWechatIpc(payload || {}, "wx-cap-sim");
        const status = buildSimulatedStatus(payload?.simulate || {});
        if (!status?.ok) {
          syncRuntimeFromWechatStatusLikeResult(status, traceId, "wechat:capture-window-with-simulate", sessionId);
          return enrichWechatIpcResultWithRuntime(status, sessionId);
        }
        if (status?.data?.status !== "normal") {
          syncRuntimeFromWechatStatusLikeResult(status, traceId, "wechat:capture-window-with-simulate", sessionId);
          return enrichWechatIpcResultWithRuntime({
            ok: false,
            code: IPC_ERROR_CODES.WECHAT_STATUS_NOT_NORMAL,
            message: "wechat status is not normal",
            data: {
              capture_reason: "STATUS_NOT_NORMAL",
              status: status?.data?.status,
              errorCode: status?.data?.errorCode,
              reasons: status?.data?.reasons || [],
              simulate: payload?.simulate || {},
            },
          }, sessionId);
        }
        const cap = await captureWechatWindowIfNormal({ statusDetail: status });
        if (!cap?.ok) {
          syncRuntimeAbnormalIfAwaitingContext(traceId, "wechat:capture-window-with-simulate:failed", sessionId);
          return enrichWechatIpcResultWithRuntime(cap, sessionId);
        }
        syncRuntimeWechatNormalAfterCaptureOk(traceId, "wechat:capture-window-with-simulate", sessionId);
        return enrichWechatIpcResultWithRuntime(cap, sessionId);
      },
      {
        defaultErrorCode: IPC_ERROR_CODES.WECHAT_CAPTURE_WINDOW_FAILED,
        attachRuntimeOnError: true,
        ...wechatRuntimeIpcOpts,
      }
    )
  );
}

module.exports = {
  registerWechatIpcHandlers,
};

