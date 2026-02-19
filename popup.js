// popup.js — Extension popup UI logic

// [code, English name, native name]
const LANGUAGES = [
  ['af', 'Afrikaans', 'Afrikaans'],
  ['sq', 'Albanian', 'Shqip'],
  ['am', 'Amharic', 'አማርኛ'],
  ['ar', 'Arabic', 'العربية'],
  ['hy', 'Armenian', 'Հայերեն'],
  ['az', 'Azerbaijani', 'Azərbaycan'],
  ['eu', 'Basque', 'Euskara'],
  ['be', 'Belarusian', 'Беларуская'],
  ['bn', 'Bengali', 'বাংলা'],
  ['bs', 'Bosnian', 'Bosanski'],
  ['bg', 'Bulgarian', 'Български'],
  ['ca', 'Catalan', 'Català'],
  ['ceb', 'Cebuano', 'Cebuano'],
  ['zh', 'Chinese', '中文'],
  ['co', 'Corsican', 'Corsu'],
  ['hr', 'Croatian', 'Hrvatski'],
  ['cs', 'Czech', 'Čeština'],
  ['da', 'Danish', 'Dansk'],
  ['nl', 'Dutch', 'Nederlands'],
  ['en', 'English', 'English'],
  ['eo', 'Esperanto', 'Esperanto'],
  ['et', 'Estonian', 'Eesti'],
  ['fi', 'Finnish', 'Suomi'],
  ['fr', 'French', 'Français'],
  ['fy', 'Frisian', 'Frysk'],
  ['gl', 'Galician', 'Galego'],
  ['ka', 'Georgian', 'ქართული'],
  ['de', 'German', 'Deutsch'],
  ['el', 'Greek', 'Ελληνικά'],
  ['gu', 'Gujarati', 'ગુજરાતી'],
  ['ht', 'Haitian Creole', 'Kreyòl Ayisyen'],
  ['ha', 'Hausa', 'Hausa'],
  ['haw', 'Hawaiian', 'ʻŌlelo Hawaiʻi'],
  ['he', 'Hebrew', 'עברית'],
  ['hi', 'Hindi', 'हिन्दी'],
  ['hmn', 'Hmong', 'Hmong'],
  ['hu', 'Hungarian', 'Magyar'],
  ['is', 'Icelandic', 'Íslenska'],
  ['ig', 'Igbo', 'Igbo'],
  ['id', 'Indonesian', 'Bahasa Indonesia'],
  ['ga', 'Irish', 'Gaeilge'],
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
  ['la', 'Latin', 'Latina'],
  ['lv', 'Latvian', 'Latviešu'],
  ['lt', 'Lithuanian', 'Lietuvių'],
  ['lb', 'Luxembourgish', 'Lëtzebuergesch'],
  ['mk', 'Macedonian', 'Македонски'],
  ['mg', 'Malagasy', 'Malagasy'],
  ['ms', 'Malay', 'Bahasa Melayu'],
  ['ml', 'Malayalam', 'മലയാളം'],
  ['mt', 'Maltese', 'Malti'],
  ['mi', 'Maori', 'Māori'],
  ['mr', 'Marathi', 'मराठी'],
  ['mn', 'Mongolian', 'Монгол'],
  ['my', 'Myanmar', 'ဗမာ'],
  ['ne', 'Nepali', 'नेपाली'],
  ['no', 'Norwegian', 'Norsk'],
  ['ny', 'Nyanja', 'Chichewa'],
  ['or', 'Odia', 'ଓଡ଼ିଆ'],
  ['ps', 'Pashto', 'پښتو'],
  ['fa', 'Persian', 'فارسی'],
  ['pl', 'Polish', 'Polski'],
  ['pt', 'Portuguese', 'Português'],
  ['pa', 'Punjabi', 'ਪੰਜਾਬੀ'],
  ['ro', 'Romanian', 'Română'],
  ['ru', 'Russian', 'Русский'],
  ['sm', 'Samoan', 'Gagana Sāmoa'],
  ['gd', 'Scots Gaelic', 'Gàidhlig'],
  ['sr', 'Serbian', 'Српски'],
  ['st', 'Sesotho', 'Sesotho'],
  ['sn', 'Shona', 'Shona'],
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
  ['cy', 'Welsh', 'Cymraeg'],
  ['xh', 'Xhosa', 'isiXhosa'],
  ['yi', 'Yiddish', 'ייִדיש'],
  ['yo', 'Yoruba', 'Yorùbá'],
  ['zu', 'Zulu', 'isiZulu'],
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
const modeToggle = document.getElementById('modeToggle');
const settingsToggle = document.getElementById('settingsToggle');
const settingsPanel = document.getElementById('settingsPanel');
const apiKeyInput = document.getElementById('apiKeyInput');
const apiKeySave = document.getElementById('apiKeySave');

function populateLists(detectedLang) {
  fromList.innerHTML = '';
  toList.innerHTML = '';

  for (const [code, name, native] of LANGUAGES) {
    const searchHint = native !== name ? `${code} · ${native}` : code;
    const opt = new Option(searchHint, name);
    toList.append(opt);
    fromList.append(opt.cloneNode(true));
  }

  // Update placeholder with detected language
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
  // Exact English name match
  if (NAME_TO_CODE[val]) return NAME_TO_CODE[val];
  // Exact code match
  if (CODE_TO_NAME[val]) return val;
  // Case-insensitive name match
  const lower = val.toLowerCase();
  for (const [code, name] of LANGUAGES) {
    if (name.toLowerCase() === lower) return code;
  }
  return null;
}

function renderState(state) {
  const s = state.status;
  const isActive = s === 'detecting' || s === 'translating' || s === 'done';

  controlsEl.hidden = isActive;
  statusEl.textContent = '';

  if (isActive) {
    const langName = CODE_TO_NAME[state.to] || state.to || toEl.value;
    btn.textContent = 'Cancel';
    btn.className = 'cancel';
    btn.disabled = false;
    btn.onclick = doRestore;
    statusEl.textContent = `Translating to ${langName}`;
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
  const mode = modeToggle.querySelector('.active').dataset.mode;
  chrome.runtime.sendMessage({ type: 'translate', from, to, mode });
  renderState({ status: 'detecting', to });
}

function doRestore() {
  chrome.runtime.sendMessage({ type: 'cancel' });
  renderState({ status: 'idle' });
}

// Poll state from service worker
function pollState() {
  chrome.runtime.sendMessage({ type: 'getState' }, (state) => {
    if (state) renderState(state);
  });
}

// Favorites
function renderFavs(favs) {
  favsEl.innerHTML = '';
  for (const code of favs) {
    const lang = LANGUAGES.find(l => l[0] === code);
    if (!lang) continue;
    const chip = document.createElement('span');
    chip.append(lang[2]);
    if (toEl.value === lang[1]) chip.className = 'active';
    chip.onclick = () => { toEl.value = lang[1]; renderFavs(favs); updateBtn(); };
    const x = Object.assign(document.createElement('b'), { textContent: '✕' });
    x.onclick = (e) => { e.stopPropagation(); saveFavs(favs.filter(c => c !== code)); };
    chip.append(x);
    favsEl.append(chip);
  }
  if (favs.length < 4) {
    const add = Object.assign(document.createElement('span'), { textContent: '+', className: 'add' });
    add.onclick = () => {
      const code = resolveLanguage(toEl);
      if (code && !favs.includes(code)) saveFavs([...favs, code]);
    };
    favsEl.append(add);
  }
}
function saveFavs(favs) { chrome.storage.local.set({ favLangs: favs }); renderFavs(favs); }

// Disable translate button when source and target languages match
let detectedPageLang = null;
function updateBtn() {
  if (controlsEl.hidden) return;
  const from = fromEl.value.trim() ? resolveLanguage(fromEl) : detectedPageLang;
  const to = resolveLanguage(toEl);
  btn.disabled = !!(from && to && from === to);
}

// Settings
settingsToggle.onclick = () => {
  settingsPanel.hidden = !settingsPanel.hidden;
};

apiKeySave.onclick = () => {
  const key = apiKeyInput.value.trim();
  if (key) {
    chrome.storage.local.set({ apiKey: key });
    settingsPanel.hidden = true;
    settingsToggle.textContent = 'API Key ✓';
  }
};

// Init
chrome.storage.local.get(['apiKey', 'favLangs', 'lastTargetLang'], ({ apiKey, favLangs, lastTargetLang }) => {
  if (apiKey) { apiKeyInput.value = apiKey; settingsToggle.textContent = 'API Key ✓'; }
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
});

setInterval(pollState, 500);

// Mode toggle
modeToggle.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  modeToggle.querySelectorAll('button').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
});

// Check if page has a text selection, enable/disable Selection button
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  if (!tab) return;
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => window.getSelection().toString().trim().length > 0,
  }, (results) => {
    if (chrome.runtime.lastError || !results?.[0]) return;
    modeToggle.querySelector('[data-mode="selection"]').disabled = !results[0].result;
  });
});

for (const el of document.querySelectorAll('input[list]')) el.addEventListener('focus', () => el.select());
fromEl.addEventListener('input', updateBtn);
toEl.addEventListener('input', () => { updateBtn(); chrome.storage.local.get('favLangs', ({ favLangs }) => renderFavs(favLangs || [])); });
