const PK_BUILD='0.3.21-help-printers';
const outputSelection={printerKey:'',email:false,busy:false};
let staffSignInUrl='', staffSignInBusy=false;
const state={front:null,identified:null,authMode:null,token:null,bootstrap:null,session:null,lane:null,deviceId:null,outputMode:'PRINT',pdfEmail:null,bulk:false,student:null,studentDetails:null,studentEpoch:0,studentLoading:false,studentLookupError:'',detentionEpoch:0,detentionLoading:false,basket:[],laneValues:{},currentPrinter:null,recentJobs:[],pendingReprint:null,detentionAvailability:null,requestDeliveryMode:'AUTO',requestDeliveryPeriod:'',requestWhen:'',detentionDate:'',submitting:false,busInfo:null,busOverride:null,busResetTimer:null,busCountdownTimer:null,busBusy:false,busEpoch:0,busWritePending:false,camera:{devices:[],selectedDeviceId:'',opening:false,requestId:0,stream:null,raf:null,lastCode:'',lastAt:0,lastSeenAt:0}};
const appStorage={memory:new Map(),getItem(key){try{return localStorage.getItem(key)||this.memory.get(key)||null}catch(_){return this.memory.get(key)||null}},setItem(key,value){this.memory.set(key,String(value));try{localStorage.setItem(key,value)}catch(_){}}};
document.addEventListener('DOMContentLoaded',init);

async function init(){
  if(window.PASSKIOSK_EMBEDDED_BRIDGE)return;
  state.deviceId=getDeviceId();
  try{
    state.authMode=await PassKioskBridge.mode();
    if(window.PASSKIOSK_NATIVE_STAFF){
      await completeStaffSignIn();
    }else if(state.authMode==='staff'){
      staffSignInUrl=await PassKioskBridge.signInUrl();
      showStaffSignIn();
    }else{
      await PassKioskBridge.ready();
      state.front=await server('getFrontDoorConfig');
      showKioskIdentityPrompt();
    }
  }catch(err){
    showFrontDoorError(err.message||'PassKiosk backend is not available.');
  }
}

function showStaffSignIn(message=''){
  const pane=document.getElementById('identityLoadingPane');
  pane.classList.remove('hidden');
  document.getElementById('identifyPane').classList.add('hidden');
  document.getElementById('printerPane').classList.add('hidden');
  pane.innerHTML='<div class="front-title">Sign in with your CCSD Google account</div>'+
    '<div class="muted">Continue with Google in this tab. Once signed in, your staff access is checked automatically.</div>'+
    (message?'<div class="lookup-error" role="alert">'+esc(message)+'</div>':'')+
    '<div class="submit-row"><a class="primary google-signin" href="'+attr(staffSignInUrl)+'" target="_top">Continue with Google</a></div>'+
    '<div class="small muted app-build">App '+PK_BUILD+'</div>';
}
async function completeStaffSignIn(){
  if(state.authMode!=='staff'||staffSignInBusy)return;
  staffSignInBusy=true;
  const pane=document.getElementById('identityLoadingPane');
  pane.innerHTML='<div class="front-title">Checking your access…</div>'+loadingHtml('Connecting your CCSD account to PassKiosk…');
  try{
    await PassKioskBridge.reconnect();
    const profile=await server('getAuthenticatedProfile');
    if(!profile||!profile.ok)throw new Error('Your signed-in CCSD account is not allowed to use PassKiosk.');
    state.front=await server('getFrontDoorConfig');
    state.identified=profile;
    await restorePrinterChoice(false);
  }catch(err){
    const raw=err.message||'Unable to check your access.';
    const message=/backend did not respond|bridge could not load/i.test(raw)
      ? 'Google sign-in has not connected to PassKiosk. Finish signing in in the Google tab, then continue here. If you already did, browser privacy settings or the school network may be blocking the connection.' : raw;
    if(window.PASSKIOSK_NATIVE_STAFF){
      pane.innerHTML='<div class="front-title">PassKiosk could not check your access.</div><div class="lookup-error" role="alert">'+esc(raw)+'</div><button class="secondary" onclick="completeStaffSignIn()">Retry access check</button><div class="small muted app-build">App '+PK_BUILD+'</div>';
    }else showStaffSignIn(message);
  }finally{staffSignInBusy=false}
}
function getDeviceId(){const k='PassKioskDeviceId';let id=appStorage.getItem(k);if(!id){id=(window.crypto&&crypto.randomUUID)?crypto.randomUUID():'PKD-'+Date.now()+'-'+Math.random().toString(36).slice(2);appStorage.setItem(k,id)}return id}
function server(fn,...args){return PassKioskBridge.call(fn,...args)}

