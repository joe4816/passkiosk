/**
 * Temporary, authenticated PDF email output. No Print_Jobs are created.
 * Install with current SecureRpc.gs. Enable only after testPdfEmailRendering_().
 * The durable ledger reserves each client request before recording; retries
 * reuse the original result and never submit a transaction a second time.
 */
const PK_EMAIL = Object.freeze({
  SHEET: 'Email_Deliveries', MAX_STUDENTS: 100, MAX_BYTES: 20 * 1024 * 1024,
  HEADERS: ['Delivery ID', 'Created At', 'Updated At', 'Session Username', 'Device ID',
    'Recipient', 'Request Hash', 'Status', 'Result JSON', 'Message']
});

function pdfEmailEnabled_() {
  return PropertiesService.getScriptProperties().getProperty('PASSKIOSK_PDF_EMAIL_ENABLED') === 'true';
}

function pdfEmailFrontConfig_() {
  return {enabled: pdfEmailEnabled_(), maxStudents: PK_EMAIL.MAX_STUDENTS, format: 'LETTER'};
}

function bindPdfEmailIdentity_(result, mode, email) {
  const session = requireSession_(result.token);
  session.emailAuthMode = mode;
  session.emailAuthenticatedAddress = mode === 'STAFF' ? String(email || '').toLowerCase() : '';
  putSession_(session);
  return result;
}

function pdfEmailRecipient_(session) {
  const adult = getActiveAdultByUsername_(session.username);
  if (!adult) throw new Error('Session user is no longer active in PassKiosk.');
  let email;
  if (session.emailAuthMode === 'STAFF') {
    email = requireCcsdStaffEmail_();
    if (email !== session.emailAuthenticatedAddress || normalizeUsername_(email) !== session.username) {
      throw new Error('PDF delivery must use the signed-in session owner.');
    }
  } else if (session.emailAuthMode === 'KIOSK') {
    // The effective script owner is NOT the human at a managed kiosk.
    email = String(adult.email || '').trim().toLowerCase();
    if (normalizeUsername_(email) !== session.username) {
      throw new Error('The kiosk operator needs a matching CCSD email in Helper Adults.');
    }
  } else {
    throw new Error('Sign out and sign in again to enable verified email delivery.');
  }
  if (!/^[^\s@,;<>]+@nv\.ccsd\.net$/.test(email)) throw new Error('A verified CCSD email is required.');
  return email;
}

function getPdfEmailConfig_(token) {
  const session = requireSession_(token);
  const config = pdfEmailFrontConfig_();
  if (config.enabled) {
    try { config.recipient = pdfEmailRecipient_(session); }
    catch (err) { config.enabled = false; config.message = String(err.message || err); }
  }
  return config;
}

function startEmailSession_(username, deviceId, mode, email) {
  if (!pdfEmailEnabled_()) throw new Error('PDF email is not enabled on this backend.');
  const adult = getActiveAdultByUsername_(username);
  if (!adult) throw new Error('User is not active in PassKiosk.');
  if (!String(deviceId || '').trim()) throw new Error('Device ID is required.');
  const token = Utilities.getUuid();
  const session = {token: token, username: adult.username, displayName: adult.displayName,
    defaultLocation: adult.defaultLocation, sig: adult.sig, printerKey: '',
    deviceId: String(deviceId).trim(), createdAt: new Date().toISOString(),
    emailAuthMode: mode, emailAuthenticatedAddress: mode === 'STAFF' ? String(email).toLowerCase() : ''};
  const recipient = pdfEmailRecipient_(session);
  putSession_(session);
  return {ok: true, token: token, adult: publicAdult_(adult), outputMode: 'EMAIL',
    printer: {key: 'EMAIL_PDF', friendlyName: 'PDF email', outputFormat: 'LETTER'},
    pdfEmail: {enabled: true, recipient: recipient, maxStudents: PK_EMAIL.MAX_STUDENTS, format: 'LETTER'}};
}

