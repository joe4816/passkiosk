/**
 * PassKiosk Activity Bus integration.
 *
 * Add this file to the bound Apps Script project alongside Code.gs and
 * SecureRpc.gs. It intentionally does NOT create a Print_Jobs row. The Activity
 * Bus authorization can be recorded and audited while physical printing stays
 * parked as a separate integration step.
 *
 * Source contract:
 *   Helper -> APP SOURCES -> Student Spreadsheet ID
 *   Helper -> APP SOURCES -> Bus Sheet (Bus_Info)
 *
 * Bus_Info is an already-normalized projection keyed by StudentId and may
 * contain more than one row per student. Only usable "Bus From" assignments
 * are Activity Bus home assignments. SPED is informational only and is never
 * interpreted as transportation eligibility.
 */

const PK_BUS_REQUIRED_HEADERS = Object.freeze([
  'StudentId',
  'Sped',
  'Bus From Route',
  'Bus From Run',
  'Bus From School Time',
  'Bus From Dropoff Address',
  'Bus From Dropoff Time',
  'Bus From Days',
  'Bus From Assignment Count'
]);

function getBusInfoForSession_(token, studentId) {
  requireSession_(token);

  const id = normalizeStudentId_(studentId);
  if (!id) throw new Error('Student ID is required.');

  const student = getStudentMap_()[id];
  if (!student) throw new Error('Student could not be found in the current student source.');

  const cfg = readHelperConfig_();
  const lookup = readBusAssignments_(id, cfg);
  const prior = findTodayBusTransactions_(id, cfg);

  return {
    ok: true,
    wired: true,
    studentId: id,
    studentName: [student.firstName, student.lastName].filter(Boolean).join(' '),
    grade: student.grade,
    sped: lookup.sped,
    assignments: lookup.assignments,
    assignmentCount: lookup.assignments.length,
    sourceAssignmentCount: lookup.sourceAssignmentCount,
    hasBusInfo: lookup.assignments.length > 0,
    alreadyScannedToday: prior.length > 0,
    priorTransactionIds: prior.map(function(r) {
      return String(r['Transaction ID'] || '');
    }).filter(Boolean),
    priorTransactionId: prior.length ? String(prior[0]['Transaction ID'] || '') : '',
    priorCreatedAt: prior.length ? prior[0]['Created At'] : ''
  };
}

