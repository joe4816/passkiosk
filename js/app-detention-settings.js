function renderDetention(lunch){const lane=lunch?'LUNCH_DET':'DET',v=state.laneValues[lane],title=lunch?'Lunch Detention':'After-School Detention';document.getElementById('workspace').innerHTML=`${studentPickerHtml({allowBulk:true})}<div class="card"><h2>${title}</h2><div class="form-row"><label>Reason <span class="required-star">*</span></label><select id="detReason" class="field" onchange="toggleDetOther()"><option value=""></option>${detentionReasonOptions()}</select></div><div id="detOtherRow" class="form-row hidden"><label>Other <span class="required-star">*</span></label><input id="detOther" class="field"></div><div class="grid2"><div class="form-row"><label>Issued By</label><select id="detIssuedBy" class="field" onchange="state.laneValues['${lane}'].issuedByUsername=this.value">${adultOptions(v.issuedByUsername)}</select></div><div class="form-row"><label>Report To <span class="required-star">*</span></label><input id="detReportTo" class="field" value="${attr(v.reportTo)}" oninput="state.laneValues['${lane}'].reportTo=this.value"></div></div><div id="detDateArea" class="form-row"><div class="small muted">Loading detention availability…</div></div><div class="submit-row"><button class="primary" onclick="submitDetention(${lunch?'true':'false'})">Send</button></div></div>`;updateSelectedStudentArea();loadDetentionAvailability()}
function detentionReasonOptions(){let last='',html='';(state.bootstrap.detentionReasons||[]).forEach(x=>{if(last&&x.group!==last)html+='<option disabled>──────────</option>';html+=`<option>${esc(x.reason)}</option>`;last=x.group});return html}
function toggleDetOther(){const v=document.getElementById('detReason').value;document.getElementById('detOtherRow').classList.toggle('hidden',v!=='Other')}
async function loadDetentionAvailability(){const box=document.getElementById('detDateArea');if(!box||!(state.lane==='DET'||state.lane==='LUNCH_DET'))return;try{const type=state.lane==='LUNCH_DET'?'LUNCH':'AFTER_SCHOOL',studentId=!state.bulk&&state.student?state.student.studentId:'';state.detentionAvailability=await server('getDetentionAvailability',state.token,type,studentId);renderDetentionDates()}catch(err){box.innerHTML=`<div class="bus-pending">${esc(err.message)}</div>`}}
function renderDetentionDates(){const box=document.getElementById('detDateArea'),a=state.detentionAvailability;if(!box||!a)return;if(state.bulk){state.detentionDate='';box.innerHTML=`<label>Starting suggested date</label><div class="route-box"><div class="route-main">${esc(a.suggestedDisplay||'No available date')}</div><div class="small muted">Bulk scheduling processes students one-by-one and may move later students forward.</div></div>`;return}const dates=a.dates||[];const currentStillSelectable=dates.some(d=>d.dateKey===state.detentionDate&&d.selectable);if(!state.detentionDate||!currentStillSelectable)state.detentionDate=a.suggestedDate||'';box.innerHTML=`<label>Detention Date <span class="required-star">*</span></label>${dates.map(d=>`<div class="date-option ${d.dateKey===state.detentionDate?'selected':''} ${!d.selectable?'full':''}" ${d.selectable?`onclick="selectDetentionDate('${d.dateKey}')"`:''}><span><strong>${esc(d.display)}</strong><br><span class="small muted">${d.count} assigned</span></span><span class="pill ${d.full?'full':''}">${d.full?'FULL':d.duplicate?'ALREADY ASSIGNED':'AVAILABLE'}</span></div>`).join('')}`}
function selectDetentionDate(key){state.detentionDate=key;renderDetentionDates()}
async function submitDetention(lunch){clearAllInvalid();if(!selectedIds().length)return toast('Choose a student.',true);const reason=document.getElementById('detReason'),other=document.getElementById('detOther'),report=document.getElementById('detReportTo');if(!reason.value)return invalidStop(reason,'Reason is required.');if(reason.value==='Other'&&!other.value.trim())return invalidStop(other,'Enter the Other reason.');if(!report.value.trim())return invalidStop(report,'Report To is required.');if(!state.bulk&&!state.detentionDate)return toast('Choose a detention date.',true);await submitLane({workflow:lunch?'LUNCH_DET':'DET',bulk:state.bulk,studentIds:selectedIds(),data:{reason:reason.value,otherReason:other.value.trim(),issuedByUsername:document.getElementById('detIssuedBy').value,reportTo:report.value.trim(),detentionDate:state.bulk?'':state.detentionDate}})}

