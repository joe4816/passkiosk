// Loaded only by Apps Script's authenticated staff page.
// Staff identity and authorization stay in staffRpc on every call.
(() => {
  if (!window.PASSKIOSK_NATIVE_STAFF) return;
  function call(fn, ...args) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('PassKiosk timed out while running '+fn+'. Please retry.')), 45000);
      google.script.run
        .withSuccessHandler(value => { clearTimeout(timer); resolve(value); })
        .withFailureHandler(error => { clearTimeout(timer); reject(new Error(error?.message || String(error))); })
        .staffRpc(fn, args);
    });
  }
  window.PassKioskBridge = Object.freeze({
    mode: async () => 'staff', ready: async () => true,
    reconnect: async () => true, call
  });
})();
