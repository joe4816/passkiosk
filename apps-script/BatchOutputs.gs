/** Download batching and filing use saved transactions, never a second assignment. */
const PK_DOWNLOAD_KEYS = ['DL_PDF_HALF','DL_PDF_QUARTER'];
const PK_OUTPUT_LEDGER = 'Output_Requests';
const PK_OUTPUT_HEADERS = ['Request ID','Session Username','Device ID','Request Hash','Status','Result JSON','Created At'];

function outputPreferences_(username) {
  const raw = PropertiesService.getScriptProperties().getProperty('PK_OUTPUT_PREF_' + normalizeUsername_(username));
  const saved = raw ? JSON.parse(raw) : {};
  return {detention:saved.detention || {}, filingPrinterKey:saved.filingPrinterKey || 'AP_COPIER', busExplicit:saved.busExplicit === true};
}

function saveOutputPreference_(token, lane, choice) {
  const session = requireSession_(token), cfg = readHelperConfig_();
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const prefs = outputPreferences_(session.username);
    if (lane === 'FILING') {
      if (choice.printerKey === 'EMAIL_PDF') throw new Error('Choose a physical printer or a PDF download size.');
      prefs.filingPrinterKey = validatePreferencePrinter_(choice.printerKey,cfg);
    }
    else if (['DET','LUNCH_DET'].includes(lane)) {
      if (!choice || typeof choice.enabled !== 'boolean') throw new Error('Invalid duplicate preference.');
      const pair = String(choice.pair || '');
      if (pair && !['AP','BACK'].includes(pair)) throw new Error('Invalid printer set.');
      if (choice.enabled && pair) detentionOfficePair_({detentionOffice:pair},cfg);
      const previous = validatePreferencePrinter_(choice.previousPrinterKey,cfg);
      prefs.detention[lane] = {enabled:choice.enabled,pair,previousPrinterKey:previous};
      if (!choice.enabled) {
        const target=printerPreferenceRow_(session.username),cell=target.sheet.getRange(target.row,9);
        const parts=String(cell.getDisplayValue()).split('|');while(parts.length<6)parts.push('');
        parts[PK_PRINTER_PREFERENCES.slots.indexOf(lane)]=previous;cell.setValue(parts.join('|'));
      }
    } else throw new Error('Unknown output preference.');
    PropertiesService.getScriptProperties().setProperty('PK_OUTPUT_PREF_' + normalizeUsername_(session.username),JSON.stringify(prefs));
    return {ok:true,outputPreferences:prefs,printerPreferences:userPrinterPreferences_(session.username)};
  } finally {lock.releaseLock();}
}

function outputLedgerSheet_() {
  const ss = passSheet_(); let sheet = ss.getSheetByName(PK_OUTPUT_LEDGER);
  if (!sheet) {sheet = ss.insertSheet(PK_OUTPUT_LEDGER);sheet.getRange(1,1,1,PK_OUTPUT_HEADERS.length).setValues([PK_OUTPUT_HEADERS]);sheet.setFrozenRows(1);}
  const headers = sheet.getRange(1,1,1,PK_OUTPUT_HEADERS.length).getDisplayValues()[0];
  if (JSON.stringify(headers) !== JSON.stringify(PK_OUTPUT_HEADERS)) throw new Error('Output request ledger headers do not match.');
  return sheet;
}

/** Reserve an ID before writing: a timed-out request can be inspected, never repeated. */
function reserveOutputRequest_(session, requestId, payload) {
  if (!/^[a-zA-Z0-9-]{8,80}$/.test(String(requestId || ''))) throw new Error('Invalid output request ID.');
  const lock = LockService.getScriptLock();lock.waitLock(30000);
  try {
    const sheet = outputLedgerSheet_(), hash = hashText_(JSON.stringify(payload));
    const rows = sheet.getDataRange().getValues();
    for (let i=1;i<rows.length;i++) if (rows[i][0] === requestId) {
      if (rows[i][1] !== session.username || rows[i][2] !== session.deviceId || rows[i][3] !== hash) throw new Error('Output request ID cannot be reused.');
      if (rows[i][4] !== 'COMPLETE') throw new Error('Recording is not confirmed. Check Transactions before creating another submission.');
      return {existing:JSON.parse(rows[i][5])};
    }
    const row = sheet.getLastRow()+1;
    sheet.getRange(row,1,1,PK_OUTPUT_HEADERS.length).setValues([[requestId,session.username,session.deviceId,hash,'RECORDING','',new Date()]]);
    SpreadsheetApp.flush();
    return {sheet,row};
  } finally {lock.releaseLock();}
}