function activityBusEnabled(){return Boolean(window.PASSKIOSK_CONFIG&&window.PASSKIOSK_CONFIG.features&&window.PASSKIOSK_CONFIG.features.activityBusData)}

function busContext(){
  return {epoch:state.busEpoch,token:state.token,bulk:state.bulk,
    studentId:state.student?state.student.studentId:''};
}
function busContextIsCurrent(context){
  return state.lane==='BUS'&&state.busEpoch===context.epoch&&state.token===context.token&&
    state.bulk===context.bulk&&(state.student?state.student.studentId:'')===context.studentId;
}

function renderBus(){
  const v=state.laneValues.BUS;
  const ready=activityBusEnabled();
  document.getElementById('workspace').innerHTML=`${studentPickerHtml({allowBulk:true})}<div class="card"><h2>Activity Bus</h2><div class="form-row"><label>Approved By</label><select id="busApprovedBy" class="field" onchange="state.laneValues.BUS.approvedByUsername=this.value">${adultOptions(v.approvedByUsername)}</select></div><div id="busStudentStatus" class="bus-pending">${ready?(state.bulk?'Add students to the basket, then Send. Each student’s Bus From assignments will be checked separately.':'Scan or choose a student. Bus From transportation assignments will be checked automatically.'):'Activity Bus data integration is staged but not enabled against the production backend yet.'}</div>${state.bulk?`<div class="submit-row"><button class="primary" onclick="submitBusBulk()" ${ready?'':'disabled'}>Send</button></div>`:''}</div>`;
  updateSelectedStudentArea();
}

async function renderBusStudentStatus(){
  const box=document.getElementById('busStudentStatus');
  if(!box)return;
  if(!activityBusEnabled()){box.className='bus-pending';box.textContent='Activity Bus data integration is staged but not enabled against the production backend yet.';return}
  if(state.bulk)return;
  if(!state.student){box.className='bus-pending';box.textContent='Scan or choose a student.';return}
  if(state.busBusy||state.busWritePending)return;
  const context=busContext();

  state.busBusy=true;
  box.className='bus-status bus-checking';
  box.innerHTML=`<strong>${esc(state.student.firstName)} ${esc(state.student.lastName)}</strong><br><span class="small">Checking Bus_Info…</span>`;

  let info;
  try{
    info=await server('getBusInfo',context.token,context.studentId);
    if(!busContextIsCurrent(context))return;
    if(!info||info.ok!==true||info.studentId!==context.studentId||!Array.isArray(info.assignments)){
      throw new Error('Activity Bus lookup response could not be verified.');
    }
    state.busInfo=info;
  }catch(err){
    if(!busContextIsCurrent(context))return;
    box.className='bus-status bus-error';
    box.innerHTML=`<strong>BUS LOOKUP FAILED</strong><br>${esc(err.message||'Unable to read Bus_Info.')}`;
    state.busBusy=false;
    return;
  }
  state.busBusy=false;

  if(!info||!Array.isArray(info.assignments)||!info.assignments.length){
    playBusAlertTone();
    box.className='bus-status bus-error';
    box.innerHTML=`<strong>NO BUS INFO ON FILE</strong><br><span class="small">No usable Bus From assignment was found for ${esc(state.student.firstName)} ${esc(state.student.lastName)}.</span><div class="bus-countdown">Returning to scan in <strong id="busCountdown">3</strong>…</div>`;
    startBusCountdown(3,resetBusLaneStudent,'NO BUS INFO ON FILE');
    return;
  }

  if(info.alreadyScannedToday){
    playBusAlertTone();
    armBusDuplicateOverride(info);
    box.className='bus-status bus-warning';
    box.innerHTML=`<strong>ALREADY SCANNED TODAY</strong><div class="small bus-instruction">Scan or select this same student again within <strong id="busCountdown">5</strong> seconds to record a duplicate.</div>${busAssignmentsHtml(info.assignments)}${info.priorTransactionId?`<div class="small muted">Earlier transaction: ${esc(info.priorTransactionId)}</div>`:''}`;
    return;
  }

  await submitBusPass(false);
}

