const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const read=p=>fs.readFileSync(require('path').join(__dirname,'..',p),'utf8');
const source=read('apps-script/PdfEmail.gs');
const rpc=read('apps-script/SecureRpc.gs');
function harness(){
 const deliveries=new Map(),transactions=[],errors=[],mail=[],rendered=[];
 let uuid=0,quota=10,failRender=false,failMail=false,failRecord=false,activeEmail='operator@nv.ccsd.net';
 const session={username:'OPERATOR',displayName:'Actual Operator',deviceId:'DEVICE',emailAuthMode:'STAFF',emailAuthenticatedAddress:'operator@nv.ccsd.net'};
 const adults={OPERATOR:{username:'OPERATOR',displayName:'Actual Operator',active:true,email:'operator@nv.ccsd.net'},APPROVER:{username:'APPROVER',displayName:'Different Approver',active:true,email:'approver@nv.ccsd.net'}};
 const cfg={sources:{schoolName:'Test school',timeZone:'America/Los_Angeles'},printers:[]};
 const c=vm.createContext({console,Logger:{log(){}},PK:{TRANSACTIONS_SHEET:'Transactions',ERRORS_SHEET:'Processing_Errors',TIME_ZONE_FALLBACK:'America/Los_Angeles'},
  PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'true'})},
  LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},SpreadsheetApp:{flush(){}},
  Session:{getActiveUser:()=>({getEmail:()=>activeEmail})},
  Utilities:{getUuid:()=>String(++uuid).padStart(32,'0'),formatDate:(d,t,f)=>f==='MMMM d, yyyy'?'October 6, 2026':'October 5, 2026 1:00 PM'},
  MailApp:{getRemainingDailyQuota:()=>quota,sendEmail:m=>{mail.push(m);if(failMail)throw Error('Mail interrupted');}},
  getActiveAdultByUsername_:u=>adults[String(u).toUpperCase()]||null,
  normalizeUsername_:v=>String(v).trim().toUpperCase().replace(/@NV\.CCSD\.NET$/i,''),
  requireSession_:()=>session,putSession_:s=>Object.assign(session,s),
  readHelperConfig_:()=>cfg,getStudentMap_:()=>({'1':{studentId:'1',firstName:'One',lastName:'Student'},'2':{studentId:'2',firstName:'Two',lastName:'Student'}}),
  normalizeStudentId_:v=>String(v||'').trim(),hashText_:v=>require('crypto').createHash('sha256').update(v).digest('hex'),randomId_:()=>String(++uuid).padStart(8,'0'),
  processingError_:(code,message,stage)=>Object.assign(Error(message),{code,pkProcessing:true,stage}),
  makeProcessingErrorRow_:(tid,n,s,w,student,stage,code,msg)=>({'Transaction ID':tid,'Student ID':student.studentId,'Student Name':student.firstName||'','Error Message':msg}),
  appendMappedRows_:(name,rows)=>{if(name==='Email_Deliveries')rows.forEach(r=>deliveries.set(r['Delivery ID'],{record:{...r}}));else if(name==='Transactions')transactions.push(...rows);else if(name==='Processing_Errors')errors.push(...rows);else throw Error('Unexpected print queue write: '+name);},
  readSheetRecords_:name=>name==='Transactions'?transactions:name==='Email_Deliveries'?[...deliveries.values()].map(x=>x.record):[],
  buildTransaction_:(tid,now,s,w,student,data,config,ds,bulk)=>{if(failRecord)throw Error('builder failed');return {'Transaction ID':tid,'Created At':now,Status:'CREATED','Device ID':s.deviceId,'Session Username':s.username,'Session User':s.displayName,Workflow:w,'Student ID':student.studentId,'Student Name':student.firstName+' '+student.lastName,From:data.from,To:data.toOverride,'Requested By':'Different Approver','Delivery Period':'P3','Delivery Room':'123','Delivery Teacher':'Teacher',Destination:data.destination,When:data.when,'At Time':data.atTime,'Detention Date':new Date(),'Report To':data.reportTo,'Directions Snapshot':'Bring your work','Issued By':'Different Issuer'};},
  getDetentionState_:()=>({counts:{},studentDates:{}}),valueToDateKey_:()=> '2026-10-06',
  submitBusWorkflow_:(t,r)=>{const tx={'Transaction ID':'BUS-'+ ++uuid,'Created At':new Date(),Status:'CREATED',Workflow:'BUS','Device ID':session.deviceId,'Session Username':session.username,'Session User':session.displayName,'Student ID':r.studentId,'Student Name':'Bus Student','Approved By':'Different Approver','Bus Assignment Count':2,'Bus Route(s)':'Route A\nRoute B','Bus Drop-off(s)':'Stop A\nStop B','Bus Snapshot':'#1 school time A\n#2 school time B','Bus Scan Type':r.allowDuplicate?'DUPLICATE':'NORMAL','Duplicate Of Transaction ID':r.allowDuplicate?'ORIGINAL':''};transactions.push(tx);return {ok:true,transactionId:tx['Transaction ID'],studentId:r.studentId,assignments:[{route:'A'},{route:'B'}],printingQueued:false};}
 });
 vm.runInContext(read('apps-script/UserPreferences.gs'),c);vm.runInContext(read('apps-script/WorkflowOptions.gs'),c);vm.runInContext(source,c);vm.runInContext(rpc,c);
 c.userPrinterPreferences_=()=>({initialized:false,defaultPrinterKey:'',workflows:{}});
 const realRenderer=c.buildPdfEmailAttachment_;
 c.emailSheet_=()=>({});c.findEmailDelivery_=id=>deliveries.get(id)||null;
 c.updateEmailDelivery_=(e,v)=>Object.assign(e.record,v,{'Updated At':new Date()});
 c.buildPdfEmailAttachment_=(txs,errs,config,id)=>{if(failRender)throw Error('PDF conversion failed');rendered.push({txs,errs,id});return {getBytes:()=>[37,80,68,70]};};
 return {c,realRenderer,session,transactions,errors,mail,rendered,deliveries,setQuota:v=>quota=v,setRenderFailure:v=>failRender=v,setMailFailure:v=>failMail=v,setActive:v=>activeEmail=v};
}
const req=(workflow='PASS',overrides={})=>({workflow,deviceId:'DEVICE',emailRequestId:'0123456789abcdef-'+workflow.replaceAll('_','-'),studentIds:['1'],data:{from:'Office',toOverride:'Room 101',destination:'Counselor',when:'At:',atTime:'13:45',reportTo:'Library'},...overrides});
// Normal, bulk, workflow semantics, recipient separation and no print jobs.
for(const workflow of ['PASS','RQST','DET','LUNCH_DET']){
 const h=harness(),r=req(workflow);const result=h.c.submitEmailWorkflow_('token',r);
 assert.equal(result.ok,true);assert.equal(result.emailDelivery.status,'SENT');assert.equal(h.transactions.length,1);assert.equal(h.mail.length,1);assert.equal(h.mail[0].to,'operator@nv.ccsd.net');
 const replay=h.c.submitEmailWorkflow_('token',r);assert.equal(replay.emailDelivery.status,'SENT');assert.equal(h.transactions.length,1);assert.equal(h.mail.length,1);
 const f=h.c.pdfEmailFields_(h.transactions[0],{sources:{}});if(workflow==='RQST')assert.equal(f.find(x=>x[0]==='When')[1],'At 1:45 PM');if(workflow==='DET')assert.ok(f.some(x=>x[0]==='Important'&&x[1]==='Bring your work'));
 assert.throws(()=>h.c.submitEmailWorkflow_('token',{...r,data:{from:'changed'}}),/reused/);
}
{
 const h=harness(),result=h.c.submitEmailWorkflow_('t',req('RQST',{bulk:true,studentIds:['1','2','999','1']}));
 assert.equal(result.createdCount,2);assert.equal(result.errorCount,1);assert.equal(h.rendered[0].txs.length,2);assert.equal(h.rendered[0].errs.length,1);assert.equal(h.mail.length,1);assert.equal(h.errors.length,1);
}
{
 const h=harness();h.c.submitEmailWorkflow_('t',req('BUS',{studentIds:undefined,studentId:'1',approvedByUsername:'APPROVER',allowDuplicate:true}));
 assert.equal(h.mail[0].to,'operator@nv.ccsd.net');const f=h.c.pdfEmailFields_(h.transactions[0],{sources:{}});
 assert.equal(f.find(x=>x[0]==='Transportation snapshot')[1],'#1 school time A\n#2 school time B');assert.equal(f.find(x=>x[0]==='Duplicate of')[1],'ORIGINAL');
}
// Linked requests are included once in the same email, without default physical jobs.
{
 const h=harness();h.c.detentionPickupData_=()=>({destination:'Office',when:'At:',atTime:'13:31',deliveryMode:'PERIOD',deliveryPeriod:'P6'});
 const r=req('DET');r.data.createPickupRequest=true;
 const res=h.c.submitEmailWorkflow_('t',r);
 assert.equal(res.createdCount,1);assert.equal(h.transactions.length,2);assert.equal(h.rendered[0].txs.length,2);
 assert.equal(h.rendered[0].txs[1].Workflow,'RQST');assert.equal(h.mail.length,1);
 h.c.submitEmailWorkflow_('t',r);assert.equal(h.transactions.length,2);assert.equal(h.mail.length,1);
}
// Recoverable failures retry only saved documents, not student transactions.
for(const reason of ['quota','render']){
 const h=harness();reason==='quota'?h.setQuota(0):h.setRenderFailure(true);
 const r=h.c.submitEmailWorkflow_('t',req());assert.equal(r.emailDelivery.status,'FAILED');assert.equal(r.createdCount,1);assert.equal(h.transactions.length,1);assert.equal(h.mail.length,0);
 h.setQuota(10);h.setRenderFailure(false);const d=h.c.retryPdfEmail_('t','DEVICE',r.emailDelivery.deliveryId);
 assert.equal(d.status,'SENT');assert.equal(h.transactions.length,1);assert.equal(h.mail.length,1);
 h.c.retryPdfEmail_('t','DEVICE',r.emailDelivery.deliveryId);assert.equal(h.mail.length,1);
}
{
 const h=harness();h.setMailFailure(true);const r=h.c.submitEmailWorkflow_('t',req());assert.equal(r.emailDelivery.status,'SEND_UNCONFIRMED');assert.equal(r.emailDelivery.canRetry,false);
 h.setMailFailure(false);h.c.retryPdfEmail_('t','DEVICE',r.emailDelivery.deliveryId);assert.equal(h.mail.length,1);assert.equal(h.transactions.length,1);
}
// Every pass PDF shows an Excused checkbox: checked only for a saved true.
{
 const h=harness();for(const value of [true,false,'']){const fields=h.c.pdfEmailFields_({Workflow:'PASS',Excused:value},{sources:{}});const field=fields.find(x=>x[0]==='Excused');assert.ok(field);assert.equal(field[1],value===true?'☑':'☐');}
}
// Owner/device isolation, current-user recipient and persistent reservation.
{
 const h=harness(),r=req();h.setActive('approver@nv.ccsd.net');assert.throws(()=>h.c.submitEmailWorkflow_('t',r),/session owner/);assert.equal(h.transactions.length,0);
 h.setActive('operator@nv.ccsd.net');assert.throws(()=>h.c.submitEmailWorkflow_('t',{...r,deviceId:'OTHER'}),/Device mismatch/);
 assert.throws(()=>h.c.submitEmailWorkflow_('t',{...r,studentIds:Array(101).fill('1')}),/100/);
 h.c.submitEmailWorkflow_('t',r);const id='PE-'+r.emailRequestId;assert.throws(()=>h.c.retryPdfEmail_('t','OTHER',id),/Device mismatch/);
 const e=h.deliveries.get(id);e.record.Status='RECORDING';e.record['Result JSON']='';const replay=h.c.submitEmailWorkflow_('t',r);assert.equal(replay.ok,false);assert.equal(h.transactions.length,1);
 h.session.emailAuthMode='KIOSK';assert.throws(()=>h.c.staffRpc('getRecentPdfEmails',['t','DEVICE']),/authenticated staff session/);
 h.session.emailAuthMode='STAFF';h.session.username='APPROVER';assert.throws(()=>h.c.staffRpc('getRecentPdfEmails',['t','DEVICE']),/authenticated staff session/);
}
// Real renderer: page geometry, resolved details, page breaks, signature warning,
// PDF conversion and source cleanup, including conversion failures.
{
 const h=harness(),paragraphs=[],geometry={},files=[];let breaks=0,trash=0,fail=false;
 const para=t=>{paragraphs.push(t);const text={setFontSize:()=>text,setForegroundColor:()=>text,setBold:()=>text};const p={setHeading:()=>p,setSpacingAfter:()=>p,editAsText:()=>text};return p;};
 const body={appendParagraph:para,appendPageBreak:()=>breaks++};for(const k of ['PageWidth','PageHeight','MarginTop','MarginBottom','MarginLeft','MarginRight'])body['set'+k]=v=>{geometry[k]=v;return body};
 h.c.DocumentApp={create:()=>({getId:()=> 'DOC',getBody:()=>body,saveAndClose(){}}),ParagraphHeading:{HEADING1:'H1'}};
 h.c.DriveApp={getFileById:()=>({getAs:type=>{if(fail)throw Error('Conversion failed');files.push(type);return {setName:name=>({name})}},setTrashed:v=>{assert.equal(v,true);trash++}})};
 h.c.signaturePayload_=()=>null;
 const txs=[{Workflow:'PASS','Student Name':'Student A',From:'Office',To:'Class','Transaction ID':'PK-1'},{Workflow:'BUS','Student Name':'Student B','Bus Assignment Count':2,'Bus Snapshot':'#1 A\n#2 B','Signature File':'missing.png'}];
 h.realRenderer(txs,[{studentId:'999',message:'Not found'}],{sources:{schoolName:'Test'}},'ID');
 assert.equal(geometry.PageWidth,612);assert.equal(geometry.PageHeight,792);assert.equal(breaks,2);assert.equal(trash,1);assert.equal(files[0],'application/pdf');assert.ok(paragraphs.includes('Transportation snapshot: #1 A\n#2 B'));assert.ok(paragraphs.some(x=>x.includes('Signature image unavailable')));
 fail=true;assert.throws(()=>h.realRenderer(txs,[],{sources:{}},'FAIL'),/Conversion failed/);assert.equal(trash,2);
}
console.log('PDF email: workflows, bulk errors, snapshots, recipient isolation, idempotency, failed delivery retry and uncertain-send protection passed.');
async function clientChecks(){
 function client(){
  const button={disabled:false,textContent:'Send',dataset:{},isConnected:true},notice={className:'hidden',innerHTML:''};
  const nodes={emailDeliveryNotice:notice};let calls=[],resets=0,uuid=0;
  const c=vm.createContext({console,window:{},navigator:{},crypto:{randomUUID:()=> '01234567-89ab-cdef-0123-'+String(++uuid).padStart(12,'0')},
    setTimeout,clearTimeout,setInterval,clearInterval,document:{addEventListener(){},querySelectorAll:()=>[button],getElementById:id=>nodes[id]||{classList:{add(){},remove(){}}}}});
  for(const p of ['js/app-core.js','js/app-email.js','js/app-detention-settings.js','js/app-camera-utils.js'])vm.runInContext(read(p),c);
  const run=js=>vm.runInContext(js,c);
  run("state.token='T';state.deviceId='DEVICE';state.lane='PASS';state.laneValues.PASS={printerKey:'P'};state.bootstrap={printers:[{key:'P'}]};state.outputMode='EMAIL';state.pdfEmail={enabled:true,recipient:'operator@nv.ccsd.net',maxStudents:100};state.bulk=true;state.basket=[{studentId:'1'}];");
  c.toast=()=>{};c.resetAfterSend=()=>resets++;
  c.server=async(...args)=>{calls.push(args);return {ok:true,createdCount:1,errorCount:0,created:[{transactionId:'PK-1',studentId:'1'}],errors:[],emailDelivery:{deliveryId:'PE-ID',status:'FAILED',recipient:'operator@nv.ccsd.net',message:'PDF conversion failed',canRetry:true}};};
  return {c,run,button,notice,calls,resets:()=>resets};
 }
 {
  const h=client();await h.c.submitLane(req());assert.equal(h.calls[0][0],'submitEmailWorkflow');assert.match(h.calls[0][2].emailRequestId,/01234567/);assert.equal(h.resets(),1);assert.ok(h.notice.innerHTML.includes('Recorded — PDF email needs attention'));assert.equal(h.button.disabled,false);
 }
 {
  const h=client();h.c.server=async()=>{throw Error('Network lost')};await h.c.submitLane(req());assert.equal(h.resets(),0);assert.ok(h.notice.innerHTML.includes('check the original submission'));assert.equal(h.run('state.basket.length'),1);
 }
 {
  const h=client();h.run("state.outputMode='PRINT'");await h.c.submitLane(req());assert.equal(h.calls[0][0],'submitWorkflow');assert.equal(h.calls[0][2].emailRequestId,'0123456789abcdef-PASS');
 }
 {
  const h=client();await h.c.submitLane(req('PASS',{studentIds:Array(101).fill('1')}));assert.equal(h.calls.length,0);assert.equal(h.resets(),0);
 }
 assert.ok(read('index.html').includes('js/app-email.js'));assert.ok(read('sw.js').includes('./js/app-email.js'));
 console.log('PDF email client: alternate RPC, recorded-versus-delivery feedback, uncertain response recovery, preflight limit and cached script passed.');
}
clientChecks().catch(e=>{console.error(e);process.exitCode=1});


