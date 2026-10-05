/**
 * PassKiosk browser RPC boundary.
 *
 * Production migration model:
 *   1. Rename the real browser-facing implementations in Code.gs with a
 *      trailing underscore (for example getFrontDoorConfig_).
 *   2. Keep this file alongside Code.gs.
 *   3. Normal staff sessions use the authenticated CCSD Google account as the
 *      PassKiosk identity. Staff do NOT choose or type their identity.
 *   4. The dedicated managed kiosk may use the kiosk key path because kiosk
 *      mode has no ordinary signed-in Google user.
 */

/* ========================================================================== */
/* STAFF / KIOSK RPC                                                          */
/* ========================================================================== */

function staffRpc(fn, args) {
  const adult = requireActiveCcsdAdult_();
  const method = String(fn || '');
  const a = Array.isArray(args) ? args.slice() : [];

  // Identity comes from the authenticated Google account, never client input.
  if (method === 'getAuthenticatedProfile' || method === 'identifyAdult') {
    return authenticatedAdultPayload_(adult);
  }

  if (method === 'startEmailSession') {
    return startEmailSession_(adult.username, a[1], 'STAFF', requireCcsdStaffEmail_());
  }

  if (['getPdfEmailConfig', 'submitEmailWorkflow', 'getRecentPdfEmails', 'retryPdfEmail'].includes(method)) {
    const session = requireSession_(a[0]);
    if (session.username !== adult.username || session.emailAuthMode !== 'STAFF') {
      throw new Error('PDF delivery must use your authenticated staff session.');
    }
  }

  // The legacy/current clients still pass a username as argument zero.
  // Ignore it for staff sessions and force the authenticated adult instead.
  if (method === 'startSession') {
    a[0] = adult.username;
    const result = startSession_(...a);
    return typeof bindPdfEmailIdentity_ === 'function'
      ? bindPdfEmailIdentity_(result, 'STAFF', requireCcsdStaffEmail_()) : result;
  }

  return dispatchPassKioskRpc_(method, a);
}

function kioskRpc(key, fn, args) {
  validateKioskBridgeKey_(key);
  const method = String(fn || '');

  if (method === 'getAuthenticatedProfile') {
    throw new Error('Authenticated Google profile is not available in kiosk mode.');
  }

  const a = Array.isArray(args) ? args : [];
  if (method === 'startEmailSession') return startEmailSession_(a[0], a[1], 'KIOSK', '');
  if (method === 'startSession') {
    const result = startSession_(...a);
    return typeof bindPdfEmailIdentity_ === 'function'
      ? bindPdfEmailIdentity_(result, 'KIOSK', '') : result;
  }
  return dispatchPassKioskRpc_(method, a);
}

function dispatchPassKioskRpc_(fn, args) {
  const a = Array.isArray(args) ? args : [];

  switch (String(fn || '')) {
    case 'getFrontDoorConfig': {
      const result = getFrontDoorConfig_(...a);
      if (typeof pdfEmailFrontConfig_ === 'function') result.pdfEmail = pdfEmailFrontConfig_();
      return result;
    }
    case 'identifyAdult': return identifyAdult_(...a);
    case 'startSession': return startSession_(...a);
    case 'signOut': return signOut_(...a);
    case 'changePrinter': return changePrinter_(...a);
    case 'getBootstrapData': {
      const result = getBootstrapData_(...a);
      if (typeof getPdfEmailConfig_ === 'function') result.pdfEmail = getPdfEmailConfig_(a[0]);
      return result;
    }
    case 'getPdfEmailConfig': return getPdfEmailConfig_(...a);
    case 'submitEmailWorkflow': return submitEmailWorkflow_(...a);
    case 'getRecentPdfEmails': return getRecentPdfEmails_(...a);
    case 'retryPdfEmail': return retryPdfEmail_(...a);
    case 'getStudentDetails': return getStudentDetails_(...a);
    case 'getDetentionAvailability': return getDetentionAvailability_(...a);
    case 'getBusInfo': return getBusInfoForSession_(...a);
    case 'submitBusWorkflow': return submitBusWorkflow_(...a);
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
 * Every path passes through staffRpc(), so the signed-in CCSD account remains
 * authoritative even if the old UI still renders a username field.
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

function getBusInfo(token, studentId) {
  return staffRpc('getBusInfo', [token, studentId]);
}

function submitBusWorkflow(token, request) {
  return staffRpc('submitBusWorkflow', [token, request]);
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

function requireCcsdStaffEmail_() {
  const email = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  if (!/@nv\.ccsd\.net$/.test(email)) {
    throw new Error('CCSD sign-in is required for PassKiosk.');
  }
  return email;
}

function requireActiveCcsdAdult_() {
  const email = requireCcsdStaffEmail_();
  const username = normalizeUsername_(email);
  const adult = getActiveAdultByUsername_(username);

  if (!adult) {
    throw new Error('Your CCSD account is not active in PassKiosk.');
  }

  return adult;
}

function authenticatedAdultPayload_(adult) {
  return {
    ok: true,
    username: adult.username,
    displayName: adult.displayName,
    role: adult.role,
    defaultLocation: adult.defaultLocation,
    sig: adult.sig
  };
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


/* PDF email public wrappers retain authenticated staff identity. */
function startEmailSession(username, deviceId) { return staffRpc('startEmailSession', [username, deviceId]); }
function getPdfEmailConfig(token) { return staffRpc('getPdfEmailConfig', [token]); }
function submitEmailWorkflow(token, request) { return staffRpc('submitEmailWorkflow', [token, request]); }
function getRecentPdfEmails(token, deviceId) { return staffRpc('getRecentPdfEmails', [token, deviceId]); }
function retryPdfEmail(token, deviceId, id) { return staffRpc('retryPdfEmail', [token, deviceId, id]); }