async function restorePrinterChoice(allowChangeUser){
  const pref=state.identified.printerPreferences;
  if(!pref?.initialized){showPrinterSelection(allowChangeUser);return}
  const key=pref.defaultPrinterKey;
  if(key==='EMAIL_PDF'&&state.front.pdfEmail?.enabled){await enterEmailPassKiosk();return}
  if((state.front.printers||[]).some(p=>p.key===key)){await enterPassKiosk(key);return}
  state.repairDefaultPrinter=true;
  showPrinterSelection(allowChangeUser);
  toast('Your saved default printer is unavailable. Choose a replacement; your other tab choices will stay saved.',true,7000);
}

function selectedLanePrinterKey(lane=state.lane){
  return state.laneValues?.[lane]?.printerKey||state.printerPreferences?.defaultPrinterKey||state.currentPrinter?.key||'';
}
function printerForKey(key){
  if(key==='EMAIL_PDF')return {key,friendlyName:'PDF email only'};
  return (state.bootstrap?.printers||[]).find(p=>p.key===key)||null;
}
function syncLanePrinter(){
  if(!state.bootstrap||!state.session)return;
  state.currentPrinter=printerForKey(selectedLanePrinterKey());
  updateContext();
}
function helpAdult(lane){
  const v=state.laneValues?.[lane];
  const username=v?.helpUsername||v?.requestedByUsername||v?.issuedByUsername||v?.approvedByUsername||state.session?.username;
  return (state.bootstrap?.adults||[]).find(a=>a.username===username)||{username,displayName:state.session?.displayName||'',defaultLocation:state.session?.defaultLocation||''};
}
function adultDisplayHtml(lane,id){
  return '<input id="'+id+'" class="field" value="'+attr(helpAdult(lane).displayName)+'" readonly aria-readonly="true">';
}
function formActionsHtml(lane,action,disabled=false){
  const busy=Boolean(state.printerPreferenceBusy?.[lane]);
  const key=selectedLanePrinterKey(lane),printers=state.bootstrap?.printers||[];
  let options=printers.map(p=>'<option value="'+attr(p.key)+'" '+(p.key===key?'selected':'')+'>'+esc(p.friendlyName)+'</option>').join('');
  if(state.pdfEmail?.enabled)options+='<option value="EMAIL_PDF" '+(key==='EMAIL_PDF'?'selected':'')+'>PDF email only</option>';
  if(!printerForKey(key))options='<option value="'+attr(key)+'" selected disabled>'+esc(key?'Unavailable: '+key:'Choose a printer')+'</option>'+options;
  return '<div class="submit-row form-actions"><button class="primary" onclick="'+action+'" '+(disabled||busy?'disabled':'')+'>Send</button><label class="form-action-label">Help out: <select class="field" id="helpOut" onchange="setHelpOut(\''+lane+'\',this.value)">'+adultOptions(helpAdult(lane).username)+'</select></label><label class="form-action-label">Select printer <select class="field" id="lanePrinter" onchange="setLanePrinter(\''+lane+'\',this.value)" '+(busy?'disabled':'')+'>'+options+'</select></label><span id="printerSaveStatus" class="small muted" role="status">'+(busy?'Saving printer…':'')+'</span></div>';
}
function setHelpOut(lane,username){
  if(state.submitting||state.busWritePending)return;
  const adult=(state.bootstrap.adults||[]).find(a=>a.username===username);
  if(!adult)return;
  const v=state.laneValues[lane],loc=adult.defaultLocation||'';
  v.helpUsername=adult.username;
  const identity={PASS:'passIssuedBy',RQST:'rqRequestedBy',DET:'detIssuedBy',LUNCH_DET:'detIssuedBy',BUS:'busApprovedBy'}[lane];
  const display=document.getElementById(identity);if(display)display.value=adult.displayName;
  const fields=lane==='PASS'?{from:'passFrom'}:lane==='RQST'?{destination:'rqDestination'}:lane==='BUS'?{location:'busAdultLocation'}:{reportTo:'detReportTo',pickupDestination:'detPickupDestination'};
  for(const [field,id] of Object.entries(fields)){v[field]=loc;const el=document.getElementById(id);if(el)el.value=loc}
  if(lane==='RQST')v.requestedByUsername=adult.username;
  if(lane==='DET'||lane==='LUNCH_DET')v.issuedByUsername=adult.username;
  if(lane==='BUS')v.approvedByUsername=adult.username;
}
async function setLanePrinter(lane,key){
  if(state.submitting||state.busWritePending||state.printerPreferenceBusy?.[lane])return;
  const token=state.token;
  state.printerPreferenceBusy||={};state.printerPreferenceBusy[lane]=true;
  const selector=document.getElementById('lanePrinter'),status=document.getElementById('printerSaveStatus');
  if(selector)selector.disabled=true;if(status)status.textContent='Saving printer…';
  try{
    const res=await server('savePrinterPreference',token,lane,key);
    if(state.token!==token)return;
    if(!res?.ok||!res.printerPreferences?.workflows)throw new Error('Printer choice was not confirmed.');
    state.printerPreferences=res.printerPreferences;
    state.laneValues[lane].printerKey=res.printerPreferences.workflows[lane];
    if(state.lane===lane){syncLanePrinter();const current=document.getElementById('lanePrinter');if(current)current.value=state.laneValues[lane].printerKey;const notice=document.getElementById('printerSaveStatus');if(notice)notice.textContent='Printer saved';}
  }catch(err){
    if(state.token===token){toast('Printer was not saved. '+err.message,true);if(selector?.isConnected)selector.value=selectedLanePrinterKey(lane);if(status?.isConnected)status.textContent='Printer not saved';}
  }finally{
    if(state.token===token){state.printerPreferenceBusy[lane]=false;if(state.lane===lane){const current=document.getElementById('lanePrinter');if(current)current.disabled=false;document.querySelectorAll('#workspace .submit-row .primary').forEach(b=>{b.disabled=lane==='BUS'&&!activityBusEnabled()});}if(selector?.isConnected)selector.disabled=false;}
  }
}
function withLaneChoices(request,lane=request.workflow||state.lane){
  if(state.printerPreferenceBusy?.[lane])throw new Error('Wait for your printer choice to finish saving.');
  const key=selectedLanePrinterKey(lane);
  if(!printerForKey(key))throw new Error('Choose an available printer for this form.');
  const adult=helpAdult(lane);
  const data={...(request.data||{})};
  if(lane==='PASS'||lane==='RQST')data.requestedByUsername=adult.username;
  if(lane==='DET'||lane==='LUNCH_DET')data.issuedByUsername=adult.username;
  return {...request,printerKey:key,data,...(lane==='BUS'?{approvedByUsername:adult.username}:{})};
}

