(() => {
  'use strict';

  const CONFIG = window.PASSKIOSK_CONFIG || {};
  const STORAGE_KEY_URL = 'PassKioskBridgeUrl';
  const STORAGE_KEY_SECRET = 'PassKioskBridgeKey';
  const CHANNEL = 'PASSKIOSK_RPC_V1';
  const READY_TIMEOUT_MS = 15000;
  const CALL_TIMEOUT_MS = 30000;

  let iframe = null;
  let readyPromise = null;
  let readyResolve = null;
  let readyReject = null;
  let seq = 0;
  const pending = new Map();

  function consumeLaunchSettings() {
    // Secrets belong in the URL fragment, never the query string. Fragments are
    // not sent to GitHub Pages or upstream web servers.
    const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
    const fragment = new URLSearchParams(hash);
    const bridge = String(fragment.get('bridge') || '').trim();
    const secret = String(fragment.get('kiosk') || '').trim();

    if (bridge) localStorage.setItem(STORAGE_KEY_URL, bridge);
    if (secret) localStorage.setItem(STORAGE_KEY_SECRET, secret);

    if (bridge || secret) {
      history.replaceState(null, document.title, window.location.pathname + window.location.search);
    }
  }

  function getSettings() {
    consumeLaunchSettings();
    return {
      bridgeUrl: String(localStorage.getItem(STORAGE_KEY_URL) || CONFIG.bridgeUrl || '').trim(),
      kioskKey: String(localStorage.getItem(STORAGE_KEY_SECRET) || '').trim()
    };
  }

  function buildIframeUrl() {
    const { bridgeUrl } = getSettings();
    if (!bridgeUrl) throw new Error('PassKiosk backend bridge is not configured yet.');

    const u = new URL(bridgeUrl);
    u.searchParams.set('bridge', '1');
    u.searchParams.set('v', CONFIG.version || 'github');
    return u.toString();
  }

  function boot() {
    if (readyPromise) return readyPromise;

    readyPromise = new Promise((resolve, reject) => {
      readyResolve = resolve;
      readyReject = reject;
    });

    const { kioskKey } = getSettings();
    if (!kioskKey) {
      readyReject(new Error('This device has not been authorized for PassKiosk yet.'));
      return readyPromise;
    }

    let src;
    try {
      src = buildIframeUrl();
    } catch (err) {
      readyReject(err);
      return readyPromise;
    }

    iframe = document.createElement('iframe');
    iframe.id = 'passkioskBackendBridge';
    iframe.src = src;
    iframe.tabIndex = -1;
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;width:1px;height:1px;right:-10px;bottom:-10px;border:0;opacity:0;pointer-events:none;';
    iframe.addEventListener('error', () => readyReject(new Error('PassKiosk backend bridge could not load.')));
    document.body.appendChild(iframe);

    const timer = setTimeout(() => {
      readyReject(new Error('PassKiosk backend did not respond. Check the kiosk bridge deployment and network connection.'));
    }, READY_TIMEOUT_MS);

    readyPromise.then(() => clearTimeout(timer), () => clearTimeout(timer));
    return readyPromise;
  }

  window.addEventListener('message', event => {
    if (!iframe || event.source !== iframe.contentWindow) return;
    const msg = event.data || {};
    if (msg.channel !== CHANNEL) return;

    if (msg.type === 'ready') {
      if (readyResolve) readyResolve(true);
      return;
    }

    if (msg.type !== 'result' || !msg.id) return;
    const waiter = pending.get(msg.id);
    if (!waiter) return;
    pending.delete(msg.id);
    clearTimeout(waiter.timer);

    if (msg.ok) waiter.resolve(msg.value);
    else waiter.reject(new Error(msg.error || 'PassKiosk backend call failed.'));
  });

  async function call(fn, ...args) {
    await boot();
    const { kioskKey } = getSettings();
    if (!kioskKey) throw new Error('This device has not been authorized for PassKiosk yet.');

    const id = `rpc-${Date.now()}-${++seq}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`PassKiosk backend timed out while running ${fn}.`));
      }, CALL_TIMEOUT_MS);

      pending.set(id, { resolve, reject, timer });
      iframe.contentWindow.postMessage({
        channel: CHANNEL,
        type: 'call',
        id,
        key: kioskKey,
        fn,
        args
      }, '*');
    });
  }

  function clearAuthorization() {
    localStorage.removeItem(STORAGE_KEY_URL);
    localStorage.removeItem(STORAGE_KEY_SECRET);
  }

  window.PassKioskBridge = Object.freeze({ ready: boot, call, clearAuthorization });
})();
