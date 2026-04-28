// service-worker.js — Background coordinator
// Routes messages between popup and content scripts, proxies Tetra API calls

const TETRA_BASE = 'http://localhost:24100';
const SESSION_TAB_STATE_KEY = 'tabStateV2';

const tabState = Object.create(null);
let stateHydrationPromise = null;

function createDefaultState() {
  return {
    active: false,
    status: 'idle',
    detectedLang: null,
    from: 'auto',
    to: 'en',
    progress: 0,
    pendingDeferred: 0,
    error: null,
  };
}

function getState(tabId) {
  if (!tabState[tabId]) tabState[tabId] = createDefaultState();
  return tabState[tabId];
}

function normalizeLoadedState(raw) {
  return {
    ...createDefaultState(),
    ...(raw || {}),
    active: !!raw?.active,
  };
}

async function hydrateTabState() {
  if (stateHydrationPromise) return stateHydrationPromise;

  stateHydrationPromise = (async () => {
    try {
      const stored = await chrome.storage.session.get(SESSION_TAB_STATE_KEY);
      const loaded = stored?.[SESSION_TAB_STATE_KEY];
      if (!loaded || typeof loaded !== 'object') return;

      for (const [key, raw] of Object.entries(loaded)) {
        const tabId = Number(key);
        if (!Number.isFinite(tabId)) continue;
        tabState[tabId] = normalizeLoadedState(raw);
      }

      const tabs = await chrome.tabs.query({});
      const live = new Set(tabs.map((tab) => tab.id));
      for (const key of Object.keys(tabState)) {
        const tabId = Number(key);
        if (!live.has(tabId)) delete tabState[tabId];
      }
    } catch {}
  })();

  return stateHydrationPromise;
}

function persistTabState() {
  return chrome.storage.session
    .set({ [SESSION_TAB_STATE_KEY]: tabState })
    .catch(() => {});
}

function updateBadge(tabId, progress) {
  const pct = Math.round(progress * 100);
  chrome.action.setBadgeText({ text: `${pct}%`, tabId });
  chrome.action.setBadgeBackgroundColor({ color: '#E55E1A', tabId });
}

function setLanguageBadge(tabId, langCode) {
  const text = (langCode || '').slice(0, 2).toUpperCase();
  chrome.action.setBadgeText({ text, tabId });
  chrome.action.setBadgeBackgroundColor({ color: '#E55E1A', tabId });
}

function resetBadge(tabId) {
  chrome.action.setBadgeText({ text: '', tabId });
}

function notifyState(tabId) {
  if (typeof tabId !== 'number') return;
  chrome.runtime.sendMessage({
    type: 'yaku-state',
    tabId,
    state: getState(tabId),
  }).catch(() => {});
}

function setInactive(state, tabId) {
  state.active = false;
  state.status = 'idle';
  state.progress = 0;
  state.pendingDeferred = 0;
  state.error = null;
  resetBadge(tabId);
}

async function activateInTab(tabId, state) {
  if (!state?.active) return;

  state.status = 'detecting';
  state.progress = 0;
  state.pendingDeferred = 0;
  state.error = null;
  setLanguageBadge(tabId, state.to);
  notifyState(tabId);
  await persistTabState();

  chrome.tabs.sendMessage(tabId, {
    type: 'activate',
    from: state.from,
    to: state.to,
  }).catch(() => {});
}

// Messages from content.js and popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  // API proxy for content scripts — forward to Tetra
  if (msg.type === 'api-call') {
    (async () => {
      try {
        const body = {
          command: msg.command,
          text: msg.text,
        };
        if (msg.args) body.args = msg.args;

        const res = await fetch(`${TETRA_BASE}/transform`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        const data = await res.json();
        if (!res.ok) sendResponse({ error: data.error || `Tetra error: ${res.status}` });
        else sendResponse({ data: data.result });
      } catch (e) {
        sendResponse({ error: e.message });
      }
    })();

    return true;
  }

  // Tetra health check from popup
  if (msg.type === 'tetra-ping') {
    (async () => {
      try {
        const res = await fetch(`${TETRA_BASE}/commands`);
        sendResponse({ ok: res.ok });
      } catch {
        sendResponse({ ok: false });
      }
    })();
    return true;
  }

  // Messages from content script
  if (msg.source === 'yaku-content') {
    if (!tabId) return;

    (async () => {
      await hydrateTabState();
      const state = getState(tabId);

      if (msg.type === 'yaku-ready') {
        if (state.active) {
          await activateInTab(tabId, state);
        } else {
          chrome.tabs.sendMessage(tabId, { type: 'detect' }).catch(() => {});
        }
        return;
      }

      if (msg.type === 'yaku-detected') {
        state.detectedLang = msg.language;
      } else if (msg.type === 'yaku-status') {
        state.status = msg.status;
        state.error = null;
        if (msg.status === 'translating') {
          state.progress = 0;
          state.pendingDeferred = 0;
          updateBadge(tabId, 0);
        }
      } else if (msg.type === 'yaku-progress') {
        state.progress = msg.progress;
        if (state.status === 'translating') updateBadge(tabId, msg.progress);
      } else if (msg.type === 'yaku-deferred') {
        state.pendingDeferred = msg.pending || 0;
      } else if (msg.type === 'yaku-done') {
        state.active = true;
        state.status = 'active';
        state.from = msg.from;
        state.to = msg.to;
        state.progress = 1;
        state.pendingDeferred = msg.pendingDeferred || 0;
        state.error = null;
        setLanguageBadge(tabId, state.to);
      } else if (msg.type === 'yaku-error') {
        state.status = 'error';
        state.error = msg.error;
        state.pendingDeferred = 0;
        resetBadge(tabId);
      } else if (msg.type === 'yaku-inactive' || msg.type === 'yaku-cancelled' || msg.type === 'yaku-restored') {
        setInactive(state, tabId);
      }

      notifyState(tabId);
      await persistTabState();
    })();
    return;
  }

  // Messages from popup
  if (msg.type === 'getState') {
    (async () => {
      await hydrateTabState();
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) sendResponse(getState(tabs[0].id));
      else sendResponse(createDefaultState());
    })();
    return true;
  }

  const isActivate = msg.type === 'activate' || msg.type === 'translate';
  const isDeactivate = msg.type === 'deactivate' || msg.type === 'cancel' || msg.type === 'restore';
  if (isActivate || isDeactivate) {
    (async () => {
      await hydrateTabState();
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs[0]) return;

      const activeTabId = tabs[0].id;
      const state = getState(activeTabId);

      if (isActivate) {
        state.active = true;
        state.from = msg.from || state.from || 'auto';
        state.to = msg.to || state.to || 'en';
        await activateInTab(activeTabId, state);
      } else {
        setInactive(state, activeTabId);
        notifyState(activeTabId);
        await persistTabState();
        chrome.tabs.sendMessage(activeTabId, { type: 'deactivate' }).catch(() => {});
      }
    })();
  }
});

// Clean up state when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  (async () => {
    await hydrateTabState();
    delete tabState[tabId];
    await persistTabState();
  })();
});

// Request language detection for inactive tabs after top-level navigation.
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== 'complete') return;

  (async () => {
    await hydrateTabState();
    const state = getState(tabId);
    if (!state.active) chrome.tabs.sendMessage(tabId, { type: 'detect' }).catch(() => {});
  })();
});
