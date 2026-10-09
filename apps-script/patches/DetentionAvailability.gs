/** Replace ONLY buildDetentionAvailability_ in Code.gs. Do not add a second definition. */
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

  const suggestionLimit = dcfg.windowDays === 0 ? 3 : dcfg.windowDays;
  const eligible = [];
  for (const d of future) {
    const count = Number(state.counts[d.dateKey] || 0);
    const full = dcfg.maxPerDay > 0 && count >= dcfg.maxPerDay;
    const duplicate = !!(id && state.studentDates[id + '|' + d.dateKey]);
    if (full || duplicate) continue;

    eligible.push({ dateKey: d.dateKey, count });

    if (eligible.length >= suggestionLimit) break;
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
