const sqlitePersistence = require("./runtime-sqlite-persistence");

const RUNTIME_STATES = {
  IDLE: "idle",
  AWAITING_CONTEXT: "awaiting_context",
  READY_TO_REPLY: "ready_to_reply",
  SENDING: "sending",
  COOLDOWN: "cooldown",
  ERROR: "error",
};

const MAX_HISTORY = 30;
const MAX_SESSION_ID_LEN = 128;

const VALID_STATES = new Set(Object.values(RUNTIME_STATES));

/** Used when no explicit sessionId and no IPC sender (tests, main-only helpers). */
const DEFAULT_RUNTIME_SESSION_ID = "__default__";

const stores = new Map();

function createEmptyStore() {
  return {
    state: RUNTIME_STATES.IDLE,
    lastTraceId: null,
    lastError: null,
    history: [],
  };
}

/**
 * @param {{ state: string, lastTraceId: string | null, lastError: object | null, history: object[] }} raw
 */
function normalizeLoadedStore(raw) {
  if (!raw || typeof raw !== "object") {
    return createEmptyStore();
  }
  const state = VALID_STATES.has(raw.state) ? raw.state : RUNTIME_STATES.IDLE;
  const lastTraceId =
    raw.lastTraceId != null && String(raw.lastTraceId).trim() ? String(raw.lastTraceId) : null;
  let lastError = null;
  if (raw.lastError != null && typeof raw.lastError === "object" && !Array.isArray(raw.lastError)) {
    lastError = raw.lastError;
  }
  let history = [];
  if (Array.isArray(raw.history)) {
    history = raw.history.filter((e) => e && typeof e === "object").slice(0, MAX_HISTORY);
  }
  return { state, lastTraceId, lastError, history };
}

function normalizeSessionId(sessionId) {
  if (sessionId == null) {
    return DEFAULT_RUNTIME_SESSION_ID;
  }
  const s = String(sessionId).trim();
  if (!s) {
    return DEFAULT_RUNTIME_SESSION_ID;
  }
  return s.slice(0, MAX_SESSION_ID_LEN);
}

function normalizeSessionIdFromPayload(payload) {
  return normalizeSessionId(payload?.sessionId);
}

function getStore(sessionId) {
  const key = normalizeSessionId(sessionId);
  if (!stores.has(key)) {
    let initial = createEmptyStore();
    if (sqlitePersistence.isPersistenceEnabled()) {
      const raw = sqlitePersistence.loadSessionRow(key);
      if (raw) {
        initial = normalizeLoadedStore(raw);
      }
    }
    stores.set(key, initial);
  }
  return { key, store: stores.get(key) };
}

function tryPersistSession(key) {
  if (!sqlitePersistence.isPersistenceEnabled()) {
    return;
  }
  const store = stores.get(key);
  if (store) {
    sqlitePersistence.persistSession(key, store);
  }
}

function pushHistory(store, entry) {
  store.history.unshift(entry);
  if (store.history.length > MAX_HISTORY) {
    store.history.length = MAX_HISTORY;
  }
}

function allowedEvents(state) {
  switch (state) {
    case RUNTIME_STATES.IDLE:
      return ["session_start", "reset"];
    case RUNTIME_STATES.AWAITING_CONTEXT:
      return ["wechat_normal", "wechat_abnormal", "reset"];
    case RUNTIME_STATES.READY_TO_REPLY:
      return ["trigger_send", "reset"];
    case RUNTIME_STATES.SENDING:
      return ["send_ok", "send_fail", "reset"];
    case RUNTIME_STATES.COOLDOWN:
      return ["cooldown_done", "reset"];
    case RUNTIME_STATES.ERROR:
      return ["reset"];
    default:
      return ["reset"];
  }
}

function resolveTransition(state, event) {
  if (event === "reset") {
    return RUNTIME_STATES.IDLE;
  }
  const table = {
    [RUNTIME_STATES.IDLE]: {
      session_start: RUNTIME_STATES.AWAITING_CONTEXT,
    },
    [RUNTIME_STATES.AWAITING_CONTEXT]: {
      wechat_normal: RUNTIME_STATES.READY_TO_REPLY,
      wechat_abnormal: RUNTIME_STATES.ERROR,
    },
    [RUNTIME_STATES.READY_TO_REPLY]: {
      trigger_send: RUNTIME_STATES.SENDING,
    },
    [RUNTIME_STATES.SENDING]: {
      send_ok: RUNTIME_STATES.COOLDOWN,
      send_fail: RUNTIME_STATES.ERROR,
    },
    [RUNTIME_STATES.COOLDOWN]: {
      cooldown_done: RUNTIME_STATES.IDLE,
    },
  };
  const next = table[state]?.[event];
  return next === undefined ? null : next;
}

