/** Per-user printer choices in Helper!I: Default|Corridor|Request|Det|Lunch|Bus. */
const PK_PRINTER_PREFERENCES = {column:9, header:'Printer Preferences',
  slots:['DEFAULT','PASS','RQST','DET','LUNCH_DET','BUS']};

function printerPreferenceRow_(usernameInput) {
  const username = normalizeUsername_(usernameInput);
  const sheet = passSheet_().getSheetByName(PK.HELPER_SHEET);
  if (!sheet || sheet.getRange(3,9).getDisplayValue() !== PK_PRINTER_PREFERENCES.header) {
    throw new Error('Printer preferences are not configured in Helper column I.');
  }
  const rows = sheet.getRange(4,3,Math.max(1,sheet.getLastRow()-3),6).getDisplayValues();
  const matches = [];
  rows.forEach((r,i) => {
    if (normalizeUsername_(r[0]) === username && String(r[5]).trim().toUpperCase() === 'YES') matches.push(i+4);
  });
  if (matches.length !== 1) throw new Error('Your active Helper user row could not be uniquely identified.');
  return {sheet, row:matches[0]};
}

function parsePrinterPreferences_(value) {
  const raw = String(value || '').trim();
  const parts = raw ? raw.split('|').map(x=>x.trim()) : [];
  if (parts.length > 6) throw new Error('Printer Preferences must contain six positions.');
  const result = {initialized:Boolean(parts[0]), defaultPrinterKey:parts[0] || '', workflows:{}};
  PK_PRINTER_PREFERENCES.slots.slice(1).forEach((lane,i) => {
    result.workflows[lane] = parts[i+1] || result.defaultPrinterKey;
  });
  return result;
}

function userPrinterPreferences_(username) {
  const target = printerPreferenceRow_(username);
  return parsePrinterPreferences_(target.sheet.getRange(target.row,9).getDisplayValue());
}

function validatePreferencePrinter_(key,cfg) {
  const value = String(key || '').trim();
  if (value === 'EMAIL_PDF' && typeof pdfEmailEnabled_ === 'function' && pdfEmailEnabled_()) return value;
  if (!value || value.includes('|') || !cfg.printers.some(p=>p.key===value)) {
    throw new Error('Choose a configured printer.');
  }
  return value;
}

function savePrinterPreference_(token,workflow,printerKey) {
  const session = requireSession_(token);
  const slot = PK_PRINTER_PREFERENCES.slots.indexOf(String(workflow || ''));
  if (slot < 0) throw new Error('Unknown printer preference.');
  const key = validatePreferencePrinter_(printerKey,readHelperConfig_());
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const target = printerPreferenceRow_(session.username);
    const cell = target.sheet.getRange(target.row,9);
    const raw = String(cell.getDisplayValue() || '').trim();
    const parts = raw ? raw.split('|').map(x=>x.trim()) : [];
    if (parts.length > 6) throw new Error('Printer Preferences must contain six positions.');
    if (!parts[0]) {
      if (slot !== 0) throw new Error('Choose your default printer first.');
      // First-time setup initializes all workflows exactly once.
      for (let i=0;i<6;i++) parts[i]=parts[i] || key;
    } else {
      while (parts.length < 6) parts.push('');
      parts[slot] = key;
    }
    const value = parts.join('|');
    cell.setValue(value);
    return {ok:true, printerPreferences:parsePrinterPreferences_(value)};
  } finally { lock.releaseLock(); }
}

/** Use a request-local copy; never change the cached session for a tab submission. */
function sessionForPrinterRequest_(session,request,cfg) {
  if (!request || !Object.prototype.hasOwnProperty.call(request,'printerKey')) return session;
  const key = validatePreferencePrinter_(request.printerKey,cfg);
  if (key === 'EMAIL_PDF' && request.includePhysicalPrint === true) throw new Error('Choose a physical printer for printing.');
  return Object.assign({},session,{printerKey:key === 'EMAIL_PDF' ? '' : key});
}

function helpOutPassTransaction_(tx,data) {
  const username = normalizeUsername_(data.requestedByUsername || data.issuedByUsername || tx['Session Username']);
  const adult = getActiveAdultByUsername_(username);
  if (!adult) throw processingError_('INVALID_PASS_ADULT','Help out must be an active adult.');
  tx['Issued By Username'] = adult.username;
  tx['Issued By'] = adult.displayName;
  tx['Signature File'] = adult.sig || '';
  return tx;
}

/** Read-only live configuration check. */
function testUserPrinterPreferences() {
  const adult = requireActiveCcsdAdult_();
  const preferences = userPrinterPreferences_(adult.username);
  const cfg = readHelperConfig_();
  const sample = parsePrinterPreferences_('A|B|C|D|E|F');
  if (sample.workflows.PASS !== 'B' || sample.workflows.LUNCH_DET !== 'E') throw new Error('Slot mapping failed.');
  const fallback = parsePrinterPreferences_('A|||||');
  if (fallback.workflows.BUS !== 'A') throw new Error('Default fallback failed.');
  if (!cfg.printers.length) throw new Error('No configured printers.');
  Logger.log(JSON.stringify({ok:true,readOnly:true,initialized:preferences.initialized,workflows:5,transactionsCreated:0,printJobsCreated:0}));
}
