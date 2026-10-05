/**
 * PassKiosk Activity Bus integration.
 *
 * Add this file to the bound Apps Script project alongside Code.gs and
 * SecureRpc.gs. It intentionally does NOT create a Print_Jobs row. The Activity
 * Bus transaction can be recorded and audited while physical printing remains
 * a separate integration step.
 *
 * Source contract:
 *   Helper -> Student Spreadsheet ID
 *   Helper -> Bus Sheet (default: Bus_Info)
 *
 * Bus_Info is keyed by StudentId and may contain more than one row per student.
 * Only complete "Bus From" assignments are used for the Activity Bus workflow.
 */

function getBusInfoForSession_(token, studentId) {
  requireSession_(token);

  const id = normalizeStudentId_(studentId);
  if (!id) throw new Error('Student ID is required.');

  const student = getStudentMap_()[id];
  if (!student) throw new Error('Student could not be found in the current student source.');

  const cfg = readHelperConfig_();
  const lookup = readBusAssignments_(id, cfg);
  const prior = findTodayBusTransaction_(id, cfg);

  return {
    ok: true,
    wired: true,
    studentId: id,
    sped: lookup.sped,
    assignments: lookup.assignments,
    assignmentCount: lookup.assignments.length,
    sourceAssignmentCount: lookup.sourceAssignmentCount,
    alreadyScannedToday: Boolean(prior),
    priorTransactionId: prior ? String(prior['Transaction ID'] || '') : '',
    priorCreatedAt: prior ? prior['Created At'] : ''
  };
}

function submitBusWorkflow_(token, request) {
  const session = requireSession_(token);
  const cfg = readHelperConfig_();

  if (!request || typeof request !== 'object') throw new Error('Missing Activity Bus submission.');
  if (String(request.deviceId || '') !== String(session.deviceId || '')) {
    throw new Error('Device mismatch.');
  }

  const studentId = normalizeStudentId_(request.studentId);
  if (!studentId) throw new Error('Choose a student.');

  const student = getStudentMap_()[studentId];
  if (!student) throw new Error('Student could not be found in the current student source.');

  const approved = getActiveAdultByUsername_(request.approvedByUsername);
  if (!approved) throw new Error('Approved By is not an active adult.');

  const allowDuplicate = request.allowDuplicate === true;
  const now = new Date();

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    // Re-read inside the lock so two kiosks cannot both treat the same student's
    // first scan as unique.
    const lookup = readBusAssignments_(studentId, cfg);
    if (!lookup.assignments.length) {
      return {
        ok: false,
        code: 'NO_BUS_INFO',
        message: 'No usable Bus From assignment is on file for this student.',
        studentId: studentId,
        assignments: []
      };
    }

    const prior = findTodayBusTransaction_(studentId, cfg);
    if (prior && !allowDuplicate) {
      return {
        ok: false,
        code: 'ALREADY_SCANNED_TODAY',
        duplicate: true,
        requiresOverride: true,
        priorTransactionId: String(prior['Transaction ID'] || ''),
        assignments: lookup.assignments
      };
    }

    const transactionId = 'PK-' + randomId_(8);
    const name = [student.firstName, student.lastName].filter(Boolean).join(' ');

    const routeLines = lookup.assignments.map(function(a) {
      return [a.route, a.run].filter(Boolean).join(' · ');
    });

    const dropoffLines = lookup.assignments.map(function(a) {
      const stop = [a.dropoffAddress, a.dropoffTime].filter(Boolean).join(' · ');
      return a.days ? stop + ' · ' + a.days : stop;
    });

    const tx = {
      'Transaction ID': transactionId,
      'Created At': now,
      'Status': 'CREATED',
      'Device ID': session.deviceId,
      'Workflow': PK.WORKFLOWS.BUS,
      'Student ID': student.studentId,
      'Student Name': name,
      'Grade': student.grade,
      'Session Username': session.username,
      'Session User': session.displayName,
      'Requested By Username': '',
      'Requested By': '',
      'Issued By Username': '',
      'Issued By': '',
      'Approved By Username': approved.username,
      'Approved By': approved.displayName,
      'Signature File': approved.sig || '',
      'From': '',
      'To': '',
      'Reason(s)': '',
      'Other Reason': '',
      'Delivery Mode': '',
      'Delivery Period': '',
      'Delivery Room': '',
      'Delivery Teacher': '',
      'When': '',
      'At Time': '',
      'Destination': '',
      'Detention Date': '',
      'Report To': '',
      'Directions Snapshot': '',
      'Bus Route(s)': routeLines.join('\n'),
      'Bus Drop-off(s)': dropoffLines.join('\n'),
      'Schema Version': PK.SCHEMA_VERSION,
      'Notes': prior ? 'DUPLICATE OF ' + String(prior['Transaction ID'] || '') : '',
      'Voided At': '',
      'Voided By Username': '',
      'Voided By': ''
    };

    appendMappedRows_(PK.TRANSACTIONS_SHEET, [tx]);

    return {
      ok: true,
      transactionId: transactionId,
      duplicate: Boolean(prior),
      duplicateOfTransactionId: prior ? String(prior['Transaction ID'] || '') : '',
      studentId: studentId,
      studentName: name,
      sped: lookup.sped,
      assignments: lookup.assignments,
      printingQueued: false
    };
  } finally {
    lock.releaseLock();
  }
}

