/**
 * PrintHub endpoint integration for PassKiosk.
 *
 * Security model:
 * - the endpoint credential lives only in Apps Script Properties and managed
 *   Chrome extension policy;
 * - the public PrintHub page never receives the credential;
 * - one credential is authorized for one endpoint ID;
 * - the endpoint may claim only Print_Jobs already stamped for that endpoint.
 *
 * Receipt Printer 1 is the first production route. Receipt Printer 2 is
 * deliberately not enabled here yet.
 */

const PK_PRINTHUB = Object.freeze({
  ENDPOINT_ID: 'PH-FRONT-RECEIPT-01',
  ENDPOINT_KEY_PROPERTY: 'PRINTHUB_PH_FRONT_RECEIPT_01_KEY',
  ENABLED_PROPERTY: 'PRINTHUB_PH_FRONT_RECEIPT_01_ENABLED',
  CLAIM_LEASE_SECONDS: 60,
  POLL_AFTER_MS: 2500,
  ROUTES: Object.freeze({
    RECEIPT1: Object.freeze({
      routeId: 'RECEIPT1',
      routeLabel: 'Receipt Printer 1',
      endpointId: 'PH-FRONT-RECEIPT-01',
      endpointType: 'CHROMEOS_BROWSER',
      bindingKey: 'RECEIPT1',
      mediaProfileId: '80MM_RECEIPT',
      rendererId: 'PASSKIOSK_RECEIPT'
    })
  })
});

function printHubRouteForPrinterKey_(printerKey) {
  return PK_PRINTHUB.ROUTES[String(printerKey || '').trim()] || null;
}

function printHubFieldsForPrinter_(printerKey, transactionId, attemptType) {
  const route = printHubRouteForPrinterKey_(printerKey);
  if (!route) return {};

  return {
    'Job Group ID': 'JG-' + String(transactionId || '').replace(/^PK-/, ''),
    'Copy Role': String(attemptType || 'ORIGINAL') === 'REPRINT' ? 'REPRINT' : 'PRIMARY',
    'Route ID': route.routeId,
    'Route Label': route.routeLabel,
    'Endpoint ID': route.endpointId,
    'Endpoint Type': route.endpointType,
    'Binding Key': route.bindingKey,
    'Media Profile ID': route.mediaProfileId,
    'Renderer ID': route.rendererId,
    'Claim ID': '',
    'Claimed At': '',
    'Claimed By': '',
    'Lease Expires At': '',
    'Print Invoked At': '',
    'Attempt Number': 1,
    'Parent Job ID': ''
  };
}

function setupPrintHubEndpoint_() {
  assertPrintHubHeaders_();

  const props = PropertiesService.getScriptProperties();
  let key = String(props.getProperty(PK_PRINTHUB.ENDPOINT_KEY_PROPERTY) || '').trim();

  if (!key) {
    key = [
      Utilities.getUuid(),
      Utilities.getUuid(),
      Utilities.getUuid()
    ].join('').replace(/-/g, '');
    props.setProperty(PK_PRINTHUB.ENDPOINT_KEY_PROPERTY, key);
  }

  if (props.getProperty(PK_PRINTHUB.ENABLED_PROPERTY) === null) {
    props.setProperty(PK_PRINTHUB.ENABLED_PROPERTY, 'false');
  }

  const result = {
    ok: true,
    endpointId: PK_PRINTHUB.ENDPOINT_ID,
    enabled: printHubEndpointEnabled_(),
    endpointKey: key,
    message: 'PrintHub endpoint key is ready. Endpoint remains disabled until enablePrintHubEndpoint_() is run.'
  };

  console.log(JSON.stringify(result));
  return result;
}

function rotatePrintHubEndpointKey_() {
  const key = [
    Utilities.getUuid(),
    Utilities.getUuid(),
    Utilities.getUuid()
  ].join('').replace(/-/g, '');

  PropertiesService.getScriptProperties()
    .setProperty(PK_PRINTHUB.ENDPOINT_KEY_PROPERTY, key);

  console.log(JSON.stringify({
    ok: true,
    endpointId: PK_PRINTHUB.ENDPOINT_ID,
    endpointKey: key,
    message: 'Endpoint key rotated. Update managed extension policy before re-enabling production polling.'
  }));

  return key;
}

