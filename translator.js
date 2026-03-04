// translator.js — Translation engine: Google Cloud Translation API v2
// API calls routed through service worker (content scripts can't fetch cross-origin in MV3)

const YakuTranslator = (() => {

  const CACHE_LIMIT = 1500;
  const translationCache = new Map(); // key -> translatedText (LRU: oldest first)

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

  function callApi(endpoint, body) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'api-call', endpoint, body }, (res) => {
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

    // Layer 3: Google Translate detect API (via service worker)
    try {
      const text = sampleText || document.body.innerText.slice(0, 500);
      const data = await callApi('/detect', { q: text });
      const top = data.data.detections[0]?.[0];
      if (top && top.language !== 'und') {
        return { language: top.language, confidence: top.confidence };
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
        const pendingByText = new Map();

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
          const data = await callApi('', {
            q: uniqueTexts,
            source: sourceLang,
            target: targetLang,
            format: 'text',
          });

          const translated = data.data.translations.map((t) => t.translatedText);

          for (let i = 0; i < uniqueTexts.length; i++) {
            const srcText = uniqueTexts[i];
            const dstText = translated[i];
            const key = cacheKey(sourceLang, targetLang, srcText);
            touchCache(key, dstText);

            for (const index of pendingByText.get(srcText)) {
              results[index] = dstText;
            }
          }
        }

        return results;
      },
      destroy() {},
    };
  }

  return { detectLanguage, create };
})();
