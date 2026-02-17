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

  let originals = new Map();     // node → original textContent
  let translator = null;
  let observer = null;
  let abortController = null;
  let isTranslating = false;
  let currentTargetLang = null;
  let currentSourceLang = null;
  let pendingNodes = [];

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
        if (nodes.length === 1) {
          if (!originals.has(nodes[0])) originals.set(nodes[0], nodes[0].nodeValue);
          nodes[0].nodeValue = translated;
        } else {
          // Put all translated text in first node, empty the rest
          for (const n of nodes) {
            if (!originals.has(n)) originals.set(n, n.nodeValue);
          }
          nodes[0].nodeValue = translated;
          for (let i = 1; i < nodes.length; i++) nodes[i].nodeValue = '';
        }
        resumeObserver();
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
      if (observerPaused || !isTranslating && !translator) return;

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
        translateNodes(newTextNodes, (p) => {
          postMessage({ type: 'yaku-progress', progress: p, incremental: true });
        });
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
    for (const [node, original] of originals) {
      try { node.nodeValue = original; } catch {}
    }
    originals.clear();
    resumeObserver();
    stopObserver();
    if (translator) { translator.destroy(); translator = null; }
    isTranslating = false;
  }

  // --- Message handling (from bridge.js via postMessage) ---

  function postMessage(data) {
    window.postMessage({ ...data, source: 'yaku-content' }, '*');
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
    }

    if (msg.type === 'translate') {
      if (isTranslating) return;
      isTranslating = true;
      abortController = new AbortController();
      currentSourceLang = msg.from;
      currentTargetLang = msg.to;

      try {
        // Auto-detect if needed
        let sourceLang = msg.from;
        if (sourceLang === 'auto') {
          postMessage({ type: 'yaku-status', status: 'detecting' });
          const detected = await YakuTranslator.detectLanguage();
          sourceLang = detected.language;
          if (sourceLang === 'und') {
            postMessage({ type: 'yaku-error', error: 'Could not detect page language.' });
            isTranslating = false;
            return;
          }
          postMessage({ type: 'yaku-detected', language: sourceLang, confidence: detected.confidence });
        }

        currentSourceLang = sourceLang;

        // Create translator
        postMessage({ type: 'yaku-status', status: 'downloading' });
        translator = await YakuTranslator.create(sourceLang, msg.to, (ev) => {
          if (ev.type === 'download') {
            postMessage({ type: 'yaku-download', progress: ev.progress });
          }
        });

        if (abortController.signal.aborted) { translator.destroy(); translator = null; isTranslating = false; return; }

        // Translate page
        postMessage({ type: 'yaku-status', status: 'translating' });
        const textNodes = getTextNodes(document.body);
        await translateNodes(textNodes, (progress) => {
          postMessage({ type: 'yaku-progress', progress });
        });

        if (!abortController.signal.aborted) {
          startObserver();
          postMessage({ type: 'yaku-done', from: sourceLang, to: msg.to });
        }
      } catch (e) {
        postMessage({ type: 'yaku-error', error: e.message });
      }

      isTranslating = false;
    }

    if (msg.type === 'cancel') {
      if (abortController) abortController.abort();
      restoreOriginals();
      postMessage({ type: 'yaku-cancelled' });
    }

    if (msg.type === 'restore') {
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