function showKioskIdentityPrompt(){
  document.getElementById('identityLoadingPane').classList.add('hidden');
  document.getElementById('printerPane').classList.add('hidden');
  document.getElementById('identifyPane').classList.remove('hidden');
  document.getElementById('changeUserButton').classList.add('hidden');
  const input=document.getElementById('usernameInput');
  input.value='';
  input.focus();
}
function showPrinterSelection(allowChangeUser){
  document.getElementById('identityLoadingPane').classList.add('hidden');
  document.getElementById('identifyPane').classList.add('hidden');
  document.getElementById('printerPane').classList.remove('hidden');
  document.getElementById('welcomeText').textContent='Welcome '+state.identified.displayName;
  document.getElementById('changeUserButton').classList.toggle('hidden',!allowChangeUser);
  renderFrontPrinters();
}
function showFrontDoorError(message){
  const pane=document.getElementById('identityLoadingPane');
  pane.classList.remove('hidden');
  document.getElementById('identifyPane').classList.add('hidden');
  document.getElementById('printerPane').classList.add('hidden');
  pane.innerHTML='<div class="front-title">PassKiosk could not sign you in.</div><div class="muted">'+esc(message)+'</div>';
  toast(message,true,7000);
}

async function identifyUser(){
  if(state.authMode!=='kiosk')return;
  const input=document.getElementById('usernameInput');clearInvalid(input);
  try{
    const res=await server('identifyAdult',input.value);
    if(!res.ok)throw new Error(res.message||'User not found.');
    state.identified=res;
    await restorePrinterChoice(true);
  }catch(err){
    markInvalid(input);
    toast(err.message,true);
  }
}
function isReceiptPrinter(printer){
  return ['RECEIPT1','RECEIPT2','CAFE_TARDY','AP_TARDY'].includes(printer.key)||/rcpt|receipt|80.?mm/i.test([printer.type,printer.outputFormat,printer.mediaProfileId].join(' '));
}
function renderFrontPrinters(){
  const box=document.getElementById('frontPrinters');
  document.getElementById('outputPrompt').textContent='Choose your output';
  const printers=state.front.printers||[];
  const column=(receipt)=>printers.filter(p=>isReceiptPrinter(p)===receipt).map(p=>`<button type="button" class="printer-choice ${outputSelection.printerKey===p.key?'selected':''}" role="checkbox" aria-checked="${outputSelection.printerKey===p.key}" data-printer-key="${attr(p.key)}" onclick="toggleOutputPrinter(this.dataset.printerKey)" ${outputSelection.busy?'disabled':''}><span class="choice-box" aria-hidden="true">${outputSelection.printerKey===p.key?'✓':''}</span><span>${esc(p.friendlyName)}</span></button>`).join('');
  box.innerHTML=`<div class="small muted">Choose up to one printer. PDF email can be used on its own or with a printer.</div><div class="output-columns"><section aria-labelledby="copierHeading"><h3 id="copierHeading">Copiers</h3>${column(false)}</section><section aria-labelledby="receiptHeading"><h3 id="receiptHeading">Receipt printers</h3>${column(true)}</section></div>${state.front.pdfEmail?.enabled?`<div class="output-email"><button type="button" class="printer-choice ${outputSelection.email?'selected':''}" role="checkbox" aria-checked="${outputSelection.email}" onclick="toggleOutputEmail()" ${outputSelection.busy?'disabled':''}><span class="choice-box" aria-hidden="true">${outputSelection.email?'✓':''}</span><span>Send PDF to my email</span></button></div>`:''}<div id="outputValidation" class="lookup-error hidden" role="alert"></div><div class="output-continue"><button type="button" class="primary" onclick="continueOutputSelection()" ${outputSelection.busy?'disabled':''}>${outputSelection.busy?'Connecting…':'Continue'}</button></div>`;
}
function toggleOutputPrinter(key){
  if(outputSelection.busy)return;
  if(!(state.front.printers||[]).some(p=>p.key===key))return;
  outputSelection.printerKey=outputSelection.printerKey===key?'':key;
  renderFrontPrinters();
}
function toggleOutputEmail(){
  if(outputSelection.busy||!state.front.pdfEmail?.enabled)return;
  outputSelection.email=!outputSelection.email;renderFrontPrinters();
}
async function continueOutputSelection(){
  if(outputSelection.busy)return;
  if(!outputSelection.printerKey&&!outputSelection.email){
    const message=document.getElementById('outputValidation');message.textContent='Choose a printer or turn on PDF email to continue.';message.classList.remove('hidden');return;
  }
  outputSelection.busy=true;renderFrontPrinters();
  try{
    if(outputSelection.printerKey)await enterPassKiosk(outputSelection.printerKey,outputSelection.email);
    else await enterEmailPassKiosk();
  }finally{outputSelection.busy=false;if(!document.getElementById('front').classList.contains('hidden'))renderFrontPrinters()}
}
async function enterPassKiosk(printerKey,email=false){
  try{
    const res=await server('startSession',state.identified.username,printerKey,state.deviceId);
    if(!state.identified.printerPreferences?.initialized || state.repairDefaultPrinter){
      await server('savePrinterPreference',res.token,'DEFAULT',printerKey);
      state.repairDefaultPrinter=false;
    }
    const bootstrap=await server('getBootstrapData',res.token);
    if(email&&(!bootstrap.pdfEmail?.enabled||!bootstrap.pdfEmail.recipient))throw new Error('PDF email could not be verified. Choose another output or try again.');
    state.token=res.token;state.currentPrinter=res.printer;state.bootstrap=bootstrap;state.session=bootstrap.session;
    state.outputMode=email?'BOTH':'PRINT';state.pdfEmail=bootstrap.pdfEmail||null;
    initializeLaneValues();document.getElementById('front').classList.add('hidden');document.getElementById('app').classList.remove('hidden');updateContext();selectLane(null);
  }catch(err){toast(err.message,true)}
}
function resetFrontDoor(){
  if(state.authMode!=='kiosk')return;
  state.identified=null;
  outputSelection.printerKey='';outputSelection.email=false;
  showKioskIdentityPrompt();
}
function initializeLaneValues(){
  const me=state.session.username,loc=state.session.defaultLocation||'';
  state.printerPreferences=state.bootstrap.printerPreferences||{defaultPrinterKey:state.currentPrinter?.key||'',workflows:{}};
  state.printerPreferenceBusy={};
  state.laneValues={PASS:{from:loc},RQST:{destination:loc,requestedByUsername:me},DET:{issuedByUsername:me,reportTo:state.bootstrap.detention.afterSchool.defaultLocation||'',pickupDestination:loc},LUNCH_DET:{issuedByUsername:me,reportTo:state.bootstrap.detention.lunch.defaultLocation||'',pickupDestination:loc},BUS:{approvedByUsername:me,location:loc}};
  for(const lane of ['PASS','RQST','DET','LUNCH_DET','BUS'])Object.assign(state.laneValues[lane],{helpUsername:me,printerKey:state.printerPreferences.workflows?.[lane]||state.printerPreferences.defaultPrinterKey});
}
function updateContext(){const a=(state.bootstrap.adults||[]).find(x=>x.username===state.session.username);document.getElementById('contextUser').textContent=a?a.displayName:state.session.displayName;const email='PDF → '+(state.pdfEmail?.recipient||'my email');document.getElementById('contextPrinter').textContent=state.currentPrinter?.key==='EMAIL_PDF'?email:(state.currentPrinter?.friendlyName||'Choose a printer')+(usePdfEmail()?' + '+email:'')}


