/**
 * PassKiosk browser RPC boundary.
 *
 * Production migration model:
 *   1. Rename the real browser-facing implementations in Code.gs with a
 *      trailing underscore (for example getFrontDoorConfig_).
 *   2. Keep this file alongside Code.gs.
 *   3. The legacy Apps Script Index.html can keep calling its ORIGINAL
 *      function names; the compatibility wrappers below require a signed-in
 *      CCSD account before delegating.
 *   4. The GitHub kiosk uses kioskRpc(), which requires the private kiosk key.
 *
 * This means the existing Apps Script Index.html does NOT need to be edited
 * during the security migration.
 */

/* ========================================================================== */
/* STAFF / KIOSK RPC                                                          */
/* ========================================================================== */

function staffRpc(fn, args) {
  requireCcsdStaff_();
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

/* ========================================================================== */
/* LEGACY APPS SCRIPT UI COMPATIBILITY                                        */
/* ========================================================================== */
/*
 * These public names intentionally match the current production Index.html.
 * Every path passes through staffRpc(), so an anonymous visitor to a future
 * kiosk deployment cannot use these wrappers.
 */

function getFrontDoorConfig() {
  return staffRpc('getFrontDoorConfig', []);
}

function identifyAdult(usernameInput) {
  return staffRpc('identifyAdult', [usernameInput]);
}

function startSession(usernameInput, printerKey, deviceId) {
  return staffRpc('startSession', [usernameInput, printerKey, deviceId]);
}

function signOut(token) {
  return staffRpc('signOut', [token]);
}

function changePrinter(token, printerKey) {
  return staffRpc('changePrinter', [token, printerKey]);
}

function getBootstrapData(token) {
  return staffRpc('getBootstrapData', [token]);
}

function getStudentDetails(token, studentId) {
  return staffRpc('getStudentDetails', [token, studentId]);
}

function getDetentionAvailability(token, detentionType, studentId) {
  return staffRpc('getDetentionAvailability', [token, detentionType, studentId]);
}

function submitWorkflow(token, request) {
  return staffRpc('submitWorkflow', [token, request]);
}

function getRecentPrintJobs(token, deviceId) {
  return staffRpc('getRecentPrintJobs', [token, deviceId]);
}

function reprintJob(token, deviceId, printJobId) {
  return staffRpc('reprintJob', [token, deviceId, printJobId]);
}

/* ========================================================================== */
/* AUTHORIZATION                                                              */
/* ========================================================================== */

function requireCcsdStaff_() {
  const email = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  if (!/@nv\.ccsd\.net$/.test(email)) {
    throw new Error('CCSD sign-in is required for this PassKiosk interface.');
  }
  return email;
}

function validateKioskBridgeKey_(provided) {
  const expected = PropertiesService.getScriptProperties().getProperty('PASSKIOSK_KIOSK_KEY');
  if (!expected) throw new Error('PassKiosk kiosk bridge key is not configured.');
  if (String(provided || '') !== expected) {
    throw new Error('PassKiosk kiosk bridge authorization failed.');
  }
}

/**
 * Run manually from the Apps Script editor once the secure RPC migration is
 * installed. Keep the returned value private.
 */
function generateKioskBridgeKey_() {
  const key = [Utilities.getUuid(), Utilities.getUuid()].join('').replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty('PASSKIOSK_KIOSK_KEY', key);
  return key;
}

/**
 * Used by Code.gs doGet(e) when ?bridge=1 is requested.
 */
function servePassKioskBridge_() {
  return HtmlService.createHtmlOutputFromFile('Bridge')
    .setTitle('PassKiosk Bridge')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