function completeOutputRequest_(entry,result) {
  const json = JSON.stringify(result);
  if (json.length > 45000) throw new Error('Output request result is too large. Check Transactions.');
  entry.sheet.getRange(entry.row,6).setValue(json);
  entry.sheet.getRange(entry.row,5).setValue('COMPLETE');
  return result;
}

function addPdfWorkflow_(token,request) {
  const cfg = readHelperConfig_(), session = requireSession_(token);
  if (!request || request.deviceId !== session.deviceId) throw new Error('Device mismatch.');
  if (!PK_DOWNLOAD_KEYS.includes(request.printerKey)) throw new Error('Choose a PDF download size.');
  if ((request.studentIds || [request.studentId]).length > 100) throw new Error('Add at most 100 students at a time.');
  if (!['PASS','RQST','DET','LUNCH_DET','BUS'].includes(request.workflow)) throw new Error('Unknown workflow.');
  if (request.data && (request.data.detentionOffice || request.data.printDuplicate)) throw new Error('PDF download cannot also print a duplicate.');
  const payload = Object.assign({},request);delete payload.outputRequestId;
  const entry = reserveOutputRequest_(session,request.outputRequestId,payload);
  if (entry.existing) return entry.existing;
  const localSession = sessionForPrinterRequest_(session,request,cfg);
  const result = request.workflow === 'BUS' ? submitBusWorkflow_(token,request) : recordEmailWorkflow_(localSession,request,false);
  return completeOutputRequest_(entry,result);
}

function batchStudentNames_(tx,students) {
  const student = students[String(tx['Student ID'])];
  // Sort against full source names, never initials or a guessed split of a surname.
  if (!student) throw new Error('Student sort information is missing for ' + tx['Transaction ID'] + '.');
  return Object.assign({},tx,{'Sort Last Name':student.lastName || '', 'Sort First Name':student.firstName || ''});
}
function outputNaturalCompare_(a,b) {return String(a || '').localeCompare(String(b || ''),'en',{numeric:true,sensitivity:'base'});}
function outputNameCompare_(a,b) {
  return outputNaturalCompare_(a['Sort Last Name'],b['Sort Last Name']) || outputNaturalCompare_(a['Sort First Name'],b['Sort First Name']) || outputNaturalCompare_(a['Transaction ID'],b['Transaction ID']);
}
function sortOutputTransactions_(txs,filing) {
  const order = ['PASS','RQST','DET','LUNCH_DET','BUS'];
  return txs.slice().sort(function(a,b) {
    if (filing) return outputNaturalCompare_(a.Grade,b.Grade) || outputNameCompare_(a,b);
    const group = order.indexOf(a.Workflow)-order.indexOf(b.Workflow);if (group) return group;
    if (a.Workflow === 'RQST') return outputNaturalCompare_(a['Delivery Period'],b['Delivery Period']) || outputNaturalCompare_(a['Delivery Room'],b['Delivery Room']) || outputNameCompare_(a,b);
    return outputNameCompare_(a,b);
  });
}
function outputTransactionPayloads_(txs,cfg) {
  const signatures = {};
  return txs.map(function(tx) {
    const result = serializeRecord_(tx);
    if (tx['Signature File']) {
      const name = String(tx['Signature File']);
      if (!Object.prototype.hasOwnProperty.call(signatures,name)) {
        signatures[name] = signaturePayload_(name,cfg);
        result['Signature Payload'] = signatures[name];
        if (!result['Signature Payload']) throw new Error('Signature image is missing for ' + tx['Transaction ID'] + '.');
      }
    }
    return result;
  });
}

function getPdfBatch_(token,ids) {
  const session = requireSession_(token), cfg = readHelperConfig_();
  if (!Array.isArray(ids) || !ids.length || ids.length > 400) throw new Error('Choose between 1 and 400 saved passes.');
  const wanted = Array.from(new Set(ids.map(String))), byId = {};
  readSheetRecords_(PK.TRANSACTIONS_SHEET).forEach(tx=>byId[String(tx['Transaction ID'])]=tx);
  const students = getStudentMap_();
  const txs = wanted.map(function(id) {
    const tx = byId[id];
    if (!tx || tx.Status === 'VOID' || tx['Session Username'] !== session.username) throw new Error('A pass is missing, void, or belongs to another user.');
    return batchStudentNames_(tx,students);
  });
  return {ok:true,transactions:outputTransactionPayloads_(sortOutputTransactions_(txs,false),cfg)};
}

