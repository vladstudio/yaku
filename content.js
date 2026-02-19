// content.js — ISOLATED world script
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

  const CHUNK_SIZE = 50;

  async function translateNodes(textNodes, onProgress) {
    const groups = groupByBlock(textNodes);
    const blocks = [...groups.entries()];

    for (let i = 0; i < blocks.length; i += CHUNK_SIZE) {
      if (abortController?.signal.aborted) return;

      const chunk = blocks.slice(i, i + CHUNK_SIZE);
      const texts = chunk.map(([, nodes]) => nodes.map(n => n.nodeValue).join(''));

      // Skip chunks with no real text
      const nonEmpty = texts.map((t, j) => [t, j]).filter(([t]) => t.trim());
      if (!nonEmpty.length) { onProgress?.((i + chunk.length) / blocks.length); continue; }

      try {
        const translations = await translator.translateBatch(nonEmpty.map(([t]) => t));

        pauseObserver();
        try {
          let ti = 0;
          for (const [, j] of nonEmpty) {
            const [, nodes] = chunk[j];
            for (const n of nodes) {
              if (!originals.has(n)) {
                originals.set(n, n.nodeValue);
                originalNodes.add(n);
              }
            }
            nodes[0].nodeValue = translations[ti++];
            for (let k = 1; k < nodes.length; k++) nodes[k].nodeValue = '';
          }
        } finally {
          resumeObserver();
        }
      } catch (e) {
        if (e.name === 'AbortError') return;
        console.warn('[yaku] translation error:', e);
      }

      onProgress?.(Math.min(1, (i + chunk.length) / blocks.length));
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
          sendStatus({ type: 'yaku-progress', progress: p, incremental: true });
        });
        mutationQueue = (mutationQueue || Promise.resolve()).then(work).catch(e => console.warn('[yaku] mutation translation error:', e));
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  function stopObserver() {
    if (observer) { observer.disconnect(); observer = null; }
  }

  // --- Restore originals ---

  function revertNodes() {
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
  }

  function restoreOriginals() {
    revertNodes();
    stopObserver();
    if (translator) { translator.destroy(); translator = null; }
    isTranslating = false;
    mutationQueue = null;
  }

  // --- Message handling (from service worker via chrome.runtime) ---

  function sendStatus(data) {
    chrome.runtime.sendMessage({ ...data, source: 'yaku-content' });
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'detect') {
      handleDetect();
    } else if (msg.type === 'translate') {
      handleTranslate(msg);
    } else if (msg.type === 'cancel') {
      if (abortController) abortController.abort();
      restoreOriginals();
      sendStatus({ type: 'yaku-cancelled' });
    } else if (msg.type === 'restore') {
      restoreOriginals();
      sendStatus({ type: 'yaku-restored' });
    }
  });

  async function handleDetect() {
    try {
      const result = await YakuTranslator.detectLanguage();
      sendStatus({ type: 'yaku-detected', ...result });
    } catch {
      sendStatus({ type: 'yaku-detected', language: 'und', confidence: 0 });
    }
  }

  async function handleTranslate(msg) {
    if (isTranslating) return;

    // Restore originals before re-translating so we always translate from the real source text
    if (originalNodes.size > 0) {
      revertNodes();
      stopObserver();
      if (translator) { translator.destroy(); translator = null; }
    }

    isTranslating = true;
    abortController = new AbortController();
    const signal = abortController.signal;

    try {
      // Auto-detect if needed
      let sourceLang = msg.from;
      if (sourceLang === 'auto') {
        sendStatus({ type: 'yaku-status', status: 'detecting' });
        const detected = await YakuTranslator.detectLanguage();
        if (signal.aborted) { isTranslating = false; return; }
        sourceLang = detected.language;
        if (sourceLang === 'und') {
          sendStatus({ type: 'yaku-error', error: 'Could not detect page language.' });
          isTranslating = false;
          return;
        }
        sendStatus({ type: 'yaku-detected', language: sourceLang, confidence: detected.confidence });
      }

      if (signal.aborted) { isTranslating = false; return; }

      // Create translator
      translator = YakuTranslator.create(sourceLang, msg.to);

      // Translate page or selection
      sendStatus({ type: 'yaku-status', status: 'translating' });
      let textNodes;
      if (msg.mode === 'selection') {
        const sel = window.getSelection();
        textNodes = [];
        for (let i = 0; i < sel.rangeCount; i++) {
          const range = sel.getRangeAt(i);
          const container = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
            ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
          for (const n of getTextNodes(container || document.body)) {
            if (range.intersectsNode(n)) textNodes.push(n);
          }
        }
      } else {
        textNodes = getTextNodes(document.body);
      }
      await translateNodes(textNodes, (progress) => {
        sendStatus({ type: 'yaku-progress', progress });
      });

      if (!signal.aborted) {
        if (msg.mode !== 'selection') startObserver();
        sendStatus({ type: 'yaku-done', from: sourceLang, to: msg.to });
      }
    } catch (e) {
      if (!signal.aborted) {
        sendStatus({ type: 'yaku-error', error: e.message });
      }
    }

    isTranslating = false;
  }

  // Auto-detect language on load
  setTimeout(handleDetect, 500);
})();