function submitBusWorkflow_(token, request) {
  const session = requireSession_(token);
  const cfg = readHelperConfig_();

  if (!request || typeof request !== 'object') throw new Error('Missing Activity Bus submission.');
  if (String(request.deviceId || '') !== String(session.deviceId || '')) {
    throw new Error('Device mismatch.');
  }

  const studentId = normalizeStudentId_(
    request.studentId ||
    (Array.isArray(request.studentIds) && request.studentIds.length ? request.studentIds[0] : '')
  );
  if (!studentId) throw new Error('Choose a student.');

  const student = getStudentMap_()[studentId];
  if (!student) throw new Error('Student could not be found in the current student source.');

  const approvedUsername = normalizeUsername_(
    request.approvedByUsername ||
    (request.data && request.data.approvedByUsername) ||
    session.username
  );
  const approved = getActiveAdultByUsername_(approvedUsername);
  if (!approved) throw new Error('Approved By is not an active adult.');

  const allowDuplicate = request.allowDuplicate === true ||
    Boolean(request.data && request.data.duplicateOverride === true);

  const now = new Date();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    // Re-read inside the lock so two kiosks cannot both treat the same
    // student's first scan as unique.
    const lookup = readBusAssignments_(studentId, cfg);

    if (!lookup.assignments.length) {
      return {
        ok: false,
        code: 'NO_BUS_INFO',
        message: 'NO BUS INFO ON FILE',
        studentId: studentId,
        assignments: []
      };
    }

    const prior = findTodayBusTransactions_(studentId, cfg);

    if (prior.length && !allowDuplicate) {
      return {
        ok: false,
        code: 'ALREADY_SCANNED_TODAY',
        message: 'ALREADY SCANNED TODAY',
        duplicate: true,
        requiresOverride: true,
        priorTransactionIds: prior.map(function(r) {
          return String(r['Transaction ID'] || '');
        }).filter(Boolean),
        priorTransactionId: String(prior[0]['Transaction ID'] || ''),
        assignments: lookup.assignments
      };
    }

    const original = prior.find(function(r) {
      return String(r['Bus Scan Type'] || '').toUpperCase() !== 'DUPLICATE';
    }) || prior[0] || null;

    const scanType = prior.length ? 'DUPLICATE' : 'NORMAL';
    const duplicateOf = original ? String(original['Transaction ID'] || '') : '';
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
      'Notes': '',
      'Voided At': '',
      'Voided By Username': '',
      'Voided By': '',
      'Bus Assignment Count': lookup.assignments.length,
      'Bus Scan Type': scanType,
      'Duplicate Of Transaction ID': duplicateOf,
      'Bus Snapshot': formatBusSnapshot_(lookup.assignments)
    };

    appendMappedRows_(PK.TRANSACTIONS_SHEET, [tx]);

    return {
      ok: true,
      transactionId: transactionId,
      duplicate: scanType === 'DUPLICATE',
      scanType: scanType,
      duplicateOfTransactionId: duplicateOf,
      studentId: studentId,
      studentName: name,
      sped: lookup.sped,
      assignmentCount: lookup.assignments.length,
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

  const source = SpreadsheetApp.openById(sourceId);
  const sheet = source.getSheetByName(sheetName);
  if (!sheet) throw new Error('Bus sheet not found: ' + sheetName);

  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();

  if (lastRow < 2 || lastColumn < 1) {
    return { sped: '', sourceAssignmentCount: 0, assignments: [] };
  }

  const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0]
    .map(function(v) { return String(v || '').trim(); });
  const h = busHeaderIndex_(headers);

  PK_BUS_REQUIRED_HEADERS.forEach(function(name) {
    if (h[name] == null) throw new Error('Bus_Info is missing required header: ' + name);
  });

  // Search only the StudentId column instead of reading all transportation
  // records on every rapid Activity Bus scan.
  const matches = sheet
    .getRange(2, h.StudentId + 1, lastRow - 1, 1)
    .createTextFinder(String(studentId))
    .matchEntireCell(true)
    .findAll()
    .sort(function(a, b) { return a.getRow() - b.getRow(); });

  let sped = '';
  let sourceAssignmentCount = 0;
  const assignments = [];
  const seen = {};

  matches.forEach(function(cell) {
    const row = sheet.getRange(cell.getRow(), 1, 1, lastColumn).getDisplayValues()[0];

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

    // A source row can represent an extra morning assignment with blank
    // afternoon fields. Keep it in Bus_Info, but do not treat it as an
    // Activity Bus home assignment.
    if (!route || !dropoffAddress) return;

    const key = [route, run, schoolTime, dropoffAddress, dropoffTime, days].join('|');
    if (seen[key]) return;
    seen[key] = true;

    assignments.push({
      route: route,
      run: run,
      schoolTime: schoolTime,
      dropoffAddress: dropoffAddress,
      dropoffTime: dropoffTime,
      days: days
    });
  });

  return {
    sped: sped,
    sourceAssignmentCount: sourceAssignmentCount,
    assignments: assignments
  };
}

function findTodayBusTransactions_(studentId, cfg) {
  const tz = cfg.sources.timeZone || PK.TIME_ZONE_FALLBACK;
  const todayKey = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  const rows = readSheetRecords_(PK.TRANSACTIONS_SHEET);

  return rows.filter(function(row) {
    if (String(row['Workflow'] || '') !== PK.WORKFLOWS.BUS) return false;
    if (String(row['Status'] || '') === 'VOID') return false;
    if (normalizeStudentId_(row['Student ID']) !== studentId) return false;
    return busDateKey_(row['Created At'], tz) === todayKey;
  });
}

function formatBusSnapshot_(assignments) {
  return assignments.map(function(a, index) {
    const pieces = [
      '#' + (index + 1),
      'Route ' + a.route
    ];

    if (a.run) pieces.push('Run ' + a.run);
    if (a.schoolTime) pieces.push('School ' + a.schoolTime);
    pieces.push('Drop ' + a.dropoffAddress);
    if (a.dropoffTime) pieces.push('@ ' + a.dropoffTime);
    if (a.days) pieces.push(a.days);

    return pieces.join(' | ');
  }).join('\n');
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

/**
 * Manual Apps Script editor check. Returns metadata only; no student IDs or
 * transportation details are emitted.
 */
function testBusIntegration_() {
  const cfg = readHelperConfig_();
  const source = SpreadsheetApp.openById(cfg.sources.studentSpreadsheetId);
  const sheet = source.getSheetByName(cfg.sources.busSheet);
  if (!sheet) throw new Error('Bus sheet not found: ' + cfg.sources.busSheet);

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const h = busHeaderIndex_(headers);

  PK_BUS_REQUIRED_HEADERS.forEach(function(name) {
    if (h[name] == null) throw new Error('Bus_Info is missing required header: ' + name);
  });

  return {
    ok: true,
    sourceSpreadsheetId: cfg.sources.studentSpreadsheetId,
    busSheet: cfg.sources.busSheet,
    dataRows: Math.max(0, sheet.getLastRow() - 1),
    requiredHeadersPresent: true
  };
}