function todaysFilingTransactions_(cfg) {
  const tz = cfg.sources.timeZone || PK.TIME_ZONE_FALLBACK, today = Utilities.formatDate(new Date(),tz,'yyyy-MM-dd');
  const students = getStudentMap_();
  const txs = readSheetRecords_(PK.TRANSACTIONS_SHEET).filter(function(tx) {
    if (!['DET','LUNCH_DET'].includes(tx.Workflow) || tx.Status === 'VOID') return false;
    const created = tx['Created At'] instanceof Date ? tx['Created At'] : new Date(tx['Created At']);
    return !isNaN(created.getTime()) && Utilities.formatDate(created,tz,'yyyy-MM-dd') === today;
  }).map(tx=>batchStudentNames_(tx,students));
  return {date:today,transactions:sortOutputTransactions_(txs,true)};
}
function getTodaysDetentions_(token) {
  requireSession_(token);const cfg = readHelperConfig_(), batch = todaysFilingTransactions_(cfg);
  if (batch.transactions.length > 400) throw new Error('Today has more than 400 detention notices. Contact the administrator to split the filing batch.');
  return {ok:true,date:batch.date,transactions:outputTransactionPayloads_(batch.transactions,cfg)};
}
function printTodaysDetentions_(token,printerKey,requestId) {
  const session = requireSession_(token), cfg = readHelperConfig_();
  const key = validatePreferencePrinter_(printerKey,cfg);
  if (key === 'EMAIL_PDF' || PK_DOWNLOAD_KEYS.includes(key)) throw new Error('Choose a physical filing printer.');
  const batch = todaysFilingTransactions_(cfg);
  const entry = reserveOutputRequest_(session,requestId,{kind:'FILING',key,date:batch.date});
  if (entry.existing) return entry.existing;
  const printSession = Object.assign({},session,{printerKey:key}), now = new Date();
  const rows = batch.transactions.map(function(tx) {
    const row = makePrintJobRow_(tx['Transaction ID'],now,printSession,cfg,'REPRINT','',tx);
    row['Copy Role'] = 'FILE';return row;
  });
  const lock = LockService.getScriptLock();lock.waitLock(30000);
  try {if (rows.length) appendMappedRows_(PK.PRINT_JOBS_SHEET,rows);}
  finally {lock.releaseLock();}
  return completeOutputRequest_(entry,{ok:true,count:rows.length,date:batch.date,printerKey:key});
}

/** Configuration-only deployment check. Creates no ledger, records, files or jobs. */
function testBatchOutputs() {
  const adult=requireActiveCcsdAdult_(),cfg=readHelperConfig_(),prefs=userPrinterPreferences_(adult.username);
  for(const key of ['DL_PDF_HALF','DL_PDF_QUARTER'])validatePreferencePrinter_(key,cfg);
  for(const office of ['AP','BACK'])detentionOfficePair_({detentionOffice:office},cfg);
  if(!cfg.printers.some(p=>p.key==='AP_COPIER'))throw new Error('AP filing copier is missing.');
  if(!cfg.printers.some(p=>p.key==='CAFE_TARDY'))throw new Error('Cafe Activity Bus default is missing.');
  const sample=[{Workflow:'DET',Grade:'8','Sort Last Name':'Alpha','Sort First Name':'Amy'},
    {Workflow:'LUNCH_DET',Grade:'6','Sort Last Name':'Zulu','Sort First Name':'Zoe'},
    {Workflow:'DET',Grade:'6','Sort Last Name':'Alpha','Sort First Name':'Amy'}];
  const sorted=sortOutputTransactions_(sample,true);
  if(sorted[0]['Sort Last Name']!=='Alpha'||sorted[1].Grade!=='6'||sorted[2].Grade!=='8')throw new Error('Filing sort failed.');
  Logger.log(JSON.stringify({ok:true,readOnly:true,virtualDestinations:2,officePairs:2,
    filingDefault:'AP_COPIER',busDefault:'CAFE_TARDY',preferencesAvailable:Boolean(prefs),transactionsCreated:0,printJobsCreated:0}));
}