function assertPdfEmailReady_(session, request) {
  if (!pdfEmailEnabled_()) throw new Error('PDF email is not enabled on this backend.');
  if (!request || typeof request !== 'object') throw new Error('Missing submission.');
  if (String(request.deviceId || '') !== session.deviceId) throw new Error('Device mismatch.');
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(String(request.emailRequestId || ''))) throw new Error('A delivery request ID is required.');
  const ids = Array.isArray(request.studentIds) ? request.studentIds : [request.studentId];
  if (!ids.length || ids.length > PK_EMAIL.MAX_STUDENTS) {
    throw new Error('Email supports 1–' + PK_EMAIL.MAX_STUDENTS + ' students per submission.');
  }
  if (!['PASS', 'RQST', 'DET', 'LUNCH_DET', 'BUS'].includes(String(request.workflow || ''))) {
    throw new Error('Unknown workflow.');
  }
  if (request.workflow === 'BUS' && typeof submitBusWorkflow_ !== 'function') {
    throw new Error('Install and verify Activity Bus before emailing bus passes.');
  }
  return pdfEmailRecipient_(session);
}

function emailSheet_() {
  const sheet = passSheet_().getSheetByName(PK_EMAIL.SHEET);
  if (!sheet) throw new Error('Run setupPdfEmail_() before enabling PDF email.');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  PK_EMAIL.HEADERS.forEach(function(h) { if (!headers.includes(h)) throw new Error('Email_Deliveries is missing: ' + h); });
  return sheet;
}

function findEmailDelivery_(id) {
  const sheet = emailSheet_();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  if (sheet.getLastRow() < 2) return null;
  const matches = sheet.getRange(2, headers.indexOf('Delivery ID') + 1, sheet.getLastRow() - 1, 1)
    .createTextFinder(String(id)).matchEntireCell(true).findAll();
  if (!matches.length) return null;
  const row = matches[0].getRow();
  return {sheet: sheet, headers: headers, row: row,
    record: rowObject_(headers, sheet.getRange(row, 1, 1, headers.length).getValues()[0])};
}

function updateEmailDelivery_(entry, values) {
  values['Updated At'] = new Date();
  Object.keys(values).forEach(function(k) {
    setCellByHeader_(entry.sheet, entry.headers, entry.row, k, values[k]);
    entry.record[k] = values[k];
  });
  SpreadsheetApp.flush();
}

function emailOwnerCheck_(entry, session) {
  if (!entry || entry.record['Session Username'] !== session.username ||
      entry.record['Device ID'] !== session.deviceId || entry.record.Recipient !== pdfEmailRecipient_(session)) {
    throw new Error('Email delivery does not belong to this session user and device.');
  }
}

function emailPublicStatus_(entry) {
  return {deliveryId: entry.record['Delivery ID'], status: entry.record.Status,
    recipient: entry.record.Recipient, message: entry.record.Message || '',
    createdAt: entry.record['Created At'] instanceof Date ? entry.record['Created At'].toISOString() : '',
    canRetry: ['READY', 'FAILED'].includes(entry.record.Status)};
}

function emailResult_(entry) {
  const result = entry.record['Result JSON'] ? JSON.parse(entry.record['Result JSON']) : {ok: false,
    code: 'EMAIL_RECORDING_UNCONFIRMED', message: 'Recording is not confirmed. Check Transactions before submitting again.'};
  result.emailDelivery = emailPublicStatus_(entry);
  return result;
}

