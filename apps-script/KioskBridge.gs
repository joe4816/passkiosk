/**
 * PassKiosk GitHub kiosk bridge additions.
 *
 * Merge the doGet(e) logic below into the existing PassKiosk Code.gs and add
 * Bridge.html to the Apps Script project. Keep the current domain deployment
 * for staff testing. Create a separate public deployment for the kiosk bridge
 * only after the secret below is configured.
 */

function doGet(e) {
  const p = (e && e.parameter) || {};

  if (String(p.bridge || '') === '1') {
    validateKioskBridgeKey_(p.k);
    return HtmlService.createHtmlOutputFromFile('Bridge')
      .setTitle('PassKiosk Bridge')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  // Existing Apps Script-hosted UI remains available on the CCSD-restricted deployment.
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('PassKiosk')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

function validateKioskBridgeKey_(provided) {
  const expected = PropertiesService.getScriptProperties().getProperty('PASSKIOSK_KIOSK_KEY');
  if (!expected) throw new Error('PassKiosk kiosk bridge key is not configured.');
  if (String(provided || '') !== expected) throw new Error('PassKiosk kiosk bridge authorization failed.');
}

/** Run once from the Apps Script editor, then keep the returned key private. */
function generateKioskBridgeKey() {
  const key = [Utilities.getUuid(), Utilities.getUuid()].join('').replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty('PASSKIOSK_KIOSK_KEY', key);
  return key;
}