function enablePrintHubEndpoint_() {
  assertPrintHubHeaders_();
  const props = PropertiesService.getScriptProperties();
  if (!String(props.getProperty(PK_PRINTHUB.ENDPOINT_KEY_PROPERTY) || '').trim()) {
    throw new Error('Run setupPrintHubEndpoint_() before enabling the endpoint.');
  }
  props.setProperty(PK_PRINTHUB.ENABLED_PROPERTY, 'true');
  const result = {ok:true, endpointId:PK_PRINTHUB.ENDPOINT_ID, enabled:true};
  console.log(JSON.stringify(result));
  return result;
}

function disablePrintHubEndpoint_() {
  PropertiesService.getScriptProperties()
    .setProperty(PK_PRINTHUB.ENABLED_PROPERTY, 'false');
  const result = {ok:true, endpointId:PK_PRINTHUB.ENDPOINT_ID, enabled:false};
  console.log(JSON.stringify(result));
  return result;
}

function auditPrintHubEndpoint_() {
  assertPrintHubHeaders_();

  const sheet = passSheet_().getSheetByName(PK.PRINT_JOBS_SHEET);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const h = headerIndex_(headers);
  const rows = data.slice(1);

  const summary = {
    ok: true,
    endpointId: PK_PRINTHUB.ENDPOINT_ID,
    enabled: printHubEndpointEnabled_(),
    legacyQueuedWithoutEndpoint: 0,
    routedQueued: 0,
    routedClaimed: 0,
    routedPrintInvoked: 0,
    routedPrinted: 0,
    routedFailed: 0
  };

  rows.forEach(row => {
    const status = String(row[h['Status']] || '');
    const endpointId = String(row[h['Endpoint ID']] || '');
    if (status === 'QUEUED' && !endpointId) summary.legacyQueuedWithoutEndpoint++;
    if (endpointId !== PK_PRINTHUB.ENDPOINT_ID) return;

    if (status === 'QUEUED') summary.routedQueued++;
    if (status === 'CLAIMED') summary.routedClaimed++;
    if (status === 'PRINT_INVOKED') summary.routedPrintInvoked++;
    if (status === 'PRINTED') summary.routedPrinted++;
    if (status === 'FAILED') summary.routedFailed++;
  });

  console.log(JSON.stringify(summary));
  return summary;
}

function printHubEndpointPing_(body) {
  const endpoint = requirePrintHubEndpoint_(body);
  return {
    ok: true,
    endpointId: endpoint.endpointId,
    enabled: printHubEndpointEnabled_(),
    pollAfterMs: PK_PRINTHUB.POLL_AFTER_MS
  };
}