async function submitBusPass(allowDuplicate){
  if(!activityBusEnabled()||state.bulk||!state.student||state.busBusy||state.busWritePending)return;
  const box=document.getElementById('busStudentStatus');
  if(!box)return;

  const context=busContext();
  const approved=document.getElementById('busApprovedBy');
  const approvedByUsername=approved?approved.value:state.laneValues.BUS.approvedByUsername;
  state.laneValues.BUS.approvedByUsername=approvedByUsername;

  clearBusResetTimer();
  state.busBusy=true;
  state.busWritePending=true;
  box.className='bus-status bus-checking';
  box.innerHTML=`<strong>${allowDuplicate?'Recording duplicate…':'Recording Activity Bus pass…'}</strong>`;

  try{
    const res=await server('submitBusWorkflow',context.token,{
      deviceId:state.deviceId,
      studentId:context.studentId,
      approvedByUsername,
      allowDuplicate:Boolean(allowDuplicate)
    });

    if(!busContextIsCurrent(context))return;
    if(!res||res.ok!==true){
      if(res&&res.code==='ALREADY_SCANNED_TODAY'){
        const info={assignments:res.assignments||state.busInfo?.assignments||[],priorTransactionId:res.priorTransactionId||''};
        playBusAlertTone();
        armBusDuplicateOverride(info);
        box.className='bus-status bus-warning';
        box.innerHTML=`<strong>ALREADY SCANNED TODAY</strong><div class="small bus-instruction">Scan or select this same student again within <strong id="busCountdown">5</strong> seconds to record a duplicate.</div>${busAssignmentsHtml(info.assignments)}`;
        return;
      }
      if(res&&res.code==='NO_BUS_INFO'){
        playBusAlertTone();
        box.className='bus-status bus-error';
        box.innerHTML='<strong>NO BUS INFO ON FILE</strong><br><span class="small">No usable Bus From assignment was found.</span><div class="bus-countdown">Returning to scan in <strong id="busCountdown">3</strong>…</div>';
        startBusCountdown(3,resetBusLaneStudent,'NO BUS INFO ON FILE');
        return;
      }
      throw new Error(res&&res.message?res.message:'Activity Bus transaction was not recorded.');
    }

    if(res.studentId!==context.studentId||!res.transactionId||!Array.isArray(res.assignments)){
      throw new Error('Activity Bus submission response could not be verified.');
    }
    state.busInfo=res;
    state.busOverride=null;
    box.className='bus-status bus-success';
    box.innerHTML=`<strong>${res.duplicate?'DUPLICATE RECORDED':'ACTIVITY BUS PASS RECORDED'}</strong><div class="small">${esc(res.studentName||'Student')} · ${esc(res.transactionId||'')}</div>${busAssignmentsHtml(res.assignments||[])}`;
    scheduleBusReset(2500);
  }catch(err){
    if(!busContextIsCurrent(context))return;
    state.busOverride=null;
    box.className='bus-status bus-error';
    box.innerHTML=`<strong>RECORDING NOT CONFIRMED</strong><br>${esc(err.message||'Activity Bus submission was interrupted.')}<div class="small">Check Transactions before retrying. The server may have recorded this authorization.</div>`;
  }finally{
    state.busWritePending=false;
    if(busContextIsCurrent(context))state.busBusy=false;
  }
}

