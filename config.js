window.PASSKIOSK_CONFIG = Object.freeze({
  appName: 'PassKiosk',
  version: '0.3.1-github',
  githubOrigin: 'https://joe4816.github.io',
  // Filled after the secure Apps Script bridge deployment is created.
  // Managed ChromeOS configuration is preferred for kiosk mode.
  // One-time fallback provisioning may use the URL fragment:
  // #bridge=<deployment-url>&kiosk=<secret>
  bridgeUrl: ''
});
