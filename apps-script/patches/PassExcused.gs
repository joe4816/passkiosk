/** Replace buildTransaction_ and buildPassTx_ in Code.gs; add assertPassExcusedHeader_.
 * Add the exact Excused header first. This is a replacement patch, not an additive module.
 */
function buildTransaction_(transactionId, now, session, workflow, student, data, cfg, detentionState, bulk) {
  const name = [student.firstName, student.lastName].filter(Boolean).join(' ');
  const tx = {
    'Transaction ID': transactionId,
    'Created At': now,
    'Status': 'CREATED',
    'Device ID': session.deviceId,
    'Workflow': workflow,
    'Student ID': student.studentId,
    'Student Name': name,
    'Grade': student.grade,
    'Session Username': session.username,
    'Session User': session.displayName,
    'Requested By Username': '',
    'Requested By': '',
    'Issued By Username': '',
    'Issued By': '',
    'Approved By Username': '',
    'Approved By': '',
    'Signature File': '',
    'From': '',
    'To': '',
    'Reason(s)': '',
    'Other Reason': '',
    'Excused': false,
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
    'Bus Route(s)': '',
    'Bus Drop-off(s)': '',
    'Schema Version': PK.SCHEMA_VERSION,
    'Notes': '',
    'Voided At': '',
    'Voided By Username': '',
    'Voided By': ''
  };

  if (workflow === PK.WORKFLOWS.PASS) return buildPassTx_(tx, student, data, cfg);
  if (workflow === PK.WORKFLOWS.REQUEST) return buildRequestTx_(tx, student, data, cfg);
  if (workflow === PK.WORKFLOWS.LUNCH || workflow === PK.WORKFLOWS.AFTER_SCHOOL) {
    return buildDetentionTx_(tx, student, data, cfg, detentionState, bulk, workflow);
  }

  throw processingError_('UNKNOWN_WORKFLOW', 'Unsupported workflow.');
}

function buildPassTx_(tx, student, data, cfg) {
  const from = String(data.from || '').trim();
  if (!from) throw processingError_('MISSING_FROM', 'FROM is required.');

  let to = String(data.toOverride || '').trim();
  if (!to) {
    const routing = resolveRouting_(student, cfg);
    if (routing.currentClass && routing.currentClass.display) to = routing.currentClass.display;
  }
  if (!to) throw processingError_('NO_CURRENT_CLASS', 'Current class could not be determined. Enter a destination.');

  const reason = String(data.reason || '').trim();
  const other = String(data.otherReason || '').trim();
  if (reason === 'Other' && !other) throw processingError_('MISSING_OTHER_REASON', 'Enter the Other reason.');

  assertPassExcusedHeader_();
  tx['Excused'] = data.excused === true;
  tx['From'] = from;
  tx['To'] = to;
  tx['Reason(s)'] = reason === 'Other' ? other : reason;
  tx['Other Reason'] = reason === 'Other' ? other : '';
  return tx;
}

function assertPassExcusedHeader_() {
  const sheet = passSheet_().getSheetByName(PK.TRANSACTIONS_SHEET);
  if (!sheet) throw processingError_('MISSING_TRANSACTIONS_SHEET', 'Transactions sheet not found.');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  if (headers.indexOf('Excused') === -1) {
    throw processingError_('MISSING_EXCUSED_HEADER',
      'Transactions is missing the Excused header. Complete the schema migration before submitting passes.');
  }
}