async function submitBusBulk(){
  if(!activityBusEnabled()||!state.bulk||state.submitting||state.busBusy||state.busWritePending)return;
  const ids=selectedIds();
  if(!ids.length)return toast('Choose a student.',true);
  const context=busContext();
  const approved=document.getElementById('busApprovedBy');
  const approvedByUsername=approved?approved.value:state.laneValues.BUS.approvedByUsername;
  state.laneValues.BUS.approvedByUsername=approvedByUsername;
  clearBusResetTimer();
  state.busOverride=null;
  state.submitting=true;
  state.busWritePending=true;
  const button=document.querySelector('#workspace .submit-row .primary');
  if(button){button.disabled=true;button.textContent='Sending…'}
  try{
    const res=await server('submitBusWorkflow',context.token,{deviceId:state.deviceId,
      bulk:true,studentIds:ids,approvedByUsername});
    if(!res||res.ok!==true||res.bulk!==true||!res.batchRoot||!Array.isArray(res.created)||!Array.isArray(res.errors)||
        res.createdCount!==res.created.length||res.errorCount!==res.errors.length||
        res.createdCount+res.errorCount!==new Set(ids).size||
        new Set([...res.created,...res.errors].map(r=>r.studentId)).size!==new Set(ids).size||
        [...res.created,...res.errors].some(r=>!ids.includes(r.studentId))){
      throw new Error('Activity Bus bulk response could not be verified. Check Transactions before trying again.');
    }
    if(busContextIsCurrent(context)){
      resetAfterSend();
      const box=document.getElementById('busStudentStatus');
      box.className='bus-status '+(res.errorCount?'bus-warning':'bus-success');
      box.innerHTML=`<strong>${res.createdCount} RECORDED${res.errorCount?` · ${res.errorCount} REQUIRE ATTENTION`:''}</strong><div class="small">Batch: ${esc(res.batchRoot)}</div>${res.errors.length?'<div class="bus-assignment-list">'+res.errors.map(e=>`<div class="bus-assignment"><strong>${esc(e.studentName||e.studentId)}</strong><div class="small">${esc(e.studentId)} · ${esc(e.message)}</div></div>`).join('')+'</div>':''}`;
    }
    if(res.errorCount)playBusAlertTone();
    toast(`${res.createdCount} recorded${res.errorCount?`; ${res.errorCount} require attention.`:'.'}`,Boolean(res.errorCount));
  }catch(err){
    toast((err.message||'Activity Bus bulk submission was interrupted.')+' Recording is not confirmed; check Transactions before retrying.',true,7000);
  }finally{
    state.submitting=false;
    state.busWritePending=false;
    if(button&&button.isConnected){button.disabled=false;button.textContent='Send'}
  }
}

function armBusDuplicateOverride(info){
  clearBusResetTimer();
  state.busOverride={
    studentId:state.student?state.student.studentId:'',
    priorTransactionId:String(info&&info.priorTransactionId||''),
    expiresAt:Date.now()+5000
  };
  startBusCountdown(5,()=>{
    state.busOverride=null;
    resetBusLaneStudent();
  },'ALREADY SCANNED TODAY — rescan this student for DUPLICATE');
}

function busAssignmentsHtml(assignments){
  const rows=Array.isArray(assignments)?assignments:[];
  if(!rows.length)return '';
  return `<div class="bus-assignment-list">${rows.map((a,i)=>`<div class="bus-assignment"><div class="bus-assignment-head">${rows.length>1?`Assignment ${i+1} · `:''}${esc(a.route||'Route not listed')}</div><div>${esc(a.run||'')}</div><div class="small">Drop-off: ${esc(a.dropoffAddress||'')}</div><div class="small">${esc(a.dropoffTime||'')}${a.days?` · ${esc(a.days)}`:''}</div></div>`).join('')}</div>`;
}

function scheduleBusReset(ms){
  clearBusResetTimer();
  const context=busContext();
  state.busResetTimer=setTimeout(()=>{
    if(busContextIsCurrent(context))resetBusLaneStudent();
  },ms);
}

function clearBusResetTimer(){
  if(state.busResetTimer){clearTimeout(state.busResetTimer);state.busResetTimer=null}
  if(state.busCountdownTimer){clearInterval(state.busCountdownTimer);state.busCountdownTimer=null}
}