function printHubEndpointPoll_(body) {
  const endpoint = requirePrintHubEndpoint_(body);
  if (!printHubEndpointEnabled_()) {
    throw new Error('PrintHub endpoint is disabled.');
  }

  assertPrintHubHeaders_();

  const maxJobs = Math.min(Math.max(Number(body && body.maxJobs || 1), 1), 5);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const sheet = passSheet_().getSheetByName(PK.PRINT_JOBS_SHEET);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const h = headerIndex_(headers);
    const now = new Date();

    recoverExpiredPrintHubClaims_(sheet, headers, data, endpoint.endpointId, now);

    const refreshed = sheet.getDataRange().getValues();
    const jobs = [];

    for (let r = 1; r < refreshed.length && jobs.length < maxJobs; r++) {
      const row = refreshed[r];
      if (String(row[h['Status']] || '') !== 'QUEUED') continue;
      if (String(row[h['Endpoint ID']] || '') !== endpoint.endpointId) continue;

      const routeId = String(row[h['Route ID']] || '');
      const bindingKey = String(row[h['Binding Key']] || '');
      const mediaProfileId = String(row[h['Media Profile ID']] || '');
      const rendererId = String(row[h['Renderer ID']] || '');
      if (!routeId || !bindingKey || !mediaProfileId || !rendererId) continue;

      const claimId = 'CLM-' + randomId_(16);
      const leaseExpires = new Date(now.getTime() + PK_PRINTHUB.CLAIM_LEASE_SECONDS * 1000);

      setCellByHeader_(sheet, headers, r + 1, 'Status', 'CLAIMED');
      setCellByHeader_(sheet, headers, r + 1, 'Claim ID', claimId);
      setCellByHeader_(sheet, headers, r + 1, 'Claimed At', now);
      setCellByHeader_(sheet, headers, r + 1, 'Claimed By', endpoint.endpointId);
      setCellByHeader_(sheet, headers, r + 1, 'Lease Expires At', leaseExpires);

      const transactionId = String(row[h['Transaction ID']] || '');
      const tx = findRecordByField_(PK.TRANSACTIONS_SHEET, 'Transaction ID', transactionId);
      if (!tx) {
        setCellByHeader_(sheet, headers, r + 1, 'Status', 'FAILED');
        setCellByHeader_(sheet, headers, r + 1, 'Completed At', now);
        setCellByHeader_(sheet, headers, r + 1, 'Error Code', 'TRANSACTION_NOT_FOUND');
        setCellByHeader_(sheet, headers, r + 1, 'Error Message', 'Source transaction could not be found.');
        continue;
      }

      jobs.push({
        schemaVersion: 1,
        printJobId: String(row[h['Print Job ID']] || ''),
        sourceTransactionId: transactionId,
        jobGroupId: String(row[h['Job Group ID']] || ''),
        copyRole: String(row[h['Copy Role']] || 'PRIMARY'),
        routeId,
        routeLabel: String(row[h['Route Label']] || ''),
        endpointId: endpoint.endpointId,
        endpointType: String(row[h['Endpoint Type']] || 'CHROMEOS_BROWSER'),
        bindingKey,
        mediaProfileId,
        rendererId,
        claim: {
          claimId,
          claimedAt: now.toISOString(),
          leaseExpiresAt: leaseExpires.toISOString()
        },
        transaction: serializeRecord_(tx)
      });
    }

    return {
      ok: true,
      endpointId: endpoint.endpointId,
      pollAfterMs: PK_PRINTHUB.POLL_AFTER_MS,
      jobs
    };
  } finally {
    lock.releaseLock();
  }
}

function printHubEndpointComplete_(body) {
  const endpoint = requirePrintHubEndpoint_(body);

  // Completion remains available even when new polling is disabled so an
  // already-submitted ChromeOS job can still close cleanly.
  assertPrintHubHeaders_();

  const printJobId = String(body && body.printJobId || '').trim();
  const claimId = String(body && body.claimId || '').trim();
  const requestedStatus = String(body && body.status || '').trim().toUpperCase();

  if (!printJobId || !claimId) throw new Error('printJobId and claimId are required.');
  if (!['PRINT_INVOKED','PRINTED','FAILED'].includes(requestedStatus)) {
    throw new Error('Unsupported PrintHub completion status.');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const sheet = passSheet_().getSheetByName(PK.PRINT_JOBS_SHEET);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const h = headerIndex_(headers);

    let rowNum = 0;
    let row = null;
    for (let r = 1; r < data.length; r++) {
      if (String(data[r][h['Print Job ID']] || '') !== printJobId) continue;
      rowNum = r + 1;
      row = data[r];
      break;
    }
    if (!row) throw new Error('Print job not found.');

    if (String(row[h['Endpoint ID']] || '') !== endpoint.endpointId) {
      throw new Error('Endpoint does not own this print job.');
    }
    if (String(row[h['Claim ID']] || '') !== claimId) {
      throw new Error('Claim does not match this print job.');
    }

    const current = String(row[h['Status']] || '').toUpperCase();
    if (current === requestedStatus) return {ok:true, idempotent:true, status:current};
    if (current === 'PRINTED' || current === 'FAILED') {
      throw new Error('Print job is already terminal: ' + current);
    }

    const now = new Date();
    const rendererVersion = String(body && body.rendererVersion || '').trim();

    if (requestedStatus === 'PRINT_INVOKED') {
      if (current !== 'CLAIMED') throw new Error('PRINT_INVOKED requires CLAIMED status.');
      setCellByHeader_(sheet, headers, rowNum, 'Status', 'PRINT_INVOKED');
      setCellByHeader_(sheet, headers, rowNum, 'Print Invoked At', now);
      if (rendererVersion) setCellByHeader_(sheet, headers, rowNum, 'Renderer Version', rendererVersion);
      return {ok:true, status:'PRINT_INVOKED'};
    }

    if (!['CLAIMED','PRINT_INVOKED'].includes(current)) {
      throw new Error(requestedStatus + ' is not valid from ' + current + '.');
    }

    setCellByHeader_(sheet, headers, rowNum, 'Status', requestedStatus);
    setCellByHeader_(sheet, headers, rowNum, 'Completed At', now);
    if (rendererVersion) setCellByHeader_(sheet, headers, rowNum, 'Renderer Version', rendererVersion);

    if (requestedStatus === 'FAILED') {
      setCellByHeader_(sheet, headers, rowNum, 'Error Code', String(body && body.errorCode || 'PRINT_FAILED'));
      setCellByHeader_(sheet, headers, rowNum, 'Error Message', String(body && body.errorMessage || 'PrintHub reported a failure.'));
      updateTransactionPrintStatus_(String(row[h['Transaction ID']] || ''), 'FAILED');
    } else {
      setCellByHeader_(sheet, headers, rowNum, 'Error Code', '');
      setCellByHeader_(sheet, headers, rowNum, 'Error Message', '');
      updateTransactionPrintStatus_(String(row[h['Transaction ID']] || ''), 'PRINTED');
    }

    return {ok:true, status:requestedStatus};
  } finally {
    lock.releaseLock();
  }
}

