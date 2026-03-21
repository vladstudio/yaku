// content.js — ISOLATED world script
// Handles DOM traversal, translation, and incremental updates

(() => {
  const SKIP_TAGS = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'TEXTAREA', 'INPUT', 'SVG',
  ]);

  const TRANSLATABLE_ATTRS = new Map([
    ['placeholder', new Set(['INPUT', 'TEXTAREA'])],
    ['title', null],
    ['alt', new Set(['IMG', 'AREA', 'INPUT'])],
    ['label', new Set(['OPTION', 'OPTGROUP', 'TRACK'])],
    ['aria-label', null],
    ['aria-placeholder', null],
  ]);

  const ATTR_NAMES = [...TRANSLATABLE_ATTRS.keys()];
  const ATTR_SELECTOR = ATTR_NAMES.map(a => `[${a}]`).join(',');

  const BLOCK_ELEMENTS = new Set([
    'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'BODY', 'DD', 'DIV', 'DL',
    'DT', 'FIELDSET', 'FIGCAPTION', 'FIGURE', 'FOOTER', 'FORM',
    'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HR', 'LI', 'MAIN',
    'NAV', 'OL', 'P', 'SECTION', 'TABLE', 'TBODY', 'TD', 'TFOOT', 'TH',
    'THEAD', 'TR', 'UL',
  ]);

  const VIEWPORT_MARGIN_PX = 200;
  const MUTATION_DEBOUNCE_MS = 120;
  const BATCH_MAX_CHARS = 4000;
  const BATCH_MAX_BLOCKS = 40;
  const BATCH_CONCURRENCY = 3;

  let originals = new WeakMap();  // node -> original textContent
  let originalNodes = new Set();  // track nodes for restore iteration
  let dirtyTranslatedNodes = new WeakSet(); // translated nodes changed by page scripts
  let originalAttrs = new WeakMap();     // element -> Map<attr, originalValue>
  let originalAttrElements = new Set();  // track elements for restore
  let translator = null;
  let observer = null;
  let visibilityObserver = null;
  let abortController = null;

  let isTranslating = false;
  let observerPaused = false;
  let hasDetectedLanguage = false;
  let detectInFlight = false;

  let translationQueue = Promise.resolve();
  let pendingVisibilityBlocks = new Map(); // element -> { element, nodeSet }
  let pendingMutationRoots = new Set();
  let mutationTimer = null;

  function isBlockElement(el) {
    return !!el && el.nodeType === Node.ELEMENT_NODE && BLOCK_ELEMENTS.has(el.tagName);
  }

  function shouldSkipElement(el) {
    return !el || SKIP_TAGS.has(el.tagName);
  }

  function isHiddenByAttributes(el) {
    return !!(el.hidden || el.hasAttribute('inert') || el.getAttribute('aria-hidden') === 'true');
  }

  function hasHiddenStyle(el) {
    const style = getComputedStyle(el);
    return (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.visibility === 'collapse' ||
      style.contentVisibility === 'hidden'
    );
  }

  function findNearestBlockAncestor(el) {
    let current = el;
    while (current && current !== document.documentElement) {
      if (isBlockElement(current)) return current;
      current = current.parentElement;
    }
    return document.body;
  }

  function getElementVisibility(el, margin = 0) {
    if (!el || !el.isConnected || isHiddenByAttributes(el)) {
      return { renderable: false, inViewport: false };
    }

    if (hasHiddenStyle(el)) {
      return { renderable: false, inViewport: false };
    }

    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return { renderable: false, inViewport: false };
    }

    const vw = window.innerWidth || document.documentElement.clientWidth;
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const inViewport = (
      rect.bottom >= -margin &&
      rect.top <= vh + margin &&
      rect.right >= -margin &&
      rect.left <= vw + margin
    );

    return { renderable: true, inViewport };
  }

  function collectBlocks(root) {
    if (!root) return [];

    const startElement = root.nodeType === Node.ELEMENT_NODE
      ? root
      : root.parentElement;

    const initialBlock = startElement
      ? findNearestBlockAncestor(startElement)
      : document.body;

    const blockMap = new Map();
    const stack = [{ node: root, block: initialBlock }];

    while (stack.length > 0) {
      const { node, block } = stack.pop();

      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.nodeValue;
        if (!text || !text.trim() || originals.has(node)) continue;
        if (!block || !block.isConnected) continue;

        if (!blockMap.has(block)) blockMap.set(block, []);
        blockMap.get(block).push(node);
        continue;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) continue;

      const el = node;
      if (shouldSkipElement(el)) continue;

      let currentBlock = block;
      if (isBlockElement(el)) currentBlock = el;

      const children = el.childNodes;
      for (let i = children.length - 1; i >= 0; i--) {
        stack.push({ node: children[i], block: currentBlock });
      }
    }

    const blocks = [];
    for (const [element, nodes] of blockMap.entries()) {
      if (!nodes.length) continue;
      const text = nodes.map((n) => n.nodeValue).join('');
      if (!text.trim()) continue;
      blocks.push({ element, nodes, text });
    }

    return blocks;
  }

  function normalizeBlocks(blocks) {
    const byElement = new Map();

    for (const block of blocks) {
      if (!block?.element || !block.element.isConnected) continue;

      let set = byElement.get(block.element);
      if (!set) {
        set = new Set();
        byElement.set(block.element, set);
      }

      for (const node of block.nodes || []) {
        if (!node || !node.isConnected) continue;
        if (originals.has(node) && !dirtyTranslatedNodes.has(node)) continue;
        const value = node.nodeValue;
        if (!value || !value.trim()) continue;
        set.add(node);
      }
    }

    const normalized = [];
    for (const [element, nodeSet] of byElement.entries()) {
      const nodes = [...nodeSet];
      if (!nodes.length) continue;

      const text = nodes.map((n) => n.nodeValue).join('');
      if (!text.trim()) continue;

      normalized.push({ element, nodes, text });
    }

    return normalized;
  }

  function collectTranslatableAttrs(root) {
    const items = [];
    if (!root || !root.isConnected) return items;

    const startEl = root.nodeType === Node.ELEMENT_NODE ? root : root.parentElement;
    if (!startEl) return items;

    const elements = startEl.querySelectorAll(ATTR_SELECTOR);
    const candidates = startEl.matches?.(ATTR_SELECTOR)
      ? [startEl, ...elements]
      : [...elements];

    for (const el of candidates) {
      for (const [attr, allowedTags] of TRANSLATABLE_ATTRS) {
        if (allowedTags && !allowedTags.has(el.tagName)) continue;
        const val = el.getAttribute(attr);
        if (!val || !val.trim()) continue;
        const existing = originalAttrs.get(el);
        if (existing?.has(attr)) continue;
        items.push({ element: el, attr, text: val.trim() });
      }
    }

    return items;
  }

  function partitionBlocksByViewport(blocks) {
    const inViewport = [];
    const deferred = [];

    for (const block of blocks) {
      const visibility = getElementVisibility(block.element, VIEWPORT_MARGIN_PX);
      if (visibility.inViewport || !visibility.renderable) inViewport.push(block);
      else deferred.push(block);
    }

    return { inViewport, deferred };
  }

  function buildBatches(blocks) {
    const batches = [];
    let current = [];
    let chars = 0;

    for (const block of blocks) {
      const len = block.text.length;
      const shouldSplit = (
        current.length > 0 &&
        (current.length >= BATCH_MAX_BLOCKS || chars + len > BATCH_MAX_CHARS)
      );

      if (shouldSplit) {
        batches.push(current);
        current = [];
        chars = 0;
      }

      current.push(block);
      chars += len;
    }

    if (current.length > 0) batches.push(current);
    return batches;
  }

  function pauseObserver() { observerPaused = true; }
  function resumeObserver() { observerPaused = false; }

  function applyBatch(batch, translations) {
    pauseObserver();
    try {
      for (let i = 0; i < batch.length; i++) {
        const item = batch[i];
        const translatedText = translations[i];
        if (typeof translatedText !== 'string') continue;

        if (item.attr) {
          const el = item.element;
          if (!el?.isConnected) continue;
          if (!originalAttrs.has(el)) originalAttrs.set(el, new Map());
          const map = originalAttrs.get(el);
          if (!map.has(item.attr)) {
            map.set(item.attr, el.getAttribute(item.attr));
            originalAttrElements.add(el);
          }
          try { el.setAttribute(item.attr, translatedText); } catch {}
        } else {
          const node = item.node;
          if (!node?.isConnected) continue;

          if (!originals.has(node)) {
            originals.set(node, node.nodeValue);
            originalNodes.add(node);
          } else if (dirtyTranslatedNodes.has(node)) {
            originals.set(node, node.nodeValue);
            dirtyTranslatedNodes.delete(node);
          }

          try {
            node.nodeValue = `${item.leadingWhitespace}${translatedText}${item.trailingWhitespace}`;
          } catch {}
        }
      }
    } finally {
      if (observer) observer.takeRecords(); // discard our own mutations
      resumeObserver();
    }
  }

  async function translateBlocks(blocks, onProgress, attrItems) {
    if (!translator) return 0;

    const normalized = normalizeBlocks(blocks);
    const items = [];
    for (const block of normalized) {
      for (const node of block.nodes) {
        const text = node.nodeValue;
        if (!text || !text.trim()) continue;

        const match = text.match(/^(\s*)([\s\S]*?)(\s*)$/);
        if (!match) continue;

        const leadingWhitespace = match[1];
        const coreText = match[2];
        const trailingWhitespace = match[3];
        if (!coreText.trim()) continue;

        items.push({
          node,
          text: coreText,
          leadingWhitespace,
          trailingWhitespace,
        });
      }
    }

    if (attrItems) {
      for (const ai of attrItems) {
        if (!ai.element?.isConnected) continue;
        items.push({ attr: ai.attr, element: ai.element, text: ai.text });
      }
    }

    if (!items.length) {
      onProgress?.(1);
      return 0;
    }

    const batches = buildBatches(items);
    let completed = 0;
    let translatedCount = 0;
    let nextBatch = 0;

    const workerCount = Math.min(BATCH_CONCURRENCY, batches.length);

    const workers = Array.from({ length: workerCount }, async () => {
      while (true) {
        if (abortController?.signal.aborted || !translator) return;

        const batchIndex = nextBatch;
        nextBatch += 1;
        if (batchIndex >= batches.length) return;

        const batch = batches[batchIndex];

        try {
          const translations = await translator.translateBatch(batch.map((item) => item.text));
          if (abortController?.signal.aborted || !translator) return;
          applyBatch(batch, translations);
          translatedCount += batch.length;
        } catch (e) {
          if (e.name === 'AbortError') return;
          console.warn('[yaku] translation error:', e);
        } finally {
          completed += 1;
          onProgress?.(completed / batches.length);
        }
      }
    });

    await Promise.all(workers);
    return translatedCount;
  }

  function ensureVisibilityObserver() {
    if (visibilityObserver) return;

    visibilityObserver = new IntersectionObserver((entries) => {
      if (!translator || observerPaused) return;

      const ready = [];
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;

        const block = pendingVisibilityBlocks.get(entry.target);
        if (!block) continue;

        pendingVisibilityBlocks.delete(entry.target);
        visibilityObserver.unobserve(entry.target);
        const nodes = [...block.nodeSet];
        if (nodes.length) ready.push({ element: block.element, nodes, text: '' });
      }

      sendStatus({ type: 'yaku-deferred', pending: pendingVisibilityBlocks.size });
      if (ready.length) enqueueBlockTranslation(ready);
    }, {
      root: null,
      rootMargin: `${VIEWPORT_MARGIN_PX}px 0px ${VIEWPORT_MARGIN_PX}px 0px`,
      threshold: 0.01,
    });
  }

  function addDeferredBlocks(blocks) {
    if (!blocks.length) return;

    ensureVisibilityObserver();

    for (const block of blocks) {
      if (!block?.element || !block.element.isConnected) continue;

      const existing = pendingVisibilityBlocks.get(block.element);
      if (existing) {
        for (const node of block.nodes) existing.nodeSet.add(node);
      } else {
        const nodeSet = new Set();
        for (const node of block.nodes) nodeSet.add(node);
        pendingVisibilityBlocks.set(block.element, {
          element: block.element,
          nodeSet,
        });
        visibilityObserver.observe(block.element);
      }
    }

    sendStatus({ type: 'yaku-deferred', pending: pendingVisibilityBlocks.size });
  }

  function enqueueBlockTranslation(blocks, attrItems = []) {
    if (!blocks.length && !attrItems.length) return;
    if (!translator) return;

    const work = async () => {
      if (abortController?.signal.aborted || !translator) return;
      await translateBlocks(blocks, null, attrItems);
    };

    translationQueue = translationQueue
      .then(work)
      .catch((e) => console.warn('[yaku] incremental translation error:', e));
  }

  function queueMutationRoot(node) {
    if (!node) return;

    if (node.nodeType === Node.TEXT_NODE) {
      if (node.parentElement) pendingMutationRoots.add(node.parentElement);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      pendingMutationRoots.add(node);
    }

    if (mutationTimer) return;

    mutationTimer = setTimeout(() => {
      mutationTimer = null;
      flushMutationQueue();
    }, MUTATION_DEBOUNCE_MS);
  }

  function flushMutationQueue() {
    if (observerPaused || !translator || abortController?.signal.aborted) {
      pendingMutationRoots.clear();
      return;
    }

    const roots = [...pendingMutationRoots];
    pendingMutationRoots.clear();
    if (!roots.length) return;

    const blocks = [];
    const attrItems = [];
    for (const root of roots) {
      if (!root.isConnected) continue;
      blocks.push(...collectBlocks(root));
      attrItems.push(...collectTranslatableAttrs(root));
    }

    const normalized = normalizeBlocks(blocks);
    if (!normalized.length && !attrItems.length) return;

    const { inViewport, deferred } = partitionBlocksByViewport(normalized);
    if (deferred.length) addDeferredBlocks(deferred);
    if (inViewport.length || attrItems.length) enqueueBlockTranslation(inViewport, attrItems);
  }

  function startObserver() {
    const root = document.documentElement || document.body;
    if (!root) return;

    if (observer) observer.disconnect();

    observer = new MutationObserver((mutations) => {
      if (observerPaused || !translator) return;

      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          for (const node of mutation.addedNodes) {
            queueMutationRoot(node);
          }
        } else if (mutation.type === 'characterData') {
          if (mutation.target?.nodeType === Node.TEXT_NODE && originals.has(mutation.target)) {
            dirtyTranslatedNodes.add(mutation.target);
          }
          queueMutationRoot(mutation.target);
        } else if (mutation.type === 'attributes') {
          const el = mutation.target;
          const map = originalAttrs.get(el);
          if (map) map.delete(mutation.attributeName);
          queueMutationRoot(el);
        }
      }
    });

    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ATTR_NAMES,
    });
  }

  function stopObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }

    if (mutationTimer) {
      clearTimeout(mutationTimer);
      mutationTimer = null;
    }

    pendingMutationRoots.clear();
  }

  function stopVisibilityObserver() {
    if (visibilityObserver) {
      visibilityObserver.disconnect();
      visibilityObserver = null;
    }
    pendingVisibilityBlocks.clear();
    sendStatus({ type: 'yaku-deferred', pending: 0 });
  }

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

    for (const el of originalAttrElements) {
      const map = originalAttrs.get(el);
      if (!map) continue;
      for (const [attr, val] of map) {
        try { el.setAttribute(attr, val); } catch {}
      }
    }
    originalAttrs = new WeakMap();
    originalAttrElements.clear();

    resumeObserver();
  }

  function restoreOriginals() {
    revertNodes();
    stopObserver();
    stopVisibilityObserver();
    translationQueue = Promise.resolve();
    if (translator) {
      translator.destroy();
      translator = null;
    }
    dirtyTranslatedNodes = new WeakSet();
    abortController = null;
    isTranslating = false;
  }

  function sendStatus(data) {
    chrome.runtime.sendMessage({ ...data, source: 'yaku-content' });
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'detect') {
      handleDetect();
    } else if (msg.type === 'activate' || msg.type === 'translate') {
      handleActivate(msg);
    } else if (msg.type === 'deactivate' || msg.type === 'cancel' || msg.type === 'restore') {
      if (abortController) abortController.abort();
      restoreOriginals();
      sendStatus({ type: 'yaku-inactive' });
    }

    if (msg.type === 'hasSelection') sendResponse(false);
  });

  async function handleDetect() {
    if (detectInFlight) return;
    detectInFlight = true;
    try {
      const result = await YakuTranslator.detectLanguage();
      hasDetectedLanguage = true;
      sendStatus({ type: 'yaku-detected', ...result });
    } catch {
      hasDetectedLanguage = true;
      sendStatus({ type: 'yaku-detected', language: 'und', confidence: 0 });
    } finally {
      detectInFlight = false;
    }
  }

  async function handleActivate(msg) {
    if (isTranslating) return;

    // Restore originals before re-translating so we always translate from source text
    if (originalNodes.size > 0 || originalAttrElements.size > 0) {
      revertNodes();
      stopObserver();
      stopVisibilityObserver();
      if (translator) {
        translator.destroy();
        translator = null;
      }
      translationQueue = Promise.resolve();
    }

    isTranslating = true;
    abortController = new AbortController();
    const signal = abortController.signal;

    try {
      let sourceLang = msg.from;
      let pendingDeferred = 0;
      if (sourceLang === 'auto') {
        sendStatus({ type: 'yaku-status', status: 'detecting' });
        const detected = await YakuTranslator.detectLanguage();
        if (signal.aborted) {
          isTranslating = false;
          abortController = null;
          return;
        }

        sourceLang = detected.language;
        hasDetectedLanguage = true;
        if (sourceLang === 'und') {
          sendStatus({ type: 'yaku-error', error: 'Could not detect page language.' });
          isTranslating = false;
          abortController = null;
          return;
        }

        sendStatus({ type: 'yaku-detected', language: sourceLang, confidence: detected.confidence });
      }

      if (signal.aborted) {
        isTranslating = false;
        abortController = null;
        return;
      }

      translator = YakuTranslator.create(sourceLang, msg.to);
      sendStatus({ type: 'yaku-status', status: 'translating' });

      const root = document.body || document.documentElement;
      const allBlocks = normalizeBlocks(collectBlocks(root));
      const { inViewport, deferred } = partitionBlocksByViewport(allBlocks);
      const attrItems = collectTranslatableAttrs(root);

      await translateBlocks(inViewport, (progress) => {
        sendStatus({ type: 'yaku-progress', progress });
      }, attrItems);

      addDeferredBlocks(deferred);
      pendingDeferred = pendingVisibilityBlocks.size;

      if (!signal.aborted) {
        startObserver();
        sendStatus({ type: 'yaku-done', from: sourceLang, to: msg.to, pendingDeferred });
      }
    } catch (e) {
      if (!signal.aborted) {
        sendStatus({ type: 'yaku-error', error: e.message });
      }
    }

    isTranslating = false;
    abortController = null;
  }

  // Fallback detect in case the worker's initial detect message was missed.
  setTimeout(() => {
    if (!hasDetectedLanguage && !isTranslating) handleDetect();
  }, 1500);

  sendStatus({ type: 'yaku-ready' });
})();
