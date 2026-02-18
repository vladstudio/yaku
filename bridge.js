// bridge.js — ISOLATED world content script
// Relays messages between chrome.runtime (SW/popup) and window.postMessage (MAIN world content.js)

(() => {
  // SW/popup → content.js
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    window.postMessage({ ...msg, source: 'yaku-bridge' }, location.origin);
    sendResponse({ ok: true });
  });

  // content.js → SW
  window.addEventListener('message', (event) => {
    if (event.source !== window || event.data?.source !== 'yaku-content') return;
    chrome.runtime.sendMessage(event.data);
  });
})();