// Combined output records each document once and queues from that same transaction.
for(const workflow of ['PASS','RQST','DET','LUNCH_DET']){
 const h=harness(),jobs=[];
 h.c.PK.PRINT_JOBS_SHEET='Print_Jobs';
 h.c.getPrinterForSession_=()=>({key:'AP_COPIER'});
 h.c.makePrintJobRow_=(tid,now,session)=>({'Transaction ID':tid,'Printer Key':session.printerKey});
 const append=h.c.appendMappedRows_;
 h.c.appendMappedRows_=(name,rows)=>name==='Print_Jobs'?jobs.push(...rows):append(name,rows);
 const r=req(workflow,{includePhysicalPrint:true});
 const result=h.c.submitEmailWorkflow_('t',r);
 assert.equal(result.printingQueued,true);assert.equal(h.transactions.length,1);assert.equal(jobs.length,1);assert.equal(h.mail.length,1);
 assert.equal(jobs[0]['Transaction ID'],h.transactions[0]['Transaction ID']);
 h.c.submitEmailWorkflow_('t',r);assert.equal(jobs.length,1);assert.equal(h.mail.length,1);
 h.c.retryPdfEmail_('t','DEVICE',result.emailDelivery.deliveryId);assert.equal(jobs.length,1);
 assert.throws(()=>h.c.submitEmailWorkflow_('t',req(workflow,{includePhysicalPrint:'true'})),/Invalid physical/);
}
{
 const h=harness(),jobs=[];
 h.c.PK.PRINT_JOBS_SHEET='Print_Jobs';
 h.c.getPrinterForSession_=()=>({key:'MAIN_COPIER'});
 h.c.readHelperConfig_=()=>({sources:{},printers:[{key:'AP_COPIER'},{key:'AP_TARDY'}]});
 h.c.makePrintJobRow_=(tid,now,session)=>({'Transaction ID':tid,'Printer Key':session.printerKey});
 h.c.detentionPickupData_=()=>({destination:'Office'});
 const append=h.c.appendMappedRows_;h.c.appendMappedRows_=(name,rows)=>name==='Print_Jobs'?jobs.push(...rows):append(name,rows);
 const r=req('DET',{includePhysicalPrint:true});r.data.detentionOffice='AP';r.data.createPickupRequest=true;
 const result=h.c.submitEmailWorkflow_('t',r);
 assert.equal(h.transactions.length,2);assert.equal(jobs.length,3);assert.equal(h.mail.length,1);
 assert.deepEqual(jobs.map(j=>j['Printer Key']),['AP_TARDY','AP_COPIER','AP_COPIER']);
 assert.equal(h.rendered[0].txs.length,2);h.c.submitEmailWorkflow_('t',r);assert.equal(jobs.length,3);
}
