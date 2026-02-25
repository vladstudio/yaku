// service-worker.js — Background coordinator
// Routes messages between popup and content scripts, manages badge icon

const tabState = {};  // tabId → { status, detectedLang, from, to, progress }

function getState(tabId) {
  if (!tabState[tabId]) {
    tabState[tabId] = { status: 'idle', detectedLang: null, from: 'auto', to: 'en', progress: 0 };
  }
  return tabState[tabId];
}

function updateBadge(tabId, progress) {
  const pct = Math.round(progress * 100);
  chrome.action.setBadgeText({ text: `${pct}%`, tabId });
  chrome.action.setBadgeBackgroundColor({ color: '#E55E1A', tabId });
}

function resetBadge(tabId) {
  chrome.action.setBadgeText({ text: '', tabId });
}

const API_BASE = 'https://translation.googleapis.com/language/translate/v2';

// Messages from content.js and popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  // API proxy for content scripts (no cross-origin fetch in MV3 content scripts)
  if (msg.type === 'api-call') {
    (async () => {
      try {
        const { apiKey } = await chrome.storage.local.get('apiKey');
        if (!apiKey) { sendResponse({ error: 'API key not set. Click API Key in the popup.' }); return; }
        const res = await fetch(`${API_BASE}${msg.endpoint}?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(msg.body),
        });
        const data = await res.json();
        if (!res.ok) sendResponse({ error: data.error?.message || `API error: ${res.status}` });
        else sendResponse({ data });
      } catch (e) {
        sendResponse({ error: e.message });
      }
    })();
    return true;
  }

  // Messages from content script
  if (msg.source === 'yaku-content') {
    if (!tabId) return;
    const state = getState(tabId);

    if (msg.type === 'yaku-detected') {
      state.detectedLang = msg.language;
    } else if (msg.type === 'yaku-status') {
      state.status = msg.status;
      if (msg.status === 'translating') updateBadge(tabId, 0);
    } else if (msg.type === 'yaku-progress') {
      state.progress = msg.progress;
      updateBadge(tabId, msg.progress);
    } else if (msg.type === 'yaku-done') {
      state.status = 'done';
      state.from = msg.from;
      state.to = msg.to;
      state.progress = 1;
      resetBadge(tabId);
    } else if (msg.type === 'yaku-error') {
      state.status = 'error';
      state.error = msg.error;
      resetBadge(tabId);
    } else if (msg.type === 'yaku-cancelled' || msg.type === 'yaku-restored') {
      state.status = 'idle';
      state.progress = 0;
      resetBadge(tabId);
    }
    return;
  }

  // Messages from popup
  if (msg.type === 'getState') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) sendResponse(getState(tabs[0].id));
      else sendResponse({ status: 'idle' });
    });
    return true; // async sendResponse
  }

  if (msg.type === 'translate' || msg.type === 'cancel' || msg.type === 'restore') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        const state = getState(tabs[0].id);
        if (msg.type === 'translate') {
          state.status = 'detecting';
          state.from = msg.from;
          state.to = msg.to;
          state.mode = msg.mode;
        } else {
          state.status = 'idle';
          state.progress = 0;
          resetBadge(tabs[0].id);
        }
        chrome.tabs.sendMessage(tabs[0].id, msg).catch(() => {});
      }
    });
  }
});

// Clean up state when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  delete tabState[tabId];
});

// Request language detection when tab finishes loading
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'complete') {
    delete tabState[tabId];
    chrome.tabs.sendMessage(tabId, { type: 'detect' }).catch(() => {});
  }
});
