(() => {
  'use strict';

  const CONFIG = window.PASSKIOSK_CONFIG || {};
  const STORAGE_KEY_URL = 'PassKioskBridgeUrl';
  const STORAGE_KEY_SECRET = 'PassKioskBridgeKey';
  const MANAGED_KEYS = ['PassKioskBridgeUrl', 'PassKioskKioskKey'];
  const CHANNEL = 'PASSKIOSK_RPC_V1';
  const READY_TIMEOUT_MS = 15000;
  const CALL_TIMEOUT_MS = 30000;

  let iframe = null;
  let bridgeWindow = null;
  let bridgeOrigin = '';
  let readyPromise = null;
  let readyResolve = null;
  let readyReject = null;
  let settingsPromise = null;
  let seq = 0;
  const pending = new Map();

  function consumeLaunchSettings() {
    const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
    if (!hash) return;

    const fragment = new URLSearchParams(hash);
    const bridge = String(fragment.get('bridge') || '').trim();
    const secret = String(fragment.get('kiosk') || '').trim();

    if (bridge) localStorage.setItem(STORAGE_KEY_URL, bridge);
    if (secret) localStorage.setItem(STORAGE_KEY_SECRET, secret);

    if (bridge || secret) {
      history.replaceState(null, document.title, window.location.pathname + window.location.search);
    }
  }

  async function getManagedSettings() {
    if (!navigator.managed || typeof navigator.managed.getManagedConfiguration !== 'function') {
      return {};
    }

    try {
      const value = await navigator.managed.getManagedConfiguration(MANAGED_KEYS);
      return value && typeof value === 'object' ? value : {};
    } catch (_) {
      return {};
    }
  }

  async function getSettings() {
    if (settingsPromise) return settingsPromise;

    settingsPromise = (async () => {
      consumeLaunchSettings();
      const managed = await getManagedSettings();

      const bridgeUrl = String(
        managed.PassKioskBridgeUrl ||
        localStorage.getItem(STORAGE_KEY_URL) ||
        CONFIG.bridgeUrl ||
        ''
      ).trim();

      const kioskKey = String(
        managed.PassKioskKioskKey ||
        localStorage.getItem(STORAGE_KEY_SECRET) ||
        ''
      ).trim();

      return {
        bridgeUrl,
        kioskKey,
        mode: kioskKey ? 'kiosk' : 'staff',
        managed: Boolean(managed.PassKioskBridgeUrl || managed.PassKioskKioskKey)
      };
    })();

    return settingsPromise;
  }

  function buildIframeUrl(bridgeUrl) {
    if (!bridgeUrl) throw new Error('PassKiosk backend bridge is not configured yet.');

    const u = new URL(bridgeUrl);
    u.searchParams.set('bridge', '1');
    u.searchParams.set('v', CONFIG.version || 'github');
    return u.toString();
  }

  function isAllowedBridgeOrigin(origin) {
    try {
      const u = new URL(origin);
      if (u.protocol !== 'https:') return false;
      return u.hostname === 'script.google.com' ||
             u.hostname.endsWith('.googleusercontent.com');
    } catch (_) {
      return false;
    }
  }

  function boot() {
    if (readyPromise) return readyPromise;

    readyPromise = new Promise((resolve, reject) => {
      readyResolve = resolve;
      readyReject = reject;
    });

    (async () => {
      try {
        const settings = await getSettings();
        const src = buildIframeUrl(settings.bridgeUrl);

        iframe = document.createElement('iframe');
        iframe.id = 'passkioskBackendBridge';
        iframe.src = src;
        iframe.tabIndex = -1;
        iframe.setAttribute('aria-hidden', 'true');
        iframe.style.cssText = 'position:fixed;width:1px;height:1px;right:-10px;bottom:-10px;border:0;opacity:0;pointer-events:none;';
        iframe.addEventListener('error', () => readyReject(new Error('PassKiosk backend bridge could not load.')));
        document.body.appendChild(iframe);

        const timer = setTimeout(() => {
          readyReject(new Error('PassKiosk backend did not respond. Check the backend deployment and sign-in.'));
        }, READY_TIMEOUT_MS);

        readyPromise.then(() => clearTimeout(timer), () => clearTimeout(timer));
      } catch (err) {
        readyReject(err);
      }
    })();

    return readyPromise;
  }

  window.addEventListener('message', event => {
    const msg = event.data || {};
    if (msg.channel !== CHANNEL) return;

    if (msg.type === 'ready') {
      if (!isAllowedBridgeOrigin(event.origin)) return;

      // Apps Script HtmlService runs the actual Bridge.html inside a
      // googleusercontent frame. Remember that exact inner window and origin;
      // iframe.contentWindow is only the outer Apps Script container.
      bridgeWindow = event.source;
      bridgeOrigin = event.origin;

      if (readyResolve) readyResolve(true);
      return;
    }

    if (msg.type !== 'result' || !msg.id) return;
    if (!bridgeWindow || event.source !== bridgeWindow || event.origin !== bridgeOrigin) return;

    const waiter = pending.get(msg.id);
    if (!waiter) return;
    pending.delete(msg.id);
    clearTimeout(waiter.timer);

    if (msg.ok) waiter.resolve(msg.value);
    else waiter.reject(new Error(msg.error || 'PassKiosk backend call failed.'));
  });

  async function call(fn, ...args) {
    await boot();
    const settings = await getSettings();

    if (!bridgeWindow || !bridgeOrigin) {
      throw new Error('PassKiosk backend bridge is not ready.');
    }

    const id = `rpc-${Date.now()}-${++seq}`;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`PassKiosk backend timed out while running ${fn}.`));
      }, CALL_TIMEOUT_MS);

      pending.set(id, { resolve, reject, timer });

      bridgeWindow.postMessage({
        channel: CHANNEL,
        type: 'call',
        id,
        key: settings.kioskKey,
        fn,
        args
      }, bridgeOrigin);
    });
  }

  async function mode() {
    const settings = await getSettings();
    return settings.mode;
  }

  function clearAuthorization() {
    localStorage.removeItem(STORAGE_KEY_URL);
    localStorage.removeItem(STORAGE_KEY_SECRET);
    settingsPromise = null;
  }

  window.PassKioskBridge = Object.freeze({
    ready: boot,
    call,
    mode,
    clearAuthorization
  });
})();