function submitEmailWorkflow_(token, request) {
  const session = requireSession_(token);
  const recipient = assertPdfEmailReady_(session, request);
  const deliveryId = 'PE-' + request.emailRequestId;
  const payload = Object.assign({}, request);
  delete payload.emailRequestId;
  const fingerprint = hashText_(JSON.stringify(payload));
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  let existing;
  try {
    existing = findEmailDelivery_(deliveryId);
    if (existing) {
      emailOwnerCheck_(existing, session);
      if (existing.record['Request Hash'] !== fingerprint) throw new Error('Delivery request ID was reused for different settings.');
    } else {
      emailSheet_();
      const now = new Date();
      appendMappedRows_(PK_EMAIL.SHEET, [{
        'Delivery ID': deliveryId, 'Created At': now, 'Updated At': now,
        'Session Username': session.username, 'Device ID': session.deviceId,
        'Recipient': recipient, 'Request Hash': fingerprint, 'Status': 'RECORDING',
        'Result JSON': '', 'Message': 'Recording the original submission.'
      }]);
      SpreadsheetApp.flush();
    }
  } finally { lock.releaseLock(); }
  // Even a timed-out original call will not be submitted again with this ID.
  if (existing) return emailResult_(existing);
  let result;
  try {
    result = request.workflow === 'BUS' ? submitBusWorkflow_(token, request) : recordEmailWorkflow_(session, request);
    const json = JSON.stringify(result);
    if (json.length > 45000) throw new Error('Submission result exceeds the delivery ledger limit.');
    const entry = findEmailDelivery_(deliveryId);
    const recorded = result.ok === true && (result.transactionId || Number(result.createdCount) > 0 || Number(result.errorCount) > 0);
    updateEmailDelivery_(entry, {'Result JSON': json, 'Status': recorded ? 'READY' : 'NOT_CREATED',
      'Message': recorded ? 'Transactions recorded; preparing PDF.' : (result.message || 'No authorization was recorded.')});
    if (recorded) deliverRecordedPdf_(token, deliveryId, false);
  } catch (err) {
    const entry = findEmailDelivery_(deliveryId);
    if (entry && entry.record.Status === 'RECORDING') {
      updateEmailDelivery_(entry, {'Status': 'RECORDING_UNCONFIRMED',
        'Message': 'Check Transactions before submitting again. ' + String(err.message || err)});
    }
    // A delivery failure must not be reported as a failed transaction write.
    if (!result) throw err;
  }
  return emailResult_(findEmailDelivery_(deliveryId));
}

/** Same production builders and detention state; deliberately no print queue. */
function recordEmailWorkflow_(session, request) {
  const cfg = readHelperConfig_();
  const ids = Array.from(new Set((request.studentIds || []).map(normalizeStudentId_).filter(Boolean)));
  if (!ids.length) throw new Error('Choose at least one student.');
  const workflow = String(request.workflow);
  const bulk = request.bulk === true || ids.length > 1;
  const root = 'PK-' + randomId_(8);
  const students = getStudentMap_();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const now = new Date(), txs = [], errorRows = [], created = [], errors = [];
    const detentionState = ['DET', 'LUNCH_DET'].includes(workflow) ? getDetentionState_(workflow) : null;
    ids.forEach(function(id, index) {
      const tid = bulk ? root + '-' + String(index + 1).padStart(2, '0') : root;
      const student = students[id];
      try {
        if (!student) throw processingError_('STUDENT_NOT_FOUND', 'Student could not be found.', 'STUDENT_LOOKUP');
        const tx = buildTransaction_(tid, now, session, workflow, student, request.data || {}, cfg, detentionState, bulk);
        txs.push(tx);
        if (detentionState && tx['Detention Date']) {
          const key = valueToDateKey_(tx['Detention Date']);
          detentionState.counts[key] = Number(detentionState.counts[key] || 0) + 1;
          detentionState.studentDates[id + '|' + key] = true;
        }
        created.push({transactionId: tid, studentId: id, studentName: [student.firstName, student.lastName].join(' ')});
      } catch (err) {
        const p = err && err.pkProcessing ? err : processingError_('PROCESSING_FAILED', String(err.message || err));
        const row = makeProcessingErrorRow_(tid + '-ERR', now, session, workflow, student || {studentId: id},
          p.stage || 'PROCESSING', p.code, p.message, request);
        errorRows.push(row);
        errors.push({transactionId: tid + '-ERR', studentId: id, studentName: row['Student Name'], message: p.message});
      }
    });
    if (txs.length) appendMappedRows_(PK.TRANSACTIONS_SHEET, txs);
    if (errorRows.length) appendMappedRows_(PK.ERRORS_SHEET, errorRows);
    return {ok: true, bulk: bulk, batchRoot: bulk ? root : '', createdCount: created.length,
      errorCount: errors.length, created: created, errors: errors, printingQueued: false};
  } finally { lock.releaseLock(); }
}

