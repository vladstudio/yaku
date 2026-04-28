// translator.js — Translation engine: Tetra local LLM backend
// API calls routed through service worker (content scripts can't fetch cross-origin in MV3)

// Minimal ISO code → English name map (used for Tetra's targetLang arg)
const _LANG_NAMES = {af:'Afrikaans',sq:'Albanian',am:'Amharic',ar:'Arabic',hy:'Armenian',az:'Azerbaijani',eu:'Basque',be:'Belarusian',bn:'Bengali',bs:'Bosnian',bg:'Bulgarian',ca:'Catalan',ceb:'Cebuano',zh:'Chinese',co:'Corsican',hr:'Croatian',cs:'Czech',da:'Danish',nl:'Dutch',en:'English',eo:'Esperanto',et:'Estonian',fi:'Finnish',fr:'French',fy:'Frisian',gl:'Galician',ka:'Georgian',de:'German',el:'Greek',gu:'Gujarati',ht:'Haitian Creole',ha:'Hausa',haw:'Hawaiian',he:'Hebrew',hi:'Hindi',hmn:'Hmong',hu:'Hungarian',is:'Icelandic',ig:'Igbo',id:'Indonesian',ga:'Irish',it:'Italian',ja:'Japanese',jv:'Javanese',kn:'Kannada',kk:'Kazakh',km:'Khmer',rw:'Kinyarwanda',ko:'Korean',ku:'Kurdish',ky:'Kyrgyz',lo:'Lao',la:'Latin',lv:'Latvian',lt:'Lithuanian',lb:'Luxembourgish',mk:'Macedonian',mg:'Malagasy',ms:'Malay',ml:'Malayalam',mt:'Maltese',mi:'Maori',mr:'Marathi',mn:'Mongolian',my:'Myanmar',ne:'Nepali',no:'Norwegian',ny:'Nyanja',or:'Odia',ps:'Pashto',fa:'Persian',pl:'Polish',pt:'Portuguese',pa:'Punjabi',ro:'Romanian',ru:'Russian',sm:'Samoan',gd:'Scots Gaelic',sr:'Serbian',st:'Sesotho',sn:'Shona',sd:'Sindhi',si:'Sinhala',sk:'Slovak',sl:'Slovenian',so:'Somali',es:'Spanish',su:'Sundanese',sw:'Swahili',sv:'Swedish',tl:'Tagalog',tg:'Tajik',ta:'Tamil',tt:'Tatar',te:'Telugu',th:'Thai',tr:'Turkish',tk:'Turkmen',uk:'Ukrainian',ur:'Urdu',ug:'Uyghur',uz:'Uzbek',vi:'Vietnamese',cy:'Welsh',xh:'Xhosa',yi:'Yiddish',yo:'Yoruba',zu:'Zulu'};

const YakuTranslator = (() => {

  const CACHE_LIMIT = 1500;
  const translationCache = new Map(); // key -> translatedText (LRU: oldest first)
  const CONCURRENT_REQUESTS = 10;

  function cacheKey(sourceLang, targetLang, text) {
    return `${sourceLang}\u0000${targetLang}\u0000${text}`;
  }

  function touchCache(key, value) {
    if (translationCache.has(key)) translationCache.delete(key);
    translationCache.set(key, value);

    if (translationCache.size > CACHE_LIMIT) {
      const oldestKey = translationCache.keys().next().value;
      translationCache.delete(oldestKey);
    }
  }

  function callApi(command, text, args) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'api-call', command, text, args }, (res) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else if (res.error) reject(new Error(res.error));
        else resolve(res.data);
      });
    });
  }

  // --- Language Detection (3-layer) ---

  async function detectLanguage(sampleText) {
    // Layer 1: <html lang="...">
    const htmlLang = document.documentElement.lang?.split('-')[0];
    if (htmlLang) return { language: htmlLang, confidence: 0.8 };

    // Layer 2: <meta http-equiv="content-language">
    const metaLang = document.querySelector('meta[http-equiv="content-language"]')?.content?.split('-')[0];
    if (metaLang) return { language: metaLang, confidence: 0.7 };

    // Layer 3: Tetra LLM detect
    try {
      const text = sampleText || document.body.innerText.slice(0, 500);
      const result = await callApi('Detect Language', text);
      const lang = result.trim().toLowerCase();
      if (lang && lang.length <= 3 && /^[a-z]+$/.test(lang)) {
        return { language: lang, confidence: 0.9 };
      }
    } catch {
      // Fall through
    }

    return { language: 'und', confidence: 0 };
  }

  // --- Translation Engine ---

  function create(sourceLang, targetLang) {
    const langName = _LANG_NAMES[targetLang] || targetLang;
    return {
      async translateBatch(texts) {
        if (!texts.length) return [];

        const results = new Array(texts.length);
        const pending = []; // { index, text }

        for (let i = 0; i < texts.length; i++) {
          const text = texts[i];
          const key = cacheKey(sourceLang, targetLang, text);
          const cached = translationCache.get(key);

          if (cached != null) {
            touchCache(key, cached);
            results[i] = cached;
            continue;
          }

          pending.push({ index: i, text });
        }

        if (pending.length > 0) {
          // Fire up to CONCURRENT_REQUESTS parallel calls to Tetra
          let nextIndex = 0;

          const worker = async () => {
            while (nextIndex < pending.length) {
              const idx = nextIndex++;
              const { index, text } = pending[idx];

              const result = await callApi('Translate', text, { targetLang: langName });
              const translated = typeof result === 'string' ? result.trim() : result;

              const key = cacheKey(sourceLang, targetLang, text);
              touchCache(key, translated);
              results[index] = translated;
            }
          };

          const workerCount = Math.min(CONCURRENT_REQUESTS, pending.length);
          await Promise.all(Array.from({ length: workerCount }, () => worker()));
        }

        return results;
      },
      destroy() {},
    };
  }

  return { detectLanguage, create };
})();