function startBusCountdown(seconds,onExpire,cameraMessage){
  clearBusResetTimer();
  const context=busContext();
  const end=Date.now()+seconds*1000;
  const update=()=>{
    if(!busContextIsCurrent(context))return;
    const remaining=Math.max(0,Math.ceil((end-Date.now())/1000));
    const el=document.getElementById('busCountdown');
    if(el)el.textContent=String(remaining);
    if(state.camera&&state.camera.stream&&state.lane==='BUS'){
      const status=document.getElementById('cameraStatus');
      if(status)status.textContent=(cameraMessage||'Activity Bus')+' · '+remaining+'s';
    }
  };
  update();
  state.busCountdownTimer=setInterval(update,200);
  state.busResetTimer=setTimeout(()=>{
    if(!busContextIsCurrent(context))return;
    clearBusResetTimer();
    if(typeof onExpire==='function')onExpire();
  },seconds*1000+25);
}

function resetBusLaneStudent(){
  state.busEpoch++;
  clearBusResetTimer();
  state.student=null;
  state.studentDetails=null;
  state.busInfo=null;
  state.busOverride=null;
  state.busBusy=false;
  if(state.lane==='BUS')renderBus();
  if(state.camera&&state.camera.stream){
    const status=document.getElementById('cameraStatus');
    if(status)status.textContent='Point the camera at the next student QR code.';
  }
}

async function handleBusCameraStudent(student){
  if(!activityBusEnabled()){
    const status=document.getElementById('cameraStatus');
    if(status)status.textContent='Activity Bus backend activation is still pending.';
    return;
  }

  if(state.busBusy||state.busWritePending||state.submitting){
    const status=document.getElementById('cameraStatus');
    if(status)status.textContent='Still processing the previous Activity Bus scan…';
    return;
  }

  if(state.busOverride){
    if(state.busOverride.studentId===student.studentId&&Date.now()<=state.busOverride.expiresAt){
      state.student=student;
      state.studentDetails={};
      updateSelectedStudentArea();
      await submitBusPass(true);
      return;
    }
    clearBusResetTimer();
    state.busOverride=null;
  }else{
    clearBusResetTimer();
  }

  state.student=student;
  state.studentDetails={};
  updateSelectedStudentArea();
  const context=busContext();
  await renderBusStudentStatus();
  if(!busContextIsCurrent(context))return;

  const status=document.getElementById('cameraStatus');
  if(!status)return;

  if(state.busOverride&&state.busOverride.studentId===student.studentId){
    const remaining=Math.max(0,Math.ceil((state.busOverride.expiresAt-Date.now())/1000));
    status.textContent='ALREADY SCANNED TODAY — remove QR, then rescan within '+remaining+'s for DUPLICATE.';
  }else if(state.student&&state.busInfo&&Array.isArray(state.busInfo.assignments)&&state.busInfo.assignments.length){
    status.textContent='Recorded '+student.firstName+' '+student.lastName+'. Remove QR, then scan the next student.';
  }
}

function playBusAlertTone(){
  try{
    const AudioCtx=window.AudioContext||window.webkitAudioContext;
    if(!AudioCtx)return;
    const ctx=new AudioCtx();
    [0,0.2].forEach((delay,index)=>{
      const osc=ctx.createOscillator();
      const gain=ctx.createGain();
      osc.type='square';
      osc.frequency.value=index===0?220:180;
      gain.gain.setValueAtTime(0.08,ctx.currentTime+delay);
      gain.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+delay+0.14);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime+delay);
      osc.stop(ctx.currentTime+delay+0.15);
    });
    setTimeout(()=>ctx.close().catch(()=>{}),500);
  }catch(_){ }
}

