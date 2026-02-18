// translator.js — Translation engine abstraction (MAIN world)
// Today: Chrome Translator API. Swappable for DeepL, LLM, Ollama, etc.

const YakuTranslator = (() => {
  // --- Language Detection (3-layer) ---

  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
    ]);
  }

  async function detectLanguage(sampleText) {
    // Layer 1: <html lang="...">
    const htmlLang = document.documentElement.lang?.split('-')[0];
    if (htmlLang) return { language: htmlLang, confidence: 0.8 };

    // Layer 2: <meta http-equiv="content-language">
    const metaLang = document.querySelector('meta[http-equiv="content-language"]')?.content?.split('-')[0];
    if (metaLang) return { language: metaLang, confidence: 0.7 };

    // Layer 3: LanguageDetector API (with timeout — create() can hang if model needs download)
    if ('LanguageDetector' in self) {
      try {
        const status = await withTimeout(LanguageDetector.availability(), 3000);
        if (status === 'available') {
          const detector = await withTimeout(LanguageDetector.create(), 5000);
          try {
            const text = sampleText || document.body.innerText.slice(0, 500);
            const results = await withTimeout(detector.detect(text), 5000);
            const top = results.find(r => r.detectedLanguage !== 'und');
            if (top) return { language: top.detectedLanguage, confidence: top.confidence };
          } finally {
            detector.destroy();
          }
        }
      } catch {
        // Timeout or API error — fall through
      }
    }

    return { language: 'und', confidence: 0 };
  }

  // --- Translation Engine ---

  async function create(sourceLang, targetLang, { onProgress, signal } = {}) {
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

    const needsDownload = availability !== 'available';
    const options = { sourceLanguage: sourceLang, targetLanguage: targetLang };
    if (signal) options.signal = signal;

    if (needsDownload) {
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
      needsDownload,
    };
  }

  return { detectLanguage, create };
})();