function readBusAssignments_(studentId, cfg) {
  const sourceId = String(cfg.sources.studentSpreadsheetId || '').trim();
  const sheetName = String(cfg.sources.busSheet || 'Bus_Info').trim() || 'Bus_Info';

  if (!sourceId) throw new Error('Student Spreadsheet ID is not configured.');
  if (!sheetName) throw new Error('Bus Sheet is not configured.');

  const source = SpreadsheetApp.openById(sourceId);
  const sheet = source.getSheetByName(sheetName);
  if (!sheet) throw new Error('Bus sheet not found: ' + sheetName);

  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow < 2 || lastColumn < 1) {
    return { sped: '', sourceAssignmentCount: 0, assignments: [] };
  }

  const values = sheet.getRange(1, 1, lastRow, lastColumn).getDisplayValues();
  const headers = values[0].map(function(v) { return String(v || '').trim(); });
  const h = busHeaderIndex_(headers);

  const required = [
    'StudentId',
    'Sped',
    'Bus From Route',
    'Bus From Run',
    'Bus From School Time',
    'Bus From Dropoff Address',
    'Bus From Dropoff Time',
    'Bus From Days',
    'Bus From Assignment Count'
  ];

  required.forEach(function(name) {
    if (h[name] == null) throw new Error('Bus_Info is missing required header: ' + name);
  });

  let sped = '';
  let sourceAssignmentCount = 0;
  const assignments = [];
  const seen = {};

  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    if (normalizeStudentId_(row[h.StudentId]) !== studentId) continue;

    if (!sped) sped = String(row[h.Sped] || '').trim();

    const sourceCount = Number(String(row[h['Bus From Assignment Count']] || '').trim() || 0);
    if (Number.isFinite(sourceCount)) {
      sourceAssignmentCount = Math.max(sourceAssignmentCount, sourceCount);
    }

    const route = String(row[h['Bus From Route']] || '').trim();
    const run = String(row[h['Bus From Run']] || '').trim();
    const schoolTime = String(row[h['Bus From School Time']] || '').trim();
    const dropoffAddress = String(row[h['Bus From Dropoff Address']] || '').trim();
    const dropoffTime = String(row[h['Bus From Dropoff Time']] || '').trim();
    const days = String(row[h['Bus From Days']] || '').trim();

    // A source row that represents only an AM / "Bus To" assignment can have
    // blank Bus From fields. Preserve the row in Bus_Info, but do not present it
    // as an Activity Bus home assignment.
    if (!route || !dropoffAddress) continue;

    const key = [route, run, schoolTime, dropoffAddress, dropoffTime, days].join('|');
    if (seen[key]) continue;
    seen[key] = true;

    assignments.push({
      route: route,
      run: run,
      schoolTime: schoolTime,
      dropoffAddress: dropoffAddress,
      dropoffTime: dropoffTime,
      days: days
    });
  }

  return {
    sped: sped,
    sourceAssignmentCount: sourceAssignmentCount,
    assignments: assignments
  };
}

function findTodayBusTransaction_(studentId, cfg) {
  const tz = cfg.sources.timeZone || PK.TIME_ZONE_FALLBACK;
  const todayKey = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  const rows = readSheetRecords_(PK.TRANSACTIONS_SHEET);

  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];

    if (String(row['Workflow'] || '') !== PK.WORKFLOWS.BUS) continue;
    if (String(row['Status'] || '') === 'VOID') continue;
    if (normalizeStudentId_(row['Student ID']) !== studentId) continue;
    if (busDateKey_(row['Created At'], tz) !== todayKey) continue;

    return row;
  }

  return null;
}

function busDateKey_(value, tz) {
  if (!value) return '';

  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, tz, 'yyyy-MM-dd');
  }

  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) return '';
  return Utilities.formatDate(parsed, tz, 'yyyy-MM-dd');
}

function busHeaderIndex_(headers) {
  const out = {};
  headers.forEach(function(header, index) {
    const key = String(header || '').trim();
    if (key) out[key] = index;
  });
  return out;
}
