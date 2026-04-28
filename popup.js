// popup.js — Extension popup UI logic

// [code, English name, native name]
const LANGUAGES = [
  ['af', 'Afrikaans', 'Afrikaans'],
  ['sq', 'Albanian', 'Shqip'],
  ['am', 'Amharic', 'አማርኛ'],
  ['ar', 'Arabic', 'العربية'],
  ['hy', 'Armenian', 'Հայերեն'],
  ['az', 'Azerbaijani', 'Azərbaycan'],
  ['be', 'Belarusian', 'Беларуская'],
  ['bn', 'Bengali', 'বাংলা'],
  ['bs', 'Bosnian', 'Bosanski'],
  ['bg', 'Bulgarian', 'Български'],
  ['ceb', 'Cebuano', 'Cebuano'],
  ['zh', 'Chinese', '中文'],
  ['hr', 'Croatian', 'Hrvatski'],
  ['cs', 'Czech', 'Čeština'],
  ['da', 'Danish', 'Dansk'],
  ['nl', 'Dutch', 'Nederlands'],
  ['en', 'English', 'English'],
  ['et', 'Estonian', 'Eesti'],
  ['fi', 'Finnish', 'Suomi'],
  ['fr', 'French', 'Français'],
  ['ka', 'Georgian', 'ქართული'],
  ['de', 'German', 'Deutsch'],
  ['el', 'Greek', 'Ελληνικά'],
  ['gu', 'Gujarati', 'ગુજરાતી'],
  ['ht', 'Haitian Creole', 'Kreyòl Ayisyen'],
  ['ha', 'Hausa', 'Hausa'],
  ['he', 'Hebrew', 'עברית'],
  ['hi', 'Hindi', 'हिन्दी'],
  ['hu', 'Hungarian', 'Magyar'],
  ['ig', 'Igbo', 'Igbo'],
  ['id', 'Indonesian', 'Bahasa Indonesia'],
  ['it', 'Italian', 'Italiano'],
  ['ja', 'Japanese', '日本語'],
  ['jv', 'Javanese', 'Jawa'],
  ['kn', 'Kannada', 'ಕನ್ನಡ'],
  ['kk', 'Kazakh', 'Қазақ'],
  ['km', 'Khmer', 'ភាសាខ្មែរ'],
  ['rw', 'Kinyarwanda', 'Kinyarwanda'],
  ['ko', 'Korean', '한국어'],
  ['ku', 'Kurdish', 'Kurdî'],
  ['ky', 'Kyrgyz', 'Кыргызча'],
  ['lo', 'Lao', 'ລາວ'],
  ['lv', 'Latvian', 'Latviešu'],
  ['lt', 'Lithuanian', 'Lietuvių'],
  ['mk', 'Macedonian', 'Македонски'],
  ['mg', 'Malagasy', 'Malagasy'],
  ['ms', 'Malay', 'Bahasa Melayu'],
  ['ml', 'Malayalam', 'മലയാളം'],
  ['mr', 'Marathi', 'मराठी'],
  ['mn', 'Mongolian', 'Монгол'],
  ['my', 'Myanmar', 'ဗမာ'],
  ['ne', 'Nepali', 'नेपाली'],
  ['no', 'Norwegian', 'Norsk'],
  ['or', 'Odia', 'ଓଡ଼ିଆ'],
  ['ps', 'Pashto', 'پښتو'],
  ['fa', 'Persian', 'فارسی'],
  ['pl', 'Polish', 'Polski'],
  ['pt', 'Portuguese', 'Português'],
  ['pa', 'Punjabi', 'ਪੰਜਾਬੀ'],
  ['ro', 'Romanian', 'Română'],
  ['ru', 'Russian', 'Русский'],
  ['sr', 'Serbian', 'Српски'],
  ['sd', 'Sindhi', 'سنڌي'],
  ['si', 'Sinhala', 'සිංහල'],
  ['sk', 'Slovak', 'Slovenčina'],
  ['sl', 'Slovenian', 'Slovenščina'],
  ['so', 'Somali', 'Soomaali'],
  ['es', 'Spanish', 'Español'],
  ['su', 'Sundanese', 'Basa Sunda'],
  ['sw', 'Swahili', 'Kiswahili'],
  ['sv', 'Swedish', 'Svenska'],
  ['tl', 'Tagalog', 'Filipino'],
  ['tg', 'Tajik', 'Тоҷикӣ'],
  ['ta', 'Tamil', 'தமிழ்'],
  ['tt', 'Tatar', 'Татар'],
  ['te', 'Telugu', 'తెలుగు'],
  ['th', 'Thai', 'ไทย'],
  ['tr', 'Turkish', 'Türkçe'],
  ['tk', 'Turkmen', 'Türkmen'],
  ['uk', 'Ukrainian', 'Українська'],
  ['ur', 'Urdu', 'اردو'],
  ['ug', 'Uyghur', 'ئۇيغۇرچە'],
  ['uz', 'Uzbek', 'Oʻzbek'],
  ['vi', 'Vietnamese', 'Tiếng Việt'],
  ['yo', 'Yoruba', 'Yorùbá'],
];

