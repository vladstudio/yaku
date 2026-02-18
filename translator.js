// translator.js — Translation engine: Google Cloud Translation API v2

const YakuTranslator = (() => {
  const API_BASE = 'https://translation.googleapis.com/language/translate/v2';

  async function getApiKey() {
    const { apiKey } = await chrome.storage.local.get('apiKey');
    if (!apiKey) throw new Error('API key not set. Click the gear icon in the popup.');
    return apiKey;
  }

  // --- Language Detection (3-layer) ---

  async function detectLanguage(sampleText) {
    // Layer 1: <html lang="...">
    const htmlLang = document.documentElement.lang?.split('-')[0];
    if (htmlLang) return { language: htmlLang, confidence: 0.8 };

    // Layer 2: <meta http-equiv="content-language">
    const metaLang = document.querySelector('meta[http-equiv="content-language"]')?.content?.split('-')[0];
    if (metaLang) return { language: metaLang, confidence: 0.7 };

    // Layer 3: Google Translate detect API
    try {
      const apiKey = await getApiKey();
      const text = sampleText || document.body.innerText.slice(0, 500);
      const res = await fetch(`${API_BASE}/detect?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: text }),
      });
      if (!res.ok) throw new Error(`Detection API error: ${res.status}`);
      const data = await res.json();
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

  function create(sourceLang, targetLang, apiKey) {
    return {
      async translate(text) {
        const res = await fetch(`${API_BASE}?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            q: text,
            source: sourceLang,
            target: targetLang,
            format: 'text',
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          const msg = err.error?.message || `API error: ${res.status}`;
          throw new Error(msg);
        }
        const data = await res.json();
        return data.data.translations[0].translatedText;
      },
      destroy() {},
    };
  }

  return { detectLanguage, create, getApiKey };
})();
