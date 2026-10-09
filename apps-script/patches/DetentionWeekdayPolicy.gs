/** Friday rule installed in Code.gs and staff deployment version 22 on 2026-10-09.
 * Replace the two existing functions below; add the weekday helper and read-only test once.
 * Do not add duplicate function definitions. Preserves the live zero-window behavior. */

function buildDetentionAvailability_(type, student, cfg, inMemory) {
  const dcfg = type === 'LUNCH' ? cfg.detention.lunch : cfg.detention.afterSchool;
  const workflow = type === 'LUNCH' ? PK.WORKFLOWS.LUNCH : PK.WORKFLOWS.AFTER_SCHOOL;
  const tz = cfg.sources.timeZone || PK.TIME_ZONE_FALLBACK;
  const todayKey = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');

  const future = cfg.calendar
    .filter(d => d.status === 'ACTIVE' && d.dateKey > todayKey && isDetentionWeekdayAllowed_(type, d.dateKey))
    .sort((a,b) => a.dateKey.localeCompare(b.dateKey));

  const state = inMemory || getDetentionState_(workflow);
  const id = student ? student.studentId : '';

  const firstFive = future.slice(0, 5).map(d => {
    const count = Number(state.counts[d.dateKey] || 0);
    const full = dcfg.maxPerDay > 0 && count >= dcfg.maxPerDay;
    const duplicate = !!(id && state.studentDates[id + '|' + d.dateKey]);
    return {
      dateKey: d.dateKey,
      display: prettyDate_(d.dateKey, tz),
      count,
      full,
      duplicate,
      selectable: !full && !duplicate
    };
  });

  const eligible = [];
  for (const d of future) {
    const count = Number(state.counts[d.dateKey] || 0);
    const full = dcfg.maxPerDay > 0 && count >= dcfg.maxPerDay;
    const duplicate = !!(id && state.studentDates[id + '|' + d.dateKey]);
    if (full || duplicate) continue;

    eligible.push({ dateKey: d.dateKey, count });

    if (dcfg.windowDays === 0) break;
    if (eligible.length >= dcfg.windowDays) break;
  }

  let suggested = '';
  if (eligible.length) {
    eligible.sort((a,b) => a.count - b.count || a.dateKey.localeCompare(b.dateKey));
    suggested = eligible[0].dateKey;
  }

  return {
    type,
    maxPerDay: dcfg.maxPerDay,
    windowDays: dcfg.windowDays,
    defaultLocation: dcfg.defaultLocation,
    directions: dcfg.directions,
    suggestedDate: suggested,
    suggestedDisplay: suggested ? prettyDate_(suggested, tz) : '',
    dates: firstFive
  };
}

function validateManualDetentionDate_(type, student, dateKey, cfg, state) {
  const dcfg = type === 'LUNCH' ? cfg.detention.lunch : cfg.detention.afterSchool;
  if (!isDetentionWeekdayAllowed_(type, dateKey)) throw processingError_('INVALID_DETENTION_WEEKDAY', 'After-school detention is available Monday through Thursday only. Choose another active school day.');
  const active = cfg.calendar.some(d => d.status === 'ACTIVE' && d.dateKey === dateKey);
  if (!active) throw processingError_('INVALID_DETENTION_DATE', 'Choose an active school day.');

  const count = Number(state.counts[dateKey] || 0);
  if (dcfg.maxPerDay > 0 && count >= dcfg.maxPerDay) {
    throw processingError_('DETENTION_FULL', 'That detention date is full.');
  }

  if (state.studentDates[student.studentId + '|' + dateKey]) {
    throw processingError_('DUPLICATE_DETENTION_DATE', 'Student already has this type of detention on that date.');
  }

  return dateKey;
}

/** Calendar date keys are evaluated in UTC to avoid local timezone shifts. */
function isDetentionWeekdayAllowed_(type, dateKey) {
  if (type === 'LUNCH') return true;
  const key = String(dateKey || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const day = new Date(key + 'T12:00:00Z').getUTCDay();
  return day >= 1 && day <= 4;
}

/** Read-only regression check. Does not create assignments, print jobs or email. */
function testDetentionWeekdayPolicy() {
  const keys = ['2026-10-08','2026-10-09','2026-10-10','2026-10-11','2026-10-12'];
  const expected = [true,false,false,false,true];
  keys.forEach((key,i) => {
    if (isDetentionWeekdayAllowed_('AFTER_SCHOOL',key) !== expected[i]) throw new Error('After-school weekday failed: ' + key);
  });
  const cfg = readHelperConfig_();
  const emptyState = {counts:{},studentDates:{}};
  const sample = {studentId:'TEST-WEEKDAY-POLICY'};
  const friday = '2026-10-09';
  const synthetic = Object.assign({}, cfg, {calendar:[{dateKey:friday,status:'ACTIVE'}]});
  let rejected = false;
  try { validateManualDetentionDate_('AFTER_SCHOOL',sample,friday,synthetic,emptyState); } catch (e) { rejected = e.code === 'INVALID_DETENTION_WEEKDAY'; }
  if (!rejected) throw new Error('Manual Friday was not rejected.');
  if (validateManualDetentionDate_('LUNCH',sample,friday,synthetic,emptyState) !== friday) throw new Error('Friday lunch was rejected.');
  const availability = buildDetentionAvailability_('AFTER_SCHOOL',sample,cfg,emptyState);
  if (availability.dates.some(d => !isDetentionWeekdayAllowed_('AFTER_SCHOOL',d.dateKey))) throw new Error('Invalid weekday in date choices.');
  if (availability.suggestedDate && !isDetentionWeekdayAllowed_('AFTER_SCHOOL',availability.suggestedDate)) throw new Error('Invalid weekday suggested.');
  Logger.log(JSON.stringify({ok:true,readOnly:true,manualFridayRejected:true,fridayLunchAllowed:true,afterSchoolDates:availability.dates.map(d=>d.dateKey),suggestedDate:availability.suggestedDate,transactionsCreated:0,printJobsCreated:0}));
}
