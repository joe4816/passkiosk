const PK_BUILD='0.3.18-visible-signin';
let staffSignInUrl='', staffSignInPending=false, staffSignInBusy=false;
const state={front:null,identified:null,authMode:null,token:null,bootstrap:null,session:null,lane:null,deviceId:null,outputMode:'PRINT',pdfEmail:null,bulk:false,student:null,studentDetails:null,studentEpoch:0,studentLoading:false,studentLookupError:'',detentionEpoch:0,detentionLoading:false,basket:[],laneValues:{},currentPrinter:null,recentJobs:[],pendingReprint:null,detentionAvailability:null,requestDeliveryMode:'AUTO',requestDeliveryPeriod:'',requestWhen:'',detentionDate:'',submitting:false,busInfo:null,busOverride:null,busResetTimer:null,busCountdownTimer:null,busBusy:false,busEpoch:0,busWritePending:false,camera:{devices:[],selectedDeviceId:'',opening:false,requestId:0,stream:null,raf:null,lastCode:'',lastAt:0,lastSeenAt:0}};
document.addEventListener('DOMContentLoaded',init);

async function init(){
  state.deviceId=getDeviceId();
  try{
    state.authMode=await PassKioskBridge.mode();
    if(state.authMode==='staff'){
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
    '<div class="muted">Google opens in a separate tab. When you return, we’ll check your access automatically.</div>'+
    (message?'<div class="lookup-error" role="alert">'+esc(message)+'</div>':'')+
    '<div class="submit-row"><a class="primary google-signin" href="'+attr(staffSignInUrl)+'" target="_blank" rel="noopener" onclick="beginStaffSignIn()">'+(staffSignInPending?'Open Google sign-in again':'Continue with Google')+'</a></div>'+
    (staffSignInPending?'<div class="submit-row"><button class="secondary" onclick="completeStaffSignIn()">I’m signed in — continue</button></div>':'')+
    '<div class="small muted app-build">App '+PK_BUILD+'</div>';
}
function beginStaffSignIn(){
  staffSignInPending=true;
  // Let the link's native click open Google before repainting its parent.
  setTimeout(()=>showStaffSignIn(),0);
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
    staffSignInPending=false;
    showPrinterSelection(false);
  }catch(err){
    const raw=err.message||'Unable to check your access.';
    const message=/backend did not respond|bridge could not load/i.test(raw)
      ? 'Google sign-in has not connected to PassKiosk. Finish signing in in the Google tab, then continue here. If you already did, browser privacy settings or the school network may be blocking the connection.' : raw;
    showStaffSignIn(message);
  }finally{staffSignInBusy=false}
}
window.addEventListener?.('focus',()=>{if(staffSignInPending&&!staffSignInBusy)completeStaffSignIn()});
function getDeviceId(){const k='PassKioskDeviceId';let id=localStorage.getItem(k);if(!id){id=(window.crypto&&crypto.randomUUID)?crypto.randomUUID():'PKD-'+Date.now()+'-'+Math.random().toString(36).slice(2);localStorage.setItem(k,id)}return id}
function server(fn,...args){return PassKioskBridge.call(fn,...args)}

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
    showPrinterSelection(true);
  }catch(err){
    markInvalid(input);
    toast(err.message,true);
  }
}
function renderFrontPrinters(){const box=document.getElementById('frontPrinters'),remembered=localStorage.getItem('PassKioskLastPrinter:'+state.identified.username)||'';box.innerHTML='';if(state.front.pdfEmail?.enabled){document.getElementById('outputPrompt').textContent='How do you want your documents?';const emailButton=document.createElement('button');emailButton.className='printer-btn remembered';emailButton.textContent='Email PDFs to my CCSD email';emailButton.onclick=()=>enterEmailPassKiosk();box.appendChild(emailButton)}(state.front.printers||[]).forEach(p=>{const b=document.createElement('button');b.className='printer-btn'+(p.key===remembered?' remembered':'');b.textContent=p.friendlyName;b.onclick=()=>enterPassKiosk(p.key);box.appendChild(b)})}
async function enterPassKiosk(printerKey){try{const res=await server('startSession',state.identified.username,printerKey,state.deviceId);state.token=res.token;state.currentPrinter=res.printer;localStorage.setItem('PassKioskLastPrinter:'+state.identified.username,printerKey);state.bootstrap=await server('getBootstrapData',state.token);state.session=state.bootstrap.session;state.outputMode='PRINT';state.pdfEmail=state.bootstrap.pdfEmail||null;initializeLaneValues();document.getElementById('front').classList.add('hidden');document.getElementById('app').classList.remove('hidden');updateContext();selectLane(null)}catch(err){toast(err.message,true)}}
function resetFrontDoor(){
  if(state.authMode!=='kiosk')return;
  state.identified=null;
  showKioskIdentityPrompt();
}
function initializeLaneValues(){const me=state.session.username,loc=state.session.defaultLocation||'';state.laneValues={PASS:{from:loc},RQST:{destination:loc,requestedByUsername:me},DET:{issuedByUsername:me,reportTo:state.bootstrap.detention.afterSchool.defaultLocation||''},LUNCH_DET:{issuedByUsername:me,reportTo:state.bootstrap.detention.lunch.defaultLocation||''},BUS:{approvedByUsername:me}}}
function updateContext(){const a=state.bootstrap.adults.find(x=>x.username===state.session.username);document.getElementById('contextUser').textContent=a?a.displayName:state.session.displayName;document.getElementById('contextPrinter').textContent=state.outputMode==='EMAIL'?'PDF → '+(state.pdfEmail?.recipient||'my email'):(state.currentPrinter?state.currentPrinter.friendlyName:'')}

function selectLane(lane){invalidateStudentLookup();state.detentionEpoch++;state.detentionLoading=false;const app=document.getElementById('app');if(app?.dataset)app.dataset.lane=lane||'';state.busEpoch++;closeCamera();if(state.busResetTimer){clearTimeout(state.busResetTimer);state.busResetTimer=null}if(state.busCountdownTimer){clearInterval(state.busCountdownTimer);state.busCountdownTimer=null}state.busInfo=null;state.busOverride=null;state.busBusy=false;state.lane=lane;state.classChoices={};state.bulk=false;state.student=null;state.studentDetails=null;state.basket=[];state.detentionAvailability=null;state.requestDeliveryMode='AUTO';state.requestDeliveryPeriod='';state.requestWhen='';state.detentionDate='';document.querySelectorAll('.nav button').forEach(b=>{b.classList.toggle('active',b.dataset.lane===lane);b.setAttribute('aria-pressed',String(b.dataset.lane===lane))});const w=document.getElementById('workspace');if(!lane){w.className='pick-lane';w.innerHTML='↑ Pick a lane';return}w.className='';if(lane==='PASS')renderPass();if(lane==='RQST')renderRequest();if(lane==='DET')renderDetention(false);if(lane==='LUNCH_DET')renderDetention(true);if(lane==='BUS')renderBus();if(lane==='SETTINGS')renderSettings()}
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