function deliverRecordedPdf_(token, id, retry) {
  const session = requireSession_(token);
  if (!pdfEmailEnabled_()) throw new Error('PDF email is not enabled.');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  let entry;
  try {
    entry = findEmailDelivery_(id);
    emailOwnerCheck_(entry, session);
    if (entry.record.Status !== 'READY' && !(retry && entry.record.Status === 'FAILED')) return emailPublicStatus_(entry);
    updateEmailDelivery_(entry, {'Status': 'PREPARING', 'Message': 'Creating the PDF from recorded transactions.'});
  } finally { lock.releaseLock(); }
  let mailInvoked = false;
  try {
    const result = JSON.parse(entry.record['Result JSON']);
    const ids = result.transactionId ? [result.transactionId] : (result.created || []).map(function(r) { return r.transactionId; });
    const byId = {};
    readSheetRecords_(PK.TRANSACTIONS_SHEET).forEach(function(tx) { byId[String(tx['Transaction ID'])] = tx; });
    const txs = ids.map(function(tid) {
      const tx = byId[tid];
      if (!tx || tx['Session Username'] !== session.username || tx['Device ID'] !== session.deviceId || tx.Status === 'VOID') {
        throw new Error('A recorded transaction is missing, void, or belongs to another session.');
      }
      return tx;
    });
    if (MailApp.getRemainingDailyQuota() < 1) throw new Error('Email quota is exhausted. Transactions remain recorded. Retry delivery later.');
    const cfg = readHelperConfig_();
    const pdf = buildPdfEmailAttachment_(txs, result.errors || [], cfg, id);
    if (pdf.getBytes().length > PK_EMAIL.MAX_BYTES) throw new Error('PDF exceeds the email attachment limit. Contact the administrator; do not resubmit students.');
    // Persist before invoking mail; never automatically re-send an uncertain call.
    updateEmailDelivery_(entry, {'Status': 'SENDING', 'Message': 'Email submission is in progress.'});
    mailInvoked = true;
    MailApp.sendEmail({to: entry.record.Recipient, name: 'PassKiosk',
      subject: 'PassKiosk PDF — ' + (txs.length === 1 ? pdfWorkflowTitle_(txs[0].Workflow) : txs.length + ' documents') + ' — ' + id,
      body: 'Your PassKiosk PDF is attached.\n\nRecorded documents: ' + txs.length +
        '\nItems requiring attention: ' + (result.errors || []).length +
        '\nDelivery ID: ' + id + '\n\nProcessing errors are listed in the PDF. Email output does not queue a physical print job.',
      attachments: [pdf]});
    updateEmailDelivery_(entry, {'Status': 'SENT', 'Message': 'Submitted to Google Mail for delivery. Check your inbox.'});
  } catch (err) {
    updateEmailDelivery_(entry, {'Status': mailInvoked ? 'SEND_UNCONFIRMED' : 'FAILED',
      'Message': (mailInvoked ? 'Email delivery is not confirmed. Check your inbox before any resend. ' : '') + String(err.message || err)});
  }
  return emailPublicStatus_(entry);
}

function retryPdfEmail_(token, deviceId, id) {
  const session = requireSession_(token);
  if (String(deviceId) !== session.deviceId) throw new Error('Device mismatch.');
  return deliverRecordedPdf_(token, String(id), true);
}

function getRecentPdfEmails_(token, deviceId) {
  const session = requireSession_(token);
  if (String(deviceId) !== session.deviceId) throw new Error('Device mismatch.');
  const recipient = pdfEmailRecipient_(session);
  emailSheet_();
  return readSheetRecords_(PK_EMAIL.SHEET).filter(function(r) {
    return r['Session Username'] === session.username && r['Device ID'] === session.deviceId && r.Recipient === recipient &&
      r['Created At'] instanceof Date && Date.now() - r['Created At'].getTime() < 60 * 60 * 1000;
  }).slice(-20).reverse().map(function(r) { return emailPublicStatus_({record: r}); });
}