function recoverExpiredPrintHubClaims_(sheet, headers, data, endpointId, now) {
  const h = headerIndex_(headers);

  for (let r = 1; r < data.length; r++) {
    const row = data[r];
    if (String(row[h['Status']] || '') !== 'CLAIMED') continue;
    if (String(row[h['Endpoint ID']] || '') !== endpointId) continue;
    if (row[h['Print Invoked At']]) continue;

    const expires = row[h['Lease Expires At']];
    if (!(expires instanceof Date) || expires.getTime() > now.getTime()) continue;

    setCellByHeader_(sheet, headers, r + 1, 'Status', 'QUEUED');
    setCellByHeader_(sheet, headers, r + 1, 'Claim ID', '');
    setCellByHeader_(sheet, headers, r + 1, 'Claimed At', '');
    setCellByHeader_(sheet, headers, r + 1, 'Claimed By', '');
    setCellByHeader_(sheet, headers, r + 1, 'Lease Expires At', '');
  }
}

function requirePrintHubEndpoint_(body) {
  const endpointId = String(body && body.endpointId || '').trim();
  const providedKey = String(body && body.endpointKey || '').trim();

  if (endpointId !== PK_PRINTHUB.ENDPOINT_ID) {
    throw new Error('Unknown PrintHub endpoint.');
  }

  const expected = String(
    PropertiesService.getScriptProperties().getProperty(PK_PRINTHUB.ENDPOINT_KEY_PROPERTY) || ''
  ).trim();

  if (!expected) throw new Error('PrintHub endpoint key is not configured.');
  if (!providedKey || providedKey !== expected) {
    throw new Error('PrintHub endpoint authorization failed.');
  }

  return {endpointId};
}

function printHubEndpointEnabled_() {
  return String(
    PropertiesService.getScriptProperties().getProperty(PK_PRINTHUB.ENABLED_PROPERTY) || ''
  ).toLowerCase() === 'true';
}

function assertPrintHubHeaders_() {
  const sheet = passSheet_().getSheetByName(PK.PRINT_JOBS_SHEET);
  if (!sheet) throw new Error('Print_Jobs sheet not found.');

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const required = [
    'Print Job ID','Transaction ID','Completed At','Status','Error Code','Error Message',
    'Renderer Version','Job Group ID','Copy Role','Route ID','Route Label','Endpoint ID',
    'Endpoint Type','Binding Key','Media Profile ID','Renderer ID','Claim ID','Claimed At',
    'Claimed By','Lease Expires At','Print Invoked At','Attempt Number','Parent Job ID'
  ];

  const missing = required.filter(header => headers.indexOf(header) === -1);
  if (missing.length) {
    throw new Error('Print_Jobs is missing required PrintHub header(s): ' + missing.join(', '));
  }
}