// Lookup: English name → code, code → English name
const NAME_TO_CODE = {};
const CODE_TO_NAME = {};
for (const [code, name] of LANGUAGES) {
  NAME_TO_CODE[name] = code;
  CODE_TO_NAME[code] = name;
}

const controlsEl = document.getElementById('controls');
const fromEl = document.getElementById('from');
const toEl = document.getElementById('to');
const fromList = document.getElementById('fromList');
const toList = document.getElementById('toList');
const btn = document.getElementById('btn');
const statusEl = document.getElementById('status');
const favsEl = document.getElementById('favs');
const tetraStatusEl = document.getElementById('tetraStatus');
let activeTabId = null;

function populateLists(detectedLang) {
  fromList.innerHTML = '';
  toList.innerHTML = '';

  for (const [code, name, native] of LANGUAGES) {
    const searchHint = native !== name ? `${code} · ${native}` : code;
    const opt = new Option(searchHint, name);
    toList.append(opt);
    fromList.append(opt.cloneNode(true));
  }

  updateDetectedPlaceholder(detectedLang);
}

function updateDetectedPlaceholder(detectedLang) {
  if (detectedLang && detectedLang !== 'und') {
    const detected = CODE_TO_NAME[detectedLang] || detectedLang;
    fromEl.placeholder = `Auto-detect (${detected})`;
  } else {
    fromEl.placeholder = 'Auto-detect';
  }
}

function resolveLanguage(input) {
  const val = input.value.trim();
  if (!val) return null;
  if (NAME_TO_CODE[val]) return NAME_TO_CODE[val];
  if (CODE_TO_NAME[val]) return val;
  const lower = val.toLowerCase();
  for (const [code, name] of LANGUAGES) {
    if (name.toLowerCase() === lower) return code;
  }
  return null;
}

function renderState(state) {
  const s = state.status;
  const isActive = !!state.active || s === 'detecting' || s === 'translating' || s === 'active' || s === 'done';

  controlsEl.hidden = isActive;
  statusEl.textContent = '';

  if (isActive) {
    const langName = CODE_TO_NAME[state.to] || state.to || toEl.value;
    btn.textContent = 'Stop';
    btn.className = 'cancel';
    btn.disabled = false;
    btn.onclick = doStop;
    if (s === 'detecting') {
      statusEl.textContent = 'Detecting page language';
    } else if (s === 'translating') {
      statusEl.textContent = `Translating to ${langName}`;
    } else if (s === 'error') {
      const errSpan = document.createElement('span');
      errSpan.className = 'error';
      errSpan.textContent = state.error || 'Translation failed.';
      statusEl.append(errSpan);
    } else {
      statusEl.textContent = `Active in ${langName}.`;
    }
  } else {
    btn.textContent = 'Translate';
    btn.className = '';
    btn.disabled = false;
    btn.onclick = doTranslate;
    if (s === 'error') {
      const errSpan = document.createElement('span');
      errSpan.className = 'error';
      errSpan.textContent = state.error || 'Translation failed.';
      statusEl.append(errSpan);
    }
  }
}