function selectLane(lane){invalidateStudentLookup();state.detentionEpoch++;state.detentionLoading=false;const app=document.getElementById('app');if(app?.dataset)app.dataset.lane=lane||'';state.busEpoch++;closeCamera();if(state.busResetTimer){clearTimeout(state.busResetTimer);state.busResetTimer=null}if(state.busCountdownTimer){clearInterval(state.busCountdownTimer);state.busCountdownTimer=null}state.busInfo=null;state.busOverride=null;state.busBusy=false;state.lane=lane;syncLanePrinter();state.classChoices={};state.bulk=false;state.student=null;state.studentDetails=null;state.basket=[];state.detentionAvailability=null;state.requestDeliveryMode='AUTO';state.requestDeliveryPeriod='';state.requestWhen='';state.detentionDate='';document.querySelectorAll('.nav button').forEach(b=>{b.classList.toggle('active',b.dataset.lane===lane);b.setAttribute('aria-pressed',String(b.dataset.lane===lane))});const w=document.getElementById('workspace');if(!lane){w.className='pick-lane';w.innerHTML='↑ Pick a lane';return}w.className='';if(lane==='PASS')renderPass();if(lane==='RQST')renderRequest();if(lane==='DET')renderDetention(false);if(lane==='LUNCH_DET')renderDetention(true);if(lane==='BUS')renderBus();if(lane==='SETTINGS')renderSettings()}
function refreshCurrentLane(){const keep=state.lane;if(keep==='PASS')renderPass();if(keep==='RQST')renderRequest();if(keep==='DET')renderDetention(false);if(keep==='LUNCH_DET')renderDetention(true);if(keep==='BUS')renderBus()}