async function renderSettings(){document.getElementById('workspace').innerHTML=`<div class="card"><h2>Settings</h2><div class="section-title">PRINTER</div><div id="settingsPrinters" class="settings-printers"></div></div><div class="card"><h2>Recently Sent — Last 5 Minutes</h2><div id="recentJobs"><div class="small muted">Loading…</div></div></div><div class="card"><button class="danger-btn" onclick="logout()">Sign Out</button></div>`;renderSettingsPrinters();await loadRecentJobs()}
function renderSettingsPrinters(){const box=document.getElementById('settingsPrinters');if(!box)return;box.innerHTML=(state.bootstrap.printers||[]).map(p=>`<button class="settings-printer ${p.key===state.currentPrinter.key?'current':''}" onclick="setPrinter('${p.key}')">${esc(p.friendlyName)}</button>`).join('')}
async function setPrinter(key){try{const res=await server('changePrinter',state.token,key);state.currentPrinter=res.printer;localStorage.setItem('PassKioskLastPrinter:'+state.session.username,key);updateContext();renderSettingsPrinters();toast('Printer changed to '+res.printer.friendlyName)}catch(err){toast(err.message,true)}}
async function loadRecentJobs(){const box=document.getElementById('recentJobs');if(!box)return;try{state.recentJobs=await server('getRecentPrintJobs',state.token,state.deviceId);if(!state.recentJobs.length){box.innerHTML='<div class="small muted">Nothing sent from this device in the last five minutes.</div>';return}box.innerHTML=state.recentJobs.map(j=>`<div class="job" onclick="openReprint('${attr(j.printJobId)}')"><span class="small">${formatTime(j.attemptedAt)}</span><span><strong>${esc(j.studentName||j.transactionId)}</strong><br><span class="small muted">${esc(workflowLabel(j.workflow))} · ${esc(j.printerName)}</span></span><span class="status-${esc(j.status)}">${statusIcon(j.status)}</span></div>`).join('')}catch(err){box.innerHTML=`<div class="small" style="color:var(--danger)">${esc(err.message)}</div>`}}
function openReprint(id){const job=state.recentJobs.find(x=>x.printJobId===id);if(!job)return;state.pendingReprint=job;document.getElementById('confirmText').innerHTML=`About to resend <strong>${esc(job.studentName||job.transactionId)}</strong> to:<br><br><strong>${esc(state.currentPrinter.friendlyName)}</strong>`;document.getElementById('confirmModal').classList.remove('hidden')}
function closeConfirm(){state.pendingReprint=null;document.getElementById('confirmModal').classList.add('hidden')}
async function confirmReprint(){const job=state.pendingReprint;if(!job)return;try{await server('reprintJob',state.token,state.deviceId,job.printJobId);closeConfirm();toast('Reprint queued for '+state.currentPrinter.friendlyName);await loadRecentJobs()}catch(err){toast(err.message,true)}}
async function logout(){try{await server('signOut',state.token)}catch(_){ }location.reload()}

async function submitLane(request){
  if(state.submitting)return toast('A submission is still in progress. Please wait.',true);
  const context={epoch:state.busEpoch,lane:state.lane,token:state.token};
  state.submitting=true;
  const submitButtons=[...document.querySelectorAll('#workspace .submit-row .primary')];
  submitButtons.forEach(b=>{b.disabled=true;b.dataset.originalText=b.textContent;b.textContent='Sending…'});
  try{
    request.deviceId=state.deviceId;
    const res=await server('submitWorkflow',context.token,request);
    if(!res||res.ok!==true||!Array.isArray(res.created)||!Array.isArray(res.errors)||
        res.createdCount!==res.created.length||res.errorCount!==res.errors.length){
      throw new Error('Submission response could not be verified.');
    }
    if(res.errorCount)toast(`${res.createdCount} created; ${res.errorCount} require attention.`,true);
    else toast(`${res.createdCount} sent.`);
    if(state.busEpoch===context.epoch&&state.lane===context.lane&&state.token===context.token)resetAfterSend();
  }catch(err){
    toast((err.message||'Submission was interrupted.')+' Recording is not confirmed; check Transactions before retrying.',true,7000);
  }finally{
    state.submitting=false;
    submitButtons.forEach(b=>{
      if(!b.isConnected)return;
      b.disabled=false;
      b.textContent=b.dataset.originalText||'Send';
      delete b.dataset.originalText;
    });
  }
}
function resetAfterSend(){const lane=state.lane,wasBulk=state.bulk;state.student=null;state.studentDetails=null;state.basket=[];state.detentionAvailability=null;state.requestDeliveryMode='AUTO';state.requestDeliveryPeriod='';state.requestWhen='';state.detentionDate='';state.bulk=wasBulk;if(lane==='PASS')renderPass();if(lane==='RQST')renderRequest();if(lane==='DET')renderDetention(false);if(lane==='LUNCH_DET')renderDetention(true);if(lane==='BUS')renderBus()}
