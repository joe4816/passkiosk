/** Shared schedule routing and optional detention outputs. No device registrations are changed. */
function resolvePeriodRouting_(student, cfg, now) {
  now = now || new Date();
  const tz = cfg.sources.timeZone || PK.TIME_ZONE_FALLBACK;
  const todayKey = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  const nowMinutes = Number(Utilities.formatDate(now, tz, 'H')) * 60 +
    Number(Utilities.formatDate(now, tz, 'm')) + Number(Utilities.formatDate(now, tz, 's')) / 60;
  const todayActive = cfg.calendar.some(d => d.dateKey === todayKey && d.status === 'ACTIVE');
  const nextDate = nextActiveSchoolDate_(todayKey, cfg.calendar, !todayActive);
  const names = ['P1','P2','P3','P4','P5','P6'];
  // Bell windows do not depend on whether a student's class happens to be missing.
  const windows = names.map(p => {
    const bell = bellForStudentPeriod_(p, student, cfg.bells);
    return bell ? {period:p, start:bell.startMin, end:bell.endMin} : null;
  }).filter(Boolean).sort((a,b) => a.start - b.start);
  let currentClass = null, nextClass = null, defaultClass = null, defaultMode = 'next';
  let period = 'P1', dateKey = todayActive ? todayKey : nextDate;
  if (todayActive) {
    const current = windows.find(w => nowMinutes >= w.start && nowMinutes < w.end);
    if (current) {
      currentClass = student.schedule[current.period] ? routeClass_(current.period, student.schedule[current.period], todayKey) : null;
      if (nowMinutes < current.end - 5) {
        period = current.period; defaultMode = 'current';
      } else {
        const next = windows.find(w => w.start > current.start);
        period = next ? next.period : 'P1';
        dateKey = next ? todayKey : nextDate;
      }
    } else {
      const upcoming = windows.find(w => w.start > nowMinutes);
      period = upcoming ? upcoming.period : 'P1';
      dateKey = upcoming ? todayKey : nextDate;
    }
  }
  if (dateKey && student.schedule[period]) defaultClass = routeClass_(period, student.schedule[period], dateKey);
  if (defaultMode === 'next') nextClass = defaultClass;
  return {currentClass, nextClass, defaultClass, defaultMode, defaultPeriod:period,
    periods:names.filter(p => student.schedule[p]).map(p => routeClass_(p, student.schedule[p], dateKey || todayKey)),
    timing:{serverNow:now.getTime(), nowMinutes, todayActive, todayKey, nextDate, windows}};
}

function periodClassDisplay_(route) {
  return route && route.display ? route.period + ' · ' + route.display : '';
}

function buildPeriodPassTx_(tx, student, data, cfg) {
  const from = String(data.from || '').trim();
  if (!from) throw processingError_('MISSING_FROM', 'FROM is required.');
  let to = String(data.toOverride || '').trim();
  if (!to) {
    const p = String(data.deliveryPeriod || '').toUpperCase();
    const route = data.deliveryMode === 'PERIOD'
      ? (student.schedule[p] ? routeClass_(p, student.schedule[p], '') : null)
      : resolveRouting_(student, cfg).defaultClass;
    to = periodClassDisplay_(route);
  }
  if (!to) throw processingError_('NO_DESTINATION_CLASS', 'Class could not be determined. Choose a period or enter a destination.');
  const reason = String(data.reason || '').trim(), other = String(data.otherReason || '').trim();
  if (reason === 'Other' && !other) throw processingError_('MISSING_OTHER_REASON', 'Enter the Other reason.');
  assertPassExcusedHeader_();
  if (typeof data.excused !== 'boolean') throw processingError_('MISSING_EXCUSED', 'Choose Yes or No for Excused.');
  tx['Excused'] = data.excused; tx['From'] = from; tx['To'] = to;
  tx['Reason(s)'] = reason === 'Other' ? other : reason;
  tx['Other Reason'] = reason === 'Other' ? other : '';
  return tx;
}

