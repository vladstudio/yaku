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

const controlsEl = document.getElementById('controls');
const fromEl = document.getElementById('from');
const toEl = document.getElementById('to');
const btn = document.getElementById('btn');
const statusEl = document.getElementById('status');
const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');

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

function showControls(visible) {
  controlsEl.hidden = !visible;
}

function renderState(state) {
  const s = state.status;

  if (s === 'idle' || !s) {
    showControls(true);
    btn.textContent = 'Translate';
    btn.className = '';
    btn.disabled = false;
    btn.onclick = doTranslate;
    statusEl.textContent = '';
    setProgress(0);
  } else if (s === 'detecting' || s === 'preparing') {
    showControls(false);
    statusEl.textContent = s === 'detecting' ? 'Detecting language…' : 'Preparing…';
    setProgress(0);
  } else if (s === 'downloading') {
    showControls(false);
    const dp = state.downloadProgress || 0;
    const pct = Math.round(dp * 100);
    statusEl.textContent = '';
    const pctEl = document.createElement('div');
    pctEl.className = 'download-pct';
    pctEl.textContent = `${pct}%`;
    const labelEl = document.createElement('div');
    labelEl.style.cssText = 'text-align:center;font-size:11px;color:#888;margin-bottom:10px';
    labelEl.textContent = 'Downloading language model…';
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.className = 'cancel';
    cancelBtn.onclick = doCancel;
    statusEl.append(pctEl, labelEl, cancelBtn);
    setProgress(dp);
  } else if (s === 'translating') {
    showControls(false);
    const p = state.progress || 0;
    statusEl.textContent = `Translating… ${Math.round(p * 100)}%`;
    setProgress(p);
  } else if (s === 'done') {
    showControls(true);
    const langName = LANG_NAMES[state.to] || state.to;
    btn.textContent = 'Translate';
    btn.className = '';
    btn.disabled = false;
    btn.onclick = doTranslate;
    statusEl.textContent = '';
    statusEl.append(
      `Translated to ${langName}. `,
      Object.assign(document.createElement('a'), { textContent: 'Show original', onclick: doRestore }),
    );
    setProgress(0);
  } else if (s === 'error') {
    showControls(true);
    btn.textContent = 'Translate';
    btn.className = '';
    btn.disabled = false;
    btn.onclick = doTranslate;
    statusEl.textContent = '';
    const errSpan = document.createElement('span');
    errSpan.className = 'error';
    errSpan.textContent = state.error || 'Translation failed.';
    statusEl.append(errSpan);
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

// Poll state from service worker
function pollState() {
  chrome.runtime.sendMessage({ type: 'getState' }, (state) => {
    if (state) renderState(state);
  });
}

// Init
chrome.runtime.sendMessage({ type: 'getState' }, (state) => {
  populateSelects(state?.detectedLang ?? null);
  if (state) {
    if (state.from && state.from !== 'auto') fromEl.value = state.from;
    if (state.to) toEl.value = state.to;
    renderState(state);
  }
});

setInterval(pollState, 500);
