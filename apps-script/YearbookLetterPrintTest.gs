/**
 * Isolated three-page yearbook Letter print test.
 * Requires PrintHub v0.6.4 Letter binding and the authenticated hook
 * integrations in PrintHubEndpoint.gs. Never alter the existing AP_COPIER
 * Statement printing route.
 */
const YB_LETTER_PRINT_TEST = Object.freeze({
  SPREADSHEET_ID:'1bVgagXVT2DwEbwU7ho-PEizRUwTvbYktRuxKSP6L0ys',
  PDF_FILE_ID:'1YkBH3C9wt77Er_Sc3o6Wrag0gLUHHP4v',
  QUEUE_SHEET:'Yearbook_Test_Print_Queue',
  JOB_ID:'YB-LETTER-PRINT-TEST-20261023-001',
  ENDPOINT_ID:'PH-FRONT-RECEIPT-01',
  ROUTE:'YEARBOOK_LETTER',
  PROFILE:'LETTER',
  RENDERER:'YEARBOOK_PDF_FILE',
  HEADERS:['Job ID','File ID','Status','Requested At','Claim ID',
           'Claimed At','Print Invoked At','Completed At','Detail']
});

// The user already ran the original version once; this is idempotent.
function runYearbookLetterPrintTest() {
  const cfg=YB_LETTER_PRINT_TEST;
  const file=DriveApp.getFileById(cfg.PDF_FILE_ID);
  if(file.getMimeType()!==MimeType.PDF)throw new Error('Test file must be PDF.');
  if(file.getSize()>2600000)throw new Error('PDF exceeds bridge limit.');
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    const sheet=ybLetterQueueSheet_(),rows=sheet.getDataRange().getValues();
    for(let i=1;i<rows.length;i++){
      if(String(rows[i][0])===cfg.JOB_ID){
        const found={ok:true,alreadyQueued:true,jobId:cfg.JOB_ID,status:String(rows[i][2])};
        console.log(JSON.stringify(found));return found;
      }
    }
    sheet.appendRow([cfg.JOB_ID,cfg.PDF_FILE_ID,'QUEUED',new Date(),'','','','','']);
    const result={ok:true,alreadyQueued:false,jobId:cfg.JOB_ID,status:'QUEUED',
      note:'Letter routing is NOT proof of physical printer output'};
    console.log(JSON.stringify(result));return result;
  }finally{lock.releaseLock();}
}

function getYearbookLetterPrintTestStatus() {
  const cfg=YB_LETTER_PRINT_TEST,rows=ybLetterQueueSheet_().getDataRange().getValues();
  for(let i=1;i<rows.length;i++)if(String(rows[i][0])===cfg.JOB_ID){
    const result={jobId:cfg.JOB_ID,status:rows[i][2],claimedAt:rows[i][5],
      printInvokedAt:rows[i][6],completedAt:rows[i][7],detail:rows[i][8]};
    console.log(JSON.stringify(result));return result;
  }
  return {jobId:cfg.JOB_ID,status:'NOT_QUEUED'};
}

// Must be invoked only AFTER authenticated printHubEndpointPoll_ enabled checks.
function ybLetterTestPollHook_(body) {
  const cfg=YB_LETTER_PRINT_TEST;
  if(!Array.isArray(body&&body.readyBindingKeys)||
    !body.readyBindingKeys.includes(cfg.ROUTE))return null;
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    const sheet=ybLetterQueueSheet_(),rows=sheet.getDataRange().getValues();
    for(let i=1;i<rows.length;i++){
      if(String(rows[i][0])!==cfg.JOB_ID||String(rows[i][2])!=='QUEUED')continue;
      const pdf=DriveApp.getFileById(cfg.PDF_FILE_ID).getBlob();
      const encoded=Utilities.base64Encode(pdf.getBytes());
      if(encoded.length>4000000)throw new Error('PDF exceeds bridge limit.');
      const claimId=Utilities.getUuid(),when=new Date();
      sheet.getRange(i+1,3,1,4).setValues([['CLAIMED',rows[i][3],claimId,when]]);
      sheet.getRange(i+1,9).setValue('Claimed by managed ChromeOS endpoint');
      return {schemaVersion:1,printJobId:cfg.JOB_ID,jobGroupId:cfg.JOB_ID,
        sourceTransactionId:cfg.JOB_ID,copyRole:'TEST',routeId:cfg.ROUTE,
        routeLabel:'Yearbook 3-page TEST - AP Office Copier',
        endpointId:cfg.ENDPOINT_ID,endpointType:'CHROMEOS_BROWSER',
        bindingKey:cfg.ROUTE,mediaProfileId:cfg.PROFILE,rendererId:cfg.RENDERER,
        claim:{claimId,claimedAt:when.toISOString(),
          leaseExpiresAt:new Date(when.getTime()+600000).toISOString()},
        pdfBase64:encoded,title:'YEARBOOK TEST - 3 pages - US LETTER'};
    }
    return null;
  }finally{lock.releaseLock();}
}

// Must be invoked only AFTER authenticated printHubEndpointComplete_ checks.
function ybLetterTestCompleteHook_(body) {
  const cfg=YB_LETTER_PRINT_TEST;
  if(String(body&&body.printJobId||'')!==cfg.JOB_ID)return null;
  const status=String(body.status||'').trim().toUpperCase();
  if(!['PRINT_INVOKED','PRINTED','FAILED'].includes(status))throw new Error('Invalid yearbook test status.');
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    const sheet=ybLetterQueueSheet_(),rows=sheet.getDataRange().getValues();
    for(let i=1;i<rows.length;i++){
      if(String(rows[i][0])!==cfg.JOB_ID)continue;
      if(String(body.claimId||'')!==String(rows[i][4]||''))throw new Error('Incorrect claim ID.');
      if(String(rows[i][2])==='PRINTED')return {ok:true,status:'PRINTED'};
      sheet.getRange(i+1,3).setValue(status);
      if(status==='PRINT_INVOKED')sheet.getRange(i+1,7).setValue(new Date());
      else sheet.getRange(i+1,8).setValue(new Date());
      sheet.getRange(i+1,9).setValue(String(body.detail||body.errorMessage||
        ('ChromeOS reported '+status)).slice(0,400));
      return {ok:true,jobId:cfg.JOB_ID,status};
    }
    throw new Error('Yearbook test not found.');
  }finally{lock.releaseLock();}
}

function ybLetterQueueSheet_() {
  const cfg=YB_LETTER_PRINT_TEST;
  const book=SpreadsheetApp.openById(cfg.SPREADSHEET_ID);
  let sheet=book.getSheetByName(cfg.QUEUE_SHEET);
  if(!sheet){
    sheet=book.insertSheet(cfg.QUEUE_SHEET);
    sheet.getRange(1,1,1,cfg.HEADERS.length).setValues([cfg.HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}
