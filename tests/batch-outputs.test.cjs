const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),test=require('node:test');
const read=p=>fs.readFileSync(__dirname+'/../'+p,'utf8');
function backend(){
 const properties=new Map(),sheets=new Map(),txs=[],jobs=[];
 function sheet(name){const rows=[];const s={rows,getLastRow:()=>rows.length,setFrozenRows(){},getDataRange:()=>({getValues:()=>rows.map(r=>r.slice())}),getRange:(row,col,n=1,m=1)=>({setValues(values){values.forEach((r,i)=>{rows[row-1+i]||=[];r.forEach((v,j)=>rows[row-1+i][col-1+j]=v)})},setValue(v){rows[row-1]||=[];rows[row-1][col-1]=v},getDisplayValues:()=>Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>String(rows[row-1+i]?.[col-1+j]||''))),getDisplayValue:()=>String(rows[row-1]?.[col-1]||'')})};sheets.set(name,s);return s;}
 const helper=sheet('Helper');helper.rows[2]=Array(9).fill('');helper.rows[2][8]='Printer Preferences';helper.rows[3]=['','','ME','','','','','YES','MAIN|MAIN|MAIN|MAIN|MAIN|MAIN'];
 const session={username:'ME',deviceId:'D',printerKey:'MAIN'},cfg={sources:{timeZone:'America/Los_Angeles'},printers:['MAIN','AP_COPIER','AP_TARDY','BACK_OFFICE','RECEIPT2','CAFE_TARDY'].map(key=>({key}))};
 const students={1:{firstName:'Zoe',lastName:'Alpha'},2:{firstName:'Amy',lastName:'Alpha'},3:{firstName:'Alex',lastName:'Zulu'}};
 class FixedDate extends Date{constructor(...args){super(...(args.length?args:['2026-10-11T04:00:00Z']))}}
 let recorded=0;
 const c=vm.createContext({console,Date:FixedDate,PK:{HELPER_SHEET:'Helper',TRANSACTIONS_SHEET:'Transactions',PRINT_JOBS_SHEET:'Print_Jobs',TIME_ZONE_FALLBACK:'America/Los_Angeles'},
  requireSession_:()=>session,normalizeUsername_:s=>String(s).toUpperCase(),readHelperConfig_:()=>cfg,getStudentMap_:()=>students,
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>properties.get(k),setProperty:(k,v)=>properties.set(k,v)})},
  LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},SpreadsheetApp:{flush(){}},
  passSheet_:()=>({getSheetByName:n=>sheets.get(n),insertSheet:sheet}),hashText_:s=>s,
  readSheetRecords_:()=>txs,serializeRecord_:tx=>({...tx}),signaturePayload_:()=>({mimeType:'image/png',base64:'AA=='}),
  Utilities:{formatDate:(date,tz)=>new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(date)},
  makePrintJobRow_:(id,now,s)=>({'Transaction ID':id,'Printer Key':s.printerKey}),appendMappedRows_:(name,rows)=>{assert.equal(name,'Print_Jobs');jobs.push(...rows)},
  pdfEmailEnabled_:()=>true,detentionOfficePair_:()=>({}),
  recordEmailWorkflow_:(s,req,print)=>{assert.equal(print,false);assert.equal(s.printerKey,'');recorded++;return {ok:true,created:[{transactionId:'TX1',studentName:'Zoe Alpha'}],errors:[],createdCount:1,errorCount:0}}
 });
 vm.runInContext(read('apps-script/UserPreferences.gs'),c);vm.runInContext(read('apps-script/BatchOutputs.gs'),c);
 return {c,txs,jobs,properties,sheets,session,cfg,students,get recorded(){return recorded}};
}
test('PDF Add retries are idempotent, do not print, and reject changed IDs or mixed duplicate destinations',()=>{
 const f=backend(),request={outputRequestId:'request-123',workflow:'PASS',deviceId:'D',printerKey:'DL_PDF_HALF',studentIds:['1']};
 assert.equal(f.c.addPdfWorkflow_('T',request).createdCount,1);assert.equal(f.c.addPdfWorkflow_('T',request).createdCount,1);
 assert.equal(f.recorded,1);assert.equal(f.jobs.length,0);
 assert.throws(()=>f.c.addPdfWorkflow_('T',{...request,printerKey:'DL_PDF_QUARTER'}),/cannot be reused/);
 assert.throws(()=>f.c.addPdfWorkflow_('T',{...request,outputRequestId:'request-456',data:{printDuplicate:true}}),/cannot also/);
 f.c.recordEmailWorkflow_=()=>{throw Error('write interrupted')};assert.throws(()=>f.c.addPdfWorkflow_('T',{...request,outputRequestId:'request-789'}),/interrupted/);
 assert.throws(()=>f.c.addPdfWorkflow_('T',{...request,outputRequestId:'request-789'}),/Recording is not confirmed/);
});
test('grouped PDF sorting uses full names and delivery period and numeric room, never requested destination',()=>{
 const f=backend();
 const tx=(id,w,s,p='',room='')=>({'Transaction ID':id,Workflow:w,'Student ID':s,'Session Username':'ME','Delivery Period':p,'Delivery Room':room,Destination:'Ignore this'});
 f.txs.push(tx('Z','PASS','3'),tx('A','PASS','1'),tx('B','PASS','2'),tx('R3','RQST','1','P2','10'),tx('R2','RQST','1','P2','2'),tx('R1','RQST','3','P1','300'),tx('D','DET','3'));
 const result=f.c.getPdfBatch_('T',['R3','D','B','Z','R2','A','R1']);
 assert.deepEqual(Array.from(result.transactions,x=>x['Transaction ID']),['B','A','Z','R1','R2','R3','D']);
 f.txs[0]['Session Username']='OTHER';assert.throws(()=>f.c.getPdfBatch_('T',['Z']),/belongs/);
 f.txs[1].Status='VOID';assert.throws(()=>f.c.getPdfBatch_('T',['A']),/void/);
});
test('today filing includes both detention types and all issuers by CREATED local date; sorted jobs never assign again',()=>{
 const f=backend(),today='2026-10-11T00:30:00Z';
 const tx=(id,w,s,grade,at=today)=>({'Transaction ID':id,Workflow:w,'Student ID':s,Grade:grade,'Created At':at,'Detention Date':'2026-11-12','Session Username':'OTHER'});
 f.txs.push(tx('8','DET','2','8'),tx('6Z','LUNCH_DET','3','6'),tx('6A','DET','1','6'),tx('6B','LUNCH_DET','2','6'),tx('OLD','DET','1','6','2026-10-10T06:00:00Z'),tx('RQ','RQST','1','6'));
 f.txs.push({...tx('VOID','DET','1','6'),Status:'VOID'});
 const result=f.c.getTodaysDetentions_('T');assert.equal(result.date,'2026-10-10');assert.deepEqual(Array.from(result.transactions,x=>x['Transaction ID']),['6B','6A','6Z','8']);
 assert.equal(f.c.printTodaysDetentions_('T','AP_COPIER','filing-request-1').count,4);
 assert.deepEqual(f.jobs.map(x=>x['Transaction ID']),['6B','6A','6Z','8']);
 f.c.printTodaysDetentions_('T','AP_COPIER','filing-request-1');assert.equal(f.jobs.length,4);assert.equal(f.recorded,0);assert.equal(f.txs.length,7);
});
test('duplicate mode, pair, prior individual and filing preference persist independently; bus default honors explicit overrides',()=>{
 const f=backend();assert.equal(f.c.userPrinterPreferences_('ME').workflows.BUS,'CAFE_TARDY');
 f.c.savePrinterPreference_('T','BUS','MAIN');assert.equal(f.c.userPrinterPreferences_('ME').workflows.BUS,'MAIN');
 f.c.saveOutputPreference_('T','DET',{enabled:true,pair:'AP',previousPrinterKey:'MAIN'});
 f.c.saveOutputPreference_('T','LUNCH_DET',{enabled:true,pair:'BACK',previousPrinterKey:'RECEIPT2'});
 f.c.saveOutputPreference_('T','FILING',{printerKey:'DL_PDF_QUARTER'});
 f.c.saveOutputPreference_('T','DET',{enabled:false,pair:'AP',previousPrinterKey:'MAIN'});
 const prefs=f.c.userPrinterPreferences_('ME');assert.equal(prefs.outputPreferences.detention.DET.enabled,false);assert.equal(prefs.outputPreferences.detention.LUNCH_DET.pair,'BACK');assert.equal(prefs.outputPreferences.filingPrinterKey,'DL_PDF_QUARTER');assert.equal(prefs.workflows.DET,'MAIN');
});
function client(){const c=vm.createContext({console,TextEncoder,Uint8Array,Map,Blob,URL,atob,btoa,window:{},navigator:{},document:{addEventListener(){},getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[]},setTimeout,clearTimeout,setInterval:()=>0,clearInterval,localStorage:{getItem:()=>null,setItem(){}},crypto:{randomUUID:()=> 'request-123'}});for(const file of ['js/app-core.js','js/app-camera-utils.js','js/app-class-routing.js','js/pass-pdf-templates.js','js/app-pdf-batch.js'])vm.runInContext(read(file),c);const run=s=>vm.runInContext(s,c);run("state.session={username:'ME'};state.token='T';state.lane='DET';state.bootstrap={adults:[],printers:['MAIN','AP_COPIER','AP_TARDY','BACK_OFFICE','RECEIPT2'].map(key=>({key,friendlyName:key}))};state.laneValues={DET:{printerKey:'MAIN',duplicate:{enabled:false,pair:'',previousPrinterKey:'MAIN'}},LUNCH_DET:{printerKey:'AP_TARDY',duplicate:{enabled:false}}};state.printerPreferenceBusy={};");c.toast=()=>{};return {c,run};}
test('duplicate UI selects correct sets, blocks missing pair, and PDF mode exposes Add and Download controls',()=>{
 const f=client();assert.equal(f.c.duplicateChoiceForPrinter('AP_COPIER'),'AP');assert.equal(f.c.duplicateChoiceForPrinter('RECEIPT2'),'BACK');assert.equal(f.c.duplicateChoiceForPrinter('MAIN'),'');
 f.run("state.laneValues.DET.duplicate={enabled:true,pair:'',previousPrinterKey:'MAIN'}");assert.throws(()=>f.c.withLaneChoices({workflow:'DET'}),/Select a Printer Set/);let html=f.c.formActionsHtml('DET','submitDetention(false)');assert.match(html,/Select a Printer Set/);assert.doesNotMatch(html,/<option value="MAIN"/);
 f.run("state.laneValues.DET.duplicate.pair='AP'");const req=f.c.withLaneChoices({workflow:'DET'});assert.equal(req.printerKey,'AP_COPIER');assert.equal(req.data.detentionOffice,'AP');
 f.run("state.laneValues.DET.duplicate.enabled=false;state.laneValues.DET.printerKey='DL_PDF_HALF'");html=f.c.formActionsHtml('DET','submitDetention(false)');assert.match(html,/title="Add to PDF"/);assert.match(html,/title="Ready to download"/);assert.match(html,/DL PDF ¼ Sheet/);
});
test('Letter half and quarter PDFs compose the approved templates and start each pass type on a new page',async()=>{
 const f=client(),tx=(id,w)=>({'Transaction ID':id,Workflow:w,'Student Name':'Synthetic Example','Student ID':'TEST',Grade:'6',From:'Office',To:'P2 Room 602',Destination:'Office',When:'Now','Delivery Period':'P2','Delivery Room':'602','Issued By':'J. Example','Detention Date':'2026-10-12','Report To':'Room 602','Reason(s)':'Tardy','Created At':'2026-10-10T17:00:00Z'});
 for(const [key,count,pages] of [['DL_PDF_HALF',3,2],['DL_PDF_QUARTER',5,2]]){const pdf=await f.c.buildBatchPdf(Array.from({length:count},(_,i)=>tx('T'+i,'PASS')),key);assert.equal(pdf.pageCount,pages);assert.match(Buffer.from(pdf.bytes).toString(),/MediaBox \[0 0 612 792\]/);}
 const mixed=await f.c.buildBatchPdf([tx('P','PASS'),tx('R','RQST')],'DL_PDF_QUARTER');assert.equal(mixed.pageCount,2);
 const filing=await f.c.buildBatchPdf([tx('D','DET'),tx('L','LUNCH_DET')],'DL_PDF_HALF',{filing:true});assert.equal(filing.pageCount,1);
 const image={width:2,height:2,grayHex:'00ffffff'};f.run('PKPassPdf.rasterizeSignature=async()=>('+JSON.stringify(image)+')');
 const signed=await f.c.buildBatchPdf([{...tx('SIGN','PASS'),'Signature File':'test.png','Signature Payload':{mimeType:'image/png',base64:'TEST'}}],'DL_PDF_HALF');assert.match(Buffer.from(signed.bytes).toString(),/Subtype \/Image/);
});