function dispatchRuntimeEvent(event, payload = {}) {
  const { key: sessionId, store } = getStore(normalizeSessionIdFromPayload(payload));

  if (!event || typeof event !== "string") {
    return {
      ok: false,
      code: "RUNTIME_UNKNOWN_EVENT",
      message: "event is required",
      data: {
        sessionId,
        state: store.state,
        allowedEvents: allowedEvents(store.state),
      },
    };
  }

  const normalized = event.trim();
  const from = store.state;

  if (normalized === "reset") {
    store.state = RUNTIME_STATES.IDLE;
    store.lastError = null;
    if (payload.traceId) {
      store.lastTraceId = String(payload.traceId);
    }
    pushHistory(store, {
      ts: Date.now(),
      event: "reset",
      from,
      to: RUNTIME_STATES.IDLE,
      traceId: payload.traceId || null,
    });
    tryPersistSession(sessionId);
    return {
      ok: true,
      code: "OK",
      message: "runtime event accepted",
      data: {
        sessionId,
        state: store.state,
        from,
        event: "reset",
        lastTraceId: store.lastTraceId,
        allowedEvents: allowedEvents(store.state),
      },
    };
  }

  const to = resolveTransition(from, normalized);
  if (to === null) {
    return {
      ok: false,
      code: "RUNTIME_INVALID_TRANSITION",
      message: `cannot apply event "${normalized}" from state "${from}"`,
      data: {
        sessionId,
        state: from,
        event: normalized,
        allowedEvents: allowedEvents(from),
      },
    };
  }

  if (payload.traceId) {
    store.lastTraceId = String(payload.traceId);
  }
  if (to === RUNTIME_STATES.ERROR && normalized === "wechat_abnormal") {
    store.lastError = { reason: "wechat_abnormal", at: Date.now() };
  }
  if (to === RUNTIME_STATES.ERROR && normalized === "send_fail") {
    store.lastError = { reason: "send_fail", at: Date.now() };
  }
  if (to !== RUNTIME_STATES.ERROR) {
    store.lastError = null;
  }

  store.state = to;
  pushHistory(store, {
    ts: Date.now(),
    event: normalized,
    from,
    to,
    traceId: payload.traceId || null,
  });

  tryPersistSession(sessionId);

  return {
    ok: true,
    code: "OK",
    message: "runtime event accepted",
    data: {
      sessionId,
      state: store.state,
      from,
      event: normalized,
      lastTraceId: store.lastTraceId,
      lastError: store.lastError,
      allowedEvents: allowedEvents(store.state),
    },
  };
}

function getSessionRuntimeState(sessionId = DEFAULT_RUNTIME_SESSION_ID) {
  const { key, store } = getStore(sessionId);
  return {
    ok: true,
    code: "OK",
    message: "runtime state succeeded",
    data: {
      sessionId: key,
      state: store.state,
      states: Object.values(RUNTIME_STATES),
      lastTraceId: store.lastTraceId,
      lastError: store.lastError,
      allowedEvents: allowedEvents(store.state),
      history: store.history.slice(),
    },
  };
}

/** 轻量快照，供 IPC（如 wechat:quick-send）在 data 中附带，避免拉全量 history。 */
function getRuntimeSnapshot(sessionId = DEFAULT_RUNTIME_SESSION_ID) {
  const { key, store } = getStore(sessionId);
  return {
    sessionId: key,
    state: store.state,
    allowedEvents: allowedEvents(store.state),
    lastTraceId: store.lastTraceId,
    lastError: store.lastError,
  };
}

/** Clears SQLite (flush + delete) then in-memory map when persistence is enabled (for unit tests). */
function resetRuntimeStoresForTests() {
  if (sqlitePersistence.isPersistenceEnabled()) {
    sqlitePersistence.clearAllSessions();
  }
  stores.clear();
}

/** Drop one session from memory so the next read can reload from SQLite (tests). */
function evictRuntimeSessionFromMemoryForTests(sessionId) {
  stores.delete(normalizeSessionId(sessionId));
}

const WC_SESSION_PREFIX = "wc-";

/**
 * When a BrowserWindow's `webContents` is destroyed, drop ephemeral `wc-<id>` state
 * from memory and SQLite so `userData` does not accumulate idle rows.
 * @param {number} webContentsId from `webContents.id`
 */
function dropRuntimeSessionForWebContents(webContentsId) {
  const n = Number(webContentsId);
  if (!Number.isFinite(n) || n < 0) {
    return;
  }
  const sessionId = `${WC_SESSION_PREFIX}${Math.trunc(n)}`;
  stores.delete(sessionId);
  sqlitePersistence.purgeRuntimeSession(sessionId);
}

module.exports = {
  RUNTIME_STATES,
  DEFAULT_RUNTIME_SESSION_ID,
  dispatchRuntimeEvent,
  getSessionRuntimeState,
  getRuntimeSnapshot,
  resetRuntimeStoresForTests,
  evictRuntimeSessionFromMemoryForTests,
  dropRuntimeSessionForWebContents,
};
