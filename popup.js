// popup.js — Extension popup UI logic

const LANGUAGES = [
  ['auto', 'Auto-detect'],
  ['en', 'English'],
  ['ru', 'Russian'],
  ['de', 'German'],
  ['fr', 'French'],
  ['es', 'Spanish'],
  ['it', 'Italian'],
  ['pt', 'Portuguese'],
  ['nl', 'Dutch'],
  ['pl', 'Polish'],
  ['uk', 'Ukrainian'],
  ['ja', 'Japanese'],
  ['ko', 'Korean'],
  ['zh', 'Chinese'],
  ['ar', 'Arabic'],
  ['hi', 'Hindi'],
  ['tr', 'Turkish'],
  ['vi', 'Vietnamese'],
  ['th', 'Thai'],
  ['sv', 'Swedish'],
  ['da', 'Danish'],
  ['fi', 'Finnish'],
  ['cs', 'Czech'],
  ['ro', 'Romanian'],
  ['hu', 'Hungarian'],
  ['el', 'Greek'],
  ['he', 'Hebrew'],
  ['id', 'Indonesian'],
];

const LANG_NAMES = Object.fromEntries(LANGUAGES);

const fromEl = document.getElementById('from');
const toEl = document.getElementById('to');
const btn = document.getElementById('btn');
const statusEl = document.getElementById('status');
const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');

// Populate selects
function populateSelects(detectedLang) {
  fromEl.innerHTML = '';
  toEl.innerHTML = '';

  for (const [code, name] of LANGUAGES) {
    const label = code === 'auto' && detectedLang && detectedLang !== 'und'
      ? `Auto-detect (${LANG_NAMES[detectedLang] || detectedLang})`
      : name;

    if (code === 'auto') {
      fromEl.add(new Option(label, code));
    } else {
      fromEl.add(new Option(name, code));
      toEl.add(new Option(name, code));
    }
  }

  toEl.value = 'en';
}

function setProgress(pct) {
  progressBar.style.display = pct > 0 ? 'block' : 'none';
  progressFill.style.width = `${Math.round(pct * 100)}%`;
}

function renderState(state) {
  const s = state.status;

  if (s === 'idle' || !s) {
    btn.textContent = 'Translate';
    btn.className = '';
    btn.disabled = false;
    btn.onclick = doTranslate;
    statusEl.innerHTML = '';
    setProgress(0);
  } else if (s === 'detecting') {
    btn.textContent = 'Cancel';
    btn.className = 'cancel';
    btn.disabled = false;
    btn.onclick = doCancel;
    statusEl.textContent = 'Detecting language…';
    setProgress(0);
  } else if (s === 'downloading') {
    btn.textContent = 'Cancel';
    btn.className = 'cancel';
    btn.onclick = doCancel;
    const dp = state.downloadProgress || 0;
    statusEl.textContent = `Downloading language pack… ${Math.round(dp * 100)}%`;
    setProgress(dp);
  } else if (s === 'translating') {
    btn.textContent = 'Cancel';
    btn.className = 'cancel';
    btn.onclick = doCancel;
    const p = state.progress || 0;
    statusEl.textContent = `Translating… ${Math.round(p * 100)}%`;
    setProgress(p);
  } else if (s === 'done') {
    const langName = LANG_NAMES[state.to] || state.to;
    btn.textContent = 'Translate';
    btn.className = '';
    btn.disabled = false;
    btn.onclick = doTranslate;
    statusEl.innerHTML = `Translated to ${langName}. <a id="restoreLink">Show original</a>`;
    setProgress(0);
    document.getElementById('restoreLink')?.addEventListener('click', doRestore);
  } else if (s === 'error') {
    btn.textContent = 'Translate';
    btn.className = '';
    btn.disabled = false;
    btn.onclick = doTranslate;
    statusEl.innerHTML = `<span class="error">${state.error || 'Translation failed.'}</span>`;
    setProgress(0);
  }
}

function doTranslate() {
  chrome.runtime.sendMessage({
    type: 'translate',
    from: fromEl.value,
    to: toEl.value,
  });
  renderState({ status: 'detecting' });
}

function doCancel() {
  chrome.runtime.sendMessage({ type: 'cancel' });
  renderState({ status: 'idle' });
}

function doRestore() {
  chrome.runtime.sendMessage({ type: 'restore' });
  renderState({ status: 'idle' });
}

// Poll state from service worker to stay in sync
function pollState() {
  chrome.runtime.sendMessage({ type: 'getState' }, (state) => {
    if (state) renderState(state);
  });
}

// Listen for live updates from service worker
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.source === 'yaku-content') {
    // Re-poll to get consistent state
    pollState();
  }
});

// Init
populateSelects(null);
chrome.runtime.sendMessage({ type: 'getState' }, (state) => {
  if (state) {
    populateSelects(state.detectedLang);
    if (state.from && state.from !== 'auto') fromEl.value = state.from;
    if (state.to) toEl.value = state.to;
    renderState(state);
  }
});

// Keep polling while popup is open (for progress updates)
setInterval(pollState, 500);