function pdfWorkflowTitle_(workflow) {
  return {PASS: 'Student Pass', RQST: 'Call Pass', DET: 'After-School Detention',
    LUNCH_DET: 'Lunch Detention', BUS: 'Activity Bus Pass'}[workflow] || 'PassKiosk Document';
}

function pdfEmailFields_(tx, cfg) {
  const tz = cfg.sources.timeZone || PK.TIME_ZONE_FALLBACK;
  const fields = [];
  function add(label, value) { if (value !== '' && value !== undefined && value !== null) fields.push([label, String(value)]); }
  add('Student', tx['Student Name']); add('Student number', tx['Student ID']); add('Grade', tx.Grade);
  if (tx.Workflow === 'PASS') {
    add('From', tx.From); add('To', tx.To);
    add('Excused', tx.Excused === true ? '☑' : '☐');
  } else if (tx.Workflow === 'RQST') {
    add('Deliver to', [tx['Delivery Period'], tx['Delivery Room'] ? 'Rm ' + tx['Delivery Room'] : '', tx['Delivery Teacher']].filter(Boolean).join(' · '));
    add('Send student to', tx.Destination);
    add('When', tx.When === 'At:' ? 'At ' + pdfClockTime_(tx['At Time']) : tx.When);
    add('Requested by', tx['Requested By']);
  } else if (tx.Workflow === 'DET' || tx.Workflow === 'LUNCH_DET') {
    add('Detention date', tx['Detention Date'] instanceof Date ? Utilities.formatDate(tx['Detention Date'], tz, 'MMMM d, yyyy') : tx['Detention Date']);
    add('Report to', tx['Report To']); add('Issued by', tx['Issued By']);
    add('Important', tx['Directions Snapshot']);
  } else if (tx.Workflow === 'BUS') {
    add('Approved by', tx['Approved By']); add('Assignments', tx['Bus Assignment Count']);
    add('Bus route / run', tx['Bus Route(s)']); add('Drop-off / time / days', tx['Bus Drop-off(s)']);
    add('Transportation snapshot', tx['Bus Snapshot']); add('Scan type', tx['Bus Scan Type']);
    add('Duplicate of', tx['Duplicate Of Transaction ID']);
  }
  add('Reason', tx['Reason(s)']); add('Notes', tx.Notes);
  add('Recorded by', tx['Session User']);
  add('Created', tx['Created At'] instanceof Date ? Utilities.formatDate(tx['Created At'], tz, 'MMMM d, yyyy h:mm a') : tx['Created At']);
  add('Transaction', tx['Transaction ID']);
  return fields;
}

function pdfClockTime_(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return String(value || '');
  const h = Number(match[1]);
  return (h % 12 || 12) + ':' + match[2] + (h >= 12 ? ' PM' : ' AM');
}