function studentPickerHtml({allowBulk=true}={}){return `<div class="card"><div class="student-head"><div class="section-title" style="margin:0">FIND STUDENT</div>${allowBulk?`<button id="basketToggle" class="basket-toggle ${state.bulk?'active':''}" title="Toggle bulk input" aria-pressed="${state.bulk}" onclick="toggleBulk()">🧺 Bulk</button>`:''}</div><div class="search-wrap"><input id="studentSearch" class="field student-search" placeholder="Name or Student Number" aria-label="Find student by name or student number" autocomplete="off" oninput="studentSearchChanged()" onkeydown="studentSearchKey(event)"><button class="camera-btn" title="Scan student QR code" aria-label="Scan student QR code" onclick="openCamera()">📷</button><div id="studentSuggestions" class="suggestions hidden"></div></div><div id="selectedStudentArea"></div></div>`}
function toggleBulk(){if(state.submitting||state.busBusy||state.busWritePending)return;if(state.lane==='BUS'){state.busEpoch++;clearBusResetTimer();state.busInfo=null;state.busOverride=null}invalidateStudentLookup();state.detentionEpoch++;state.detentionLoading=false;state.bulk=!state.bulk;state.student=null;state.studentDetails=null;state.basket=[];state.requestDeliveryMode='AUTO';state.requestDeliveryPeriod='';refreshCurrentLane()}
function studentSearchChanged(){const input=document.getElementById('studentSearch');if(!input)return;const q=input.value.trim();if(!q){hideSuggestions();return}if(state.bulk&&looksLikeMultiIds(q)){addManyIds(q);input.value='';hideSuggestions();return}renderSuggestions(searchStudentIndex(q).slice(0,8))}
function studentSearchKey(e){if(e.key==='Escape'){hideSuggestions();return}if(e.key!=='Enter'||!e.currentTarget.value.trim())return;const exact=searchStudentIndex(e.currentTarget.value.trim());if(exact.length!==1)return;e.preventDefault();if(state.bulk){addStudentSelection(exact[0],true);e.currentTarget.value='';hideSuggestions();return}chooseStudent(exact[0].studentId)}
function looksLikeMultiIds(text){if(!/[\n,\t ]/.test(text))return false;const bits=text.split(/[\s,\t\r\n]+/).filter(Boolean);return bits.length>1&&bits.every(x=>/^\d+$/.test(x))}
function addManyIds(text){if(state.submitting)return;const ids=text.split(/[\s,\t\r\n]+/).map(x=>x.trim()).filter(Boolean);let missing=0;ids.forEach(id=>{const s=(state.bootstrap.studentIndex||[]).find(x=>x.studentId===id);if(s)addStudentSelection(s,true);else missing++});if(missing)toast(missing+' student number'+(missing===1?' was':'s were')+' not found.',true);updateSelectedStudentArea()}
function searchStudentIndex(query){const q=normalizeSearch(query),tokens=q.split(/\s+/).filter(Boolean);return(state.bootstrap.studentIndex||[]).filter(s=>{const id=String(s.studentId||''),fn=normalizeSearch(s.firstName),ln=normalizeSearch(s.lastName),a=fn+' '+ln,b=ln+' '+fn;return tokens.every(t=>id.includes(t)||fn.includes(t)||ln.includes(t)||a.includes(t)||b.includes(t))})}
function normalizeSearch(s){return String(s||'').toLowerCase().replace(/[^\p{L}\p{N}\s'-]/gu,'').trim()}
function renderSuggestions(results){const box=document.getElementById('studentSuggestions');if(!box)return;if(!results.length){box.innerHTML='<div class="suggestion muted">No matching student</div>';box.classList.remove('hidden');return}box.innerHTML=results.map(s=>`<button type="button" class="suggestion" onclick="chooseStudent('${attr(s.studentId)}')"><span><strong>${esc(s.firstName)} ${esc(s.lastName)}</strong><br><span class="small muted">${esc(s.studentId)}</span></span><span class="pill">Grade ${esc(s.grade)}</span></button>`).join('');box.classList.remove('hidden')}
function hideSuggestions(){const b=document.getElementById('studentSuggestions');if(b)b.classList.add('hidden')}
async function chooseStudent(studentId){if(state.submitting)return;if(state.lane==='BUS'&&(state.busBusy||state.submitting||state.busWritePending))return;const s=(state.bootstrap.studentIndex||[]).find(x=>x.studentId===String(studentId));if(!s)return;const input=document.getElementById('studentSearch');if(state.lane==='BUS'&&!state.bulk){if(state.busOverride){if(state.busOverride.studentId===s.studentId&&Date.now()<=state.busOverride.expiresAt){state.student=s;state.studentDetails={};updateSelectedStudentArea();if(input)input.value='';hideSuggestions();await submitBusPass(true);return}clearBusResetTimer();state.busOverride=null}else{clearBusResetTimer()}}if(input)input.value='';hideSuggestions();await addStudentSelection(s,false)}
function invalidateStudentLookup(){state.studentEpoch++;state.studentLoading=false;state.studentLookupError=''}
function loadingHtml(message){return `<div class="lookup-status" role="status" aria-live="polite"><span class="loading-spinner" aria-hidden="true"></span><span>${esc(message)}</span></div>`}
function studentLookupMessage(){return state.studentLoading?loadingHtml('Looking up schedule…'):`<div class="lookup-error" role="alert">${esc(state.studentLookupError)} <button type="button" class="secondary" onclick="retryStudentLookup()">Retry schedule lookup</button></div>`}
function renderStudentLookup(){if(state.lane==='PASS')syncPassCurrentClass();if(state.lane==='RQST')renderRequestRouting()}
function focusLookupArea(){const id=state.lane==='PASS'?'passToArea':state.lane==='RQST'?'requestRouting':state.lane==='DET'||state.lane==='LUNCH_DET'?'detDateArea':'';const box=id&&document.getElementById(id);if(box){box.tabIndex=-1;box.focus({preventScroll:true});box.scrollIntoView({block:'nearest',behavior:'instant'})}}
async function retryStudentLookup(){if(state.student&&!state.studentLoading)await addStudentSelection(state.student,true)}
async function addStudentSelection(s,silentDuplicate){
  if(state.submitting)return;
  if(state.bulk){if(state.basket.some(x=>x.studentId===s.studentId)){if(!silentDuplicate)toast('Already in basket');return}state.basket.push(s);updateSelectedStudentArea();if(state.lane==='DET'||state.lane==='LUNCH_DET')await loadDetentionAvailability();return}
  invalidateStudentLookup();const epoch=state.studentEpoch,lane=state.lane;
  state.student=s;state.studentDetails=null;
  if(lane==='BUS'){state.studentDetails={};updateSelectedStudentArea();afterStudentSelected();return}
  // Detention needs availability, not the student's classroom schedule.
  if(lane==='DET'||lane==='LUNCH_DET'){state.studentDetails={};updateSelectedStudentArea();const task=loadDetentionAvailability();focusLookupArea();await task;return}
  state.studentLoading=true;updateSelectedStudentArea();renderStudentLookup();focusLookupArea();
  try{
    const details=await server('getStudentDetails',state.token,s.studentId);
    if(epoch!==state.studentEpoch||lane!==state.lane)return;
    if(!details.ok)throw new Error(details.message||'Student lookup failed.');
    state.studentDetails=details;state.studentLoading=false;updateSelectedStudentArea();afterStudentSelected();
  }catch(err){
    if(epoch!==state.studentEpoch||lane!==state.lane)return;
    state.studentLoading=false;state.studentLookupError=err.message||'Schedule lookup failed.';updateSelectedStudentArea();renderStudentLookup();
  }
}

function removeStudent(studentId){if(state.submitting)return;invalidateStudentLookup();if(state.lane==='BUS'){state.busEpoch++;clearBusResetTimer();state.busBusy=false}if(state.bulk)state.basket=state.basket.filter(x=>x.studentId!==studentId);else{state.student=null;state.studentDetails=null;if(state.lane==='BUS'){state.busInfo=null;state.busOverride=null;if(state.busResetTimer){clearTimeout(state.busResetTimer);state.busResetTimer=null}}}updateSelectedStudentArea();afterStudentSelected()}
function updateSelectedStudentArea(){const box=document.getElementById('selectedStudentArea');if(!box)return;if(state.bulk){if(!state.basket.length){box.innerHTML='<div class="small muted" style="margin-top:8px">Bulk mode — add students by search, pasted IDs, or repeated QR scans.</div>';return}box.innerHTML='<div class="basket-summary">'+state.basket.length+' student'+(state.basket.length===1?'':'s')+' selected</div><div class="basket-list">'+state.basket.map(s=>`<div class="basket-item"><span><strong>${esc(s.firstName)} ${esc(s.lastName)}</strong> <span class="muted small">${esc(s.studentId)}</span></span><button class="xbtn" aria-label="Remove ${attr(s.firstName)} ${attr(s.lastName)}" onclick="removeStudent('${attr(s.studentId)}')">×</button></div>`).join('')+'</div>';return}if(!state.student){box.innerHTML='';return}box.innerHTML=`<div class="student-card"><div><div class="student-name">${esc(state.student.firstName)} ${esc(state.student.lastName)}</div><div class="small muted">${esc(state.student.studentId)} · Grade ${esc(state.student.grade)}${state.studentLoading?' · Looking up schedule…':state.studentLookupError?' · Schedule unavailable':''}</div></div><button class="xbtn" aria-label="Remove selected student" onclick="removeStudent('${attr(state.student.studentId)}')">×</button></div>`}

