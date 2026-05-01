// popup.js

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

const NAME_TO_CODE = {};
const CODE_TO_NAME = {};
for (const [code, name] of LANGUAGES) {
  NAME_TO_CODE[name] = code;
  CODE_TO_NAME[code] = name;
}

const controlsEl = document.getElementById('controls');
const toEl = document.getElementById('to');
const toList = document.getElementById('toList');
const btn = document.getElementById('btn');
const statusEl = document.getElementById('status');
const favsEl = document.getElementById('favs');
const tetraStatusEl = document.getElementById('tetraStatus');
const resetCacheEl = document.getElementById('resetCache');
let activeTabId = null;

function populateLists() {
  toList.innerHTML = '';
  for (const [code, name, native] of LANGUAGES) {
    const hint = native !== name ? `${code} · ${native}` : code;
    toList.append(new Option(hint, name));
  }
}

function resolveLanguage(input) {
  const val = input.value.trim();
  if (!val) return null;
  if (NAME_TO_CODE[val]) return NAME_TO_CODE[val];
  if (CODE_TO_NAME[val]) return val;
  const lower = val.toLowerCase();
  for (const [code, name] of LANGUAGES)
    if (name.toLowerCase() === lower) return code;
  return null;
}

function showError(msg) {
  statusEl.textContent = '';
  const el = document.createElement('span');
  el.className = 'error';
  el.textContent = msg;
  statusEl.append(el);
}

function renderState(state) {
  const s = state.status;
  const isActive = !!state.active || s === 'translating' || s === 'active' || s === 'done';

  controlsEl.hidden = isActive;
  statusEl.textContent = '';

  if (isActive) {
    const langName = CODE_TO_NAME[state.to] || state.to || toEl.value;
    btn.textContent = 'Stop';
    btn.className = 'cancel';
    btn.disabled = false;
    btn.onclick = doStop;
    if (s === 'translating') statusEl.textContent = `Translating to ${langName}`;
    else if (s === 'error') showError(state.error || 'Translation failed.');
    else statusEl.textContent = `Active in ${langName}.`;
  } else {
    btn.textContent = 'Translate';
    btn.className = '';
    btn.disabled = false;
    btn.onclick = doTranslate;
    if (s === 'error') showError(state.error || 'Translation failed.');
  }
}

function doTranslate() {
  const to = resolveLanguage(toEl);
  if (!to) return showError('Select a target language.');
  chrome.storage.local.set({ lastTargetLang: to });
  chrome.runtime.sendMessage({ type: 'activate', to });
  renderState({ active: true, status: 'translating', to });
}

function doStop() {
  chrome.runtime.sendMessage({ type: 'deactivate' });
  renderState({ active: false, status: 'idle' });
}

function renderFavs(favs = []) {
  favsEl.innerHTML = '';
  for (const code of favs) {
    const lang = LANGUAGES.find(l => l[0] === code);
    if (!lang) continue;
    const chip = document.createElement('span');
    chip.className = 'chip' + (toEl.value === lang[1] ? ' active' : '');
    chip.append(lang[2]);
    chip.onclick = () => { toEl.value = lang[1]; renderFavs(favs); updateBtn(); };
    const x = Object.assign(document.createElement('b'), { textContent: '✕' });
    x.onclick = (e) => { e.stopPropagation(); saveFavs(favs.filter(c => c !== code)); };
    chip.append(x);
    favsEl.append(chip);
  }
  if (favs.length < 4) {
    const add = Object.assign(document.createElement('span'), { textContent: '+', className: 'chip dashed' });
    add.onclick = () => {
      const code = resolveLanguage(toEl);
      if (code && !favs.includes(code)) saveFavs([...favs, code]);
    };
    favsEl.append(add);
  }
}

function saveFavs(favs) { chrome.storage.local.set({ favLangs: favs }); renderFavs(favs); }

function updateBtn() {
  if (!controlsEl.hidden) btn.disabled = !resolveLanguage(toEl);
}

function checkTetra() {
  chrome.runtime.sendMessage({ type: 'tetra-ping' }, (res) => {
    tetraStatusEl.textContent = res?.ok ? 'connected' : 'offline';
    tetraStatusEl.style.color = res?.ok ? 'var(--accent)' : 'var(--error)';
  });
}

// Init
chrome.storage.local.get({ favLangs: [], lastTargetLang: '' }, ({ favLangs, lastTargetLang }) => {
  const defaultLang = CODE_TO_NAME[lastTargetLang] || 'English';
  chrome.runtime.sendMessage({ type: 'getState' }, (state) => {
    populateLists();
    toEl.value = state ? (CODE_TO_NAME[state.to] || defaultLang) : defaultLang;
    if (state) renderState(state);
    updateBtn();
  });
  renderFavs(favLangs);
  checkTetra();
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== 'yaku-state' || activeTabId == null || msg.tabId !== activeTabId || !msg.state) return;
  renderState(msg.state);
  updateBtn();
});

chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => { if (tab) activeTabId = tab.id; });

document.querySelector('input[list]').addEventListener('focus', ({ target }) => target.select());
toEl.addEventListener('input', () => { updateBtn(); chrome.storage.local.get({ favLangs: [] }, ({ favLangs }) => renderFavs(favLangs)); });
resetCacheEl.addEventListener('click', () => { chrome.storage.local.remove('yaku-cache-v1'); resetCacheEl.textContent = 'Done'; setTimeout(() => resetCacheEl.textContent = 'Reset', 1500); });
