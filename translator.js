// translator.js — Translation engine abstraction (MAIN world)
// Today: Chrome Translator API. Swappable for DeepL, LLM, Ollama, etc.

const YakuTranslator = (() => {
  // --- Language Detection (3-layer) ---

  async function detectLanguage(sampleText) {
    // Layer 1: <html lang="...">
    const htmlLang = document.documentElement.lang?.split('-')[0];
    if (htmlLang && htmlLang !== 'en') return { language: htmlLang, confidence: 0.8 };

    // Layer 2: <meta http-equiv="content-language">
    const metaLang = document.querySelector('meta[http-equiv="content-language"]')?.content?.split('-')[0];
    if (metaLang) return { language: metaLang, confidence: 0.7 };

    // Layer 3: LanguageDetector API
    if ('LanguageDetector' in self) {
      const status = await LanguageDetector.availability();
      if (status !== 'unavailable') {
        const detector = await LanguageDetector.create();
        try {
          const results = await detector.detect(sampleText || document.body.innerText.slice(0, 500));
          const top = results.find(r => r.detectedLanguage !== 'und');
          if (top) return { language: top.detectedLanguage, confidence: top.confidence };
        } finally {
          detector.destroy();
        }
      }
    }

    // Layer 1 fallback: html lang even if "en"
    if (htmlLang) return { language: htmlLang, confidence: 0.5 };

    return { language: 'und', confidence: 0 };
  }

  // --- Translation Engine ---

  async function create(sourceLang, targetLang, onProgress) {
    if (!('Translator' in self)) {
      throw new Error('Chrome Translator API not available. Requires Chrome 138+.');
    }

    const availability = await Translator.availability({
      sourceLanguage: sourceLang,
      targetLanguage: targetLang,
    });

    if (availability === 'unavailable') {
      throw new Error(`Translation ${sourceLang} → ${targetLang} is not supported.`);
    }

    const options = { sourceLanguage: sourceLang, targetLanguage: targetLang };

    if (availability !== 'available') {
      options.monitor = (m) => {
        m.addEventListener('downloadprogress', (e) => {
          onProgress?.({ type: 'download', progress: e.loaded });
        });
      };
    }

    const instance = await Translator.create(options);

    return {
      translate: (text) => instance.translate(text),
      destroy: () => instance.destroy(),
    };
  }

  return { detectLanguage, create };
})();
