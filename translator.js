// translator.js — Translation engine: Google Cloud Translation API v2
// API calls routed through service worker (content scripts can't fetch cross-origin in MV3)

const YakuTranslator = (() => {

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
        const data = await callApi('', {
          q: texts,
          source: sourceLang,
          target: targetLang,
          format: 'text',
        });
        return data.data.translations.map(t => t.translatedText);
      },
      destroy() {},
    };
  }

  return { detectLanguage, create };
})();