function buildPdfEmailAttachment_(txs, errors, cfg, deliveryId) {
  const doc = DocumentApp.create('PassKiosk temporary PDF ' + deliveryId);
  const docId = doc.getId();
  try {
    const body = doc.getBody();
    body.setPageWidth(612).setPageHeight(792).setMarginTop(36).setMarginBottom(36).setMarginLeft(42).setMarginRight(42);
    let pageStarted = false;
    function page(title) {
      if (pageStarted) body.appendPageBreak();
      pageStarted = true;
      body.appendParagraph(cfg.sources.schoolName || 'PassKiosk').editAsText().setFontSize(11).setForegroundColor('#5d2da1');
      body.appendParagraph(title).setHeading(DocumentApp.ParagraphHeading.HEADING1).editAsText().setForegroundColor('#5d2da1');
    }
    const signatures = {};
    txs.forEach(function(tx) {
      page(pdfWorkflowTitle_(tx.Workflow));
      pdfEmailFields_(tx, cfg).forEach(function(field) {
        const p = body.appendParagraph(field[0] + ': ' + field[1]);
        p.setSpacingAfter(6);
        p.editAsText().setFontSize(11);
        p.editAsText().setBold(0, field[0].length, true);
      });
      if (tx['Signature File']) {
        const filename = String(tx['Signature File']);
        if (!Object.prototype.hasOwnProperty.call(signatures, filename)) signatures[filename] = signaturePayload_(filename, cfg);
        const signature = signatures[filename];
        if (signature && /^image\/(png|jpeg)$/.test(signature.mimeType)) {
          const blob = Utilities.newBlob(Utilities.base64Decode(signature.base64), signature.mimeType, filename);
          const image = body.appendParagraph('').appendInlineImage(blob);
          const width = image.getWidth(), height = image.getHeight();
          const scale = Math.min(1, 180 / width, 60 / height);
          image.setWidth(Math.max(1, Math.round(width * scale))).setHeight(Math.max(1, Math.round(height * scale)));
        } else {
          body.appendParagraph('Signature image unavailable; adult attribution is recorded above.').editAsText().setFontSize(9);
        }
      }
    });
    if (errors.length) {
      page('Items Requiring Attention — Not Recorded');
      body.appendParagraph('The following items were not authorized. Do not treat this error list as a pass.').editAsText().setFontSize(11);
      errors.forEach(function(e) {
        body.appendParagraph([e.studentName, e.studentId].filter(Boolean).join(' · ')).editAsText().setBold(true).setFontSize(11);
        body.appendParagraph(String(e.message || 'Not recorded.')).editAsText().setFontSize(11);
      });
    }
    if (!pageStarted) throw new Error('There are no documents or processing errors to email.');
    doc.saveAndClose();
    return DriveApp.getFileById(docId).getAs('application/pdf').setName('PassKiosk-' + deliveryId + '.pdf');
  } finally {
    // Never share the temporary source document; retain only the emailed PDF.
    try { doc.saveAndClose(); } catch (_) { }
    DriveApp.getFileById(docId).setTrashed(true);
  }
}

function setupPdfEmail_() {
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const ss = passSheet_();
    let sheet = ss.getSheetByName(PK_EMAIL.SHEET);
    if (!sheet) {
      sheet = ss.insertSheet(PK_EMAIL.SHEET);
      sheet.getRange(1, 1, 1, PK_EMAIL.HEADERS.length).setValues([PK_EMAIL.HEADERS]);
      sheet.setFrozenRows(1);
    }
    emailSheet_();
    Logger.log('PDF email ledger is ready. Email remains disabled until explicitly enabled.');
  } finally { lock.releaseLock(); }
}

/** Non-mailing render/authorization smoke test, with synthetic data only. */
function testPdfEmailRendering_() {
  requireActiveCcsdAdult_();
  const cfg = readHelperConfig_();
  const tx = {'Transaction ID': 'SYNTHETIC-NOT-RECORDED', Workflow: 'RQST',
    'Student Name': 'Sample Student', 'Student ID': '000000', Grade: '7',
    'Delivery Period': 'P3', 'Delivery Room': '123', 'Delivery Teacher': 'Sample Teacher',
    Destination: 'Main Office', When: 'At:', 'At Time': '13:45', 'Requested By': 'Sample Adult',
    'Session User': 'Sample Operator', 'Created At': new Date(), 'Reason(s)': 'Sample reason'};
  const pdf = buildPdfEmailAttachment_([tx], [], cfg, 'SYNTHETIC');
  Logger.log(JSON.stringify({ok: pdf.getContentType() === 'application/pdf', bytes: pdf.getBytes().length,
    quotaRemaining: MailApp.getRemainingDailyQuota(), emailSent: false}));
}

function enablePdfEmail_() {
  requireActiveCcsdAdult_();
  emailSheet_();
  PropertiesService.getScriptProperties().setProperty('PASSKIOSK_PDF_EMAIL_ENABLED', 'true');
  Logger.log('PDF email is enabled. Update the secure deployment to expose it.');
}