function doTranslate() {
  const from = fromEl.value.trim() ? resolveLanguage(fromEl) : 'auto';
  const to = resolveLanguage(toEl);

  if (from === null) {
    statusEl.textContent = '';
    const err = document.createElement('span');
    err.className = 'error';
    err.textContent = 'Unknown source language.';
    statusEl.append(err);
    return;
  }
  if (!to) {
    statusEl.textContent = '';
    const err = document.createElement('span');
    err.className = 'error';
    err.textContent = 'Select a target language.';
    statusEl.append(err);
    return;
  }

  chrome.storage.local.set({ lastTargetLang: to });
  chrome.runtime.sendMessage({ type: 'activate', from, to });
  renderState({ active: true, status: 'detecting', to });
}

function doStop() {
  chrome.runtime.sendMessage({ type: 'deactivate' });
  renderState({ active: false, status: 'idle' });
}

// Favorites
function renderFavs(favs) {
  favsEl.innerHTML = '';
  for (const code of favs) {
    const lang = LANGUAGES.find(l => l[0] === code);
    if (!lang) continue;
    const chip = document.createElement('span');
    chip.className = 'chip' + (toEl.value === lang[1] ? ' active' : '');
    chip.append(lang[2]);
    chip.onclick = () => { toEl.value = lang[1]; renderFavs(favs || []); updateBtn(); };
    const x = Object.assign(document.createElement('b'), { textContent: '✕' });
    x.onclick = (e) => { e.stopPropagation(); saveFavs((favs || []).filter(c => c !== code)); };
    chip.append(x);
    favsEl.append(chip);
  }
  if ((favs || []).length < 4) {
    const add = Object.assign(document.createElement('span'), { textContent: '+', className: 'chip dashed' });
    add.onclick = () => {
      const code = resolveLanguage(toEl);
      if (code && !(favs || []).includes(code)) saveFavs([...(favs || []), code]);
    };
    favsEl.append(add);
  }
}
function saveFavs(favs) { chrome.storage.local.set({ favLangs: favs }); renderFavs(favs || []); }

// Disable translate button when source and target languages match
let detectedPageLang = null;
function updateBtn() {
  if (controlsEl.hidden) return;
  const from = fromEl.value.trim() ? resolveLanguage(fromEl) : detectedPageLang;
  const to = resolveLanguage(toEl);
  btn.disabled = !!(from && to && from === to);
}

// Check Tetra connectivity (routed through service worker)
function checkTetra() {
  chrome.runtime.sendMessage({ type: 'tetra-ping' }, (res) => {
    if (res?.ok) {
      tetraStatusEl.textContent = 'connected';
      tetraStatusEl.style.color = 'var(--accent)';
    } else {
      tetraStatusEl.textContent = 'offline';
      tetraStatusEl.style.color = 'var(--error)';
    }
  });
}

// Init
chrome.storage.local.get(['favLangs', 'lastTargetLang'], ({ favLangs, lastTargetLang }) => {
  const defaultLang = CODE_TO_NAME[lastTargetLang] || 'English';

  chrome.runtime.sendMessage({ type: 'getState' }, (state) => {
    detectedPageLang = state?.detectedLang ?? null;
    populateLists(detectedPageLang);
    if (state) {
      if (state.from && state.from !== 'auto') fromEl.value = CODE_TO_NAME[state.from] || '';
      toEl.value = CODE_TO_NAME[state.to] || defaultLang;
      renderState(state);
    } else {
      toEl.value = defaultLang;
    }
    updateBtn();
  });

  renderFavs(favLangs || []);
  checkTetra();
});

// Receive pushed state updates from service worker
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== 'yaku-state') return;
  if (activeTabId == null || msg.tabId !== activeTabId) return;
  if (!msg.state) return;

  if (msg.state.detectedLang !== undefined && msg.state.detectedLang !== detectedPageLang) {
    detectedPageLang = msg.state.detectedLang;
    updateDetectedPlaceholder(detectedPageLang);
  }

  renderState(msg.state);
  updateBtn();
});

// Track active tab for pushed state filtering
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  if (!tab) return;
  activeTabId = tab.id;
});

for (const el of document.querySelectorAll('input[list]')) el.addEventListener('focus', () => el.select());
fromEl.addEventListener('input', updateBtn);
toEl.addEventListener('input', () => { updateBtn(); chrome.storage.local.get('favLangs', ({ favLangs }) => renderFavs(favLangs || [])); });