function detentionOfficePair_(data, cfg) {
  const office = String(data.detentionOffice || '');
  if (!office) return null;
  const keys = office === 'AP' ? ['AP_COPIER','AP_TARDY'] : office === 'BACK' ? ['BACK_OFFICE','RECEIPT2'] : null;
  if (!keys) throw processingError_('INVALID_OFFICE_PAIR', 'Choose either AP Office or Back Office, not both.');
  const pair = keys.map(key => cfg.printers.find(p => p.key === key));
  if (pair.some(p => !p)) throw processingError_('OFFICE_PRINTER_MISSING', 'Both printers for that office must be configured.');
  return {copier:pair[0], receipt:pair[1]};
}

function detentionPickupData_(student, data, session, cfg, now) {
  const destination = String(data.pickupDestination || session.defaultLocation || '').trim();
  if (!destination) throw processingError_('MISSING_PICKUP_DESTINATION', 'Send student to is required for the pickup request.');
  if (!student.schedule.P6 || !classDisplay_(student.schedule.P6)) throw processingError_('NO_PICKUP_CLASS', 'P6 class is missing; detention and pickup request were not created.');
  const bell = bellForStudentPeriod_('P6', student, cfg.bells);
  if (!bell || !Number.isFinite(bell.endMin) || bell.endMin < 10) throw processingError_('NO_FINAL_BELL', 'Final bell could not be determined; nothing was created for this student.');
  const tz = cfg.sources.timeZone || PK.TIME_ZONE_FALLBACK;
  const today = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  if (!cfg.calendar.some(d => d.dateKey === today && d.status === 'ACTIVE')) throw processingError_('NO_PICKUP_SCHOOL_DAY', 'End-of-day pickup requests must be created on an active school day.');
  const minutes = bell.endMin - 10;
  return {requestedByUsername:session.username, destination, when:'At:',
    atTime:String(Math.floor(minutes / 60)).padStart(2,'0') + ':' + String(minutes % 60).padStart(2,'0'),
    reasons:['Pick up detention notice.'], otherReason:'', deliveryMode:'PERIOD', deliveryPeriod:'P6'};
}

/** Build every transaction and job before adding any to the submission arrays. */
function prepareWorkflowBundle_(tid, now, session, workflow, student, data, cfg, detentionState, bulk, emailOnly) {
  const detention = ['DET','LUNCH_DET'].includes(workflow);
  if (!detention && (data.detentionOffice || data.createPickupRequest)) throw processingError_('INVALID_WORKFLOW_OPTIONS', 'Detention options are available only on detention forms.');
  if (data.createPickupRequest !== undefined && typeof data.createPickupRequest !== 'boolean') throw processingError_('INVALID_PICKUP_OPTION', 'Invalid pickup request option.');
  const pair = detention ? detentionOfficePair_(data, cfg) : null;
  const pickupData = detention && data.createPickupRequest ? detentionPickupData_(student, data, session, cfg, now) : null;
  const tx = buildTransaction_(tid, now, session, workflow, student, data, cfg, detentionState, bulk);
  const transactions = [tx], jobs = [];
  const pickup = pickupData ? buildTransaction_(tid + '-RQST', now, session, 'RQST', student, pickupData, cfg, null, false) : null;
  if (pickup) {
    tx.Notes = 'Pickup request: ' + pickup['Transaction ID'];
    pickup.Notes = 'Detention notice: ' + tid;
    transactions.push(pickup);
  }
  function jobFor(transaction, printer, role) {
    const destinationSession = Object.assign({}, session, {printerKey:printer.key});
    const job = makePrintJobRow_(transaction['Transaction ID'], now, destinationSession, cfg, 'ORIGINAL', '', transaction);
    job['Copy Role'] = role;
    jobs.push(job);
  }
  if (pair) {
    jobFor(tx, pair.receipt, 'STUDENT'); jobFor(tx, pair.copier, 'FILE');
    if (pickup) jobFor(pickup, pair.copier, 'PICKUP_REQUEST');
  } else if (!emailOnly) {
    const printer = getPrinterForSession_(session, cfg);
    jobFor(tx, printer, 'PRIMARY');
    if (pickup) jobFor(pickup, printer, 'PICKUP_REQUEST');
  }
  return {transaction:tx, transactions, jobs, pickupTransactionId:pickup ? pickup['Transaction ID'] : ''};
}
