window.PASSKIOSK_CONFIG = Object.freeze({
  appName: 'PassKiosk',
  version: '0.3.16-lunch-art',
  githubOrigin: 'https://joe4816.github.io',
  features: Object.freeze({
    explicitExcused: true,
    activityBusData: false
  }),
  // Filled after the secure Apps Script bridge deployment is created.
  // Managed ChromeOS configuration is preferred for kiosk mode.
  // One-time fallback provisioning may use the URL fragment:
  // #bridge=<deployment-url>&kiosk=<secret>
  bridgeUrl: 'https://script.google.com/a/macros/nv.ccsd.net/s/AKfycbxdaUwaVYjkjcQP1keD9RSUn1K2buIAoNLlpEyA0e40spIyXB7u2YuCLksOPu5oMzBsLA/exec'
});

