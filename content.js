// content.js — MAIN world script
// Handles DOM traversal, translation, and MutationObserver

(() => {
  const SKIP_TAGS = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'TEXTAREA', 'INPUT', 'SVG',
  ]);

  const BLOCK_ELEMENTS = new Set([
    'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'BODY', 'DD', 'DIV', 'DL',
    'DT', 'FIELDSET', 'FIGCAPTION', 'FIGURE', 'FOOTER', 'FORM',
    'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HR', 'LI', 'MAIN',
    'NAV', 'OL', 'P', 'SECTION', 'TABLE', 'TBODY', 'TD', 'TFOOT', 'TH',
    'THEAD', 'TR', 'UL',
  ]);

  let originals = new WeakMap();  // node → original textContent
  let originalNodes = new Set();  // track nodes for restore iteration
  let translator = null;
  let observer = null;
  let abortController = null;
  let isTranslating = false;
  let mutationQueue = null;       // serializes MutationObserver translations

  // --- DOM traversal ---

  function getTextNodes(root) {
    const nodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        let el = node.parentElement;
        if (!el) return NodeFilter.FILTER_REJECT;
        if (SKIP_TAGS.has(el.tagName)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    while (walker.nextNode()) nodes.push(walker.currentNode);
    return nodes;
  }

  function findBlockParent(node) {
    let el = node.parentElement;
    while (el && !BLOCK_ELEMENTS.has(el.tagName)) el = el.parentElement;
    return el || document.body;
  }

  function groupByBlock(textNodes) {
    const groups = new Map();
    for (const node of textNodes) {
      const block = findBlockParent(node);
      if (!groups.has(block)) groups.set(block, []);
      groups.get(block).push(node);
    }
    return groups;
  }

  // --- Translation ---

  async function translateNodes(textNodes, onProgress) {
    const groups = groupByBlock(textNodes);
    const blocks = [...groups.entries()];
    let done = 0;

    for (const [, nodes] of blocks) {
      if (abortController?.signal.aborted) return;

      const text = nodes.map(n => n.nodeValue).join('');
      if (!text.trim()) { done++; continue; }

      try {
        const translated = await translator.translate(text);

        // Store originals and replace
        pauseObserver();
        try {
          for (const n of nodes) {
            if (!originals.has(n)) {
              originals.set(n, n.nodeValue);
              originalNodes.add(n);
            }
          }
          nodes[0].nodeValue = translated;
          for (let i = 1; i < nodes.length; i++) nodes[i].nodeValue = '';
        } finally {
          resumeObserver();
        }
      } catch (e) {
        if (e.name === 'AbortError') return;
        console.warn('[yaku] translation error:', e);
      }

      done++;
      onProgress?.(done / blocks.length);
    }
  }

  // --- MutationObserver for dynamic content ---

  let observerPaused = false;

  function pauseObserver() { observerPaused = true; }
  function resumeObserver() { observerPaused = false; }

  function startObserver() {
    if (observer) observer.disconnect();

    observer = new MutationObserver((mutations) => {
      if (observerPaused || !translator) return;

      const newTextNodes = [];
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.TEXT_NODE) {
              if (node.nodeValue.trim() && !originals.has(node)) newTextNodes.push(node);
            } else if (node.nodeType === Node.ELEMENT_NODE) {
              for (const tn of getTextNodes(node)) {
                if (!originals.has(tn)) newTextNodes.push(tn);
              }
            }
          }
        }
      }

      if (newTextNodes.length > 0 && translator) {
        const work = () => translateNodes(newTextNodes, (p) => {
          postMessage({ type: 'yaku-progress', progress: p, incremental: true });
        });
        // Serialize: queue behind any in-flight mutation translation
        mutationQueue = (mutationQueue || Promise.resolve()).then(work, work);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  function stopObserver() {
    if (observer) { observer.disconnect(); observer = null; }
  }

  // --- Restore originals ---

  function restoreOriginals() {
    pauseObserver();
    for (const node of originalNodes) {
      const original = originals.get(node);
      if (original != null) {
        try { node.nodeValue = original; } catch {}
      }
    }
    originals = new WeakMap();
    originalNodes.clear();
    resumeObserver();
    stopObserver();
    if (translator) { translator.destroy(); translator = null; }
    isTranslating = false;
    mutationQueue = null;
  }

  // --- Message handling (from bridge.js via postMessage) ---

  function postMessage(data) {
    window.postMessage({ ...data, source: 'yaku-content' }, location.origin);
  }

  window.addEventListener('message', async (event) => {
    if (event.source !== window || event.data?.source !== 'yaku-bridge') return;

    const msg = event.data;

    if (msg.type === 'detect') {
      try {
        const result = await YakuTranslator.detectLanguage();
        postMessage({ type: 'yaku-detected', ...result });
      } catch (e) {
        postMessage({ type: 'yaku-detected', language: 'und', confidence: 0 });
      }
    } else if (msg.type === 'translate') {
      if (isTranslating) return;
      isTranslating = true;
      abortController = new AbortController();

      const signal = abortController.signal;
      try {
        // Auto-detect if needed
        let sourceLang = msg.from;
        if (sourceLang === 'auto') {
          postMessage({ type: 'yaku-status', status: 'detecting' });
          const detected = await YakuTranslator.detectLanguage();
          if (signal.aborted) { isTranslating = false; return; }
          sourceLang = detected.language;
          if (sourceLang === 'und') {
            postMessage({ type: 'yaku-error', error: 'Could not detect page language.' });
            isTranslating = false;
            return;
          }
          postMessage({ type: 'yaku-detected', language: sourceLang, confidence: detected.confidence });
        }

        if (signal.aborted) { isTranslating = false; return; }

        // Create translator (may trigger model download)
        postMessage({ type: 'yaku-status', status: 'preparing' });
        translator = await YakuTranslator.create(sourceLang, msg.to, {
          signal,
          onProgress(ev) {
            if (ev.type === 'download') postMessage({ type: 'yaku-download', progress: ev.progress });
          },
        });

        if (signal.aborted) { translator.destroy(); translator = null; isTranslating = false; return; }

        // Translate page
        postMessage({ type: 'yaku-status', status: 'translating' });
        const textNodes = getTextNodes(document.body);
        await translateNodes(textNodes, (progress) => {
          postMessage({ type: 'yaku-progress', progress });
        });

        if (!signal.aborted) {
          startObserver();
          postMessage({ type: 'yaku-done', from: sourceLang, to: msg.to });
        }
      } catch (e) {
        if (!signal.aborted) {
          postMessage({ type: 'yaku-error', error: e.message });
        }
      }

      isTranslating = false;
    } else if (msg.type === 'cancel') {
      if (abortController) abortController.abort();
      restoreOriginals();
      postMessage({ type: 'yaku-cancelled' });
    } else if (msg.type === 'restore') {
      restoreOriginals();
      postMessage({ type: 'yaku-restored' });
    }
  });

  // Auto-detect language on load and report to bridge
  setTimeout(async () => {
    try {
      const result = await YakuTranslator.detectLanguage();
      postMessage({ type: 'yaku-detected', ...result });
    } catch {}
  }, 500);
})();
