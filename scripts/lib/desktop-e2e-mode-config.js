"use strict";

const DESKTOP_E2E_MODE_CONFIG = {
  startup: {
    envFlag: null,
    passSeenKey: null,
    passMessage: "startup emitted encryption-config, sqlite-ready, and app-ready.",
  },
  flow: {
    envFlag: "DESKTOP_E2E_FLOW",
    passSeenKey: "flowPass",
    passEvent: "desktop-e2e-flow-pass",
    failEvent: "desktop-e2e-flow-fail",
    failFallbackMessage: "desktop runtime flow failed.",
    passMessage: "flow emitted startup signals and desktop-e2e-flow-pass.",
  },
  renderer: {
    envFlag: "DESKTOP_E2E_RENDERER_FLOW",
    passSeenKey: "rendererPass",
    passEvent: "desktop-e2e-renderer-flow-pass",
    failEvent: "desktop-e2e-renderer-flow-fail",
    failFallbackMessage: "desktop renderer flow failed.",
    passMessage: "renderer flow emitted startup signals and desktop-e2e-renderer-flow-pass.",
  },
  ui: {
    envFlag: "DESKTOP_E2E_UI_FLOW",
    passSeenKey: "uiPass",
    passEvent: "desktop-e2e-ui-pass",
    failEvent: "desktop-e2e-ui-fail",
    failFallbackMessage: "desktop UI flow failed.",
    passMessage: "ui flow emitted startup signals and desktop-e2e-ui-pass.",
  },
};

function listDesktopE2EModes() {
  return Object.keys(DESKTOP_E2E_MODE_CONFIG);
}

function getDesktopE2EModeConfig(mode) {
  return DESKTOP_E2E_MODE_CONFIG[String(mode || "").trim().toLowerCase()] || null;
}

function createDesktopE2ESeenState() {
  const seen = {
    encryptionConfig: false,
    sqliteReady: false,
    appReady: false,
  };
  for (const modeName of listDesktopE2EModes()) {
    const passSeenKey = DESKTOP_E2E_MODE_CONFIG[modeName]?.passSeenKey;
    if (passSeenKey && !Object.hasOwn(seen, passSeenKey)) {
      seen[passSeenKey] = false;
    }
  }
  return seen;
}

module.exports = {
  DESKTOP_E2E_MODE_CONFIG,
  listDesktopE2EModes,
  getDesktopE2EModeConfig,
  createDesktopE2ESeenState,
};

