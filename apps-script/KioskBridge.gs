/**
 * PassKiosk secure RPC migration.
 *
 * IMPORTANT: the backend functions listed in dispatchPassKioskRpc_ must be
 * renamed with a trailing underscore so they are private to google.script.run.
 * The existing Apps Script UI should call staffRpc(); the GitHub kiosk bridge
 * calls kioskRpc().
 */

function doGet(e) {
  const p = (e && e.parameter) || {};

  if (String(p.bridge || '') === '1') {
    return HtmlService.createHtmlOutputFromFile('Bridge')
      .setTitle('PassKiosk Bridge')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('PassKiosk')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

function staffRpc(fn, args) {
  const email = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  if (!/@nv\.ccsd\.net$/.test(email)) throw new Error('CCSD sign-in is required for this PassKiosk interface.');
  return dispatchPassKioskRpc_(fn, args);
}

function kioskRpc(key, fn, args) {
  validateKioskBridgeKey_(key);
  return dispatchPassKioskRpc_(fn, args);
}

function dispatchPassKioskRpc_(fn, args) {
  const a = Array.isArray(args) ? args : [];
  switch (String(fn || '')) {
    case 'getFrontDoorConfig': return getFrontDoorConfig_(...a);
    case 'identifyAdult': return identifyAdult_(...a);
    case 'startSession': return startSession_(...a);
    case 'signOut': return signOut_(...a);
    case 'changePrinter': return changePrinter_(...a);
    case 'getBootstrapData': return getBootstrapData_(...a);
    case 'getStudentDetails': return getStudentDetails_(...a);
    case 'getDetentionAvailability': return getDetentionAvailability_(...a);
    case 'submitWorkflow': return submitWorkflow_(...a);
    case 'getRecentPrintJobs': return getRecentPrintJobs_(...a);
    case 'reprintJob': return reprintJob_(...a);
    default: throw new Error('PassKiosk RPC method is not allowed.');
  }
}

function validateKioskBridgeKey_(provided) {
  const expected = PropertiesService.getScriptProperties().getProperty('PASSKIOSK_KIOSK_KEY');
  if (!expected) throw new Error('PassKiosk kiosk bridge key is not configured.');
  if (String(provided || '') !== expected) throw new Error('PassKiosk kiosk bridge authorization failed.');
}

/** Run once from the Apps Script editor, then keep the returned key private. */
function generateKioskBridgeKey_() {
  const key = [Utilities.getUuid(), Utilities.getUuid()].join('').replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty('PASSKIOSK_KIOSK_KEY', key);
  return key;
}
