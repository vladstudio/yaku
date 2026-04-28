// translator.js — Translation engine: Tetra local LLM backend
// API calls routed through service worker (content scripts can't fetch cross-origin in MV3)

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
    return {
      async translateBatch(texts) {
        if (!texts.length) return [];

        const results = new Array(texts.length);
        const pendingByText = new Map(); // text -> indexes[]

        for (let i = 0; i < texts.length; i++) {
          const text = texts[i];
          const key = cacheKey(sourceLang, targetLang, text);
          const cached = translationCache.get(key);

          if (cached != null) {
            touchCache(key, cached);
            results[i] = cached;
            continue;
          }

          let indexes = pendingByText.get(text);
          if (!indexes) {
            indexes = [];
            pendingByText.set(text, indexes);
          }
          indexes.push(i);
        }

        if (pendingByText.size > 0) {
          const uniqueTexts = [...pendingByText.keys()];
          let nextIndex = 0;

          const worker = async () => {
            while (nextIndex < uniqueTexts.length) {
              const text = uniqueTexts[nextIndex++];
              const indexes = pendingByText.get(text);
              try {
                const result = await callApi('Translate', text, { targetLang });
                const translated = typeof result === 'string' ? result.trim() : result;
                touchCache(cacheKey(sourceLang, targetLang, text), translated);
                for (const i of indexes) results[i] = translated;
              } catch {
                // Leave originals on failure so the rest of the page still translates
                for (const i of indexes) results[i] = text;
              }
            }
          };

          const workerCount = Math.min(CONCURRENT_REQUESTS, uniqueTexts.length);
          await Promise.all(Array.from({ length: workerCount }, () => worker()));
        }

        return results;
      },
      destroy() {},
    };
  }

  return { detectLanguage, create };
})();
